// ==UserScript==
// @name IMEState.uc.js
// @description Shows a sign of IME state on an editable area.
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
    imeDisabled: 'ucjs_IMEState_imeDisabled'
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
    // Show a sign when an editable element is clicked or hide it for the
    // other place.
    $event(window, 'click', handleEvent);

    // Show a sign when an IME key is pressed or hide it for the other keys.
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
        // Perform by the left button click.
        if (event.type === 'click' && event.button !== 0) {
          return;
        }

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
   * Guarantees that a callback function |showInternal()| is executed only once
   * at the very end of a series of calls until the delay period expires.
   */
  const DebounceShowing = {
    set() {
      this.clear();
      this.timerId = setTimeout(showInternal, 100);
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
      this.animation = panelBox.animate(
        [
          {
            textShadow: '0 0 1px'
          },
          {
            textShadow: '0 0 10px'
          }
        ],
        {
          duration: 1000,
          direction: 'alternate',
          iterations: Infinity
        }
      );
    },

    stop() {
      if (!this.animation) {
        return;
      }

      this.animation.cancel();
      this.animation = null;
    }
  };

  // Initialize.
  init();

  function init() {
    let {id, imeDisabled} = kUI.signPanel;

    // @note Remove the native margin of our panel to show at the right
    // position.
    CSSUtils.setChromeStyleSheet(`
      #${id} {
        margin: 0;
        color: rgb(255, 0, 0);
      }
      .${imeDisabled} {
        color: rgb(100, 100, 100) !important;
      }
    `);

    panelBox = $ID('mainPopupSet').appendChild($E('tooltip', {
      id
    }));

    /**
     * Determine the proper height of the panel for the first showing.
     * WORKAROUND: Make a hidden temporary panel box with a base content.
     * TODO: Implement in a reliable way.
     */
    panelBox.label = kUI.IMESign['OFF'];
    panelBox.openPopupAtScreen(0, 0);
    panelBox.style.visibility = 'hidden';

    setTimeout(() => {
      panelBox.hidePopup();
      panelBox.style.visibility = '';
    }, 0);
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
      DebounceShowing.clear();
    }
    else {
      DebounceShowing.set();
    }
  }

  function showInternal() {
    promiseFocusedEditableNodeInfo().then((nodeInfo) => {
      // No editable element is focused.
      if (!nodeInfo) {
        return;
      }

      let {isEnabled, isActive} = getIMEInfo();

      if (!isEnabled) {
        panelBox.classList.add(kUI.signPanel.imeDisabled);
      }
      else {
        panelBox.classList.remove(kUI.signPanel.imeDisabled);
      }

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

  function promiseFocusedEditableNodeInfo() {
    let {focusedWindow, focusedElement} = Services.focus;

    if (!focusedWindow) {
      // Resolved with null as no result.
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
    // @note We can use the function for the content process.
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

    let isEnabled = false;
    let isActive = false;

    try {
      isEnabled = utils.IMEStatus === utils.IME_STATUS_ENABLED;
      isActive = isEnabled && utils.IMEIsOpen;
    }
    catch (ex) {}

    return {
      isEnabled,
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
