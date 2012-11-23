// ==UserScript==
// @name        URLbarTooltip.uc.js
// @description Show suggestion hints on tooltip of URL bar.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @usage A tooltip panel will popup with 'ctrl + mousemove' on a URL bar.


(function() {


"use strict";


// Preferences.

/**
 * Identifiers.
 * @note Key for stylings, STYLE_XXX, must be also defined in kStyle.
 */
const kID = {
  panel: 'ucjs_URLbarTooltip_panel',
  STYLE_HEADER: 'ucjs_URLbarTooltip_STYLE_HEADER',
  STYLE_GROOVE: 'ucjs_URLbarTooltip_STYLE_GROOVE'
};

const kStyle = {
  STYLE_HEADER: {
    'font-weight': 'bold',
    'font-size': '110%',
    'text-align': 'center',
    'margin': '0'
  },
  STYLE_GROOVE: {
    'border-top': '1px solid ThreeDShadow',
    'border-bottom': '1px solid ThreeDHighlight',
    'height': '0',
    'margin': '0.2em 3px 0.1em'
  }
};

const kString = {
  title: 'Location bar suggestion hints',
  restrictGroup: 'Restrict',
  shortcutGroup: 'Shortcut'
};


// Functions.

function getURLbar() $ID('urlbar');
function getPanel() $ID(kID.panel);

function URLbarTooltip_init() {
  $ID('mainPopupSet').appendChild($E('panel', {id: kID.panel, backdrag: true}));
  addEvent([getURLbar(), 'mousemove', showPanel, false]);
}

function showPanel(aEvent) {
  if (aEvent.ctrlKey && getPanel().state === 'closed') {
    buildContent();
    getURLbar()._hideURLTooltip();
    getPanel().openPopupAtScreen(aEvent.screenX, aEvent.screenY, false);
  }
}

function buildContent() {
  var panel = getPanel();

  // Remove existing content.
  panel.firstChild && panel.removeChild(panel.firstChild);

  var box = $E('vbox');
  box.appendChild($E('label', {value: kString.title, class: kID.STYLE_HEADER}));
  box.appendChild(makeGroup(getRestrictData(), kString.restrictGroup));
  box.appendChild(makeGroup(getShortcutData(), kString.shortcutGroup));
  panel.appendChild(box);

  setStyles();
}

function makeGroup(aData, aGroupName) {
  var groupbox, grid, columns, rows, row;
  groupbox = $E('groupbox');
  groupbox.appendChild($E('caption', {label: aGroupName}));
  grid = groupbox.appendChild($E('grid'));
  columns = grid.appendChild($E('columns'));
  columns.appendChild($E('column'));
  columns.appendChild($E('column'));
  rows = grid.appendChild($E('rows'));
  aData.forEach(function(a) {
    if (a.separator) {
      row = $E('separator', {class: kID.STYLE_GROOVE});
    } else {
      row = $E('row');
      row.appendChild($E('label', {value: a.keyword}));
      row.appendChild($E('label', {value: a.name}));
    }
    rows.appendChild(row);
  });

  return groupbox;
}

function getRestrictData() {
  var prefs = {
    'browser.urlbar.restrict.history': 'History',
    'browser.urlbar.restrict.bookmark': 'Bookmarks',
    'browser.urlbar.restrict.tag': 'Tagged',
    'browser.urlbar.restrict.openpage': 'In open tabs',
    'browser.urlbar.restrict.typed': 'User typed',
    'browser.urlbar.match.title': 'Page titles',
    'browser.urlbar.match.url': 'Page urls'
  };

  var data = [];

  for (let a in prefs) {
    let keyword = getPref(a);
    if (keyword) {
      data.push({keyword: keyword, name: prefs[a]});
    }
  }

  return data;
}

function getShortcutData() {
  var searchEnginesData = [], bookmarksData = [];

  Services.search.getEngines().forEach(function(a) {
    if (a.alias) {
      searchEnginesData.
      push({keyword: a.alias, name: a.description || a.name});
    }
  });

  var sql =
    'SELECT b.id ' +
    'FROM moz_bookmarks b ' +
    'JOIN moz_keywords k ON k.id = b.keyword_id';

  var statement =
    Cc['@mozilla.org/browser/nav-history-service;1'].
    getService(Ci.nsPIPlacesDatabase).
    DBConnection.
    createStatement(sql);

  // @see resource:///modules/PlacesUtils.jsm
  var bookmarkService = PlacesUtils.bookmarks;
  var id, uri;

  try {
    while (statement.executeStep()) {
      id = statement.row.id;
      uri = bookmarkService.getBookmarkURI(id);
      if (uri) {
        bookmarksData.push({
          keyword: bookmarkService.getKeywordForBookmark(id),
          name: bookmarkService.getItemTitle(id) || uri.prePath
        });
      }
    }
  } finally {
    statement.reset();
    statement.finalize();
  }

  [searchEnginesData, bookmarksData].forEach(function(a) {
    a.sort(function(x, y) x.keyword.localeCompare(y.keyword));
  });

  return searchEnginesData.concat({separator: true}, bookmarksData);
}

function setStyles() {
  for (let id in kStyle) {
    Array.forEach(document.getElementsByClassName(kID[id]), function(a) {
      var style = a.style;
      for (let [name, value] in Iterator(kStyle[id])) {
        style.setProperty(name, value, 'important');
      }
    });
  }
}


// Utilities.

function $ID(aId)
  document.getElementById(aId);


// Imports.

function $E(aTagOrNode, aAttribute)
  ucjsUtil.createNode(aTagOrNode, aAttribute);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function getPref(aKey)
  ucjsUtil.getPref(aKey);

function log(aMsg)
  ucjsUtil.logMessage('URLbarTooltip.uc.js', aMsg);


// Entry point.

URLbarTooltip_init();


})();
