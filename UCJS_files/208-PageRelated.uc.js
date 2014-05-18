// ==UserScript==
// @name PageRelated.uc.js
// @description Makes related links about current page
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage creates items in the URLbar context menu


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getNodeById: $ID,
} = window.ucjsUtil;

function $E(aTag, aAttribute) {
  return window.ucjsUtil.createNode(aTag, aAttribute, handleAttribute);
}

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('PageRelated.uc.js', aMsg);
}

const {
  URLBar: {
    contextMenu: URLBarContextMenu
  }
} = window.ucjsUI;

/**
 * Identifiers
 */
const kID = {
  startSeparator: 'ucjs_relatedInfo_startSep',
  endSeparator: 'ucjs_relatedInfo_endSep'
};

/**
 * UI strings
 */
const kString = {
  warnParameter: '注意：パラメータ付 URL',
  openAll: 'すべて開く'
};

/**
 * Preset list
 *
 * {hash[]}
 * @key category {string} a display name for menu
 * @key items {hash[]}
 *   @key disabled {boolean} [optional]
 *   @key name {string} a display name for menuitem
 *   @key URL
 *     {string} a URL string
 *       pass the page information by alias
 *       @see |AliasFixup|
 *     {function} for the custom formattings
 *       @param aPageInfo {hash}
 *         @key URL {string} a page URL
 *         @key title {string} a page title
 *       @return {string} a URL string
 *     @note a URL string can have aliases for the page information
 *     @see |AliasFixup|
 *
 * @note displayed in the declared order
 */
const kPreset = [
  {
    category: 'Translator',
    items: [
      {
        name: 'Google 翻訳 > JP',
        URL: 'http://translate.google.com/translate?sl=auto&tl=ja&u=%u%'
      }
    ]
  },
  {
    category: 'Archive',
    items: [
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
    ]
  },
  {
    category: 'Bookmark',
    items: [
      {
        name: 'はてなブックマーク',
        URL: function(aPageInfo) {
          let entryURL = 'http://b.hatena.ne.jp/entry/';

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
    ]
  },
  {
    category: 'Related',
    items: [
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
  }
];

/**
 * Handler of fixing up an alias with the page information
 *
 * @return {hash}
 *   @member create {function}
 *
 * [aliases]
 * %URL%, %u% : a page URL
 * %TITLE%, %t% : a page title
 *
 * The modifiers can be combined by '|';
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
const AliasFixup = (function() {
  const kAliasSplitter = '|';
  const kAliasPattern = RegExp('%([a-z_' + kAliasSplitter + ']+)%', 'ig');

  function create(aText, aPageInfo) {
    return aText.replace(kAliasPattern, (match, alias) => {
      let keys = alias.split(kAliasSplitter);
      let data = fixupTarget(keys.shift(), aPageInfo);

      keys.forEach((modifier) => {
        data = fixupModifier(data, modifier);
      });

      return data;
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

function PageRelated_init() {
  URLBarContextMenu.register({
    events: [
      ['popupshowing', onPopupShowing, false]
    ],
    onCreate: createMenu
  });
}

function createMenu(aContextMenu) {
  setSeparators(aContextMenu);
}

function onPopupShowing(aEvent) {
  aEvent.stopPropagation();

  let menupopup = aEvent.target;
  let contextMenu = aEvent.currentTarget;

  if (menupopup !== contextMenu) {
    return;
  }

  let [sSep, eSep] = getSeparators();

  // remove existing menus
  for (let menu; (menu = sSep.nextSibling) !== eSep; /**/) {
    contextMenu.removeChild(menu);
  }

  // allow only HTTP page
  if (!/^https?$/.test(gBrowser.currentURI.scheme)) {
    return;
  }

  getAvailableMenus().forEach((menu) => {
    contextMenu.insertBefore(menu, eSep);
  });
}

function getAvailableMenus() {
  let menus = [];

  let pageInfo = {
    title: gBrowser.contentTitle || gBrowser.selectedTab.label,
    URL: gBrowser.currentURI.spec
  };

  // warning of a URL with a parameter
  if (/[?#].*$/.test(pageInfo.URL)) {
    menus.push($E('menuitem', {
      label: kString.warnParameter,
      style: 'font-weight:bold;',
      tooltiptext: pageInfo.URL.replace(/[?#]/, '\n$&'),
      disabled: true
    }));
  }

  kPreset.forEach(({category, items}) => {
    let menu = $E('menu', {
      label: category
    });
    let popup = $E('menupopup');

    let URLs = [];

    items.forEach(function(data) {
      if (data.disabled) {
        return;
      }

      let URL =
        (typeof data.URL === 'function') ?
        data.URL(pageInfo) :
        data.URL;

      URL = AliasFixup.create(URL, pageInfo);

      popup.appendChild($E('menuitem', {
        label: data.name,
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
    menus.push(menu);
  });

  return menus;
}

function setSeparators(aContextMenu, aReferenceNode) {
  if (aReferenceNode === undefined) {
    aReferenceNode = null;
  }

  [
    kID.startSeparator,
    kID.endSeparator
  ].
  forEach((id) => {
    aContextMenu.insertBefore(
      $E('menuseparator', {
        id: id
      }),
      aReferenceNode
    );
  });
}

function getSeparators() {
  return [
    $ID(kID.startSeparator),
    $ID(kID.endSeparator)
  ];
}

function handleAttribute(aNode, aName, aValue) {
  if (aName === 'open') {
    aNode.setAttribute('oncommand', commandForOpenURLs(aValue));
    // @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
    aNode.setAttribute('onclick', 'checkForMiddleClick(this,event);');
    return true;
  }
  return false;
}

function commandForOpenURLs(aURLsArray) {
  let URLs = JSON.stringify(aURLsArray);
  let inBG = (aURLsArray.length > 1) ? 'true' : 'event.button===1';

  let command = 'ucjsUtil.openTabs(' +
    '%URLs%,{inBackground:%inBG%,relatedToCurrent:true});';

  return command.replace('%URLs%', URLs).replace('%inBG%', inBG);
}

/**
 * Entry point
 */
PageRelated_init();


})(this);
