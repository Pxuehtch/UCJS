// ==UserScript==
// @name MoveTabToWindow.uc.js
// @description Moves a tab to the other window
// @include main
// ==/UserScript==

// @require Util.uc.js
// @usage Creates a menu in the tab context menu.


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  XPCOM: {
    getModule
  },
  createNode: $E,
  getNodeById: $ID,
  addEvent
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('MoveTabToWindow.uc.js', aMsg);
}

/**
 * UI settings
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
 * Fx native elements for the tab context menu
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

function MoveTabToWindow_init() {
  buildMenu();
}

function buildMenu() {
  let menu = $E('menu', {
    id: kUI.menu.id,
    label: kUI.menu.label,
    accesskey: kUI.menu.accesskey
  });

  let popup = menu.appendChild($E('menupopup', {
    onpopupshowing: 'event.stopPropagation();'
  }));

  popup.appendChild($E('menuitem', {
    id: kUI.newWindow.id,
    label: kUI.newWindow.label
  }));

  addEvent(popup, 'command', onCommand, false);

  // Replace the default menuitem 'Move to New Window'.
  let defaultItem = $ID('context_openTabInWindow');

  defaultItem.style.display = 'none';

  TabContext.menu.insertBefore(menu, defaultItem);

  addEvent(TabContext.menu, 'popupshowing', updateMenu, false);
}

function updateMenu(aEvent) {
  aEvent.stopPropagation();

  if (aEvent.target !== TabContext.menu) {
    return;
  }

  let menu = $E($ID(kUI.menu.id), {
    disabled: true
  });

  // Disable in private browsing.
  if (isWindowPrivate(window)) {
    return;
  }

  // Disable on a pinned tab.
  if (TabContext.tab.pinned) {
    return;
  }

  let tabsNum = gBrowser.visibleTabs.length;
  let wins = getWindowsState(TabContext.tab);

  // Disable at a useless case of a one tab window and no other windows.
  if (tabsNum <= 1 && !wins.length) {
    return;
  }

  // Remove disabled attribute.
  $E(menu, {
    disabled: null
  });

  // A menuitem for moving the tab to a new opened window.
  // @note Useless when the our window has only one tab.
  // @note Also used as the reference node to append menuitem elements.
  let refItem = $E($ID(kUI.newWindow.id), {
    disabled: tabsNum <= 1
  });

  let popup = menu.menupopup;

  while (popup.firstChild && popup.firstChild !== refItem) {
    popup.removeChild(popup.firstChild);
  }

  if (wins.length) {
    wins.forEach((win) => {
      let item = popup.insertBefore($E('menuitem', {
        value: win.index,
        label: kUI.otherWindow.label.
          replace('%title%', win.title).
          replace('%tabsNum%', win.tabsNum).
          replace('%s%', win.tabsNum > 1 ? 's' : '')
      }), refItem);

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
}

function onCommand(aEvent) {
  aEvent.stopPropagation();

  let item = aEvent.target;

  if (item.id === kUI.newWindow.id) {
    moveTabToWindow(TabContext.tab);
  }
  else if (item.value) {
    moveTabToWindow(TabContext.tab, getWindowAt(+(item.value)));
  }
}

function getWindowsState(aTab) {
  if (!aTab) {
    return;
  }

  let wins = [];

  let tabURL = aTab.linkedBrowser.currentURI.spec;
  let enumerator = getWindowEnumerator();
  let i = -1;

  while (enumerator.hasMoreElements()) {
    i++;

    let win = enumerator.getNext();

    // Skip window which is closed, current, not browser, and popup.
    if (win.closed ||
        win === window ||
        win.document.documentElement.getAttribute('windowtype') !== 
          'navigator:browser' ||
        win.document.documentElement.getAttribute('chromehidden')) {
      continue;
    }

    let tabbrowser = win.gBrowser;

    wins.push({
      index: i,
      hasSameURL:
        tabbrowser.browsers.
        some((browser) => browser.currentURI.spec === tabURL),
      title: tabbrowser.selectedTab.label,
      tabsNum: tabbrowser.tabs.length,
      isPrivate: isWindowPrivate(win)
    });
  }

  return wins;
}

function getWindowAt(aIndex) {
  let enumerator = getWindowEnumerator();
  let index = 0;

  while (enumerator.hasMoreElements()) {
    let win = enumerator.getNext();

    if (index++ === aIndex) {
      return win;
    }
  }
  return null;
}

function moveTabToWindow(aTab, aWindow) {
  if (aWindow) {
    moveTabToOtherWindow(aTab, aWindow);
    return;
  }

  // @see chrome://browser/content/browser.js::OpenBrowserWindow
  let win = window.OpenBrowserWindow();

  let onLoad = () => {
    win.removeEventListener('load', onLoad, false);

    // WORKAROUND: Wait for initialization of the new browser.
    setTimeout(() => {
      let newTab = moveTabToOtherWindow(aTab, win);

      win.gBrowser.removeAllTabsBut(newTab);
    }, 500);
  };

  win.addEventListener('load', onLoad, false);
}

function moveTabToOtherWindow(aTab, aWindow) {
  aWindow.focus();

  let otherTabBrowser = aWindow.gBrowser;

  // Create a new blank tab in the other window.
  let newTab = otherTabBrowser.addTab();

  // Make sure the new browser has a docshell.
  let newBrowser = otherTabBrowser.getBrowserForTab(newTab);
  newBrowser.stop();
  newBrowser.docShell;

  // Swap the given tab with a new tab, and then close the original tab.
  otherTabBrowser.swapBrowsersAndCloseOther(newTab, aTab);

  // Select the moved tab.
  otherTabBrowser.selectedTab = newTab;

  return newTab;
}

function getWindowEnumerator() {
  // Enumerator of all windows in order from front to back.
  return Services.wm.getZOrderDOMWindowEnumerator(null, true);
}

function isWindowPrivate(aWindow) {
  const {PrivateBrowsingUtils} =
    getModule('resource://gre/modules/PrivateBrowsingUtils.jsm');

  return PrivateBrowsingUtils.isWindowPrivate(aWindow);
}

/**
 * Entry point
 */
MoveTabToWindow_init();


})(this);
