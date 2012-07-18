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
 *   @key disabled {boolean} [optional]
 *   @key name {string} display name for menuitem
 *   @key URL {function}
 *     @param aPage {hash}
 *       @key URL {string} a page URL
 *       @key title {string} a page title
 */
const kSiteInfo = {
  'Translator': [
    {
      name: 'Google 翻訳 EN>JP',
      URL: function(aPage)
        format('http://translate.google.com/translate?hl=ja&sl=en&u=%DATA%', aPage.URL)
    }
  ],

  'Archive': [
    {
      name: 'Internet Archive',
      URL: function(aPage)
        format('http://web.archive.org/*/%DATA%', aPage.URL)
    },
    {
      name: 'Google cache:',
      URL: function(aPage)
        format('https://www.google.co.jp/search?q=cache:%DATA%', removeScheme(aPage.URL))
    },
    {
      name: 'WEB 魚拓',
      URL: function(aPage)
        format('https://www.google.co.jp/search?sitesearch=megalodon.jp&q=%DATA%', removeScheme(aPage.URL))
    }
  ],

  'Bookmark': [
    {
      name: 'はてなブックマーク',
      /*
      URL: function(aPage)
        format('http://b.hatena.ne.jp/entry?mode=more&url=%DATA%', encodeURIComponent(aPage.URL))
      */
      URL: function(aPage) {
        var entryURL = 'http://b.hatena.ne.jp/entry/';
        if (/^https:/.test(aPage.URL)) {
          entryURL += 's/';
        }
        return format(entryURL + '%DATA%', removeScheme(aPage.URL));
      }
    },
    {
      name: 'Livedoor クリップ',
      URL: function(aPage)
        format('http://clip.livedoor.com/page/%DATA%', aPage.URL)
    },
    {
      name: 'digg',
      URL: function(aPage)
        format(
          'http://digg.com/search?section=all&type=all&area=all&sort=most&s=%DATA%',
          encodeURIComponent(aPage.title.replace(/\s+/g, '+'))
        )
    }
  ],

  'Related': [
    {
      name: 'Yahoo! link:',
      URL: function(aPage)
        format('http://search.yahoo.co.jp/search?p=link:%DATA%', aPage.URL)
    },
    {
      name: 'Google タイトル',
      URL: function(aPage)
        format('https://www.google.co.jp/search?q="%DATA%"', aPage.title)
    }
  ]
};

const kString = {
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

  for (let type in kSiteInfo) {
    let menu = $E('menu', {label: type});
    let popup = $E('menupopup');

    kSiteInfo[type].forEach(function(info, i) {
      if (!info.disabled) {
        let URL = getRelatedURLs(type, i);
        popup.appendChild($E('menuitem', {label: info.name, open: URL, tooltiptext: URL.toString()}));
      }
    });

    if (popup.childElementCount > 1) {
      popup.appendChild($E('menuseparator'));
      popup.appendChild($E('menuitem', {label: kString.openAll, open: getRelatedURLs(type)}));
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

function getRelatedURLs(aType, aIndex) {
  var page = {
    title: gBrowser.contentTitle,
    URL: gBrowser.currentURI.spec
  };

  var URLs = [];

  if (typeof aIndex !== 'undefined') {
    URLs[0] = kSiteInfo[aType][aIndex].URL(page);
  } else {
    kSiteInfo[aType].forEach(function(info) {
      if (!info.disabled) {
        URLs.push(info.URL(page));
      }
    });
  }

  return URLs;
}

function format(aFormat, aData) aFormat.replace('%DATA%', aData);

function removeScheme(aURL) aURL.replace(/^https?:\/\//, '');


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
