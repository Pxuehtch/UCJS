// ==UserScript==
// @name        IMEAware.uc.js
// @description Emphasizes the textbox with state of IME.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note cf. IME-Colors.uc.js by Griever http://gist.github.com/410093


(function() {


"use strict";


/**
 * CSS styles of textbox.
 * @note Keys are linked with the return value of mIMEAwareHandler.getIMEState().
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
 * Main handler.
 */
var mIMEAwareHandler = {
  init: function(aNode) {
    this.uninit();

    this.isXBL = aNode.hasAttribute('anonid');
    this.textbox = this.isXBL ? $X1('ancestor::*[local-name()="textbox"]', aNode) : aNode;
    this.defaultStyle = this.textbox.getAttribute('style');
    this.IMEState = this.getIMEState();

    this.setStyle();

    this.textbox.addEventListener('keydown', this, false);
    this.textbox.addEventListener('keyup', this, false);
    this.textbox.addEventListener('blur', this, false);
  },

  uninit: function() {
    if (!this.textbox)
      return;

    this.textbox.removeEventListener('keydown', this, false);
    this.textbox.removeEventListener('keyup', this, false);
    this.textbox.removeEventListener('blur', this, false);

    this.restoreStyle();

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

    if (!('background-image' in styleSet) && ('background-color' in styleSet)) {
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
   * Gets the current state of IME.
   * @return key in kStyleSet.
   */
  getIMEState: function() {
    var win = this.textbox.ownerDocument.defaultView;
    if (win) {
      let imeMode = win.getComputedStyle(this.textbox, null).imeMode;
      let utils = win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);

      if (imeMode !== 'disabled' && utils.IMEStatus === utils.IME_STATUS_ENABLED) {
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

    this._delayedUpdateStyleTimer = setTimeout(this.updateStyle.bind(this), 0);
  },

  handleEvent: function(aEvent) {
    aEvent.stopPropagation();

    switch (aEvent.type) {
      case 'keydown':
        // About keys for IME, 'keyup' event is dispatched when the key is down and sometimes unfired.
        // 'keydown' event is processed property. (keycode is 229 at any key for IME.)
        if (aEvent.keyCode === 229) {
          // Delay for making sure that IME is ready.
          this.delayedUpdateStyle();
        }
        break;
      case 'keyup':
        // Check IME whenever a modifier key is pressed.
        if (aEvent.keyCode < 33) {
          this.delayedUpdateStyle();
        }
        break;
      case 'blur':
        this.uninit();
        break;
    }
  }
};


// Utilities.

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function $X1(aXPath, aNode)
  ucjsUtil.getFirstNodeByXPath(aXPath, aNode);

function log(aMsg)
  ucjsUtil.logMessage('IMEAware.uc.js', aMsg);


// Entry point.

function IMEAware_init() {
  function onFocus(aEvent) {
    var node = aEvent.originalTarget;
    if ((node instanceof HTMLTextAreaElement ||
        (node instanceof HTMLInputElement && /^(?:text|search)$/.test(node.type))) &&
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
