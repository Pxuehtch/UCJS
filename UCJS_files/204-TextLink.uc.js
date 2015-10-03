// ==UserScript==
// @name TextLink.uc.js
// @description Detects the unlinked URL-like text.
// @include main
// ==/UserScript==

// @require Util.uc.js

/**
 * @usage A new tab will open in the detected URL when 'double-click' on a
 * URL-like text.
 * @note A text will be only selected (by the Fx default behavior) if <Shift>
 * or <Ctrl> keys are being pressed.
 */


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  Listeners: {
    $event
  },
  getFirstNodeByXPath: $X1,
  getTextInRange,
  openTab,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

/**
 * Helper functions for URL-like strings.
 *
 * @return {hash}
 *   @key guess {function}
 *   @key extract {function}
 *   @key map {function}
 *   @key fix {function}
 *
 * TODO: Detect Kana/Kanji characters.
 */
const URLUtil = (function() {
  /**
   * Converts fullwidth ASCII printable characters into halfwidth ones.
   *
   * @param aString {string}
   * @return {string}
   *
   * [94 characters]
   * !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`
   * abcdefghijklmnopqrstuvwxyz{|}~
   *
   * [Unicode]
   * Half width: 0x0021-0x007E
   * Full width: 0xFF01-0xFF5E
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
   * Tests if a string has only ASCII characters.
   *
   * @param aString {string}
   * @return {boolean}
   */
  let isASCII = (aString) => !/[^!-~]/.test(normalize(aString));

  /**
   * Retrieves an array of URL-like strings.
   *
   * @param aString {string}
   * @return {array|null}
   *   |null| if no matches.
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
   * Tests if a selected text has only ASCII characters.
   *
   * @param aSelection {nsISelection}
   * @return {boolean}
   *
   * @note Guesses the selection string at a part of a URL.
   */
  function guess(aSelection) {
    return isASCII(aSelection.toString());
  }

  /**
   * Extracts an array of URL-like strings from a range text.
   *
   * @param aRange {nsIDOMRange}
   * @return {array|null}
   *   |null| if no matches.
   */
  function extract(aRange) {
    return match(getTextInRange(aRange));
  }

  /**
   * Gets a text that its fullwidth ASCII characters are converted into
   * halfwidth.
   *
   * @param aRange {nsIDOMRange}
   * @return {string}
   *
   * @note Used as a map indicating the position of URL strings.
   */
  function map(aRange) {
    return normalize(aRange.toString());
  }

  /**
   * Makes a good URL.
   *
   * @param aString {string}
   * @return {string}
   */
  function fix(aString) {
    return aString.
      replace(/^[^s:\/]+(s?:\/)/, 'http$1').
      replace(/^www\./, 'http://www.').
      // Remove trailing characters that may be marks unrelated to the URL.
      replace(/["')\]]*[,.;:]*$/, '');
  }

  return {
    guess,
    extract,
    map,
    fix
  }
})();

function TextLink_init() {
  // @note Use the capture mode to surely catch the event in the content area.
  $event(gBrowser.mPanelContainer, 'dblclick', handleEvent, true);
}

function handleEvent(aEvent) {
  // Bail out for the selection by the default action.
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
  // Test if the selection seems to be a part of a URL.
  if (!aSelection ||
      !aSelection.rangeCount ||
      !URLUtil.guess(aSelection)) {
    return null;
  }

  // Create a large range that contains the source selection and retrieve the
  // position of the source selection in the range.
  let {range, sourcePosition} = createRange(aDocument, aSelection);

  // Extract an array of URL strings.
  let URLs = URLUtil.extract(range);

  if (!URLs) {
    return null;
  }

  // Find the URL string that contains the source selection.
  let resultURL = null;

  let start, end = 0;
  let map = URLUtil.map(range);

  URLs.some((URL) => {
    start = map.indexOf(URL, end);
    end = start + URL.length;

    if (sourcePosition.start < end && start < sourcePosition.end) {
      resultURL = URLUtil.fix(URL);

      return true;
    }

    return false;
  });

  return resultURL;
}

function createRange(aDocument, aSelection) {
  let range = aDocument.createRange();

  range.selectNode(aDocument.documentElement);

  let sourceRange = aSelection.getRangeAt(0);

  // Expand the range before the source selection.
  let result = findBorder(
    'preceding::text()[1]',
    sourceRange.startContainer,
    sourceRange.startOffset
  );

  range.setStartBefore(result.borderNode);

  // Store the position of the source selection in the range.
  let start = result.textLength;
  let end = start + sourceRange.toString().length;

  // Expand range after the source selection.
  result = findBorder(
    'following::text()[1]',
    sourceRange.endContainer,
    sourceRange.endContainer.textContent.length - sourceRange.endOffset
  );

  range.setEndAfter(result.borderNode);

  return {
    range,
    sourcePosition: {
      start,
      end
    }
  };
}

function findBorder(aXPath, aNode, aTextLength) {
  // The threshold number of characters without white-spaces.
  // @note It seems that 2,000 characters are sufficient for a HTTP URL.
  const kMaxTextLength = 2000;

  let borderNode = aNode;
  let textLength = aTextLength;

  let node = aNode;

  while (textLength < kMaxTextLength) {
    node = $X1(aXPath, node);

    if (!node) {
      break;
    }

    let text = node.textContent;

    borderNode = node;
    textLength += text.length;

    // A white-space marks off a URL string.
    if (/\s/.test(text)) {
      break;
    }
  }

  return {
    borderNode,
    textLength
  };
}

function isTextDocument(aDocument) {
  return aDocument &&
         Modules.BrowserUtils.mimeTypeIsTextBased(aDocument.contentType);
}

/**
 * Entry point.
 */
TextLink_init();


})(this);
