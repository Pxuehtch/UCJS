// ==UserScript==
// @name ResetSearchPoint.uc.js
// @description Resets the start point for <Find Again> command between frames or textboxes.
// @include main
// ==/UserScript==

// @require Util.uc.js

/**
 * @usage The next <Find Again> command will start from a point
 * *double clicked*.
 * @note In the same frame or textbox, the point is reset at a *single clicked*
 * point by Fx default behavior.
 */


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  addEvent
} = window.ucjsUtil;

// For debugging.
function log(aMsg) {
  return window.ucjsUtil.logMessage('ResetSearchPoint.uc.js', aMsg);
}

/**
 * Wrapper of the finder of the current tab.
 *
 * @see resource://gre/modules/Finder.jsm
 */
const TextFinder = {
  get finder() {
    return gBrowser.finder;
  },

  get fastFind() {
    return this.finder._fastFind;
  },

  removeSelection() {
    this.finder.removeSelection();
  }
};

function ResetSearchPoint_init() {
  // @note Use the capture mode to surely catch the event in the content area.
  addEvent(gBrowser.mPanelContainer, 'dblclick', handleEvent, true);
}

function handleEvent(aEvent) {
  if (aEvent.button !== 0) {
    return;
  }

  let clickManager = getClickManager(aEvent.target);
  let fastFind = TextFinder.fastFind;

  if (!clickManager || !fastFind) {
    return;
  }

  let {clickedWindow, clickedElement} = clickManager;
  let {currentWindow, foundEditable} = fastFind;

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
  TextFinder.removeSelection();

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

  TextFinder.fastFind.setDocShell(docShell);
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
    clickedElement: ((isEditable || isImage) && !isLinked) ? aNode : null
  };
}

/**
 * Entry point.
 */
ResetSearchPoint_init();


})(this);
