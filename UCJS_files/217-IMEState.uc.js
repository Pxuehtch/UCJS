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

function IMEState_init() {
  $event(window, 'click', handleEvent);
  $event(window, 'keyup', handleEvent);

  $page('pageselect', handleEvent);
  $page('pageshow', handleEvent);

  // Make sure to clean up when the browser window closes.
  $shutdown(() => {
    SignPanel.uninit();
  });
}

function handleEvent(event) {
  switch (event.type) {
    case 'click':
    case 'pageselect':
    case 'pageshow': {
      // Show a sign if an editable field is focused.
      SignPanel.update();

      break;
    }

    case 'keyup': {
      // Update the sign if IME is toggled, or clear all with the other keys.
      // TODO: Detect the <Caps Lock> key for opening IME.
      // XXX: But the key can be found for closing IME ('Hiragana' in my case).
      let IMEkeys = [
        'Hankaku',
        'Zenkaku',
        'Alphanumeric',
        'Convert',
        'Hiragana'
      ];

      SignPanel.update({
        doClear: !IMEkeys.includes(event.key)
      });

      break;
    }
  }
}

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

  function update(options = {}) {
    let {doClear} = options;

    // The panel is dead. (e.g. The browser window has been closed.)
    if (!panelBox) {
      return;
    }

    // Hide an opening panel.
    hide();

    if (doClear) {
      ShowingManager.clear();
    }
    else {
      ShowingManager.set();
    }
  }

  function show() {
    promiseIMEState().then((result) => {
      // No editable element is focused.
      if (!result) {
        return;
      }

      let {nodeInfo, isActive} = result;

      panelBox.label = kUI.IMESign[isActive ? 'ON' : 'OFF'];

      let {x, y} = getAnchorXY(nodeInfo);

      panelBox.openPopupAtScreen(x, y, false);

      Animation.start();
    }).
    catch(Cu.reportError);
  }

  function hide() {
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
      let contentAreaTop = gBrowser.mPanelContainer.boxObject.screenY;

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

        let nodeInfo = {
          rect: getNodeRect(node)
        };

        let isActive = isIMEActive(node);

        return {
          nodeInfo,
          isActive
        };
      });
    }

    // Focused on the content area.
    return ContentTask.spawn(`function*() {
      ${content_getFocusedEditableNode.toString()}
      ${content_getNodeRect.toString()}
      ${content_isIMEActive.toString()}

      let node = content_getFocusedEditableNode();

      if (!node) {
        return null;
      }

      let nodeInfo = {
        isContentNode: true,
        rect: content_getNodeRect(node)
      };

      let isActive = content_isIMEActive(node);

      return {
        nodeInfo,
        isActive
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

  // For chrome process only.
  function isIMEActive(node) {
    return content_isIMEActive(node, window);
  }

  // For content process only.
  function content_isIMEActive(node, chromeWindow) {
    let imeMode = node.
      ownerDocument.defaultView.
      getComputedStyle(node).imeMode;

    // chromeWindow: for the chrome process.
    // content: for the content process.
    let utils = (chromeWindow || content).
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
