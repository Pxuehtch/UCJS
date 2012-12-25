// ==UserScript==
// @name PageRelated.uc.js
// @description Makes related links about current page.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the URLbar context menu.


(function() {


"use strict";


//********** Preferences

/**
 * Preset
 *
 * @key {string} category name for menu
 * @value {hash[]}
 *   @key disabled {boolean} [option]
 *   @key name {string} display name for menuitem
 *   @key URL {string} a URL that opens
 *     pass the page information by alias. see |AliasFixup|
 *   @key URL {function} for the custom formattings
 *     @param aPage {hash}
 *       @key URL {string} a page URL
 *       @key title {string} a page title
 */
const kSiteInfo = {
  'Translator': [
    {
      name: 'Google 翻訳 > JP',
      URL: 'http://translate.google.com/translate?sl=auto&tl=ja&u=%u%'
    }
  ],

  'Archive': [
    {
      name: 'Google cache:',
      URL: 'https://www.google.co.jp/search?q=cache:%u|sl%'
    },
    {
      name: 'Internet Archive',
      URL: 'http://web.archive.org/*/%u%'
    },
    {
      name: 'WEB 魚拓',
      URL: 'https://www.google.co.jp/search?sitesearch=megalodon.jp&q=%u|sl%'
    }
  ],

  'Bookmark': [
    {
      name: 'はてなブックマーク',
      URL: function(aPageInfo) {
        var entryURL = 'http://b.hatena.ne.jp/entry/';
        if (/^https:/.test(aPageInfo.URL)) {
          entryURL += 's/';
        }
        return entryURL + '%u|sl%';
      }
    },
    {
      name: 'reddit',
      URL: 'http://www.reddit.com/submit?url=%u|en%'
    }
  ],

  'Related': [
    {
      name: 'Google link:',
      URL: 'https://www.google.co.jp/search?q=link:%u|sl%'
    },
    {
      name: 'Google with Page Title',
      URL: 'https://www.google.co.jp/search?q="%t%"'
    },
    {
      name: 'Yahoo! link:',
      URL: 'http://search.yahoo.co.jp/search?p=link:%u%'
    },
    {
      name: 'Yahoo! with Page Title',
      URL: 'http://search.yahoo.co.jp/search?p="%t|en%"'
    }
  ]
};

/**
 * Handler of fixing up a alias with the page information
 * @return {hash}
 *   @member create {function} creates a text that fixed up
 *
 * [Aliases]
 * %URL%, %u% : a page URL
 * %TITLE%, %t% : a page title
 *
 * The modifiers can be combined by '|'
 * SCHEMELESS, sl : without the URL scheme
 * PARAMLESS, pl : without the URL parameter
 * ENCODE, en : with URI encoded
 *
 * e.g.
 * %URL|ENCODE%, %u|en% : a page URL with URI encoded
 * %URL|SCHEMELESS|ENCODE%, %u|sl|en% : a page URL that is trimmed the scheme
 * and then URI encoded (the multiple modifiers is applied in the order of
 * settings)
 */
var AliasFixup = (function() {
  const kAliasSplitter = '|';
  const kAliasPattern = RegExp('%([a-z_' + kAliasSplitter + ']+)%', 'ig');

  function create(aText, aPageInfo) {
    return aText.replace(kAliasPattern, function(match, alias) {
      let keys = alias.split(kAliasSplitter);
      let rv = fixupTarget(keys.shift(), aPageInfo);
      keys.forEach(function(modifier) {
        rv = fixupModifier(rv, modifier);
      });
      return rv;
    });
  }

  function fixupTarget(aTarget, aPageInfo) {
    switch (aTarget) {
      case 'URL':
      case 'u':
        return aPageInfo.URL;
      case 'TITLE':
      case 't':
        return aPageInfo.title;
    }
    return '';
  }

  function fixupModifier(aText, aModifier) {
    switch (aModifier) {
      case 'SCHEMELESS':
      case 'sl':
        return aText.replace(/^https?:\/\//, '');
      case 'PARAMLESS':
      case 'pl':
        return aText.replace(/[?#].*$/, '');
      case 'ENCODE':
      case 'en':
        return encodeURIComponent(aText);
    }
    return '';
  }

  return {
    create: create
  };
})();

const kString = {
  warnParameter: '注意：パラメータ付 URL',
  openAll: 'すべて開く'
};

const kID = {
  startSeparator: 'ucjs_relatedInfo_startSep',
  endSeparator: 'ucjs_relatedInfo_endSep'
};


//********** Functions

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

  // Remove existing items
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

      let URL =
      AliasFixup.create(
        (typeof data.URL === 'function') ? data.URL(pageInfo) : data.URL,
        pageInfo
      );

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
  // @note ucjsUI_manageContextMenuSeparators() manages the visibility of
  // separators.
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


//********** Imports

function getCommandOpenURLs(aURLsArray) {
  var URLs = aURLsArray.toSource();
  var inBG = (aURLsArray.length > 1) ? 'true' : 'event.button===1';

  var command = 'ucjsUtil.openTabs(' +
    '%URLs%,{inBackground:%inBG%,relatedToCurrent:true});';

  return command.replace('%URLs%', URLs).replace('%inBG%', inBG);
}

function getURLBarContextMenu()
  ucjsUI.URLBar.contextMenu;

function U(aStr)
  ucjsUtil.convertForSystem(aStr);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function log(aMsg)
  ucjsUtil.logMessage('PageRelated.uc.js', aMsg);


//********** Entry point

PageRelated_init();


})();
