// ==UserScript==
// @name IMEState.uc.js
// @description Shows a state of IME on an editable field.
// @include main
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
 * UI setting.
 */
const kUI = {
  signPanel: {
    id: 'ucjs_IMEState_panel'
  },

  IMESign: {
    'ON': 'あ',
    'OFF': 'A'
  }
};

function IMEState_init() {
  addEvent(window, 'click', handleEvent, false);
  addEvent(window, 'keyup', handleEvent, false);
  addEvent(window, 'unload', handleEvent, false);

  addEvent(gBrowser, 'pageshow', handleEvent, false);
  addEvent(gBrowser, 'select', handleEvent, false);
}

function handleEvent(aEvent) {
  switch (aEvent.type) {
    case 'click':
    case 'pageshow':
    case 'select':
      // Show a sign if focused on an editable field, otherwise clear.
      SignPanel.update();

      break;

    case 'keyup': {
      // Update a sign if IME toggled, otherwise clear forcibly.
      //
      // TODO: Detect the <Caps Lock> key for opening IME. But the key can be
      // found for closing IME in my case ('Hiragana' is detected).
      //
      // TODO: In Fx33, some key values are considered deprecated and warned
      // in the web console. They will be changed in Fx34 to comply with the
      // latest DOM3 spec.
      // @see https://bugzilla.mozilla.org/show_bug.cgi?id=1024864
      // @see https://bugzilla.mozilla.org/show_bug.cgi?id=900372
      let IMEkeys = [
        'HalfWidth', // will be 'Hankaku'
        'FullWidth', // will be 'Zenkaku'
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
 * Sign panel handler.
 */
const SignPanel = (function() {
  /**
   * Debounced showing manager.
   *
   * Guarantees that a callback function |show()| is executed only once at the
   * very end of a series of calls until the delay period expires.
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
    let panel = $ID(kUI.signPanel.id);

    if (panel) {
      return panel;
    }

    return $ID('mainPopupSet').appendChild($E('tooltip', {
      id: kUI.signPanel.id
    }));
  }

  function uninit() {
    ShowingManager.clear();
  }

  function update(aDoClear) {
    // Hide an existing panel.
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

      panel.label = kUI.IMESign[isIMEActive(target) ? 'ON' : 'OFF'];

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

    // A content document in design mode.
    // TODO: Test the read only attribute.
    if (focusedWindow.document instanceof HTMLDocument) {
      if (focusedElement && focusedElement.isContentEditable) {
        return focusedElement;
      }

      if (focusedWindow.document.designMode === 'on') {
        return focusedWindow.document.documentElement;
      }
    }

    // A writable plain-text input field.
    // @note Including inputs in the chrome area (e.g. URLbar).
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
   * Tests whether the IME is active or not.
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
 * Entry point.
 */
IMEState_init();


})(this);
