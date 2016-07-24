// ==UserScript==
// @name ListEx.uc.js
// @description Makes lists of tabs, windows and history.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @require [optional for the extended info of tabs] TabEx.uc.js

// @usage The list menus are appended in the main context menu.


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  Listeners: {
    $event
  },
  DOMUtils: {
    init$E,
    $ID
  },
  PlacesUtils,
  HistoryUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

// Makes $E with the attributes handler.
const $E = init$E(handleAttribute);

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
   * Max number of entry items of each list.
   *
   * @value {integer} [>0]
   * @note A list doesn't appear if set to 0.
   * !!! WARNING !!!
   * @note All items is listed if set to -1.
   * It can cause performance problems for too many items.
   * !!! WARNING !!!
   *
   * [The order of entry items]
   * tabHistory: From new to old around current page.
   * recentHistory: From recent to old.
   * openedTabs: From start to end around current tab in visible tabs.
   * openedWindows: From front(current window) to back.
   * closedTabs: From the last closed tab to old.
   * closedWindows: From the last closed window to old.
   *
   * tooltip:
   * - History of an opened tab: From new to old around selected page.
   * - Tabs of an opened window: From start to end around selected tab.
   * - History of a closed tab: From new to old around selected page.
   * - Tabs of a closed window: From start to end around selected tab.
   *
   * @note The key names must be the same names of entries of
   * |KUI.xxxMenu.list| except for |tooltip|.
   */
  maxNumListItems: {
    tabHistory:    10,
    recentHistory: 10,
    openedTabs:    20,
    openedWindows: -1,
    closedTabs:    10,
    closedWindows: 10,
    tooltip: 10
  },

  /**
   * Tooltip settings.
   *
   * maxWidth: Max number of characters in a line.
   * @note 'max-width' of a text container is set to this value by 'em'.
   *
   * maxNumWrapLines: Max number of wrap lines of a long text.
   */
  tooltip: {
    maxWidth: 40,
    maxNumWrapLines: 4
  }
};

/**
 * UI settings.
 */
const kUI = {
  historyMenu: {
    id: 'ucjs_ListEx_historyMenu',
    label: 'History Tab/Recent',
    accesskey: 'H',

    list: {
      tabHistory: {
        noItems: 'No tab history.'
      },
      recentHistory: {
        noItems: 'No recent history.'
      }
    }
  },

  historyManager: {
    label: 'Open History Manager',
    accesskey: 'H'
  },

  openedMenu: {
    id: 'ucjs_ListEx_openedMenu',
    label: 'Opened Tab/Window',
    accesskey: 'O',

    list: {
      openedTabs: {
        // At least the current tab surely opens.
      },
      openedWindows: {
        // At least the current window surely opens.
      }
    }
  },

  closedMenu: {
    id: 'ucjs_ListEx_closedMenu',
    label: 'Closed Tab/Window',
    accesskey: 'C',

    list: {
      closedTabs: {
        noItems: 'No closed tabs.'
      },
      closedWindows: {
        noItems: 'No closed windows.'
      }
    }
  },

  tooltip: {
    id: 'ucjs_ListEx_tooltip'
  },

  startSeparator: {
    id: 'ucjs_ListEx_startSeparator'
  },

  endSeparator: {
    id: 'ucjs_ListEx_endSeparator'
  }
};

/**
 * Key names for storing data.
 */
const kDataKey = {
  // Extended property name of a menuitem.
  commandData: 'ucjs_ListEx_commandData',
  tooltipData: 'ucjs_ListEx_tooltipData'
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
        ['popupshowing', onPopupShowing],
        ['popuphiding', onPopupHiding],
        ['command', onCommand]
      ],

      onCreate: createMenu
    });

    Tooltip.init();
  }

  function createMenu(contextMenu) {
    // TODO: Make the insertion position of items fixed for useful access.
    // WORKAROUND: Inserts to the top of the context menu at this point in
    // time.
    let referenceNode = contextMenu.firstChild;

    let addSeparator = (separatorUI) => {
      contextMenu.insertBefore($E('menuseparator', {
        id: separatorUI.id
      }), referenceNode);
    };

    let addMenu = (menuUI) => {
      let menu = contextMenu.insertBefore($E('menu', {
        id: menuUI.id,
        label: menuUI.label,
        accesskey: menuUI.accesskey
      }), referenceNode);

      menu.appendChild($E('menupopup'));
    };

    addSeparator(kUI.startSeparator);

    [
      kUI.historyMenu,
      kUI.openedMenu,
      kUI.closedMenu
    ].
    forEach((menuUI) => {
      // Add a menu that has lists to be created.
      // @see |kPref.maxNumListItems|
      let hasEnabledList = Object.keys(menuUI.list).some((key) => {
        let maxNum = kPref.maxNumListItems[key];

        return maxNum > 0 || maxNum === -1;
      });

      if (hasEnabledList) {
        addMenu(menuUI);
      }
    });

    addSeparator(kUI.endSeparator);
  }

  function onPopupShowing(event) {
    let menupopup = event.target;
    let contextMenu = event.currentTarget;

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
      forEach((menuUI) => {
        gContextMenu.showItem(menuUI.id, !hidden);
      });
    }
    else {
      // Sub menu opens.
      let menu = menupopup.parentElement;

      [
        [kUI.historyMenu, HistoryList],
        [kUI.openedMenu, OpenedList],
        [kUI.closedMenu, ClosedList]
      ].
      some(([menuUI, menuHandler]) => {
        if (menu.id === menuUI.id) {
          // Build menu items at the first open while the context menu shows.
          if (!menu.itemCount) {
            menuHandler.build(menupopup);
          }

          return true;
        }

        return false;
      });
    }
  }

  function onPopupHiding(event) {
    let contextMenu = event.currentTarget;

    if (event.target === contextMenu) {
      [
        kUI.historyMenu,
        kUI.openedMenu,
        kUI.closedMenu
      ].
      forEach((menuUI) => {
        let menu = $ID(menuUI.id);

        if (menu) {
          while (menu.itemCount) {
            menu.removeItemAt(0);
          }
        }
      });
    }
  }

  function onCommand(event) {
    let menuitem = event.target;

    let commandData = menuitem[kDataKey.commandData];

    if (commandData) {
      commandData.command(event, commandData.params);
    }
  }

  return {
    init
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
     * <Ctrl> / <MiddleClick>: Open a new tab.
     * <Ctrl+Shift> / <Shift+MiddleClick>: Open a new tab in background.
     * <Shift>: Open a new window.
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
     * <Ctrl> / <MiddleClick>: Open a new tab.
     * <Ctrl+Shift> / <Shift+MiddleClick>: Open a new tab in background.
     * <Shift>: Open a new window.
     *
     * @see resource:///modules/PlacesUIUtils.jsm::markPageAsTyped
     * @see chrome://browser/content/utilityOverlay.js::openUILink
     * @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
     */
    function openRecentHistory(aURL) {
      let oncommand =
        'PlacesUIUtils.markPageAsTyped("%url%");' +
        'openUILink("%url%",event);';
      oncommand = oncommand.replace(/%url%/g, aURL);

      return {
        oncommand,
        onclick: 'checkForMiddleClick(this,event);'
      };
    }

    return {
      openTabHistory,
      openRecentHistory
    };
  })();

  /**
   * Utility functions for Places DB.
   */
  const PlacesDB = (function() {
    function promiseRecentHistory() {
      // Query history entries in thier visited date order from newest.
      let sql = [
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

      return PlacesUtils.promisePlacesDBResult({
        sql,
        parameters: {'limit': limit},
        columns: ['title', 'url', 'time', 'icon']
      });
    }

    function promiseTimeAndIcon(aURL) {
      // Don't query schemes which are excluded from history in Places DB.
      if (!/^(?:https?|ftp|file):/.test(aURL)) {
        // Resolved with an empty hash.
        return Promise.resolve({});
      }

      // Query a newest item with the URL.
      let sql = [
        "SELECT h.visit_date time, f.url icon",
        "FROM moz_places p",
        "JOIN moz_historyvisits h ON p.id = h.place_id",
        "LEFT JOIN moz_favicons f ON p.favicon_id = f.id",
        "WHERE p.url = :url",
        "ORDER BY h.visit_date DESC",
        "LIMIT 1"
      ].join(' ');

      return PlacesUtils.promisePlacesDBResult({
        sql,
        parameters: {'url': aURL},
        columns: ['time', 'icon']
      }).
      // Resolved with the hash including time and icon, or empty hash if no
      // data.
      // @note We ordered a single row.
      then((aRows) => aRows ? aRows[0] : {});
    }

    return {
      promiseRecentHistory,
      promiseTimeAndIcon
    };
  })();

  /**
   * Build menu items.
   */
  function build(aPopup) {
    if (!!kPref.maxNumListItems.tabHistory) {
      buildMenuItems({
        builder: buildTabHistory,
        listUI: kUI.historyMenu.list.tabHistory,
        referenceNode: makeMenuSeparator(aPopup)
      });
    }

    if (!!kPref.maxNumListItems.recentHistory) {
      buildMenuItems({
        builder: buildRecentHistory,
        listUI: kUI.historyMenu.list.recentHistory,
        referenceNode: makeMenuSeparator(aPopup)
      });
    }

    aPopup.appendChild($E('menuitem', {
      label: kUI.historyManager.label,
      accesskey: kUI.historyManager.accesskey,
      command: 'Browser:ShowAllHistory'
    }));
  }

  function buildTabHistory() {
    return Task.spawn(function*() {
      let sessionHistory = yield HistoryUtils.promiseSessionHistory();

      if (!sessionHistory) {
        return null;
      }

      let {
        count: historyLength,
        index: selectedIndex,
        entries: historyEntries
      } = sessionHistory;

      // Scan history entries in thier visited date order from new to old
      // around the current page.
      let [start, end] = limitListRange({
        index: selectedIndex,
        length: historyLength,
        maxNumItems: kPref.maxNumListItems.tabHistory
      });

      let fragment = createDocumentFragment();

      for (let i = end; i >= start; i--) {
        let entry = historyEntries[i];

        let url, title, className, action;

        url = entry.url;
        title = entry.title || url;
        className = ['menuitem-iconic'];

        if (i === selectedIndex) {
          className.push('unified-nav-current');
        }
        else {
          let direction = (i < selectedIndex) ? 'back' : 'forward';

          className.push('unified-nav-' + direction);

          action = Action.openTabHistory(i);
        }

        // @note |label| and |icon| will be set asynchronously.
        let menuitem = fragment.appendChild($E('menuitem', {
          tooltip: {
            title,
            url
          },
          class: className.join(' '),
          action
        }));

        asyncGetTimeAndIcon(url, ({time, icon}) => {
          $E(menuitem, {
            label: {
              prefix: formatTime(time),
              value: title
            },
            icon
          });
        });
      }

      return fragment;
    });
  }

  function asyncGetTimeAndIcon(aURL, aCallback) {
    PlacesDB.promiseTimeAndIcon(aURL).then((aResult) => {
      aCallback(aResult);
    });
  }

  function buildRecentHistory() {
    return Task.spawn(function*() {
      let recentHistory = yield PlacesDB.promiseRecentHistory();

      if (!recentHistory) {
        return null;
      }

      let currentURL = gBrowser.currentURI.spec;

      let fragment = createDocumentFragment();

      // Scan history entries in thier visited date order from recent to old.
      recentHistory.forEach((entry) => {
        let url, title, className, action;

        url = entry.url;
        title = entry.title || url;
        className = ['menuitem-iconic'];

        if (currentURL === url) {
          className.push('unified-nav-current');
        }
        else {
          action = Action.openRecentHistory(url);
        }

        fragment.appendChild($E('menuitem', {
          label: {
            prefix: formatTime(entry.time),
            value: title
          },
          tooltip: {
            title,
            url
          },
          icon: entry.icon,
          class: className.join(' '),
          action
        }));
      });

      return fragment;
    });
  }

  return {
    build
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
      selectTab,
      selectWindow
    };
  })();

  /**
   * Utility functions for windows.
   */
  const WindowUtil = (function() {
    // @see resource://gre/modules/commonjs/sdk/window/utils.js
    const utils = Modules.require('sdk/window/utils');

    /**
     * Generator for all windows.
     *
     * @return {Generator}
     */
    function* getWindows() {
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
      getWindows,
      isBrowser,
      getIdFor,
      getWindowById
    };
  })();

  /**
   * Build menu items.
   */
  function build(aPopup) {
    if (!!kPref.maxNumListItems.openedTabs) {
      buildMenuItems({
        builder: buildOpenedTabs,
        listUI: kUI.openedMenu.list.openedTabs,
        referenceNode: makeMenuSeparator(aPopup)
      });
    }

    if (!!kPref.maxNumListItems.openedWindows) {
      buildMenuItems({
        builder: buildOpenedWindows,
        listUI: kUI.openedMenu.list.openedWindows,
        referenceNode: aPopup
      });
    }
  }

  function buildOpenedTabs() {
    return Task.spawn(function*() {
      // Scan the visible tabs in thier position order from start to end around
      // the current tab.
      let tabs = gBrowser.visibleTabs;

      let [start, end] = limitListRange({
        index: tabs.indexOf(gBrowser.selectedTab),
        length: tabs.length,
        maxNumItems: kPref.maxNumListItems.openedTabs
      });

      let fragment = createDocumentFragment();

      for (let i = start; i <= end; i++) {
        let tab = tabs[i];
        let browser = gBrowser.getBrowserForTab(tab);

        // Scan tab history in their visited date order from new to old around
        // the selected page in this tab.
        let sessionHistory = yield HistoryUtils.promiseSessionHistory(browser);

        let historyLength;
        let selectedIndex;
        let historyEntries;

        if (sessionHistory) {
          historyLength = sessionHistory.count;
          selectedIndex = sessionHistory.index;
          historyEntries = sessionHistory.entries;
        }

        let history = [{
          label: {
            value: fixPluralForm({
              format: '[#1 history #2]',
              count: historyLength,
              labels: ['entry', 'entries']
            })
          },
          header: true
        }];

        // [optional]
        // Show that a tab is suspended from loading in background.
        // @note A suspended tab may have no history if the initialization is
        // interrupted.
        // @require TabEx.uc.js
        if (window.ucjsTabEx) {
          if (window.ucjsTabEx.tabState.isSuspended(tab)) {
            history.push({
              label: {
                value: 'This tab is suspended from loading.'
              }
            });
          }
        }

        if (historyLength) {
          let [start, end] = limitListRange({
            index: selectedIndex,
            length: historyLength,
            maxNumItems: kPref.maxNumListItems.tooltip
          });

          for (let j = end; j >= start; j--) {
            let entry = historyEntries[j];

            let item = {
              label: {
                prefix: formatOrderNumber(j + 1),
                value: entry.title || entry.url
              }
            };

            if (j === selectedIndex) {
              item.selected = true;
            }

            history.push(item);
          }
        }

        let className = ['menuitem-iconic'], action;

        if (tab.selected) {
          className.push('unified-nav-current');
        }
        else {
          action = Action.selectTab(i);
        }

        let menuitem = fragment.appendChild($E('menuitem', {
          label: {
            prefix: formatOrderNumber(i + 1),
            value: tab.label
          },
          tooltip: {
            title: tab.label,
            url: browser.currentURI.spec,
            list: history
          },
          icon: gBrowser.getIcon(tab),
          class: className.join(' '),
          action
        }));

        // [optional]
        // Set a state to indicate that the tab is unread.
        // @require TabEx.uc.js in |ucjsUI.setStateForUnreadTab|.
        if (!tab.selected) {
          setStateForUnreadTab(menuitem, tab);
        }
      }

      return fragment;
    });
  }

  function buildOpenedWindows() {
    // @note This task doesn't receive any iterators but this function must
    // return a promise for |buildMenuItems|.
    return Task.spawn(function*() {
      let {getWindows, isBrowser, getIdFor} = WindowUtil;

      let fragment = createDocumentFragment();

      // Scan windows in their Z-order from front(the current window) to back.
      for (let win of getWindows()) {
        let title, url, icon, tabList;

        if (isBrowser(win)) {
          let b = win.gBrowser;
          let tabs = b.visibleTabs;
          let tabsLength = tabs.length;
          let selectedIndex = tabs.indexOf(b.selectedTab);

          title = b.contentTitle || b.selectedTab.label || b.currentURI.spec;
          url = b.currentURI.spec;
          icon = b.getIcon(b.selectedTab);

          // Scan visible tabs in their position order from start to end around
          // the selected tab in this window.
          tabList = [{
            label: {
              value: fixPluralForm({
                format: '[#1 #2]',
                count: tabsLength,
                labels: ['tab', 'tabs']
              })
            },
            header: true
          }];

          let [start, end] = limitListRange({
            index: selectedIndex,
            length: tabsLength,
            maxNumItems: kPref.maxNumListItems.tooltip
          });

          for (let j = start; j <= end; j++) {
            let item = {
              label: {
                prefix: formatOrderNumber(j + 1),
                value: tabs[j].label
              }
            };

            if (j === selectedIndex) {
              item.selected = true;
            }

            tabList.push(item);
          }
        }
        else {
          title = win.document.title;
          url = win.location.href;
          icon = 'moz-icon://.exe?size=16';
        }

        let className = ['menuitem-iconic'], action;

        if (win === window) {
          className.push('unified-nav-current');
        }
        else {
          action = Action.selectWindow(getIdFor(win));
        }

        fragment.appendChild($E('menuitem', {
          label: {
            value: title
          },
          tooltip: {
            title,
            url,
            list: tabList
          },
          icon,
          class: className.join(' '),
          action
        }));
      }

      return fragment;
    });
  }

  return {
    build
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
      undoCloseTab,
      undoCloseWindow
    };
  })();

  /**
   * Utility functions for session store.
   */
  const SessionStore = (function() {
    function promiseClosedTabs() {
      const ss = Modules.SessionStore;

      let result = null;

      try {
        if (ss.getClosedTabCount(window) > 0) {
          // Array of the data of closed tabs in thier closed date order from
          // last to first.
          let data = JSON.parse(ss.getClosedTabData(window));

          let maxNumItems = kPref.maxNumListItems.closedTabs;

          result = limitData(data, maxNumItems);
        }
      } catch (ex) {}

      return new Promise((onResolve) => {
        onResolve(result);
      });
    }

    function promiseClosedWindows() {
      const ss = Modules.SessionStore;

      let result = null;

      try {
        if (ss.getClosedWindowCount() > 0) {
          // Array of the data of closed windows in thier closed date order
          // from last to first.
          let data = JSON.parse(ss.getClosedWindowData());

          let maxNumItems = kPref.maxNumListItems.closedWindows;

          result = limitData(data, maxNumItems);
        }
      } catch (ex) {}

      return new Promise((onResolve) => {
        onResolve(result);
      });
    }

    function limitData(aData, aMaxNumItems) {
      return (aMaxNumItems > 0) ? aData.slice(0, aMaxNumItems + 1) : aData;
    }

    return {
      promiseClosedTabs,
      promiseClosedWindows
    };
  })();

  /**
   * Build menu items.
   */
  function build(aPopup) {
    if (!!kPref.maxNumListItems.closedTabs) {
      buildMenuItems({
        builder: buildClosedTabs,
        listUI: kUI.closedMenu.list.closedTabs,
        referenceNode: makeMenuSeparator(aPopup)
      });
    }

    if (!!kPref.maxNumListItems.closedWindows) {
      buildMenuItems({
        builder: buildClosedWindows,
        listUI: kUI.closedMenu.list.closedWindows,
        referenceNode: aPopup
      });
    }
  }

  function buildClosedTabs() {
    return Task.spawn(function*() {
      let closedTabs = yield SessionStore.promiseClosedTabs();

      if (!closedTabs) {
        return null;
      }

      let fragment = createDocumentFragment();

      // Scan closed tabs in thier closed date order from last to first.
      closedTabs.forEach((closedTab, i) => {
        let tabHistory = closedTab.state.entries;
        let historyLength = tabHistory.length;
        let selectedIndex = closedTab.state.index - 1;

        let url;

        // Scan tab history in their visited date order from new to old around
        // the selected page in this closed tab.
        let history = [{
          label: {
            value: fixPluralForm({
              format: '[#1 history #2]',
              count: historyLength,
              labels: ['entry', 'entries']
            })
          },
          header: true
        }];

        let [start, end] = limitListRange({
          index: selectedIndex,
          length: historyLength,
          maxNumItems: kPref.maxNumListItems.tooltip
        });

        for (let j = end; j >= start; j--) {
          let entry = tabHistory[j];

          let item = {
            label: {
              prefix: formatOrderNumber(j + 1),
              value: entry.title || entry.url
            }
          };

          if (j === selectedIndex) {
            url = entry.url;
            item.selected = true;
          }

          history.push(item);
        }

        fragment.appendChild($E('menuitem', {
          label: {
            value: closedTab.title
          },
          tooltip: {
            title: closedTab.title,
            url,
            list: history
          },
          icon: closedTab.image,
          class: 'menuitem-iconic',
          action: Action.undoCloseTab(i)
        }));
      });

      return fragment;
    });
  }

  function buildClosedWindows() {
    return Task.spawn(function*() {
      let closedWindows = yield SessionStore.promiseClosedWindows();

      if (!closedWindows) {
        return null;
      }

      let fragment = createDocumentFragment();

      // Scan closed windows in thier closed date order from last to first.
      closedWindows.forEach((closedWindow, i) => {
        let tabs = closedWindow.tabs;
        let tabsLength = tabs.length;
        let selectedIndex = closedWindow.selected - 1;

        let url;

        // Scan visible tabs in their position order from start to end around
        // the selected tab in this closed window.
        let tabList = [{
          label: {
            value: fixPluralForm({
              format: '[#1 #2]',
              count: tabsLength,
              labels: ['tab', 'tabs']
            })
          },
          header: true
        }];

        let [start, end] = limitListRange({
          index: selectedIndex,
          length: tabsLength,
          maxNumItems: kPref.maxNumListItems.tooltip
        });

        for (let j = start; j <= end; j++) {
          let tab = tabs[j].index && tabs[j].entries[tabs[j].index - 1];

          let item = {
            label: {
              prefix: formatOrderNumber(j + 1),
              value: tab && (tab.title || tab.url)
            }
          };

          if (j === selectedIndex) {
            url = tab.url;
            item.selected = true;
          }

          tabList.push(item);
        }

        fragment.appendChild($E('menuitem', {
          label: {
            value: closedWindow.title
          },
          tooltip: {
            title: closedWindow.title,
            url,
            list: tabList
          },
          icon: tabs[closedWindow.selected - 1].image,
          class: 'menuitem-iconic',
          action: Action.undoCloseWindow(i)
        }));
      });

      return fragment;
    });
  }

  return {
    build
  };
})();

/**
 * Tooltip of a menuitem.
 */
const Tooltip = (function() {
  function init() {
    let tooltipStyle =
      // @note Each inner text container has 'max-width'.
      'max-width:none;' +
      // Tight text wrapping.
      'word-break:break-all;word-wrap:break-word;';

    let tooltip = $ID('mainPopupSet').appendChild(
      $E('tooltip', {
        id: kUI.tooltip.id,
        style: tooltipStyle
      })
    );

    $event(tooltip, 'popupshowing', onPopupShowing);
    $event(tooltip, 'popuphiding', onPopupHiding);
  }

  function onPopupHiding(aEvent) {
    let tooltip = aEvent.target;

    if (tooltip.id !== kUI.tooltip.id) {
      return;
    }

    while (tooltip.hasChildNodes()) {
      tooltip.removeChild(tooltip.firstChild);
    }
  }

  function onPopupShowing(aEvent) {
    let menuitem = window.document.tooltipNode;

    let tooltipData = menuitem[kDataKey.tooltipData];

    if (tooltipData) {
      fillInTooltip(tooltipData);
    }
  }

  function fillInTooltip({title, url, list}) {
    let {maxWidth, maxNumWrapLines} = kPref.tooltip;
    let maxTextLength = maxWidth * maxNumWrapLines;

    let fragment = createDocumentFragment();

    let add = (aValue) => {
      let style = 'max-width:' + maxWidth + 'em;';

      if (aValue.title) {
        style += 'font-weight:bold;background-color:lightgray;';
      }
      else if (aValue.url) {
        style += '';
      }
      else if (aValue.header) {
        style += 'color:dimgray;';
      }
      else if (aValue.selected) {
        style += 'font-weight:bold;';
      }

      if (aValue.wrapping) {
        aValue.label.wrapping = {
          maxTextLength
        };
      }

      fragment.appendChild($E('label', {
        label: aValue.label,
        style
      }));
    };

    // A text of a title or URL shows without being cropped as possible and may
    // be line-wrapped.
    add({
      label: {
        value: title
      },
      title: true,
      wrapping: true
    });

    if (url && url !== title) {
      add({
        label: {
          value: url
        },
        url: true,
        wrapping: true
      });
    }

    // A text of a list item shows in one line and may be cropped.
    if (list) {
      list.forEach(add);
    }

    $ID(kUI.tooltip.id).appendChild(fragment);
  }

  return {
    init
  };
})();

/**
 * Attribute handler for |ucjsUtil.DOMUtils.$E|.
 */
function handleAttribute(aNode, aName, aValue) {
  switch (aName) {
    case 'label': {
      // Handle a label of list items in a menuitem and a tooltip.
      if (aValue.value === undefined) {
        return false;
      }

      // <label> in a tooltip.
      if (aNode.localName === 'label') {
        aName = 'value';
      }

      let {value, crop} = fitIntoLabel(aValue.value, aValue.wrapping);

      if (aValue.prefix) {
        value = [aValue.prefix, value].join(' ');
      }

      if (aValue.wrapping) {
        aNode.appendChild(window.document.createTextNode(value));
      }
      else {
        if (crop) {
          aNode.setAttribute('crop', crop);
        }

        aNode.setAttribute(aName, value);
      }

      return true;
    }

    case 'icon': {
      aNode.style.listStyleImage = 'url(' + fixFaviconURL(aValue) + ')';

      return true;
    }

    case 'action': {
      if (aValue) {
        for (let name in aValue) {
          let value = aValue[name];

          if (name === 'oncommand' && typeof value !== 'string') {
            aNode[kDataKey.commandData] = value;
          }
          else {
            aNode.setAttribute(name, value);
          }
        }
      }

      return true;
    }

    case 'tooltip': {
      aNode[kDataKey.tooltipData] = aValue;
      aNode.tooltip = kUI.tooltip.id;

      return true;
    }
  }

  return false;
}

/**
 * Helper functions for DOM.
 */
function createDocumentFragment() {
  return window.document.createDocumentFragment();
}

function makeMenuSeparator(popup) {
  return popup.appendChild($E('menuseparator'));
}

function buildMenuItems(params) {
  let {
    builder,
    listUI,
    referenceNode
  } = params;

  builder().then((list) => {
    // Do nothing if the context menu has been closed.
    if (!contentAreaContextMenu.isOpen()) {
      return;
    }

    appendMenuItem(list, listUI, referenceNode);
  }).
  catch(Cu.reportError);
}

function appendMenuItem(menuItem, listUI, referenceNode) {
  let popup, reference;

  if (referenceNode.localName === 'menupopup') {
    popup = referenceNode;
    reference = null;
  }
  else {
    popup = referenceNode.parentNode;
    reference = referenceNode;
  }

  if (!menuItem && listUI.noItems) {
    menuItem = $E('menuitem', {
      label: listUI.noItems,
      disabled: true
    });
  }

  if (menuItem) {
    popup.insertBefore(menuItem, reference);
  }
}

/**
 * Helper functions.
 */
function fixPluralForm({format, count, labels}) {
  return format.
    replace('#1', count || 'No').
    replace('#2', labels[(count < 2) ? 0 : 1]);
}

function limitListRange({index, length, maxNumItems}) {
  if (!maxNumItems || maxNumItems < 0) {
    return [0, length - 1];
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

function fitIntoLabel(text, wrapping) {
  let crop;

  // Show the filename of a URL.
  if (/^(?:https?|ftp|file):/i.test(text)) {
    crop = 'center';
  }

  if (wrapping) {
    let maxLength = wrapping.maxTextLength;

    if (text.length > maxLength) {
      let {ellipsis} = Modules.PlacesUIUtils;

      if (crop === 'center') {
        let half = Math.floor(maxLength / 2);

        text = [text.substr(0, half), text.substr(-half)].join(ellipsis);
      }
      else {
        text = text.substr(0, maxLength) + ellipsis;
      }
    }
  }

  return {
    value: text || Modules.PlacesUIUtils.getString('noTitle'),
    crop
  };
}

function fixFaviconURL(iconURL) {
  if (!iconURL) {
    return Modules.PlacesUtils.favicons.defaultFavicon.spec;
  }

  if (/^https?:/.test(iconURL)) {
    iconURL = 'moz-anno:favicon:' + iconURL;
  }

  return iconURL;
}

function formatTime(microSeconds) {
  // Format to convert date and time.
  // @see http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
  const kTimeFormat = '%Y/%m/%d %H:%M:%S';
  const kTextFormat = '[%time%]';
  const kNotAvailable = '[N/A]';

  if (!microSeconds) {
    return kNotAvailable;
  }

  // Convert microseconds into milliseconds.
  let time = (new Date(microSeconds / 1000)).toLocaleFormat(kTimeFormat);

  return kTextFormat.replace('%time%', time);
}

function formatOrderNumber(num) {
  return num + '.';
}

/**
 * Entry point.
 */
function ListEx_init() {
  MainMenu.init();
}

ListEx_init();


})(this);
