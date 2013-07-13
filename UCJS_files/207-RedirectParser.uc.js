// ==UserScript==
// @name        RedirectParser.uc.js
// @description Parses a link URL by the inner URLs.
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to a menu in the main context menu


(function(window, undefined) {


"use strict";


/**
 * Whether the access key of a menu item is expressed with underline
 * @note valid values are string 'true' or 'false', and missing key or empty
 * value equals 'false'
 * @see http://mxr.mozilla.org/mozilla-release/source/toolkit/locales/en-US/chrome/global/intl.properties#64
 */
const kUnderlinedAccesskey =
  getPref('intl.menuitems.alwaysappendaccesskeys', 'false') === 'false';

/**
 * Preference
 */
const kPref = {
  // show a URL that has a scheme except general schemes
  // @note the URL can't be opened with menu-command but will be copied to
  // clipboard
  showSpecialSchemes: true,
  generalSchemes: 'http|https|ftp'
};

/**
 * User preset settings
 *
 * @key name {string} display name
 * @key link {regexp} link URL
 * @key image {regexp} linked image URL
 *   @note |link| will be valid on a linked image if both keys are defined
 *   @note capturing parentheses are required. they replace |$n| in
 *   |items.replacement|
 * @key items {hash[]}
 *   @key replacement {string}
 *   @key description {string}
 * @key disabled {boolean} [optional]
 */
const kPreset = [
  {
    name: '2ch リダイレクト',
    link: /^http:\/\/ime\.(?:nu|st)\/(.+)$/,
    items: [
      {
        replacement: 'http://$1',
        description: 'リダイレクト先 URL'
      }
    ]
  },
  {
    name: 'はてなアンテナ リダイレクト',
    link: /^http:\/\/a\.st\-hatena\.com\/go\?(.+)$/,
    items: [
      {
        replacement: '$1',
        description: 'リダイレクト先 URL'
      }
    ]
  },
  {
    name: 'Google 画像検索',
    link: /^https?:\/\/(?:www|images)\.google\..+?\/imgres\?(?:.+&)?imgurl=(.+?)&(?:.+&)?imgrefurl=(.+?)&.+$/,
    items: [
      {
        replacement: '$1',
        description: '画像 URL'
      },
      {
        replacement: '$2',
        description: 'ページ URL'
      }
    ]
  },
  {
    name: 'My Opera Photo albums サムネイル',
    image: /^(https?):\/\/(?:files|thumbs)\.myopera\.com\/(?:.+\/)??([^\/]+\/albums\/\d+)\/(?:thumbs\/)?(.+?\.[a-z]+)(?:_thumb\.[a-z]+)?$/,
    items: [
      {
        replacement: '$1://files.myopera.com/$2/$3',
        description: '画像 URL'
      }
    ]
  }
  //,
];

const kUI = {
  menu: {
    id: 'ucjs_redirectparser_menu',
    label: 'リンクの URL を分類',
    accesskey: 'P'
  },

  item: {
    preset: {
      text: '[%type%] %name%',
      type: {
        link: 'Link',
        image: 'Image'
      }
    },
    source: {
      text: '元の URL',
      style: 'font-weight:bold;'
    },
    page: {
      text: '現在のページと同じ URL',
      style: 'color:red;'
    },
    empty: {
      text: '該当なし',
      style: ''
    },
    special: {
      text: '特殊な URL（コピーだけ開かない）',
      style: 'font-style:italic;'
    }
  }
};

/**
 * Handler of the parsed data of URL
 */
var mItemData = {
  preset: null,
  type: '',
  URLs: [],
  newURLIndexes: [],

  clear: function() {
    this.preset = null;
    this.type = '';
    this.URLs.length = 0;
    this.newURLIndexes.length = 0;
  },

  add: function(aURL) {
    if (aURL) {
      // optional checks whether special schemes are allowed
      if (!kPref.showSpecialSchemes &&
          !testGeneralScheme(aURL)) {
        return;
      }
    }
    this.URLs.push(aURL || '');
  },

  isValid: function() {
    // a list with no new URL except a source URL is invalid
    // @note URLs[0] is a source URL itself
    if (this.URLs.length <= 1 ||
        (!this.preset && this.newURLIndexes.length <= 1)) {
      this.clear();
      return false;
    }
    return true;
  },

  markAsNewURL: function() {
    // @note the first item is always new URL
    this.newURLIndexes.push(this.URLs.length);
  },

  checkNewURLStart: function(aIndex) {
    return this.newURLIndexes.indexOf(aIndex) > -1;
  }
};


//********** Functions

function RedirectParser_init() {
  initMenu()
}

function initMenu() {
  var context = getContextMenu();
  var refItem = $ID('context-sep-copylink');

  var ui = kUI.menu;
  var menu = context.insertBefore($E('menu'), refItem);
  menu.id = ui.id;
  menu.setAttribute('label', U(ui.label));
  menu.setAttribute('accesskey', ui.accesskey);
  addEvent([menu.appendChild($E('menupopup')),
    'popupshowing', makeMenuItems, false]);

  addEvent([context, 'popupshowing', showContextMenu, false]);
  addEvent([context, 'popuphiding', hideContextMenu, false]);
}

function showContextMenu(aEvent) {
  if (aEvent.target === getContextMenu()) {
    // @see chrome://browser/content/nsContextMenu.js
    const {showItem, linkURL, mediaURL} = window.gContextMenu;

    showItem($ID(kUI.menu.id), scanURL({
      link: linkURL,
      image: mediaURL
    }));
  }
}

function hideContextMenu(aEvent) {
  if (aEvent.target === getContextMenu()) {
    let menu = $ID(kUI.menu.id);
    while (menu.itemCount) {
      menu.removeItemAt(0);
    }
    mItemData.clear();
  }
}

function makeMenuItems(aEvent) {
  aEvent.stopPropagation();
  let popup = aEvent.target;

  // show existing items when a menu reopens on the context menu remained open
  if (popup.hasChildNodes()) {
    return;
  }

  if (mItemData.preset) {
    let {preset, type} = mItemData;
    let ui = kUI.item.preset;
    let name = ui.text.
      replace('%type%', ui.type[type]).
      replace('%name%', preset.name);

    let presetName = popup.appendChild($E('menuitem'));
    presetName.setAttribute('label', U(name));
    presetName.disabled = true;
  }

  mItemData.URLs.forEach(function(URL, i) {
    // @note a separator is not necessary before the first item
    if (i > 0 && mItemData.checkNewURLStart(i)) {
      popup.appendChild($E('menuseparator'));
    }

    let item = popup.appendChild($E('menuitem'));

    let accesskey = charForAccesskey(i);
    item.setAttribute('accesskey', accesskey);

    let ui;
    let tips = [];

    if (i === 0) {
      ui = kUI.item.source;
      item.setAttribute('style', ui.style);
      tips.push(ui.text);
    }
    else if (mItemData.preset) {
      tips.push(mItemData.preset.items[i - 1].description);
    }

    let action = 'open';
    if (!URL) {
      ui = kUI.item.empty;
      URL = ui.text;
      item.setAttribute('style', ui.style);
      item.disabled = true;
      action = 'none';
    } else {
      if (URL === gBrowser.currentURI.spec) {
        ui = kUI.item.page;
        item.setAttribute('style', ui.style);
        tips.push(ui.text);
      }
      if (!testGeneralScheme(URL)) {
        ui = kUI.item.special;
        item.setAttribute('style', ui.style);
        tips.push(ui.text);
        action = 'copy';
      }
    }

    // make the URL of a label readable
    let label = unescURLforUI(URL);
    if (kUnderlinedAccesskey) {
      label = accesskey + ': ' + label;
    }
    item.setAttribute('label', label);
    item.setAttribute('crop', 'center');

    // keep the URL of a tooltip as it is to confirm the raw one
    let tooltip = URL;
    if (tips.length) {
       tooltip = U(tips.join('\n')) + '\n' + tooltip;
    }
    item.setAttribute('tooltiptext', tooltip);

    setAction(item, action, URL);
  });
}

function testGeneralScheme(aURL) {
  if (aURL) {
    let re = RegExp('^(?:' + kPref.generalSchemes + '):/', 'i');
    return re.test(aURL);
  }
  return false;
}

function scanURL(aURLList) {
  let {link} = aURLList;

  if (!link || !/^https?:/i.test(link)) {
    return false;
  }

  return testPreset(aURLList) || testSplittable(link);
}

function testPreset(aURLList) {
  kPreset.some(function(preset) {
    if (preset.disabled) {
      return false;
    }

    let type, testerRE, sourceURL;
    if (preset.link && aURLList.link) {
      type = 'link';
      testerRE = preset.link;
      sourceURL = aURLList.link;
    }
    else if (preset.image && aURLList.image) {
      type = 'image';
      testerRE = preset.image;
      sourceURL = aURLList.image;
    }

    if (!type) {
      return false;
    }

    if (testerRE.test(sourceURL)) {
      mItemData.preset = preset;
      mItemData.type = type;
      mItemData.add(sourceURL);

      preset.items.forEach(function({replacement}) {
        let matchURL = sourceURL.replace(testerRE, replacement);
        mItemData.add(unescURLChars(matchURL));
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
    mItemData.markAsNewURL();

    let baseURL = unescURLChars(URLs.shift());
    if (URLs.length) {
      mItemData.add(baseURL + URLs.join(''));
    }

    mItemData.add(baseURL);

    let trimmedURL = removeFragment(baseURL);
    if (trimmedURL) {
      mItemData.add(trimmedURL);
    }
  }

  return mItemData.isValid();
}

function splitIntoSchemes(aURL) {
  var URLs = [];

  // splits aURL by '://'
  // e.g.
  // ['http', '://', 'abc.com/...http', '://', ..., '://', 'abc.com/...']
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
    var segments = b.split(delimiter);
    if (!segments[0] || !segments[2]) {
      // an incomplete URL ('://...' or 'http://') is combined with a previous
      // string as a part of it
      a[a.length - 1] += b;
    } else {
      // 'http://...' is a complete URL string
      a[a.length] = b;
    }
    return a;
  }, []);
}

function sliceScheme(aString) {
  if (!aString) {
    return ['', ''];
  }

  // allowable characters for scheme
  const schemeCharRE = /[a-z0-9+-.]/i;
  // two hexadecimal digits part of the escaped code for [+-.]
  const escapedCodeRE = /2B|2D|2E/i;

  // the loop index is used outside of loop, so be care for decreasing it
  let i = aString.length - 1;
  while (true) {
    if (aString[i] !== '%') {
      if (!schemeCharRE.test(aString[i])) {
        i += 1;
        break;
      }
    } else {
      let code, codeLength;
      // '%' may be escaped to '%25'
      // string.substr(start, length) returns an empty string if
      // |start| >= the length of the string
      if (aString.substr(i, 3) === '%25') {
        code = aString.substr(i + 3, 2);
        codeLength = 5;
      } else {
        code = aString.substr(i + 1, 2);
        codeLength = 3;
      }
      if (!escapedCodeRE.test(code)) {
        i += codeLength;
        break;
      }
    }

    // no more characters
    if (i === 0) {
      break;
    }
    // decrease the loop index here, at the bottom
    i--;
  }

  // string.slice(begin[, end]) returns an empty string if
  // |begin| >= the length of the string
  return [aString.slice(0, i), aString.slice(i)];
}

function removeFragment(aURL) {
  let trimmedURL = aURL.replace(/[?&#].*$/, '');
  if (trimmedURL !== aURL) {
    return trimmedURL;
  }
  return '';
}


//********** Utilities

function $ID(aId) {
  return window.document.getElementById(aId);
}

function $E(aTag) {
  return window.document.createElement(aTag);
}

function charForAccesskey(aIndex) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';

  return chars[aIndex % chars.length];
}


//********** Imports

function getContextMenu() {
  return window.ucjsUI.ContentArea.contextMenu;
}

function setAction(aNode, aAction, aURL) {
  if (!aURL) {
    return;
  }

  let command;
  switch (aAction) {
    case 'open':
      // @require Util.uc.js
      command = 'ucjsUtil.openTab("%URL%",' +
        '{inBackground:event.button===1});';
      break;
    case 'copy':
      command = 'Cc["@mozilla.org/widget/clipboardhelper;1"].' +
        'getService(Ci.nsIClipboardHelper).copyString("%URL%");';
      break;
    default:
      return;
  }

  aNode.setAttribute('oncommand', command.replace('%URL%', aURL));
  // @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
  aNode.setAttribute('onclick', 'checkForMiddleClick(this,event);');
}

function unescURLChars(aStr) {
  return window.ucjsUtil.unescapeURLCharacters(aStr);
}

function unescURLforUI(aURL) {
  return window.ucjsUtil.unescapeURLForUI(aURL);
}

// |U()| converts embedded chars in the code for displaying properly.
function U(aStr) {
  return window.ucjsUtil.toStringForUI(aStr);
}

function getPref(aKey, aDefaultValue) {
  return window.ucjsUtil.Prefs.get(aKey, aDefaultValue);
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
