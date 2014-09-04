// ==UserScript==
// @name MoveTabToWindow.uc.js
// @description Moves a tab to the other window
// @include main
// ==/UserScript==

// @require Util.uc.js
// @require [optional] TabEx.uc.js
// @usage creates a menu in the tab context menu


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
 * Utility for the tab context menu
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
  let tabContextMenu = TabContext.menu;

  addEvent(tabContextMenu, 'popupshowing', updateMenu, false);

  let menu = $E('menu', {
    id: kUI.menu.id,
    label: kUI.menu.label,
    accesskey: kUI.menu.accesskey
  });

  let popup = $E('menupopup', {
    onpopupshowing: 'event.stopPropagation();'
  });

  popup.appendChild($E('menuitem', {
    id: kUI.newWindow.id,
    label: kUI.newWindow.label
  }));

  addEvent(popup, 'command', onCommand, false);

  menu.appendChild(popup);

  let defaultItem = $ID('context_openTabInWindow');

  defaultItem.style.display = 'none';

  tabContextMenu.insertBefore(menu, defaultItem);
}

function updateMenu(aEvent) {
  aEvent.stopPropagation();

  if (aEvent.target !== TabContext.menu) {
    return;
  }

  let menu = $E($ID(kUI.menu.id), {
    disabled: true
  });

  // disable in private browsing
  if (isWindowPrivate(window)) {
    return;
  }

  let contextTab = TabContext.tab;

  // disable on a pinned tab
  if (contextTab.pinned) {
    return;
  }

  let tabsNum = gBrowser.tabs.length;
  let wins = getWindowsState(contextTab);

  // meaningless at one tab window and no other window
  if (tabsNum <= 1 && !wins.length) {
    return;
  }

  $E(menu, {
    disabled: false
  });

  // make a menuitem to move the tab to a new window
  // it is useless when the window has only one tab
  // @note this is used as the reference node to append menuitem elements
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
  else if (item.value > -1) {
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

    // Skip window which is closed, current, not browser, and popup
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

  // create a new tab in the other window
  let newTab = otherTabBrowser.addTab('about:blank');

  // Renew the state of the new tab.
  // @require TabEx.uc.js
  // TODO: make the interface to set the data in |ucjsTabEx|.
  if (window.ucjsTabEx) {
    newTab.setAttribute('ucjs_TabEx_openInfo',
      aTab.getAttribute('ucjs_TabEx_openInfo'));

    // Set a flag to load the document when the tab is selected.
    if (aTab.hasAttribute('ucjs_TabEx_suspended')) {
      newTab.setAttribute('ucjs_TabEx_suspended', true);
    }
  }

  // Make sure the new browser has a docshell.
  let newBrowser = otherTabBrowser.getBrowserForTab(newTab);
  newBrowser.stop();
  newBrowser.docShell;

  // swap the our tab with a new one, and then close it
  otherTabBrowser.swapBrowsersAndCloseOther(newTab, aTab);

  // select the moved tab
  otherTabBrowser.selectedTab = newTab;

  return newTab;
}

function getWindowEnumerator() {
  // enumerator of all windows in order from front to back
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
