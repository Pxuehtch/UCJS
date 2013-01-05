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
 * CSS styles of a textbox
 * @note The keys are linked with the return value of |getIMEState()|
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

    // define new members
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
    this.textbox.addEventListener('blur', this, false);
    // watch 'pagehide' of a content window for when 'blur' unfired (e.g.
    // a page navigation with a shortcut key)
    if (this.textbox.ownerDocument instanceof HTMLDocument) {
      this.textbox.ownerDocument.defaultView.
      addEventListener('pagehide', this, false);
    }
  },

  uninit: function() {
    if (this.checkValidity()) {
      this.textbox.removeEventListener('keydown', this, false);
      this.textbox.removeEventListener('keyup', this, false);
      this.textbox.removeEventListener('blur', this, false);
      if (this.textbox.ownerDocument instanceof HTMLDocument) {
        this.textbox.ownerDocument.defaultView.
        removeEventListener('pagehide', this, false);
      }

      this.restoreStyle();
    }

    delete this.isXBL;
    delete this.textbox;
    delete this.defaultStyle;
    delete this.IMEState;
  },

  updateStyle: function() {
    if (this._delayedUpdateStyleTimer) {
      clearTimeout(this._delayedUpdateStyleTimer);
      delete this._delayedUpdateStyleTimer;
    }

    // delay and ensure that IMEStatus is ready
    this._delayedUpdateStyleTimer = setTimeout(function() {
      if (!this.checkValidity()) {
        return;
      }

      var ime = this.getIMEState();
      if (this.IMEState === ime) {
        return;
      }
      this.IMEState = ime;

      this.setStyle();
    }.bind(this), 0);
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
   * checks whether a target textbox is alive
   * @return {boolean}
   */
  checkValidity: function() {
    try {
      return !!(this.textbox &&
        window.Cu.getWeakReference(this.textbox).get());
    } catch (e) {}
    return false;
  },

  /**
   * gets the current state of IME
   * @return {string} key in kStyleSet
   */
  getIMEState: function() {
    const {Ci} = window;

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

  handleEvent: function(aEvent) {
    aEvent.stopPropagation();

    switch (aEvent.type) {
      case 'keydown':
        // '半角全角', 'カタカナひらがな':
        // 1.'keyup' unfires when a key is released
        // 2.'keyup' fires and then 'keydown' fires when a key is pressed down
        // 3.the first 'keyup' unfires at a key pressed down just after on
        //   focusing a textbox
        // 4.in fx15: the keycode is not 229(VK_PROCESSKEY) but 0(Unidentified)
        if (aEvent.keyCode === 0) {
          this.updateStyle();
        }
        break;
      case 'keyup':
        // 'Alt+半角全角': 25(VK_KANJI)
        // '変換': 28(VK_CONVERT)
        // '無変換': 29(VK_NONCONVERT)
        let keyCode = aEvent.keyCode;
        if (keyCode === 25 || keyCode === 28 || keyCode === 29) {
          this.updateStyle();
        }
        break;
      case 'blur':
      case 'pagehide':
        this.uninit();
        break;
    }
  }
};


//********** Imports

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function $X1(aXPath, aNode) {
  return window.ucjsUtil.getFirstNodeByXPath(aXPath, aNode);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('IMEAware.uc.js', aMsg);
}


//********** Entry point

function IMEAware_init() {
  function onFocus(aEvent) {
    var node = aEvent.originalTarget;
    if (
      (node instanceof HTMLTextAreaElement ||
       (node instanceof HTMLInputElement &&
        /^(?:text|search)$/.test(node.type))) &&
      !node.readOnly
    ) {
      mIMEAwareHandler.init(node);
    }
  }

  function onUnload(aEvent) {
    mIMEAwareHandler.uninit();
  }

  addEvent([window.document.documentElement,
    'focus', onFocus, true]);
  addEvent([window,
    'unload', onUnload, false]);
}

IMEAware_init();


})(this);
