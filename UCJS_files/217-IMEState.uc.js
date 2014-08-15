// ==UserScript==
// @name        IMEState.uc.js
// @description Shows a state of IME on an editable field
// @include     main
// ==/UserScript==

// @require Util.uc.js


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  Timer: {
    setTimeout,
    clearTimeout
  },
  addEvent,
  createNode: $E,
  getNodeById: $ID
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('IMEState.uc.js', aMsg);
}

/**
 * Sign with IME state
 */
const kIMESign = {
  'ON': 'あ',
  'OFF': 'A'
};

/**
 * Identifier
 */
const kID = {
  panel: 'ucjs_IMEState_panel'
};

/**
 * Main
 */
function IMEState_init() {
  addEvent(window, 'click', handleEvent, false);
  addEvent(window, 'keyup', handleEvent, false);
  addEvent(window, 'unload', handleEvent, false);

  addEvent(gBrowser, 'pageshow', handleEvent, false);
  addEvent(gBrowser, 'select', handleEvent, false);
}

function handleEvent(aEvent) {
  aEvent.stopPropagation();

  switch (aEvent.type) {
    case 'click':
    case 'pageshow':
    case 'select':
      // show a sign if focused on an editable field, otherwise clear
      SignPanel.update();
      break;

    case 'keyup': {
      // update a sign if IME toggled, otherwise clear
      // TODO: detect a 'Caps Lock' key for opening IME. but the key can be
      // found for closing IME ('Hiragana' in my case)
      let IMEkeys = [
        'HalfWidth',
        'FullWidth',
        'Alphanumeric',
        'Convert',
        'Hiragana'
      ];

      let doClear = IMEkeys.indexOf(aEvent.key) < 0;

      SignPanel.update(doClear);

      break;
    }

    case 'unload':
      SignPanel.uninit();
      break;
  }
}

/**
 * Sign panel handler
 */
const SignPanel = (function() {
  /**
   * Debounced showing manager
   * guarantees that a callback function |show()| is executed only once at the
   * very end of a series of calls until the delay period expires
   */
  const ShowingManager = {
    set: function() {
      this.clear();
      this.timerID = setTimeout(show, 100);
    },

    clear: function() {
      if (this.timerID) {
        clearTimeout(this.timerID);
        this.timerID = null;
      }
    }
  };

  function getPanel() {
    let panel = $ID(kID.panel);

    if (panel) {
      return panel;
    }

    return $ID('mainPopupSet').appendChild($E('tooltip', {
      id: kID.panel
    }));
  }

  function uninit() {
    ShowingManager.clear();
  }

  function update(aDoClear) {
    // hide existing panel
    hide();

    if (aDoClear) {
      ShowingManager.clear();
    }
    else {
      ShowingManager.set();
    }
  }

  function show() {
    let target = getTargetElement();

    if (target) {
      let panel = getPanel();

      panel.label = kIMESign[isIMEActive(target) ? 'ON' : 'OFF'];

      panel.openPopup(target, 'before_start');
    }
  }

  function hide() {
    getPanel().hidePopup();
  }

  function getTargetElement() {
    let {focusedWindow, focusedElement} = Services.focus;

    if (!focusedWindow) {
      return null;
    }

    // a content document in design mode
    // TODO: test the read only attribute
    if (focusedWindow.document instanceof HTMLDocument) {
      if (focusedElement && focusedElement.isContentEditable) {
        return focusedElement;
      }

      if (focusedWindow.document.designMode === 'on') {
        return focusedWindow.document.documentElement;
      }
    }

    // a writable plain-text input field
    // @note including inputs in the chrome area (e.g. URLbar)
    if (focusedElement instanceof HTMLInputElement ||
        focusedElement instanceof HTMLTextAreaElement) {
      if (/^(?:text|search|textarea)$/.test(focusedElement.type) &&
          !focusedElement.readOnly) {
        return focusedElement;
      }
    }

    return null;
  }

  /**
   * test whether the IME is active or not
   *
   * @param aNode {Node}
   * @return {boolean}
   */
  function isIMEActive(aNode) {
    let imeMode = aNode.ownerDocument.defaultView.
      getComputedStyle(aNode, null).imeMode;

    let utils = window.
      QueryInterface(Ci.nsIInterfaceRequestor).
      getInterface(Ci.nsIDOMWindowUtils);

    try {
      return imeMode !== 'disabled' &&
        utils.IMEStatus === utils.IME_STATUS_ENABLED &&
        utils.IMEIsOpen;
    }
    catch (ex) {}

    return false;
  }

  return {
    uninit: uninit,
    update: update
  };
})();

/**
 * Entry point
 */
IMEState_init();


})(this);
