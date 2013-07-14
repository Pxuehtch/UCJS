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
  // schemes of URL that is opened with menu-command
  // @note the other scheme URL can't be opened but will be copied to
  // clipboard as an unknown URL
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
    link: /^https?:\/\/(?:www|images)\.google\..+?\/imgres\?(?:.*?imgurl=(.+?)&)?(?:.*?imgrefurl=(.+?)&)?.+$/,
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
      type: {
        link: 'Link',
        image: 'Image'
      },
      title: '[%type%] %name%',
      empty: '[%description%] 該当なし'
    },
    source: {
      text: '元の URL',
      style: 'font-weight:bold;'
    },
    currentpage: {
      text: '現在のページと同じ URL',
      style: 'font-style:italic;'
    },
    unknown: {
      text: '不明な URL (コピーだけ開かない)',
      style: 'color:red;'
    }
  }
};


//********** Functions

function RedirectParser_init() {
  initMenu()
}

function initMenu() {
  let context = getContextMenu();
  let refItem = $ID('context-sep-copylink');

  let ui = kUI.menu;
  let menu = $E('menu', {
    id: ui.id,
    label: U(ui.label),
    accesskey: ui.accesskey
  });
  menu.appendChild($E('menupopup'));
  context.insertBefore(menu, refItem);

  addEvent([context, 'popupshowing', showContextMenu, false]);
  addEvent([context, 'popuphiding', hideContextMenu, false]);
}

function showContextMenu(aEvent) {
  if (aEvent.target === getContextMenu()) {
    // @see chrome://browser/content/nsContextMenu.js
    const {showItem, linkURL, mediaURL} = window.gContextMenu;

    showItem($ID(kUI.menu.id), buildParsedURLs({
      sourceURL: {
        link: linkURL,
        image: mediaURL
      }
    }));
  }
}

function hideContextMenu(aEvent) {
  if (aEvent.target === getContextMenu()) {
    let menu = $ID(kUI.menu.id);
    while (menu.itemCount) {
      menu.removeItemAt(0);
    }
  }
}

function buildParsedURLs(aParam) {
  const {sourceURL} = aParam;

  if (!sourceURL.link ||
      !/^https?:/i.test(sourceURL.link)) {
    return false;
  }

  let parseList =
    getParseListByPreset(sourceURL) ||
    getParseListByScan(sourceURL);

  if (parseList) {
    makeMenuItems(parseList);
    parseList.clear();
    return true;
  }
  return false;
}

function makeMenuItems(aParseList) {
  let popup = $ID(kUI.menu.id).menupopup;

  if (aParseList.preset) {
    let {preset, sourceURLType} = aParseList;
    let ui = kUI.item.preset;
    let title = ui.title.
      replace('%type%', ui.type[sourceURLType]).
      replace('%name%', preset.name);

    popup.appendChild($E('menuitem', {
      label: U(title),
      disabled: true
    }));
  }

  aParseList.URLs.forEach(function(URL, i) {
    // @note a separator is not necessary before the first item
    if (i > 0 && aParseList.checkNewURLStart(i)) {
      popup.appendChild($E('menuseparator'));
    }

    let ui;
    let tips = [], styles = [];
    let label, accesskey, tooltiptext, action, disabled;

    if (i === 0) {
      ui = kUI.item.source;
      tips.push(ui.text);
      styles.push(ui.style);
    }
    else if (aParseList.preset) {
      let description = aParseList.preset.items[i - 1].description;

      if (URL) {
        tips.push(description);
      } else {
        ui = kUI.item.preset;
        // show a text in label and tooltip instead of URL
        label = tooltiptext =
        U(ui.empty.replace('%description%', description));
        action = 'none';
        disabled = true;
      }
    }

    if (URL) {
      if (testGeneralScheme(URL)) {
        action = 'open';
      } else {
        ui = kUI.item.unknown;
        tips.push(ui.text);
        styles.push(ui.style);
        action = 'copy';
      }

      if (URL === gBrowser.currentURI.spec) {
        ui = kUI.item.currentpage;
        tips.push(ui.text);
        styles.push(ui.style);
      }
    }

    // make the URL of a label readable
    if (!label) {
      label = unescURLforUI(URL);
    }
    accesskey = getCharFor(i);
    if (kUnderlinedAccesskey) {
      label = accesskey + ': ' + label;
    }

    // keep the URL of a tooltip as it is to confirm the raw one
    if (!tooltiptext) {
      tooltiptext = URL;
    }
    if (tips.length) {
      tooltiptext = U(tips.join('\n')) + '\n' + tooltiptext;
    }

    popup.appendChild($E('menuitem', {
      label: label,
      crop: 'center',
      accesskey: accesskey,
      tooltiptext: tooltiptext,
      styles: styles,
      action: [action, URL],
      disabled: disabled
    }));
  });
}

function testGeneralScheme(aURL) {
  if (aURL) {
    let re = RegExp('^(?:' + kPref.generalSchemes + '):\/\/.+$', 'i');
    return re.test(aURL);
  }
  return false;
}

function getCharFor(aIndex) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';

  return chars[aIndex % chars.length];
}

function getParseListByPreset(aSourceURL) {
  let parseList;

  kPreset.some(function(preset) {
    if (preset.disabled) {
      return false;
    }

    let testerRE, sourceURL, sourceURLType;
    if (preset.link && aSourceURL.link) {
      testerRE = preset.link;
      sourceURL = aSourceURL.link;
      sourceURLType = 'link';
    }
    else if (preset.image && aSourceURL.image) {
      testerRE = preset.image;
      sourceURL = aSourceURL.image;
      sourceURLType = 'image';
    }

    if (!sourceURLType) {
      return false;
    }

    if (testerRE.test(sourceURL)) {
      parseList = createParseList(preset, sourceURLType);

      parseList.add(sourceURL);

      preset.items.forEach(function({replacement}) {
        let matchURL = sourceURL.replace(testerRE, replacement);
        parseList.add(unescURLChars(matchURL));
      });

      return true;
    }
    return false;
  });

  if (parseList && parseList.validate()) {
    return parseList;
  }
  return null;
}

function getParseListByScan(aSourceURL) {
  let parseList = createParseList();

  let URLs = splitIntoSchemes(aSourceURL.link);
  while (URLs.length) {
    parseList.markAsNewURL();

    let baseURL = unescURLChars(URLs.shift());
    if (URLs.length) {
      parseList.add(baseURL + URLs.join(''));
    }

    parseList.add(baseURL);

    let trimmedURL = removeFragment(baseURL);
    if (trimmedURL) {
      parseList.add(trimmedURL);
    }
  }

  if (parseList && parseList.validate()) {
    return parseList;
  }
  return null;
}

function splitIntoSchemes(aURL) {
  // splits a URL by '://'
  // e.g.
  // ['http', '://', 'abc.com/...http', '://', ..., '://', 'abc.com/...']
  // [0][1][2] are surely not empty
  const delimiter = /((?:\:|%(?:25)?3A)(?:\/|%(?:25)?2F){2})/i;

  let splits = aURL.split(delimiter);
  if (splits.length === 3) {
    return [aURL];
  }

  let URLs = [];
  let slices, scheme = splits.shift() + splits.shift();
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
    let segments = b.split(delimiter);
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

/*
 * Creates a handler of the list of the parsed URLs
 */
function createParseList(aPreset, aSourceURLType) {
  let mPreset = aPreset;
  let mSourceURLType = aSourceURLType;
  let mURLs = [];
  let mNewURLIndexes = [];

  function clear() {
    mPreset = null;
    mSourceURLType = '';
    mURLs.length = 0;
    mNewURLIndexes.length = 0;
  }

  function add(aURL) {
    mURLs.push(aURL);
  }

  function validate() {
    // a list with no new URL except a source URL is invalid
    // @note URLs[0] is a source URL itself
    if (mURLs.length <= 1 ||
        (!mPreset && mNewURLIndexes.length <= 1)) {
      clear();
      return false;
    }
    return true;
  }

  function markAsNewURL() {
    // @note the first item is always new URL
    mNewURLIndexes.push(mURLs.length);
  }

  function checkNewURLStart(aIndex) {
    return mNewURLIndexes.indexOf(aIndex) > -1;
  }

  return {
    preset: mPreset,
    sourceURLType: mSourceURLType,
    URLs: mURLs,
    clear: clear,
    add: add,
    validate: validate,
    markAsNewURL: markAsNewURL,
    checkNewURLStart: checkNewURLStart
  };
}


//********** Utilities

function $ID(aId) {
  return window.document.getElementById(aId);
}

function $E(aTag, aAttributes) {
  let element = window.document.createElement(aTag);

  if (aAttributes) {
    for (let [name, value] in Iterator(aAttributes)) {
      if (value === null || value === undefined) {
        continue;
      }

      switch (name) {
        case 'styles':
          value.join(';').split(/;+/).forEach(function(style) {
            let [propName, propValue] =
            style.split(':').map(function(str) {
              return str.trim();
            });

            if (propName && propValue) {
              element.style.setProperty(propName, propValue, '');
            }
          });
          break;
        case 'action': {
          let command = makeActionCommand(value);
          if (command) {
            element.setAttribute('oncommand', command);
            // @see chrome://browser/content/utilityOverlay.js::
            // checkForMiddleClick
            element.setAttribute('onclick',
              'checkForMiddleClick(this,event);');
          }
          break;
        }
        default:
          element.setAttribute(name, value);
          break;
      }
    }
  }

  return element;
}

function makeActionCommand(aValue) {
  let [action, URL] = aValue;
  if (!URL) {
    return '';
  }

  let command;
  switch (action) {
    case 'open':
      command = getOpenTabCommand(URL);
      break;
    case 'copy':
      command = 'Cc["@mozilla.org/widget/clipboardhelper;1"].' +
        'getService(Ci.nsIClipboardHelper).copyString("%URL%");';
      command = command.replace('%URL%', URL);
      break;
    default:
      return '';
  }

  return command;
}


//********** Imports

function getContextMenu() {
  return window.ucjsUI.ContentArea.contextMenu;
}

/**
 * Makes a string for the |oncommand| attribute of an element
 */
function getOpenTabCommand(aURL) {
  let command = 'ucjsUtil.openTab("%URL%",{inBackground:event.button===1});';
  return command.replace('%URL%', aURL);
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
