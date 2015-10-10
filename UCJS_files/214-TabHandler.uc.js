// ==UserScript==
// @name TabHandler.uc.js
// @description Custom mouse handling on the tab bar.
// @include main
// ==/UserScript==

// @require Util.uc.js
// @require [optional for action] Util.uc.js, TabEx.uc.js


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules: {
    Timer: {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval
    }
  },
  Listeners: {
    $event
  },
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

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
   */
  clickThresholdTime: 200,
};

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
    command(aState) {
      let {shiftKey, ctrlKey} = aState;

      // Open home pages.
      // <Shift>: The current opened tabs are closed.
      // <Ctrl>: Opens only the first one of the multiple homepages.
      window.ucjsUtil.TabUtils.openHomePages({
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
    command(aState) {
      let {shiftKey} = aState;

      // Fail safe.
      if (!shiftKey) {
        return;
      }

      // Close tabs except for the selected tab.
      window.ucjsUtil.TabUtils.removeAllTabsBut(gBrowser.selectedTab);
    }
  },
  {
    // Middle click not on a tab.
    area: kClickArea.notTabs,
    button: 1,
    clicks: 1,
    command(aState) {
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
    command(aState) {
      let {target, shiftKey, ctrlKey} = aState;

      if (ctrlKey) {
        // Select/Reopen the opener tab.
        window.ucjsTabEx.selectOpenerTab(target, {
          undoClose: true
        });
      }
      else {
        // Select the previously selected tab.
        // <Shift>: Select/Reopen the *exact* previously selected tab.
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
    command(aState) {
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
    // Click on a background tab.
    area: kClickArea.backTab,
    button: 0,
    clicks: 1,
    command(aState) {
      let {target} = aState;

      // Select the tab.
      gBrowser.selectedTab = target;
    }
  },
  {
    // Middle click on a tab.
    area: kClickArea.foreTab | kClickArea.backTab,
    button: 1,
    clicks: 1,
    command(aState) {
      let {target} = aState;

      // Close the tab.
      window.ucjsUtil.TabUtils.removeTab(target, {
        safetyLock: true
      });
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
  get isMouseDownIdling() {
    return !!this.mouseDownTimer;
  },

  set isMouseDownIdling(aValue) {
    if (aValue === true) {
      this.mouseDownTimer = setTimeout(() => {
        this.stopObserving();
      }, kPref.clickThresholdTime);
    }
    else /* if (aValue === false) */ {
      if (this.mouseDownTimer) {
        clearTimeout(this.mouseDownTimer);
        this.mouseDownTimer = null;
      }
    }
  },

  get isMouseUpIdling() {
    return !!this.mouseUpTimer;
  },

  set isMouseUpIdling(aValue) {
    if (aValue === true) {
      this.mouseUpTimer = setTimeout(() => {
        this.doAction();
        this.updateForegroundTab(this.state.target)

        this.stopObserving();
      }, kPref.clickThresholdTime);
    }
    else /* if (aValue === false) */ {
      if (this.mouseUpTimer) {
        clearTimeout(this.mouseUpTimer);
        this.mouseUpTimer = null;
      }
    }
  },

  get isObserving() {
    return !!this.state.target;
  },

  stopObserving() {
    this.isMouseDownIdling = false;
    this.isMouseUpIdling = false;

    this.clearState();
  },

  updateForegroundTab(target) {
    this.isForegroundTab = target.localName === 'tab' && target.selected;
  },

  clearState() {
    this.state.target   = null;
    this.state.area     = null;
    this.state.button   = null;
    this.state.clicks   = null;
    this.state.shiftKey = null;
    this.state.ctrlKey  = null;
    this.state.altKey   = null;
  },

  init() {
    this.state = {};
    this.clearState();

    let tc = gBrowser.tabContainer;

    $event(tc, 'mouseover', this);
    $event(tc, 'mousedown', this);
    $event(tc, 'mouseup', this);

    // @note Use the capture mode to catch the event before the default event.
    $event(tc, 'click', this, true);
    $event(tc, 'dblclick', this, true);
  },

  handleEvent(aEvent) {
    // Bail out for native actions:
    // 1.A context menu.
    // 2.A UI element (button, menu).
    if (aEvent.button === 2 ||
        !this.getTargetArea(aEvent)) {
      return;
    }

    switch (aEvent.type) {
      case 'mouseover': {
        this.onMouseOver(aEvent);

        break;
      }

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
        /**
         * Prevent the default actions:
         * - Middle click on a tab: Closes a tab.
         * - Double click on the tab bar: Opens a new tab.
         * - Middle click on the tab bar: Opens a new tab.
         * @see chrome://browser/content/tabbrowser.xml::
         *   <binding id="tabbrowser-tabs">::
         *   <handler event="dblclick">
         *   <handler event="click">
         *
         * TODO: We should make detailed management in accordance with the
         * native processing.
         */
        aEvent.stopPropagation();
        aEvent.preventDefault();

        break;
      }
    }
  },


  /**
   * Check whether the tab is foreground or not before 'mousedown' event makes
   * the tab selected.
   * @see chrome://browser/content/tabbrowser.xml::
   *   <binding id="tabbrowser-tab">::
   *   <handler event="mousedown">
   * @see chrome://global/content/bindings/tabbox.xml::
   *   <binding id="tab">::
   *   <handler event="mousedown">
   */
  onMouseOver(event) {
    this.updateForegroundTab(event.target);
  },

  onMouseDown(aEvent) {
    if (this.isObserving) {
      // Two buttons are pressed down.
      if (this.isMouseDownIdling) {
        this.stopObserving();

        return;
      }
    }

    this.isMouseUpIdling = false;
    this.isMouseDownIdling = true;

    if (this.state.target !== aEvent.target ||
        this.state.button !== aEvent.button) {
      this.state.target   = aEvent.target;
      this.state.area     = this.getTargetArea(aEvent);
      this.state.button   = aEvent.button;
      this.state.clicks   = 0;
      this.state.shiftKey = aEvent.shiftKey;
      this.state.ctrlKey  = aEvent.ctrlKey;
      this.state.altKey   = aEvent.altKey;
    }
  },

  onMouseUp(aEvent) {
    if (!this.isObserving) {
      return;
    }

    if (this.state.target !== aEvent.target) {
      this.stopObserving();

      return;
    }

    this.isMouseDownIdling = false;
    this.isMouseUpIdling = true;

    this.state.clicks++;
  },

  getTargetArea(aEvent) {
    let {target, originalTarget} = aEvent;

    // Ignore a UI element to let its native action work.
    // TODO: The probable elements, <menu*> or <toolbar*>, are examined. We may
    // need to test others.
    if (/^(?:menu|toolbar)/.test(originalTarget.localName)) {
      return null;
    }

    // On a tab.
    if (target.localName === 'tab') {
      return this.isForegroundTab ? kClickArea.foreTab : kClickArea.backTab;
    }

    // On the margin where has no tabs in the tab bar.
    if (originalTarget.localName === 'box') {
      return kClickArea.notTabs;
    }

    // WORKAROUND: Unknown case.
    return null;
  },

  doAction() {
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
 * Handler of the mouse-wheel event on the tab bar.
 */
const TabBarWheelEvent = {
  init() {
    // @note Use the capture mode to catch the event before the default event.
    $event(gBrowser.tabContainer, 'wheel', (aEvent) => {
      this.scrollTabs(aEvent) || this.switchTabs(aEvent);

      // Prevent the default scrolling when the tab bar overflows with tabs.
      aEvent.preventDefault();
      aEvent.stopPropagation();
    }, true);
  },

  /**
   * Scroll the tab bar by one tab when it overflows and the wheel event works
   * on the scroll buttons.
   */
  scrollTabs(aEvent) {
    if (!gBrowser.tabContainer.hasAttribute('overflow')) {
      return false;
    }

    let button = aEvent.originalTarget;

    // Handle the scroll buttons 'scrollbutton-up' or 'scrollbutton-down'.
    if (!/^scrollbutton\-/.test(button.getAttribute('anonid'))) {
      return false;
    }

    // @see chrome://global/content/bindings/scrollbox.xml::scrollByIndex
    let direction = (aEvent.deltaY < 0) ? -1 : 1;

    button.parentNode.scrollByIndex(direction);

    return true;
  },

  /**
   * Switch tabs by one.
   */
  switchTabs(aEvent) {
    // @see chrome://global/content/bindings/tabbox.xml::advanceSelectedTab
    let direction = (aEvent.deltaY < 0) ? -1 : 1;

    gBrowser.tabContainer.advanceSelectedTab(direction, true);
  }
};

/**
 * Entry point.
 */
function TabHandler_init() {
  TabBarClickEvent.init();
  TabBarWheelEvent.init();
}

TabHandler_init();


})(this);
