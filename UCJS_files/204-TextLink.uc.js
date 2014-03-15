// ==UserScript==
// @name TextLink.uc.js
// @description Detects the unlinked URL-like text
// @include main
// ==/UserScript==

// @require Util.uc.js

/**
 * @usage when 'double-click' on a URL-like text, a new tab will open
 * in the detected URL
 * @note if 'Shift' or 'Ctrl' has been pressed, the text is only selected
 * by the default behavior
 */

// @see https://github.com/piroor/textlink


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getFirstNodeByXPath: $X1,
  addEvent,
  openTab
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('TextLink.uc.js', aMsg);
}

/**
 * URL string handler
 *
 * @return {hash}
 *   @member guess {function}
 *   @member grab {function}
 *   @member map {function}
 *   @member fix {function}
 */
const URLUtil = (function() {
  /**
   * URI characters
   */
  const kURIC = {
    word: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_",
    mark: "-.!~*;/?:@&=+$,%#'()"
  };

  /**
   * Converts the alias %URIC% into a string for RegExp()
   *
   * @note %URIC% has to be contained in []
   */
  let resolve = (function() {
    const re = /%URIC%/g;
    const replacement = '\\w' + kURIC.mark;

    return (aStr) => aStr.replace(re, replacement);
  })();

  /**
   * Converts zennkaku URI chars into hankaku ones
   */
  let normalize = (function() {
    const zenkakuURIC = (kURIC.word + kURIC.mark).replace(/./g, han2zen);
    const re = RegExp('[' + zenkakuURIC + ']', 'g');

    return (aStr) => aStr.replace(re, zen2han);
  })();

  /**
   * Tests if a string has only URI chars
   */
  let isURIC = (function() {
    const exURIC = '[^%URIC%]';
    const re = RegExp(resolve(exURIC));

    return (aStr) => !re.test(normalize(aStr));
  })();

  /**
   * Retrieves an array of URL-like strings
   *
   * @note returns null if no match
   */
  let match = (function() {
    const absolute =
      '(?:ps?:\\/\\/|www\\.)(?:[\\w\\-]+\\.)+[a-z]{2,}[%URIC%]*';
    const relative =
      '\\.\\.?\\/[%URIC%]+';
    const re = RegExp(resolve(absolute + '|' + relative), 'ig');

    return (aStr) => normalize(aStr).match(re);
  })();

  /**
   * Tests if a selection text has only URI chars
   *
   * @return {boolean}
   */
  function guess(aSelection) {
    return isURIC(aSelection.toString());
  }

  /**
   * Retrieves an array of URL-like strings from a range text
   *
   * @return {array|null}
   *   if no match is found returns null
   */
  function grab(aRange) {
    return match(encodeToPlain(aRange));
  }

  /**
   * Gets a range string which its zenkaku URIC is converted into hankaku
   *
   * @return {string}
   */
  function map(aRange) {
    return normalize(aRange.toString());
  }

  /**
   * Makes a good URL
   *
   * @param aString {string}
   * @return {string}
   */
  function fix(aString) {
    return aString.
      replace(/^[^s:\/]+(s?:\/)/, 'http$1').
      replace(/^www\./, 'http://www.').
      // remove trailing characters that may be marks unrelated to the URL
      replace(/["')\]]?[,.;:]?$/, '');
  }

  return {
    guess: guess,
    grab: grab,
    map: map,
    fix: fix
  }
})();

function TextLink_init() {
  addEvent(gBrowser.mPanelContainer, 'dblclick', handleEvent, false);
}

function handleEvent(aEvent) {
  // return for the selection by the default action
  if (aEvent.shiftKey || aEvent.ctrlKey) {
    return;
  }

  let doc = aEvent.originalTarget.ownerDocument;

  if (!isTextDocument(doc)) {
    return;
  }

  let selection = doc.defaultView.getSelection();
  let URL = findURL(doc, selection);

  if (URL) {
    selection.removeAllRanges();

    openTab(URL, {
      relatedToCurrent: true
    });
  }
}

function findURL(aDocument, aSelection) {
  let URL = '';

  if (!aSelection ||
      !aSelection.rangeCount ||
      !URLUtil.guess(aSelection)) {
    return URL;
  }

  // make a target range with a source selection
  let range = aDocument.createRange();

  range.selectNode(aDocument.documentElement);

  // update the target range and get the position of the source selection
  // in the target range
  let position = initRange(range, aSelection.getRangeAt(0));

  // retrieve array of URL-like strings from the target range
  let URLs = URLUtil.grab(range);

  if (!URLs) {
    return URL;
  }

  // scan the position of a URL in the target range
  let map = URLUtil.map(range);
  let start, end = 0;

  URLs.some((url) => {
    start = map.indexOf(url, end);
    end = start + url.length;

    // if the URL contains the source selection, we got it
    if (position.start < end && start < position.end) {
      URL = URLUtil.fix(url);
      return true;
    }
    return false;
  });

  return URL;
}

function initRange(aRange, aSourceRange) {
  function expand(aXPath, aNode, aCount) {
    const kCharsBuffer = 256;

    let node = aNode;
    let border = node;
    let count = aCount;
    let text;

    while (count < kCharsBuffer) {
      node = $X1(aXPath, node);

      if (!node) {
        break;
      }

      border = node;
      text = node.textContent;
      count += text.length;

      // white-space marks off the URL string
      if (/\s/.test(text)) {
        break;
      }
    }

    return {border: border, count: count};
  }

  // expand range before the source selection
  let result = expand(
    'preceding::text()[1]',
    aSourceRange.startContainer,
    aSourceRange.startOffset
  );

  aRange.setStartBefore(result.border);

  // store the source position
  let startPos = result.count;
  let endPos = startPos + aSourceRange.toString().length;

  // expand range after the source selection
  result = expand(
    'following::text()[1]',
    aSourceRange.endContainer,
    aSourceRange.endContainer.textContent.length - aSourceRange.endOffset
  );

  aRange.setEndAfter(result.border);

  return {start: startPos, end: endPos};
}

/**
 * hankaku / zenkaku converter for ASCII printable characters
 *
 * 94 characters:
 * !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`
 * abcdefghijklmnopqrstuvwxyz{|}~
 *
 * hankaku: 0x0021-0x007E
 * zenkaku: 0xFF01-0xFF5E
 *
 * @see http://taken.s101.xrea.com/blog/article.php?id=510
 */
function han2zen(aChar) {
  let code = aChar.charCodeAt(0);
  code += 0xFEE0; // 0021->FF01

  return String.fromCharCode(code);
}

function zen2han(aChar) {
  let code = aChar.charCodeAt(0);
  code &= 0x007F; // FF01->0001
  code += 0x0020;

  return String.fromCharCode(code);
}

function encodeToPlain(aRange) {
  let encoder =
    Cc['@mozilla.org/layout/documentEncoder;1?type=text/plain'].
    createInstance(Ci.nsIDocumentEncoder);

  encoder.init(
    aRange.startContainer.ownerDocument,
    'text/plain',
    encoder.OutputLFLineBreak |
    encoder.SkipInvisibleContent
  );

  encoder.setRange(aRange);

  return encoder.encodeToString();
}

function isTextDocument(aDocument) {
  // @see chrome://browser/content/browser.js::mimeTypeIsTextBased
  return aDocument && window.mimeTypeIsTextBased(aDocument.contentType);
}

/**
 * Entry point
 */
TextLink_init();


})(this);
