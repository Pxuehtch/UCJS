// ==UserScript==
// @name TextLink.uc.js
// @description Detects the unlinked URL-like text
// @include main
// ==/UserScript==

// @require Util.uc.js

/**
 * @usage when 'double-click' on a URL-like text, a new tab will open
 * in the detected URL
 * @note a text will only be selected (by the Fx default behavior) if
 * 'Shift' or 'Ctrl' keys are being pressed
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
   * Converts fullwidth ASCII printable characters into halfwidth ones
   *
   * @param aString {string}
   * @return {string}
   *
   * [94 characters]
   * !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`
   * abcdefghijklmnopqrstuvwxyz{|}~
   *
   * [Unicode]
   * halfwidth: 0x0021-0x007E
   * fullwidth: 0xFF01-0xFF5E
   *
   * @see http://taken.s101.xrea.com/blog/article.php?id=510
   */
  let normalize = (aString) => aString.replace(/[\uFF01-\uFF5E]/g,
    (aChar) => {
      let code = aChar.charCodeAt(0);
      code &= 0x007F; // FF01->0001
      code += 0x0020;

      return String.fromCharCode(code);
    }
  );

  /**
   * Tests if a string has only ASCII characters
   *
   * @param aString {string}
   * @return {boolean}
   */
  let isASCII = (aString) => !/[^!-~]/.test(normalize(aString));

  /**
   * Retrieves an array of URL-like strings
   *
   * @param aString {string}
   * @return {array|null}
   *   {null} - if no match
   */
  let match = (function() {
    const absolute =
      '(?:ps?:\\/\\/|www\\.)(?:[\\w\\-]+\\.)+[a-z]{2,}[!-~]*';
    const relative =
      '\\.\\.?\\/[!-~]+';
    const re = RegExp(absolute + '|' + relative, 'ig');

    return (aString) => normalize(aString).match(re);
  })();

  /**
   * Tests if a selection text has only ASCII characters
   *
   * @param aSelection {nsISelection}
   * @return {boolean}
   */
  function guess(aSelection) {
    return isASCII(aSelection.toString());
  }

  /**
   * Retrieves an array of URL-like strings from a range text
   *
   * @param aRange {nsIDOMRange}
   * @return {array|null}
   *   {null} - if no match
   */
  function grab(aRange) {
    return match(encodeToPlain(aRange));
  }

  /**
   * Gets a text that its fullwidth ASCII characters are converted into
   * halfwidth
   *
   * @param aRange {nsIDOMRange}
   * @return {string}
   *
   * @note the text is used as a map indicating the position of the target
   * URL string
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

    return {
      border: border,
      count: count
    };
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

  return {
    start: startPos,
    end: endPos
  };
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
