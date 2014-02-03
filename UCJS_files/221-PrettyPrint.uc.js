// ==UserScript==
// @name        PrettyPrint.uc.js
// @description Prettify a source code text (JS/CSS) in the Scratchpad
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage creates a menuitem in the context menu of JS/CSS code
// page

// @note a syntax error may occur due to line wrapping forced when you run
// copy-and-paste the prettified output. see |WrapLines()|


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  XPCOM: {
    getModule
  },
  createNode: $E,
  getNodeById: $ID,
  addEvent
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('PrettyPrint.uc.js', aMsg);
}

const {
  ContentArea: {
    contextMenu: contentAreaContextMenu
  }
} = window.ucjsUI;

/**
 * Text type constants
 *
 * @note this is used to set a beautifier method and set the syntax highlight
 * mode for the Scratchpad editor
 *
 * @note the values must be selected from the editor mode constants of the
 * module |SourceEditor|
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/source-editor.jsm#Editor_mode_constants
 */
const kTextType = {
  // SourceEditor.MODES.JAVASCRIPT='js'
  javascript: 'js',
  // SourceEditor.MODES.CSS='css'
  css: 'css'
};

/**
 * Menu handler
 */
const MenuHandler = (function() {
  const kUI = {
    prettifySourcePage: {
      id: 'ucjs_prettyprint_prettifySourcePage_menuitem',
      label: '表示コードを整形',
      accesskey: 'P'
    }
  };

  let getViewSourceItem = () => $ID('context-viewsource');

  function init() {
    let context = contentAreaContextMenu;

    addEvent(context, 'popupshowing', showContextMenu, false);

    let prettifySourcePageItem = $E('menuitem', {
      id: kUI.prettifySourcePage.id,
      label: kUI.prettifySourcePage.label,
      accesskey: kUI.prettifySourcePage.accesskey
    });

    addEvent(prettifySourcePageItem, 'command', onCommand, false);

    context.insertBefore(prettifySourcePageItem, getViewSourceItem());
  }

  function showContextMenu(aEvent) {
    let contextMenu = aEvent.target;

    if (contextMenu !== contentAreaContextMenu) {
      return;
    }

    let contentDocument = gBrowser.contentDocument;
    let shouldShow =
      !getViewSourceItem().hidden &&
      getTextType(contentDocument) &&
      getTextContainer(contentDocument);

    showItem(kUI.prettifySourcePage.id, shouldShow);
  }

  function showItem(aID, aShouldShow) {
    let item = $ID(aID);

    if (item && item.hidden !== !aShouldShow) {
      item.hidden = !aShouldShow;
    }
  }

  function onCommand(aEvent) {
    let menuitem = aEvent.target;

    if (menuitem.id === kUI.prettifySourcePage.id) {
      let contentDocument = gBrowser.contentDocument;
      let state = {
        filename: contentDocument.URL,
        text: getSourceText(contentDocument),
        type: getTextType(contentDocument)
      };

      Scratchpad.prettify(state);
    }
  }

  /**
   * Export
   */
  return {
    init: init
  };
})();

/**
 * Scratchpad handler
 */
const Scratchpad = (function() {
  /**
   * Show a prettified text in the Scratchpad
   *
   * @param {hash} aState
   *   filename {string}
   *   text {string}
   *   type {kTextType}
   *   beautifierOptions {hash} [optional]
   *   @see |Beautifier.fixupOptions|
   */
  function prettify(aState) {
    let {filename, text, type, beautifierOptions} = aState || {};

    if (!text) {
      warn('invalid text');
      return;
    }

    if (!type) {
      warn('unsupported text type');
      return;
    }

    let state = {
      filename: filename,
      text: Beautifier.execute(text, type, beautifierOptions),
      type: type
    };

    let win = open(state);

    if (!win) {
      warn('Scratchpad cannot open');
      return;
    }
  }

  /**
   * Open the Scratchpad window and set a source text and the editor mode
   *
   * @param {hash} aState
   *   filename {string}
   *   text {string}
   *   type {kTextType}
   * @return {DOMWindow}
   *   the new window object that holds Scratchpad
   */
  function open(aState) {
    let scratchpadWindow = window.Scratchpad.openScratchpad();

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
          aScratchpad.editor.setCaretPosition(0);
          scratchpadWindow.focus();
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
    prettify: prettify
  };
})();

/**
 * Beautifier handler
 */
const Beautifier = (function() {
  /**
   * Fix up options
   *
   * @param aOptions {hash}
   *   indentSize {number} [2]
   *   indentChar {string} [' ']
   *   wrapLineLength {number} [80]
   *   extraLine {boolean} [true]
   *   lastSemicolon {boolean} [true]
   * @return {hash}
   *
   * @note |JS Beautify beautify.js| new version supports |wrap_line_length|
   */
  function fixupOptions(aOptions) {
    const kOptionList = {
      indentSize: {
        type: 'number',
        defaultValue: 2,
        validate: function(aValue) {
          if (aValue <= 0) {
            return this.defaultValue;
          }
          return aValue;
        }
      },

      indentChar: {
        type: 'string',
        defaultValue: ' ',
        validate: function(aValue) {
          if (aValue === '') {
            return this.defaultValue;
          }
          return aValue.charAt(0);
        }
      },

      wrapLineLength: {
        type: 'number',
        defaultValue: 80,
        validate: function(aValue) {
          if (aValue < 0) {
            return 0;
          }
          return aValue;
        }
      },

      extraLine: {
        type: 'boolean',
        defaultValue: true
      },

      lastSemicolon: {
        type: 'boolean',
        defaultValue: true
      }
    };

    let options = {};

    aOptions = aOptions || {};

    for (let [key, setting] in Iterator(kOptionList)) {
      let value = aOptions[key];

      if (value === undefined) {
        value = setting.defaultValue;
      }
      else {
        switch (setting.type) {
          case 'number':
            value = parseInt(aValue, 10);

            if (isNaN(value)) {
              value = setting.defaultValue;
            }
            break;
          case 'string':
            value = aValue + '';
            break;
          case 'boolean':
            value = !!aValue;
            break;
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
   * Beautify a source text
   *
   * @param aText {string}
   * @param aTextType {kTextType}
   * @param aOptions {hash}
   *   @see |Beautifier.fixupOptions|
   * @return {string}
   */
  function execute(aText, aTextType, aOptions) {
    let beautify;

    switch (aTextType) {
      case kTextType.javascript:
        beautify = JSBeautify;
        break;
      case kTextType.css:
        beautify = CSSBeautify;
        break;
      default:
        throw Error('unsupported text type');
    }

    aOptions = fixupOptions(aOptions);

    let result = beautify(normalizeText(aText), aOptions);

    if (aOptions.wrapLineLength > 0) {
      result = wrapLines(result, aTextType, aOptions.wrapLineLength);
    }

    if (aOptions.extraLine) {
      result = addExtraLine(result);
    }

    if (aOptions.lastSemicolon) {
      result = complementLastSemicolon(result);
    }

    return result;
  }

  function normalizeText(aText) {
    // remove original indents and empty lines and fix the newline code
    return aText.replace(/^\s+/gm, '').replace(/[\n\r]+/g, '\n');
  }

  function addExtraLine(aText) {
    // add an extra line after '}'/'},'/'};' which is not the last one in
    // nesting block
    return aText.replace(/(}[,;]?\n)(?!\s*})/g, '$1\n');
  }

  function complementLastSemicolon(aText) {
    // complement a semicolon after the last statement before '}'
    return aText.replace(/[^;}\s](?=\n\s*\})/g, '$&;');
  }

  // @note the long line is wrapped forcibly
  function wrapLines(aText, aTextType, aWrapLineLength) {
    let charsForWrap;

    switch (aTextType) {
      case kTextType.javascript:
        charsForWrap = /[,:)&|=<>]/;
        break;
      case kTextType.css:
        charsForWrap = /[,:)]/;
        break;
    }

    let longLines = RegExp('^.{' + (aWrapLineLength + 1) + ',}$', 'gm');

    return aText.replace(longLines, (text) => {
      let lines = [];
      let last = aWrapLineLength - 1;
      let shouldWrap = false;

      while (text.length > aWrapLineLength) {
        if (charsForWrap.test(text[last]) &&
            !/[\\]/.test(text[last - 1])) {
          shouldWrap = true;
        }
        else if (--last <= 0) {
          // force to wrap in max length
          last = aWrapLineLength - 1;
          shouldWrap = true;
        }

        if (shouldWrap) {
          let indent = (/^\s+/.exec(text) || [''])[0];

          lines.push(text.substring(0, last + 1));

          text = indent + text.substring(last + 1).trim();
          last = aWrapLineLength - 1;
          shouldWrap = false;
        }
      }
      lines.push(text);

      return lines.join('\n');
    });
  }

  /**
   * JS beautifier
   *
   * @note used the built-in JS beautifier
   * @see https://github.com/mozilla/releases-mozilla-release/blob/master/browser/devtools/shared/Jsbeautify.jsm
   *
   * @note the built-in function is based on JS Beautifier beautify.js
   * @note the newer version supports |wrap_line_length|
   * @see https://github.com/einars/js-beautify/blob/master/js/lib/beautify.js
   */
  function JSBeautify(aText, aOptions) {
    let options = {
      indent_size: aOptions.indentSize,
      indent_char: aOptions.indentChar
    };

    const {js_beautify} =
      getModule('resource://app/modules/devtools/Jsbeautify.jsm');

    return js_beautify(aText, options);
  }

  /**
   * CSS beautifier
   */
  function CSSBeautify(aText, aOptions) {
    let options = {
      indent_size: aOptions.indentSize,
      indent_char: aOptions.indentChar
    };

    return css_beautify(aText, options);
  }

  /**
   * JS Beautifier beautify-css.js [Apr 28, 2013]
   *
   * TODO: version [Nov 22, 2013] seems to be incompatible with this user
   * script, so, stop updating until I find what wrong
   *
   * @see https://github.com/einars/js-beautify/blob/master/js/lib/beautify-css.js
   *
   * The MIT License (MIT)
   *
   * Copyright (c) 2007-2013 Einar Lielmanis and contributors.
   *
   * Permission is hereby granted, free of charge, to any person
   * obtaining a copy of this software and associated documentation files
   * (the "Software"), to deal in the Software without restriction,
   * including without limitation the rights to use, copy, modify, merge,
   * publish, distribute, sublicense, and/or sell copies of the Software,
   * and to permit persons to whom the Software is furnished to do so,
   * subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be
   * included in all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
   * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
   * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
   * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
   * BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
   * ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
   * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   */
  function css_beautify(source_text,options){options=options||{};var indentSize=options.indent_size||4;var indentCharacter=options.indent_char||" ";if(typeof indentSize==="string")indentSize=parseInt(indentSize,10);var whiteRe=/^\s+$/;var wordRe=/[\w$\-_]/;var pos=-1,ch;function next(){ch=source_text.charAt(++pos);return ch}function peek(){return source_text.charAt(pos+1)}function eatString(comma){var start=pos;while(next())if(ch==="\\"){next();next()}else if(ch===comma)break;else if(ch==="\n")break;return source_text.substring(start,pos+1)}function eatWhitespace(){var start=pos;while(whiteRe.test(peek()))pos++;return pos!==start}function skipWhitespace(){var start=pos;do;while(whiteRe.test(next()));return pos!==start+1}function eatComment(){var start=pos;next();while(next())if(ch==="*"&&peek()==="/"){pos++;break}return source_text.substring(start,pos+1)}function lookBack(str){return source_text.substring(pos-str.length,pos).toLowerCase()===str}var indentString=source_text.match(/^[\r\n]*[\t ]*/)[0];var singleIndent=Array(indentSize+1).join(indentCharacter);var indentLevel=0;function indent(){indentLevel++;indentString+=singleIndent}function outdent(){indentLevel--;indentString=indentString.slice(0,-indentSize)}var print={};print["{"]=function(ch){print.singleSpace();output.push(ch);print.newLine()};print["}"]=function(ch){print.newLine();output.push(ch);print.newLine()};print.newLine=function(keepWhitespace){if(!keepWhitespace)while(whiteRe.test(output[output.length-1]))output.pop();if(output.length)output.push("\n");if(indentString)output.push(indentString)};print.singleSpace=function(){if(output.length&&!whiteRe.test(output[output.length-1]))output.push(" ")};var output=[];if(indentString)output.push(indentString);while(true){var isAfterSpace=skipWhitespace();if(!ch)break;if(ch==="{"){indent();print["{"](ch)}else if(ch==="}"){outdent();print["}"](ch)}else if(ch==='"'||ch==="'")output.push(eatString(ch));else if(ch===";")output.push(ch,"\n",indentString);else if(ch==="/"&&peek()==="*"){print.newLine();output.push(eatComment(),"\n",indentString)}else if(ch==="(")if(lookBack("url")){output.push(ch);eatWhitespace();if(next())if(ch!==")"&&ch!=='"'&&ch!=="'")output.push(eatString(")"));else pos--}else{if(isAfterSpace)print.singleSpace();output.push(ch);eatWhitespace()}else if(ch===")")output.push(ch);else if(ch===","){eatWhitespace();output.push(ch);print.singleSpace()}else if(ch==="]")output.push(ch);else if(ch==="["||ch==="="){eatWhitespace();output.push(ch)}else{if(isAfterSpace)print.singleSpace();output.push(ch)}}var sweetCode=output.join("").replace(/[\n ]+$/,"");return sweetCode}

  /**
   * Export
   */
  return {
    execute: execute
  };
})();

/**
 * Get a source text if the document contains a plain text only
 *
 * @param {HTMLDocument} aDocument
 * @return {string|null}
 */
function getSourceText(aDocument) {
  let container = getTextContainer(aDocument);

  return container ? container.textContent : null;
}

function getTextContainer(aDocument) {
  let body = aDocument.body

  let pre =
    body &&
    body.childNodes.length === 1 &&
    body.firstChild instanceof HTMLPreElement &&
    body.firstChild;

  let text =
    pre &&
    pre.childNodes.length === 1 &&
    pre.firstChild instanceof Text &&
    pre.firstChild.length &&
    pre.firstChild;

  return pre || null;
}

/**
 * Get a text type for the document
 *
 * @param {HTMLDocument} aDocument
 * @return {kTextType|null}
 */
function getTextType(aDocument) {
  switch (aDocument.contentType) {
    case 'text/javascript':
    case 'application/javascript':
    case 'application/x-javascript':
      return kTextType.javascript;
    case 'text/css':
      return kTextType.css;
  }
  return null;
}

function warn(aMessage) {
  Services.prompt.alert(null, 'PrettyPrint.uc.js', aMessage);
}

/**
 * Entry point
 */
function PrettyPrint_init() {
  MenuHandler.init();
}

PrettyPrint_init()


})(this);
