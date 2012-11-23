// ==UserScript==
// @name        Misc.uc.js
// @description Miscellaneous customizations.
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @note Some about:config preferences are changed. see @pref.
// @note Some default functions are modified. see @modified.


(function() {


"use strict";


// Sets margins of Firefox window
// @note This setting is for my own windows theme.
// TODO: |chromemargin| is reset after returning from the print-preview.
// TODO: A window layout sometimes breaks after returning from the fullscreen.
(function() {

  var mainWindow = $ID('main-window');
  mainWindow.setAttribute('chromemargin', '0,0,0,0');
  mainWindow.style.border = '1px solid #000099';

})();


// Closes all windows when browser window is shutdown.
(function() {

  addEvent([window, 'unload', function() {
    if (!ucjsUtil.getWindowList().hasMoreElements()) {
      goQuitApplication();
    }
  }, false]);

})();


// Calling the WebSearch command at the search bar hidden puts a quick alias
// in the address bar.
// @note Alias is set as a keyword of the default engine at a search engines
// manager.
// @see http://d.hatena.ne.jp/Griever/20110603/1307109954
(function() {

  // @modified chrome://browser/content/browser.js::BrowserSearch::webSearch
  Function('BrowserSearch.webSearch = ' +
    BrowserSearch.webSearch.toString().replace(
      '} else {',
      '\
      } else if (isElementVisible(gURLBar) &&\
                 Services.search.defaultEngine.alias) {\
        gURLBar.value = Services.search.defaultEngine.alias + " ";\
        gURLBar.focus();\
        let len = gURLBar.value.length;\
        gURLBar.inputField.setSelectionRange(len, len);\
      } else {\
      '.
      replace(/\s+/g, ' ')
  ))();

})();


// Modify a title of bookmark and history item.
(function() {

  // @modified resource:///modules/PlacesUIUtils.jsm::
  // PlacesUIUtils::getBestTitle
  var $getBestTitle = PlacesUIUtils.getBestTitle;

  PlacesUIUtils.getBestTitle = function(aNode, aDoNotCutTitle) {
    var title;

    if (!aNode.title && PlacesUtils.uriTypes.indexOf(aNode.type) !== -1) {
      try {
        // PlacesUtils._uri() will throw if aNode.uri is not a valid URI.
        PlacesUtils._uri(aNode.uri);
        // Use raw URL.
        title = aNode.uri;
      } catch (e) {
        // Use clipped URL for non-standard URIs (e.g. data:, javascript:).
        title = aNode.uri.substr(0, 32) + this.ellipsis;
      }
    } else {
      title = aNode.title;
    }

    return title || this.getString('noTitle');
  };

})();


// Shows a long URL text without cropped in tooltip of URL bar.
(function() {

  // @see chrome://browser/content/browser.xul::<tooltip id="urlTooltip">
  $ID('urlTooltip').removeAttribute('crop');

  // @modified chrome://browser/content/urlbarBindings.xml::_initURLTooltip
  $ID('urlbar')._initURLTooltip = function() {
    if (this.focused || !this._contentIsCropped || this._tooltipTimer)
      return;

    this._tooltipTimer = setTimeout(function() {
      this._urlTooltip.firstChild.textContent = this.value;
      this._urlTooltip.maxWidth = this.boxObject.width;
      this._urlTooltip.openPopup(this, 'after_start', 0, 0, false, false);
    }.bind(this), 500);
  };

})();


// Ensure that popup menu is detected.
(function() {

  // @modified chrome://browser/content/utilityOverlay.js::closeMenus
  Function('window.closeMenus =' +
    window.closeMenus.toString().replace(/node\.tagName/g, 'node.localName')
  )();

})();


// Relocates the scroll-buttons at tab overflowed.
(function() {

  // margin of a pinned tab is 3px.
  setChromeCSS('\
    .tabbrowser-arrowscrollbox>.arrowscrollbox-scrollbox{-moz-box-ordinal-group:1}\
    .tabbrowser-arrowscrollbox>.scrollbutton-up{-moz-box-ordinal-group:2}\
    .tabbrowser-arrowscrollbox>.scrollbutton-down{-moz-box-ordinal-group:3}\
    .tabbrowser-arrowscrollbox>.scrollbutton-up{margin-left:3px!important;}\
    .tabbrowser-tab[pinned]{margin-right:3px!important;}\
  ');

  // @modified chrome://browser/content/tabbrowser.xml::_positionPinnedTabs
  Function('gBrowser.tabContainer._positionPinnedTabs =' +
    gBrowser.tabContainer._positionPinnedTabs.toString().
    replace(
      'let scrollButtonWidth = this.mTabstrip._scrollButtonDown.getBoundingClientRect().width;',
      'let scrollButtonWidth = 0;'
    ).replace(
      'width += tab.getBoundingClientRect().width;',
      // add margin of a pinned tab.
      'width += tab.getBoundingClientRect().width + 3;'
    )
  )();

  // recalc the positions.
  gBrowser.tabContainer._positionPinnedTabs();

})();


// Suppress continuous focus with holding TAB-key down.
(function() {

  var tabPressed = false;

  addEvent([gBrowser.mPanelContainer, 'keypress', function (event) {
    if (event.keyCode === event.DOM_VK_TAB) {
      if (tabPressed) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      tabPressed = true;
    }
  }, true]);

  addEvent([gBrowser.mPanelContainer, 'keyup', function (event) {
    if (event.keyCode === event.DOM_VK_TAB) {
      tabPressed = false;
    }
  }, true]);

})();


// Tab-key focusing handler.
// @require UI.uc.js
(function() {

  // Toggles TAB-key focusing behavor.

  // @pref see http://kb.mozillazine.org/Accessibility.tabfocus
  // 1: Give focus to text fields only.
  // 7: Give focus to focusable text fields, form elements, and links.
  // (default)
  const kPrefTabFocus = 'accessibility.tabfocus';

  var defaultTabFocus = getPref(kPrefTabFocus);
  addEvent([window, 'unload', function(e) {
    setPref(kPrefTabFocus, defaultTabFocus);
  }, false]);

  var command = '\
    (function(){\
      var state = ucjsUtil.getPref("%kPrefTabFocus%") !== 1 ? 1 : 7;\
      ucjsUtil.setPref("%kPrefTabFocus%", state);\
      ucjsUI.StatusField.update("TAB focus: " + (state === 1 ?\
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


// Disables function with alt+click on link. (default function: download of
// the link)
(function() {

  addEvent([gBrowser.mPanelContainer, 'click', function(event) {
    if (event.altKey && event.button === 0 && getLink(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true]);

})();


// Gets rid of target="_blank" links.
(function() {

  addEvent([gBrowser.mPanelContainer, 'mousedown', handleEvent, false]);

  function handleEvent(aEvent) {
    var node = aEvent.target;

    if (checkDocument(node.ownerDocument)) {
      let link = getLink(node);

      if (link && /^(?:_blank|_new|blank|new)$/i.test(link.target)) {
        link.target = "_top";
      }
    }
  }

  function checkDocument(aDocument)
    aDocument instanceof HTMLDocument && /^https?/.test(aDocument.URL);

})();


// Add 'open new tab' menu in the tab-context-menu.
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

  gBrowser.tabContextMenu.insertBefore(menu, $ID('context_undoCloseTab'));

})();


// Show status text in URL bar
// @note In fullscreen mode, the default statusbar is used
// @require UI.uc.js
// TODO: When the toolbar is customized, the statusfield in the urlbar is lost
(function() {
  // Move '#statusbar-display' before 'input.urlbar-input' to control them by
  // CSS
  var urlbarTextbox = ucjsUI.URLBar.textBox;
  urlbarTextbox.insertBefore(ucjsUI.StatusField.textBox,
    urlbarTextbox.firstChild);

  // Set the position of a status display
  // @modified chrome://browser/content/browser.js::
  // XULBrowserWindow::updateStatusField
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


// Utilities.

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

function $ID(aId)
  document.getElementById(aId);


// Imports.

function $E(aTag, aAttribute)
  ucjsUtil.createNode(aTag, aAttribute);

function $ANONID(aId, aNode)
  ucjsUtil.getNodeByAnonid(aId, aNode);

function U(aText)
  ucjsUtil.convertForSystem(aText);

function setChromeCSS(aCSS)
  ucjsUtil.setChromeStyleSheet(aCSS);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function getPref(aKey)
  ucjsUtil.getPref(aKey);

function setPref(aKey, aVal)
  ucjsUtil.setPref(aKey, aVal);

function log(aMsg)
  ucjsUtil.logMessage('Misc.uc.js', aMsg);


})();
