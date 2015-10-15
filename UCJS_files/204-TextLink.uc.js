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
  ContentTask,
  Listeners: {
    $event
  },
  TabUtils,
  BrowserUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

function TextLink_init() {
  $event(gBrowser.mPanelContainer, 'dblclick', handleEvent);
}

function handleEvent(event) {
  // Bail out for the selection by the default action.
  if (event.shiftKey || event.ctrlKey) {
    return;
  }

  if (!BrowserUtils.isTextDocument()) {
    return;
  }

  findURL().then((url) => {
    if (url) {
      TabUtils.openTab(url, {
        relatedToCurrent: true
      });
    }
  }).
  catch(Cu.reportError);
}

function findURL() {
  return ContentTask.spawn(`function*() {
    ${ContentTask.ContentScripts.DOMUtils}
    ${ContentTask.ContentScripts.TextUtils}
    ${content_createURLUtil.toString()}
    ${content_getSelection.toString()}
    ${content_findURL.toString()}
    ${content_createRange.toString()}
    ${content_findBorder.toString()}

    let URLUtil = content_createURLUtil();

    let {document, selection} = content_getSelection();
    let url = content_findURL(document, selection);

    if (url) {
      selection.removeAllRanges();
    }

    return url;
  }`);
}

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
function content_createURLUtil() {
  /**
   * Converts fullwidth ASCII printable characters into halfwidth ones.
   *
   * @param aString {string}
   * @return {string}
   *
   * [94 characters]
   * !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_
   * and [back-tick] (can't write here the character for template string)
   * abcdefghijklmnopqrstuvwxyz{|}~
   *
   * [Unicode]
   * Half width: 0x0021-0x007E
   * Full width: 0xFF01-0xFF5E
   *
   * @see http://taken.s101.xrea.com/blog/article.php?id=510
   */
  let normalize = (str) => str.replace(/[\uFF01-\uFF5E]/g,
    (char) => {
      let code = char.charCodeAt(0);
      // FF01->0001
      code &= 0x007F;
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
  let isASCII = (str) => !/[^!-~]/.test(normalize(str));

  /**
   * Retrieves an array of URL-like strings.
   *
   * @param aString {string}
   * @return {array|null}
   *   |null| if no matches.
   */
  let match = (function() {
    const absolute = '(?:ps?:\\/\\/|www\\.)(?:[\\w\\-]+\\.)+[a-z]{2,}[!-~]*';
    const relative = '\\.\\.?\\/[!-~]+';

    const re = RegExp(absolute + '|' + relative, 'ig');

    return (str) => normalize(str).match(re);
  })();

  /**
   * Tests if a selected text has only ASCII characters.
   *
   * @param aSelection {nsISelection}
   * @return {boolean}
   *
   * @note Guesses the selection string at a part of a URL.
   */
  function guess(selection) {
    return isASCII(selection.toString());
  }

  /**
   * Extracts an array of URL-like strings from a range text.
   *
   * @param aRange {nsIDOMRange}
   * @return {array|null}
   *   |null| if no matches.
   */
  function extract(range) {
    return match(TextUtils.getTextInRange(range));
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
  function map(range) {
    return normalize(range.toString());
  }

  /**
   * Makes a good URL.
   *
   * @param aString {string}
   * @return {string}
   */
  function fix(str) {
    return str.
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
}

function content_getSelection() {
  let {focusedWindow} = Services.focus;

  if (!focusedWindow) {
    return null;
  }

  // Ignore a selection in editable elements.
  let selection = focusedWindow.getSelection();

  return {
    document: focusedWindow.document,
    selection
  };
}

function content_findURL(document, selection) {
  // Test if the selection seems to be a part of a URL.
  if (!selection ||
      !selection.rangeCount ||
      !URLUtil.guess(selection)) {
    return null;
  }

  // Create a large range that contains the source selection and retrieve the
  // position of the source selection in the range.
  let {range, sourcePosition} = content_createRange(document, selection);

  // Extract an array of URL strings.
  let urls = URLUtil.extract(range);

  if (!urls) {
    return null;
  }

  // Find the URL string that contains the source selection.
  let resultURL = null;

  let start, end = 0;
  let map = URLUtil.map(range);

  urls.some((url) => {
    start = map.indexOf(url, end);
    end = start + url.length;

    if (sourcePosition.start < end && start < sourcePosition.end) {
      resultURL = URLUtil.fix(url);

      return true;
    }

    return false;
  });

  return resultURL;
}

function content_createRange(document, selection) {
  let range = document.createRange();

  range.selectNode(document.documentElement);

  let sourceRange = selection.getRangeAt(0);

  // Expand the range before the source selection.
  let result = content_findBorder(
    'preceding::text()[1]',
    sourceRange.startContainer,
    sourceRange.startOffset
  );

  range.setStartBefore(result.borderNode);

  // Store the position of the source selection in the range.
  let start = result.textLength;
  let end = start + sourceRange.toString().length;

  // Expand range after the source selection.
  result = content_findBorder(
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

function content_findBorder(xpath, rootNode, textLength) {
  // The max numbers of characters without white-spaces.
  // @note It seems that 2,000 characters are sufficient for a HTTP URL.
  const kMaxTextLength = 2000;

  let borderNode = rootNode;
  let node = rootNode;

  while (textLength < kMaxTextLength) {
    node = DOMUtils.$X1(xpath, node);

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

/**
 * Entry point.
 */
TextLink_init();


})(this);
