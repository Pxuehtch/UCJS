// ==UserScript==
// @name        IMEAware.uc.js
// @description Indicates the state of IME in a textbox
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note cf. https://github.com/Griever/userChromeJS/blob/master/IME-Colors.uc.js


(function() {


"use strict";


/**
 * CSS styles of a textbox
 * @note Keys are linked with the return value of
 *   mIMEAwareHandler.getIMEState()
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
 * Main handler
 */
var mIMEAwareHandler = {
  init: function(aNode) {
    this.uninit();

    this.isXBL = aNode.hasAttribute('anonid');
    this.textbox = this.isXBL ?
      $X1('ancestor::*[local-name()="textbox"]', aNode) : aNode;
    this.defaultStyle = this.textbox.getAttribute('style');
    this.IMEState = this.getIMEState();

    this.setStyle();

    // observe key events of IME keys
    this.textbox.addEventListener('keydown', this, false);
    this.textbox.addEventListener('keyup', this, false);
    // observe events for finalization
    // sometimes 'blur' unfires (e.g. when a page changes its location with
    // a shortcut key)
    this.textbox.addEventListener('blur', this, false);
    if (this.textbox.ownerDocument instanceof HTMLDocument) {
      this.textbox.ownerDocument.defaultView.
      addEventListener('pagehide', this, false);
    }
  },

  uninit: function() {
    if (!this.textbox)
      return;

    /**
     * WORKAROUND: avoid 'TypeError: can't access dead object'
     * I saw this error once, but not reproducible. so wait and see
     */
    try {
      this.textbox.removeEventListener('keydown', this, false);
      this.textbox.removeEventListener('keyup', this, false);
      this.textbox.removeEventListener('blur', this, false);
      if (this.textbox.ownerDocument instanceof HTMLDocument) {
        this.textbox.ownerDocument.defaultView.
        removeEventListener('pagehide', this, false);
      }

      this.restoreStyle();
    } catch (e) {
      log(e.massage);
    }

    delete this.isXBL;
    delete this.textbox;
    delete this.defaultStyle;
    delete this.IMEState;
  },

  updateStyle: function() {
    if (!this.textbox)
      return;

    var ime = this.getIMEState();
    if (this.IMEState === ime)
      return;
    this.IMEState = ime;

    this.setStyle();
  },

  setStyle: function() {
    var styleSet = kStyleSet[this.IMEState];
    var style = this.textbox.style;

    if (!('background-image' in styleSet) && 'background-color' in styleSet) {
      style.setProperty('background-image', 'none', 'important');
    }

    for (let key in styleSet) {
      style.setProperty(key, styleSet[key], 'important');
    }

    if (this.isXBL) {
      style.setProperty('-moz-appearance', 'none', 'important');
    }
  },

  restoreStyle: function() {
    if (this.defaultStyle !== null) {
      this.textbox.setAttribute('style', this.defaultStyle);
    } else {
      this.textbox.removeAttribute('style');
    }
  },

  /**
   * Gets the current state of IME
   * @return key in kStyleSet
   */
  getIMEState: function() {
    var win = this.textbox.ownerDocument.defaultView;
    if (win) {
      let imeMode = win.getComputedStyle(this.textbox, null).imeMode;
      let utils = win.QueryInterface(Ci.nsIInterfaceRequestor).
        getInterface(Ci.nsIDOMWindowUtils);

      if (imeMode !== 'disabled' &&
          utils.IMEStatus === utils.IME_STATUS_ENABLED) {
        return utils.IMEIsOpen ? 'ON' : 'OFF';
      }
    }
    return 'DISABLED';
  },

  delayedUpdateStyle: function() {
    if (this._delayedUpdateStyleTimer) {
      clearTimeout(this._delayedUpdateStyleTimer);
      delete this._delayedUpdateStyleTimer;
    }

    // ensure that IMEStatus is ready
    this._delayedUpdateStyleTimer = setTimeout(this.updateStyle.bind(this), 0);
  },

  handleEvent: function(aEvent) {
    aEvent.stopPropagation();

    switch (aEvent.type) {
      case 'keydown':
        // '半角全角', 'カタカナひらがな':
        // * sometimes 'keyup' event unfires
        // * keyCode is 0
        // in detail
        // * 'keyup' unfires when a key is released
        // * 'keyup'->'keydown' fire when a key is pressed down
        // * the first 'keyup' unfires when pressed down just after focusing
        //   on a textbox
        if (aEvent.keyCode === 0) {
          this.delayedUpdateStyle();
        }
        break;
      case 'keyup':
        // 'Alt+半角全角': 25(VK_KANJI)
        // '変換': 28(VK_CONVERT)
        // '無変換': 29(VK_NONCONVERT)
        let keyCode = aEvent.keyCode;
        if (keyCode === 25 || keyCode === 28 || keyCode === 29) {
          this.delayedUpdateStyle();
        }
        break;
      case 'blur':
      case 'pagehide':
        this.uninit();
        break;
    }
  }
};


// Utilities

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function $X1(aXPath, aNode)
  ucjsUtil.getFirstNodeByXPath(aXPath, aNode);

function log(aMsg)
  ucjsUtil.logMessage('IMEAware.uc.js', aMsg);


// Entry point

function IMEAware_init() {
  function onFocus(aEvent) {
    var node = aEvent.originalTarget;
    if ((node instanceof HTMLTextAreaElement ||
        (node instanceof HTMLInputElement &&
         /^(?:text|search)$/.test(node.type))) &&
        !node.readOnly) {
      mIMEAwareHandler.init(node);
    }
  }

  function onUnload(aEvent) {
    mIMEAwareHandler.uninit();
  }

  addEvent([document.documentElement, 'focus', onFocus, true]);
  addEvent([window, 'unload', onUnload, false]);
}

IMEAware_init();


})();
