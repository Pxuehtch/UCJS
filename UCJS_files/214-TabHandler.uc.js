// ==UserScript==
// @name TabHandler.uc.js
// @description Custom handling on the tab bar.
// @include main
// ==/UserScript==

// @require Util.uc.js
// @require [for action] Util.uc.js, TabEx.uc.js


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
  addEvent
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('TabHandler.uc.js', aMsg);
}

/**
 * Time threshold from 'mousedown' to 'mouseup' for recognition of the custom
 * click
 * @value {integer} millisecond
 *
 * @note The default click is deactivated at 'mouseup' in time, otherwise
 * activated.
 */
const kClickThresholdTimer = 200;

/**
 * Disable the default click action on the tab bar
 * @value {boolean}
 *   true: disabled completely
 *   false: disabled when the custom click is recognized, otherwise enabled
 *
 * @note the default actions;
 *   middle-click on a tab: closes a tab
 *   double-click on a tabbar: opens a new tab
 *   middle-click on a tabbar: opens a new tab
 *   @see chrome://browser/content/tabbrowser.xml::
 *     <binding id="tabbrowser-tabs">::
 *     <handler event="dblclick">
 *     <handler event="click">
 */
const kDisableDefaultClick = true;

/**
 * Handler of the click event on the tab bar
 */
var mTabBarClickEvent = {
  clearState: function() {
    this.state.target   = null;
    this.state.button   = 0;
    this.state.ctrlKey  = false;
    this.state.altKey   = false;
    this.state.shiftKey = false;
    this.state.clicks   = 0;
    this.state.area     = '';
  },

  init: function() {
    this.state = {};
    this.clearState();
    this.handled = false;

    var tc = gBrowser.tabContainer;
    addEvent(tc, 'mousedown', this, true);
    addEvent(tc, 'mouseup', this, true);
    addEvent(tc, 'click', this, true);
    addEvent(tc, 'dblclick', this, true);
  },

  handleEvent: function(aEvent) {
    // 1.show the default contextmenu
    // 2.do not handle an UI element(button/menu) on the tab bar
    if (aEvent.button === 2 ||
        !this.checkTargetArea(aEvent)) {
      return;
    }

    switch (aEvent.type) {
      case 'mousedown':
        this.onMouseDown(aEvent);
        break;
      case 'mouseup':
        this.onMouseUp(aEvent);
        break;
      case 'click':
      case 'dblclick':
        if (kDisableDefaultClick ||
            this.handled) {
          aEvent.preventDefault();
          aEvent.stopPropagation();
        }
        break;
    }
  },

  get idledMouseDown() {
    return !!this.mouseDownTimer;
  },

  set idledMouseDown(aVal) {
    if (aVal === true) {
      this.mouseDownTimer = setTimeout(function() {
        this.idledMouseDown = false;
      }.bind(this), kClickThresholdTimer);
    } else if (aVal === false) {
      clearTimeout(this.mouseDownTimer);
      this.mouseDownTimer = null;
    }
  },

  get idledMouseUp() {
    return !!this.mouseUpTimer;
  },

  set idledMouseUp(aVal) {
    if (aVal === true) {
      this.mouseUpTimer = setTimeout(function() {
        this.idledMouseUp = false;
        this.doAction();
        this.handled = false;
      }.bind(this), kClickThresholdTimer);
    } else if (aVal === false) {
      clearTimeout(this.mouseUpTimer);
      this.mouseUpTimer = null;
    }
  },

  onMouseDown: function(aEvent) {
    this.handled = true;

    if (this.state.target &&
        !this.idledMouseUp) {
      this.clearState();
    }

    this.idledMouseUp = false;

    if (this.state.target !== aEvent.target ||
        this.state.button !== aEvent.button) {
      this.state.target   = aEvent.target;
      this.state.button   = aEvent.button;
      this.state.ctrlKey  = aEvent.ctrlKey;
      this.state.altKey   = aEvent.altKey;
      this.state.shiftKey = aEvent.shiftKey;
      this.state.clicks   = 0;
      this.state.area     = this.checkTargetArea(aEvent);
    }

    this.idledMouseDown = true;
  },

  onMouseUp: function(aEvent) {
    if (this.state.target !== aEvent.target ||
        !this.idledMouseDown) {
      this.handled = false;
      return;
    }

    this.idledMouseDown = false;
    this.state.clicks++;
    this.idledMouseUp = true;
  },

  checkTargetArea: function(aEvent) {
    var {target, originalTarget} = aEvent;

    // skip UI elements on the tab bar
    // TODO: The probable elements 'menu*|toolbar*' are examined. More other
    // items may be needed.
    if (/^(?:menu|toolbar)/.test(originalTarget.localName)) {
      return null;
    }

    // on a tab
    if (target.localName === 'tab') {
      return target.selected ? 'foreTab' : 'backTab';
    }

    // on the margin where has no tabs in the tab bar
    if (target.localName === 'tabs') {
      return 'notTabs';
    }

    // WORKAROUND: unknown case
    return null;
  },

  doAction: function() {
    var {target, button, ctrlKey, altKey, shiftKey, clicks, area} =
      this.state;

    // Left-Click / Left-Double-Click / Middle-Click
    var LC  = button === 0 && clicks === 1,
        LDC = button === 0 && clicks === 2,
        MC  = button === 1 && clicks === 1;

    // selected tab / background tab / not tabs area
    var foreTab = area === 'foreTab',
        backTab = area === 'backTab',
        notTabs = area === 'notTabs';

    switch (true) {
      case (LDC && notTabs):
        // open home pages
        // Shift: The current opened tabs are closed.
        // Ctrl: Only the first of the multiple homepages is opened.
        window.ucjsUtil.
        openHomePages({doReplace: shiftKey, onlyFirstPage: ctrlKey});
        break;
      case (MC && notTabs):
        // reopen the prev-closed tab
        // @see chrome://browser/content/browser.js::undoCloseTab
        window.undoCloseTab();
        break;
      case (LC && foreTab):
        if (ctrlKey) {
          // select/reopen the opener tab
          window.ucjsTabEx.selectOpenerTab(target, {undoClose: true});
        } else {
          // select the previous selected tab
          // Shift: select/reopen the *exact* previous selected tab
          let option = shiftKey ? {undoClose: true} : {traceBack: true};
          window.ucjsTabEx.selectPrevSelectedTab(target, option);
        }
        break;
      case (LDC && foreTab):
        // pin/unpin a tab
        if (!target.pinned) {
          gBrowser.pinTab(target);
        } else {
          gBrowser.unpinTab(target);
        }
        break;
      case (MC && (foreTab || backTab)):
        // close a tab
        window.ucjsUtil.removeTab(target, {safeBlock: true});
        break;
    }
  }
};


/**
 * Miscellaneous customization
 */
function makeCustomFunctions() {
  // cycle-select tabs with the wheel scroll on a tab or tabbar
  // @note Disables the default scrolling at overflowed.
  addEvent(gBrowser.tabContainer, 'wheel', function(event) {
    gBrowser.tabContainer.
    advanceSelectedTab((event.deltaY < 0) ? -1 : 1, true);
    event.stopPropagation();
    event.preventDefault();
  }, true);
}


//********** Entry point

function TabHandler_init() {
  mTabBarClickEvent.init();
  makeCustomFunctions();
}

TabHandler_init();


})(this);
