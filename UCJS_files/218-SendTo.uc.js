// ==UserScript==
// @name SendTo.uc.js
// @description Opens (page, link, image, selected text) with the web service.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the main context menu.


(function() {


"use strict";


// Preferences.

/**
 * List of user preset.
 * @key disabled {boolean} [option]
 * @key URL
 *   {URL string}
 *     alias %...% is available. (e.g. %ESC% or %NoScheme|ESC%)
 *     @see kURLAlias
 *   {function(aData)}
 *     @param aData {string}
 * @key types {array of 'PAGE'|'LINK'|'IMAGE'|'TEXT'}
 * @key label {string}
 * @key extensions {string[]} [option]
 * @key command {function(aOption)} [option]
 *   @param aOption {hash}
 *     @key menuitem {element}
 *     @key data {string}
 */
const kServices = [
  {
    // @require WebService.uc.js
    disabled: !ucjsWebService,
    types: ['PAGE'],
    label: 'の はてなブックマーク (-)',

    URL: function(aData) {
      var entryURL = 'http://b.hatena.ne.jp/entry/';
      if (/^https:/.test(aData)) {
        entryURL += 's/';
      }
      return entryURL + '%NoScheme%';
    },

    command: function(aOption) {
      function updateLabel(count, menuitem) {
        if (menuitem) {
          let label = menuitem.getAttribute('label').replace('(-)', '(' + count + ')');
          menuitem.setAttribute('label', label);
        }
      }

      // do not request URL with parameters for security.
      if (/[?#].*$/.test(aOption.data)) {
        updateLabel(U('注意：パラメータ付 URL'), aOption.menuitem);
        return;
      }

      ucjsWebService.get({
        name: 'HatenaBookmarkCount',
        data: aOption.data,
        callback: function(count) {
          if (count !== null) {
            updateLabel(count, aOption.menuitem);
          }
        }
      });
    }
  },
  {
    // (SSL)https://www.aguse.jp/ has a problem with CSS.
    URL: 'http://www.aguse.jp/?m=w&url=%ESC%',
    types: ['LINK'],
    label: 'を aguse で調査'
  },
  {
    URL: 'https://docs.google.com/viewer?url=%ESC%',
    types: ['LINK'],
    // @see https://docs.google.com/support/bin/answer.py?answer=1189935
    extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'pages', 'ai', 'psd', 'tif', 'tiff', 'dxf', 'svg', 'eps', 'ps', 'ttf', 'xps', 'zip', 'rar'],
    label: 'を Google Docs Viewer で表示'
  },
  {
    URL: 'https://www.google.com/searchbyimage?image_url=%ESC%',
    types: ['IMAGE'],
    label: 'を Google Image で検索'
  },
  {
    URL: 'https://www.pixlr.com/editor/?image=%ESC%',
    types: ['LINK', 'IMAGE'],
    extensions: ['bmp', 'gif', 'jpg', 'jpeg', 'png', 'psd', 'pxd'],
    label: 'を Pixlr Editor で編集'
  },
  {
    URL: 'http://dic.search.yahoo.co.jp/search?ei=UTF-8&fr=dic&p=%ESC%',
    types: ['TEXT'],
    label: 'を Yahoo!辞書 で引く'
  }
];

/**
 * Alias for URL of kServices
 * @note applied in this order.
 */
const kURLAlias = {
  'NoScheme': function(aValue) aValue.replace(/^https?:\/\//, ''),
  'NoParameter': function(aValue) aValue.replace(/[?#].*$/, ''),
  'ESC': function(aValue) encodeURIComponent(aValue),
  'RAW': function(aValue) aValue
};

const kString = {
  types: {
    'PAGE': 'ページ',
    'LINK': 'リンク',
    'IMAGE': '画像',
    'TEXT': 'テキスト'
  },

  tooltip: '%DATA%\n\n%URL%'
};

const kID = {
  startSeparator: 'ucjs_sendTo_start_sep',
  endSeparator: 'ucjs_sendTo_end_sep'
};


// Functions.

function initMenu() {
  var contextMenu = getContextMenu();
  var refItem = contextMenu.firstChild;

  // @note ucjsUI_manageContextMenuSeparators() manages the visibility of separators.
  contextMenu.insertBefore($E('menuseparator'), refItem).id = kID.startSeparator;
  contextMenu.insertBefore($E('menuseparator'), refItem).id = kID.endSeparator;

  addEvent([contextMenu, 'popupshowing', onPopupShowing, false]);
}

function onPopupShowing(aEvent) {
  var contextMenu = aEvent.target;
  if (getContextMenu() !== contextMenu)
    return;

  var sSep = $ID(kID.startSeparator), eSep = $ID(kID.endSeparator);

  for (let item; (item = sSep.nextSibling) !== eSep; /**/) {
    contextMenu.removeChild(item);
  }

  getAvailableItems().forEach(function(item) {
    contextMenu.insertBefore(item, eSep);
  });
}

function getAvailableItems() {
  var items = [];

  var {onLink, onImage, onTextInput, linkURL, mediaURL} = gContextMenu;
  var pageURL = gBrowser.currentURI.spec;
  var selection = getSelectionAtCursor();
  var onPlainTextLink = selection && !onLink && linkURL;

  kServices.forEach(function(service) {
    var {disabled, types, extensions} = service;
    if (disabled)
      return;

    if (!onLink && !onImage && !onTextInput &&
        types.indexOf('PAGE') > -1 &&
        /^https?:/.test(pageURL)) {
      items.push(makeItem('PAGE', pageURL, service));
    }

    if ((onLink || onPlainTextLink) &&
        types.indexOf('LINK') > -1 &&
        /^https?:/.test(linkURL) &&
        (!extensions || testExtension(extensions, linkURL))) {
      items.push(makeItem('LINK', linkURL, service));
    }

    if (onImage &&
        types.indexOf('IMAGE') > -1 &&
        /^https?:/.test(mediaURL)) {
      items.push(makeItem('IMAGE', mediaURL, service));
    }

    if (selection &&
        types.indexOf('TEXT') > -1) {
      items.push(makeItem('TEXT', selection, service));
    }
  });

  return items;
}

function makeItem(aType, aData, aService) {
  var item = $E('menuitem');

  var label = kString.types[aType] + aService.label;
  item.setAttribute('label', U(label));

  var URL = (typeof aService.URL === 'function') ? aService.URL(aData) : aService.URL;
  URL = URL.replace(/%([\w|]+)%/, function($0, $1) {
    var data = aData;
    var aliases = $1.split('|');
    for (let alias in kURLAlias) {
      if (aliases.indexOf(alias) > -1) {
        data = kURLAlias[alias](data);
      }
    }
    return data;
  });

  var tooltip = kString.tooltip.replace('%URL%', URL).replace('%DATA%', aData);
  item.setAttribute('tooltiptext', tooltip);

  setEvent(URL, item)

  if (aService.command) {
    aService.command({menuitem: item, data: aData});
  }

  return item;
}

function testExtension(aExtensions, aURL) {
  if (!aURL)
    return false;

  var targets = [];
  var re = /[\w\-]+\.([a-z]{2,5})(?=[?#]|$)/ig, match;
  while ((match = re.exec(aURL))) {
    targets.unshift(match[1]);
  }

  // Case: http://www.example.com/path/file1.ext?key=file2.ext
  // Examines file2.ext, and then file1.ext.
  return targets.some(function(a) aExtensions.indexOf(a) > -1);
}


// Utilities.

function $ID(aID) document.getElementById(aID);

function $E(aTag) document.createElement(aTag);

function removeScheme(aURL) aURL.replace(/^https?:\/\//, '');


// Imports.

function getContextMenu()
  ucjsUI.ContentArea.contextMenu;

function setEvent(aURL, aMenuitem) {
  aMenuitem.setAttribute(
    'onclick',
    'if(event.button===2)return;' +
    'if(event.button===1)closeMenus(event.target);' +
    'ucjsUtil.openTab("' + aURL + '",{inBackground:event.button===1,relatedToCurrent:true});'
  );
}

function U(aStr)
  ucjsUtil.convertForSystem(aStr);

function getSelectionAtCursor()
  ucjsUtil.getSelectionAtCursor();

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function log(aMsg)
  ucjsUtil.logMessage('SendTo.uc.js', aMsg);


// Entry point.

function SendTo_init() {
  initMenu();
}

SendTo_init();


})();
