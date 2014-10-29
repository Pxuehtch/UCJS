// ==UserScript==
// @name TabHandler.uc.js
// @description Custom handling on the tab bar.
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
   * @note The default click is deactivated at 'mouseup' in time, otherwise
   * activated.
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
   * - Middle-click on a tab: Closes a tab.
   * - Double-click on a tabbar: Opens a new tab.
   * - Middle-click on a tabbar: Opens a new tab.
   * @see chrome://browser/content/tabbrowser.xml::
   *   <binding id="tabbrowser-tabs">::
   *   <handler event="dblclick">
   *   <handler event="click">
   */
  disableDefaultClick: true
}

/**
 * Handler of the click event on the tab bar.
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
    // 1.Show the default contextmenu.
    // 2.Do not handle a UI element(button/menu) on the tab bar.
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

    // Skip UI elements on the tab bar.
    // TODO: The probable elements, <menu*> or <toolbar*>, are examined. More
    // other items may be needed to test.
    if (/^(?:menu|toolbar)/.test(originalTarget.localName)) {
      return null;
    }

    // On a tab.
    if (target.localName === 'tab') {
      return target.selected ? 'foreTab' : 'backTab';
    }

    // On the margin where has no tabs in the tab bar.
    if (target.localName === 'tabs') {
      return 'notTabs';
    }

    // WORKAROUND: Unknown case.
    return null;
  },

  doAction: function() {
    let {
      target,
      button,
      ctrlKey, altKey, shiftKey,
      clicks,
      area
    } = this.state;

    // Left-Click / Left-Double-Click / Middle-Click
    let LC  = button === 0 && clicks === 1,
        LDC = button === 0 && clicks === 2,
        MC  = button === 1 && clicks === 1;

    // Selected tab / Background tab / Not tabs area
    let foreTab = area === 'foreTab',
        backTab = area === 'backTab',
        notTabs = area === 'notTabs';

    /**
     * Action settings.
     *
     * TODO: Separate the definition of actions and generalize the code.
     */
    switch (true) {
      case (LDC && notTabs): {
        // Open home pages.
        // Shift: The current opened tabs are closed.
        // Ctrl: Only the first of the multiple homepages is opened.
        window.ucjsUtil.
          openHomePages({doReplace: shiftKey, onlyFirstPage: ctrlKey});

        break;
      }

      case (MC && notTabs): {
        // Reopen the prev-closed tab.
        // @see chrome://browser/content/browser.js::undoCloseTab
        window.undoCloseTab();

        break;
      }

      case (LC && foreTab): {
        if (ctrlKey) {
          // Select/Reopen the opener tab.
          window.ucjsTabEx.selectOpenerTab(target, {undoClose: true});
        }
        else {
          // Select the previous selected tab.
          // Shift: Select/Reopen the *exact* previous selected tab.
          let option = shiftKey ? {undoClose: true} : {traceBack: true};

          window.ucjsTabEx.selectPrevSelectedTab(target, option);
        }

        break;
      }

      case (LDC && foreTab): {
        // Pin/Unpin a tab.
        if (!target.pinned) {
          gBrowser.pinTab(target);
        }
        else {
          gBrowser.unpinTab(target);
        }

        break;
      }

      case (MC && (foreTab || backTab)): {
        // Close a tab.
        window.ucjsUtil.removeTab(target, {safeBlock: true});

        break;
      }
    }
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
