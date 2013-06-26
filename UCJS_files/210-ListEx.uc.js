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
 * @value {integer} [>0]
 *
 * !!! WARNING !!!
 * *ALL* items will be listed if set to 0.
 * It can cause performance problems.
 * !!! WARNING !!!
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

    let noRecent = makeDisabledMenuItem(popup, 'Recent: No history.');
    asyncBuildRecentHistory(noRecent, function(aHasBuilt) {
      if (aHasBuilt) {
        noRecent.hidden = true;
      }
    });

    makeMenuSeparator(popup);

    popup.appendChild($E('menuitem', {
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
      } else {
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

      getTimeAndFavicon(URL, function(aTime, aIcon) {
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
    getRecentHistory(function(aRecentHistory) {
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

    aRecentHistory.forEach(function(entry) {
      let URL, title, className, action;

      URL = entry.url;
      title = entry.title || URL;
      className = ['menuitem-iconic'];
      if (currentURL === URL) {
        className.push('unified-nav-current');
      } else {
        // @see resource://app/modules/PlacesUIUtils.jsm
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
    let limit = (kMaxListItems > 0) ? kMaxListItems : -1;

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
    Array.forEach(gBrowser.tabs, function(tab, i) {
      let className, action;

      className = ['menuitem-iconic'];
      if (tab.selected) {
        className.push('unified-nav-current');
      } else {
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

        let tabs = [getPluralForm('[#1 #2]', b.mTabs.length,
          ['Tab', 'Tabs'])];
        let [start, end] = getListRange(b.mTabContainer.selectedIndex,
          b.mTabs.length);
        for (let j = start; j < end; j++) {
          tabs.push((j + 1) + '. ' + b.mTabs[j].label);
        }
        tip = tabs.join('\n');

        title = b.contentTitle || b.selectedTab.label || b.currentURI.spec;
        icon = b.getIcon(b.selectedTab);
      } else {
        title = win.document.title;
        tip = win.location.href;
        icon = 'moz-icon://.exe?size=16';
      }

      className = ['menuitem-iconic'];

      if (win === window) {
        className.push('unified-nav-current');
      } else {
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
    const {Cc, Ci} = window;

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
    var sessionStore = getSessionStore();
    if (sessionStore.getClosedTabCount(window) === 0) {
      return false;
    }

    var closedTabs = JSON.parse(sessionStore.getClosedTabData(window));
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
    var sessionStore = getSessionStore();
    if (sessionStore.getClosedWindowCount() === 0) {
      return false;
    }

    var closedWindows = JSON.parse(sessionStore.getClosedWindowData());
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
      } catch (ex) {}

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
          // @see chrome://browser/content/utilityOverlay.js::
          // checkForMiddleClick
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
  return aPopup.appendChild($E('menuitem', {
    label: aLabel,
    disabled: true
  }));
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

function getTitle(aText) {
  // @see resource://app/modules/PlacesUIUtils.jsm
  const {PlacesUIUtils} = window;
  const kMaxTextLen = 40;

  if (aText && aText.length > kMaxTextLen) {
    if (/^(?:https?|ftp|file):/i.test(aText)) {
      let half = Math.floor(kMaxTextLen / 2);
      aText = aText.substr(0, half) + PlacesUIUtils.ellipsis +
        aText.substr(-half);
    } else {
      aText = aText.substr(0, kMaxTextLen) + PlacesUIUtils.ellipsis;
    }
  }

  return aText || PlacesUIUtils.getString('noTitle');
}

function getTooltip(aTitle, aURL) {
  if (aTitle === aURL) {
    return aTitle;
  }
  return [aTitle, aURL].join('\n');
}

function getFavicon(aIconURL) {
  // @see resource://gre/modules/PlacesUtils.jsm
  const {favicons} = window.PlacesUtils;

  if (aIconURL) {
    if (/^https?:/.test(aIconURL)) {
      aIconURL = 'moz-anno:favicon:' + aIconURL;
    }
    return aIconURL;
  }
  return favicons.defaultFavicon.spec;
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

function asyncScanPlacesDB(aParam) {
  return window.ucjsUtil.asyncScanPlacesDB(aParam);
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
