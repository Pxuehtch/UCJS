// ==UserScript==
// @name TextLink.uc.js
// @description Detects the unlinked URL-like text.
// @include main
// ==/UserScript==

// @require Util.uc.js

/**
 * @usage When 'double click' on a text like URL, a new tab will open in the detected URL.
 * @note If 'shift or ctrl' has been pressed, the text is selected only by the default behavior.
 */

// @note cf. http://www.cozmixng.org/repos/piro/textlink/trunk/content/textlink/globalOverlay.js


(function() {


"use strict";


/**
 * Handler of URL string.
 * @return {hash}
 *  @member guess {function}
 *  @member grab {function}
 *  @member map {function}
 *  @member fix {function}
 */
var mURLUtil = (function() {
  // URI characters.
  const kURIC = {
    basic: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_",
    mark:  "-.!~*;/?:@&=+$,%#'()"
  };

  // alias %URIC% has to be contained in [].
  var resolve = (function() {
    const re = /%URIC%/g;
    const replacement = '\\w' + kURIC.mark;

    return function(aStr) aStr.replace(re, replacement);
  })();

  var normalize = (function() {
    const zenURIC = (kURIC.basic + kURIC.mark).replace(/./g, han2zen);
    const re = RegExp('[' + zenURIC + ']', 'g');

    return function(aStr) aStr.replace(re, zen2han);
  })();

  var isURIC = (function() {
    const exURIC = '[^%URIC%]';
    const re = RegExp(resolve(exURIC));

    return function(aStr) !re.test(normalize(aStr));
  })();

  var match = (function() {
    const absolute = '(?:ps?:\\/\\/|www\\.)(?:[\\w\\-]+\\.)+[a-z]{2,}[%URIC%]*',
          relative = '\\.\\.?\\/[%URIC%]+';
    const re = RegExp(resolve(absolute + '|' + relative), 'ig');

    return function(aStr) normalize(aStr).match(re);
  })();

  function guess(aSelection) {
    var str = aSelection.toString();
    if (!str)
      return false;

    return isURIC(str);
  }

  function grab(aRange) {
    var str = encodeToPlain(aRange);
    return match(str);
  }

  function map(aRange) {
    var str = aRange.toString();
    return normalize(str);
  }

  function fix(aStr) {
    return aStr.
      replace(/^[^s:\/]+(s?:\/)/, 'http$1').
      replace(/^www\./, 'http://www.').
      replace(/[()]?[.,:;]?$/, '');
  }

  return {
    guess: guess,
    grab: grab,
    map: map,
    fix: fix
  }
})();


// Functions.

function TextLink_init() {
  addEvent([gBrowser.mPanelContainer, 'dblclick', handleEvent, false]);
}

function handleEvent(aEvent) {
  if (aEvent.shiftKey || aEvent.ctrlKey)
    return;

  var doc = aEvent.originalTarget.ownerDocument;

  if (isTextDocument(doc)) {
    openTab(scanURL(doc));
  }
}

function scanURL(aDoc) {
  var URL = '';
  var sel = aDoc.defaultView.getSelection();

  if (mURLUtil.guess(sel)) {
    let range = aDoc.createRange();
    range.selectNode(aDoc.documentElement);
    URL = pickUpURL(range, sel.getRangeAt(0));
    range.detach();

    if (URL) {
      sel.removeAllRanges();
    }
  }

  return URL;
}

function pickUpURL(aRange, aSrc) {
  var pos = initRange(aRange, aSrc);

  var URLs = mURLUtil.grab(aRange);
  if (!URLs)
    return null;

  var map = mURLUtil.map(aRange);
  var start, end = 0;

  while (URLs.length) {
    let URL = URLs.shift();
    start = map.indexOf(URL, end);
    end = start + URL.length;

    // check if the URL contains the selection.
    if (pos.start < end && start < pos.end) {
      return mURLUtil.fix(URL);
    }
  }

  return '';
}

function initRange(aRange, aSrc) {
  const kMaxBuf = 256; // max buffer is 256*2 characters.

  function expand(aXPath, aNode, aCount) {
    var node = aNode;
    var border = node;
    var count = aCount;

    while (count < kMaxBuf) {
      node = $X(aXPath, node);
      if (!node)
        break;
      border = node;

      let text = node.textContent;
      count += text.length;

      // white-space marks off the URL string.
      if (/\s/.test(text))
        break;
    }

    return {border: border, count: count};
  }

  // expand range before source selection.
  var result = expand(
    'preceding::text()[1]',
    aSrc.startContainer,
    aSrc.startOffset
  );

  aRange.setStartBefore(result.border);

  // store source position.
  var startPos = result.count;
  var endPos = startPos + aSrc.toString().length;

  // expand range after source selection.
  result = expand(
    'following::text()[1]',
    aSrc.endContainer,
    aSrc.endContainer.textContent.length - aSrc.endOffset
  );

  aRange.setEndAfter(result.border);

  return {start: startPos, end: endPos};
}


// Utilities

/**
 * hankaku / zenkaku converter
 * ASCII printable characters:
 * !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~
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
  var encoder =
    Cc['@mozilla.org/layout/documentEncoder;1?type=text/plain'].
    createInstance(Ci.nsIDocumentEncoder);

  encoder.init(
    aRange.startContainer.ownerDocument,
    'text/plain',
    encoder.OutputBodyOnly |
    encoder.OutputLFLineBreak |
    encoder.SkipInvisibleContent
  );

  encoder.setRange(aRange);

  return encoder.encodeToString();
}

function isTextDocument(aDoc) aDoc && /^(?:text|application)\/./.test(aDoc.contentType);


// Imports.

function $X(aXPath, aNode)
  ucjsUtil.getFirstNodeByXPath(aXPath, aNode);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function openTab(aURL)
  ucjsUtil.openTab(aURL, {relatedToCurrent: true});

function log(aMsg)
  ucjsUtil.logMessage('TextLink.uc.js', aMsg);


// Entry point.

TextLink_init();


})();
