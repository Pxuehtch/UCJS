// ==UserScript==
// @name IMEState.uc.js
// @description Shows a sign of IME state on an editable field.
// @include main
// ==/UserScript==

// @require Util.uc.js


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  ContentTask,
  Listeners: {
    $event,
    $page,
    $shutdown
  },
  DOMUtils: {
    $E,
    $ID
  },
  CSSUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

// Extract usual functions.
const {
  Timer: {
    setTimeout,
    clearTimeout
  }
} = Modules;

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

/**
 * UI event handler.
 */
const UIEvent = (function() {
  let isCancellerEventAttached = false;

  function init() {
    // Show a sign when a textbox is clicked.
    $event(window, 'click', handleEvent);

    // Show a sign when keys for IME are pressed or hide it for the other keys.
    $event(window, 'keyup', handleEvent);

    // Show a sign when a content page shows and a textbox is focused.
    $page('pageselect', handleEvent);
    $page('pageshow', handleEvent);

    // Make sure to clean up when the browser window closes.
    $shutdown(() => {
      detachCancellerEvent();
      SignPanel.uninit();
    });
  }

  function attachCancellerEvent() {
    if (!isCancellerEventAttached) {
      isCancellerEventAttached = true;

      // Hide a sign by the mouse wheel.
      // @note It is enough to observe this event only while the panel is open.
      // TODO: Observe the 'scroll' event.
      window.addEventListener('wheel', handleEvent);
    }
  }

  function detachCancellerEvent() {
    if (isCancellerEventAttached) {
      isCancellerEventAttached = false;

      window.removeEventListener('wheel', handleEvent);
    }
  }

  function showSign() {
    SignPanel.show();
    attachCancellerEvent();
  }

  function hideSign() {
    detachCancellerEvent();
    SignPanel.hide();
  }

  function handleEvent(event) {
    switch (event.type) {
      case 'click':
      case 'pageselect':
      case 'pageshow': {
        // Try to show a sign on a textbox.
        showSign();

        break;
      }

      case 'wheel': {
        // Hide a sign immediately.
        hideSign()

        break;
      }

      case 'keyup': {
        // Show a sign when IME is toggled with the assigned keys, or hide it
        // with the other keys.
        // TODO: Detect the <Caps Lock> key for opening IME.
        // XXX: The key can be found for closing IME ('Hiragana' in my case).
        let IMEkeys = [
          'Hankaku',
          'Zenkaku',
          'Alphanumeric',
          'Convert',
          'Hiragana'
        ];

        if (IMEkeys.includes(event.key)) {
          showSign();
        }
        else {
          hideSign();
        }

        break;
      }
    }
  }

  return {
    init
  };
})();

/**
 * Sign panel handler.
 */
const SignPanel = (function() {
  /**
   * The panel box for sign.
   */
  let panelBox;

  /**
   * Debounce showing manager.
   *
   * Guarantees that a callback function |show()| is executed only once at the
   * very end of a series of calls until the delay period expires.
   */
  const ShowingManager = {
    set() {
      this.clear();
      this.timerId = setTimeout(show, 100);
    },

    clear() {
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
    }
  };

  /**
   * Animation manager.
   */
  const Animation = {
    start() {
      // Start animation from the beginning.
      panelBox.style.animation = '';
    },

    stop() {
      // Suppress animation.
      panelBox.style.animation = 'none';
    }
  };

  // Initialization.
  init();

  function init() {
    let {id, animationName} = kUI.signPanel;

    // @note Remove the native margin of our panel to show at the right
    // position.
    CSSUtils.setChromeStyleSheet(`
      #${id} {
        margin: 0;
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

    panelBox = $ID('mainPopupSet').appendChild($E('tooltip', {
      id
    }));

    Animation.stop();

    // Determine the proper height of the panel for the first showing.
    // TODO: Implement in a more smart way.
    panelBox.label = kUI.IMESign['OFF'];
    panelBox.openPopupAtScreen(0, 0);
    setTimeout(panelBox.hidePopup, 0);
  }

  function uninit() {
    update({
      doClear: true
    });

    panelBox = null;
  }

  function show() {
    update();
  }

  function hide() {
    update({
      doClear: true
    });
  }

  function update(options = {}) {
    let {doClear} = options;

    // The panel is dead. (e.g. The browser window has been closed.)
    if (!panelBox) {
      return;
    }

    // Hide an active panel.
    hideInternal();

    if (doClear) {
      ShowingManager.clear();
    }
    else {
      ShowingManager.set();
    }
  }

  function showInternal() {
    promiseIMEState().then((nodeInfo) => {
      // No editable element is focused.
      if (!nodeInfo) {
        return;
      }

      let {isActive} = getIMEInfo();

      panelBox.label = kUI.IMESign[isActive ? 'ON' : 'OFF'];

      let {x, y} = getAnchorXY(nodeInfo);

      panelBox.openPopupAtScreen(x, y, false);

      Animation.start();
    }).
    catch(Cu.reportError);
  }

  function hideInternal() {
    if (isOpen()) {
      panelBox.hidePopup();

      Animation.stop();
    }
  }

  function isOpen() {
    return panelBox.state === 'showing' || panelBox.state === 'open';
  }

  function getAnchorXY(nodeInfo) {
    let {
      left: x,
      top: y
    } = nodeInfo.rect;

    if (nodeInfo.isContentNode) {
      let contentAreaTop = gBrowser.selectedBrowser.boxObject.screenY;

      // Set the upper limit position of the panel for the content node.
      if (y < contentAreaTop) {
        y = contentAreaTop;
      }
    }

    // The bottom of the panel is aligned along the top of the node.
    y -= panelBox.boxObject.height;

    return {x, y};
  }

  function promiseIMEState() {
    let {focusedWindow, focusedElement} = Services.focus;

    if (!focusedWindow) {
      return Promise.resolve(null);
    }

    // Focused on the chrome area.

    /**
     * WORKAROUND: Test whether focused on chrome or not for non-e10s.
     * @note Replace the test condition when e10s is enabled.
     */
    if (focusedWindow.top === window) {
    // For e10s: if (focusedElement !== gBrowser.selectedBrowser) {
      return Task.spawn(function*() {
        let node = getFocusedEditableNode(focusedElement);

        if (!node) {
          return null;
        }

        return {
          rect: getNodeRect(node)
        };
      });
    }

    // Focused on the content area.
    return ContentTask.spawn(`function*() {
      ${content_getFocusedEditableNode.toString()}
      ${content_getNodeRect.toString()}

      let node = content_getFocusedEditableNode();

      if (!node) {
        return null;
      }

      return {
        isContentNode: true,
        rect: content_getNodeRect(node)
      };
    }`);
  }

  // For chrome process only.
  function getFocusedEditableNode(focusedElement) {
    // A writable plain-text input field (e.g. URL-bar).
    if (focusedElement instanceof Ci.nsIDOMNSEditableElement &&
        /^(?:text|search|textarea)$/.test(focusedElement.type) &&
        !focusedElement.readOnly) {
      return focusedElement;
    }

    return null;
  }

  // For content process only.
  function content_getFocusedEditableNode() {
    let {focusedWindow, focusedElement} = Services.focus;

    if (!focusedWindow) {
      return null;
    }

    // A document in design mode.
    // TODO: Test the read only attribute.
    if (focusedElement && focusedElement.isContentEditable) {
      return focusedElement;
    }

    if (focusedWindow.document.designMode === 'on') {
      return focusedWindow.document.documentElement;
    }

    // A writable plain-text input field.
    if (focusedElement instanceof Ci.nsIDOMNSEditableElement &&
        /^(?:text|search|textarea)$/.test(focusedElement.type) &&
        !focusedElement.readOnly) {
      return focusedElement;
    }

    return null;
  }

  // For chrome process only.
  function getNodeRect(node) {
    return content_getNodeRect(node);
  }

  // For content process only.
  function content_getNodeRect(node) {
    const {BrowserUtils} = Modules.require('gre/modules/BrowserUtils.jsm');

    let {left, top} = BrowserUtils.getElementBoundingScreenRect(node);

    return {left, top};
  }

  function getIMEInfo() {
    let utils = window.
      QueryInterface(Ci.nsIInterfaceRequestor).
      getInterface(Ci.nsIDOMWindowUtils);

    let isActive = false;

    try {
      isActive = utils.IMEStatus === utils.IME_STATUS_ENABLED &&
                 utils.IMEIsOpen;
    }
    catch (ex) {}

    return {
      isActive
    };
  }

  return {
    uninit,
    show,
    hide
  };
})();

/**
 * Entry point.
 */
function IMEState_init() {
  UIEvent.init();
}

IMEState_init();


})(this);
