// ==UserScript==
// @name        ListEx.uc.js
// @description Makes lists of tabs, windows and history.
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the main context menu.


(function(window, undefined) {


"use strict";


/**
 * Numbers of the listed items
 * @value {Integer} If set to 0, all *unlimited* items will be listed.
 * *[WARNING: It may be too long]*
 */
const kMaxListItems = 10;

/**
 * Identifiers
 */
const kID = {
  historyMenu: 'ucjs_listex_history_menu',
  openedMenu: 'ucjs_listex_opened_menu',
  closedMenu: 'ucjs_listex_closed_menu',
  startSeparator: 'ucjs_listex_startsep',
  endSeparator: 'ucjs_listex_endsep'
};


//********** Components

/**
 * Menu settings
 * @member init {function}
 */
var mMenu = (function() {

  function init() {
    var context = getContextMenu();
    var refItem = context.firstChild;

    function addSeparator(id) {
      context.insertBefore($E('menuseparator', {id: id}), refItem);
    }

    function addMenu(id, label, accesskey, build) {
      var menu = context.insertBefore($E('menu', {
        id: id,
        label: label,
        accesskey: accesskey
      }), refItem);
      addEvent([menu.appendChild($E('menupopup')),
        'popupshowing', build, false]);
    }

    addSeparator(kID.startSeparator);
    addMenu(kID.historyMenu, 'History Tab/Recent', 'H', mHistoryList.build);
    addMenu(kID.openedMenu, 'Opened Tab/Window', 'O', mOpenedList.build);
    addMenu(kID.closedMenu, 'Closed Tab/Window', 'C', mClosedList.build);
    addSeparator(kID.endSeparator);

    addEvent([context, 'popupshowing', showContextMenu, false]);
    addEvent([context, 'popuphiding', hideContextMenu, false]);
  }

  // @note ucjsUI_manageContextMenuSeparators() manages the visibility of
  // separators.
  function showContextMenu(aEvent) {
    if (aEvent.target !== getContextMenu()) {
      return;
    }

    // @see chrome://browser/content/nsContextMenu.js
    const {gContextMenu} = window;

    var hidden =
      gContextMenu.onLink ||
      gContextMenu.onTextInput ||
      gContextMenu.isTextSelected;

    [kID.historyMenu, kID.openedMenu, kID.closedMenu].
    forEach(function(id) {
      gContextMenu.showItem(id, !hidden);
    });
  }

  function hideContextMenu(aEvent) {
    if (aEvent.target !== getContextMenu()) {
      return;
    }

    [kID.historyMenu, kID.openedMenu, kID.closedMenu].
    forEach(function(id) {
      var menu = $ID(id);
      while (menu.itemCount) {
        menu.removeItemAt(0);
      }
    });
  }

  return {
    init: init
  };

})();

/**
 * List of the tab/recent history
 * @member build {function}
 */
var mHistoryList = (function() {

  // @see http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
  const kTimeFormat = '%Y/%m/%d %H:%M:%S';
  const kTitleFormat = ['[%time%] %title%', '%title%'];

  function build(aEvent) {
    aEvent.stopPropagation();

    var popup = aEvent.target;
    if (popup.hasChildNodes()) {
      return;
    }

    if (!buildTabHistory(popup)) {
      makeDisabledMenuItem(popup, 'Tab: No history.');
    }

    makeMenuSeparator(popup);

    if (!buildRecentHistory(popup)) {
      makeDisabledMenuItem(popup, 'Recent: No history.');
    }

    makeMenuSeparator(popup);

    popup.appendChild($E('menuitem', {
      label: 'Open History Manager',
      accesskey: 'H',
      command: 'Browser:ShowAllHistory'
    }));
  }

  function buildTabHistory(aPopup) {
    var sh = gBrowser.sessionHistory;
    if (sh.count < 1) {
      return false;
    }

    var entry;
    var [index, count] = [sh.index, sh.count];
    var [start, end] = getListRange(index, count);
    var className, action;

    for (let i = end - 1; i >= start; i--) {
      entry = sh.getEntryAtIndex(i, false);
      if (!entry) {
        continue;
      }

      className = ['menuitem-iconic'];
      action = null;

      if (i === index) {
        className.push('unified-nav-current');
      } else {
        className.push((i < index) ?
          'unified-nav-back' : 'unified-nav-forward');
        action = 'gotoHistoryIndex(event);';
      }

      // @note |menuitem| should be defined in loop because it is passed to
      // async callback of |getFavicon|
      let menuitem = aPopup.appendChild($E('menuitem', {
        label: formatLabel({
          time: getLastVisitTime(entry.URI),
          title: entry.title
        }),
        tooltiptext: entry.URI.spec,
        class: className.join(' '),
        index: i,
        action: action
      }));

      getFavicon(null, entry.URI, function(aIconURL) {
        $E(menuitem, {
          icon: aIconURL
        });
      });
    }

    return true;
  }

  function buildRecentHistory(aPopup) {
    var root = getRecentHistoryPlacesRoot();
    root.containerOpen = true;

    var node;
    var count = root.childCount;
    var currentURL = gBrowser.currentURI.spec;
    var URL, className, action;

    for (let i = 0; i < count; i++) {
      node = root.getChild(i);
      URL = node.uri
      className = ['menuitem-iconic'];
      action = null;

      if (currentURL === URL) {
        className.push('unified-nav-current');
      } else {
        // @see resource:///modules/PlacesUIUtils.jsm
        action =
          ('PlacesUIUtils.markPageAsTyped("%URL%");' +
           'openUILink("%URL%",event);').
          replace(/%URL%/g, URL);
      }

      // @note |menuitem| should be defined in loop because it is passed to
      // async callback of |getFavicon|
      let menuitem = aPopup.appendChild($E('menuitem', {
        label: formatLabel({
          time: node.time,
          title: getTitle(node.title, URL)
        }),
        tooltiptext: URL,
        class: className.join(' '),
        action: action
      }));

      getFavicon(node.icon, URL, function(aIconURL) {
        $E(menuitem, {
          icon: aIconURL
        });
      });
    }

    root.containerOpen = false;

    return (count > 0);
  }

  function getLastVisitTime(aURI) {
    if (aURI.schemeIs('about')) {
      return 0;
    }

    // @see resource:///modules/PlacesUtils.jsm
    const history = window.PlacesUtils.history;
    const {Ci} = window;

    var query, options, root;
    var time;

    query = history.getNewQuery();
    query.uri = aURI;

    options = history.getNewQueryOptions();
    options.queryType =
      Ci.nsINavHistoryQueryOptions.QUERY_TYPE_HISTORY;
    options.sortingMode =
      Ci.nsINavHistoryQueryOptions.SORT_BY_DATE_DESCENDING;
    options.maxResults = 1;

    root = history.executeQuery(query, options).root;
    root.containerOpen = true;
    try {
      time = root.getChild(0).time;
    } catch (ex) {}
    root.containerOpen = false;

    return time || 0;
  }

  function getRecentHistoryPlacesRoot() {
    // @see resource:///modules/PlacesUtils.jsm
    const history = window.PlacesUtils.history;
    const {Ci} = window;

    var query, options;
    query = history.getNewQuery();
    options = history.getNewQueryOptions();
    options.queryType =
      Ci.nsINavHistoryQueryOptions.QUERY_TYPE_HISTORY;
    options.sortingMode =
      Ci.nsINavHistoryQueryOptions.SORT_BY_DATE_DESCENDING;
    options.maxResults = kMaxListItems;

    return history.executeQuery(query, options).root;
  }

  function formatLabel(aValue) {
    let {time, title} = aValue;

    let form = time ? kTitleFormat[0] : kTitleFormat[1];
    if (time) {
      // convert microseconds into milliseconds
      time = (new Date(time / 1000)).toLocaleFormat(kTimeFormat);
      form = form.replace('%time%', time);
    }
    return form.replace('%title%', title);
  }

  return {
    build: build
  };

})();

/**
 * List of the opened tabs/windows
 * @member build {function}
 */
var mOpenedList = (function() {

  function build(aEvent) {
    aEvent.stopPropagation();

    var popup = aEvent.target;
    if (popup.hasChildNodes()) {
      return;
    }

    buildOpenedTabs(popup);
    makeMenuSeparator(popup);
    buildOpenedWindows(popup);
  }

  function buildOpenedTabs(aPopup) {
    var tabs = gBrowser.mTabs, tab;
    var className, action, item;

    for (let i = 0; i < tabs.length; i++) {
      tab = tabs[i];
      className = ['menuitem-iconic'];
      action = null;

      if (tab.selected) {
        className.push('unified-nav-current');
      } else {
        action = 'gBrowser.selectTabAtIndex(' + i + ');';
      }

      item = aPopup.appendChild($E('menuitem', {
        label: (i + 1) + '. ' + tab.label,
        tooltiptext: tab.linkedBrowser.currentURI.spec,
        icon: getFavicon(tab.getAttribute('image')),
        class: className.join(' '),
        action: action
      }));

      // indicate the state of an unread tab
      if (!tab.selected) {
        setStateForUnreadTab(item, tab);
      }
    }
  }

  function buildOpenedWindows(aPopup) {
    var wins = getWindowEnumerator(), win, winIndex = 0;
    var title, tip, icon, className, action;

    while (wins.hasMoreElements()) {
      win = wins.getNext();

      if (isBrowserWindow(win)) {
        let b = win.gBrowser;

        let tabs =
          [getPluralForm('[#1 #2]', b.mTabs.length, ['Tab', 'Tabs'])];
        let [start, end] =
          getListRange(b.mTabContainer.selectedIndex, b.mTabs.length);
        for (let j = start; j < end; j++) {
          tabs.push((j + 1) + '. ' + b.mTabs[j].label);
        }
        tip = tabs.join('\n');

        title = getTitle(b.contentTitle, b.currentURI.spec);
        icon = b.selectedTab.image;
      } else {
        title = win.document.title;
        tip = win.location.href;
        icon = 'moz-icon://.exe?size=16';
      }

      className = ['menuitem-iconic'];
      action = null;

      if (win === window) {
        className.push('unified-nav-current');
      } else {
        action = focusWindowAtIndex(winIndex);
      }

      aPopup.appendChild($E('menuitem', {
        label: title,
        tooltiptext: tip,
        icon: getFavicon(icon),
        class: className.join(' '),
        action: action
      }));

      winIndex++
    }
  }

  function getWindowEnumerator() {
    const {Cc, Ci} = window;

    return Cc['@mozilla.org/appshell/window-mediator;1'].
      getService(Ci.nsIWindowMediator).
      getEnumerator(null);
  }

  function isBrowserWindow(aWindow) {
    // @see chrome://browser/content/utilityOverlay.js::
    // getBrowserURL()
    return aWindow.location.href === window.getBrowserURL();
  }

  return {
    build: build
  };

})();

/**
 * List of the closed tabs/windows
 * @member build {function}
 */
var mClosedList = (function() {

  function build(aEvent) {
    aEvent.stopPropagation();

    var popup = aEvent.target;
    if (popup.hasChildNodes()) {
      return;
    }

    if (!buildClosedTabs(popup)) {
      makeDisabledMenuItem(popup, 'No closed tabs.');
    }

    makeMenuSeparator(popup);

    if (!buildClosedWindows(popup)) {
      makeDisabledMenuItem(popup, 'No closed windows.');
    }
  }

  function buildClosedTabs(aPopup) {
    var ss = getSessionStore();
    if (ss.getClosedTabCount(window) === 0) {
      return false;
    }

    var undoData = JSON.parse(ss.getClosedTabData(window)), data;
    var entries, history;

    for (let i = 0; i < undoData.length; i++) {
      data = undoData[i];
      entries = data.state.entries;
      history = [
        getPluralForm('[#1 History #2]',
        entries.length, ['entry', 'entries'])
      ];

      let [start, end] = getListRange(data.state.index, entries.length);
      for (let j = end - 1; j >= start; j--) {
        history.push((j + 1) + '. ' + getTitle(entries[j].title));
      }

      aPopup.appendChild($E('menuitem', {
        label: getTitle(data.title),
        tooltiptext: history.join('\n'),
        icon: getFavicon(data.image),
        class: 'menuitem-iconic',
        action: 'undoCloseTab(' + i + ');'
      }));
    }

    return true;
  }

  function buildClosedWindows(aPopup) {
    var ss = getSessionStore();
    if (ss.getClosedWindowCount() === 0) {
      return false;
    }

    var undoData = JSON.parse(ss.getClosedWindowData()), data;
    var tabs, tab;
    var icon;

    for (let i = 0; i < undoData.length; i++) {
      data = undoData[i];
      tabs = [getPluralForm('[#1 #2]', data.tabs.length, ['Tab', 'Tabs'])];

      let [start, end] = getListRange(data.selected - 1, data.tabs.length);
      let selected;
      for (let j = start; j < end; j++) {
        tab = data.tabs[j];
        selected = getTitle(tab.index && tab.entries[tab.index - 1].title);
        tabs.push((j + 1) + '. ' + selected);
      }

      icon = null;
      try {
        icon = data.tabs[data.selected - 1].attributes.image;
      } catch (ex) {}

      aPopup.appendChild($E('menuitem', {
        label: getTitle(data.title),
        tooltiptext: tabs.join('\n'),
        icon: getFavicon(icon),
        class: 'menuitem-iconic',
        action: 'undoCloseWindow(' + i + ');'
      }));
    }

    return true;
  }

  function getSessionStore() {
    const {Cc, Ci} = window;

    return Cc['@mozilla.org/browser/sessionstore;1'].
      getService(Ci.nsISessionStore);
  }

  return {
    build: build
  };

})();


//********** Utilities

function $ID(aID) {
  return window.document.getElementById(aID);
}

function $E(aTagOrNode, aAttribute) {
  let node = (typeof aTagOrNode === 'string') ?
    window.document.createElement(aTagOrNode) : aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value !== null && value !== undefined) {
        if (name === 'icon') {
          node.style.listStyleImage = 'url(' + value + ')';
        } else if (name === 'action') {
          node.setAttribute('oncommand', value);
          node.setAttribute('onclick', 'checkForMiddleClick(this,event);');
        } else {
          node.setAttribute(name, value);
        }
      }
    }
  }

  return node;
}

function makeDisabledMenuItem(aPopup, aLabel) {
  aPopup.appendChild($E('menuitem', {label: aLabel, disabled: true}));
}

function makeMenuSeparator(aPopup) {
  aPopup.appendChild($E('menuseparator'));
}

function getPluralForm(aFormat, aCount, aLabels) {
  return aFormat.
    replace('#1', aCount).
    replace('#2', aLabels[(aCount < 2) ? 0 : 1]);
}

function getListRange(aIndex, aCount) {
  var maxNum = kMaxListItems;
  if (maxNum <= 0) {
    return [0, aCount];
  }

  var half = Math.floor(maxNum / 2);
  var start = Math.max(aIndex - half, 0),
      end = Math.min((start > 0) ? aIndex + half + 1 : maxNum, aCount);
  if (end === aCount) {
    start = Math.max(aCount - maxNum, 0);
  }

  return [start, end];
}

function getTitle(aTitle, aURL) {
  if (!aTitle && aURL) {
    let URI = makeURI(aURL);
    if (URI) {
      aTitle = aURL;
    } else {
      // Clip non-standard URL. (e.g. data:, javascript:)
      aTitle = aURL.substr(0, 32) + '...';
    }
  }

  // @see resource:///modules/PlacesUIUtils.jsm
  return aTitle || window.PlacesUIUtils.getString('noTitle');
}

function getFavicon(aIconURL, aPageURI, aCallback) {
  // @see resource:///modules/PlacesUtils.jsm
  const {favicons} = window.PlacesUtils;

  if (aIconURL) {
    if (/^https?:/.test(aIconURL)) {
      aIconURL = 'moz-anno:favicon:' + aIconURL;
    }

    if (aCallback) {
      aCallback(aIconURL);
      return;
    }
    return aIconURL;
  }

  aPageURI = makeURI(aPageURI);
  if (!aPageURI) {
    return favicons.defaultFavicon.spec;
  }

  favicons.getFaviconURLForPage(aPageURI, function(aIconURI) {
    let iconURL;
    if (aIconURI) {
      try {
        iconURL = favicons.getFaviconLinkForIcon(aIconURI).spec;
      } catch (ex) {}
    }
    if (!iconURL && !/^https?:/.test(aPageURI.scheme)) {
      iconURL = getExtensionFavicon(aPageURI);
    }
    if (!iconURL) {
      iconURL = favicons.defaultFavicon.spec;
    }

    try {
      aCallback(iconURL);
    } catch (ex) {}
  });
}

function getExtensionFavicon(aURI) {
  let extension;
  try {
    extension = aURI.QueryInterface(window.Ci.nsIURL).fileExtension;
  } catch (ex) {}

  if (extension) {
    return 'moz-icon://.%EXT%?size=16'.replace('%EXT%', extension);
  }
  return null
}

function makeURI(aURL) {
  if (aURL && typeof aURL === 'string') {
    try {
      // @see chrome://global/content/contentAreaUtils.js::makeURI
      return window.makeURI(aURL, null, null);
    } catch (ex) {
      return null;
    }
  }
  return aURL;
}


//********** Imports

function getContextMenu() {
  return window.ucjsUI.ContentArea.contextMenu;
}

function setStateForUnreadTab(aMenuitem, aTab) {
  window.ucjsUI.Menuitem.setStateForUnreadTab(aMenuitem, aTab);
}

// @note For <oncommand> attribute.
function focusWindowAtIndex(aIndex) {
  return 'ucjsUtil.focusWindowAtIndex(' + aIndex + ');';
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('ListEx.uc.js', aMsg);
}


//********** Entry point

function ListEx_init() {
  mMenu.init();
}

ListEx_init();


})(this);
