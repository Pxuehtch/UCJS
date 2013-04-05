// ==UserScript==
// @name MoveTabToWindow.uc.js
// @description Moves a tab to the other window.
// @include main
// ==/UserScript==

// @require Util.uc.js
// @usage Access to items in a tab context menu.


(function(window, undefined) {


"use strict";


/**
 * Settings for UI
 * @note |U()| converts embedded chars in the code for displaying properly.
 */
const kBundle = {
  menu: {
    id: 'ucjs_moveTabToWindow_menu',
    label: U('他のウィンドウへ移動'),
    accesskey: 'W'
  },
  otherWindow: {
    label: U('%title% [%tabsNum% tab%s%]')
  },
  hasSame: {
    style: 'color:red;',
    tooltiptext: U('同じ URL のタブあり')
  },
  newWindow: {
    id: 'ucjs_moveTabToWindow_newWindow',
    label: U('新しいウィンドウ')
  }
};


//********** Functions

function MoveTabToWindow_init() {
  buildMenu();
}

function buildMenu() {
  var tabContextMenu = getTabContextMenu();
  addEvent([tabContextMenu, 'popupshowing', updateMenu, false]);

  var menu = $E('menu', {
    id: kBundle.menu.id,
    label: kBundle.menu.label,
    accesskey: kBundle.menu.accesskey
  });

  var popup = $E('menupopup', {
    onpopupshowing: 'event.stopPropagation();'
  });
  popup.appendChild($E('menuitem', {
    id: kBundle.newWindow.id,
    label: kBundle.newWindow.label,
    oncommand: 'gBrowser.replaceTabWithWindow(TabContextMenu.contextTab);'
  }));
  addEvent([popup, 'command', onCommand, false]);
  menu.appendChild(popup);

  var defaultItem = $ID('context_openTabInWindow');
  defaultItem.style.display = 'none';
  tabContextMenu.insertBefore(menu, defaultItem);
}

function updateMenu(aEvent) {
  aEvent.stopPropagation();
  if (aEvent.target !== getTabContextMenu()) {
    return;
  }

  let menu = $E($ID(kBundle.menu.id), {
    disabled: true
  });

  // disable in private browsing
  if (isWindowPrivate(window)) {
    return;
  }

  let contextTab = getContextTab();
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
  let refItem = $E($ID(kBundle.newWindow.id), {
    disabled: tabsNum <= 1
  });

  var popup = menu.menupopup;

  while (popup.firstChild && popup.firstChild !== refItem) {
    popup.removeChild(popup.firstChild);
  }

  if (wins.length) {
    wins.forEach(function(win) {
      var item = popup.insertBefore($E('menuitem', {
        value: win.index,
        label: kBundle.otherWindow.label.
          replace('%title%', win.title).
          replace('%tabsNum%', win.tabsNum).
          replace('%s%', win.tabsNum > 1 ? 's' : '')
      }), refItem);

      if (win.isPrivate) {
        $E(item, {
          disabled: true
        });
      }
      else if (win.hasSame) {
        $E(item, {
          style: kBundle.hasSame.style,
          tooltiptext: kBundle.hasSame.tooltiptext
        });
      }
    });

    popup.insertBefore($E('menuseparator'), refItem);
  }
}

function onCommand(aEvent) {
  aEvent.stopPropagation();
  let item = aEvent.target;
  if (!item.value) {
    return;
  }

  moveTabToOtherWindow(getContextTab(), getWindowAt(+(item.value)));
}

function getWindowsState(aTab) {
  if (!aTab) {
    return;
  }

  var wins = [];

  var tabURL = aTab.linkedBrowser.currentURI.spec;
  var enumerator = getWindowEnumerator();
  var i = -1;
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
      hasSame: tabbrowser.browsers.some(function(b) {
        return b.currentURI.spec === tabURL;
      }),
      title: tabbrowser.selectedTab.label,
      tabsNum: tabbrowser.tabs.length,
      isPrivate: isWindowPrivate(win)
    });
  }

  return wins;
}

function getWindowAt(aIndex) {
  var enumerator = getWindowEnumerator();
  var index = 0;
  while (enumerator.hasMoreElements()) {
    let win = enumerator.getNext();
    if (index++ === aIndex) {
      return win;
    }
  }
  return null;
}

function moveTabToOtherWindow(aTab, aWindow) {
  if (!aTab || !aWindow) {
    return;
  }

  var otherTabBrowser = aWindow.gBrowser;

  // @see chrome://browser/content/tabbrowser.xml::
  //   <binding id="tabbrowser-tabs">::<handler event="drop">
  // Create a new tab in the other window.
  var newTab = otherTabBrowser.addTab('about:blank');
  var newBrowser = otherTabBrowser.getBrowserForTab(newTab);
  // Stop the about:blank load
  newBrowser.stop();
  // Make sure it has a docshell
  newBrowser.docShell;
  // Swap the our tab with a new one, and then close it
  otherTabBrowser.swapBrowsersAndCloseOther(newTab, aTab);
  // Select the moved tab
  otherTabBrowser.selectedTab = newTab;

  aWindow.focus();
}


//********** Utilities

function getTabContextMenu() {
  return gBrowser.tabContextMenu;
}

function getContextTab() {
  // @see chrome://browser/content/browser.js::TabContextMenu
  return window.TabContextMenu.contextTab;
}

function getWindowEnumerator() {
  // enumerator of all windows in order from front to back
  // @see resource:///modules/Services.jsm
  return window.Services.wm.getZOrderDOMWindowEnumerator(null, true);
}

function isWindowPrivate(aWindow) {
  // @see resource://gre/modules/PrivateBrowsingUtils.jsm
  return window.PrivateBrowsingUtils.isWindowPrivate(aWindow);
}

function $ID(aId) {
  return window.document.getElementById(aId);
}


//********** Imports

function $E(aTagOrNode, aAttribute) {
  return window.ucjsUtil.createNode(aTagOrNode, aAttribute);
}

function U(aStr) {
  return window.ucjsUtil.toStringForUI(aStr);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('MoveTabToWindow.uc.js', aMsg);
}


//********** Entry point

MoveTabToWindow_init();


})(this);
