// ==UserScript==
// @name Misc.uc.js
// @description Miscellaneous customizations.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js, TabEx.uc.js

// @note Some about:config preferences are changed (see @pref).
// @note Some native functions are modified (see @modified).


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  Prefs: {
    get: getPref,
    set: setPref
  },
  createNode: $E,
  getNodeById: $ID,
  getNodeByAnonid: $ANONID,
  addEvent,
  setChromeStyleSheet: setChromeCSS
} = window.ucjsUtil;

function setGlobalAgentCSS(aCSS) {
  return window.ucjsUtil.setGlobalStyleSheet(aCSS, 'AGENT_SHEET');
}

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('Misc.uc.js', aMsg);
}

/**
 * Customizes the tooltip of a tab.
 *
 * @require TabEx.uc.js
 */
(function() {

  const kPref = {
    // Max numbers of characters in a line.
    // @note 'max-width' of a text container is set to this value by 'em'.
    maxWidth: 40,

    // Max numbers of wrap lines of a long text.
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
      URL: '',
      referrer: 'color:blue;'
    }
  };

  let mTooltip = $ID('mainPopupSet').appendChild(
    $E('tooltip', {
      id: kUI.tooltip.id,
      style:
        'max-width:none;padding:auto 0;' +
        'word-break:break-all;word-wrap:break-word;'
    })
  );

  addEvent(mTooltip, 'popupshowing', onPopupShowing, false);
  addEvent(mTooltip, 'popuphiding', onPopupHiding, false);

  // Replace the default tooltip 'tabbrowser-tab-tooltip'.
  // @note Resisters on the tab bar including the margin without tabs.
  $ID('tabbrowser-tabs').tooltip = kUI.tooltip.id;

  function onPopupHiding(aEvent) {
    let tooltip = aEvent.target;

    if (tooltip.id !== kUI.tooltip.id) {
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
    let tooltip = aEvent.target;

    if (tooltip.id !== kUI.tooltip.id) {
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

    if (tab.mOverCloseButton) {
      mTooltip.label = tab.getAttribute('closetabtext');
      return;
    }

    const {tabState, referrer} = window.ucjsTabEx;

    let loadingURL;

    // 1.Retrieve the loading URL from the tab data by |ucjsTabEx| for a new
    // tab that is suspended to load a document.
    // 2.|userTypedValue| holds the URL of a document till it successfully
    // loads.
    if (tabState.isSuspended(tab)) {
      let openInfo = tabState.getData(tab, 'openInfo');

      loadingURL =
        (openInfo && openInfo.URL !== 'about:blank' && openInfo.URL) ||
        browser.userTypedValue;
    }

    buildData({
      title: tab.label,
      URL: loadingURL || browser.currentURI.spec
    });

    // Add the referrer information to a tab without backward history.
    if (!browser.canGoBack && referrer.exists(tab)) {
      referrer.fetchInfo(tab, (aInfo) => {
        buildData({
          title: aInfo.title,
          URL: aInfo.URL,
          referrer: true
        });
      });
    }
  }

  function buildData({title, URL, referrer}) {
    setLabel({
      title: title,
      referrer: referrer
    });

    if (title !== URL) {
      setLabel({
        URL: URL
      });
    }
  }

  function setLabel({title, URL, referrer}) {
    let value = title || URL;

    let style = 'max-width:' + kPref.maxWidth + 'em;' +
      'margin:auto 0;padding:auto 0;';

    if (title) {
      style += kUI.style.title
    }
    else if (URL) {
      style += kUI.style.URL
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
      style: style
    });

    mTooltip.appendChild(label).
      appendChild(window.document.createTextNode(value));
  }

})();

/**
 * Shows a long URL text without cropped in a tooltip of the URL bar.
 */
(function() {

  let mTooltip = $ID('mainPopupSet').appendChild(
    $E('tooltip', {
      id: 'ucjs_Misc_URLTooltip',
      style: 'word-break:break-all;word-wrap:break-word;'
    })
  );

  const kTooltipShowDelay = 500; // [ms]
  let mTooltipTimer = null;

  // TODO: In Fx29, a URL tooltip shows even if the first URL does not overflow
  // at startup. And leave |gURLBar._contentIsCropped| to true until a long URL
  // newly loads.
  // WORKAROUND: Reset to false here, but it may be wrong timing.
  gURLBar._contentIsCropped = false;

  // @modified chrome://browser/content/urlbarBindings.xml::_initURLTooltip
  gURLBar._initURLTooltip =
  function ucjsMisc_uncropTooltip_initURLTooltip() {
    if (this.focused || !this._contentIsCropped || mTooltipTimer) {
      return;
    }

    mTooltipTimer = setTimeout(() => {
      fillInTooltip(this.value);
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

  function fillInTooltip(aURL) {
    // @note |pattern| tests an HTML-escaped URL string.
    const kAccent = [
      {
        // domain
        pattern: /https?(?::|%(?:25)*3a)(?:\/|%(?:25)*2f){2}[\w-.]+/ig,
        style: 'color:blue;'
      }
    ];

    let $label = (aValue) =>
      '<label>%value%</label>'.replace('%value%', htmlEscape(aValue));

    // An inline element for styling of a text.
    let $span = (aStyle) =>
      '<html:span style="%style%">$&</html:span>'.replace('%style%', aStyle);

    let html = $label(aURL);

    for (let {pattern, style} of kAccent) {
      html = html.replace(pattern, $span(style));
    }

    mTooltip.insertAdjacentHTML('afterbegin', html);
  }

  function clearTooltip() {
    while (mTooltip.hasChildNodes()) {
      mTooltip.removeChild(mTooltip.firstChild);
    }
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
  setChromeCSS('\
    .tabbrowser-arrowscrollbox>.arrowscrollbox-scrollbox{\
      -moz-box-ordinal-group:1;\
    }\
    .tabbrowser-arrowscrollbox>.scrollbutton-up{\
      -moz-box-ordinal-group:2;\
    }\
    .tabbrowser-arrowscrollbox>.scrollbutton-down{\
      -moz-box-ordinal-group:3;\
    }\
    .tabbrowser-arrowscrollbox>.scrollbutton-up{\
      margin-left:3px!important;\
    }\
    .tabbrowser-tab[pinned]{\
      margin-right:3px!important;\
    }\
  ');

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
 * Suppress a rapid moving of focuses with holding the TAB key down.
 *
 * @note Applied only in the content area.
 */
(function() {

  addEvent(gBrowser.mPanelContainer, 'keypress', (aEvent) => {
    if (aEvent.keyCode === event.DOM_VK_TAB && aEvent.repeat) {
      aEvent.preventDefault();
      aEvent.stopPropagation();
    }
  }, true);

})();

/**
 * TAB-key focusing handler.
 *
 * @require UI.uc.js
 */
(function() {

  /**
   * Toggles TAB-key focusing behavior.
   */
  // @pref
  // 1: Give focus to text fields only.
  // 7: Give focus to focusable text fields, form elements, and links.
  // @see http://kb.mozillazine.org/Accessibility.tabfocus
  const kPrefTabFocus = 'accessibility.tabfocus';

  let defaultTabFocus = getPref(kPrefTabFocus);

  addEvent(window, 'unload', () => {
    setPref(kPrefTabFocus, defaultTabFocus);
  }, false);

  let command = '\
    (function(state) {\
      state = ucjsUtil.Prefs.get("%kPrefTabFocus%") !== 1 ? 1 : 7;\
      ucjsUtil.Prefs.set("%kPrefTabFocus%", state);\
      ucjsUI.StatusField.showMessage("TAB focus: " + (state === 1 ?\
      "text fields only" : "text fields, form elements, and links"));\
    })();\
  ';

  command = command.
    trim().replace(/\s+/g, ' ').
    replace(/%kPrefTabFocus%/g, kPrefTabFocus);

  $ID('mainKeyset').appendChild($E('key', {
    id: 'ucjs_key_toggleTabFocus',
    key: 'F',
    modifiers: 'shift,control,alt',
    oncommand: command
  }));

  /**
   * Gives focus on the content area.
   */
  $ID('mainKeyset').appendChild($E('key', {
    id: 'ucjs_key_focusInContentArea',
    key: 'f',
    modifiers: 'control,alt',
    oncommand: 'gBrowser.contentDocument.documentElement.focus();'
  }));

})();

/**
 * Prevent new page opening by the target attribute on link click.
 *
 * @note Follows the action by clicking with modifier keys.
 * @note Follows the valid target in <frame> windows.
 *
 * TODO: Handle <iframe>.
 */
(function() {

  addEvent(gBrowser.mPanelContainer, 'mousedown', onMouseDown, true);

  function onMouseDown(aEvent) {
    if (aEvent.button !== 0 ||
        aEvent.shiftKey || aEvent.ctrlKey || aEvent.altKey) {
      return;
    }

    if (!isHtmlDocument(aEvent.target.ownerDocument)) {
      return;
    }

    let link = getLink(aEvent.target);

    if (!link) {
      return;
    }

    if (link.target) {
      let hasTargetFrame = false;

      let view = aEvent.target.ownerDocument.defaultView;

      if (view.frameElement instanceof HTMLFrameElement) {
        let target = link.target;

        hasTargetFrame =
          Array.some(view.top.frames, (frame) => frame.name === target);
      }

      if (!hasTargetFrame) {
        link.target = '_top';
      }
    }
  }

  function isHtmlDocument(aDocument) {
    if (aDocument instanceof HTMLDocument &&
        /^https?/.test(aDocument.documentURI)) {
      let mime = aDocument.contentType;

      return (
        mime === 'text/html' ||
        mime === 'text/xml' ||
        mime === 'application/xml' ||
        mime === 'application/xhtml+xml'
      );
    }

    return false
  }

  function getLink(aNode) {
    const XLinkNS = 'http://www.w3.org/1999/xlink';

    // @note The initial node may be a text node.
    let node = aNode;

    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node instanceof HTMLAnchorElement ||
            node instanceof HTMLAreaElement ||
            node instanceof HTMLLinkElement ||
            node.getAttributeNS(XLinkNS, 'type') === 'simple') {
          return node;
        }
      }

      node = node.parentNode;
    }

    return null;
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
    oncommand: 'ucjsUtil.openHomePages();',
    accesskey: 'S'
  }));

  [
    ['about:home',   'H'],
    ['about:newtab', 'N'],
    ['about:blank',  'B']
  ].
  forEach(([url, accesskey]) => {
    popup.appendChild($E('menuitem', {
      label: url,
      oncommand: 'openUILinkIn("' + url + '", "tab");',
      accesskey: accesskey
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

  observeURLBar();

  function observeURLBar() {
    addEvent(gURLBar, 'focus', hideStatus, false);
    addEvent(gURLBar, 'blur', showStatus, false);
    addEvent(gURLBar, 'mouseenter', hideStatus, false);
    addEvent(gURLBar, 'mouseleave', showStatus, false);

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

  // @modified chrome://browser/content/browser.js::XULBrowserWindow::updateStatusField
  const $updateStatusField = window.XULBrowserWindow.updateStatusField;

  window.XULBrowserWindow.updateStatusField =
  function ucjsMisc_showStatusToURLBar_updateStatusField() {
    $updateStatusField.apply(this, arguments);

    // TODO: Should I change the timing of updating the size in order to just
    // fit the position?
    updateStatusInputRect();
  };

  function updateStatusInputRect() {
    let statusInputStyle = UI.statusInput.style;
    let rectKeys = ['top', 'left', 'width', 'height'];

    if (!window.fullScreen) {
      let URLInputRect = UI.URLInput.getBoundingClientRect();

      rectKeys.forEach((key) => {
        if (statusInputStyle[key] !== URLInputRect[key] + 'px') {
          statusInputStyle[key] = URLInputRect[key] + 'px';
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

  const css = '\
    #main-window:not([inFullscreen]) statuspanel[%%kState.hidden%%]{\
      visibility:collapse!important;\
    }\
    #main-window:not([inFullscreen]) statuspanel{\
      position:fixed!important;\
      margin:0!important;\
      padding:0!important;\
      max-width:none!important;\
      border-radius:1.5px!important;\
      background-color:hsl(0,0%,90%)!important;\
      z-index:2!important;\
    }\
    #main-window:not([inFullscreen]) .statuspanel-inner{\
      margin:0!important;\
      padding:0!important;\
      height:1em!important;\
    }\
    #main-window:not([inFullscreen]) .statuspanel-inner:before{\
      display:inline-block;\
      content:">";\
      color:gray;\
      font-weight:bold;\
      margin:0 2px;\
    }\
    #main-window:not([inFullscreen]) .statuspanel-label{\
      margin:0!important;\
      padding:0!important;\
      border:none!important;\
      background:none transparent!important;\
    }\
  ';

  setChromeCSS(css.replace(/%%(.+?)%%/g, ($0, $1) => eval($1)));

})();

/**
 * Style for anonymous elements.
 *
 * @note AGENT-STYLE-SHEETS can apply styles to native anonymous elements.
 * @see https://developer.mozilla.org/en-US/docs/Using_the_Stylesheet_Service#Using_the_API
 */
(function() {
  /* Clear scrollbar. */
  setGlobalAgentCSS('\
    scrollbar {\
      -moz-appearance:none!important;\
      background-image:\
        linear-gradient(to bottom,hsl(0,0%,80%),hsl(0,0%,90%))!important;\
    }\
    scrollbar[orient="vertical"] {\
      -moz-appearance:none!important;\
      background-image:\
        linear-gradient(to right,hsl(0,0%,80%),hsl(0,0%,90%))!important;\
    }\
    thumb {\
      -moz-appearance:none!important;\
      background-image:\
        linear-gradient(to bottom,hsl(0,0%,60%),hsl(0,0%,90%))!important;\
    }\
    thumb[orient="vertical"] {\
      -moz-appearance:none!important;\
      background-image:\
        linear-gradient(to right,hsl(0,0%,60%),hsl(0,0%,90%))!important;\
    }\
  ');

  /* Tooltip text with tight line-wrapping. */
  setGlobalAgentCSS('\
    .tooltip-label {\
      word-break:break-all!important;\
      word-wrap:break-word!important;\
    }\
  ');

})();

/**
 * Patch the alltabs menu.
 *
 * @require UI.uc.js, TabEx.uc.js
 */
(function() {

  const kID = {
    ALLTABS_POPUP: 'alltabs-popup'
  };

  let alltabsPopup = $ID(kID.ALLTABS_POPUP);

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
  addEvent(alltabsPopup, 'command', (aEvent) => {
    let menuitem = aEvent.target;

    if (menuitem.parentNode.id !== kID.ALLTABS_POPUP) {
      return;
    }

    if (menuitem.tab && menuitem.tab.selected) {
      gBrowser.tabContainer.mTabstrip.ensureElementIsVisible(menuitem.tab);
    }
  }, false);

  /**
   * Show the URL of a suspended tab to the status field when a menuitem is
   * on active.
   *
   * @note This is a workaround for a suspended tab by TabEx.uc.js.
   */
  addEvent(alltabsPopup, 'DOMMenuItemActive', (aEvent) => {
    let menuitem = aEvent.target;

    if (menuitem.parentNode.id !== kID.ALLTABS_POPUP) {
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
        (openInfo && openInfo.URL !== 'about:blank' && openInfo.URL) ||
        gBrowser.getBrowserForTab(tab).userTypedValue;

      // @see chrome://browser/content/browser.js::XULBrowserWindow::setOverLink
      window.XULBrowserWindow.setOverLink(loadingURL, null);
    }
  }, false);

  /**
   * Update the state of a menuitem for an unread tab.
   *
   * @note This is a workaround for an unread tab handled by TabEx.uc.js.
   */
  addEvent(alltabsPopup, 'popupshowing', (aEvent) => {
    let popup = aEvent.target;

    if (popup.id !== kID.ALLTABS_POPUP) {
      return;
    }

    Array.forEach(popup.childNodes, (menuitem) => {
      if (menuitem.tab) {
        setStateForUnreadTab(menuitem, menuitem.tab);
      }
    });

    gBrowser.tabContainer.
      addEventListener('TabAttrModified', onTabAttrModified, false);
  }, false);

  addEvent(alltabsPopup, 'popuphiding', (aEvent) => {
    let popup = aEvent.target;

    if (popup.id !== kID.ALLTABS_POPUP) {
      return;
    }

    gBrowser.tabContainer.
      removeEventListener('TabAttrModified', onTabAttrModified, false);
  }, false);

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

  const kID = {
    lockButton: 'ucjs_Misc_CommonFindbar_lockButton'
  };

  let mIsLocked = false;
  let mFindString = null;

  window.ucjsUI.FindBar.register({
    onCreate: onCreate
  });

  function onCreate(aParam) {
    let {findBar} = aParam;

    findBar.appendChild($E('toolbarbutton', {
      label: 'Lock',
      accesskey: 'l',
      tooltiptext: 'Use the same find string in all tabs',
      type: 'checkbox',
      class: kID.lockButton
    }));
  }

  function getLockButton() {
    // Get the lock button if a findbar in the current tab is initialized.
    // @note Avoid creating a needless findbar once the lazy getter |gFindBar|
    // is called.
    if (gBrowser.isFindBarInitialized(gBrowser.selectedTab)) {
      return gFindBar.getElementsByClassName(kID.lockButton)[0];
    }

    return null;
  }

  addEvent(gBrowser.mPanelContainer, 'command', handleEvent, false);
  addEvent(gBrowser.mPanelContainer, 'find', handleEvent, false);
  addEvent(gBrowser.tabContainer, 'TabSelect', handleEvent, false);

  function handleEvent(aEvent) {
    const {FindBar} = window.ucjsUI;

    switch (aEvent.type) {
      case 'command': {
        let button = aEvent.target;

        let lockButton = getLockButton();

        if (lockButton && button === lockButton) {
          mIsLocked = button.checked;
          mFindString = mIsLocked ? FindBar.findText.value : null;
        }

        break;
      }

      case 'find': {
        if (mIsLocked) {
          mFindString = FindBar.findText.value;
        }

        break;
      }

      case 'TabSelect': {
        if (mIsLocked) {
          FindBar.open();

          if (FindBar.findText.value !== mFindString) {
            FindBar.reset();

            // Find the text in background.
            FindBar.findText.value = mFindString;
          }
        }

        let lockButton = getLockButton();

        if (lockButton) {
          lockButton.checked = mIsLocked;
        }

        break;
      }
    }
  }

})();


})(this);
