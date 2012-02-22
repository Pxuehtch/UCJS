// ==UserScript==
// @name MoveTabToWindow.uc.js
// @description Moves a tab to the other window.
// @include main
// ==/UserScript==

// @require Util.uc.js
// @usage Access to items in a tab context menu.


(function() {


"use strict";


// Preferences.

const kBundle = {
  menu: {
    id: 'ucjs_moveTabToWindow_menu',
    label: U('他のウィンドウへ移動'),
    accesskey: 'W'
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


// Functions.

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
  addEvent([popup, 'click', doCommand, false]);
  menu.appendChild(popup);

  var defaultItem = $ID('context_openTabInWindow');
  defaultItem.style.display = 'none';
  tabContextMenu.insertBefore(menu, defaultItem);
}

function updateMenu(aEvent) {
  aEvent.stopPropagation();
  if (aEvent.target !== getTabContextMenu())
    return;

  var menu = $ID(kBundle.menu.id);
  var tabs = gBrowser.tabs;
  var wins = getWindowsState(getContextTab());

  if (tabs.length === 1 && wins.length === 0) {
    menu.disabled = true;
    return;
  }
  menu.disabled = false;

  var popup = menu.menupopup;

  var item_newWindow = $ID(kBundle.newWindow.id);
  while (popup.firstChild && popup.firstChild !== item_newWindow) {
    popup.removeChild(popup.firstChild);
  }

  item_newWindow.disabled = tabs.length === 1;

  if (wins.length) {
    wins.forEach(function(win) {
      var item = popup.insertBefore($E('menuitem', {
        label: win.title,
        value: win.index
      }), item_newWindow);
      if (win.hasSame) {
        $E(item, {
          style: kBundle.hasSame.style,
          tooltiptext: kBundle.hasSame.tooltiptext
        });
      }
    });
    popup.insertBefore($E('menuseparator'), item_newWindow);
  }
}

function doCommand(aEvent) {
  aEvent.stopPropagation();
  if (aEvent.button !== 0)
    return;
  var item = aEvent.target;
  if (!item.value)
    return;

  moveTabToOtherWindow(getContextTab(), getWindowAt(+(item.value)));
}

function getWindowsState(aTab) {
  if (!aTab)
    return;

  var wins = [];

  var tabURL = aTab.linkedBrowser.currentURI.spec;
  var enumerator = getWindowEnumerator();
  var i = -1;
  while (enumerator.hasMoreElements()) {
    i++;
    let win = enumerator.getNext();
    // Skip window which is closed, current, not browser, and popup.
    if (win.closed ||
        win === window ||
        win.document.documentElement.getAttribute('windowtype') !== 'navigator:browser' ||
        win.document.documentElement.getAttribute('chromehidden'))
      continue;

    let tabbrowser = win.gBrowser;
    wins.push({
      index: i,
      hasSame: tabbrowser.browsers.some(function(b) b.currentURI.spec === tabURL),
      title: tabbrowser.selectedTab.label
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
  if (!aTab || !aWindow)
    return;
  var otherTabBrowser = aWindow.gBrowser;

  // @see chrome://browser/content/tabbrowser.xml::
  //   <binding id="tabbrowser-tabs">::<handler event="drop">
  // Create a new tab in the other window.
  var newTab = otherTabBrowser.addTab('about:blank');
  var newBrowser = otherTabBrowser.getBrowserForTab(newTab);
  // Stop the about:blank load.
  newBrowser.stop();
  // Make sure it has a docshell.
  newBrowser.docShell;
  // Swap the our tab with a new one, and then close it.
  otherTabBrowser.swapBrowsersAndCloseOther(newTab, aTab);
  // Select the moved tab.
  otherTabBrowser.selectedTab = newTab;

  aWindow.focus();
}

function getTabContextMenu() {
  return gBrowser.tabContextMenu;
}

function getContextTab() {
  // @see chrome://browser/content/browser.js::TabContextMenu
  return TabContextMenu.contextTab;
}

function getWindowEnumerator() {
  // Enumerator of all windows in order from front to back.
  return Services.wm.getZOrderDOMWindowEnumerator(null, true);
}


// Utilities.

function $ID(aId)
  document.getElementById(aId);

function $E(aTagOrNode, aAttribute) {
  var element = (typeof aTagOrNode === 'string') ? document.createElement(aTagOrNode) : aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value !== null && typeof value !== 'undefined') {
        element.setAttribute(name, value);
      }
    }
  }

  return element;
}


// Imports.

function U(aText)
  ucjsUtil.convertForSystem(aText);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function log(aMsg)
  ucjsUtil.logMessage('MoveTabToWindow.uc.js', aMsg);


// Start.

MoveTabToWindow_init();


})();
