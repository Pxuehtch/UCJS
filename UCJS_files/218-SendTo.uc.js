// ==UserScript==
// @name SendTo.uc.js
// @description Opens (page, link, image, selected text) with a web service.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @require [optional for preset] WebService.uc.js

// @usage Creates items in the main context menu.


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getNodeById: $ID,
  getSelectionAtCursor
} = window.ucjsUtil;

function $E(aTagOrNode, aAttribute) {
  return window.ucjsUtil.createNode(aTagOrNode, aAttribute, handleAttribute);
}

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('SendTo.uc.js', aMsg);
}

const {
  ContentArea: {
    contextMenu: contentAreaContextMenu
  }
} = window.ucjsUI;

/**
 * UI settings
 */
const kUI = {
  item: {
    /**
     * Types for the label text.
     *
     * @see |kPreset.types|
     */
    types: {
      'PAGE': 'ページ',
      'LINK': 'リンク',
      'IMAGE': '画像',
      'TEXT': 'テキスト'
    },

    /**
     * Format for a tooltip text.
     *
     * %DATA%: The data being passed to a web service.
     * %URL%: The URL that is opened actually.
     */
    tooltip: '%DATA%\n\n%URL%'
  },

  startSeparator: {
    id: 'ucjs_SendTo_startSeparator'
  },

  endSeparator: {
    id: 'ucjs_SendTo_endSeparator'
  }
};

/**
 * Preset list
 *
 * @key label {string}
 *   A display name for menuitem.
 *   @note A specifier %TYPE% is replaced with |kUI.item.types|.
 * @key types {string[]}
 *   Kind of type - Passed data - Case of showing the menuitem.
 *   'PAGE' - Page URL - not on the following cases.
 *   'LINK' - Link URL - on a link.
 *   'IMAGE' - Image URL - on an image.
 *   'TEXT' - Selected text - on a selection.
 *   @see |kUI.item.types|
 *
 * @key URL {string}
 *   A URL string of a web service with data.
 *   @note Specify alias for the passed data.
 *   @see |AliasFixup|
 * @key URL {function} [optional for custom formatting]
 *   @param aData {string}
 *   @return {string}
 *
 * @key extensions {string[]} [optional]
 *   Specify the file extensions for 'LINK' type.
 * @key command {function} [optional]
 *   A command that is executed at showing the menuitem.
 *   @param aParams {hash}
 *     @key menuitem {Element}
 *     @key data {string}
 *
 * @key disabled {boolean} [optional]
 */
const kPreset = [
  {
    // @require WebService.uc.js
    disabled: !window.ucjsWebService,
    types: ['PAGE'],
    label: '%TYPE%の はてなブックマーク (-)',

    URL: function(aData) {
      let entryURL = 'http://b.hatena.ne.jp/entry/';

      if (/^https:/.test(aData)) {
        entryURL += 's/';
      }

      return entryURL + '%SCHEMELESS%';
    },

    command: function(aParams) {
      let {menuitem, data} = aParams;

      function updateLabel(text) {
        if (menuitem) {
          // @note we can't touch the 'label' property since |command| is
          // called before |menuitem| is appended to the DOM tree
          let label = menuitem.getAttribute('label');

          $E(menuitem, {
            label: label.replace('(-)', '(' + text + ')')
          });
        }
      }

      // do not request a URL with parameters for security
      if (/[?#].*$/.test(data)) {
        updateLabel('注意：パラメータ付 URL');
        return;
      }

      window.ucjsWebService.get({
        name: 'HatenaBookmarkCounter',
        data: data,
        onLoad: function(aResponseText) {
          updateLabel(aResponseText);
        },
        onError: function() {
          updateLabel('error');
        }
      });
    }
  },
  {
    URL: 'http://www.aguse.jp/?m=w&url=%ENC%',
    types: ['LINK'],
    label: '%TYPE%を aguse で調査'
  },
  {
    URL: 'https://docs.google.com/viewer?url=%ENC%',
    types: ['LINK'],
    // @see https://support.google.com/drive/answer/2423485
    extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'],
    label: '%TYPE%を Google Docs Viewer で表示'
  },
  {
    URL: 'https://www.google.com/searchbyimage?image_url=%ENC%',
    types: ['IMAGE'],
    label: '%TYPE%を Google Image で検索'
  },
  {
    URL: 'https://www.pixlr.com/editor/?image=%ENC%',
    types: ['LINK', 'IMAGE'],
    extensions: ['bmp', 'gif', 'jpg', 'jpeg', 'png', 'psd', 'pxd'],
    label: '%TYPE%を Pixlr Editor で編集'
  },
  {
    URL: 'http://dic.search.yahoo.co.jp/search?ei=UTF-8&fr=dic&p=%ENC%',
    types: ['TEXT'],
    label: '%TYPE%を Yahoo!辞書 で引く'
  }
];

/**
 * Handler of fixing up an alias with the data
 *
 * @return {hash}
 *   @key create {function}
 *
 * [aliases]
 * %RAW% : data itself
 * %ENC% : with URI encoded
 * %SCHEMELESS%, %sl% : without the URL scheme
 * %PARAMLESS%, %pl% : without the URL parameter
 *
 * @note aliases can be combined by '|';
 * e.g. %SCHEMELESS|ENC% : a data that is trimmed the scheme and then URI
 * encoded (the multiple aliases is applied in the order of settings)
 */
const AliasFixup = (function() {
  const kAliasSplitter = '|';
  const kAliasPattern = RegExp('%([a-z_' + kAliasSplitter + ']+)%', 'ig');

  function create(aText, aData) {
    return aText.replace(kAliasPattern, (match, alias) => {
      let data = aData;

      alias.split(kAliasSplitter).forEach((modifier) => {
        data = fixupModifier(data, modifier);
      });

      return data;
    });
  }

  function fixupModifier(aData, aModifier) {
    switch (aModifier) {
      case 'SCHEMELESS':
      case 'sl':
        return aData.replace(/^https?:\/\//, '');

      case 'PARAMLESS':
      case 'pl':
        return aData.replace(/[?#].*$/, '');

      case 'ENC':
        return encodeURIComponent(aData);

      case 'RAW':
        return aData;
    }

    return '';
  }

  return {
    create: create
  };
})();

function SendTo_init() {
  contentAreaContextMenu.register({
    events: [
      ['popupshowing', onPopupShowing, false]
    ],

    onCreate: createMenu
  });
}

function createMenu(aContextMenu) {
  setSeparators(aContextMenu, aContextMenu.firstChild);
}

function onPopupShowing(aEvent) {
  aEvent.stopPropagation();

  let menupopup = aEvent.target;
  let contextMenu = aEvent.currentTarget;

  if (menupopup !== contextMenu) {
    return;
  }

  let [sSep, eSep] = getSeparators();

  // Remove existing items.
  for (let item; (item = sSep.nextSibling) !== eSep; /**/) {
    contextMenu.removeChild(item);
  }

  let fragment = window.document.createDocumentFragment();

  getAvailableItems().forEach((item) => {
    fragment.appendChild(item);
  });

  contextMenu.insertBefore(fragment, eSep);
}

function getAvailableItems() {
  let items = [];

  // @see chrome://browser/content/nsContextMenu.js
  let {onLink, onImage, onTextInput, linkURL, mediaURL} =
    window.gContextMenu;
  let pageURL = gBrowser.currentURI.spec;
  let selection = getSelectionAtCursor();
  let onPlainTextLink = selection && !onLink && linkURL;

  kPreset.forEach((service) => {
    let {disabled, types, extensions} = service;

    if (disabled) {
      return;
    }

    if (!onLink && !onImage && !onTextInput && !selection &&
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
  let URL;

  if (typeof aService.URL === 'function') {
    URL = aService.URL(aData);
  }
  else {
    URL = aService.URL;
  }

  URL = AliasFixup.create(URL, aData);

  let label = aService.label.
    replace('%TYPE%', kUI.item.types[aType]);

  let tooltip = kUI.item.tooltip.
    replace('%URL%', URL).
    replace('%DATA%', aData);

  let item = $E('menuitem', {
    label: label,
    tooltiptext: tooltip,
    open: URL
  });

  if (aService.command) {
    aService.command({menuitem: item, data: aData});
  }

  return item;
}

function testExtension(aExtensions, aURL) {
  if (!aURL) {
    return false;
  }

  let targets = [];
  let pattern = /[\w\-]+\.([a-z]{2,5})(?=[?#]|$)/ig, match;

  while ((match = pattern.exec(aURL))) {
    targets.unshift(match[1]);
  }

  // Case: http://www.example.com/path/file1.ext?key=file2.ext
  // Examines file2.ext, and then file1.ext
  return targets.some((item) => aExtensions.indexOf(item) > -1);
}

function setSeparators(aContextMenu, aReferenceNode = null) {
  [
    kUI.startSeparator,
    kUI.endSeparator
  ].
  forEach((aSeparatorName) => {
    aContextMenu.insertBefore($E('menuseparator', {
      id: aSeparatorName.id
    }), aReferenceNode);
  });
}

function getSeparators() {
  return [
    $ID(kUI.startSeparator.id),
    $ID(kUI.endSeparator.id)
  ];
}

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
 * command: Open a tab.
 * ctrl / middle-click: Open a tab in background.
 *
 * @require Util.uc.js
 */
function setAttributeForCommand(aNode, aURL) {
  let command =
    'ucjsUtil.openTab("%URL%",' +
    '{inBackground:event.ctrlKey||event.button===1,relatedToCurrent:true});';

  command = command.replace('%URL%', aURL);

  aNode.setAttribute('oncommand', command);

  // @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
  aNode.setAttribute('onclick', 'checkForMiddleClick(this,event);');
}

/**
 * Entry point
 */
SendTo_init();


})(this);
