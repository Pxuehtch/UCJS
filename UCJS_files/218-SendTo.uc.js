// ==UserScript==
// @name SendTo.uc.js
// @description Opens (page, link, image, selected text) with a web service.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @require [optional for preset] WebService.uc.js

// @usage Some menuitems are appended in the main context menu.


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
  BrowserUtils,
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
 * UI settings.
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
     * %data%: The data being passed to a web service.
     * %url%: The URL that is opened actually.
     */
    tooltip: '%data%\n\n%url%'
  },

  startSeparator: {
    id: 'ucjs_SendTo_startSeparator'
  },

  endSeparator: {
    id: 'ucjs_SendTo_endSeparator'
  }
};

/**
 * Preset list.
 *
 * @key label {string}
 *   A display name for menuitem.
 *   @note A specifier %type% is replaced with |kUI.item.types|.
 * @key types {string[]}
 *   Kind of type - Passed data - Case of showing the menuitem.
 *   'PAGE' - Page URL - not on the following cases.
 *   'LINK' - Link URL - on a link.
 *   'IMAGE' - Image URL - on an image.
 *   'TEXT' - Selected text - on a selection.
 *   @see |kUI.item.types|
 *
 * @key url {string}
 *   A URL string of a web service with data.
 *   @note Specify alias for the passed data.
 *   @see |AliasFixup|
 * @key url {function} [optional for custom formatting]
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
    label: '%type%の はてなブックマーク (-)',

    url(aData) {
      let entryURL = 'http://b.hatena.ne.jp/entry/';

      if (/^https:/.test(aData)) {
        entryURL += 's/';
      }

      return entryURL + '%schemeless%';
    },

    command(aParams) {
      let {menuitem, data} = aParams;

      function updateLabel(text) {
        if (menuitem) {
          // @note We can't touch the 'label' property since |command| is
          // called before |menuitem| is appended to the DOM tree.
          let label = menuitem.getAttribute('label');

          $E(menuitem, {
            label: label.replace('(-)', '(' + text + ')')
          });
        }
      }

      // Do not request a URL with parameters for security.
      if (/[?#].*$/.test(data)) {
        updateLabel('注意：パラメータ付 URL');

        return;
      }

      window.ucjsWebService.get({
        name: 'HatenaBookmarkCounter',
        data,
        onLoad(aResponseText) {
          updateLabel(aResponseText);
        },
        onError() {
          updateLabel('Error');
        }
      });
    }
  },
  {
    url: 'https://www.aguse.jp/?m=w&url=%enc%',
    types: ['LINK'],
    label: '%type%を aguse で調査'
  },
  {
    url: 'https://docs.google.com/viewer?url=%enc%',
    types: ['LINK'],
    // @see https://support.google.com/drive/answer/37603
    extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'],
    label: '%type%を Google Docs Viewer で表示'
  },
  {
    url: 'https://www.google.com/searchbyimage?image_url=%enc%',
    types: ['IMAGE'],
    label: '%type%を Google Image で検索'
  },
  {
    url: 'https://www.pixlr.com/editor/?image=%enc%',
    types: ['LINK', 'IMAGE'],
    extensions: ['bmp', 'gif', 'jpg', 'jpeg', 'png', 'psd', 'pxd'],
    label: '%type%を Pixlr Editor で編集'
  },
  {
    url: 'http://dic.search.yahoo.co.jp/search?ei=UTF-8&fr=dic&p=%enc%',
    types: ['TEXT'],
    label: '%type%を Yahoo!辞書 で検索'
  }
];

/**
 * Handler of fixing up an alias with the data.
 *
 * @return {hash}
 *   @key create {function}
 *
 * [alias]
 * %raw% : The data itself.
 * %enc% : With URI encoded.
 * %schemeless%, %sl% : Without the URL scheme.
 * %paramless%, %pl% : Without the URL parameter.
 *
 * @note Aliases can be combined by '|'.
 * e.g. %schemeless|enc% : A data, which is trimmed the scheme and then URI
 * encoded (the multiple aliases is applied in the order of settings).
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
      case 'schemeless':
      case 'sl':
        return aData.replace(/^https?:\/\//, '');

      case 'paramless':
      case 'pl':
        return aData.replace(/[?#].*$/, '');

      case 'enc':
        return encodeURIComponent(aData);

      case 'raw':
        return aData;
    }

    return '';
  }

  return {
    create
  };
})();

function SendTo_init() {
  contentAreaContextMenu.register({
    events: [
      ['popupshowing', onPopupShowing],
      ['popuphiding', onPopupHiding]
    ],

    onCreate: createMenu
  });
}

function createMenu(aContextMenu) {
  // TODO: Make the insertion position of items fixed for useful access.
  // WORKAROUND: Inserts to the position following the combined navigation
  // controls at this time.
  let referenceNode = $ID('context-sep-navigation').nextSibling;

  setSeparators(aContextMenu, referenceNode);
}

function onPopupShowing(event) {
  let contextMenu = event.currentTarget;

  if (event.target !== contextMenu) {
    return;
  }

  getAvailableItems().then((items) => {
    // Do nothing if the context menu has been closed.
    if (!contentAreaContextMenu.isOpen()) {
      return;
    }

    let fragment = window.document.createDocumentFragment();

    items.forEach((item) => {
      fragment.appendChild(item);
    });

    let [startSeparator, endSeparator] = getSeparators();

    contextMenu.insertBefore(fragment, endSeparator);

    // Update the visibility of separators because menuitems here are
    // async-appended after the menu popup is shown.
    contentAreaContextMenu.repaintSeparators({
      startSeparator,
      endSeparator
    });
  }).
  catch(Cu.reportError);
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

async function getAvailableItems() {
  // @see chrome://browser/content/nsContextMenu.js
  let {onLink, onImage, onTextInput, linkURL, mediaURL} = window.gContextMenu;
  let pageURL = gBrowser.currentURI.spec;
  let selection = await BrowserUtils.promiseSelectionTextAtContextMenuCursor();
  let onPlainTextLink = selection && !onLink && linkURL;

  let items = [];

  kPreset.forEach((service) => {
    let {disabled, types, extensions} = service;

    if (disabled) {
      return;
    }

    if (!onLink && !onImage && !onTextInput && !selection &&
        types.includes('PAGE') &&
        /^https?:/.test(pageURL)) {
      items.push(makeItem('PAGE', pageURL, service));
    }

    if ((onLink || onPlainTextLink) &&
        types.includes('LINK') &&
        /^https?:/.test(linkURL) &&
        (!extensions || testExtension(extensions, linkURL))) {
      items.push(makeItem('LINK', linkURL, service));
    }

    if (onImage &&
        types.includes('IMAGE') &&
        /^https?:/.test(mediaURL)) {
      items.push(makeItem('IMAGE', mediaURL, service));
    }

    if (selection &&
        types.includes('TEXT')) {
      items.push(makeItem('TEXT', selection, service));
    }
  });

  return items;
}

function makeItem(aType, aData, aService) {
  let url;

  if (typeof aService.url === 'function') {
    url = aService.url(aData);
  }
  else {
    url = aService.url;
  }

  url = AliasFixup.create(url, aData);

  let label = aService.label.
    replace('%type%', kUI.item.types[aType]);

  let tooltiptext = kUI.item.tooltip.
    replace('%url%', url).
    replace('%data%', aData);

  let item = $E('menuitem', {
    label,
    tooltiptext,
    open: url
  });

  if (aService.command) {
    aService.command({
      menuitem: item,
      data: aData
    });
  }

  return item;
}

function testExtension(aExtensions, aURL) {
  if (!aURL) {
    return false;
  }

  /**
   * RegExp pattern for testing file extensions.
   *
   * [Example]
   * http://www.example.com/path/file.ext0?query1=file.ext1&query2=file.ext2
   * is tested in order of: firstly 'file.ext2' then 'file.ext1' is ignored and
   * 'file.ext0'.
   *
   * @note Must specify the global flag 'g'.
   */
  const kExtensionRE = /[\w-]+\.([a-z]{2,5})(?=[?#]|$)/ig;

  let targets = [];
  let match;

  while ((match = kExtensionRE.exec(aURL))) {
    targets.unshift(match[1]);
  }

  return targets.some((item) => aExtensions.includes(item));
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
 * command: Open a tab.
 * <Ctrl> / <MiddleClick>: Open a tab in background.
 *
 * @require Util.uc.js
 */
function setAttributeForCommand(aNode, aURL) {
  let command =
    'ucjsUtil.TabUtils.openTab("%url%",' +
    '{inBackground:event.ctrlKey||event.button===1,relatedToCurrent:true});';

  command = command.replace('%url%', aURL);

  aNode.setAttribute('oncommand', command);

  // @see chrome://browser/content/utilityOverlay.js::checkForMiddleClick
  aNode.setAttribute('onclick', 'checkForMiddleClick(this,event);');
}

/**
 * Entry point.
 */
SendTo_init();


})(this);
