// ==UserScript==
// @name TextLink.uc.js
// @description Detects the unlinked URL-like text.
// @include main
// ==/UserScript==

// @require Util.uc.js

/**
 * @usage When 'double-click' on a URL-like text, a new tab will open
 * in the detected URL.
 * @note If 'Shift or Ctrl' has been pressed, the text is only selected
 * by the default behavior.
 */

// @see https://github.com/piroor/textlink


(function(window, undefined) {


"use strict";


/**
 * URL string handler
 * @return {hash}
 *   @member guess {function}
 *   @member grab {function}
 *   @member map {function}
 *   @member fix {function}
 */
var mURLUtil = (function() {
  /**
   * URI characters
   */
  const kURIC = {
    word: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_",
    mark: "-.!~*;/?:@&=+$,%#'()"
  };

  /**
   * Converts alias %URIC% into a string for RegExp()
   * @note %URIC% has to be contained in []
   */
  var resolve = (function() {
    const re = /%URIC%/g;
    const replacement = '\\w' + kURIC.mark;

    return function(aStr) aStr.replace(re, replacement);
  })();

  /**
   * Converts zennkaku URI chars into hankaku ones
   */
  var normalize = (function() {
    const zenURIC = (kURIC.word + kURIC.mark).replace(/./g, han2zen);
    const re = RegExp('[' + zenURIC + ']', 'g');

    return function(aStr) aStr.replace(re, zen2han);
  })();

  /**
   * Tests if a string has only URI chars
   */
  var isURIC = (function() {
    const exURIC = '[^%URIC%]';
    const re = RegExp(resolve(exURIC));

    return function(aStr) !re.test(normalize(aStr));
  })();

  /**
   * Retrieves array of URL-like strings
   * @note if no match is found returns null
   */
  var match = (function() {
    const absolute =
      '(?:ps?:\\/\\/|www\\.)(?:[\\w\\-]+\\.)+[a-z]{2,}[%URIC%]*';
    const relative =
      '\\.\\.?\\/[%URIC%]+';
    const re = RegExp(resolve(absolute + '|' + relative), 'ig');

    return function(aStr) normalize(aStr).match(re);
  })();

  /**
   * Tests if a selection text has only URI chars
   * @return {boolean}
   */
  function guess(aSelection) {
    return isURIC(aSelection.toString());
  }

  /**
   * Retrieves array of URL-like strings from a range text
   * @return {array|null}
   *   if no match is found returns null
   */
  function grab(aRange) {
    return match(encodeToPlain(aRange));
  }

  /**
   * Gets a range string which its zenkaku URIC is converted into hankaku
   * @return {string}
   */
  function map(aRange) {
    return normalize(aRange.toString());
  }

  /**
   * Makes good URL
   * @return {string}
   */
  function fix(aStr) {
    return aStr.
      replace(/^[^s:\/]+(s?:\/)/, 'http$1').
      replace(/^www\./, 'http://www.').
      // we may pick up a separator character unrelated to a URL
      replace(/[()]?[.,:;]?$/, '');
  }

  return {
    guess: guess,
    grab: grab,
    map: map,
    fix: fix
  }
})();


//********** Functions

function TextLink_init() {
  addEvent([gBrowser.mPanelContainer, 'dblclick', handleEvent, false]);
}

function handleEvent(aEvent) {
  if (aEvent.shiftKey || aEvent.ctrlKey)
    return;

  var doc = aEvent.originalTarget.ownerDocument;
  if (!isTextDocument(doc))
    return;

  var selection = doc.defaultView.getSelection();
  var URL = findURL(doc, selection);

  if (URL) {
    selection.removeAllRanges();
    openTab(URL);
  }
}

function findURL(aDocument, aSelection) {
  var URL = '';

  if (!aSelection || !mURLUtil.guess(aSelection))
    return URL;

  // make a target range with a source selection
  var range = aDocument.createRange();
  range.selectNode(aDocument.documentElement);
  // update the target range and get the position of the source selection
  // in the target range
  var position = initRange(range, aSelection.getRangeAt(0));

  // retrieve array of URL-like strings from the target range
  var URLs = mURLUtil.grab(range);
  if (!URLs)
    return URL;

  // scan the position of a URL in the target range
  var map = mURLUtil.map(range);
  var start, end = 0;
  URLs.some(function(url) {
    start = map.indexOf(url, end);
    end = start + url.length;

    // if the URL contains the source selection, we got it
    if (position.start < end && start < position.end) {
      URL = mURLUtil.fix(url);
      return true;
    }
    return false;
  });

  return URL;
}

function initRange(aRange, aSourceRange) {
  function expand(aXPath, aNode, aCount) {
    const kCharsBuffer = 256;
    var node = aNode;
    var border = node;
    var count = aCount;
    var text;

    while (count < kCharsBuffer) {
      node = $X(aXPath, node);
      if (!node)
        break;
      border = node;

      text = node.textContent;
      count += text.length;

      // white-space marks off the URL string
      if (/\s/.test(text))
        break;
    }

    return {border: border, count: count};
  }

  // expand range before the source selection
  var result = expand(
    'preceding::text()[1]',
    aSourceRange.startContainer,
    aSourceRange.startOffset
  );

  aRange.setStartBefore(result.border);

  // store the source position
  var startPos = result.count;
  var endPos = startPos + aSourceRange.toString().length;

  // expand range after the source selection
  result = expand(
    'following::text()[1]',
    aSourceRange.endContainer,
    aSourceRange.endContainer.textContent.length - aSourceRange.endOffset
  );

  aRange.setEndAfter(result.border);

  return {start: startPos, end: endPos};
}


//********** Utilities

/**
 * hankaku / zenkaku converter for ASCII printable characters
 * 94 characters:
 * !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`
 * abcdefghijklmnopqrstuvwxyz{|}~
 * hankaku: 0x0021-0x007E
 * zenkaku: 0xFF01-0xFF5E
 * @note cf. http://taken.s101.xrea.com/blog/article.php?id=510
 */
function han2zen(aChar) {
  var code = aChar.charCodeAt(0);
  code += 0xFEE0; // 0021->FF01
  return String.fromCharCode(code);
}

function zen2han(aChar) {
  var code = aChar.charCodeAt(0);
  code &= 0x007F; // FF01->0001
  code += 0x0020;
  return String.fromCharCode(code);
}

function encodeToPlain(aRange) {
  const {Cc, Ci} = window;

  var encoder =
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

function isTextDocument(aDoc) {
  // @see chrome://browser/content/browser.js::mimeTypeIsTextBased
  return aDoc && window.mimeTypeIsTextBased(aDoc.contentType);
}


//********** Imports

function $X(aXPath, aNode)
  window.ucjsUtil.getFirstNodeByXPath(aXPath, aNode);

function addEvent(aData)
  window.ucjsUtil.setEventListener(aData);

function openTab(aURL)
  window.ucjsUtil.openTab(aURL, {relatedToCurrent: true});

function log(aMsg)
  window.ucjsUtil.logMessage('TextLink.uc.js', aMsg);


//********** Entry point

TextLink_init();


})(this);
