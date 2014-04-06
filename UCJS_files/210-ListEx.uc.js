// ==UserScript==
// @name        ListEx.uc.js
// @description Makes lists of tabs, windows and history
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage access to items in the main context menu


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  XPCOM: {
    getModule
  },
  getNodeById: $ID,
  addEvent,
  asyncScanPlacesDB
} = window.ucjsUtil;

function $E(aTagOrNode, aAttribute) {
  return window.ucjsUtil.createNode(aTagOrNode, aAttribute, handleAttribute);
}

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('ListEx.uc.js', aMsg);
}

const {
  ContentArea: {
    contextMenu: contentAreaContextMenu
  },
  Menuitem: {
    setStateForUnreadTab
  }
} = window.ucjsUI;

/**
 * Preferences
 */
const kPref = {
  /**
   * Numbers of the listed items
   *
   * @value {integer} [>0]
   *
   * !!! WARNING !!!
   * *ALL* items will be listed if set to 0
   * It can cause performance problems
   * !!! WARNING !!!
   */
  maxListItems: 10
};

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

/**
 * Menu settings
 *
 * @member init {function}
 */
const mMenu = (function() {

  function init() {
    let context = contentAreaContextMenu;
    let refItem = context.firstChild;

    function addSeparator(aId) {
      context.insertBefore($E('menuseparator', {
        id: aId
      }), refItem);
    }

    function addMenu(aId, aLabel, aAccesskey, aHandler) {
      let menu = context.insertBefore($E('menu', {
        id: aId,
        label: aLabel,
        accesskey: aAccesskey
      }), refItem);

      addEvent(
        menu.appendChild($E('menupopup')),
        'popupshowing',
        (aEvent) => {
          buildMenu(aEvent, aHandler.build);
        },
        false
      );
    }

    addSeparator(kID.startSeparator);
    addMenu(kID.historyMenu, 'History Tab/Recent', 'H', mHistoryList);
    addMenu(kID.openedMenu, 'Opened Tab/Window', 'O', mOpenedList);
    addMenu(kID.closedMenu, 'Closed Tab/Window', 'C', mClosedList);
    addSeparator(kID.endSeparator);

    addEvent(context, 'popupshowing', showContextMenu, false);
    addEvent(context, 'popuphiding', hideContextMenu, false);
  }

  function buildMenu(aEvent, aBuilder) {
    aEvent.stopPropagation();

    let popup = aEvent.target;

    if (popup.hasChildNodes()) {
      return;
    }

    aBuilder(popup);
  }

  // @note |ucjsUI::manageContextMenuSeparators()| manages the visibility of
  // separators
  function showContextMenu(aEvent) {
    if (aEvent.target !== contentAreaContextMenu) {
      return;
    }

    // @see chrome://browser/content/nsContextMenu.js
    const {gContextMenu} = window;

    let hidden =
      gContextMenu.onLink ||
      gContextMenu.onTextInput ||
      gContextMenu.isTextSelected;

    [
      kID.historyMenu,
      kID.openedMenu,
      kID.closedMenu
    ].
    forEach((aId) => {
      gContextMenu.showItem(aId, !hidden);
    });
  }

  function hideContextMenu(aEvent) {
    if (aEvent.target !== contentAreaContextMenu) {
      return;
    }

    [
      kID.historyMenu,
      kID.openedMenu,
      kID.closedMenu
    ].
    forEach((aId) => {
      let menu = $ID(aId);
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
 *
 * @member build {function}
 */
const mHistoryList = (function() {

  // @see http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
  const kTimeFormat = '%Y/%m/%d %H:%M:%S';
  const kTitleFormat = ['[%time%] %title%', '%title%'];

  function build(aPopup) {
    if (!buildTabHistory(aPopup)) {
      makeDisabledMenuItem(aPopup, 'Tab: No history.');
    }

    makeMenuSeparator(aPopup);

    let recentHistorySep = makeMenuSeparator(aPopup);
    asyncBuildRecentHistory(recentHistorySep, (aHasBuilt) => {
      if (!aHasBuilt) {
        makeDisabledMenuItem(recentHistorySep, 'Recent: No history.');
      }
    });

    aPopup.appendChild($E('menuitem', {
      label: 'Open History Manager',
      accesskey: 'H',
      command: 'Browser:ShowAllHistory'
    }));
  }

  function buildTabHistory(aPopup) {
    let sessionHistory = gBrowser.sessionHistory;

    if (sessionHistory.count < 1) {
      return false;
    }

    let currentIndex = sessionHistory.index;
    let [start, end] = getListRange(currentIndex, sessionHistory.count);

    for (let i = end - 1; i >= start; i--) {
      let entry = sessionHistory.getEntryAtIndex(i, false);

      if (!entry) {
        continue;
      }

      let URL, title, className, direction, action;

      URL = entry.URI.spec;
      title = entry.title || URL;
      className = ['menuitem-iconic'];

      if (i === currentIndex) {
        direction = 'unified-nav-current';
      }
      else {
        direction = 'unified-nav-' + (i < currentIndex ? 'back' : 'forward');
        // @see chrome://browser/content/browser.js::gotoHistoryIndex
        action = 'gotoHistoryIndex(event);';
      }

      className.push(direction);

      // @note |label|,|icon| will be async-set by |getTimeAndFavicon|
      let menuitem = aPopup.appendChild($E('menuitem', {
        tooltiptext: getTooltip(title, URL),
        class: className.join(' '),
        index: i,
        action: action || null
      }));

      getTimeAndFavicon(URL, (aTime, aIcon) => {
        $E(menuitem, {
          label: formatLabel({
            time: aTime,
            title: getTitle(title)
          }),
          icon: getFavicon(aIcon)
        });
      });
    }

    return true;
  }

  function asyncBuildRecentHistory(aRefNode, aCallback) {
    getRecentHistory((aRecentHistory) => {
      if (!aRecentHistory) {
        aCallback(false);
        return;
      }

      buildRecentHistory(aRefNode, aRecentHistory)

      aCallback(true);
    });
  }

  function buildRecentHistory(aRefNode, aRecentHistory) {
    let popup = aRefNode.parentNode;
    let currentURL = gBrowser.currentURI.spec;

    aRecentHistory.forEach((entry) => {
      let URL, title, className, action;

      URL = entry.url;
      title = entry.title || URL;
      className = ['menuitem-iconic'];

      if (currentURL === URL) {
        className.push('unified-nav-current');
      }
      else {
        // @see resource://app/modules/PlacesUIUtils.jsm::markPageAsTyped
        // @see chrome://browser/content/utilityOverlay.js::openUILink
        action = 'PlacesUIUtils.markPageAsTyped("%URL%");' +
                 'openUILink("%URL%",event);';
        action = action.replace(/%URL%/g, URL);
      }

      popup.insertBefore($E('menuitem', {
        label: formatLabel({
          time: entry.time,
          title: getTitle(title)
        }),
        tooltiptext: getTooltip(title, URL),
        icon: getFavicon(entry.icon),
        class: className.join(' '),
        action: action || null
      }), aRefNode);
    });
  }

  function getTimeAndFavicon(aURL, aCallback) {
    let SQLExp = [
      "SELECT h.visit_date time, f.url icon",
      "FROM moz_places p",
      "JOIN moz_historyvisits h ON p.id = h.place_id",
      "LEFT JOIN moz_favicons f ON p.favicon_id = f.id",
      "WHERE p.url = :url",
      "ORDER BY h.visit_date DESC",
      "LIMIT 1"
    ].join(' ');

    asyncScanPlacesDB({
      expression: SQLExp,
      params: {'url': aURL},
      columns: ['time', 'icon'],
      onSuccess: function(aRows) {
        let time, icon;

        if (aRows) {
          // we ordered only one row
          time = aRows[0].time;
          icon = aRows[0].icon;
        }

        aCallback(time, icon);
      }
    });
  }

  function getRecentHistory(aCallback) {
    let SQLExp = [
      "SELECT p.title, p.url, h.visit_date time, f.url icon",
      "FROM moz_places p",
      "JOIN moz_historyvisits h ON p.id = h.place_id",
      "LEFT JOIN moz_favicons f ON p.favicon_id = f.id",
      "WHERE p.hidden = 0",
      "GROUP BY p.id",
      "ORDER BY h.visit_date DESC",
      "LIMIT :limit"
    ].join(' ');

    // -1: all results will be returned
    const maxNum = kPref.maxListItems;
    let limit = (maxNum > 0) ? maxNum : -1;

    asyncScanPlacesDB({
      expression: SQLExp,
      params: {'limit': limit},
      columns: ['title', 'url', 'time', 'icon'],
      onSuccess: function(aRows) {
        aCallback(aRows);
      }
    });
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
const mOpenedList = (function() {

  function build(aPopup) {
    buildOpenedTabs(aPopup);

    makeMenuSeparator(aPopup);

    buildOpenedWindows(aPopup);
  }

  function buildOpenedTabs(aPopup) {
    Array.forEach(gBrowser.tabs, (tab, i) => {
      let className, action;

      className = ['menuitem-iconic'];

      if (tab.selected) {
        className.push('unified-nav-current');
      }
      else {
        // @see chrome://browser/content/tabbrowser.xml::selectTabAtIndex
        action = 'gBrowser.selectTabAtIndex(' + i + ');';
      }

      let menuitem = aPopup.appendChild($E('menuitem', {
        label: (i + 1) + '. ' + getTitle(tab.label),
        tooltiptext: getTooltip(tab.label, tab.linkedBrowser.currentURI.spec),
        icon: getFavicon(gBrowser.getIcon(tab)),
        class: className.join(' '),
        action: action || null
      }));

      // indicate the state of an unread tab
      if (!tab.selected) {
        setStateForUnreadTab(menuitem, tab);
      }
    });
  }

  function buildOpenedWindows(aPopup) {
    let wins = getWindowEnumerator();
    let winIndex = 0;

    while (wins.hasMoreElements()) {
      let win = wins.getNext();
      let title, tip, icon, className, action;

      if (isBrowserWindow(win)) {
        let b = win.gBrowser;

        let tabs = [getPluralForm('[#1 #2]', b.mTabs.length, ['Tab', 'Tabs'])];

        let [start, end] = getListRange(b.mTabContainer.selectedIndex,
          b.mTabs.length);

        for (let j = start; j < end; j++) {
          tabs.push((j + 1) + '. ' + b.mTabs[j].label);
        }

        tip = tabs.join('\n');

        title = b.contentTitle || b.selectedTab.label || b.currentURI.spec;
        icon = b.getIcon(b.selectedTab);
      }
      else {
        title = win.document.title;
        tip = win.location.href;
        icon = 'moz-icon://.exe?size=16';
      }

      className = ['menuitem-iconic'];

      if (win === window) {
        className.push('unified-nav-current');
      }
      else {
        action = focusWindowAtIndex(winIndex);
      }

      aPopup.appendChild($E('menuitem', {
        label: getTitle(title),
        tooltiptext: getTooltip(title, tip),
        icon: getFavicon(icon),
        class: className.join(' '),
        action: action || null
      }));

      winIndex++
    }
  }

  function getWindowEnumerator() {
    return Cc['@mozilla.org/appshell/window-mediator;1'].
      getService(Ci.nsIWindowMediator).
      getEnumerator(null);
  }

  function isBrowserWindow(aWindow) {
    // @see chrome://browser/content/utilityOverlay.js::getBrowserURL
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
const mClosedList = (function() {

  function build(aPopup) {
    if (!buildClosedTabs(aPopup)) {
      makeDisabledMenuItem(aPopup, 'No closed tabs.');
    }

    makeMenuSeparator(aPopup);

    if (!buildClosedWindows(aPopup)) {
      makeDisabledMenuItem(aPopup, 'No closed windows.');
    }
  }

  function buildClosedTabs(aPopup) {
    let sessionStore = getSessionStore();

    if (sessionStore.getClosedTabCount(window) === 0) {
      return false;
    }

    let closedTabs = JSON.parse(sessionStore.getClosedTabData(window));

    for (let i = 0; i < closedTabs.length; i++) {
      let closedTab = closedTabs[i];

      let entries = closedTab.state.entries;
      let history = [];

      history.push(getPluralForm('[#1 History #2]', entries.length,
        ['entry', 'entries']));

      let [start, end] = getListRange(closedTab.state.index, entries.length);

      for (let j = end - 1; j >= start; j--) {
        history.push((j + 1) + '. ' +
          getTitle(entries[j].title || entries[j].url));
      }

      aPopup.appendChild($E('menuitem', {
        label: getTitle(closedTab.title),
        tooltiptext: getTooltip(closedTab.title, history.join('\n')),
        icon: getFavicon(closedTab.image),
        class: 'menuitem-iconic',
        // @see chrome://browser/content/browser.js::undoCloseTab
        action: 'undoCloseTab(' + i + ');'
      }));
    }

    return true;
  }

  function buildClosedWindows(aPopup) {
    let sessionStore = getSessionStore();

    if (sessionStore.getClosedWindowCount() === 0) {
      return false;
    }

    let closedWindows = JSON.parse(sessionStore.getClosedWindowData());
    for (let i = 0; i < closedWindows.length; i++) {
      let closedWindow = closedWindows[i];

      let tabs = closedWindow.tabs;
      let tabList = [];

      tabList.push(getPluralForm('[#1 #2]', tabs.length, ['Tab', 'Tabs']));

      let [start, end] = getListRange(closedWindow.selected - 1, tabs.length);

      for (let j = start; j < end; j++) {
        let tab = tabs[j].index && tabs[j].entries[tabs[j].index - 1];

        tabList.push((j + 1) + '. ' +
          getTitle(tab && (tab.title || tab.url)));
      }

      let icon;
      try {
        icon = tabs[closedWindow.selected - 1].attributes.image;
      }
      catch (ex) {}

      aPopup.appendChild($E('menuitem', {
        label: getTitle(closedWindow.title),
        tooltiptext: getTooltip(closedWindow.title, tabList.join('\n')),
        icon: getFavicon(icon),
        class: 'menuitem-iconic',
        // @see chrome://browser/content/browser.js::undoCloseWindow
        action: 'undoCloseWindow(' + i + ');'
      }));
    }

    return true;
  }

  function getSessionStore() {
    return Cc['@mozilla.org/browser/sessionstore;1'].
      getService(Ci.nsISessionStore);
  }

  return {
    build: build
  };

})();

function handleAttribute(aNode, aName, aValue) {
  switch (aName) {
    case 'icon':
      aNode.style.listStyleImage = 'url(' + aValue + ')';
      break;

    case 'action':
      aNode.setAttribute('oncommand', aValue);
      // @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
      aNode.setAttribute('onclick', 'checkForMiddleClick(this,event);');
      break;

    default:
      return false;
  }

  return true;
}

function makeDisabledMenuItem(aPopup, aLabel) {
  let refItem = null;

  if (aPopup.localName !== 'menupopup') {
    refItem = aPopup;
    aPopup = aPopup.parentNode;
  }

  return aPopup.insertBefore($E('menuitem', {
    label: aLabel,
    disabled: true
  }), refItem);
}

function makeMenuSeparator(aPopup) {
  return aPopup.appendChild($E('menuseparator'));
}

function getPluralForm(aFormat, aCount, aLabels) {
  return aFormat.
    replace('#1', aCount).
    replace('#2', aLabels[(aCount < 2) ? 0 : 1]);
}

function getListRange(aIndex, aCount) {
  let maxNum = kPref.maxListItems;

  if (maxNum <= 0) {
    return [0, aCount];
  }

  let half = Math.floor(maxNum / 2);
  let start = Math.max(aIndex - half, 0),
      end = Math.min((start > 0) ? aIndex + half + 1 : maxNum, aCount);

  if (end === aCount) {
    start = Math.max(aCount - maxNum, 0);
  }

  return [start, end];
}

function getTitle(aText) {
  const kMaxTextLen = 40;

  const {PlacesUIUtils} =
    getModule('resource://app/modules/PlacesUIUtils.jsm');

  if (aText && aText.length > kMaxTextLen) {
    if (/^(?:https?|ftp|file):/i.test(aText)) {
      let half = Math.floor(kMaxTextLen / 2);

      aText = aText.substr(0, half) + PlacesUIUtils.ellipsis +
        aText.substr(-half);
    }
    else {
      aText = aText.substr(0, kMaxTextLen) + PlacesUIUtils.ellipsis;
    }
  }

  return aText || PlacesUIUtils.getString('noTitle');
}

function getTooltip(aTitle, aInfo) {
  if (aTitle === aInfo) {
    return aTitle;
  }
  return [aTitle, aInfo].join('\n');
}

function getFavicon(aIconURL) {
  const {PlacesUtils} = getModule('resource://gre/modules/PlacesUtils.jsm');

  if (aIconURL) {
    if (/^https?:/.test(aIconURL)) {
      aIconURL = 'moz-anno:favicon:' + aIconURL;
    }

    return aIconURL;
  }

  return PlacesUtils.favicons.defaultFavicon.spec;
}

// @return {string} string for <oncommand> attribute
// TODO: assemble only with built-in functions
function focusWindowAtIndex(aIndex) {
  return 'ucjsUtil.focusWindowAtIndex(' + aIndex + ');';
}

/**
 * Entry point
 */
function ListEx_init() {
  mMenu.init();
}

ListEx_init();


})(this);
