// ==UserScript==
// @name MoveTabToWindow.uc.js
// @description Moves a tab to another window.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @usage A menu is appended in the tab context menu.


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  Listeners: {
    $event,
    $eventOnce
  },
  DOMUtils: {
    $E,
    $ID
  },
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

/**
 * UI settings.
 */
const kUI = {
  menu: {
    id: 'ucjs_MoveTabToWindow_menu',
    label: '他のウィンドウへ移動',
    accesskey: 'W'
  },
  otherWindow: {
    label: '%title% [%tabsNum% tab%s%]'
  },
  hasSameURL: {
    style: 'color:red;',
    tooltiptext: '同じ URL のタブあり'
  },
  isPrivate: {
    tooltiptext: 'プライベートウィンドウ'
  },
  newWindow: {
    id: 'ucjs_MoveTabToWindow_newWindow',
    label: '新しいウィンドウ'
  }
};

/**
 * Key name for storing data.
 */
const kDataKey = {
  // Extended property name of a menuitem.
  windowIndex: 'ucjs_MoveTabToWindow_windowIndex'
};

/**
 * Fx native elements for the tab context menu.
 */
const TabContext = {
  get menu() {
    // @see chrome://browser/content/tabbrowser.xml::tabContextMenu
    return gBrowser.tabContextMenu;
  },

  get tab() {
    // @see chrome://browser/content/browser.js::TabContextMenu
    return window.TabContextMenu.contextTab;
  }
};

/**
 * Utility functions for browser windows.
 */
const WindowUtil = (function() {
  // @see resource://gre/modules/commonjs/sdk/window/utils.js
  const utils = Modules.require('sdk/window/utils');

  /**
   * Generator for browser windows.
   *
   * @return {Generator}
   */
  function* getBrowserWindows() {
    // Enumerator of all windows in order from front to back.
    let winEnum = Services.wm.getZOrderDOMWindowEnumerator(null, true);

    while (winEnum.hasMoreElements()) {
      let win = winEnum.getNext().QueryInterface(Ci.nsIDOMWindow);

      // Skip a closed, non-browser and popup window.
      if (!win.closed && isBrowser(win) && win.toolbar.visible) {
        yield win;
      }
    }
  }

  function isBrowser(aWindow) {
    return utils.isBrowser(aWindow);
  }

  function isPrivate(aWindow) {
    return utils.isWindowPrivate(aWindow);
  }

  function getIdFor(aWindow) {
    return utils.getOuterId(aWindow);
  }

  function getWindowById(aId) {
    return utils.getByOuterId(aId);
  }

  return {
    getBrowserWindows,
    isPrivate,
    getIdFor,
    getWindowById
  };
})();

function MoveTabToWindow_init() {
  buildMenu();
}

function buildMenu() {
  let menu = $E('menu', {
    id: kUI.menu.id,
    label: kUI.menu.label,
    accesskey: kUI.menu.accesskey
  });

  let popup = menu.appendChild($E('menupopup'));

  popup.appendChild($E('menuitem', {
    id: kUI.newWindow.id,
    label: kUI.newWindow.label
  }));

  $event(popup, 'command', onCommand);

  // Replace the default menuitem 'Move to New Window'.
  let defaultItem = $ID('context_openTabInWindow');

  defaultItem.style.display = 'none';

  TabContext.menu.insertBefore(menu, defaultItem);

  $event(TabContext.menu, 'popupshowing', onPopupShowing);
}

function onPopupShowing(aEvent) {
  if (aEvent.target !== TabContext.menu) {
    return;
  }

  let menu = $E($ID(kUI.menu.id), {
    disabled: true
  });

  // Disable in private browsing.
  if (WindowUtil.isPrivate(window)) {
    return;
  }

  // Disable on a pinned tab.
  if (TabContext.tab.pinned) {
    return;
  }

  let tabsNum = gBrowser.visibleTabs.length;
  let windowsData = getWindowsData(TabContext.tab);

  // Disable at a useless case of a one tab window and no other windows.
  if (tabsNum <= 1 && !windowsData.length) {
    return;
  }

  // Remove disabled attribute.
  $E(menu, {
    disabled: null
  });

  // A menuitem for moving the tab to a new opened window.
  // @note Useless when the our window has only one tab.
  // @note Also used as the reference node to append menuitems.
  let refItem = $E($ID(kUI.newWindow.id), {
    disabled: tabsNum <= 1
  });

  let popup = menu.menupopup;

  // Clean up the previous menuitems for windows.
  while (popup.firstChild && popup.firstChild !== refItem) {
    popup.removeChild(popup.firstChild);
  }

  // No other windows.
  if (!windowsData.length) {
    return;
  }

  windowsData.forEach((win) => {
    let item = popup.insertBefore($E('menuitem', {
      label: kUI.otherWindow.label.
        replace('%title%', win.title).
        replace('%tabsNum%', win.tabsNum).
        replace('%s%', win.tabsNum > 1 ? 's' : '')
    }), refItem);

    item[kDataKey.windowIndex] = win.id;

    if (win.isPrivate) {
      $E(item, {
        disabled: true,
        tooltiptext: kUI.isPrivate.tooltiptext
      });
    }
    else if (win.hasSameURL) {
      $E(item, {
        style: kUI.hasSameURL.style,
        tooltiptext: kUI.hasSameURL.tooltiptext
      });
    }
  });

  popup.insertBefore($E('menuseparator'), refItem);
}

function onCommand(aEvent) {
  let item = aEvent.target;

  if (item.id === kUI.newWindow.id) {
    moveTabToWindow(TabContext.tab);
  }
  else {
    let index = item[kDataKey.windowIndex];

    if (index > -1) {
      moveTabToWindow(TabContext.tab, WindowUtil.getWindowById(index));
    }
  }
}

function getWindowsData(aTab) {
  let {getBrowserWindows, isPrivate, getIdFor} = WindowUtil;

  let tabURL = gBrowser.getBrowserForTab(aTab).currentURI.spec;
  let hasSameURL = (aBrowsers) =>
    aBrowsers.some((b) => b.currentURI.spec === tabURL);

  let windowsData = [];

  for (let win of getBrowserWindows()) {
    // Skip the current window.
    if (win === window) {
      continue;
    }

    let tabbrowser = win.gBrowser;

    windowsData.push({
      id: getIdFor(win),
      hasSameURL: hasSameURL(tabbrowser.browsers),
      title: tabbrowser.selectedTab.label,
      tabsNum: tabbrowser.visibleTabs.length,
      isPrivate: isPrivate(win)
    });
  }

  return windowsData;
}

function moveTabToWindow(aTab, aWindow) {
  if (aWindow) {
    moveTabToOtherWindow(aTab, aWindow);

    return;
  }

  // @see chrome://browser/content/browser.js::OpenBrowserWindow
  let newWindow = window.OpenBrowserWindow();

  $eventOnce(newWindow, 'load', () => {
    // WORKAROUND: Wait for the new browser to initialize.
    setTimeout(() => {
      let newTab = moveTabToOtherWindow(aTab, newWindow);

      newWindow.gBrowser.removeAllTabsBut(newTab);
    }, 500);
  });
}

function moveTabToOtherWindow(tab, otherWindow) {
  otherWindow.focus();

  let tabBrowser = otherWindow.gBrowser;

  // Adopts a tab to an other window, and selects it at the end position.
  // @note |adoptTab| creates a new tab and the number of tabs increases by
  // one. So the last index of tabs will be equal to the current number of
  // tabs.
  return tabBrowser.adoptTab(tab, tabBrowser.tabs.length, true);
}

/**
 * Entry point.
 */
MoveTabToWindow_init();


})(this);
