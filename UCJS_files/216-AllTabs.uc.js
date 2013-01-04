// ==UserScript==
// @name        AllTabs.uc.js
// @description Unifies alltabs-button and tabview-button.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @require [optional] UI.uc.js
// @usage Access to the tab view button in the tab bar.
// @note Some default functions are modified. see @modified
// @note cf. https://github.com/teramako/Pano/blob/master/chrome/content/pano-menu.sub.js

(function(window, undefined) {


"use strict";


/**
 * String format for UI
 * @usage format('%str is %num', {str: 'foo', num: 3}); -> 'foo is 3'
 * @note Plural form of numbers is avalable;
 *   '%key{None;A key;%key keys}' ->
 *    key=0:'None', key=1:'A key', key=#(>=2):'# keys'
 * @see |format()|
 */
const kFormat = {
  GROUPS_MENU: 'Groups',

  UNTITLED_GROUP: '(Untitled)',
  CURRENT_GROUP: 'Current group',
  EMPTY_GROUP: 'No tabs',

  GROUP_STATE: '[%count] %title',
  PINNEDTABS_STATE: '%count{No pinned tabs.;Pinned tab.;%count pinned tabs.}',

  TAB_TOOLTIP: '[%index/%count] %group\n%title',
  TABVIEW_TOOLTIP: 'Group: %group\nTab: %tab (Pinned: %pinned)'
};

/**
 * Identifiers
 */
const kID = {
  // Default id
  TABVIEW_BUTTON: 'tabview-button',
  ALLTABS_BUTTON: 'alltabs-button',
  ALLTABS_POPUP: 'alltabs-popup',
  ALLTABS_POPUP_SEPARATOR: 'alltabs-popup-separator',

  // Custom id
  TABVIEW_TOOLTIP: 'ucjs_alltabs_tabview_tooltip',
  GROUPS_MENU: 'ucjs_alltabs_groups_menu',
  GROUPS_MENUPOPUP: 'ucjs_alltabs_groups_menupopup',
  PINNEDTABS_TAG_MENUITEM: 'ucjs_alltabs_pinnedtabs_tag_menuitem',
  GROUP_TAG_MENUITEM: 'ucjs_alltabs_group_tag_menuitem',
  ATTR_GROUPINDEX: 'ucjs_alltabs_groupIndex',
  ATTR_TABPOS: 'ucjs_alltabs_tabPos',
  ATTR_TABOVERFLOWED: 'ucjs_alltabs_tabOverflowed'
};


//********** Helper objects

/**
 * Wrapper of tabs
 * @see chrome://browser/content/tabbrowser.xml
 */
var mTabs = {
  get count()
    gBrowser.tabs.length,

  get pinnedCount()
    gBrowser._numPinnedTabs,

  get visibleCount()
    gBrowser.visibleTabs.length - gBrowser._numPinnedTabs,

  selectAt: function(aIndex) {
    gBrowser.tabContainer.selectedIndex = parseInt(aIndex, 10);
  }
};

/**
 * Wrapper of TabView
 * @see chrome://browser/content/browser.js::TabView
 */
var mTabView = {
  get GroupItems()
    window.TabView.getContentWindow().GroupItems,

  get groupItems()
    this.GroupItems.groupItems,

  get activeGroupItem()
    this.GroupItems.getActiveGroupItem(),

  get activeGroupName()
    this.activeGroupItem.getTitle(),

  init: function() {
    window.TabView._initFrame();
  }
};

/**
 * Tab groups handler
 */
var mTabGroups = {
  groups: [],

  get count()
    this.groups.length,

  add: function(aGroupItem) {
    var children = aGroupItem.getChildren();

    this.groups.push({
      tabs: children.map(function(tabItem) tabItem.tab),
      topTab: children.length ? aGroupItem.getTopChild().tab : null
    });
  },

  clear: function() {
    this.groups.forEach(function(group) {
      group.tabs.forEach(function(tab) {
        tab = null;
      });
      group.tabs.length = 0;
      group.topTab = null;
    });
    this.groups.length = 0;
  },

  getAt: function(aIndex) {
    return this.groups[parseInt(aIndex, 10)];
  }
};


//********** Functions

function AllTabs_init() {
  initCSS();
  moveAllTabsMenuToTabViewButton();
  customizeAllTabsPopupFunction();
  customizeTabViewButtonTooltip();
  customizeTabTooltip();
  initAllTabsMenu();
  mTabView.init();
}

function initCSS() {
  var css = '\
    #%%kID.GROUPS_MENU%%{\
      list-style-image:url("chrome://browser/skin/tabbrowser/alltabs.png");\
      -moz-image-region:rect(0,28px,16px,14px);\
    }\
    #%%kID.GROUPS_MENU%%[disabled]{\
      -moz-image-region:rect(0,14px,16px,0);\
    }\
    #%%kID.GROUPS_MENU%% menu,\
    #%%kID.PINNEDTABS_TAG_MENUITEM%%,\
    #%%kID.GROUP_TAG_MENUITEM%%{\
      list-style-image:url("chrome://global/skin/dirListing/folder.png");\
    }\
  ';

  setCSS(css.replace(/%%(.+?)%%/g, function($0, $1) eval($1)));
}

function moveAllTabsMenuToTabViewButton() {
  // Hide default alltabs-button
  hideElement($(kID.ALLTABS_BUTTON));

  // Attach alltabs-contextmenu to tabview-button
  var tabview = $(kID.TABVIEW_BUTTON);
  tabview.appendChild($(kID.ALLTABS_POPUP));
  tabview.contextMenu = kID.ALLTABS_POPUP;
}

function customizeAllTabsPopupFunction() {
  var alltabsPopup = $(kID.ALLTABS_POPUP);

  // @modified chrome://browser/content/tabbrowser.xml::_setMenuitemAttributes
  var $_setMenuitemAttributes = alltabsPopup._setMenuitemAttributes;
  alltabsPopup._setMenuitemAttributes = function(aMenuitem, aTab) {
    $_setMenuitemAttributes.apply(this, arguments);

    // indicate the state of an unread tab
    setStateForUnreadTab(aMenuitem, aTab);
  };
}

function customizeTabViewButtonTooltip() {
  var tooltip = $('mainPopupSet').appendChild(
    $E('tooltip', {
      id: kID.TABVIEW_TOOLTIP
    })
  );
  addEvent([tooltip, 'popupshowing', onPopupShowing, false]);

  var tabview = $(kID.TABVIEW_BUTTON);
  tabview.removeAttribute('tooltiptext');
  tabview.setAttribute('tooltip', kID.TABVIEW_TOOLTIP);
}

function customizeTabTooltip() {
  // @modified chrome://browser/content/tabbrowser.xml::createTooltip
  gBrowser.createTooltip = function(event) {
    event.stopPropagation();
    var tab = window.document.tooltipNode;
    if (tab.localName != 'tab') {
      event.preventDefault();
      return;
    }

    var label;
    if (tab.mOverCloseButton) {
      label = tab.getAttribute('closetabtext');
    } else {
      label = format(kFormat.TAB_TOOLTIP, {
        index: Array.indexOf(this.visibleTabs, tab) + 1,
        count: this.visibleTabs.length,
        group: mTabView.activeGroupName || kFormat.UNTITLED_GROUP,
        title: tab.getAttribute('label')
      });
    }

    event.target.setAttribute('label', label);
  };
}

function initAllTabsMenu() {
  var alltabsPopup = $(kID.ALLTABS_POPUP);
  addEvent([alltabsPopup, 'popupshowing', onPopupShowing, true]);
  addEvent([alltabsPopup, 'popuphidden', onPopupHidden, true]);
  // WORKAROUND: See onCommand()
  addEvent([alltabsPopup, 'click', onCommand, false]);

  var groupsMenu = alltabsPopup.insertBefore(
    $E('menu', {
      id: kID.GROUPS_MENU,
      class: 'menu-iconic',
      label: kFormat.GROUPS_MENU
    }),
    $(kID.ALLTABS_POPUP_SEPARATOR)
  );
  addEvent([groupsMenu, 'click', onCommand, false]);

  groupsMenu.appendChild(
    $E('menupopup', {
        id: kID.GROUPS_MENUPOPUP
    })
  );
}

function makeGroupMenu(aGroupItem, aOption) {
  var {current, index} = aOption || {};

  var count = aGroupItem.getChildren().length,
      title = aGroupItem.getTitle();

  var menu = $E('menu', {
    class: 'menu-iconic',
    label: format(kFormat.GROUP_STATE, {
      count: count,
      title: title || kFormat.UNTITLED_GROUP
    }),
    disabled: current || count === 0 || null,
    tooltiptext: current ?
      kFormat.CURRENT_GROUP :
      (count === 0 ? kFormat.EMPTY_GROUP : null),
    user: [kID.ATTR_GROUPINDEX, index]
  });

  menu.appendChild($E('menupopup'));

  return menu;
}

function makeTabMenuItem(aTab, aOption) {
  var {selected} = aOption || {};

  return $E('menuitem', {
    class: 'menuitem-iconic alltabs-item menuitem-with-favicon',
    image: aTab.image,
    label: aTab.label,
    crop: aTab.getAttribute('crop'),
    selected: selected || null,
    user: [kID.ATTR_TABPOS, aTab._tPos]
  });
}

function onCommand(aEvent) {
  aEvent.stopPropagation();
  if (aEvent.button !== 0)
    return;

  var element = aEvent.target;

  // Menu of a group in the groups menu
  if (element.hasAttribute(kID.ATTR_GROUPINDEX)) {
    Array.some(element.menupopup.childNodes, function(item) {
      if (item.selected) {
        mTabs.selectAt(item.getAttribute(kID.ATTR_TABPOS));
        closeMenus($(kID.ALLTABS_POPUP));
        return true;
      }
      return false;
    });
  }

  // Menuitem of a tab in the group menu in the groups menu
  else if (element.hasAttribute(kID.ATTR_TABPOS)) {
    mTabs.selectAt(element.getAttribute(kID.ATTR_TABPOS));
  }

  // Menuitem of a tab in the alltabs menu
  // WORKAROUND: An *unselected* tab will be selected by the command of the
  // menuitem with a tab of the active group. But nothing happens for a
  // *selected* tab. It is especially wrong that a selected tab which is
  // scrolled out stays invisible. So ensures to make a selected tab visible.
  // @see chrome://browser/content/tabbrowser.xml::
  // <binding id="tabbrowser-alltabs-popup">::<handler event="command">
  else if (element.parentNode.id === kID.ALLTABS_POPUP &&
           element.tab && element.tab.selected) {
    gBrowser.tabContainer.mTabstrip.ensureElementIsVisible(element.tab);
  }
}

function onPopupShowing(aEvent) {
  aEvent.stopPropagation();
  var popup = aEvent.target;

  // Popup of the tabview-button tooltip
  if (popup.id === kID.TABVIEW_TOOLTIP) {
    popup.setAttribute('label',
      format(kFormat.TABVIEW_TOOLTIP, {
        group: mTabView.groupItems.length,
        tab: mTabs.count,
        pinned: mTabs.pinnedCount
      })
    );
  }

  // Popup of the alltabs menu
  else if (popup.id === kID.ALLTABS_POPUP) {
    if (mTabView.groupItems.length < 2) {
      $(kID.GROUPS_MENU).disabled = true;
    }

    let refItem = $(kID.ALLTABS_POPUP_SEPARATOR).nextSibling;

    // About pinned tabs
    let pinnedCount = mTabs.pinnedCount;
    if (pinnedCount) {
      let pinnedTabsTag = $E('menuitem', {
        id: kID.PINNEDTABS_TAG_MENUITEM,
        class: 'menuitem-iconic',
        label: format(kFormat.PINNEDTABS_STATE, {
          count: pinnedCount
        }),
        disabled: true
      });
      popup.insertBefore(pinnedTabsTag, refItem);

      gBrowser.visibleTabs.forEach(function(tab) {
        if (tab.pinned) {
          createTabMenuItem(tab, popup, refItem);
        }
      });
    }

    // About tabs of the active group
    let visibleCount = mTabs.visibleCount;
    if (visibleCount) {
      let groupTag = $E('menuitem', {
        id: kID.GROUP_TAG_MENUITEM,
        class: 'menuitem-iconic',
        label: format(kFormat.GROUP_STATE, {
          count: visibleCount,
          title: mTabView.activeGroupName || kFormat.UNTITLED_GROUP
        }),
        disabled: true
      });
      popup.insertBefore(groupTag, refItem);

      // WORKAROUND: We can find menuitems with the proper overflowed tabs.
      // @usage in CSS
      // #GROUP_TAG_MENUITEM[ATTR_TABOVERFLOWED]~.alltabs-item:not([tabIsVisible])
      if (gBrowser.tabContainer.hasAttribute('overflow')) {
        groupTag.setAttribute(kID.ATTR_TABOVERFLOWED, true);
      }
    }
  }

  // Popup of the groups menu
  else if (popup.id === kID.GROUPS_MENUPOPUP) {
    if (popup.hasChildNodes())
      return;

    var activeGroupItem = mTabView.activeGroupItem;
    Array.forEach(mTabView.groupItems, function(groupItem) {
      mTabGroups.add(groupItem);

      popup.appendChild(
        makeGroupMenu(groupItem, {
          current: groupItem === activeGroupItem,
          index: mTabGroups.count - 1
        })
      );
    });
  }

  // Popup of a group menu in the groups menu
  else if (popup.parentNode.hasAttribute(kID.ATTR_GROUPINDEX)) {
    if (popup.hasChildNodes())
      return;

    let group = mTabGroups.
      getAt(popup.parentNode.getAttribute(kID.ATTR_GROUPINDEX));

    let topTab = group.topTab;
    group.tabs.forEach(function(tab) {
      popup.appendChild(
        makeTabMenuItem(tab, {
          selected: tab === topTab
        })
      );
    });
  }
}

function onPopupHidden(aEvent) {
  aEvent.stopPropagation();
  var popup = aEvent.target;

  // Popup of the alltabs menu
  if (popup.id === kID.ALLTABS_POPUP) {
    $(kID.GROUPS_MENU).disabled = false;

    let groupsPopup = $(kID.GROUPS_MENUPOPUP);
    while (groupsPopup.hasChildNodes()) {
      groupsPopup.removeChild(groupsPopup.firstChild);
    }

    if ($(kID.PINNEDTABS_TAG_MENUITEM)) {
      popup.removeChild($(kID.PINNEDTABS_TAG_MENUITEM));
    }
    if ($(kID.GROUP_TAG_MENUITEM)) {
      popup.removeChild($(kID.GROUP_TAG_MENUITEM));
    }

    mTabGroups.clear();
  }
}

// @see chrome://browser/content/tabbrowser.xml::_createTabMenuItem
function createTabMenuItem(aTab, aPopup, aRefItem) {
  var menuItem = $E('menuitem', {
    class: 'menuitem-iconic alltabs-item menuitem-with-favicon'
  });

  aPopup._setMenuitemAttributes(menuItem, aTab);

  aTab.mCorrespondingMenuitem = menuItem;
  menuItem.tab = aTab;

  aPopup.insertBefore(menuItem, aRefItem);
}


// Utilities

function $(aId)
  window.document.getElementById(aId);

function $E(aTagName, aAttribute) {
  var element = window.document.createElement(aTagName);

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (name === 'user') {
        [name, value] = value;
      }
      if (value !== null && value !== undefined) {
        element.setAttribute(name, value);
      }
    }
  }

  return element;
}

function hideElement(aElement) {
  aElement.setAttribute('style', 'display:none');
}

/**
 * String formatter
 * @usage format('%str is %num', {str: 'foo', num: 3}); -> 'foo is 3'
 * @note Plural form of numbers is avalable;
 *   '%key{None;A key;%key keys}' ->
 *    key=0:'None', key=1:'A key', key=#(>=2):'# keys'
 * @return {string}
 * @param aFormat {string}
 * @param aAttribute {string}
 */
function format(aFormat, aAttribute) {
  for (let [name, value] in Iterator(aAttribute)) {
    let plural = aFormat.match(RegExp('%' + name + '\\{(.+?)\\}'));
    if (plural) {
      let num = parseInt(value, 10) || 0;
      let index = (num > 1) ? 2 : num;
      let words = plural[1].split(';');
      aFormat = aFormat.replace(plural[0],
        (index < words.length) ? words[index] : words[0]);
    }
    aFormat = aFormat.replace('%' + name, value);
  }
  return U(aFormat);
}


//********** Imports

function setStateForUnreadTab(aMenuitem, aTab)
  window.ucjsUI.Menuitem.setStateForUnreadTab(aMenuitem, aTab);

function U(aStr)
  window.ucjsUtil.toStringForUI(aStr);

function addEvent(aData)
  window.ucjsUtil.setEventListener(aData);

function setCSS(aCSS, aTitle)
  window.ucjsUtil.setChromeStyleSheet(aCSS);

function log(aMsg)
  window.ucjsUtil.logMessage('AllTabs.uc.js', aMsg);


//********** Entry point

AllTabs_init();


})(this);
