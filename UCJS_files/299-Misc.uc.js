// ==UserScript==
// @name Misc.uc.js
// @description Miscellaneous customizations.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js, TabEx.uc.js

// @note Some about:config preferences are changed (see @prefs).
// @note Some native functions are modified (see @modified).


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
    $pageOnce,
    $shutdown
  },
  DOMUtils: {
    $E,
    $ID,
    $ANONID
  },
  CSSUtils,
  BrowserUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

/**
 * Customizes the tooltip of a tab.
 *
 * @require TabEx.uc.js
 */
(function() {

  const kPref = {
    // Max number of characters in a line.
    // @note 'max-width' of a text container is set to this value by 'em'.
    maxWidth: 40,

    // Max number of wrap lines of a long text.
    maxNumWrapLines: 4
  };

  const kUI = {
    tooltip: {
      id: 'ucjs_Misc_tabTooltip'
    },

    sign: {
      referrer: 'From:'
    },

    style: {
      title: 'font-weight:bold;',
      url: '',
      referrer: 'color:blue;'
    }
  };

  let mTooltip = $ID('mainPopupSet').appendChild($E('tooltip', {
    id: kUI.tooltip.id,
    style:
      // @note Each inner text container has 'max-width'.
      'max-width:none;' +
      // Tight text wrapping.
      'word-break:break-all;word-wrap:break-word;'
  }));

  // Replace the default tooltip 'tabbrowser-tab-tooltip'.
  // @note Being registered on the tab bar including the margin without tabs.
  $ID('tabbrowser-tabs').tooltip = kUI.tooltip.id;

  $event(mTooltip, 'popupshowing', onPopupShowing);
  $event(mTooltip, 'popuphiding', onPopupHiding);

  function onPopupHiding(aEvent) {
    if (aEvent.target !== mTooltip) {
      return;
    }

    if (mTooltip.label) {
      mTooltip.label = '';
    }

    while (mTooltip.hasChildNodes()) {
      mTooltip.removeChild(mTooltip.firstChild);
    }
  }

  // @see chrome://browser/content/tabbrowser.xml::createTooltip
  function onPopupShowing(aEvent) {
    if (aEvent.target !== mTooltip) {
      return;
    }

    let tab = window.document.tooltipNode;

    // Don't show a tooltip not on a tab in the tab bar.
    if (tab.localName !== 'tab') {
      aEvent.preventDefault();
      aEvent.stopPropagation();

      return;
    }

    let browser = gBrowser.getBrowserForTab(tab);

    // WORKAROUND: Hide a useless tooltip that is delayed-shown after a tab
    // under a cursor is removed (e.g. by clicking the mouse middle button on
    // the tab before tooltip shows).
    if (!browser) {
      return;
    }

    // Set a default tooltip label on a special element.
    let setDefaultTooltip = (stringId) => {
      let label = gBrowser.mStringBundle.getString(stringId);

      // WORKAROUND: Remove a template symbol because I don't need a string for
      // shortcut key.
      label = label.replace('(%S)', '').trim();

      mTooltip.label = label;
    };

    if (tab.mOverCloseButton) {
      setDefaultTooltip('tabs.closeTab.tooltip');

      return;
    }

    if (tab._overPlayingIcon) {
      let stringId = tab.linkedBrowser.audioMuted ?
        'tabs.unmuteAudio.tooltip' : 'tabs.muteAudio.tooltip';

      setDefaultTooltip(stringId);

      return;
    }

    // Set a custom tooltip label.
    const {tabState, referrer} = window.ucjsTabEx;

    let loadingURL;

    // 1.Retrieve the loading URL from the tab data by |ucjsTabEx| for a new
    // tab that is suspended to load a document.
    // 2.|userTypedValue| holds the URL of a document till it successfully
    // loads.
    if (tabState.isSuspended(tab)) {
      let openInfo = tabState.getData(tab, 'openInfo');

      loadingURL =
        (openInfo && openInfo.url !== 'about:blank' && openInfo.url) ||
        browser.userTypedValue;
    }

    buildData({
      title: tab.label,
      url: loadingURL || browser.currentURI.spec
    });

    // Add the referrer information to a tab without backward history.
    if (!browser.canGoBack && referrer.exists(tab)) {
      referrer.promiseInfo(tab).then(({title, url}) => {
        buildData({
          title,
          url,
          referrer: true
        });
      }).
      catch(Cu.reportError);
    }
  }

  function buildData({title, url, referrer}) {
    setLabel({
      title,
      referrer
    });

    if (title !== url) {
      setLabel({
        url
      });
    }
  }

  function setLabel({title, url, referrer}) {
    let value = title || url;

    let style = 'max-width:' + kPref.maxWidth + 'em;';

    if (title) {
      style += kUI.style.title
    }
    else if (url) {
      style += kUI.style.url
    }

    if (referrer) {
      value = kUI.sign.referrer + ' ' + value;
      style += kUI.style.referrer
    }

    let maxLength = kPref.maxWidth * kPref.maxNumWrapLines;

    if (value.length > maxLength) {
      let half = Math.floor(maxLength / 2);

      value = [value.substr(0, half), value.substr(-half)].join('...');
    }

    let label = $E('label', {
      style
    });

    mTooltip.appendChild(label).
      appendChild(window.document.createTextNode(value));
  }

})();

/**
 * Shows a long URL text without being cropped in a tooltip of the URL bar.
 */
(function() {

  /**
   * Preset for styling of the accent portion of URL.
   *
   * @note A higher item takes priority to be styled.
   * @note The full matched text will be styled.
   * TODO: Support capture groups.
   */
  const kAccentPreset = [
    {
      // HTTP domains.
      pattern: /https?(?::|%(?:25)*3a)(?:\/|%(?:25)*2f){2}[\w-.]+/ig,
      style: 'color:blue;background-color:lightgray;'
    },
    {
      // Parameter names.
      pattern: /(?:[?#&;]|%(?:25)*(?:3f|23|26|3b))[\w-]*(?:=|%(?:25)*3d)/ig,
      style: 'background-color:bisque;'
    }
  ];

  let mTooltip = $ID('mainPopupSet').appendChild(
    $E('tooltip', {
      id: 'ucjs_Misc_URLTooltip',
      // Tight text wrapping.
      style: 'word-break:break-all;word-wrap:break-word;'
    })
  );

  const kTooltipShowDelay = 500; // [millisecond]
  let mTooltipTimer = null;

  // TODO: In Fx29, a URL tooltip shows even if the first URL does not overflow
  // at startup. And leave |gURLBar._contentIsCropped| to true until a long URL
  // newly loads.
  // WORKAROUND: Reset to false here.
  gURLBar._contentIsCropped = false;

  // @modified chrome://browser/content/urlbarBindings.xml::_initURLTooltip
  gURLBar._initURLTooltip =
  function ucjsMisc_uncropTooltip_initURLTooltip() {
    if (this.focused || !this._contentIsCropped || mTooltipTimer) {
      return;
    }

    mTooltipTimer = setTimeout(() => {
      fillInTooltip(this.value);

      // Set the max width to the width of the URLbar.
      mTooltip.maxWidth = this.boxObject.width;

      mTooltip.openPopup(this, 'after_start', 0, 0, false, false);
    }, kTooltipShowDelay);
  };

  // @modified chrome://browser/content/urlbarBindings.xml::_hideURLTooltip
  gURLBar._hideURLTooltip =
  function ucjsMisc_uncropTooltip_hideURLTooltip() {
    if (mTooltipTimer) {
      clearTimeout(mTooltipTimer);
      mTooltipTimer = null;
    }

    mTooltip.hidePopup();
    clearTooltip();
  };

  function fillInTooltip(url) {
    let html = `<label>${buildAccent(url)}</label>`;

    mTooltip.insertAdjacentHTML('afterbegin', html);
  }

  function clearTooltip() {
    while (mTooltip.hasChildNodes()) {
      mTooltip.removeChild(mTooltip.firstChild);
    }
  }

  function buildAccent(url) {
    let offsets = parseAccent(url);

    if (!offsets) {
      return htmlWrap(url);
    }

    // Sort in descending.
    offsets.sort((a, b) => b.from - a.from);

    let segments = [];

    offsets.forEach(({index, from, to}) => {
      // A trailing string outside the range, which needs no styling.
      segments.unshift(htmlWrap(url.slice(to + 1)));

      // A string to be styled.
      segments.unshift(htmlWrap(url.slice(from, to + 1), index));

      // Cut off the processed string.
      url = url.slice(0, from);
    });

    // Complement the remaining string.
    segments.unshift(htmlWrap(url));

    return segments.join('');
  }

  function parseAccent(url) {
    let offsets = [];

    let add = (index, match) => {
      let from = match.index;
      let to = from + match[0].length - 1

      // Check whether the match string falls in a free range.
      if (!offsets.every((offset) => offset.to < from || to < offset.from)) {
        return;
      }

      offsets.push({
        index,
        from,
        to
      });
    };

    kAccentPreset.forEach(({pattern}, i) => {
      let match;

      if (pattern.global) {
        while ((match = pattern.exec(url))) {
          add(i, match);
        }
      }
      else {
        match = pattern.exec(url);

        if (match) {
          add(i, match);
        }
      }
    });

    if (!offsets.length) {
      return null;
    }

    return offsets;
  }

  function htmlWrap(aValue, aIndex) {
    // A text node without styling.
    if (aIndex === undefined) {
      return htmlEscape(aValue);
    }

    // An inline element for styling.
    let style = kAccentPreset[aIndex].style;
    let value = htmlEscape(aValue);

    return `<html:span style="${style}">${value}</html:span>`;
  }

  function htmlEscape(aString) {
    return aString.
      replace(/&/g, '&amp;'). // Must escape at first.
      replace(/>/g, '&gt;').
      replace(/</g, '&lt;').
      replace(/"/g, '&quot;').
      replace(/'/g, '&apos;');
  }

})();

/**
 * Ensure that a popup menu is detected.
 */
(function() {

  // @modified chrome://browser/content/utilityOverlay.js::closeMenus
  Function('window.closeMenus =' +
    window.closeMenus.toString().
    replace(/node\.tagName/g, 'node.localName')
  )();

})();

/**
 * Relocates the scroll-buttons when tabs overflowed on the tab bar.
 */
(function relocateTabbarScrollButtons() {

  // @note The margin of a pinned tab is set to 3px.
  CSSUtils.setChromeStyleSheet(`
    .tabbrowser-arrowscrollbox > .arrowscrollbox-scrollbox {
      -moz-box-ordinal-group: 1;
    }
    .tabbrowser-arrowscrollbox > .scrollbutton-up {
      -moz-box-ordinal-group: 2;
    }
    .tabbrowser-arrowscrollbox > .scrollbutton-down {
      -moz-box-ordinal-group: 3;
    }
    .tabbrowser-arrowscrollbox > .scrollbutton-up {
      margin-left: 3px !important;
    }
    .tabbrowser-tab[pinned] {
      margin-right: 3px !important;
    }
  `);

  // @modified chrome://browser/content/tabbrowser.xml::_positionPinnedTabs
  Function('gBrowser.tabContainer._positionPinnedTabs =' +
    gBrowser.tabContainer._positionPinnedTabs.toString().
    replace(
      'let scrollButtonWidth = this.mTabstrip._scrollButtonDown.getBoundingClientRect().width;',
      'let scrollButtonWidth = 0;'
    ).replace(
      'width += tab.getBoundingClientRect().width;',
      // Add the margin of a pinned tab.
      'width += tab.getBoundingClientRect().width + 3;'
    )
  )();

  // Recalc the positions.
  gBrowser.tabContainer._positionPinnedTabs();

})();

/**
 * Handler of focusing by the <Tab> key.
 *
 * @require UI.uc.js
 */
(function() {

  /**
   * Toggles focusing behavior by the <Tab> key.
   */
  // @prefs
  // 1: Give focus to text fields only.
  // 7: Give focus to focusable text fields, form elements, and links.
  // @see http://kb.mozillazine.org/Accessibility.tabfocus
  const kPrefTabFocus = 'accessibility.tabfocus';

  let defaultTabFocus = Modules.Prefs.get(kPrefTabFocus);

  $shutdown(() => {
    Modules.Prefs.set(kPrefTabFocus, defaultTabFocus);
  });

  let command = `
    (function(M = ucjsUtil.Modules, SF = ucjsUI.StatusField, v) {
      v = M.Prefs.get("${kPrefTabFocus}") !== 1 ? 1 : 7;
      M.Prefs.set("${kPrefTabFocus}", v);
      SF.showMessage("<TAB> focus: " + (v === 1 ? "excluding links" : "including links"));
    })();
  `;

  command = command.trim().replace(/\s+/g, ' ');

  $ID('mainKeyset').appendChild($E('key', {
    id: 'ucjs_key_toggleTabFocus',
    key: 'f',
    modifiers: 'control,alt',
    oncommand: command
  }));

})();

/**
 * Prevent new tab opening by the 'target' attribute when click link.
 *
 * @note Follows the native action by clicking with modifier keys.
 * @note Follows the valid target in <frame> windows.
 *
 * TODO: Handle <iframe>.
 */
(function() {

  $event(gBrowser.mPanelContainer, 'mousedown', onMouseDown);

  function onMouseDown(event) {
    if (event.button !== 0 ||
        event.shiftKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (!BrowserUtils.isHTMLDocument()) {
      return;
    }

    let {x, y} = BrowserUtils.getCursorPointInContent(event);

    ContentTask.spawn({
      params: {x, y},
      task: function*(params) {
        '${ContentTask.ContentScripts.DOMUtils}';

        let {x, y} = params;

        let node = DOMUtils.getElementFromPoint(x, y);

        while (node) {
          if (DOMUtils.getLinkHref(node)) {
            break;
          }

          node = node.parentNode;
        }

        if (!node || !node.href) {
          return;
        }

        if (node.target) {
          let hasTargetFrame = false;

          let view = node.ownerDocument.defaultView;

          if (view.frameElement && view.frameElement.localName === 'frame') {
            let target = node.target;

            // @note [...window.frames] doesn't work since |window.frames|
            // doesn't have [Symbol.iterator].
            hasTargetFrame =
              Array.some(view.top.frames, (frame) => frame.name === target);
          }

          if (!hasTargetFrame) {
            node.target = '_top';
          }
        }
      }
    });
  }

})();

/**
 * Add 'Open new tab' menu in the tab-context-menu.
 */
(function() {

  let menu = $E('menu', {
    id: 'ucjs_TabContextMenu_openNewTab',
    label: '新しいタブ',
    accesskey: 'N'
  });

  let popup = menu.appendChild($E('menupopup'));

  popup.appendChild($E('menuitem', {
    label: 'スタートページ',
    oncommand: 'ucjsUtil.TabUtils.openHomePages();',
    accesskey: 'S'
  }));

  [
    ['about:home', 'H'],
    ['about:newtab', 'N'],
    ['about:blank', 'B']
  ].
  forEach(([url, accesskey]) => {
    popup.appendChild($E('menuitem', {
      label: url,
      oncommand: 'openUILinkIn("' + url + '", "tab");',
      accesskey
    }));
  });

  gBrowser.tabContextMenu.
    insertBefore(menu, $ID('context_undoCloseTab'));

})();

/**
 * Show a status text in the URL bar.
 *
 * @note The default status panel is used when the fullscreen mode.
 *
 * TODO: Fix too long status panel to fit in the URL bar (often in page
 * loading).
 */
(function() {

  const kState = {
    hidden: 'ucjs_Misc_StatusInURLBar_hidden'
  };

  /**
   * Fx native UI elements.
   */
  const UI = {
    get statusInput() {
      // <statuspanel>
      return window.XULBrowserWindow.statusTextField;
    },

    get URLInput() {
      // <input.urlbar-input>
      return $ANONID('input', gURLBar);
    }
  };

  /**
   * Observe the URL bar for the status visibility by UI actions.
   */
  observeURLBar();

  function observeURLBar() {
    $event(gURLBar, 'focus', hideStatus);
    $event(gURLBar, 'blur', showStatus);
    $event(gURLBar, 'mouseenter', hideStatus);
    $event(gURLBar, 'mouseleave', showStatus);

    function showStatus(aEvent) {
      if (gURLBar.focused) {
        return;
      }

      let statusInput = UI.statusInput;

      if (statusInput.hasAttribute(kState.hidden)) {
        statusInput.removeAttribute(kState.hidden);
      }
    }

    function hideStatus(aEvent) {
      let statusInput = UI.statusInput;

      if (!statusInput.hasAttribute(kState.hidden)) {
        statusInput.setAttribute(kState.hidden, true);
      }
    }
  }

  /**
   * Patches the native function.
   *
   * @modified chrome://browser/content/browser.js::XULBrowserWindow::updateStatusField
   */
  const $updateStatusField = window.XULBrowserWindow.updateStatusField;

  window.XULBrowserWindow.updateStatusField =
  function ucjsMisc_showStatusToURLBar_updateStatusField() {
    $updateStatusField.apply(this);

    // TODO: Should I change the timing of updating the size in order to just
    // fit the position?
    updateStatusInputRect();
  };

  function updateStatusInputRect() {
    let statusInputStyle = UI.statusInput.style;
    let rectKeys = ['top', 'left', 'width', 'height'];

    if (!window.fullScreen) {
      let urlInputRect = UI.URLInput.getBoundingClientRect();

      rectKeys.forEach((key) => {
        if (statusInputStyle[key] !== urlInputRect[key] + 'px') {
          statusInputStyle[key] = urlInputRect[key] + 'px';
        }
      });
    }
    else {
      rectKeys.forEach((key) => {
        if (statusInputStyle[key]) {
          statusInputStyle.removeProperty(key);
        }
      });
    }
  }

  /**
   * Register the appearance.
   */
  CSSUtils.setChromeStyleSheet(`
    #main-window:not([inFullscreen]) statuspanel[${kState.hidden}] {
      visibility: collapse !important;
    }
    #main-window:not([inFullscreen]) statuspanel {
      position: fixed !important;
      margin: 0 !important;
      padding: 0 !important;
      max-width: none !important;
      border-radius: 1.5px !important;
      background-color: hsl(0,0%,90%) !important;
      z-index: 2 !important;
    }
    #main-window:not([inFullscreen]) .statuspanel-inner {
      margin: 0 !important;
      padding: 0 !important;
      height: 1em !important;
    }
    #main-window:not([inFullscreen]) .statuspanel-inner:before {
      display: inline-block;
      content: ">";
      color: gray;
      font-weight: bold;
      margin: 0 2px;
    }
    #main-window:not([inFullscreen]) .statuspanel-label {
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: none transparent !important;
    }
  `);

})();

/**
 * Style for anonymous elements.
 *
 * @note AGENT-STYLE-SHEETS can apply styles to native anonymous elements.
 * @see https://developer.mozilla.org/en/docs/Using_the_Stylesheet_Service#Using_the_API
 */
(function() {

  let setGlobalAgentCSS = (css) => {
    CSSUtils.setGlobalStyleSheet(css, 'AGENT_SHEET');
  };

  // Clear scrollbar.
  setGlobalAgentCSS(`
    scrollbar {
      -moz-appearance: none !important;
      background-image: linear-gradient(to bottom, hsl(0, 0%, 80%),
        hsl(0, 0%, 90%)) !important;
    }
    scrollbar[orient="vertical"] {
      -moz-appearance: none !important;
      background-image: linear-gradient(to right, hsl(0, 0%, 80%),
        hsl(0, 0%, 90%)) !important;
    }
    thumb {
      -moz-appearance: none !important;
      background-image: linear-gradient(to bottom, hsl(0, 0%, 60%),
        hsl(0, 0%, 90%)) !important;
    }
    thumb[orient="vertical"] {
      -moz-appearance: none !important;
      background-image: linear-gradient(to right, hsl(0, 0%, 60%),
        hsl(0, 0%, 90%)) !important;
    }
  `);

  // Tooltip with tight text wrapping.
  setGlobalAgentCSS(`
    .tooltip-label {
      word-break: break-all !important;
      word-wrap: break-word !important;
    }
  `);

})();

/**
 * Patch the alltabs menu.
 *
 * @require UI.uc.js, TabEx.uc.js
 */
(function() {

  /**
   * Fx native UI elements.
   */
  const UI = {
    get alltabsPopup() {
      // <menupopup#alltabs-popup>
      return $ID('alltabs-popup');
    }
  };

  /**
   * Ensure that the target tab is visible by the command of a menuitem in
   * the alltabs popup.
   *
   * @note An *unselected* tab will be selected and visible by the command,
   * but nothing happens for a *selected* tab. It is inconvenient that a
   * selected tab which is scrolled out the tab bar stays invisible.
   *
   * @see chrome://browser/content/tabbrowser.xml::
   *   <binding id="tabbrowser-alltabs-popup">::
   *   <handler event="command">
   */
  $event(UI.alltabsPopup, 'command', (aEvent) => {
    let menuitem = aEvent.target;

    if (menuitem.parentNode !== UI.alltabsPopup) {
      return;
    }

    if (menuitem.tab && menuitem.tab.selected) {
      gBrowser.tabContainer.mTabstrip.ensureElementIsVisible(menuitem.tab);
    }
  });

  /**
   * Show the URL of a suspended tab to the status field when a menuitem is
   * on active.
   *
   * @note This is a workaround for a suspended tab by TabEx.uc.js.
   */
  $event(UI.alltabsPopup, 'DOMMenuItemActive', (aEvent) => {
    let menuitem = aEvent.target;

    if (menuitem.parentNode !== UI.alltabsPopup) {
      return;
    }

    let tab = menuitem.tab;

    if (!tab) {
      return;
    }

    const {tabState} = window.ucjsTabEx;

    if (tabState.isSuspended(tab)) {
      let loadingURL;

      // 1.Retrieve the loading URL from the tab data by |ucjsTabEx| for a new
      // tab that is suspended to load a document.
      // 2.|userTypedValue| holds the URL of a document till it successfully
      // loads.
      let openInfo = tabState.getData(tab, 'openInfo');

      loadingURL =
        (openInfo && openInfo.url !== 'about:blank' && openInfo.url) ||
        gBrowser.getBrowserForTab(tab).userTypedValue;

      // @see chrome://browser/content/browser.js::XULBrowserWindow::setOverLink
      window.XULBrowserWindow.setOverLink(loadingURL, null);
    }
  });

  /**
   * Update the state of a menuitem for an unread tab.
   *
   * @note This is a workaround for an unread tab handled by TabEx.uc.js.
   */
  $event(UI.alltabsPopup, 'popupshowing', (aEvent) => {
    let popup = aEvent.target;

    if (popup !== UI.alltabsPopup) {
      return;
    }

    [...popup.childNodes].forEach((menuitem) => {
      if (menuitem.tab) {
        setStateForUnreadTab(menuitem, menuitem.tab);
      }
    });

    gBrowser.tabContainer.
      addEventListener('TabAttrModified', onTabAttrModified);
  });

  $event(UI.alltabsPopup, 'popuphiding', (aEvent) => {
    let popup = aEvent.target;

    if (popup !== UI.alltabsPopup) {
      return;
    }

    gBrowser.tabContainer.
      removeEventListener('TabAttrModified', onTabAttrModified);
  });

  function onTabAttrModified(aEvent) {
    let tab = aEvent.target;

    if (tab.mCorrespondingMenuitem) {
      setStateForUnreadTab(tab.mCorrespondingMenuitem, tab);
    }
  }

  function setStateForUnreadTab(aMenuitem, aTab) {
    window.ucjsUI.Menuitem.setStateForUnreadTab(aMenuitem, aTab);
  }

})();

/**
 * Global findbar in all tabs.
 *
 * @require UI.uc.js
 */
(function() {

  const kUI = {
    lockButton: {
      id: 'ucjs_Misc_GlobalFindbar_lockButton',
      label: 'Lock',
      accesskey: 'l',
      tooltiptext: 'Use the global findbar'
    }
  };

  const UI = {
    get lockButton() {
      // Get the lock button only when a findbar in the current tab has been
      // initialized to avoid creating a needless findbar once the lazy getter
      // |gFindBar| is called.
      if (gBrowser.isFindBarInitialized &&
          gBrowser.isFindBarInitialized(gBrowser.selectedTab)) {
        return gFindBar.getElementsByClassName(kUI.lockButton.id)[0];
      }

      return null;
    }
  };

  let vars = {
    isLocked: false,
    findString: null
  };

  window.ucjsUI.FindBar.register({
    onCreate
  });

  $event(gBrowser.mPanelContainer, 'command', handleEvent);
  $event(gBrowser.mPanelContainer, 'find', handleEvent);
  $page('pageselect', handleEvent);
  $page('pageurlchange', handleEvent);

  function onCreate(aParam) {
    let {findBar} = aParam;

    findBar.appendChild($E('toolbarbutton', {
      // @note Identified by the class name since each tab has a findbar.
      class: kUI.lockButton.id,
      label: kUI.lockButton.label,
      accesskey: kUI.lockButton.accesskey,
      tooltiptext: kUI.lockButton.tooltiptext,
      type: 'checkbox'
    }));
  }

  function handleEvent(event) {
    const {FindBar} = window.ucjsUI;

    switch (event.type) {
      case 'command': {
        let button = event.target;

        let lockButton = UI.lockButton;

        if (lockButton && button === lockButton) {
          vars.isLocked = button.checked;
          vars.findString = vars.isLocked ? FindBar.findText.value : null;

          if (vars.isLocked) {
            // @note Ensure the findbar opens in the normal mode.
            gFindBar.open(gFindBar.FIND_NORMAL);
          }
        }

        break;
      }

      case 'find': {
        if (vars.isLocked) {
          vars.findString = FindBar.findText.value;
        }

        break;
      }

      case 'pageselect':
      case 'pageurlchange': {
        // Abort for a redundant event when tab selecting.
        if (event.type === 'pageurlchange' && event.tabSwitched) {
          return;
        }

        let lockButton = UI.lockButton;

        if (lockButton && lockButton.checked !== vars.isLocked) {
          lockButton.checked = vars.isLocked;
        }

        if (vars.isLocked) {
          // @note The focus does not move to the findbar.
          gFindBar.open(gFindBar.FIND_NORMAL);

          $pageOnce('pageready', () => {
            if (FindBar.findText.value !== vars.findString) {
              FindBar.reset();
              FindBar.findText.value = vars.findString;
            }

            gFindBar.updateControlState();
          });
        }

        break;
      }
    }
  }

})();


})(this);
