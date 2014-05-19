// ==UserScript==
// @name        URLbarKeyword.uc.js
// @description Inserts keywords to the input in the URL bar
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js, Overlay.uc.xul
// @usage creates a menu in the URL bar context menu

// @see https://addons.mozilla.org/en-US/firefox/addon/location-bar-characters/


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  Prefs: {
    get: getPref
  },
  createNode: $E,
  getNodeById: $ID,
  promisePlacesDBResult
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('URLbarKeyword.uc.js', aMsg);
}

const {
  URLBar: {
    contextMenu: URLBarContextMenu
  }
} = window.ucjsUI;

/**
 * UI constants
 */
const kUI = {
  menu: {
    id: 'ucjs_URLbarKeyword_menu',
    label: 'URLbar keywords',
    accesskey: 'k'
  },
  separator: {
    start: 'ucjs_URLbarKeyword_startSep',
    end: 'ucjs_URLbarKeyword_endSep'
  },
  item: {
    label: '%keyword% : %name%'
  },
  emptyGroup: {
    restrict: 'No restrict keywords',
    bookmark: 'No bookmark keywords',
    searchEngine: 'No search-engine keywords'
  },
  openSearchEngineManager: {
    label: 'Open Search-engine Manager',
    accesskey: 's',
  }
};

function URLbarKeyword_init() {
  URLBarContextMenu.register({
    events: [
      ['popupshowing', handleEvent, false],
      ['popuphiding', handleEvent, false],
      ['command', handleEvent, false]
    ],
    onCreate: createMenu
  });
}

function handleEvent(aEvent) {
  aEvent.stopPropagation();

  switch (aEvent.type) {
    case 'popupshowing': {
      let menu = aEvent.target.parentElement;

      if (menu.id === kUI.menu.id && !menu.itemCount) {
        buildMenuItems(menu.menupopup);
      }

      break;
    }

    case 'popuphiding': {
      let menupopup = aEvent.target;
      let contextMenu = aEvent.currentTarget;

      if (menupopup === contextMenu) {
        let menu = $ID(kUI.menu.id);

        while (menu.itemCount) {
          menu.removeItemAt(0);
        }
      }

      break;
    }

    case 'command': {
      let item = aEvent.target;

      if (item.value) {
        gURLBar.value = item.value + ' ' + gURLBar.value.trim();

        // trigger the auto-complete popup
        gURLBar.editor.deleteSelection(0, 0);
      }

      break;
    }
  }
}

function createMenu(aContextMenu) {
  let refItem = aContextMenu.firstChild;

  let menu = $E('menu', {
    id: kUI.menu.id,
    label: kUI.menu.label,
    accesskey: kUI.menu.accesskey
  });

  menu.appendChild($E('menupopup'));

  addSeparator(refItem, kUI.separator.start)
  insertElement(refItem, menu);
  addSeparator(refItem, kUI.separator.end)
}

function buildMenuItems(aPopup) {
  if (!buildGroup(aPopup, getRestrictKeywordData())) {
    makeDisabledMenuItem(aPopup, kUI.emptyGroup.restrict);
  }

  addSeparator(aPopup);

  // bookmark keywords will be async-appended before this separator
  let bkSeparator = addSeparator(aPopup);

  asyncBuildGroup(bkSeparator, getBookmarkKeywordData(), (aBuilt) => {
    if (!aBuilt) {
      makeDisabledMenuItem(bkSeparator, kUI.emptyGroup.bookmark);
    }
  });

  if (!buildGroup(aPopup, getSearchEngineKeywordData())) {
    makeDisabledMenuItem(aPopup, kUI.emptyGroup.searchEngine);
  }

  insertElement(aPopup, $E('menuitem', {
    label: kUI.openSearchEngineManager.label,
    accesskey: kUI.openSearchEngineManager.accesskey,
    // @require Overlay.uc.xul
    command: 'ucjs_cmd_OpenSearchEngineManager'
  }));
}

function buildGroup(aRefItem, aData) {
  if (!aData || !aData.length) {
    return false;
  }

  let label = kUI.item.label;

  aData.forEach(({name, keyword}) => {
    insertElement(aRefItem, $E('menuitem', {
      label: label.replace('%name%', name).replace('%keyword%', keyword),
      value: keyword
    }));
  });

  return true;
}

function asyncBuildGroup(aRefItem, aPromise, aCallback) {
  aPromise.then(
    function onFulFill(aData) {
      aCallback(buildGroup(aRefItem, aData));
    }
  ).then(null, Cu.reportError);
}

function addSeparator(aRefItem, aId) {
  return insertElement(aRefItem, $E('menuseparator', {
    id: aId
  }));
}

function makeDisabledMenuItem(aRefItem, aLabel) {
  return insertElement(aRefItem, $E('menuitem', {
    label: aLabel,
    disabled: true
  }));
}

function insertElement(aRefItem, aElement) {
  let popup, refItem;

  if (aRefItem.localName === 'menupopup') {
    popup = aRefItem;
    refItem = null;
  } else {
    popup = aRefItem.parentNode;
    refItem = aRefItem;
  }

  return popup.insertBefore(aElement, refItem);
}

function getRestrictKeywordData() {
  // @note displayed in the declared order
  // @see http://kb.mozillazine.org/Location_Bar_search
  const kRestrictKeys = {
    'browser.urlbar.restrict.history': 'History',
    'browser.urlbar.restrict.bookmark': 'Bookmarks',
    'browser.urlbar.restrict.tag': 'Tagged',
    'browser.urlbar.restrict.openpage': 'In open tabs',
    'browser.urlbar.restrict.typed': 'User typed',
    'browser.urlbar.match.title': 'Page titles',
    'browser.urlbar.match.url': 'Page urls'
  };

  let data = [];

  for (let key in kRestrictKeys) {
    let keyword = getPref(key);

    if (keyword) {
      data.push({
        name: kRestrictKeys[key],
        keyword: keyword
      });
    }
  }

  return data;
}

function getSearchEngineKeywordData() {
  let data = [];

  Services.search.getEngines().forEach((aItem) => {
    if (aItem.alias) {
      data.push({
        name: aItem.description || aItem.name,
        keyword: aItem.alias
      });
    }
  });

  return data.sort((a, b) => a.keyword.localeCompare(b.keyword));
}

function getBookmarkKeywordData() {
  let SQLExp = [
    'SELECT b.title, k.keyword, p.url',
    'FROM moz_bookmarks b',
    'JOIN moz_keywords k ON k.id = b.keyword_id',
    'JOIN moz_places p ON p.id = b.fk'
  ].join(' ');

  return promisePlacesDBResult({
    expression: SQLExp,
    columns: ['title', 'keyword', 'url']
  }).
  then((aRows) => {
    if (!aRows || !aRows.length) {
      return [];
    }

    let data = [];

    aRows.forEach((aItem) => {
      data.push({
        name: aItem.title || getPrePath(aItem.url),
        keyword: aItem.keyword
      });
    });

    return data.sort((a, b) => a.keyword.localeCompare(b.keyword));
  });
}

function getPrePath(aURL) {
  const kMaxLen = 40;

  let prePath = aURL.replace(/^(\w+:[/]*[^/]+).*$/, '$1');

  if (prePath.length > kMaxLen) {
    prePath = prePath.substr(0, kMaxLen) + '...';
  }

  return prePath;
}

/**
 * Entry point
 */
URLbarKeyword_init();


})(this);
