// ==UserScript==
// @name TabHandler.uc.js
// @description Custom mouse handling on the tab bar.
// @include main
// ==/UserScript==

// @require Util.uc.js
// @require [optional for action] Util.uc.js, TabEx.uc.js


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

// For debugging.
function log(aMsg) {
  return window.ucjsUtil.logMessage('TabHandler.uc.js', aMsg);
}

/**
 * Preference
 */
const kPref = {
  /**
   * Time threshold from 'mousedown' to 'mouseup' for recognition of the custom
   * click.
   *
   * @value {integer} [millisecond]
   *
   * @note The default click is deactivated when 'mouseup' fires in this time
   * after 'mousedown', otherwise activated.
   * @note Set |disableDefaultClick| to true to disable the default click
   * completely.
   */
  clickThresholdTime: 200,

  /**
   * Disable the default click action on the tab bar.
   *
   * @value {boolean}
   *   true: Disabled completely.
   *   false: Disabled when the custom click is recognized, otherwise enabled.
   *
   * @note The default actions;
   * - Middle click on a tab: Closes a tab.
   * - Double click on the tab bar: Opens a new tab.
   * - Middle click on the tab bar: Opens a new tab.
   * @see chrome://browser/content/tabbrowser.xml::
   *   <binding id="tabbrowser-tabs">::
   *   <handler event="dblclick">
   *   <handler event="click">
   */
  disableDefaultClick: true
}

/**
 * Mouse click area.
 *
 * @note Bitmask flags.
 */
const kClickArea = {
	// On a foreground(selected) tab.
	foreTab: 1,
	// On a background tab.
	backTab: 2,
	// On the empty area of the tab bar.
	notTabs: 4
};

/**
 * Click action setting.
 *
 * @key area {kClickArea}
 *   The clicked area.
 *   @note You can make a bitmask.
 * @key button {integer}
 *   The clicked mouse button.
 *   0: Left button.
 *   1: Middle button.
 *   @note Right button is never detected.
 * @key clicks {integer}
 *   The number of clicks.
 * @key command {function}
 *   @param aState {hash}
 *     @key target {XULElement}
 *       The clicked element, <tab> or <tabs#tabbrowser-tabs>.
 *     @key area {kClickArea}
 *     @key button {integer}
 *     @key clicks {integer}
 *     @key shiftKey {boolean}
 *     @key ctrlKey {boolean}
 *     @key altKey {boolean}
 */
const kClickAction = [
  {
    // Double click not on a tab.
    area: kClickArea.notTabs,
    button: 0,
    clicks: 2,
    command: function(aState) {
      let {shiftKey, ctrlKey} = aState;

      // Open home pages.
      // Shift: The current opened tabs are closed.
      // Ctrl: Opens only the first one of the multiple homepages.
      window.ucjsUtil.openHomePages({
        doReplace: shiftKey,
        onlyFirstPage: ctrlKey
      });
    }
  },
  {
    // Triple click on the selected tab or not on a tab.
    area: kClickArea.foreTab | kClickArea.notTabs,
    button: 0,
    clicks: 3,
    command: function(aState) {
      let {shiftKey} = aState;

      // Fail safe.
      if (!shiftKey) {
        return;
      }

      // Close tabs except for the selected tab.
      window.ucjsUtil.removeAllTabsBut(gBrowser.selectedTab);
    }
  },
  {
    // Middle click not on a tab.
    area: kClickArea.notTabs,
    button: 1,
    clicks: 1,
    command: function(aState) {
      // Reopen a previously closed tab.
      // @see chrome://browser/content/browser.js::undoCloseTab
      window.undoCloseTab();
    }
  },
  {
    // Click on a selected tab.
    area: kClickArea.foreTab,
    button: 0,
    clicks: 1,
    command: function(aState) {
      let {target, shiftKey, ctrlKey} = aState;

      if (ctrlKey) {
        // Select/Reopen the opener tab.
        window.ucjsTabEx.selectOpenerTab(target, {undoClose: true});
      }
      else {
        // Select the previously selected tab.
        // Shift: Select/Reopen the *exact* previously selected tab.
        let option = shiftKey ? {undoClose: true} : {traceBack: true};

        window.ucjsTabEx.selectPrevSelectedTab(target, option);
      }
    }
  },
  {
    // Double click on a selected tab.
    area: kClickArea.foreTab,
    button: 0,
    clicks: 2,
    command: function(aState) {
      let {target} = aState;

      // Pin/Unpin the tab.
      if (!target.pinned) {
        gBrowser.pinTab(target);
      }
      else {
        gBrowser.unpinTab(target);
      }
    }
  },
  {
    // Middle click on a tab.
    area: kClickArea.foreTab | kClickArea.backTab,
    button: 1,
    clicks: 1,
    command: function(aState) {
      let {target} = aState;

      // Close the tab.
      window.ucjsUtil.removeTab(target, {safeBlock: true});
    }
  }
  //,
];

/**
 * Handler of the click event on the tab bar.
 *
 * TODO: Use |MouseEvent.buttons| to detect extra buttons.
 */
const TabBarClickEvent = {
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

    let tc = gBrowser.tabContainer;

    // @note Use the capture mode to catch the event before the default event.
    addEvent(tc, 'mousedown', this, true);
    addEvent(tc, 'mouseup', this, true);
    addEvent(tc, 'click', this, true);
    addEvent(tc, 'dblclick', this, true);
  },

  handleEvent: function(aEvent) {
    // Bail out for native actions;
    // 1.A context menu.
    // 2.A UI element (button, menu).
    if (aEvent.button === 2 ||
        !this.checkTargetArea(aEvent)) {
      return;
    }

    switch (aEvent.type) {
      case 'mousedown': {
        this.onMouseDown(aEvent);

        break;
      }

      case 'mouseup': {
        this.onMouseUp(aEvent);

        break;
      }

      case 'click':
      case 'dblclick': {
        if (kPref.disableDefaultClick ||
            this.handled) {
          aEvent.preventDefault();
          aEvent.stopPropagation();
        }

        break;
      }
    }
  },

  get idledMouseDown() {
    return !!this.mouseDownTimer;
  },

  set idledMouseDown(aVal) {
    if (aVal === true) {
      this.mouseDownTimer = setTimeout(() => {
        this.idledMouseDown = false;
      }, kPref.clickThresholdTime);
    }
    else if (aVal === false) {
      clearTimeout(this.mouseDownTimer);
      this.mouseDownTimer = null;
    }
  },

  get idledMouseUp() {
    return !!this.mouseUpTimer;
  },

  set idledMouseUp(aVal) {
    if (aVal === true) {
      this.mouseUpTimer = setTimeout(() => {
        this.idledMouseUp = false;
        this.doAction();
        this.handled = false;
      }, kPref.clickThresholdTime);
    }
    else if (aVal === false) {
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
    let {target, originalTarget} = aEvent;

    // Ignore a UI element to let its native action work.
    // TODO: The probable elements, <menu*> or <toolbar*>, are examined. We may
    // need to test the others.
    if (/^(?:menu|toolbar)/.test(originalTarget.localName)) {
      return null;
    }

    // On a tab.
    if (target.localName === 'tab') {
      return target.selected ? kClickArea.foreTab : kClickArea.backTab;
    }

    // On the margin where has no tabs in the tab bar.
    if (target.localName === 'tabs') {
      return kClickArea.notTabs;
    }

    // WORKAROUND: Unknown case.
    return null;
  },

  doAction: function() {
    kClickAction.some(({area, button, clicks, command}) => {
      if (this.state.area & area &&
          this.state.button === button &&
          this.state.clicks === clicks) {
        command(this.state);

        return true;
      }

      return false;
    }, this);
  }
};

/**
 * Cycle-selects tabs with a mouse wheel scroll on the tabbar.
 *
 * @note Disables the default scrolling when the tabbar overflows tabs.
 */
function switchTabsOnMouseWheel() {
  addEvent(gBrowser.tabContainer, 'wheel', (aEvent) => {
    gBrowser.tabContainer.
      advanceSelectedTab((aEvent.deltaY < 0) ? -1 : 1, true);

    // Prevent the default scrolling.
    aEvent.preventDefault();
    aEvent.stopPropagation();
  }, true);
}

/**
 * Entry point.
 */
function TabHandler_init() {
  TabBarClickEvent.init();
  switchTabsOnMouseWheel();
}

TabHandler_init();


})(this);
