// ==UserScript==
// @name ListEx.uc.js
// @description Makes lists of tabs, windows and history.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage Creates items in the main context menu.


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
   * Max numbers of listed items.
   *
   * @value {integer} [>0]
   * @note A list is not created if set to 0.
   * !!! WARNING !!!
   * @note All items is listed if set to -1.
   * It can cause performance problems for too many items.
   * !!! WARNING !!!
   *
   * Order of list items;
   * tabHistory: From new to old around current page.
   * recentHistory: From recent to old.
   * openedTabs: From start to end around current tab in visible tabs.
   * openedWindows: From front(current window) to back.
   * closedTabs: From the last closed tab to old.
   * closedWindows: From the last closed window to old.
   *
   * tooltip:
   * List of tabs of Opened window: From start to end around selected tab.
   * List of history of Closed tab: From new to old around selected page.
   * List of tabs of Closed window: From start to end around selected tab.
   */
  maxNumListItems: {
    tabHistory:    10,
    recentHistory: 10,
    openedTabs:    20,
    openedWindows: -1,
    closedTabs:    10,
    closedWindows: 10,
    tooltip: 10
  }
};

/**
 * UI settings
 */
const kUI = {
  historyMenu: {
    id: 'ucjs_ListEx_historyMenu',
    label: 'History Tab/Recent',
    accesskey: 'H',

    tabEmpty: 'Tab: No history.',
    recentEmpty: 'Recent: No history.'
  },

  historyManager: {
    label: 'Open History Manager',
    accesskey: 'H'
  },

  openedMenu: {
    id: 'ucjs_ListEx_openedMenu',
    label: 'Opened Tab/Window',
    accesskey: 'O'
  },

  closedMenu: {
    id: 'ucjs_ListEx_closedMenu',
    label: 'Closed Tab/Window',
    accesskey: 'C',

    noTabs: 'No closed tabs.',
    noWindows: 'No closed windows.'
  },

  startSeparator: {
    id: 'ucjs_ListEx_startSeparator'
  },

  endSeparator: {
    id: 'ucjs_ListEx_endSeparator'
  },

  property: {
    // Extended property name of a menuitem for its custom command.
    commandData: 'ucjs_ListEx_commandData'
  }
};

/**
 * Main menu handler.
 *
 * @return {hash}
 *   @key init {function}
 */
const MainMenu = (function() {
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

    function addSeparator(aSeparatorName) {
      aContextMenu.insertBefore($E('menuseparator', {
        id: aSeparatorName.id
      }), refItem);
    }

    function addMenu(aMenuName) {
      let menu = aContextMenu.insertBefore($E('menu', {
        id: aMenuName.id,
        label: aMenuName.label,
        accesskey: aMenuName.accesskey
      }), refItem);

      menu.appendChild($E('menupopup'));
    }

    /**
     * List of items of menus.
     *
     * @key A menu name in |kUI|.
     * @value A items name in |kPref.maxNumListItems|.
     *
     * TODO: Make a smart way to avoid managing constant names.
     */
    let menuItems = {
      'historyMenu': [
        'tabHistory',
        'recentHistory'
      ],
      'openedMenu': [
        'openedTabs',
        'openedWindows'
      ],
      'closedMenu': [
        'closedTabs',
        'closedWindows'
      ]
    };

    addSeparator(kUI.startSeparator);

    for (let [menu, items] in Iterator(menuItems)) {
      if (items.some((item) => !!kPref.maxNumListItems[item])) {
        addMenu(kUI[menu]);
      }
    }

    addSeparator(kUI.endSeparator);
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
        kUI.historyMenu,
        kUI.openedMenu,
        kUI.closedMenu
      ].
      forEach((aMenuName) => {
        gContextMenu.showItem(aMenuName.id, !hidden);
      });
    }
    else {
      let menu = menupopup.parentElement;

      [
        [kUI.historyMenu, HistoryList],
        [kUI.openedMenu, OpenedList],
        [kUI.closedMenu, ClosedList]
      ].
      some(([menuName, menuHandler]) => {
        if (menu.id === menuName.id && !menu.itemCount) {
          menuHandler.build(menupopup);

          return true;
        }

        return false;
      });
    }
  }

  function onPopupHiding(aEvent) {
    aEvent.stopPropagation();

    let menupopup = aEvent.target;
    let contextMenu = aEvent.currentTarget;

    if (menupopup === contextMenu) {
      [
        kUI.historyMenu,
        kUI.openedMenu,
        kUI.closedMenu
      ].
      forEach((aMenuName) => {
        let menu = $ID(aMenuName.id);

        if (menu) {
          while (menu.itemCount) {
            menu.removeItemAt(0);
          }
        }
      });
    }
  }

  function onCommand(aEvent) {
    aEvent.stopPropagation();

    let menuitem = aEvent.target;

    let commandData = menuitem[kUI.property.commandData];

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
 * List of the tab/recent history.
 *
 * @return {hash}
 *   @key build {function}
 */
const HistoryList = (function() {
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
      // Query history entries in thier visited date order from newest.
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

      let maxNumItems = kPref.maxNumListItems.recentHistory;

      // -1: All results will be returned.
      let limit = (maxNumItems > 0) ? maxNumItems : -1;

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

  /**
   * Build menu items.
   */
  function build(aPopup) {
    if (!!kPref.maxNumListItems.tabHistory) {
      if (!buildTabHistory(aPopup)) {
        makeDisabledMenuItem(aPopup, kUI.historyMenu.tabEmpty);
      }

      makeMenuSeparator(aPopup);
    }

    if (!!kPref.maxNumListItems.recentHistory) {
      // Recent history items will be async-appended before this separator.
      let recentHistorySep = makeMenuSeparator(aPopup);

      asyncBuildRecentHistory(recentHistorySep, (aBuilt) => {
        if (!aBuilt) {
          makeDisabledMenuItem(recentHistorySep, kUI.historyMenu.recentEmpty);
        }
      });
    }

    aPopup.appendChild($E('menuitem', {
      label: kUI.historyManager.label,
      accesskey: kUI.historyManager.accesskey,
      command: 'Browser:ShowAllHistory'
    }));
  }

  function buildTabHistory(aPopup) {
    let sessionHistory = gBrowser.sessionHistory;

    if (sessionHistory.count < 1) {
      return false;
    }

    let currentIndex = sessionHistory.index;

    // Scan history entries in thier visited date order from new to old around
    // the current page.
    let [start, end] = limitListRange({
      index: currentIndex,
      length: sessionHistory.count,
      maxNumItems: kPref.maxNumListItems.tabHistory
    });

    for (let i = end; i >= start; i--) {
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

      // @note |label| and |icon| will be set asynchronously.
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

    // Scan history entries in thier visited date order from recent to old.
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
    // Format to convert date and time.
    // @see http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
    const kTimeFormat = '%Y/%m/%d %H:%M:%S';
    const kTitleFormat = ['[%time%] %title%', '%title%'];

    let {time, title} = aValue;

    let form = time ? kTitleFormat[0] : kTitleFormat[1];

    if (time) {
      // Convert microseconds into milliseconds.
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
 * List of the opened tabs/windows.
 *
 * @return {hash}
 *   @key build {function}
 */
const OpenedList = (function() {
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

      let isLimitOver = (() => {
        let maxNumItems = kPref.maxNumListItems.openedWindows;
        let limited = maxNumItems > 0;
        let count = 0;

        return () => limited && ++count > maxNumItems;
      })();

      while (winEnum.hasMoreElements()) {
        let win = winEnum.getNext().QueryInterface(Ci.nsIDOMWindow);

        // Bail out if the number of items reaches the limit.
        if (isLimitOver()) {
          break;
        }

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

  /**
   * Build menu items.
   */
  function build(aPopup) {
    if (!!kPref.maxNumListItems.openedTabs) {
      buildOpenedTabs(aPopup);

      makeMenuSeparator(aPopup);
    }

    if (!!kPref.maxNumListItems.openedWindows) {
      buildOpenedWindows(aPopup);
    }
  }

  function buildOpenedTabs(aPopup) {
    // Scan the visible tabs in thier position order from start to end around
    // the current tab.
    let tabs = gBrowser.visibleTabs;

    let [start, end] = limitListRange({
      index: tabs.indexOf(gBrowser.selectedTab),
      length: tabs.length,
      maxNumItems: kPref.maxNumListItems.openedTabs
    });

    for (let i = start; i <= end; i++) {
      let tab = tabs[i];

      let className, action;

      className = ['menuitem-iconic'];

      if (tab.selected) {
        className.push('unified-nav-current');
      }
      else {
        action = Action.selectTab(i);
      }

      let URL = gBrowser.getBrowserForTab(tab).currentURI.spec;

      let menuitem = aPopup.appendChild($E('menuitem', {
        label: assignNumber(i + 1, getTitle(tab.label)),
        tooltiptext: getTooltip(tab.label, URL),
        icon: getFavicon(gBrowser.getIcon(tab)),
        class: className.join(' '),
        action: action
      }));

      // Set a state to indicate that the tab is unread.
      // @note Setting for unread tabs handled by TabEx.uc.js
      if (!tab.selected) {
        setStateForUnreadTab(menuitem, tab);
      }
    }
  }

  function buildOpenedWindows(aPopup) {
    let {getWindows, isBrowser, getIdFor} = WindowUtil;

    // Scan windows in their Z-order from front(the current window) to back.
    for (let win in getWindows()) {
      let title, icon, tabList, URL, className, action;

      if (isBrowser(win)) {
        let b = win.gBrowser;

        title = b.contentTitle || b.selectedTab.label || b.currentURI.spec;
        icon = b.getIcon(b.selectedTab);

        // Scan visible tabs in their position order from start to end around
        // the selected tab in this window.
        tabList = [
          fixPluralForm('[#1 #2]', b.visibleTabs.length, ['Tab', 'Tabs'])
        ];

        let [start, end] = limitListRange({
          index: b.visibleTabs.indexOf(b.selectedTab),
          length: b.visibleTabs.length,
          maxNumItems: kPref.maxNumListItems.tooltip
        });

        for (let j = start; j <= end; j++) {
          tabList.push(assignNumber(j + 1, b.visibleTabs[j].label));
        }
      }
      else {
        title = win.document.title;
        URL = win.location.href;
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
        tooltiptext: getTooltip(title, tabList || URL),
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
 * List of the closed tabs/windows.
 *
 * @return {hash}
 *   @key build {function}
 */
const ClosedList = (function() {
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
          let data = JSON.parse(SS.getClosedTabData(window));

          let maxNumItems = kPref.maxNumListItems.closedTabs;

          return limitData(data, maxNumItems);
        }
      } catch (ex) {}

      return null;
    }

    function getClosedWindows() {
      try {
        if (SS.getClosedWindowCount() > 0) {
          // Array of the data of closed windows in thier closed date order
          // from last to first.
          let data = JSON.parse(SS.getClosedWindowData());

          let maxNumItems = kPref.maxNumListItems.closedWindows;

          return limitData(data, maxNumItems);
        }
      } catch (ex) {}

      return null;
    }

    function limitData(aData, aMaxNumItems) {
      return (aMaxNumItems > 0) ? aData.slice(0, aMaxNumItems + 1) : aData;
    }

    return {
      getClosedTabs: getClosedTabs,
      getClosedWindows: getClosedWindows
    };
  })();

  /**
   * Build menu items.
   */
  function build(aPopup) {
    if (!!kPref.maxNumListItems.closedTabs) {
      if (!buildClosedTabs(aPopup)) {
        makeDisabledMenuItem(aPopup, kUI.closedMenu.noTabs);
      }

      makeMenuSeparator(aPopup);
    }

    if (!!kPref.maxNumListItems.closedWindows) {
      if (!buildClosedWindows(aPopup)) {
        makeDisabledMenuItem(aPopup, kUI.closedMenu.noWindows);
      }
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

      // Scan tab history in their visited date order from new to old around
      // the selected page in this closed tab.
      let history = [
        fixPluralForm('[#1 History #2]', entries.length, ['entry', 'entries'])
      ];

      let [start, end] = limitListRange({
        index: closedTab.state.index - 1,
        length: entries.length,
        maxNumItems: kPref.maxNumListItems.tooltip
      });

      for (let j = end; j >= start; j--) {
        let title = getTitle(entries[j].title || entries[j].url);

        history.push(assignNumber(j + 1, title));
      }

      aPopup.appendChild($E('menuitem', {
        label: getTitle(closedTab.title),
        tooltiptext: getTooltip(closedTab.title, history),
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

      // Scan visible tabs in their position order from start to end around
      // the selected tab in this closed window.
      let tabList = [
        fixPluralForm('[#1 #2]', tabs.length, ['Tab', 'Tabs'])
      ];

      let [start, end] = limitListRange({
        index: closedWindow.selected - 1,
        length: tabs.length,
        maxNumItems: kPref.maxNumListItems.tooltip
      });

      for (let j = start; j <= end; j++) {
        let tab = tabs[j].index && tabs[j].entries[tabs[j].index - 1];
        let title = getTitle(tab && (tab.title || tab.url));

        tabList.push(assignNumber(j + 1, title));
      }

      let icon = tabs[closedWindow.selected - 1].image;

      aPopup.appendChild($E('menuitem', {
        label: getTitle(closedWindow.title),
        tooltiptext: getTooltip(closedWindow.title, tabList),
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
            aNode[kUI.property.commandData] = value;
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

function assignNumber(aNumber, aValue) {
	return '%number%. %value%'.
	  replace('%number%', aNumber).
	  replace('%value%', aValue);
}

function fixPluralForm(aFormat, aCount, aLabels) {
  return aFormat.
    replace('#1', aCount).
    replace('#2', aLabels[(aCount < 2) ? 0 : 1]);
}

function limitListRange({index, length, maxNumItems}) {
  if (!maxNumItems || maxNumItems < 0) {
    return [0, length - 1];
  }

  if (index === 0) {
    return [0, Math.min(maxNumItems, length) - 1];
  }

  let start, end;

  let half = Math.floor(maxNumItems / 2);

  start = Math.max(index - half, 0);

  end = (start > 0) ? index + half : maxNumItems - 1;
  end = Math.min(end, length - 1);

  if (end === length - 1) {
    start = Math.max(length - maxNumItems, 0);
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

/**
 * Makes a text for a tooltip.
 *
 * @param aTitle {string}
 * @param aInfo {string|string[]}
 * @return {string}
 */
function getTooltip(aTitle, aInfo) {
  if (aTitle === aInfo) {
    return aTitle;
  }

  return [aTitle].concat(aInfo).join('\n');
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
  MainMenu.init();
}

ListEx_init();


})(this);
