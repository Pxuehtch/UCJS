// ==UserScript==
// @name PageRelated.uc.js
// @description Makes related links about a current page.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage Creates items in the URLbar context menu.


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getNodeById: $ID,
  // Log to console for debug.
  logMessage: log
} = window.ucjsUtil;

function $E(aTag, aAttribute) {
  return window.ucjsUtil.createNode(aTag, aAttribute, handleAttribute);
}

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
    warnParameter: '注意：パラメータ付 URL',
    openAll: 'すべて開く'
  },

  startSeparator: {
    id: 'ucjs_PageRelated_startSeparator'
  },

  endSeparator: {
    id: 'ucjs_PageRelated_endSeparator'
  },
};

/**
 * Preset list.
 *
 * @key category {string}
 *   A display name for menu.
 * @key items {hash[]}
 *   @key disabled {boolean} [optional]
 *   @key name {string}
 *     A display name for menuitem.
 *   @key URL {string}
 *     A URL string of a related page.
 *     @note Pass the current page information with alias.
 *     @see |AliasFixup|
 *   @key URL {function} [optional for the custom formatting]
 *     @param aPageInfo {hash}
 *       @key URL {string}
 *       @key title {string}
 *     @return {string}
 *       a URL string.
 *
 * @note Displayed in the declared order.
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
        URL(aPageInfo) {
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
 * Handler of fixing up an alias with the page information.
 *
 * @return {hash}
 *   @key create {function}
 *
 * [aliases]
 * %URL%, %u% : A page URL.
 * %TITLE%, %t% : A page title.
 *
 * The modifiers can be combined by '|';
 * SCHEMELESS, sl : Without the URL scheme.
 * PARAMLESS, pl : Without the URL parameter.
 * ENCODE, en : With URI encoded.
 *
 * e.g.
 * %URL|ENCODE%, %u|en% : A page URL with URI encoded.
 * %URL|SCHEMELESS|ENCODE%, %u|sl|en% : A page URL, which is trimmed the scheme
 * and then URI encoded (the multiple modifiers is applied in the order of
 * settings).
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
    create
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
  let contextMenu = aEvent.currentTarget;

  if (aEvent.target !== contextMenu) {
    return;
  }

  let [sSep, eSep] = getSeparators();

  // Remove existing menus.
  for (let menu; (menu = sSep.nextSibling) !== eSep; /**/) {
    contextMenu.removeChild(menu);
  }

  // Allow only HTTP page.
  if (!/^https?$/.test(gBrowser.currentURI.scheme)) {
    return;
  }

  let fragment = window.document.createDocumentFragment();

  getAvailableMenus().forEach((menu) => {
    fragment.appendChild(menu);
  });

  contextMenu.insertBefore(fragment, eSep);
}

function getAvailableMenus() {
  let menus = [];

  let pageInfo = {
    title: gBrowser.contentTitle || gBrowser.selectedTab.label,
    URL: gBrowser.currentURI.spec
  };

  // Security warning for a URL with parameters.
  if (/[?#].*$/.test(pageInfo.URL)) {
    menus.push($E('menuitem', {
      label: kUI.menu.warnParameter,
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

      let URL;

      if (typeof data.URL === 'function') {
        URL = data.URL(pageInfo);
      }
      else {
        URL = data.URL;
      }

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
        label: kUI.menu.openAll,
        open: URLs
      }));
    }

    menu.appendChild(popup);
    menus.push(menu);
  });

  return menus;
}

function setSeparators(aContextMenu) {
  [
    kUI.startSeparator,
    kUI.endSeparator
  ].
  forEach((aSeparatorName) => {
    aContextMenu.appendChild($E('menuseparator', {
      id: aSeparatorName.id
    }));
  });
}

function getSeparators() {
  return [
    $ID(kUI.startSeparator.id),
    $ID(kUI.endSeparator.id)
  ];
}

/**
 * Callback function for |ucjsUtil.createNode|.
 */
function handleAttribute(aNode, aName, aValue) {
  if (aName === 'open') {
    setAttributeForCommand(aNode, aValue);

    return true;
  }

  return false;
}

/**
 * Set attributes of a menuitem for its command actions.
 *
 * For one URL;
 * command: Open a tab.
 * <Ctrl> / <MiddleClick>: Open a tab in background.
 *
 * For all URLs;
 * command: Open tabs in background.
 * @note No modifiers.
 *
 * @require Util.uc.js
 */
function setAttributeForCommand(aNode, aURLs) {
  let URLs = JSON.stringify(aURLs);
  let inBG = (aURLs.length > 1) ? 'true' : 'event.ctrlKey||event.button===1';

  let command =
    'ucjsUtil.openTabs(%URLs%,{inBackground:%inBG%,relatedToCurrent:true});';

  command = command.replace('%URLs%', URLs).replace('%inBG%', inBG);

  aNode.setAttribute('oncommand', command);

  // @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
  aNode.setAttribute('onclick', 'checkForMiddleClick(this,event);');
}

/**
 * Entry point.
 */
PageRelated_init();


})(this);
