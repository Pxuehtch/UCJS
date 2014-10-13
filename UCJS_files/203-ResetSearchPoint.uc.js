// ==UserScript==
// @name ResetSearchPoint.uc.js
// @description Resets the start point for <Find Again> command between frames or textboxes.
// @include main
// ==/UserScript==

// @require Util.uc.js

/**
 * @usage The next find again will start from the point with "double-clicking".
 * @note In the same frame/textbox, the point is reset with "single-clicking"
 * by Fx default behavior.
 */


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  addEvent
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('ResetSearchPoint.uc.js', aMsg);
}

function ResetSearchPoint_init() {
  addEvent(gBrowser.mPanelContainer, 'dblclick', handleEvent, false);
}

function handleEvent(aEvent) {
  if (aEvent.button !== 0) {
    return;
  }

  let clickManager = getClickManager(aEvent.target),
      fastFind = getFinder()._fastFind;

  if (!clickManager || !fastFind) {
    return;
  }

  let {clickedWindow, clickedElement} = clickManager,
      {currentWindow, foundEditable} = fastFind;

  if (currentWindow !== clickedWindow ||
      foundEditable !== clickedElement) {
    if (foundEditable) {
      clearSelection(foundEditable);
    }

    if (clickedElement) {
      setSelection(clickedElement, clickedWindow);
    }

    if (currentWindow !== clickedWindow ||
        foundEditable) {
      setFastFindFor(clickedWindow);
    }
  }
}

function clearSelection(aEditable) {
  let editor = aEditable.editor;
  let selection = editor && editor.selection;

  if (selection && selection.rangeCount) {
    selection.removeAllRanges();
  }
}

function setSelection(aElement, aWindow) {
  getFinder().removeSelection();

  let selection = aWindow.getSelection();
  let range = null;

  if (selection.rangeCount) {
    range = selection.getRangeAt(0);
  }
  else {
    range = aWindow.document.createRange();
    selection.addRange(range);
  }

  range.selectNode(aElement);
  // Collapses to its start.
  range.collapse(true);
}

function setFastFindFor(aWindow) {
  let docShell =
    aWindow.
    QueryInterface(Ci.nsIInterfaceRequestor).
    getInterface(Ci.nsIWebNavigation).
    QueryInterface(Ci.nsIDocShell);

  getFinder()._fastFind.setDocShell(docShell);
}

/**
 * Filters the useful state from a clicked element.
 *
 * @param {Element}
 * @return {hash|null}
 */
function getClickManager(aNode) {
  // @see chrome://browser/content/browser.js::mimeTypeIsTextBased
  let isTextDocument = (aDocument) =>
    aDocument && window.mimeTypeIsTextBased(aDocument.contentType);

  let isContentWindow = (aWindow) =>
    aWindow && aWindow.top === window.content;

  if (!aNode ||
      !isTextDocument(aNode.ownerDocument) ||
      !isContentWindow(aNode.ownerDocument.defaultView)) {
    return null;
  }

  let isEditable =
    aNode instanceof Ci.nsIDOMNSEditableElement &&
    aNode.type !== 'submit' &&
    aNode.type !== 'image';

  let isImage = aNode instanceof HTMLImageElement;

  let isLinked = (function() {
    const XLinkNS = 'http://www.w3.org/1999/xlink';

    // @note The initial node may be a text node.
    let node = aNode;

    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node instanceof HTMLAnchorElement ||
            node instanceof HTMLAreaElement ||
            node instanceof HTMLLinkElement ||
            node.getAttributeNS(XLinkNS, 'type') === 'simple') {
          return true;
        }
      }

      node = node.parentNode;
    }

    return false;
  })();

  return {
    clickedWindow: aNode.ownerDocument.defaultView,
    // @note We also handle an image element since the start point of finding
    // is not reset by clicking it.
    clickedElement: (isEditable || isImage) && !isLinked ? aNode : null
  };
}

/**
 * Gets the finder of the current browser.
 */
function getFinder() {
  return gBrowser.finder;
}

/**
 * Entry point.
 */
ResetSearchPoint_init();


})(this);
