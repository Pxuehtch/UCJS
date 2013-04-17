// ==UserScript==
// @name        URLbarTooltip.uc.js
// @description Show suggestion hints on a tooltip of the URL bar.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @usage A tooltip panel will popup with 'ctrl + mousemove' on the URL bar.


(function(window, undefined) {


"use strict";


/**
 * Identifiers
 * @note The names for stylings, |STYLE_XXX|, should be in sync with the keys
 * of |kStyle|.
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

/**
 * UI strings
 * @note |U()| converts embedded chars in the code for displaying properly.
 */
const kString = U({
  title: 'Location bar suggestion hints',
  restrictGroup: 'Restrict',
  shortcutGroup: 'Shortcut'
});


//********** Functions

function getURLbar() $ID('urlbar');
function getPanel() $ID(kID.panel);

function URLbarTooltip_init() {
  $ID('mainPopupSet').
  appendChild($E('panel', {id: kID.panel, backdrag: true}));

  addEvent([getURLbar(), 'mousemove', showPanel, false]);
}

function showPanel(aEvent) {
  if (aEvent.ctrlKey && getPanel().state === 'closed') {
    buildContent();

    // close the default tooltip
    // @see chrome://browser/content/urlbarBindings.xml::
    // _initURLTooltip
    getURLbar()._hideURLTooltip();

    getPanel().openPopupAtScreen(aEvent.screenX, aEvent.screenY, false);
  }
}

function buildContent() {
  var panel = getPanel();

  // Remove existing content
  panel.firstChild && panel.removeChild(panel.firstChild);

  var box = $E('vbox');
  box.appendChild($E('label',
    {value: kString.title, class: kID.STYLE_HEADER}));
  box.appendChild(makeGroup(getRestrictData(), kString.restrictGroup));
  box.appendChild(makeGroup(getShortcutData(), kString.shortcutGroup));
  panel.appendChild(box);

  setStyles();
}

function makeGroup(aData, aGroupName) {
  let groupbox, grid, columns, rows, row;

  groupbox = $E('groupbox');
  groupbox.appendChild($E('caption', {label: aGroupName}));

  grid = groupbox.appendChild($E('grid'));

  columns = grid.appendChild($E('columns'));
  columns.appendChild($E('column'));
  columns.appendChild($E('column'));

  rows = grid.appendChild($E('rows'));
  aData.forEach(function(item) {
    if (item === 'separator') {
      row = $E('separator', {class: kID.STYLE_GROOVE});
    } else {
      row = $E('row');
      row.appendChild($E('label', {value: item.keyword}));
      row.appendChild($E('label', {value: item.name}));
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

  for (let key in prefs) {
    let keyword = getPref(key);
    if (keyword) {
      data.push({keyword: keyword, name: prefs[key]});
    }
  }

  return data;
}

function getShortcutData() {
  let searchEnginesData = [],
      bookmarksData = [];

  // get search engine keywords
  // @see resource:///modules/Services.jsm
  window.Services.search.getEngines().forEach(function(item) {
    if (item.alias) {
      searchEnginesData.push({
        keyword: item.alias,
        name: item.description || item.name
      });
    }
  });

  // get bookmark keywords
  let SQLExp = [
    'SELECT b.title, k.keyword, p.url',
    'FROM moz_bookmarks b',
    'JOIN moz_keywords k ON k.id = b.keyword_id',
    'JOIN moz_places p ON p.id = b.fk'
  ].join(' ');

  let resultRows = scanPlacesDB({
    expression: SQLExp,
    columns: ['title', 'keyword', 'url']
  });

  if (resultRows) {
    resultRows.forEach(function(row) {
      bookmarksData.push({
        keyword: row.keyword,
        name: row.title || getPrePath(row.url)
      });
    });
  }

  return [searchEnginesData, bookmarksData].reduce(
    function(previous, current) {
      if (current.length) {
        current.sort(function(a, b) {
          return a.keyword.localeCompare(b.keyword);
        });
        if (previous.length) {
          current.unshift('separator');
        }
        return previous.concat(current);
      }
      return previous;
    }, []
  );
}

function setStyles() {
  for (let id in kStyle) {
    Array.forEach($Class(kID[id]), function({style}) {
      for (let [name, value] in Iterator(kStyle[id])) {
        style.setProperty(name, value, 'important');
      }
    });
  }
}


//********** Utilities

function $ID(aID) {
  return window.document.getElementById(aID);
}

function $Class(aClassName) {
  return window.document.getElementsByClassName(aClassName);
}

function getPrePath(aURL) {
  let prePath = aURL.replace(/^(\w+:[/]*[^/]+).*$/, '$1');
  if (prePath.length > 40) {
    prePath = prePath.substr(0, 40) + '...';
  }
  return prePath;
}


//********** Imports

function U(aStr) {
  return window.ucjsUtil.toStringForUI(aStr);
}

function $E(aTagOrNode, aAttribute) {
  return window.ucjsUtil.createNode(aTagOrNode, aAttribute);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function getPref(aKey) {
  return window.ucjsUtil.getPref(aKey);
}

function scanPlacesDB(aParam) {
  return window.ucjsUtil.scanPlacesDB(aParam);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('URLbarTooltip.uc.js', aMsg);
}


//********** Entry point

URLbarTooltip_init();


})(this);
