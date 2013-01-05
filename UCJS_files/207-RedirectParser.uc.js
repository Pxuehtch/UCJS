// ==UserScript==
// @name        RedirectParser.uc.js
// @description Parses a link URL by the inner URLs.
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to menu in the main context menu.


(function(window, undefined) {


"use strict";


/**
 * Whether the access key of a menu item is expressed with underline
 */
const kUnderlinedAccesskey =
  getPref('intl.menuitems.alwaysappendaccesskeys') === 'false';

/**
 * Preference
 */
const kPref = {
  // show schemes except 'http://', 'https://' and 'ftp://'
  showAllSchemes: true
};

/**
 * User preset
 * @key name {string} display name to UI
 * @key link {regexp} URL for a target link should run as a preset
 *   @note A capturing parentheses is required. The matches is tested against
 *   |item.pattern|
 * @key item {hash[]}
 *   @key pattern {regexp}
 *   @key description {string}
 *   @key prefix {string} [optional] adds a prefix to the matched |pattern|
 */
const kPreset = [
  {
    name: '2ch リダイレクト',
    link: /^http:\/\/ime\.(?:nu|st)\/(.+)$/,
    item: [
      {pattern: /^(.+)$/, prefix: 'http://', description: 'リダイレクト先 URL'}
    ]
  },
  {
    name: 'はてなアンテナ リダイレクト',
    link: /^http:\/\/a\.st\-hatena\.com\/go\?(.+)$/,
    item: [
      {pattern: /^(.+)$/, description: 'リダイレクト先 URL'}
    ]
  },
  {
    name: 'Google 画像検索',
    link: /^http:\/\/(?:www|images)\.google\..+?\/imgres\?(.+)$/,
    item: [
      {pattern: /imgurl=(.+?)&/, description: '画像 URL'},
      {pattern: /imgrefurl=(.+?)&/, description: 'ページ URL'}
    ]
  }
  //,
];

const kBundle = {
  menu: {
    id: 'ucjs_redirectparser_menu',
    label: 'リンクの URL を分類',
    accesskey: 'P'
  },

  item: {
    source: {
      text: 'リンクのまま',
      style: 'font-weight:bold;'
    },
    page: {
      text: 'このページと同じ',
      style: 'color:red;'
    },
    empty: {
      text: '該当なし',
      style: ''
    },
    copy: {
      text: 'クリック: コピーするだけ',
      style: 'font-style:italic;'
    }
  }
};

/**
 * Handler of the parsed data of a link URL
 */
var mItemData = {
  preset: null,
  URLs: [],
  separators: [],

  clear: function() {
    this.preset = null;
    this.URLs.length = 0;
    this.separators.length = 0;
  },

  add: function(aURLs) {
    if (typeof aURLs === 'string') {
      aURLs = [aURLs];
    }

    aURLs.forEach(function(URL) {
      if (URL) {
        let action = 'open';
        if (!/^(?:https?|ftp):/.test(URL)) {
          if (!kPref.showAllSchemes) {
            return;
          }
          action = 'copy';
        }
        this.URLs.push({URL: URL, action: action});
      } else {
        this.URLs.push({URL: null});
      }
    }, this);
  },

  isValid: function() {
    // URLs[0] is a linkURL itself
    if (this.URLs.length <= 1 ||
        (!this.preset && !this.separators.length)) {
      this.clear();
      return false;
    }
    return true;
  },

  separate: function() {
    if (this.URLs.length) {
      this.separators.push(this.URLs.length);
    }
  },

  hasSeparator: function(aIndex) {
    return this.separators.indexOf(aIndex) > -1;
  }
};


//********** Functions

function RedirectParser_init() {
  initMenu()
}

function initMenu() {
  var context = getContextMenu();
  var refItem = $ID('context-sep-copylink');

  var menuPref = kBundle.menu;
  var menu = context.insertBefore($E('menu'), refItem);
  menu.id = menuPref.id;
  menu.setAttribute('label', U(menuPref.label));
  menu.setAttribute('accesskey', menuPref.accesskey);
  addEvent([menu.appendChild($E('menupopup')),
    'popupshowing', makeMenuItems, false]);

  addEvent([context, 'popupshowing', showContextMenu, false]);
  addEvent([context, 'popuphiding', hideContextMenu, false]);
}

function showContextMenu(aEvent) {
  if (aEvent.target === getContextMenu()) {
    // @see chrome://browser/content/nsContextMenu.js
    window.gContextMenu.showItem($ID(kBundle.menu.id),
      scanURL(gContextMenu.linkURL));
  }
}

function hideContextMenu(aEvent) {
  if (aEvent.target === getContextMenu()) {
    let menu = $ID(kBundle.menu.id);
    while (menu.itemCount) {
      menu.removeItemAt(0);
    }
    mItemData.clear();
  }
}

function makeMenuItems(aEvent) {
  aEvent.stopPropagation();
  var popup = aEvent.target;
  if (popup.hasChildNodes()) {
    return;
  }

  if (mItemData.preset) {
    popup.appendChild($E('menuitem')).
    setAttribute('label', U(mItemData.preset.name));
  }

  mItemData.URLs.forEach(function({URL, action}, i) {
    if (mItemData.hasSeparator(i)) {
      popup.appendChild($E('menuseparator'));
    }

    var item = popup.appendChild($E('menuitem'));
    var label = '', tooltip = '';

    let (key = chr4key(i)) {
      item.setAttribute('accesskey', key);
      if (kUnderlinedAccesskey) {
        label += key + ': ';
      }
    }

    if (i === 0) {
      let bundle = kBundle.item.source;
      item.setAttribute('style', bundle.style);
      tooltip += bundle.text + '\n';
    } else if (mItemData.preset) {
      tooltip += mItemData.preset.item[i - 1].description + '\n';
    }

    if (URL === null) {
      let bundle = kBundle.item.empty;
      URL = bundle.text;
      item.setAttribute('style', bundle.style);
      item.disabled = true;
    } else if (URL === gBrowser.currentURI.spec) {
      let bundle = kBundle.item.page;
      item.setAttribute('style', bundle.style);
      tooltip += bundle.text + '\n';
    } else if (action === 'copy') {
      let bundle = kBundle.item.copy;
      item.setAttribute('style', bundle.style);
      tooltip += bundle.text + '\n';
    }

    // make the URL of a label readable
    item.setAttribute('label', U(label) + url4ui(URL));
    item.setAttribute('crop', 'center');
    // keep the URL of a tooltip as it is to confirm the raw one
    item.setAttribute('tooltiptext', U(tooltip) + URL);

    setAction(item, action, URL);
  });
}

function scanURL(aURL) {
  if (!/^http/i.test(aURL)) {
    return false;
  }

  return testPreset(aURL) || testSplittable(aURL);
}

function testPreset(aURL) {
  kPreset.some(function(preset) {
    var [, works] = preset.link.exec(aURL) || [];
    if (works) {
      mItemData.preset = preset;
      mItemData.add(aURL);

      preset.item.forEach(function(item) {
        var [, targetURL] = item.pattern.exec(works) || [];
        if (targetURL && item.prefix) {
          targetURL = item.prefix + targetURL;
        }
        mItemData.add(unesc(targetURL));
      });

      return true;
    }
    return false;
  });

  return mItemData.isValid();
}

function testSplittable(aURL) {
  var URLs = splitIntoSchemes(aURL);

  while (URLs.length) {
    // mark for menuseparator
    mItemData.separate();

    let base = unesc(URLs.shift());
    if (URLs.length) {
      mItemData.add(base + URLs.join(''));
    }
    mItemData.add(trimTrailing(base));
  }

  return mItemData.isValid();
}

function splitIntoSchemes(aURL) {
  var URLs = [];

  // splits aURL by '://'
  // e.g. ['http', '://', 'abc.com/...http', '://', ..., '://', 'abc.com/...']
  // [0][1][2] are surely not empty
  const delimiter = /((?:\:|%(?:25)?3A)(?:\/|%(?:25)?2F){2})/i;
  var splits = aURL.split(delimiter);
  if (splits.length === 3) {
    return [aURL];
  }

  var slices, scheme = splits.shift() + splits.shift();
  while (splits.length > 1) {
    // ['abc.com/...', 'http']
    slices = sliceScheme(splits.shift());
    // 'http://' + 'abc.com/...'
    URLs.push(scheme + slices[0]);
    // 'http' + '://'
    scheme = slices[1] + splits.shift();
  }
  URLs.push(scheme + splits.shift());

  return URLs.reduce(function(a, b) {
    var s = b.split(delimiter);
    if (!s[0] || !s[2]) {
      // '://...' or 'http://' is combined with a previous string
      a[a.length - 1] += b;
    } else {
      // 'http://...' is a complete URL string
      a[a.length] = b;
    }
    return a;
  }, []);
}

function sliceScheme(aString) {
  if (!aString)
    return ['', ''];

  // scan scheme-like characters
  // @note The allowable characters for scheme name, "+-.", are excluded
  // because they are ambiguous within queries.
  const charRe = /[a-z0-9]/i, escapedRe = /%(?:25)?2D/i;

  var i = aString.length - 1;
  while (true) {
    if (aString[i] !== '%') {
      if (!charRe.test(aString[i])) {
        i += 1;
        break;
      }
    } else {
      if (!escapedRe.test(aString.substr(i, 3))) {
        i += 3;
        break;
      }
      if (!escapedRe.test(aString.substr(i, 5))) {
        i += 5;
        break;
      }
    }
    if (i === 0)
      break;
    i--;
  }

  return [aString.slice(0, i), aString.slice(i)];
}

function trimTrailing(aURL) {
  var URLs = [aURL];

  var splits = aURL.split(/[?&#]/);
  if (splits.length > 1) {
    URLs.push(splits.shift());
  }

  return URLs;
}


//********** Utilities

function $ID(aId) {
  return window.document.getElementById(aId);
}

function $E(aTag) {
  return window.document.createElement(aTag);
}

function chr4key(aIndex) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';

  return chars[aIndex % chars.length];
}


//********** Imports

function getContextMenu()
  window.ucjsUI.ContentArea.contextMenu;

function setAction(aNode, aAction, aURL) {
  if (!aAction || !aURL) {
    return;
  }

  var action;
  switch (aAction) {
    case 'open':
      // @require Util.uc.js
      action = 'ucjsUtil.openTab("' + aURL +
      '",{inBackground:event.button===1});';
      break;
    case 'copy':
      action = 'Cc["@mozilla.org/widget/clipboardhelper;1"].' +
      'getService(Ci.nsIClipboardHelper).copyString("' + aURL + '");';
      break;
  }

  aNode.setAttribute(
    'onclick',
    'if(event.button===2)return;' +
    'if(event.button===1)closeMenus(event.target);' +
    action
  );
}

function unesc(aStr) {
  return window.ucjsUtil.unescapeURLCharacters(aStr);
}

function url4ui(aURL) {
  return window.ucjsUtil.unescapeURLForUI(aURL);
}

function U(aStr) {
  return window.ucjsUtil.toStringForUI(aStr);
}

function getPref(aKey) {
  return window.ucjsUtil.getPref(aKey);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('RedirectParser.uc.js', aMsg);
}


//********** Entry point

RedirectParser_init();


})(this);
