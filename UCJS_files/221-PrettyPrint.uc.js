// ==UserScript==
// @name PrettyPrint.uc.js
// @description Prettify a code text (JS/CSS) in the Scratchpad.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage Creates a menuitem in the context menu of a plain text page of
// JS/CSS.


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getModule,
  createNode: $E,
  getNodeById: $ID,
  addEvent
} = window.ucjsUtil;

// For debugging.
function log(aMsg) {
  return window.ucjsUtil.logMessage('PrettyPrint.uc.js', aMsg);
}

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
  // @see resource://app/modules/devtools/sourceeditor/editor.js
  const {modes} = getModule('devtools/sourceeditor/editor');

  return {
    js:  modes.js,
    css: modes.css
  };
})();

/**
 * Optional settings for the CodeMirror editor.
 *
 * Initial settings;
 * @see resource://app/modules/devtools/sourceeditor/editor.js::Editor
 * @see chrome://browser/content/devtools/scratchpad.js::Scratchpad::onLoad
 *
 * Available options in the built-in version;
 * @see chrome://browser/content/devtools/codemirror/codemirror.js::OPTION DEFAULTS
 *
 * Available options in the recent version;
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
    // Native menuitem.
    viewSource: {
      id: 'context-viewsource'
    },

    // Custom menuitem.
    prettifyPage: {
      id: 'ucjs_PrettyPrint_prettifyPage_menuitem',
      label: '表示コードを整形',
      accesskey: 'P'
    }
  };

  function init() {
    contentAreaContextMenu.register({
      events: [
        ['popupshowing', onPopupShowing, false],
        ['command', onCommand, false]
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
      let contentDocument = gBrowser.contentDocument;
      let shouldShow =
        !$ID(kUI.viewSource.id).hidden &&
        getTextType(contentDocument) &&
        getTextContainer(contentDocument);

      // @see chrome://browser/content/nsContextMenu.js::showItem
      window.gContextMenu.showItem(kUI.prettifyPage.id, shouldShow);
    }
  }

  function onCommand(aEvent) {
    if (aEvent.target.id === kUI.prettifyPage.id) {
      let contentDocument = gBrowser.contentDocument;
      let state = {
        filename: contentDocument.documentURI,
        type: getTextType(contentDocument),
        text: getTextContent(contentDocument),
        editorOptions: kEditorOptions,
        prettifierOptions: kPrettifierOptions
      };

      Scratchpad.prettify(state);
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
      prompt('Error: unsupported text type');

      return;
    }

    if (!text) {
      prompt('Error: no content');

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
      prompt('Error: cannot open Scratchpad');

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
    // @see resource://app/modules/devtools/scratchpad-manager.jsm
    const {ScratchpadManager} =
      getModule('app/modules/devtools/scratchpad-manager.jsm');

    let scratchpadWindow = ScratchpadManager.openScratchpad();

    if (!scratchpadWindow) {
      return null;
    }

    let onLoad = () => {
      scratchpadWindow.removeEventListener('load', onLoad, false);

      scratchpadWindow.Scratchpad.addObserver({
        onReady: function(aScratchpad) {
          aScratchpad.removeObserver(this);

          aScratchpad.setFilename(aState.filename);
          aScratchpad.setText(aState.text);
          aScratchpad.editor.setMode(aState.type);

          for (let [key, value] in Iterator(aState.options)) {
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
    };

    scratchpadWindow.addEventListener('load', onLoad, false);

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
      validate: function(aValue) {
        return (aValue <= 0) ? this.defaultValue : aValue;
      }
    },

    /**
     * Indentation character [one character].
     */
    indentChar: {
      type: 'string',
      defaultValue: ' ',
      validate: function(aValue) {
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

    for (let [key, setting] in Iterator(kOptionList)) {
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
   * Add an extra line after a block end ('}' or '},' or '};') in case of
   *   the following line is not empty, and
   *   being not the last block end in a nesting block or in a block comment.
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
   * @see resource://gre/modules/devtools/jsbeautify/beautify-js.js
   */
  function prettifyJS(aText, aOptions) {
    let options = {
      indent_size: aOptions.indentSize,
      indent_char: aOptions.indentChar
    };

    const {js} = getModule('devtools/jsbeautify');

    return js(aText, options);
  }

  /**
   * CSS Prettifier.
   *
   * @note Calls the built-in function.
   * @see resource://gre/modules/devtools/jsbeautify/beautify-css.js
   */
  function prettifyCSS(aText, aOptions) {
    let options = {
      indent_size: aOptions.indentSize,
      indent_char: aOptions.indentChar
    };

    const {css} = getModule('devtools/jsbeautify');

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
 * Get the text content in a plain text document.
 *
 * @param {HTMLDocument} aDocument
 * @return {string|null}
 */
function getTextContent(aDocument) {
  let container = getTextContainer(aDocument);

  return container ? container.textContent : null;
}

/**
 * Get a <PRE> element that contains the text content in a plain text document.
 *
 * @param {HTMLDocument} aDocument
 * @return {HTMLPreElement|null}
 */
function getTextContainer(aDocument) {
  let body = aDocument.body

  let pre =
    body &&
    body.childNodes.length === 1 &&
    body.firstChild instanceof HTMLPreElement &&
    body.firstChild;

  let textLength =
    pre &&
    pre.childNodes.length === 1 &&
    pre.firstChild instanceof Text &&
    pre.firstChild.length;

  return !!textLength ? pre : null;
}

/**
 * Get a text type for the document.
 *
 * @param {HTMLDocument} aDocument
 * @return {kTextType|null}
 */
function getTextType(aDocument) {
  switch (aDocument.contentType) {
    case 'text/javascript':
    case 'application/javascript':
    case 'application/x-javascript':
      return kTextType.js;

    case 'text/css':
      return kTextType.css;
  }

  return null;
}

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
