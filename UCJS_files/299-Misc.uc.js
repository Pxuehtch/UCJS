// ==UserScript==
// @name        Misc.uc.js
// @description Miscellaneous customizations
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js, TabEx.uc.js
// @note some about:config preferences are changed. see @pref
// @note some default functions are modified. see @modified


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
 * Customizes the tooltip of a tab
 *
 * @require TabEx.uc.js
 *
 * TODO: create a custom tooltip with more information instead of overwriting
 * a default tooltip
 */
(function() {

  addEvent($ID('tabbrowser-tab-tooltip'), 'popupshowing', onPopup, false);

  function onPopup(aEvent) {
    aEvent.stopPropagation();

    let tab = window.document.tooltipNode;

    if (tab.localName !== 'tab' || tab.mOverCloseButton) {
      return;
    }

    // WORKAROUND: the tooltip is delayed-shown after a tab under a cursor is
    // removed (e.g. clicking the middle button of mouse on the tab). so, this
    // tooltip is useless
    if (!tab.linkedBrowser) {
      return;
    }

    let tooltip = aEvent.target;
    let referrer = window.ucjsTabEx.referrer;

    // add the information of the parent tab to a tab which is newly opened
    if (!tab.linkedBrowser.canGoBack && referrer.exists(tab)) {
      // the document title is fetched by async history API
      referrer.fetchTitle(tab, (aTitle) => {
        // a tooltip label would be set with a tab label by Fx native function
        // @see chrome://browser/content/tabbrowser.xml::createTooltip
        let label = tooltip.label + '\n\nFrom: ' + aTitle;

        tooltip.setAttribute('label', label);
      });
    }
  }

})();

/**
 * Shows a long URL text without cropped in a tooltip of the URL bar
 */
(function() {

  let tooltip = $ID('mainPopupSet').appendChild(
    $E('tooltip', {
      id: 'ucjs_misc_URLTooltip',
      style: 'word-break:break-all;word-wrap:break-word;'
    })
  );

  const kTooltipShowDelay = 500; // [ms]
  let tooltipTimer = null;

  // TODO: in Fx29, the URL tooltip shows even if the URL does not overflow at
  // startup. I guess that the overflow event occurs at startup, and leave
  // |gURLBar._contentIsCropped| to true until a long URL loads
  // WORKAROUND: reset to false, but it may be wrong timing
  gURLBar._contentIsCropped = false;

  // @modified chrome://browser/content/urlbarBindings.xml::_initURLTooltip
  gURLBar._initURLTooltip =
  function ucjsMisc_uncropTooltip_initURLTooltip() {
    if (this.focused || !this._contentIsCropped || tooltipTimer) {
      return;
    }

    tooltipTimer = setTimeout(() => {
      tooltip.label = this.value;
      tooltip.maxWidth = this.boxObject.width;
      tooltip.openPopup(this, 'after_start', 0, 0, false, false);
    }, kTooltipShowDelay);
  };

  // @modified chrome://browser/content/urlbarBindings.xml::_hideURLTooltip
  gURLBar._hideURLTooltip =
  function ucjsMisc_uncropTooltip_hideURLTooltip() {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }

    tooltip.hidePopup();
    tooltip.label = '';
  };

})();

/**
 * Ensure that a popup menu is detected
 */
(function() {

  // @modified chrome://browser/content/utilityOverlay.js::closeMenus
  Function('window.closeMenus =' +
    window.closeMenus.toString().
    replace(/node\.tagName/g, 'node.localName')
  )();

})();

/**
 * Relocates the scroll-buttons when tabs overflowed on the tab bar
 */
(function relocateTabbarScrollButtons() {

  // @note the margin of a pinned tab is 3px
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
      // add the margin of a pinned tab
      'width += tab.getBoundingClientRect().width + 3;'
    )
  )();

  // recalc the positions
  gBrowser.tabContainer._positionPinnedTabs();

})();

/**
 * Suppress continuous focusing with holding the TAB-key down
 */
(function() {

  addEvent(gBrowser.mPanelContainer, 'keypress', (event) => {
    if (event.keyCode === event.DOM_VK_TAB) {
      if (event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
  }, true);

})();

/**
 * TAB-key focusing handler
 *
 * @require UI.uc.js
 */
(function() {

  // Toggles TAB-key focusing behavior

  // @pref
  // 1: Give focus to text fields only
  // 7: Give focus to focusable text fields, form elements, and links[default]
  // @see http://kb.mozillazine.org/Accessibility.tabfocus
  const kPrefTabFocus = 'accessibility.tabfocus';

  let defaultTabFocus = getPref(kPrefTabFocus);

  addEvent(window, 'unload', () => {
    setPref(kPrefTabFocus, defaultTabFocus);
  }, false);

  // WORKAROUND: use 'var' instead of 'let';
  // in Fx27, a syntax error occurs when using 'let' in <oncommand>;
  // SyntaxError: missing ; before statement browser.xul:1
  let command = '\
    (function() {\
      var state = ucjsUtil.Prefs.get("%kPrefTabFocus%") !== 1 ? 1 : 7;\
      ucjsUtil.Prefs.set("%kPrefTabFocus%", state);\
      ucjsUI.StatusField.message("TAB focus: " + (state === 1 ?\
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

  // gives focus on the content area
  $ID('mainKeyset').appendChild($E('key', {
    id: 'ucjs_key_focusInContentArea',
    key: 'f',
    modifiers: 'control,alt',
    oncommand: 'gBrowser.contentDocument.documentElement.focus();'
  }));

})();

/**
 * Content area link click handler
 */
(function() {

  addEvent(gBrowser.mPanelContainer, 'mousedown', onMouseDown, true);

  function onMouseDown(aEvent) {
    let link;

    if (aEvent.button !== 0 ||
        !isHtmlDocument(aEvent.target.ownerDocument) ||
        !(link = getLink(aEvent.target))) {
      return;
    }

    /**
     * get rid of target="_blank" links
     */
    if (/^(?:_blank|_new|blank|new)$/i.test(link.target)) {
      link.target = '_top';
    }
  }

  function isHtmlDocument(aDocument) {
    if (aDocument instanceof HTMLDocument &&
        /^https?/.test(aDocument.URL)) {
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

    // @note the initial node may be a text node
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
 * Add 'Open new tab' menu in the tab-context-menu
 */
(function() {

  let menu = $E('menu', {
    id: 'ucjs_tabContext_openNewTab',
    label: '新しいタブ',
    accesskey: 'N'
  });

  let popup = menu.appendChild($E('menupopup', {
    onpopupshowing: 'event.stopPropagation();'
  }));

  popup.appendChild($E('menuitem', {
    label: 'スタートページ',
    oncommand: 'ucjsUtil.openHomePages();',
    accesskey: 'S'
  }));

  [['about:home', 'H'], ['about:newtab', 'N'], ['about:blank', 'B']].
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
 * Show a status text in the URL bar
 *
 * @note the default status panel is used when the fullscreen mode
 *
 * TODO: fix the position gap of status panel (often in page loading)
 */
(function() {

  const kState = {
    hidden: 'ucjs_statusInURLBar_hidden'
  };

  /**
   * Fx native UI elements
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

    // TODO: should I change the timing of updating the size in order to just
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
 * The clear scrollbar
 *
 * @note the setting for the themes of my Firefox and OS
 */
(function() {

  // @note Firefox allows to style scrollbars only to the styles applied with
  // agent-style-sheets
  // @see https://developer.mozilla.org/en-US/docs/Using_the_Stylesheet_Service#Using_the_API
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

})();


})(this);
