// ==UserScript==
// @name        ListEx.uc.js
// @description Makes lists of tabs, windows and history
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage creates items in the main context menu


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
  promisePlacesDBResult
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
  historyMenu: 'ucjs_ListEx_historyMenu',
  openedMenu: 'ucjs_ListEx_openedMenu',
  closedMenu: 'ucjs_ListEx_closedMenu',
  startSeparator: 'ucjs_ListEx_startSeparator',
  endSeparator: 'ucjs_ListEx_endSeparator',
  commandData: 'ucjs_ListEx_commandData'
};

/**
 * Menu settings
 *
 * @return {hash}
 *   @key init {function}
 */
const mMenu = (function() {
  function init() {
    contentAreaContextMenu.register({
      events: [
        ['popupshowing', onPopupShowing, false],
        ['popuphiding', onPopupHiding, false],
        ['command', onCommand, false]
      ],

      onCreate: createMenu
    });
  }

  function createMenu(aContextMenu) {
    let refItem = aContextMenu.firstChild;

    function addSeparator(aId) {
      aContextMenu.insertBefore($E('menuseparator', {
        id: aId
      }), refItem);
    }

    function addMenu(aId, aLabel, aAccesskey) {
      let menu = aContextMenu.insertBefore($E('menu', {
        id: aId,
        label: aLabel,
        accesskey: aAccesskey
      }), refItem);

      menu.appendChild($E('menupopup'));
    }

    addSeparator(kID.startSeparator);
    addMenu(kID.historyMenu, 'History Tab/Recent', 'H');
    addMenu(kID.openedMenu, 'Opened Tab/Window', 'O');
    addMenu(kID.closedMenu, 'Closed Tab/Window', 'C');
    addSeparator(kID.endSeparator);
  }

  function onPopupShowing(aEvent) {
    aEvent.stopPropagation();

    let menupopup = aEvent.target;
    let contextMenu = aEvent.currentTarget;

    if (menupopup === contextMenu) {
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
      forEach((id) => {
        gContextMenu.showItem(id, !hidden);
      });
    }
    else {
      let menu = menupopup.parentElement;

      [
        [kID.historyMenu, mHistoryList],
        [kID.openedMenu, mOpenedList],
        [kID.closedMenu, mClosedList]
      ].
      some(([id, handler]) => {
        if (menu.id === id && !menu.itemCount) {
          handler.build(menupopup);
        }
      });
    }
  }

  function onPopupHiding(aEvent) {
    aEvent.stopPropagation();

    let menupopup = aEvent.target;
    let contextMenu = aEvent.currentTarget;

    if (menupopup === contextMenu) {
      [
        kID.historyMenu,
        kID.openedMenu,
        kID.closedMenu
      ].
      forEach((id) => {
        let menu = $ID(id);

        while (menu.itemCount) {
          menu.removeItemAt(0);
        }
      });
    }
  }

  function onCommand(aEvent) {
    aEvent.stopPropagation();

    let menuitem = aEvent.target;

    let commandData = menuitem[kID.commandData];

    if (!commandData) {
      return;
    }

    commandData.command(aEvent, commandData.params);
  }

  return {
    init: init
  };
})();

/**
 * List of the tab/recent history
 *
 * @return {hash}
 *   @key build {function}
 */
const mHistoryList = (function() {
  /**
   * Action of command of menuitem.
   */
  const Action = (function() {
    /**
     * Command action for tab history.
     *
     * command: Load in current tab.
     * ctrl / middle-click: Open a new tab.
     * ctrl+shift / shift+middle-click: Open a new tab in background.
     * shift: Open a new window.
     *
     * @see chrome://browser/content/browser.js::gotoHistoryIndex
     * @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
     */
    function openTabHistory(aIndex) {
      return {
        oncommand: 'gotoHistoryIndex(event);',
        onclick: 'checkForMiddleClick(this,event);',
        index: aIndex // Used in |gotoHistoryIndex|.
      };
    }

    /**
     * Command action for recent history.
     *
     * command: Load in current tab.
     * ctrl / middle-click: Open a new tab.
     * ctrl+shift / shift+middle-click: Open a new tab in background.
     * shift: Open a new window.
     *
     * @see resource://app/modules/PlacesUIUtils.jsm::markPageAsTyped
     * @see chrome://browser/content/utilityOverlay.js::openUILink
     * @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
     */
    function openRecentHistory(aURL) {
      let oncommand =
        'PlacesUIUtils.markPageAsTyped("%URL%");' +
        'openUILink("%URL%",event);';
      oncommand = oncommand.replace(/%URL%/g, aURL);

      return {
        oncommand: oncommand,
        onclick: 'checkForMiddleClick(this,event);'
      };
    }

    return {
      openTabHistory: openTabHistory,
      openRecentHistory: openRecentHistory
    };
  })();

  /**
   * Utility functions for Places DB.
   */
  const PlacesDB = (function() {
    function promiseRecentHistory() {
      // Query history entries in thier visited date order from newest
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

      // -1: All results will be returned.
      const maxNum = kPref.maxListItems;
      let limit = (maxNum > 0) ? maxNum : -1;

      return promisePlacesDBResult({
        expression: SQLExp,
        params: {'limit': limit},
        columns: ['title', 'url', 'time', 'icon']
      });
    }

    function promiseTimeAndIcon(aURL) {
      // Don't query a URL which cannot be recorded about its time and favicon
      // in the places DB.
      if (!/^(?:https?|ftp|file):/.test(aURL)) {
        return Promise.resolve({});
      }

      // Query a newest item with the URL.
      let SQLExp = [
        "SELECT h.visit_date time, f.url icon",
        "FROM moz_places p",
        "JOIN moz_historyvisits h ON p.id = h.place_id",
        "LEFT JOIN moz_favicons f ON p.favicon_id = f.id",
        "WHERE p.url = :url",
        "ORDER BY h.visit_date DESC",
        "LIMIT 1"
      ].join(' ');

      return promisePlacesDBResult({
        expression: SQLExp,
        params: {'url': aURL},
        columns: ['time', 'icon']
      }).
      // We ordered a single row.
      then((aRows) => aRows ? aRows[0] : {});
    }

    return {
      promiseRecentHistory: promiseRecentHistory,
      promiseTimeAndIcon: promiseTimeAndIcon
    };
  })();

  // @see http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
  const kTimeFormat = '%Y/%m/%d %H:%M:%S';
  const kTitleFormat = ['[%time%] %title%', '%title%'];

  function build(aPopup) {
    if (!buildTabHistory(aPopup)) {
      makeDisabledMenuItem(aPopup, 'Tab: No history.');
    }

    makeMenuSeparator(aPopup);

    // recent history items will be async-appended before this separator
    let recentHistorySep = makeMenuSeparator(aPopup);

    asyncBuildRecentHistory(recentHistorySep, (aBuilt) => {
      if (!aBuilt) {
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

    // Scan history entries in thier visited date order from last to first.
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
        action = Action.openTabHistory(i);
      }

      className.push(direction);

      // @note |label| and |icon| will be set asynchronously
      let menuitem = aPopup.appendChild($E('menuitem', {
        tooltiptext: getTooltip(title, URL),
        class: className.join(' '),
        action: action
      }));

      asyncGetTimeAndIcon(URL, ({time, icon}) => {
        $E(menuitem, {
          label: formatLabel({
            time: time,
            title: getTitle(title)
          }),
          icon: getFavicon(icon)
        });
      });
    }

    return true;
  }

  function asyncBuildRecentHistory(aRefNode, aCallback) {
    PlacesDB.promiseRecentHistory().then(
      function onFulFill(aRecentHistory) {
        if (aRecentHistory) {
          buildRecentHistory(aRefNode, aRecentHistory);
        }

        aCallback(!!aRecentHistory);
      }
    ).then(null, Cu.reportError);
  }

  function buildRecentHistory(aRefNode, aRecentHistory) {
    let popup = aRefNode.parentNode;
    let currentURL = gBrowser.currentURI.spec;

    // Scan history entries in thier visited date order from last to first.
    aRecentHistory.forEach((entry) => {
      let URL, title, className, action;

      URL = entry.url;
      title = entry.title || URL;
      className = ['menuitem-iconic'];

      if (currentURL === URL) {
        className.push('unified-nav-current');
      }
      else {
        action = Action.openRecentHistory(URL);
      }

      popup.insertBefore($E('menuitem', {
        label: formatLabel({
          time: entry.time,
          title: getTitle(title)
        }),
        tooltiptext: getTooltip(title, URL),
        icon: getFavicon(entry.icon),
        class: className.join(' '),
        action: action
      }), aRefNode);
    });
  }

  function asyncGetTimeAndIcon(aURL, aCallback) {
    PlacesDB.promiseTimeAndIcon(aURL).then(
      function onFulFill(aResult) {
        aCallback(aResult);
      }
    ).then(null, Cu.reportError);
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
 *
 * @return {hash}
 *   @key build {function}
 */
const mOpenedList = (function() {
  /**
   * Action of command of menuitem.
   */
  const Action = (function() {
    /**
     * Command action for opened tabs.
     *
     * command: Select a tab.
     *
     * @see chrome://browser/content/tabbrowser.xml::selectTabAtIndex
     */
    function selectTab(aIndex) {
      return {
        oncommand: 'gBrowser.selectTabAtIndex(' + aIndex + ');'
      };
    }

    /**
     * Command action for opened windows.
     *
     * command: Select a window.
     */
    function selectWindow(aIndex) {
      return {
        oncommand: {
          command: (aEvent, aParams) => {
            WindowUtil.getWindowById(aParams.index).focus();
          },
          params: {
            index: aIndex
          }
        }
      };
    }

    return {
      selectTab: selectTab,
      selectWindow: selectWindow
    };
  })();

  /**
   * Utility functions for windows.
   */
  const WindowUtil = (function() {
    // @see resource://gre/modules/commonjs/sdk/window/utils.js
    const utils = getModule('sdk/window/utils');

    function getWindows() {
      // Enumerator of all windows in thier Z-order from front to back.
      let winEnum = Services.wm.getZOrderDOMWindowEnumerator(null, true);

      while (winEnum.hasMoreElements()) {
        let win = winEnum.getNext().QueryInterface(Ci.nsIDOMWindow);

        // Skip a closed window.
        if (!win.closed) {
          yield win;
        }
      }
    }

    function isBrowser(aWindow) {
      // Tests whether the window is a main browser that is not a popup.
      return utils.isBrowser(aWindow) && aWindow.toolbar.visible;
    }

    function getIdFor(aWindow) {
      return utils.getOuterId(aWindow);
    }

    function getWindowById(aId) {
      return utils.getByOuterId(aId);
    }

    return {
      getWindows: getWindows,
      isBrowser: isBrowser,
      getIdFor: getIdFor,
      getWindowById: getWindowById
    };
  })();

  function build(aPopup) {
    buildOpenedTabs(aPopup);

    makeMenuSeparator(aPopup);

    buildOpenedWindows(aPopup);
  }

  function buildOpenedTabs(aPopup) {
    // Scan the visible tabs in thier position order from first to last.
    gBrowser.visibleTabs.forEach((tab, i) => {
      let className, action;

      className = ['menuitem-iconic'];

      if (tab.selected) {
        className.push('unified-nav-current');
      }
      else {
        action = Action.selectTab(i);
      }

      let menuitem = aPopup.appendChild($E('menuitem', {
        label: (i + 1) + '. ' + getTitle(tab.label),
        tooltiptext: getTooltip(tab.label, tab.linkedBrowser.currentURI.spec),
        icon: getFavicon(gBrowser.getIcon(tab)),
        class: className.join(' '),
        action: action
      }));

      // indicate the state of an unread tab
      if (!tab.selected) {
        setStateForUnreadTab(menuitem, tab);
      }
    });
  }

  function buildOpenedWindows(aPopup) {
    let {getWindows, isBrowser, getIdFor} = WindowUtil;

    // Scan windows in their Z-order from front to back.
    for (let win in getWindows()) {
      let title, tip, icon, className, action;

      if (isBrowser(win)) {
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
        action = Action.selectWindow(getIdFor(win));
      }

      aPopup.appendChild($E('menuitem', {
        label: getTitle(title),
        tooltiptext: getTooltip(title, tip),
        icon: getFavicon(icon),
        class: className.join(' '),
        action: action
      }));
    }
  }

  return {
    build: build
  };
})();

/**
 * List of the closed tabs/windows
 *
 * @return {hash}
 *   @key build {function}
 */
const mClosedList = (function() {
  /**
   * Action of command of menuitem.
   */
  const Action = (function() {
    /**
     * Command action for closed tabs.
     *
     * command: Reopen a closed tab.
     *
     * @see chrome://browser/content/browser.js::undoCloseTab
     */
    function undoCloseTab(aIndex) {
      return {
        oncommand: 'undoCloseTab(' + aIndex + ');'
      };
    }

    /**
     * Command action for closed windows.
     *
     * command: Reopen a closed window.
     *
     * @see chrome://browser/content/browser.js::undoCloseWindow
     */
    function undoCloseWindow(aIndex) {
      return {
        oncommand: 'undoCloseWindow(' + aIndex + ');'
      };
    }

    return {
      undoCloseTab: undoCloseTab,
      undoCloseWindow: undoCloseWindow
    };
  })();

  /**
   * Utility functions for session store.
   */
  const SessionStore = (function() {
    const SS = Cc['@mozilla.org/browser/sessionstore;1'].
      getService(Ci.nsISessionStore);

    function getClosedTabs() {
      try {
        if (SS.getClosedTabCount(window) > 0) {
          // Array of the data of closed tabs in thier closed date order from
          // last to first.
          return JSON.parse(SS.getClosedTabData(window));
        }
      } catch (ex) {}

      return null;
    }

    function getClosedWindows() {
      try {
        if (SS.getClosedWindowCount() > 0) {
          // Array of the data of closed windows in thier closed date order
          // from last to first.
          return JSON.parse(SS.getClosedWindowData());
        }
      } catch (ex) {}

      return null;
    }

    return {
      getClosedTabs: getClosedTabs,
      getClosedWindows: getClosedWindows
    };
  })();

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
    let closedTabs = SessionStore.getClosedTabs();

    if (!closedTabs) {
      return false;
    }

    // Scan closed tabs in thier closed date order from last to first.
    closedTabs.forEach((closedTab, i) => {
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
        action: Action.undoCloseTab(i)
      }));
    });

    return true;
  }

  function buildClosedWindows(aPopup) {
    let closedWindows = SessionStore.getClosedWindows();

    if (!closedWindows) {
      return false;
    }

    // Scan closed windows in thier closed date order from last to first.
    closedWindows.forEach((closedWindow, i) => {
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
        action: Action.undoCloseWindow(i)
      }));
    });

    return true;
  }

  return {
    build: build
  };
})();

function handleAttribute(aNode, aName, aValue) {
  switch (aName) {
    case 'icon': {
      aNode.style.listStyleImage = 'url(' + aValue + ')';

      return true;
    }

    case 'action': {
      if (aValue) {
        for (let [name, value] in Iterator(aValue)) {
          if (name === 'oncommand' && typeof value !== 'string') {
            aNode[kID.commandData] = value;
          }
          else {
            aNode.setAttribute(name, value);
          }
        }
      }

      return true;
    }
  }

  return false;
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
    const {ellipsis} = PlacesUIUtils;

    if (/^(?:https?|ftp|file):/i.test(aText)) {
      let half = Math.floor(kMaxTextLen / 2);

      aText = [aText.substr(0, half), aText.substr(-half)].join(ellipsis);
    }
    else {
      aText = aText.substr(0, kMaxTextLen) + ellipsis;
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

/**
 * Entry point
 */
function ListEx_init() {
  mMenu.init();
}

ListEx_init();


})(this);
