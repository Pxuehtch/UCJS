// ==UserScript==
// @name        IMEAware.uc.js
// @description Indicates the state of IME in a textbox
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @see https://github.com/Griever/userChromeJS/blob/master/IME-Colors.uc.js


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
  setEventListener: addEvent,
  getFirstNodeByXPath: $X1
} = window.ucjsUtil;

// for debug
function log(aMessage) {
  return window.ucjsUtil.logMessage('IMEAware.uc.js', aMessage);
}

/**
 * CSS styles of a textbox by IME state
 * @note the keys are linked with the return value of |getIMEState()|
 */
const kStyleSet = {
  'DISABLED': {
    'color':'black',
    'background-color':'lightgray'
  },

  'ON': {
    'color':'black',
    'background-color':'bisque'
  },

  'OFF': {
    'color':'black',
    'background-color':'lightcyan'
  }
};

/**
 * Initialization
 */
function IMEAware_init() {
  let mTextboxStyler = TextboxStyler();

  // observe a focused element in the chrome and content area
  // @note use the capture mode for event delegation
  addEvent([window.document.documentElement, 'focus', (aEvent) => {
    let node = aEvent.originalTarget;
    // pick up a writable plain-text field
    if (
      (node instanceof HTMLTextAreaElement ||
       (node instanceof HTMLInputElement &&
        /^(?:text|search)$/.test(node.type))) &&
      !node.readOnly
    ) {
      mTextboxStyler.init(node);
    }
  }, true]);

  // clean-up when a browser window closes
  addEvent([window, 'unload', (aEvent) => {
    mTextboxStyler.uninit();
    mTextboxStyler = null;
  }, false]);
}

/**
 * Handler of the styling of a textbox by IME state
 * @return {hash}
 *   @member init {function}
 *   @member uninit {function}
 */
function TextboxStyler() {
  let mTextbox;
  let mDefaultStyle;
  let mIMEState;

  /**
   * Debounced update styles
   * guarantees that a callback function is executed only once at the very
   * end of a series of calls until the delay period expires
   */
  const StyleUpdater = {
    set: function() {
      let delay = 100;

      this.clear();
      this.timerID = setTimeout(updateStyle, delay);
    },

    clear: function() {
      if (this.timerID) {
        clearTimeout(this.timerID);
        this.timerID = null;
      }
    }
  };

  function init(aNode) {
    // clean-up existing handler
    uninit();

    mTextbox = aNode.hasAttribute('anonid') ?
      $X1('ancestor::*[local-name()="textbox"]', aNode) :
      aNode;
    mDefaultStyle = mTextbox.getAttribute('style') || null;
    mIMEState = getIMEState();

    setStyle();

    // observe key events of IME keys
    mTextbox.addEventListener('keyup', handleEvent, false);
    // 'keyup' is not occur when IME is turned off during the conversion
    mTextbox.addEventListener('compositionend', handleEvent, false);

    // observe events for clean-up
    // 'blur' will raise also before a page unloads
    mTextbox.addEventListener('blur', handleEvent, false);
    // watch 'pagehide' of a content window for when 'blur' unfired (e.g.
    // a page navigation with shortcut key)
    if (!inChromeWindow()) {
      mTextbox.ownerDocument.defaultView.
      addEventListener('pagehide', handleEvent, false);
    }
  }

  function uninit() {
    if (checkValidity()) {
      mTextbox.removeEventListener('keyup', handleEvent, false);
      mTextbox.removeEventListener('compositionend', handleEvent, false);

      mTextbox.removeEventListener('blur', handleEvent, false);
      if (!inChromeWindow()) {
        mTextbox.ownerDocument.defaultView.
        removeEventListener('pagehide', handleEvent, false);
      }

      restoreStyle();
    }

    mTextbox = null;
    mDefaultStyle = null;
    mIMEState = null;
    StyleUpdater.clear();
  }

  function updateStyle() {
    if (!checkValidity()) {
      return;
    }

    let ime = getIMEState();
    if (mIMEState === ime) {
      return;
    }
    mIMEState = ime;

    setStyle();
  }

  function setStyle() {
    let styleSet = kStyleSet[mIMEState];
    let style = mTextbox.style;

    if (!('background-image' in styleSet) && 'background-color' in styleSet) {
      style.setProperty('background-image', 'none', 'important');
    }

    for (let key in styleSet) {
      style.setProperty(key, styleSet[key], 'important');
    }

    if (inChromeWindow()) {
      style.setProperty('-moz-appearance', 'none', 'important');
    }
  }

  function restoreStyle() {
    if (mDefaultStyle !== null) {
      mTextbox.setAttribute('style', mDefaultStyle);
    } else {
      mTextbox.removeAttribute('style');
    }
  }

  function inChromeWindow() {
    return mTextbox.ownerDocument.defaultView.top === window;
  }

  /**
   * checks whether a target textbox is alive
   * @return {boolean}
   *
   * TODO: this is a workaround for checking a dead object. consider a
   * legitimate method instead.
   */
  function checkValidity() {
    const {Cu} = window;

    try {
      return !!(mTextbox && Cu.getWeakReference(mTextbox).get());
    } catch (ex) {}
    return false;
  }

  /**
   * gets the current state of IME
   * @return {string} key in |kStyleSet|
   */
  function getIMEState() {
    const {Ci} = window;

    let win = mTextbox.ownerDocument.defaultView;
    if (win) {
      let imeMode = win.getComputedStyle(mTextbox, null).imeMode;
      let utils = win.
        QueryInterface(Ci.nsIInterfaceRequestor).
        getInterface(Ci.nsIDOMWindowUtils);

      if (imeMode !== 'disabled' &&
          utils.IMEStatus === utils.IME_STATUS_ENABLED) {
        return utils.IMEIsOpen ? 'ON' : 'OFF';
      }
    }
    return 'DISABLED';
  }

  function handleEvent(aEvent) {
    aEvent.stopPropagation();

    switch (aEvent.type) {
      case 'keyup':
        // TODO: use |aEvent.key| because |aEvent.keyCode| is deprecated
        // XXX: I want to avoid making row of key names if using |aEvent.key|
        // @see https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent
        let keyCode = aEvent.keyCode;

        // check IME related keys
        if ((0x15 <= keyCode && keyCode <= 0x20) ||
            (0xF0 <= keyCode && keyCode <= 0xF6)) {
          StyleUpdater.set();
        }
        break;
      case 'compositionend':
        StyleUpdater.set();
        break;
      case 'blur':
      case 'pagehide':
        uninit();
        break;
    }
  }

  return {
    init: init,
    uninit: uninit
  };
}

/**
 * Entry point
 */
IMEAware_init();


})(this);
