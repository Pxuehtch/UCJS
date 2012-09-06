// ==UserScript==
// @name PageRelated.uc.js
// @description Makes related links about current page.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the URLbar context menu.


(function() {


"use strict";


// Preferences.

/**
 * Preset
 *
 * @key {string} category name for menu
 * @value {hash[]}
 *   @key disabled {boolean} [option]
 *   @key name {string} display name for menuitem
 *   @key URL {function}
 *     @param aPage {hash}
 *       @key URL {string} a page URL
 *         alias %...% is available (e.g. %ESC% or %NoScheme|ESC%) @see kURLAlias
 *       @key title {string} a page title
 */
const kSiteInfo = {
  'Translator': [
    {
      name: 'Google 翻訳 EN>JP',
      URL: function(aPage)
        formatURL('http://translate.google.com/translate?hl=ja&sl=en&u=%RAW%', aPage.URL)
    }
  ],

  'Archive': [
    {
      name: 'Internet Archive',
      URL: function(aPage)
        formatURL('http://web.archive.org/*/%RAW%', aPage.URL)
    },
    {
      name: 'Google cache:',
      URL: function(aPage)
        formatURL('https://www.google.co.jp/search?q=cache:%NoScheme%', aPage.URL)
    },
    {
      name: 'WEB 魚拓',
      URL: function(aPage)
        formatURL('https://www.google.co.jp/search?sitesearch=megalodon.jp&q=%NoScheme%', aPage.URL)
    }
  ],

  'Bookmark': [
    {
      name: 'はてなブックマーク',
      URL: function(aPage) {
        var entryURL = 'http://b.hatena.ne.jp/entry/';
        if (/^https:/.test(aPage.URL)) {
          entryURL += 's/';
        }
        return formatURL(entryURL + '%NoScheme%', aPage.URL);
      }
    },
    {
      name: 'reddit',
      URL: function(aPage)
        formatURL('http://www.reddit.com/submit?url=%ESC%', aPage.URL)
    }
  ],

  'Related': [
    {
      name: 'Yahoo! link:',
      URL: function(aPage)
        formatURL('http://search.yahoo.co.jp/search?p=link:%RAW%', aPage.URL)
    },
    {
      name: 'Google タイトル',
      URL: function(aPage)
        formatURL('https://www.google.co.jp/search?q="%RAW%"', aPage.title)
    }
  ]
};

/**
 * Alias for URL of kServices
 * @note applied in this order.
 */
const kURLAlias = {
  'NoScheme': function(aValue) aValue.replace(/^https?:\/\//, ''),
  'ESC': function(aValue) encodeURIComponent(aValue),
  'RAW': function(aValue) aValue
};

const kString = {
  warnParameter: '注意：パラメータ付 URL',
  openAll: 'すべて開く'
};

const kID = {
  startSeparator: 'ucjs_relatedInfo_startSep',
  endSeparator: 'ucjs_relatedInfo_endSep'
};


// Functions.

function PageRelated_init() {
  initMenu()
}

function initMenu() {
  var contextMenu = getURLBarContextMenu();

  setSeparators(contextMenu);

  addEvent([contextMenu, 'popupshowing', showMenu, false]);
}

function showMenu(aEvent) {
  var contextMenu = aEvent.target;
  if (contextMenu !== getURLBarContextMenu())
    return;

  var [sSep, eSep] = getSeparators();

  // Remove existing items.
  for (let item; (item = sSep.nextSibling) !== eSep; /**/) {
    contextMenu.removeChild(item);
  }

  if (!/^https?$/.test(gBrowser.currentURI.scheme))
    return;

  var page = {
    title: gBrowser.contentTitle,
    URL: gBrowser.currentURI.spec
  };

  if (/[?#].*$/.test(page.URL)) {
    contextMenu.insertBefore($E('menuitem', {
      label: kString.warnParameter,
      style: 'font-weight:bold;',
      tooltiptext: page.URL.replace(/[?#]/, '\n$&'),
      disabled: true
    }), eSep);
  }

  for (let type in kSiteInfo) {
    let menu = $E('menu', {label: type});
    let popup = $E('menupopup');

    let URLs = [];

    kSiteInfo[type].forEach(function(info) {
      if (info.disabled)
        return;

      var URL = info.URL(page);
      URLs.push(URL);

      popup.appendChild($E('menuitem', {label: info.name, open: [URL], tooltiptext: URL}));
    });

    if (URLs.length > 1) {
      popup.appendChild($E('menuseparator'));
      popup.appendChild($E('menuitem', {label: kString.openAll, open: URLs}));
    }

    menu.appendChild(popup);
    contextMenu.insertBefore(menu, eSep);
  }
}

function setSeparators(aContextMenu) {
  // @note ucjsUI_manageContextMenuSeparators() manages the visibility of separators.
  aContextMenu.appendChild($E('menuseparator', {id: kID.startSeparator}));
  aContextMenu.appendChild($E('menuseparator', {id: kID.endSeparator}));
}

function getSeparators() {
  function $ID(id) document.getElementById(id);

  return [$ID(kID.startSeparator), $ID(kID.endSeparator)];
}

function $E(aTag, aAttribute) {
  var element = document.createElement(aTag);

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value !== null && typeof value !== 'undefined') {
        if (name === 'label') {
          element.setAttribute('label', U(value));
        } else if (name === 'open') {
          element.setAttribute(
            'onclick',
            'if(event.button===2)return;' +
            'if(event.button===1)closeMenus(event.target);' +
            getCommandOpenURLs(value)
          );
        } else {
          element.setAttribute(name, value);
        }
      }
    }
  }

  return element;
}

function formatURL(aURL, aData) {
  return aURL.replace(/%([\w|]+)%/, function($0, $1) {
    var data = aData;
    var aliases = $1.split('|');
    for (let alias in kURLAlias) {
      if (aliases.indexOf(alias) > -1) {
        data = kURLAlias[alias](data);
      }
    }
    return data;
  });
}


// Imports.

function getCommandOpenURLs(aURLsArray)
  'ucjsUtil.openTabs(%URLs%,{inBackground:%background%,relatedToCurrent:true});'.
  replace('%URLs%', aURLsArray.toSource()).
  replace('%background%', (aURLsArray.length > 1) ? 'true' : 'event.button===1');

function getURLBarContextMenu()
  ucjsUI.URLBar.contextMenu;

function U(aStr)
  ucjsUtil.convertForSystem(aStr);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function log(aMsg)
  ucjsUtil.logMessage('PageRelated.uc.js', aMsg);


// Entry point.

PageRelated_init();


})();
