// ==UserScript==
// @name        Misc.uc.js
// @description Miscellaneous customizations.
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @note Some about:config preferences are changed. see @pref.
// @note Some default functions are modified. see @modified.
// @note Some properties are exposed to the global scope.
// |window.ucjsMisc.XXX|


var ucjsMisc = {};

(function(window, undefined) {


"use strict";


/**
 * Sets style of Firefox window
 * @note This setting is for the themes of my Firefox and OS.
 *
 * TODO: |chromemargin| is reset after returning from the print-preview.
 * WORKAROUND: key command 'Alt+0', see Overlay.uc.xul::ucjs_key_ResetMargin
 *
 * TODO: A window layout sometimes breaks after returning from the fullscreen.
 */
(function setMainWindowStyle() {

  var mainWindow = $ID('main-window');
  mainWindow.setAttribute('chromemargin', '0,0,0,0');
  mainWindow.style.border = '1px solid #000099';

})();

/**
 * Modify the title of a bookmark/history item
 */
(function() {

  // @modified resource:///modules/PlacesUIUtils.jsm::
  // PlacesUIUtils::getBestTitle
  const {PlacesUIUtils} = window;

  PlacesUIUtils.getBestTitle = function(aNode, aDoNotCutTitle) {
    var title;

    if (!aNode.title && PlacesUtils.uriTypes.indexOf(aNode.type) !== -1) {
      try {
        // PlacesUtils._uri() will throw if aNode.uri is not a valid URI.
        PlacesUtils._uri(aNode.uri);
        // Use raw URL.
        title = aNode.uri;
      } catch (ex) {
        // Use clipped URL for non-standard URIs (e.g. data:, javascript:).
        title = aNode.uri.substr(0, 32) + this.ellipsis;
      }
    } else {
      title = aNode.title;
    }

    return title || this.getString('noTitle');
  };

})();

/**
 * Shows a long URL text without cropped in a tooltip of the URL bar
 */
(function() {

  var tooltip = $ID('mainPopupSet').appendChild(
    $E('tooltip', {
      id: 'ucjs_misc_urltooltip'
    })
  );

  let tooltipTimer = null;

  // @modified chrome://browser/content/urlbarBindings.xml::
  // _initURLTooltip
  $ID('urlbar')._initURLTooltip = function() {
    if (this.focused || !this._contentIsCropped || tooltipTimer) {
      return;
    }

    tooltipTimer = setTimeout(function() {
      tooltip.label = this.value;
      tooltip.maxWidth = this.boxObject.width;
      tooltip.openPopup(this, 'after_start', 0, 0, false, false);
    }.bind(this), 500);
  };

  // @modified chrome://browser/content/urlbarBindings.xml::
  // _hideURLTooltip
  $ID('urlbar')._hideURLTooltip = function() {
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

  // @modified chrome://browser/content/utilityOverlay.js::
  // closeMenus
  Function('window.closeMenus =' +
    window.closeMenus.toString().
    replace(/node\.tagName/g, 'node.localName')
  )();

})();

/**
 * Relocates the scroll-buttons when tabs overflowed on the tab bar
 */
(function() {

  // the margin of a pinned tab is 3px
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

  // @modified chrome://browser/content/tabbrowser.xml::
  // _positionPinnedTabs
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

  var tabPressed = false;

  addEvent([gBrowser.mPanelContainer, 'keypress',
  function (event) {
    if (event.keyCode === event.DOM_VK_TAB) {
      if (tabPressed) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      tabPressed = true;
    }
  }, true]);

  addEvent([gBrowser.mPanelContainer, 'keyup',
  function (event) {
    if (event.keyCode === event.DOM_VK_TAB) {
      tabPressed = false;
    }
  }, true]);

})();

/**
 * TAB-key focusing handler
 * @require UI.uc.js
 */
(function() {

  // Toggles TAB-key focusing behavor.

  // @pref see http://kb.mozillazine.org/Accessibility.tabfocus
  // 1: Give focus to text fields only
  // 7: Give focus to focusable text fields, form elements, and links[default]
  const kPrefTabFocus = 'accessibility.tabfocus';

  var defaultTabFocus = getPref(kPrefTabFocus);
  addEvent([window, 'unload', function() {
    setPref(kPrefTabFocus, defaultTabFocus);
  }, false]);

  var command = '\
    (function(){\
      var state = ucjsUtil.getPref("%kPrefTabFocus%") !== 1 ? 1 : 7;\
      ucjsUtil.setPref("%kPrefTabFocus%", state);\
      ucjsUI.StatusField.message("TAB focus: " + (state === 1 ?\
      "text fields only." : "text fields, form elements, and links."));\
    })();\
  '
  .replace(/\s+/g, ' ')
  .replace(/%kPrefTabFocus%/g, kPrefTabFocus);

  $ID('mainKeyset').appendChild($E('key', {
    id: 'ucjs_key_toggleTabFocus',
    key: 'q',
    modifiers: 'shift,control',
    oncommand: command
  }));

  // Gives focus on the content area.
  $ID('mainKeyset').appendChild($E('key', {
    id: 'ucjs_key_focusInContentArea',
    key: 'q',
    modifiers: 'control',
    oncommand: 'gBrowser.contentDocument.documentElement.focus();'
  }));

})();

/**
 * Content area link click handler
 */
(function() {

  addEvent([gBrowser.mPanelContainer, 'mousedown', onMouseDown, false]);

  function onMouseDown(aEvent) {
    let node = aEvent.target;

    if (!isHtmlDocument(node.ownerDocument)) {
      return;
    }

    let link = getLink(node);

    /**
     * Gets rid of target="_blank" links
     */
    if (link && /^(?:_blank|_new|blank|new)$/i.test(link.target)) {
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
    while (aNode) {
      if (aNode.nodeType === Node.ELEMENT_NODE &&
           (aNode instanceof HTMLAnchorElement ||
            aNode instanceof HTMLAreaElement ||
            aNode.getAttributeNS('http://www.w3.org/1999/xlink', 'type') ===
            'simple'))
        break;

      aNode = aNode.parentNode;
    }
    return aNode;
  }

})();

/**
 * Add 'Open new tab' menu in the tab-context-menu
 */
(function() {

  var menu, popup;

  menu = $E('menu', {
    id: 'ucjs_tabcontext_openNewTab',
    label: U('新しいタブ'),
    accesskey: 'N'
  });

  popup = menu.appendChild($E('menupopup', {
    onpopupshowing: 'event.stopPropagation();'
  }));

  popup.appendChild($E('menuitem', {
    label: U('スタートページ'),
    oncommand: 'ucjsUtil.openHomePages();',
    accesskey: 'S'
  }));

  [['about:home', 'H'], ['about:newtab', 'N'], ['about:blank', 'B']].
  forEach(function([url, accesskey]) {
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
 * Show the status text in the URL bar
 * @note The default statusbar is used when the fullscreen mode.
 * @require UI.uc.js
 *
 * TODO: The URLbar is initialized when the toolbar customization panel opens.
 * Observe it and fix our broken functions.
 * WORKAROUND: Restart Firefox after customizing.
 */
(function() {
  // move '#statusbar-display' before 'input.urlbar-input' to control them
  // by CSS
  attachStatusField();
  function attachStatusField() {
    const {ucjsUI} = window;
    let statusField = ucjsUI.StatusField.textBox;
    let urlbarTextbox = ucjsUI.URLBar.textBox;
    urlbarTextbox.insertBefore(statusField, urlbarTextbox.firstChild);
  }

  // Set the position of a status display
  // @modified chrome://browser/content/browser.js::
  // XULBrowserWindow::updateStatusField
  const {XULBrowserWindow} = window;
  var $updateStatusField = XULBrowserWindow.updateStatusField;
  XULBrowserWindow.updateStatusField = function() {
    // style of #statusbar-display
    var style = this.statusTextField.style;
    if (!window.fullScreen) {
      // input.urlbar-input
      let inputBox = this.statusTextField.nextSibling;
      let {offsetWidth: width, offsetLeft: left, offsetTop: top} = inputBox;

      if (style.width !== width + 'px') {
        style.width = width + 'px';
      }
      if (style.left !== left + 'px') {
        style.left = left + 'px';
      }
      if (style.top !== top + 'px') {
        style.top = top + 'px';
      }
    } else {
      if (style.width) {
        style.removeProperty('width');
        style.removeProperty('left');
        style.removeProperty('top');
      }
    }

    $updateStatusField.apply(this, arguments);
  };

  setChromeCSS('\
    #main-window:not([inFullscreen]) #statusbar-display{\
      -moz-appearance:none!important;\
      margin:0!important;\
      padding:0!important;\
      max-width:none!important;\
    }\
    #main-window:not([inFullscreen]) .statuspanel-inner{\
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
    #main-window:not([inFullscreen]) #urlbar:hover #statusbar-display,\
    #main-window:not([inFullscreen]) #urlbar[focused] #statusbar-display{\
      visibility:collapse!important;\
    }\
    #main-window:not([inFullscreen]) #urlbar:not(:hover):not([focused]) #statusbar-display:not([inactive])+.urlbar-input{\
      border-radius:1.5px!important;\
      background-color:hsl(0,0%,90%)!important;\
      color:hsl(0,0%,90%)!important;\
    }\
  ');
})();

/**
 * Clear scrollbars
 * @note This setting is for the themes of my Firefox and OS.
 */
(function() {

  // @note Firefox allows to style scrollbars only to the styles applied with
  // agent-style-sheets.
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

/**
 * Restart Firefox
 * @note a function |restartFx| is exposed to the global scope
 *
 * WORKAROUND:
 * In Fx19 'sessionstore.js' sometimes isn't updated at restart if the session
 * store crash recovery is disabled. So updates the session store forcibly.
 *
 * TODO:
 * use safe handling instead of pinning a tab to update the session.
 */
(function() {

  function restartFx(aOption) {
    const kPref_resume_from_crash = 'browser.sessionstore.resume_from_crash';
    const kWaitingTime = 5000;

    if (window.gPrivateBrowsingUI.privateBrowsingEnabled ||
        getPref(kPref_resume_from_crash, false) !== false) {
      doRestart(aOption);
      return;
    }

    // to pin a tab will update the session store
    let pinnedTab = gBrowser.addTab('about:blank');
    gBrowser.pinTab(pinnedTab);

    let stateUpdateTopic = 'sessionstore-state-write-complete';
    let stateUpdateObserver = true;
    window.Services.obs.addObserver(onStateUpdated, stateUpdateTopic, false);
    let waitingTimer = setTimeout(onTimeExpired, kWaitingTime);

    function cleanup() {
      if (pinnedTab) {
        // remove the dummy tab
        gBrowser.removeTab(pinnedTab);
        pinnedTab = null;
      }

      if (stateUpdateObserver) {
        window.Services.obs.removeObserver(onStateUpdated, stateUpdateTopic);
        stateUpdateObserver = false;
      }
      if (waitingTimer) {
        clearTimeout(waitingTimer);
        waitingTimer = null;
      }
    }

    function onStateUpdated() {
      cleanup();
      doRestart(aOption);
    }

    function onTimeExpired() {
      cleanup();

      let result = window.Services.prompt.confirm(
        null,
        'Misc.uc.js::RestartFx',
        'Preprocessing for restart is interrupted.\n' +
        'It takes time too much for updating the current session.\n' +
        '[OK]: You can force to restart, but the previous session may be restored.'
      );
      if (result) {
        doRestart(aOption);
      }
    }
  }

  function doRestart(aOption) {
    let {purgeCaches} = aOption || {}

    // @see chrome://global/content/globalOverlay.js::canQuitApplication
    if (!window.canQuitApplication('restart')) {
      return;
    }

    const {Services, Ci} = window;
    if (purgeCaches) {
      Services.appinfo.invalidateCachesOnRestart();
    }

    Services.startup.
    quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
  }

  // expose to the global scope
  window.ucjsMisc.restartFx = restartFx;

})();


//********** Utilities

function $ID(aId) {
  return window.document.getElementById(aId);
}


//********** Imports

function $E(aTag, aAttribute) {
  return window.ucjsUtil.createNode(aTag, aAttribute);
}

function $ANONID(aId, aNode) {
  return window.ucjsUtil.getNodeByAnonid(aId, aNode);
}

// |U()| converts embedded chars in the code for displaying properly.
function U(aText) {
  return window.ucjsUtil.toStringForUI(aText);
}

function setChromeCSS(aCSS) {
  return window.ucjsUtil.setChromeStyleSheet(aCSS);
}

function setGlobalAgentCSS(aCSS) {
  return window.ucjsUtil.setGlobalStyleSheet(aCSS, 'AGENT_SHEET');
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function getPref(aKey) {
  return window.ucjsUtil.getPref(aKey);
}

function setPref(aKey, aVal) {
  window.ucjsUtil.setPref(aKey, aVal);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('Misc.uc.js', aMsg);
}


})(this);
