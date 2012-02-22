// ==UserScript==
// @name        Misc.uc.js
// @description Miscellaneous customizations.
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @note Some about:config preferences are changed. search setPref.
// @note Some default functions are modified. search @modified.


(function() {


"use strict";


// Sets margins of browser window.
(function() {

  $ID('main-window').setAttribute('chromemargin', '0,2,2,1');

})();


// Closes all windows when browser window is shutdown.
(function() {

  addEvent([window, 'unload', function() {
    if (!ucjsUtil.getWindowList().hasMoreElements()) {
      goQuitApplication();
    }
  }, false]);

})();


// Calling the WebSearch command at the search bar hidden puts a quick alias in the address bar.
// Alias is set as a keyword of the default engine at a search engines manager.
// @note cf. http://d.hatena.ne.jp/Griever/20110603/1307109954
(function() {

  // @modified chrome://browser/content/browser.js::BrowserSearch::webSearch
  eval('BrowserSearch.webSearch = ' + BrowserSearch.webSearch.toString().replace(
    '} else {',
    '\
      } else if (Services.search.defaultEngine.alias && isElementVisible(gURLBar)) {\
        gURLBar.value = Services.search.defaultEngine.alias + " ";\
        gURLBar.focus();\
        gURLBar.inputField.setSelectionRange(gURLBar.value.length, gURLBar.value.length);\
      } else {\
    '
  ));

})();


// Modify a title of bookmark and history item.
(function() {

  // @modified resource://gre/modules/PlacesUIUtils.jsm::PlacesUIUtils::getBestTitle
  var $getBestTitle = PlacesUIUtils.getBestTitle;

  PlacesUIUtils.getBestTitle = function(aNode) {
    var title;

    if (!aNode.title && PlacesUtils.uriTypes.indexOf(aNode.type) !== -1) {
      try {
        // PlacesUtils._uri() will throw if aNode.uri is not a valid URI.
        PlacesUtils._uri(aNode.uri);
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

  // @see chrome://browser/content/browser.xul
  $ID('urlTooltip').removeAttribute('crop');

  // @modified chrome://browser/content/urlbarBindings.xml::_initURLTooltip
  $ID('urlbar')._initURLTooltip = function() {
    if (this.focused || !this._contentIsCropped || this._tooltipTimer)
      return;

    this._tooltipTimer = setTimeout(function(self) {
      self._urlTooltip.firstChild.textContent = self.value;
      self._urlTooltip.maxWidth = self.boxObject.width;
      self._urlTooltip.openPopup(self, 'after_start', 0, 0, false, false);
    }, 500, this);
  };

})();


// Ensure that popup menu is detected.
(function() {

  // @modified chrome://browser/content/utilityOverlay.js::closeMenus
  eval('window.closeMenus =' +
    window.closeMenus.toString().replace(/node\.tagName/g, 'node.localName')
  );

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
  eval('gBrowser.tabContainer._positionPinnedTabs =' +
    gBrowser.tabContainer._positionPinnedTabs.toString().
    replace(
      'let scrollButtonWidth = this.mTabstrip._scrollButtonDown.scrollWidth;',
      'let scrollButtonWidth = 0;'
    ).replace(
      'width += tab.scrollWidth;',
      'width += tab.scrollWidth + 3;' // add margin of a pinned tab.
    )
  );

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

  // @note cf. http://kb.mozillazine.org/Accessibility.tabfocus
  // 1: Give focus to text fields only.
  // 7: Give focus to focusable text fields, form elements, and links. (default)
  const kPrefTabFocus = 'accessibility.tabfocus';

  var defaultTabFocus = getPref(kPrefTabFocus);
  addEvent([window, 'unload', function(e) {setPref(kPrefTabFocus, defaultTabFocus);}, false]);

  var command = '\
    (function(){\
      var state = ucjsUtil.getPref("%kPrefTabFocus%") !== 1 ? 1 : 7;\
      ucjsUtil.setPref("%kPrefTabFocus%", state);\
      ucjsUI.StatusField.update("TAB focus: " + (state === 1 ? "text fields only." : "text fields, form elements, and links."));\
    })();\
  '
  .replace(/%kPrefTabFocus%/g, kPrefTabFocus);

  $ID('mainKeyset').appendChild($E('key', {
    id: 'ucjs_key_toggleTabFocus',
    key: 'q',
    modifiers: 'shift,control',
    oncommand: command
  }));

  // Focuses in content area.
  $ID('mainKeyset').appendChild($E('key', {
    id: 'ucjs_key_focusInContentArea',
    key: 'q',
    modifiers: 'control',
    oncommand: 'gBrowser.contentDocument.documentElement.focus();'
  }));

})();


// Disables function with alt+click on link. (default function: download of the link)
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


// Show status text in a URL bar.
// @note In fullscreen, uses the default status field.
// @require UI.uc.js
(function() {
  // Move status-text-field in url-bar to control the visibility of status text by CSS.
  ucjsUI.URLBar.textBox.appendChild(ucjsUI.StatusField.textBox);

  // Set the position of a status display.

  // @modified chrome://browser/content/browser.js::XULBrowserWindow::updateStatusField
  var $updateStatusField = XULBrowserWindow.updateStatusField;
  XULBrowserWindow.updateStatusField = function() {
    var style = this.statusTextField.style;
    if (!window.fullScreen) {
      let {offsetWidth: width, offsetLeft: left, offsetTop: top} = ucjsUI.URLBar.textBox.children[0];

      if (style.width !== width + 'px') {
        style.width = style.maxWidth = width + 'px';
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
        style.removeProperty('max-width');
        style.removeProperty('left');
        style.removeProperty('top');
      }
    }

    $updateStatusField.apply(this, arguments);
  };

  setChromeCSS('\
    #main-window:not([inFullscreen]) #statusbar-display\
    {\
      -moz-appearance:none!important;\
      margin:0!important;\
      padding:0!important;\
      background-image:-moz-linear-gradient(hsl(0,0%,95%),hsl(0,0%,80%))!important;\
      border-radius:1.5px!important;\
    }\
    #main-window:not([inFullscreen]) .statuspanel-inner\
    {\
      height:1em!important;\
    }\
    #main-window:not([inFullscreen]) .statuspanel-inner:before\
    {\
      display:inline-block;\
      content:">";\
      color:gray;\
      font-weight:bold;\
      margin:0 2px;\
    }\
    #main-window:not([inFullscreen]) .statuspanel-label\
    {\
      margin:0!important;\
      padding:0!important;\
      border:none!important;\
      background:none transparent!important;\
    }\
    #main-window:not([inFullscreen]) #urlbar:hover #statusbar-display,\
    #main-window:not([inFullscreen]) #urlbar[focused="true"] #statusbar-display\
    {\
      display:none!important;\
    }\
  ');
})();


// Utilities.

function getLink(aNode) {
  while (aNode) {
    if (aNode.nodeType === Node.ELEMENT_NODE &&
         (aNode instanceof HTMLAnchorElement ||
          aNode instanceof HTMLAreaElement ||
          aNode.getAttributeNS('http://www.w3.org/1999/xlink', 'type') === 'simple'))
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
