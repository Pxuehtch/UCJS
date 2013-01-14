// ==UserScript==
// @name PageRelated.uc.js
// @description Makes related links about current page.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the URLbar context menu.


(function(window, undefined) {


"use strict";


/**
 * Identifiers
 */
const kID = {
  startSeparator: 'ucjs_relatedInfo_startSep',
  endSeparator: 'ucjs_relatedInfo_endSep'
};

/**
 * UI strings
 * @note |U()| converts embedded chars in the code for displaying properly.
 */
const kString = U({
  warnParameter: '注意：パラメータ付 URL',
  openAll: 'すべて開く'
});

/**
 * Preset list
 * @key {string} category name for menu
 * @value {hash[]}
 *   @key name {string} a display name for menuitem
 *   @key URL {string} a URL that opens
 *     pass the page information by alias. see |AliasFixup|
 *   @key URL {function} for the custom formattings
 *     @param aPageInfo {hash}
 *       @key URL {string} a page URL
 *       @key title {string} a page title
 *   @key disabled {boolean} [optional]
 */
const kPreset = {
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
 *   @member create {function}
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


//********** Functions

function initMenu() {
  var contextMenu = getURLBarContextMenu();

  setSeparators(contextMenu);

  addEvent([contextMenu, 'popupshowing', showContextMenu, false]);
}

function showContextMenu(aEvent) {
  var contextMenu = aEvent.target;
  if (contextMenu !== getURLBarContextMenu()) {
    return;
  }

  var [sSep, eSep] = getSeparators();

  // remove existing items
  for (let item; (item = sSep.nextSibling) !== eSep; /**/) {
    contextMenu.removeChild(item);
  }

  // allow only HTTP page
  if (!/^https?$/.test(gBrowser.currentURI.scheme)) {
    return;
  }

  getAvailableItems().forEach(function(item) {
    contextMenu.insertBefore(item, eSep);
  });
}

function getAvailableItems() {
  var items = [];

  var pageInfo = {
    title: gBrowser.contentTitle,
    URL: gBrowser.currentURI.spec
  };

  // warning of a URL with a parameter
  if (/[?#].*$/.test(pageInfo.URL)) {
    items.push($E('menuitem', {
      label: kString.warnParameter,
      style: 'font-weight:bold;',
      tooltiptext: pageInfo.URL.replace(/[?#]/, '\n$&'),
      disabled: true
    }));
  }

  for (let category in kPreset) {
    // @note |U()| for UI display.
    let menu = $E('menu', {label: U(category)});
    let popup = $E('menupopup');

    let URLs = [];

    kPreset[category].forEach(function(data) {
      if (data.disabled) {
        return;
      }

      let URL = AliasFixup.create(
        (typeof data.URL === 'function') ? data.URL(pageInfo) : data.URL,
        pageInfo
      );

      popup.appendChild($E('menuitem', {
        // @note |U()| for UI display.
        label: U(data.name),
        open: [URL],
        tooltiptext: URL
      }));

      URLs.push(URL);
    });

    if (URLs.length > 1) {
      popup.appendChild($E('menuseparator'));
      popup.appendChild($E('menuitem', {
        label: kString.openAll,
        open: URLs
      }));
    }

    menu.appendChild(popup);
    items.push(menu);
  }

  return items;
}

// @note ucjsUI_manageContextMenuSeparators() manages the visibility of
// separators.
function setSeparators(aContextMenu, aReferenceNode) {
  if (aReferenceNode === undefined) {
    aReferenceNode = null;
  }

  [kID.startSeparator, kID.endSeparator].
  forEach(function(id) {
    aContextMenu.insertBefore(
      $E('menuseparator', {id: id}), aReferenceNode);
  });
}

function getSeparators() {
  return [$ID(kID.startSeparator), $ID(kID.endSeparator)];
}

function $ID(aID) {
  return window.document.getElementById(aID);
}

function $E(aTag, aAttribute) {
  var node = window.document.createElement(aTag);

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value !== null && value !== undefined) {
        if (name === 'open') {
          node.setAttribute(
            'onclick',
            'if(event.button===2)return;' +
            'if(event.button===1)closeMenus(event.target);' +
            commandForOpenURLs(value)
          );
        } else {
          node.setAttribute(name, value);
        }
      }
    }
  }

  return node;
}


//********** Imports

function commandForOpenURLs(aURLsArray) {
  var URLs = JSON.stringify(aURLsArray);
  var inBG = (aURLsArray.length > 1) ? 'true' : 'event.button===1';

  var command = 'ucjsUtil.openTabs(' +
    '%URLs%,{inBackground:%inBG%,relatedToCurrent:true});';

  return command.replace('%URLs%', URLs).replace('%inBG%', inBG);
}

function getURLBarContextMenu() {
  return window.ucjsUI.URLBar.contextMenu;
}

function U(aStr) {
  return window.ucjsUtil.toStringForUI(aStr);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('PageRelated.uc.js', aMsg);
}


//********** Entry point

function PageRelated_init() {
  initMenu()
}

PageRelated_init();


})(this);
