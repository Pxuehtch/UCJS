// ==UserScript==
// @name PageRelated.uc.js
// @description Makes related links about a current page.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage Some menus are appended in the URL-bar context menu.


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  DOMUtils: {
    init$E,
    $ID
  },
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

// Makes $E with the attributes handler.
const $E = init$E(handleAttribute);

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
 *   @key url {string}
 *     A URL string of a related page.
 *     @note Pass the current page information with alias.
 *     @see |AliasFixup|
 *   @key url {function} [optional for the custom formatting]
 *     @param aPageInfo {hash}
 *       @key url {string}
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
        url: 'http://translate.google.com/translate?sl=auto&tl=ja&u=%u%'
      }
    ]
  },
  {
    category: 'Archive',
    items: [
      {
        name: 'Google cache:',
        url: 'https://www.google.co.jp/search?q=cache:%u|sl%'
      },
      {
        name: 'Internet Archive',
        url: 'http://web.archive.org/*/%u%'
      },
      {
        name: 'WEB 魚拓',
        url: 'https://www.google.co.jp/search?sitesearch=megalodon.jp&q=%u|sl%'
      }
    ]
  },
  {
    category: 'Bookmark',
    items: [
      {
        name: 'はてなブックマーク',
        url(aPageInfo) {
          let entryURL = 'http://b.hatena.ne.jp/entry/';

          if (/^https:/.test(aPageInfo.url)) {
            entryURL += 's/';
          }

          return entryURL + '%u|sl%';
        }
      },
      {
        name: 'reddit',
        url: 'http://www.reddit.com/submit?url=%u|enc%'
      }
    ]
  },
  {
    category: 'Related',
    items: [
      {
        name: 'Google link:',
        url: 'https://www.google.co.jp/search?q=link:%u|sl%'
      },
      {
        name: 'Google with Page Title',
        url: 'https://www.google.co.jp/search?q="%t%"'
      },
      {
        name: 'Yahoo! link:',
        url: 'http://search.yahoo.co.jp/search?p=link:%u%&ei=UTF-8'
      },
      {
        name: 'Yahoo! with Page Title',
        url: 'http://search.yahoo.co.jp/search?p="%t|enc%"&ei=UTF-8'
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
 * [alias]
 * %url%, %u% : A page URL.
 * %title%, %t% : A page title.
 *
 * @note The modifiers can be combined by '|'.
 * schemeless, sl : Without the URL scheme.
 * paramless, pl : Without the URL parameter.
 * encode, enc : With URI encoded.
 *
 * e.g.
 * %url|encode%, %u|enc% : A page URL with URI encoded.
 * %url|schemeless|encode%, %u|sl|enc% : A page URL, which is trimmed the
 * scheme and then URI encoded (the multiple modifiers is applied in the order
 * of settings).
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
      case 'url':
      case 'u':
        return aPageInfo.url;

      case 'title':
      case 't':
        return aPageInfo.title;
    }

    return '';
  }

  function fixupModifier(aText, aModifier) {
    switch (aModifier) {
      case 'schemeless':
      case 'sl':
        return aText.replace(/^https?:\/\//, '');

      case 'paramless':
      case 'pl':
        return aText.replace(/[?#].*$/, '');

      case 'encode':
      case 'enc':
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
      ['popupshowing', onPopupShowing],
      ['popuphiding', onPopupHiding]
    ],

    onCreate: createMenu
  });
}

function createMenu(aContextMenu) {
  setSeparators(aContextMenu);
}

function onPopupShowing(event) {
  let contextMenu = event.currentTarget;

  if (event.target !== contextMenu) {
    return;
  }

  // Allow only HTTP page.
  if (!/^https?$/.test(gBrowser.currentURI.scheme)) {
    return;
  }

  let fragment = window.document.createDocumentFragment();

  getAvailableMenus().forEach((menu) => {
    fragment.appendChild(menu);
  });

  let [, endSeparator] = getSeparators();

  contextMenu.insertBefore(fragment, endSeparator);
}

function onPopupHiding(event) {
  let contextMenu = event.currentTarget;

  if (event.target !== contextMenu) {
    return;
  }

  let [startSeparator, endSeparator] = getSeparators();

  // Remove existing items.
  while (startSeparator.nextSibling !== endSeparator) {
    startSeparator.nextSibling.remove();
  }
}

function getAvailableMenus() {
  let menus = [];

  let pageInfo = {
    title: gBrowser.contentTitle || gBrowser.selectedTab.label,
    url: gBrowser.currentURI.spec
  };

  // Security warning for a URL with parameters.
  if (/[?#].*$/.test(pageInfo.url)) {
    menus.push($E('menuitem', {
      label: kUI.menu.warnParameter,
      style: 'font-weight:bold;',
      tooltiptext: pageInfo.url.replace(/[?#]/, '\n$&'),
      disabled: true
    }));
  }

  kPreset.forEach(({category, items}) => {
    let menu = $E('menu', {
      label: category
    });
    let popup = $E('menupopup');

    let urls = [];

    items.forEach(function(data) {
      if (data.disabled) {
        return;
      }

      let url;

      if (typeof data.url === 'function') {
        url = data.url(pageInfo);
      }
      else {
        url = data.url;
      }

      url = AliasFixup.create(url, pageInfo);

      popup.appendChild($E('menuitem', {
        label: data.name,
        open: [url],
        tooltiptext: url
      }));

      urls.push(url);
    });

    if (urls.length > 1) {
      popup.appendChild($E('menuseparator'));
      popup.appendChild($E('menuitem', {
        label: kUI.menu.openAll,
        open: urls
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
 * Attribute handler for |ucjsUtil.DOMUtils.$E|.
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
 * [For one URL]
 * command: Open a tab.
 * <Ctrl> / <MiddleClick>: Open a tab in background.
 *
 * [For all URLs]
 * command: Open tabs in background.
 * @note No modifiers.
 *
 * @require Util.uc.js
 */
function setAttributeForCommand(node, urls) {
  let URLList = JSON.stringify(urls);
  let inBG = (urls.length > 1) ? 'true' : 'event.ctrlKey||event.button===1';

  let command = `
    ucjsUtil.TabUtils.openTabs(${URLList}, {
      inBackground: ${inBG},
      relatedToCurrent: true
    });
  `;

  command = command.replace(/^\s+|\n/gm, '');

  node.setAttribute('oncommand', command);

  // @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
  node.setAttribute('onclick', 'checkForMiddleClick(this,event);');
}

/**
 * Entry point.
 */
PageRelated_init();


})(this);
