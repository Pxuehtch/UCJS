// ==UserScript==
// @name RedirectParser.uc.js
// @description Parses a link URL by the inner URLs.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage A menu is appended in the main context menu on a link that has inner
// URLs.


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  DOMUtils: {
    init$E,
    $ID
  },
  URLUtils: {
    unescapeURLCharacters: unescURLChars,
    unescapeURLForUI: unescURLforUI
  },
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

// Makes $E with the attributes handler.
const $E = init$E(handleAttribute);

const {
  ContentArea: {
    contextMenu: contentAreaContextMenu
  }
} = window.ucjsUI;

/**
 * Whether the access key of a menu item is expressed with underline.
 *
 * @note Used for labeling of menuitems.
 *
 * @note Valid values are string 'true' or 'false', and missing key or empty
 * value equals 'false'.
 * @see chrome://global/locale/intl.properties
 */
const kUnderlinedAccesskey = Modules.Prefs.
  get('intl.menuitems.alwaysappendaccesskeys', 'false') === 'false';

/**
 * Preference
 */
const kPref = {
  // URL schemes that can be opened with a command.
  // @note The URL with other schemes can't be opened but will be copied to
  // clipboard.
  schemesToOpen: 'http|https|ftp'
};

/**
 * User preset settings.
 *
 * @key name {string}
 *   A display name.
 * @key link {regexp}
 * @key image {regexp}
 *   The link URL or image source URL.
 *   @note |link| will be valid on a linked image if both keys are defined.
 *   @note Capturing parentheses replace |$n| in |items.replacement|.
 * @key items {hash[]}
 *   @key replacement {string}
 *   @key description {string}
 * @key disabled {boolean} [optional]
 */
const kPreset = [
  {
    name: '2ch リダイレクト',
    link: /^http:\/\/(?:ime\.nu\/|jump\.2ch\.net\/\?|2ch\.io\/)(.+)$/,
    items: [
      {
        replacement: 'http://$1',
        description: 'リダイレクト先 URL'
      }
    ]
  },
  {
    name: 'Google 画像検索',
    link: /^https?:\/\/(?:www|images)\.google\..+?\/imgres\?(?=.*?imgurl=([^&]+))(?=.*?imgrefurl=([^&]+)).*$/,
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
  }
  //,
];

/**
 * UI settings.
 */
const kUI = {
  menu: {
    id: 'ucjs_RedirectParser_menu',
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

function RedirectParser_init() {
  contentAreaContextMenu.register({
    events: [
      ['popupshowing', onPopupShowing],
      ['popuphiding', onPopupHiding]
    ],

    onCreate: createMenu
  });
}

function createMenu(aContextMenu) {
  let refItem = $ID('context-sep-copylink');

  let ui = kUI.menu;
  let menu = $E('menu', {
    id: ui.id,
    label: ui.label,
    accesskey: ui.accesskey
  });

  menu.appendChild($E('menupopup'));
  aContextMenu.insertBefore(menu, refItem);
}

function onPopupShowing(aEvent) {
  let contextMenu = aEvent.currentTarget;

  if (aEvent.target === contextMenu) {
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

function onPopupHiding(aEvent) {
  let contextMenu = aEvent.currentTarget;

  if (aEvent.target === contextMenu) {
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

    return true;
  }

  return false;
}

function makeMenuItems(aParseList) {
  let fragment = window.document.createDocumentFragment();

  if (aParseList.preset) {
    let {preset, sourceURLType} = aParseList;
    let ui = kUI.item.preset;
    let title = ui.title.
      replace('%type%', ui.type[sourceURLType]).
      replace('%name%', preset.name);

    fragment.appendChild($E('menuitem', {
      label: title,
      disabled: true
    }));
  }

  aParseList.urls.forEach((url, i) => {
    // @note A separator is not necessary before the first item.
    if (i > 0 && aParseList.checkNewURLStart(i)) {
      fragment.appendChild($E('menuseparator'));
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

      if (url) {
        tips.push(description);
      }
      else {
        ui = kUI.item.preset;
        // Show a text in label and tooltip instead of URL.
        label = tooltiptext =
          ui.empty.replace('%description%', description);
        action = 'none'; // Dummy value for now.
        disabled = true;
      }
    }

    if (url) {
      if (testSchemeToOpen(url)) {
        action = 'open';
      }
      else {
        ui = kUI.item.unknown;
        tips.push(ui.text);
        styles.push(ui.style);
        action = 'copy';
      }

      if (url === gBrowser.currentURI.spec) {
        ui = kUI.item.currentpage;
        tips.push(ui.text);
        styles.push(ui.style);
      }
    }

    // Make the URL of a label readable.
    if (!label) {
      label = unescURLforUI(url);
    }

    accesskey = getCharFor(i);

    if (kUnderlinedAccesskey) {
      label = accesskey + ': ' + label;
    }

    // Keep the URL of a tooltip as it is to confirm the raw one.
    if (!tooltiptext) {
      tooltiptext = url;
    }

    if (tips.length) {
      tooltiptext = tips.concat(tooltiptext).join('\n');
    }

    fragment.appendChild($E('menuitem', {
      label,
      crop: 'center',
      accesskey,
      tooltiptext,
      styles,
      action: [action, url],
      disabled
    }));
  });

  $ID(kUI.menu.id).menupopup.appendChild(fragment);
}

function testSchemeToOpen(aURL) {
  if (aURL) {
    let re = RegExp('^(?:' + kPref.schemesToOpen + '):\/\/.+$', 'i');

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

  kPreset.some((preset) => {
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

      preset.items.forEach(({replacement}) => {
        let matchURL = sourceURL.replace(testerRE, replacement);

        // @note Decode only special characters for URL.
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

  let urls = splitIntoSchemes(aSourceURL.link);

  while (urls.length) {
    parseList.markAsNewURL();

    // @note Decode only special characters for URL.
    let baseURL = unescURLChars(urls.shift());

    if (urls.length) {
      parseList.add(baseURL + urls.join(''));
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
  // Split a URL by '://'.
  // e.g. ['http', '://', 'foo.com/...http', '://', ..., '://', 'bar.com/...']
  // [0][1][2] are surely not empty.
  const delimiter = /((?:\:|%(?:25)?3A)(?:\/|%(?:25)?2F){2})/i;

  let splits = aURL.split(delimiter);

  if (splits.length === 3) {
    return [aURL];
  }

  let urls = [];
  let slices, scheme = splits.shift() + splits.shift();

  while (splits.length > 1) {
    // 'foo.com/...http' -> ['foo.com/...', 'http']
    slices = sliceScheme(splits.shift());
    // 'http://' + 'foo.com/...'
    urls.push(scheme + slices[0]);
    // 'http' + '://'
    scheme = slices[1] + splits.shift();
  }

  urls.push(scheme + splits.shift());

  return urls.reduce((a, b) => {
    let segments = b.split(delimiter);

    if (!segments[0] || !segments[2]) {
      // An incomplete URL ('://...' or 'http://') is combined with a previous
      // string as a part of it.
      a[a.length - 1] += b;
    }
    else {
      // 'http://...' is a complete URL string.
      a[a.length] = b;
    }

    return a;
  }, []);
}

function sliceScheme(aString) {
  if (!aString) {
    return ['', ''];
  }

  // Allowable characters for scheme:
  // scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
  // @see http://tools.ietf.org/html/rfc3986#section-3.1
  const schemeCharRE = /[a-z0-9+-.]/i;
  // The two hexadecimal digits part of the escape code for [+-.].
  const escapeCodeRE = /2B|2D|2E/i;
  // The leading marks are invalid for scheme.
  const leadingMarksRE = /^(?:[0-9+-.]|%(?:25)?(?:2B|2D|2E))+/i;

  // @note Take care of changing the value of a loop index for using it outside
  // of loop.
  let index = aString.length - 1;

  while (true) {
    if (aString[index] !== '%') {
      if (!schemeCharRE.test(aString[index])) {
        index += 1;
        break;
      }
    }
    else {
      let code, codeLength;

      // '%' may be escaped to '%25'.
      if (aString.substr(index, 3) === '%25') {
        code = aString.substr(index + 3, 2);
        codeLength = 5;
      }
      else {
        code = aString.substr(index + 1, 2);
        codeLength = 3;
      }

      if (!escapeCodeRE.test(code)) {
        index += codeLength;
        break;
      }
    }

    // No more characters.
    if (index === 0) {
      break;
    }

    // @note Decrement the loop index here, at the bottom of loop.
    index--;
  }

  if (index < aString.length) {
    let scheme = aString.slice(index).replace(leadingMarksRE, '');

    if (scheme) {
      return [aString.slice(0, aString.lastIndexOf(scheme)), scheme];
    }
  }

  return [aString, ''];
}

function removeFragment(aURL) {
  let trimmedURL = aURL.replace(/[?&#].*$/, '');

  if (trimmedURL !== aURL) {
    return trimmedURL;
  }

  return '';
}

/*
 * Creates a list handler of parsed URLs.
 */
function createParseList(aPreset, aSourceURLType) {
  let mPreset = aPreset || null;
  let mSourceURLType = aSourceURLType || '';
  let mURLs = [];
  let mNewURLIndexes = [];

  function add(aURL) {
    mURLs.push(aURL);
  }

  function validate() {
    // Invalid: No item except a source URL.
    // @note urls[0] is always a source URL itself.
    if (mURLs.length <= 1) {
      return false;
    }

    // Invalid: No inner URL by scanning.
    // @note The first item is always marked.
    if (!mPreset && mNewURLIndexes.length <= 1) {
      return false;
    }

    return true;
  }

  function markAsNewURL() {
    // @note The first item is always marked.
    mNewURLIndexes.push(mURLs.length);
  }

  function checkNewURLStart(aIndex) {
    return mNewURLIndexes.includes(aIndex);
  }

  return {
    preset: mPreset,
    sourceURLType: mSourceURLType,
    urls: mURLs,
    add,
    validate,
    markAsNewURL,
    checkNewURLStart
  };
}

/**
 * Attribute handler for |ucjsUtil.DOMUtils.$E|.
 */
function handleAttribute(aNode, aName, aValue) {
  switch (aName) {
    case 'styles': {
      aValue.join(';').split(/;+/).forEach((style) => {
        let [propName, propValue] = style.split(':').map((str) => str.trim());

        if (propName && propValue) {
          aNode.style.setProperty(propName, propValue, '');
        }
      });

      return true;
    }

    case 'action': {
      setAttributeForCommand(aNode, aValue);

      return true;
    }
  }

  return false;
}

/**
 * Set attributes of a menuitem for its command actions.
 *
 * [For 'open' action]
 * command: Open a tab.
 * <Ctrl> / <MiddleClick>: Open a tab in background.
 *
 * [For 'copy' action]
 * command: Copy the URL string to clipboard.
 * @note No modifiers.
 *
 * @require Util.uc.js
 */
function setAttributeForCommand(aNode, aActionData) {
  let [action, url] = aActionData;

  if (!url) {
    return;
  }

  let command;

  switch (action) {
    case 'open': {
      command =
        'ucjsUtil.TabUtils.openTab("%url%",' +
        '{inBackground:event.ctrlKey||event.button===1});';

      break;
    }

    case 'copy': {
      command = 'ucjsUtil.Modules.ClipboardHelper.copyString("%url%");';

      break;
    }
  }

  if (!command) {
    return;
  }

  command = command.replace('%url%', url);

  aNode.setAttribute('oncommand', command);

  // @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
  aNode.setAttribute('onclick', 'checkForMiddleClick(this,event);');
}

/**
 * Entry point.
 */
RedirectParser_init();


})(this);
