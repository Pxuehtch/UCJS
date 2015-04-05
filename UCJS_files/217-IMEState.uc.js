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
  getNodeById: $ID,
  setChromeStyleSheet: setCSS
} = window.ucjsUtil;

// For debugging.
function log(aMsg) {
  return window.ucjsUtil.logMessage('IMEState.uc.js', aMsg);
}

/**
 * UI setting.
 */
const kUI = {
  signPanel: {
    id: 'ucjs_IMEState_panel',
    animationName: 'ucjs_IMEState_panelAnimation'
  },

  IMESign: {
    'ON': 'あ',
    'OFF': 'A'
  }
};

function IMEState_init() {
  // @note Use the capture mode to surely catch the event in the content area.
  addEvent(window, 'click', handleEvent, true);
  addEvent(window, 'keyup', handleEvent, true);

  addEvent(gBrowser, 'select', handleEvent, false);
  addEvent(gBrowser, 'pageshow', handleEvent, false);

  addEvent(window, 'unload', handleEvent, false);
}

function handleEvent(aEvent) {
  switch (aEvent.type) {
    case 'click':
    case 'select':
    case 'pageshow': {
      // Show a sign if focused on an editable field, otherwise clear.
      SignPanel.update();

      break;
    }

    case 'keyup': {
      // Update a sign if IME toggled, otherwise clear forcibly.
      //
      // TODO: Detect the <Caps Lock> key for opening IME. But the key can be
      // found for closing IME in my case ('Hiragana' is detected).
      let IMEkeys = [
        'Hankaku',
        'Zenkaku',
        'Alphanumeric',
        'Convert',
        'Hiragana'
      ];

      SignPanel.update({
        doClear: IMEkeys.indexOf(aEvent.key) < 0
      });

      break;
    }

    case 'unload': {
      SignPanel.uninit();

      break;
    }
  }
}

/**
 * Sign panel handler.
 */
const SignPanel = (function() {
  /**
   * Animation manager.
   *
   * Accentuates a panel for clear visibility.
   */
  const Animation = {
    init() {
      let {id, animationName} = kUI.signPanel;

      setCSS(`
        #${id} {
          animation: ${animationName} 1s infinite alternate;
        }
        @keyframes ${animationName} {
          from {
            color: rgba(255, 0, 0, 0.2);
          }
          to {
            color: rgba(255, 0, 0, 0.8);
          }
        }
      `);
    },

    start() {
      // Start animation from the beginning.
      getPanel().style.animation = '';
    },

    stop() {
      // Suppress animation.
      getPanel().style.animation = 'none';
    }
  };

  /**
   * Debounce showing manager.
   *
   * Guarantees that a callback function |show()| is executed only once at the
   * very end of a series of calls until the delay period expires.
   */
  const ShowingManager = {
    set() {
      this.clear();
      this.timerID = setTimeout(show, 100);
    },

    clear() {
      if (this.timerID) {
        clearTimeout(this.timerID);
        this.timerID = null;
      }
    }
  };

  function getPanel() {
    let {id} = kUI.signPanel;

    let panel = $ID(id);

    if (panel) {
      return panel;
    }

    Animation.init();

    return $ID('mainPopupSet').appendChild($E('tooltip', {
      id
    }));
  }

  function uninit() {
    update({
      doClear: true
    });
  }

  function update(aOption = {}) {
    let {doClear} = aOption;

    // Hide an existing panel.
    hide();

    if (doClear) {
      ShowingManager.clear();
    }
    else {
      ShowingManager.set();
    }
  }

  function show() {
    let target = getTargetElement();

    if (!target) {
      return;
    }

    let panel = getPanel();

    panel.label = kUI.IMESign[isIMEActive(target) ? 'ON' : 'OFF'];

    panel.openPopup(target, 'before_start');

    Animation.start();
  }

  function hide() {
    let panel = getPanel();

    panel.hidePopup();

    Animation.stop();
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
      getComputedStyle(aNode).imeMode;

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
    uninit,
    update
  };
})();

/**
 * Entry point.
 */
IMEState_init();


})(this);
