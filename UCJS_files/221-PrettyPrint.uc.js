// ==UserScript==
// @name        PrettyPrint.uc.js
// @description Prettify a source code text (JS/CSS) in Scratchpad
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage a 'prettify source page' menuitem in the context menu of JS/CSS code
// page


(function(window, undefined) {


"use strict";


/**
 * Text type constants
 * this is used to set a beautifier method and set the syntax highlight mode
 * for the Scratchpad editor
 *
 * @note the values must be selected from the editor mode constants of
 * |source-editor.jsm|
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

  function getViewSourceItem() {
    return $ID('context-viewsource');
  }

  function init() {
    let context = getContextMenu();
    addEvent([context, 'popupshowing', showContextMenu, false]);

    let prettifySourcePageItem = $E('menuitem', {
      id: kUI.prettifySourcePage.id,
      label: U(kUI.prettifySourcePage.label),
      accesskey: kUI.prettifySourcePage.accesskey
    });
    addEvent([prettifySourcePageItem, 'command', doCommand, false]);

    context.insertBefore(prettifySourcePageItem, getViewSourceItem());
  }

  function showContextMenu(aEvent) {
    let contextMenu = aEvent.target;
    if (contextMenu !== getContextMenu()) {
      return;
    }

    let shouldShow =
      !getViewSourceItem().hidden &&
      scanTextType(gBrowser.contentDocument.contentType) &&
      getSourceText(gBrowser.contentDocument);
    showItem(kUI.prettifySourcePage.id, shouldShow);
  }

  function showItem(aID, aShouldShow) {
    let item = $ID(aID);
    if (item && item.hidden !== !aShouldShow) {
      item.hidden = !aShouldShow;
    }
  }

  function doCommand(aEvent) {
    let menuitem = aEvent.target;

    if (menuitem.id === kUI.prettifySourcePage.id) {
      let contentDocument = gBrowser.contentDocument;
      let state = {
        filename: contentDocument.URL,
        text: getSourceText(contentDocument),
        type: scanTextType(contentDocument.contentType)
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
   * Show a prettified text in a Scratchpad
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
   * Open a Scratchpad window and set a source text and the editor mode
   *
   * @param {hash} aState
   *   filename {string}
   *   text {string}
   *   type {kTextType}
   * @return {nsIDOMWindow}
   *   the new window object that holds Scratchpad
   */
  function open(aState) {
    let scratchpadWindow = window.Scratchpad.openScratchpad();
    if (!scratchpadWindow) {
      return null;
    }

    let onLoad = function() {
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
 *
 * based on JS Beautify
 * @see https://github.com/einars/js-beautify
 */
const Beautifier = (function() {
  /**
   * Fix up options
   *
   * @param aOptions {hash}
   *   indent_size {number} [2]
   *   indent_char {string} [' ']
   *   wrap_line_length {number} [80]
   *   extraLine {boolean} [true]
   *   lastSemicolon {boolean} [true]
   * @return {hash}
   *
   * @note |JS Beautify beautify.js| new version supports |wrap_line_length|
   */
  function fixupOptions(aOptions) {
    function num(aValue) {
      return (aValue && parseInt(aValue, 10)) || undefined;
    }

    function str(aValue) {
      return (aValue && aValue + '') || undefined;
    }

    let {
      indent_size,
      indent_char,
      wrap_line_length,
      extraLine,
      lastSemicolon
    } = aOptions || {};

    indent_size = num(indent_size);
    if (indent_size === undefined ||
        indent_size <= 0) {
      indent_size = 2;
    }

    indent_char = str(indent_char) || ' ';

    wrap_line_length = num(wrap_line_length);
    if (wrap_line_length === undefined) {
      wrap_line_length = 80;
    } else if (wrap_line_length <= 0) {
      wrap_line_length = 0;
    }

    extraLine = !!(extraLine !== false);

    lastSemicolon = !!(lastSemicolon !== false);

    return {
      indent_size: indent_size,
      indent_char: indent_char,
      wrap_line_length: wrap_line_length,
      extraLine: extraLine,
      lastSemicolon: lastSemicolon
    };
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
        beautify = js_beautify;
        break;
      case kTextType.css:
        beautify = css_beautify;
        break;
      default:
        throw Error('unsupported text type');
    }

    aOptions = fixupOptions(aOptions);

    let result = beautify(normalizeText(aText), aOptions);

    if (aOptions.wrap_line_length > 0) {
      result = wrapLines(result, aTextType, aOptions.wrap_line_length);
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
    // add an extra line after '}' or '},' which is not the last one in nesting
    // block
    return aText.replace(/(},?\n)(?!\s*})/g, '$1\n');
  }

  function complementLastSemicolon(aText) {
    // complement a semicolon after the last statement before '}'
    return aText.replace(/[^;}\s](?=\n\s*\})/g, '$&;');
  }

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
    return aText.replace(longLines, function(text) {
      let lines = [];
      let last = aWrapLineLength - 1;
      let shouldWrap = false;
      while (text.length > aWrapLineLength) {
        if (charsForWrap.test(text[last]) &&
            !/[\\]/.test(text[last - 1])) {
          shouldWrap = true;
        } else if (--last <= 0) {
          // force to wrap in max length
          shouldWrap = true;
          last = aWrapLineLength - 1;
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
   * Built-in JS beautifier
   *
   * @note this version unsupports |wrap_line_length| option
   *
   * @see https://github.com/mozilla/releases-mozilla-central/blob/master/browser/devtools/shared/Jsbeautify.jsm
   *
   * based on JS Beautifier beautify.js
   * @see https://github.com/einars/js-beautify
   */
  let BUILTIN = {};
  window.XPCOMUtils.defineLazyModuleGetter(BUILTIN, 'js_beautify',
    'resource:///modules/devtools/Jsbeautify.jsm');

  function js_beautify(source_text, options) {
    return BUILTIN.js_beautify(source_text, options);
  }

  /**
   * CSS beautifier
   *
   * JS Beautifier beautify-css.js March 27, 2013
   * @see https://github.com/einars/js-beautify/blob/master/beautify-css.js
   *
   * The MIT License (MIT)
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
  function css_beautify(source_text,options){options=options||{};var indentSize=options.indent_size||4;var indentCharacter=options.indent_char||' ';if(typeof indentSize==="string"){indentSize=parseInt(indentSize,10)}var whiteRe=/^\s+$/;var wordRe=/[\w$\-_]/;var pos=-1,ch;function next(){ch=source_text.charAt(++pos);return ch}function peek(){return source_text.charAt(pos+1)}function eatString(comma){var start=pos;while(next()){if(ch==="\\"){next();next()}else if(ch===comma){break}else if(ch==="\n"){break}}return source_text.substring(start,pos+1)}function eatWhitespace(){var start=pos;while(whiteRe.test(peek())){pos++}return pos!==start}function skipWhitespace(){var start=pos;do{}while(whiteRe.test(next()));return pos!==start+1}function eatComment(){var start=pos;next();while(next()){if(ch==="*"&&peek()==="/"){pos++;break}}return source_text.substring(start,pos+1)}function lookBack(str){return source_text.substring(pos-str.length,pos).toLowerCase()===str}var indentString=source_text.match(/^[\r\n]*[\t ]*/)[0];var singleIndent=Array(indentSize+1).join(indentCharacter);var indentLevel=0;function indent(){indentLevel++;indentString+=singleIndent}function outdent(){indentLevel--;indentString=indentString.slice(0,-indentSize)}var print={};print["{"]=function(ch){print.singleSpace();output.push(ch);print.newLine()};print["}"]=function(ch){print.newLine();output.push(ch);print.newLine()};print.newLine=function(keepWhitespace){if(!keepWhitespace){while(whiteRe.test(output[output.length-1])){output.pop()}}if(output.length){output.push('\n')}if(indentString){output.push(indentString)}};print.singleSpace=function(){if(output.length&&!whiteRe.test(output[output.length-1])){output.push(' ')}};var output=[];if(indentString){output.push(indentString)}while(true){var isAfterSpace=skipWhitespace();if(!ch){break}if(ch==='{'){indent();print["{"](ch)}else if(ch==='}'){outdent();print["}"](ch)}else if(ch==='"'||ch==='\''){output.push(eatString(ch))}else if(ch===';'){output.push(ch,'\n',indentString)}else if(ch==='/'&&peek()==='*'){print.newLine();output.push(eatComment(),"\n",indentString)}else if(ch==='('){if(lookBack("url")){output.push(ch);eatWhitespace();if(next()){if(ch!==')'&&ch!=='"'&&ch!=='\''){output.push(eatString(')'))}else{pos--}}}else{if(isAfterSpace){print.singleSpace()}output.push(ch);eatWhitespace()}}else if(ch===')'){output.push(ch)}else if(ch===','){eatWhitespace();output.push(ch);print.singleSpace()}else if(ch===']'){output.push(ch)}else if(ch==='['||ch==='='){eatWhitespace();output.push(ch)}else{if(isAfterSpace){print.singleSpace()}output.push(ch)}}var sweetCode=output.join('').replace(/[\n ]+$/,'');return sweetCode}

  /**
   * Export
   */
  return {
    execute: execute
  };
})();


//********** Utilities

/**
 * Get a source text of a document
 * get if the document only contains JS or CSS source code
 *
 * @param {HTMLDocument} aDocument
 * @return {string|null}
 */
function getSourceText(aDocument) {
  let body = aDocument.body;

  if (body.childNodes.length === 1 &&
      body.childNodes[0].localName === 'pre') {
    return body.textContent;
  }
  return null;
}

/**
 * Get a text type
 *
 * @param {string} aContentType
 * @return {kTextType|null}
 */
function scanTextType(aContentType) {
  switch (aContentType) {
    case 'text/javascript':
    case 'application/javascript':
    case 'application/x-javascript':
      return kTextType.javascript;
    case 'text/css':
      return kTextType.css;
  }
  return null;
}

function $ID(aId) {
  return window.document.getElementById(aId);
}

function warn(aMessage) {
  window.Services.prompt.alert(null, 'PrettyPrint.uc.js', aMessage);
}


//********** Imports

function $E(aTag, aAttribute) {
  return window.ucjsUtil.createNode(aTag, aAttribute);
}

// |U()| converts embedded chars in the code for displaying properly.
function U(aStr) {
  return window.ucjsUtil.toStringForUI(aStr);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('PrettyPrint.uc.js', aMsg);
}

function getContextMenu() {
  return window.ucjsUI.ContentArea.contextMenu;
}


//********** Entry point

function PrettyPrint_init() {
  MenuHandler.init();
}

PrettyPrint_init()


})(this);
