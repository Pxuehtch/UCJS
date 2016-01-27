// ==UserScript==
// @name PrettyPrint.uc.js
// @description Prettify a code text (JS/CSS) in the Scratchpad.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage The prettify menuitem is appended in the context menu of a plain text
// page of JS/CSS.
// @note The menuitem appears with the native 'View Page Source' menuitem.


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  ContentTask,
  Listeners: {
    $eventOnce
  },
  DOMUtils: {
    $E,
    $ID
  },
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

const {
  ContentArea: {
    contextMenu: contentAreaContextMenu
  }
} = window.ucjsUI;

/**
 * Text type constants.
 *
 * @note Used to set a prettifier method and the syntax highlight mode for
 * the Scratchpad editor.
 */
const kTextType = (function() {
  // @see resource://devtools/client/sourceeditor/editor.js
  const {modes} = Modules.require('devtools/client/sourceeditor/editor');

  return {
    js:  modes.js,
    css: modes.css
  };
})();

/**
 * Optional settings for the CodeMirror editor.
 *
 * Initial settings:
 * @see resource://devtools/client/sourceeditor/editor.js::Editor
 * @see chrome://devtools/content/scratchpad/scratchpad.js::Scratchpad::onLoad
 *
 * Available options in the built-in version:
 * @see chrome://devtools/content/sourceeditor/codemirror/codemirror.js::OPTION DEFAULTS
 *
 * Available options in the recent version:
 * @see http://codemirror.net/doc/manual.html#config
 */
const kEditorOptions = {
  lineWrapping: true
};

/**
 * Menuitem for editor options.
 *
 * @key An available option name in |kEditorOptions|.
 * @value {string} The menuitem's ID.
 *
 * @note Adjusts the check state of a menuitem corresponding to an option.
 * @see |Scratchpad::open|
 */
const kEditorOptionsMenuitemID = {
  lineNumbers: 'sp-menu-line-numbers',
  lineWrapping: 'sp-menu-word-wrap',
  showTrailingSpace: 'sp-menu-highlight-trailing-space'
};

/**
 * Optional settings for prettifier.
 *
 * @see |Prettifier::kOptionList|
 */
const kPrettifierOptions = {
  extraLine: true
};

/**
 * Menu handler.
 */
const Menu = (function() {
  const kUI = {
    // The native 'View Page Source' menuitem.
    viewSource: {
      id: 'context-viewsource'
    },

    // Our menuitem.
    prettifyPage: {
      id: 'ucjs_PrettyPrint_prettifyPage_menuitem',
      label: '表示コードを整形',
      accesskey: 'P'
    }
  };

  function init() {
    contentAreaContextMenu.register({
      events: [
        ['popupshowing', onPopupShowing],
        ['popuphiding', onPopupHiding],
        ['command', onCommand]
      ],

      onCreate: createMenu
    });
  }

  function createMenu(aContextMenu) {
    aContextMenu.insertBefore($E('menuitem', {
      id: kUI.prettifyPage.id,
      label: kUI.prettifyPage.label,
      accesskey: kUI.prettifyPage.accesskey
    }), $ID(kUI.viewSource.id));
  }

  function onPopupShowing(aEvent) {
    let contextMenu = aEvent.currentTarget;

    if (aEvent.target === contextMenu) {
      let viewSource = $ID(kUI.viewSource.id);
      let prettifyPage = $ID(kUI.prettifyPage.id);

      // The showing condition of the native view-source menuitem is suitable
      // for our prettify-page menuitem.
      // @see chrome://browser/content/nsContextMenu.js::initViewItems
      if (viewSource.hidden) {
        showItem(prettifyPage, false);

        return;
      }

      TextDocument.test().
      then((shouldShow) => {
        showItem(prettifyPage, shouldShow);
      }).
      catch(Cu.reportError);
    }
  }

  function onPopupHiding(aEvent) {
    let contextMenu = aEvent.currentTarget;

    if (aEvent.target === contextMenu) {
      TextDocument.clear();
    }
  }

  function onCommand(aEvent) {
    if (aEvent.target.id === kUI.prettifyPage.id) {
      let state = {
        filename: gBrowser.currentURI.spec,
        type: TextDocument.textType,
        text: TextDocument.textContent,
        editorOptions: kEditorOptions,
        prettifierOptions: kPrettifierOptions
      };

      Scratchpad.prettify(state);
    }
  }

  function showItem(item, shouldShow) {
    let shouldHide = !shouldShow;

    if (item.hidden !== shouldHide) {
      item.hidden = shouldHide;
    }
  }

  /**
   * Export
   */
  return {
    init
  };
})();

/**
 * Scratchpad handler.
 */
const Scratchpad = (function() {
  /**
   * Show a prettified text in the Scratchpad.
   *
   * @param {hash} aState
   *   filename {string}
   *   type {kTextType}
   *   text {string}
   *   editorOptions {kEditorOptions} [optional]
   *   prettifierOptions {kPrettifierOptions} [optional]
   *
   * TODO: Do better check of parameters.
   */
  function prettify(aState = {}) {
    let {
      filename,
      type,
      text,
      editorOptions,
      prettifierOptions
    } = aState;

    if (!type) {
      prompt('Error: Unsupported text type.');

      return;
    }

    if (!text) {
      prompt('Error: No content.');

      return;
    }

    if (text.length > 100000) {
      let warning =
        'It may take longer time for a large text.\n' +
        'Do you want to continue?';

      if (!prompt(warning, {doConfirm: true})) {
        return;
      }
    }

    let state = {
      filename,
      type,
      text: Prettifier.execute(type, text, prettifierOptions),
      options: editorOptions
    };

    if (!open(state)) {
      prompt('Error: Cannot open Scratchpad.');

      return;
    }
  }

  /**
   * Open the Scratchpad window with an initial state.
   *
   * @param {hash} aState
   *   filename {string}
   *   type {kTextType}
   *   text {string}
   *   options {kEditorOptions}
   * @return {DOMWindow}
   *   The new window object that holds Scratchpad.
   */
  function open(aState) {
    // @see resource://devtools/client/scratchpad/scratchpad-manager.jsm
    const {ScratchpadManager} =
      Modules.require('devtools/client/scratchpad/scratchpad-manager.jsm');

    let scratchpadWindow = ScratchpadManager.openScratchpad();

    if (!scratchpadWindow) {
      return null;
    }

    $eventOnce(scratchpadWindow, 'load', () => {
      scratchpadWindow.Scratchpad.addObserver({
        onReady(aScratchpad) {
          aScratchpad.removeObserver(this);

          aScratchpad.setFilename(aState.filename);
          aScratchpad.setText(aState.text);
          aScratchpad.editor.setMode(aState.type);

          for (let key in aState.options) {
            let value = aState.options[key];

            aScratchpad.editor.setOption(key, value);

            if (kEditorOptionsMenuitemID[key]) {
              let menuitem = scratchpadWindow.document.
                getElementById(kEditorOptionsMenuitemID[key]);

              // Adjust the check state of the menuitem.
              menuitem.setAttribute('checked', value);
            }
          }
        }
      });
    });

    return scratchpadWindow;
  }

  /**
   * Export
   */
  return {
    prettify
  };
})();

/**
 * Prettifier handler.
 */
const Prettifier = (function() {
  /**
   * Optional value setting.
   */
  const kOptionList = {
    /**
     * Indentation size.
     */
    indentSize: {
      type: 'number',
      defaultValue: 2,
      validate(aValue) {
        return (aValue <= 0) ? this.defaultValue : aValue;
      }
    },

    /**
     * Indentation character [one character].
     */
    indentChar: {
      type: 'string',
      defaultValue: ' ',
      validate(aValue) {
        return (aValue === '') ? this.defaultValue : aValue.charAt(0);
      }
    },

    /**
     * Add an extra line after a block end.
     *
     * @see |addExtraLine()|
     */
    extraLine: {
      type: 'boolean',
      defaultValue: false
    }
  };

  /**
   * Fix up options.
   *
   * @param aOptions {hash}
   *   @see |kOptionList|
   * @return {hash}
   */
  function fixupOptions(aOptions = {}) {
    let options = {};

    for (let key in kOptionList) {
      let setting = kOptionList[key];
      let value = aOptions[key];

      if (value === undefined) {
        value = setting.defaultValue;
      }
      else {
        switch (setting.type) {
          case 'number': {
            value = parseInt(value, 10);

            if (isNaN(value)) {
              value = setting.defaultValue;
            }

            break;
          }

          case 'string': {
            value += '';

            break;
          }

          case 'boolean': {
            value = !!value;

            break;
          }
        }
      }

      if (setting.validate) {
        value = setting.validate(value);
      }

      options[key] = value;
    }

    return options;
  }

  /**
   * Prettify a code text.
   *
   * @param aTextType {kTextType}
   * @param aText {string}
   * @param aOptions {hash}
   *   @see |kOptionList|
   * @return {string}
   */
  function execute(aTextType, aText, aOptions) {
    let prettify;

    switch (aTextType) {
      case kTextType.js:
        prettify = prettifyJS;
        break;

      case kTextType.css:
        prettify = prettifyCSS;
        break;

      default:
        throw Error('unsupported text type');
    }

    aOptions = fixupOptions(aOptions);

    let result = prettify(aText, aOptions);

    if (aOptions.extraLine) {
      result = addExtraLine(result);
    }

    return result;
  }

  /**
   * Add an extra line after a block end ('}' or '},' or '};') in case of;
   * 1.the following line is not empty, and
   * 2.being not the last block end in a nesting block or in a block comment.
   *
   * @param aText {string}
   * return {string}
   */
  function addExtraLine(aText) {
    return aText.replace(/(}[,;]?\n)(?!\s*\n|\s*(?:}|\*\/))/g, '$1\n');
  }

  /**
   * JS Prettifier.
   *
   * @note Calls the built-in function.
   * @see resource://devtools/shared/jsbeautify/src/beautify-js.js
   */
  function prettifyJS(aText, aOptions) {
    let options = {
      indent_size: aOptions.indentSize,
      indent_char: aOptions.indentChar
    };

    const {js} = Modules.require('devtools/shared/jsbeautify/beautify');

    return js(aText, options);
  }

  /**
   * CSS Prettifier.
   *
   * @note Calls the built-in function.
   * @see resource://devtools/shared/jsbeautify/src/beautify-css.js
   */
  function prettifyCSS(aText, aOptions) {
    let options = {
      indent_size: aOptions.indentSize,
      indent_char: aOptions.indentChar
    };

    const {css} = Modules.require('devtools/shared/jsbeautify/beautify');

    /**
     * WORKAROUND: Fix missing 'at-rule' variables.
     * @note Fixed in the newer version [2 Oct 2014].
     * @see https://github.com/beautify-web/js-beautify/commit/184492f
     */

    // Make regexp expression for all at-rules.
    // @note Must escape '-' in '@font-face'.
    let rules = RegExp(Object.keys(css.NESTED_AT_RULE).join('|').
      replace(/-/g, '\\-'), 'g');

    // Append a space to at-rules so that the beautifier can find them.
    aText = aText.replace(rules, '$& ');

    return css(aText, options);
  }

  /**
   * Export
   */
  return {
    execute
  };
})();

/**
 * Text document handler.
 */
const TextDocument = (function() {
  let mTextType;
  let mTextContent;

  function clear() {
    mTextType = null;
    mTextContent = null;
  }

  function test() {
    return Task.spawn(function*() {
      let contentType = gBrowser.selectedBrowser.documentContentType;
      let textType = getTextType(contentType);

      if (!textType) {
        return false;
      }

      let textContent = yield ContentTask.spawn(function*() {
        let body = content.document.body;

        let pre =
          body &&
          body.childNodes.length === 1 &&
          body.firstChild.localName === 'pre' &&
          body.firstChild;

        let textLength =
          pre &&
          pre.childNodes.length === 1 &&
          pre.firstChild.nodeType === content.Node.TEXT_NODE &&
          pre.firstChild.length;

        return !!textLength ? pre.textContent : null;
      });

      if (!textContent) {
        return false;
      }

      mTextType = textType;
      mTextContent = textContent;

      return true;
    });
  }

  function getTextType(aContentType) {
    switch (aContentType) {
      case 'text/javascript':
      case 'application/javascript':
      case 'application/x-javascript':
        return kTextType.js;

      case 'text/css':
        return kTextType.css;
    }

    return null;
  }

  return {
    get textType() {
      return mTextType;
    },
    get textContent() {
      return mTextContent;
    },
    clear,
    test
  };
})();

function prompt(aMessage, aOption = {}) {
  let {
    doConfirm
  } = aOption;

  const {confirm, alert} = Services.prompt;

  let prompt = doConfirm ? confirm : alert;

  return prompt(null, 'PrettyPrint.uc.js', aMessage);
}

/**
 * Entry point.
 */
function PrettyPrint_init() {
  Menu.init();
}

PrettyPrint_init()


})(this);
