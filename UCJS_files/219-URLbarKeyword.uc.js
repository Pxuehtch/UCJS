// ==UserScript==
// @name URLbarKeyword.uc.js
// @description Inserts keywords to the input in the URL bar
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @require [optional] Overlay.uc.xul

// @usage A menu is appended in the URL-bar context menu.


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  DOMUtils: {
    $E,
    $ID
  },
  PlacesUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

const {
  URLBar: {
    contextMenu: URLBarContextMenu
  }
} = window.ucjsUI;

/**
 * UI settings.
 */
const kUI = {
  menu: {
    id: 'ucjs_URLbarKeyword_menu',
    label: 'URLbar keywords',
    accesskey: 'k'
  },

  startSeparator: {
    id: 'ucjs_URLbarKeyword_startSeparator'
  },
  endSeparator: {
    id: 'ucjs_URLbarKeyword_endSeparator'
  },

  restrict: {
    noItems: 'No restrict keywords'
  },
  bookmark: {
    noItems: 'No bookmark keywords'
  },
  searchEngine: {
    noItems: 'No search-engine keywords'
  },

  item: {
    label: '%keyword% : %name%'
  },

  openSearchEngineManager: {
    label: 'Open Search-engine manager',
    accesskey: 's'
  }
};

/**
 * Key name for storing data.
 */
const kDataKey = {
  // Extended property name of a menuitem.
  keyword: 'ucjs_URLbarKeyword_keyword'
};

function URLbarKeyword_init() {
  URLBarContextMenu.register({
    events: [
      ['popupshowing', handleEvent],
      ['popuphiding', handleEvent],
      ['command', handleEvent]
    ],

    onCreate: createMenu
  });
}

function handleEvent(event) {
  switch (event.type) {
    case 'popupshowing': {
      let menu = event.target.parentElement;

      if (menu.id === kUI.menu.id && !menu.itemCount) {
        buildMenuItems(menu.menupopup);
      }

      break;
    }

    case 'popuphiding': {
      let contextMenu = event.currentTarget;

      if (event.target === contextMenu) {
        let menu = $ID(kUI.menu.id);

        while (menu.itemCount) {
          menu.removeItemAt(0);
        }
      }

      break;
    }

    case 'command': {
      let item = event.target;

      let keyword = item[kDataKey.keyword];

      if (keyword) {
        gURLBar.textValue = keyword + ' ' + gURLBar.textValue.trim();

        // Open the auto-complete popup.
        // TODO: Use reliable API.
        // WORKAROUND: Updating selection, virtually nothing to change,
        // triggers the popup open.
        gURLBar.editor.deleteSelection(0, 0);
      }

      break;
    }
  }
}

function createMenu(contextMenu) {
  // TODO: Make the insertion position of the menu fixed for useful access.
  // WORKAROUND: Inserts to the top of the context menu at this time.
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

  addMenu(kUI.menu);

  addSeparator(kUI.endSeparator);
}

function buildMenuItems(popupMenu) {
  let makeMenuSeparator = () => {
    return popupMenu.appendChild($E('menuseparator'));
  };

  buildList({
    listGetter: getRestrictKeywordList,
    listUI: kUI.restrict,
    referenceNode: makeMenuSeparator()
  });

  buildList({
    listGetter: getBookmarkKeywordList,
    listUI: kUI.bookmark,
    referenceNode: makeMenuSeparator()
  });

  buildList({
    listGetter: getSearchEngineKeywordList,
    listUI: kUI.searchEngine,
    referenceNode: makeMenuSeparator()
  });

  popupMenu.appendChild($E('menuitem', {
    label: kUI.openSearchEngineManager.label,
    accesskey: kUI.openSearchEngineManager.accesskey,
    // @require [optional] Overlay.uc.xul
    // @note You can set <oncommand> with a code string to open the manager
    // dialog instead of <command>.
    command: 'ucjs_cmd_openSearchEngineManager'
  }));
}

function buildList(params) {
  let {
    listGetter,
    listUI,
    referenceNode
  } = params;

  let append = (menuItems) => {
    // Append menuitems to the menu popup.
    referenceNode.parentNode.insertBefore(menuItems, referenceNode);
  };

  listGetter().then((list) => {
    // Do nothing if the context menu has been closed.
    if (!URLBarContextMenu.isOpen()) {
      return;
    }

    if (!list.length) {
      append($E('menuitem', {
        label: listUI.noItems,
        disabled: true
      }));

      return;
    }
  
    let fragment = window.document.createDocumentFragment();

    let $label = (name, keyword) =>
      kUI.item.label.
      replace('%name%', name).
      replace('%keyword%', keyword);

    list.forEach(({name, keyword, url}) => {
      let menuItem = fragment.appendChild($E('menuitem', {
        label: $label(name, keyword),
        tooltiptext: url
      }));

      menuItem[kDataKey.keyword] = keyword;

      fragment.appendChild(menuItem);
    });

    append(fragment);
  }).
  catch(Cu.reportError);
}

function getRestrictKeywordList() {
  // @note Displayed in the declared order.
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

  let list = [];

  for (let key in kRestrictKeys) {
    let keyword = Modules.Prefs.get(key);

    if (keyword) {
      list.push({
        name: kRestrictKeys[key],
        keyword
      });
    }
  }

  return Promise.resolve(list);
}

function getBookmarkKeywordList() {
  let sql = [
    'SELECT k.keyword, b.title, p.url',
    'FROM moz_keywords k',
    'JOIN moz_bookmarks b ON b.fk = k.place_id',
    'JOIN moz_places p ON p.id = k.place_id'
  ].join(' ');

  return PlacesUtils.promisePlacesDBResult({
    sql,
    columns: ['keyword', 'title', 'url']
  }).
  then((rows) => {
    if (!rows) {
      return [];
    }

    let list = [];
    let keywords = new Set();

    rows.forEach(({keyword, title, url}) => {
      // WORKAROUND: Skip an item without bookmark title. It may be a deleted
      // bookmark being cached.
      if (!title) {
        return;
      }

      // Collect one item for one keyword.
      if (keywords.has(keyword)) {
        return;
      }

      keywords.add(keyword);

      list.push({
        name: title,
        url,
        keyword
      });
    });

    if (list.length) {
      list.sort((a, b) => a.keyword.localeCompare(b.keyword));
    }

    return list;
  });
}

function getSearchEngineKeywordList() {
  let list = [];

  Services.search.getEngines().forEach((item) => {
    if (item.alias) {
      list.push({
        name: item.description || item.name,
        keyword: item.alias
      });
    }
  });

  if (list.length) {
    list.sort((a, b) => a.keyword.localeCompare(b.keyword));
  }

  return Promise.resolve(list);
}

/**
 * Entry point.
 */
URLbarKeyword_init();


})(this);
