// ==UserScript==
// @name ResetSearchPoint.uc.js
// @description Resets the start point to "Find again" between frames/textboxes
// @include main
// ==/UserScript==

// @require Util.uc.js

/**
 * @usage the next find again will start from the point with "double-click"
 * @note in the same frame/textbox, the point is reset with "single-click" by
 * default behavior
 */


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  addEvent,
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('ResetSearchPoint.uc.js', aMsg);
}

function ResetSearchPoint_init() {
  addEvent(gBrowser.mPanelContainer, 'dblclick', handleEvent, false);
}

function handleEvent(aEvent) {
  aEvent.stopPropagation();

  if (aEvent.button !== 0) {
    return;
  }

  let clickManager = getClickManager(aEvent.target),
      fastFind = getFastFind();

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
  getFastFind().collapseSelection();

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
  // collapses to its start
  range.collapse(true);
}

function setFastFindFor(aWindow) {
  let docShell =
    aWindow.
    QueryInterface(Ci.nsIInterfaceRequestor).
    getInterface(Ci.nsIWebNavigation).
    QueryInterface(Ci.nsIDocShell);

  getFastFind().setDocShell(docShell);
}

/**
 * Filters the useful state from a clicked element
 *
 * @param {Element}
 * @return {hash|null}
 */
function getClickManager(aElement) {
  // @see chrome://browser/content/browser.js::mimeTypeIsTextBased
  let isTextDocument = (aDocument) =>
    aDocument && window.mimeTypeIsTextBased(aDocument.contentType);

  let isContentWindow = (aWindow) =>
    aWindow && aWindow.top === window.content;

  if (!aElement ||
      !isTextDocument(aElement.ownerDocument) ||
      !isContentWindow(aElement.ownerDocument.defaultView)) {
    return null;
  }

  let isEditable =
    aElement instanceof Ci.nsIDOMNSEditableElement &&
    aElement.type !== 'submit' &&
    aElement.type !== 'image';

  let isImage = aElement instanceof HTMLImageElement;

  let isLinked = (function() {
    let node = aElement;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node instanceof HTMLAnchorElement ||
            node instanceof HTMLAreaElement ||
            node instanceof HTMLLinkElement ||
            node.getAttributeNS('http://www.w3.org/1999/xlink', 'type') ===
            'simple') {
          return true;
        }
      }
      node = node.parentNode;
    }
    return false;
  })();

  return {
    clickedWindow: aElement.ownerDocument.defaultView,
    // We handle <img> too, because clicking it is not reset the start point
    // by default.
    clickedElement: (isEditable || isImage) && !isLinked ? aElement : null
  };
}

/**
 * Gets nsITypeAheadFind of the current browser
 */
function getFastFind() {
  return gFindBar.browser.fastFind;
}

/**
 * Entry point
 */
ResetSearchPoint_init();


})(this);
