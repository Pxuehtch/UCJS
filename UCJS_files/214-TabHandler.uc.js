// ==UserScript==
// @name TabHandler.uc.js
// @description Functions on a tab or tab-bar.
// @include main
// ==/UserScript==

// @require Util.uc.js
// @require [in action] Util.uc.js, TabEx.uc.js
// @note Some about:config preferences are changed. see @pref.
// @note Some default functions are modified. see @modified.


(function() {


"use strict";


/**
 * Handler of click event on a tab or tab-bar.
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
    addEvent([tc, 'mousedown', this, true]);
    addEvent([tc, 'mouseup', this, true]);
    addEvent([tc, 'click', this, true]);
    addEvent([tc, 'dblclick', this, true]);
  },

  handleEvent: function(aEvent) {
    if (aEvent.button === 2 || !this.checkTargetArea(aEvent))
      return;

    switch (aEvent.type) {
      case 'mousedown':
        this.onMouseDown(aEvent);
        break;
      case 'mouseup':
        this.onMouseUp(aEvent);
        break;
      case 'click':
      case 'dblclick':
        if (this.handled) {
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
      }.bind(this), 200);
    } else if (aVal === false) {
      clearTimeout(this.mouseDownTimer);
      delete this.mouseDownTimer;
    }
  },

  get idledMouseUp() {
    return !!this.mouseUpTimer;
  },

  set idledMouseUp(aVal) {
    if (aVal === true) {
      this.mouseUpTimer = setTimeout(function() {
        this.idledMouseUp = false;
        this.performEvent();
        this.handled = false;
      }.bind(this), 200);
    } else if (aVal === false) {
      clearTimeout(this.mouseUpTimer);
      delete this.mouseUpTimer;
    }
  },

  onMouseDown: function(aEvent) {
    this.handled = true;

    if (this.state.target && !this.idledMouseUp) {
      this.clearState();
    }

    this.idledMouseUp = false;

    if (this.state.target !== aEvent.target || this.state.button !== aEvent.button) {
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
    if (this.state.target !== aEvent.target || !this.idledMouseDown) {
      this.handled = false;
      return;
    }

    this.idledMouseDown = false;
    this.state.clicks++;
    this.idledMouseUp = true;
  },

  performEvent: function() {
    var {target, button, ctrlKey, altKey, shiftKey, clicks, area} = this.state;
    // LeftClick, LeftDoubleClick, MiddleClick.
    var isLC = button === 0 && clicks === 1,
        isLDC = button === 0 && clicks === 2,
        isMC = button === 1 && clicks === 1;
    var onTab = area === 'tab', onTabbar = area === 'tabbar';

    // double-click on tab-bar.
    if (isLDC && onTabbar) {
      // Open home pages.
      // shift: The opened pages will be closed.
      // ctrl: If multiple homepages, the first is chosen.
      ucjsUtil.openHomePages({doReplace: shiftKey, onlyFirstPage: ctrlKey});
    }
    // middle-click on tab-bar.
    else if (isMC && onTabbar) {
      // Reopen prev-closed tab.
      undoCloseTab();
    }
    // click on a selected tab.
    else if (isLC && onTab) {
      if (shiftKey) {
        // Focus/reopen the opener tab.
        ucjsTabEx.focusOpenerTab(target, {undoClose: true});
      } else {
        // Focus prev-selected tab.
        ucjsTabEx.focusPrevSelectedTab(target);
      }
    }
    // double-click on a selected tab.
    else if (isLDC && onTab) {
      // pin/unpin a tab
      if (!target.pinned) {
        gBrowser.pinTab(target);
      } else {
        gBrowser.unpinTab(target);
      }
    }
    // middle-click on the selected tab.
    else if (isMC && onTab) {
      // Close tab.
      ucjsUtil.removeTab(target, {ucjsCustomBlock: true});
    }
  },

  checkTargetArea: function(aEvent) {
    var {target, originalTarget} = aEvent;

    // On a selected tab.
    if (target.localName === 'tab' && target.selected) {
      return 'tab';
    }
    // On the margin of a tab strip.
    if (target.localName !== 'tab' && !/^(?:menu|toolbutton)/.test(originalTarget.localName)) {
      return 'tabbar';
    }
    return '';
  }
};


/**
 * Miscellaneous customization.
 */
function makeCustomFunctions() {
  // Cycled-focus tab with mouse-scroll on tab or tab strip.
  addEvent([gBrowser.tabContainer, 'DOMMouseScroll', function(aEvent) {
    gBrowser.tabContainer.advanceSelectedTab((aEvent.detail < 0) ? -1 : 1, true);
    aEvent.stopPropagation();
  }, true]);
}


// Imports.

function getPref(aKey)
  ucjsUtil.getPref(aKey);

function setPref(aKey, aVal)
  ucjsUtil.setPref(aKey, aVal);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function log(aMsg)
  ucjsUtil.logMessage('Misc.uc.js', aMsg);


// Entry point.

function TabHandler_init() {
  mTabBarClickEvent.init();
  makeCustomFunctions();
}

TabHandler_init();


})();
