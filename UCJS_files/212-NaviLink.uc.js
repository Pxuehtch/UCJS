// ==UserScript==
// @name NaviLink.uc.js
// @description Detects the links for navigations.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage Creates items in the URLbar context menu.

// @note The last computed data is cached and used until the context menu opens
// in another URL for performance. So the data may become incorrect when the
// document is modified in the same URL.

// @note This script scans only the top content document, does not traverse
// frames.

// @note Some functions are exposed (window.ucjsNaviLink.XXX).


const ucjsNaviLink = (function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  getNodeById: $ID,
  getNodesBySelector: $S,
  getFirstNodeByXPath: $X1,
  openURL,
  unescapeURLCharacters: unescURLChars,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

function $E(aTagOrNode, aAttribute) {
  return window.ucjsUtil.createNode(aTagOrNode, aAttribute, handleAttribute);
}

const {
  URLBar: {
    contextMenu: URLBarContextMenu
  }
} = window.ucjsUI;

/**
 * User presets.
 *
 * @key name {string}
 *   A display name in the UI item.
 * @key URL {RegExp}
 *   A URL of a page that has the navigations.
 *
 * @key prev {XPath}
 *   A navigation element for the previous page.
 * @key next {XPath}
 *   A navigation element for the next page.
 *   @note Command actions:
 *   - Opens the URL for an element which has 'href' attribute.
 *   - Submits with the form for an <input> element.
 */
const kPresetNavi = [
  {
    name: 'Google Search',
    URL: /^https?:\/\/www\.google\.(?:com|co\.jp)\/(?:#|search|webhp).+/,
    prev: 'id("nav")//td[1]/a | id("nf")/parent::a',
    next: 'id("nav")//td[last()]/a | id("nn")/parent::a'
  },
  {
    name: 'DuckDuckGo Search',
    URL: /^https?:\/\/duckduckgo.com\/(?:html|lite)/,
    prev: './/input[@class="navbutton" and @value[contains(.,"Prev")]]',
    next: './/input[@class="navbutton" and @value[contains(.,"Next")]]'
  }
  //,
];

/**
 * Types of the link navigations.
 *
 * @key type {string}
 *   The value of 'rel' attribute of an element that has 'href' attribute (e.g.
 *   <link>, <a>).
 * @key synonym {string} [optional]
 *   The synonymous value that is converted to |type|.
 *   @note The values can be combined with '|'.
 * @key label {string} [optional]
 *   A displayed string.
 *   @note A capitalized text of |type| will be displayed if |label| is empty.
 *
 * @note Displayed in the declared order.
 */
const kNaviLinkType = [
  {
    type: 'top',
    synonym: 'home|origin'
    //,label: 'トップページ'
  },
  {
    type: 'up',
    synonym: 'parent'
    //,label: '親ページ'
  },
  {
    type: 'first',
    synonym: 'begin|start'
    //,label: '最初のページ'
  },
  {
    type: 'prev',
    synonym: 'previous'
    //,label: '前のページ'
  },
  {
    type: 'next',
    synonym: 'child'
    //,label: '次のページ'
  },
  {
    type: 'last',
    synonym: 'end'
    //,label: '最後のページ'
  },
  {
    type: 'contents',
    synonym: 'toc'
  },
  {
    type: 'index'
  },
  {
    type: 'chapter'
  },
  {
    type: 'section'
  },
  {
    type: 'subsection'
  },
  {
    type: 'appendix'
  },
  {
    type: 'bookmark'
  },
  {
    type: 'glossary'
  },
  {
    type: 'help'
  },
  {
    type: 'search'
  },
  {
    type: 'author',
    synonym: 'made'
  },
  {
    type: 'copyright'
  },
  {
    type: 'alternate'
  }
];

/**
 * Types of the page information.
 *
 * @key type {string}
 * @key label {string} [optional]
 *   A displayed string.
 *   @note A capitalized text of |type| will be displayed if |label| is empty.
 *
 * @note Displayed in the declared order.
 */
const kPageInfoType = [
  {
    type: 'meta'
    //,label: 'メタ情報'
  },
  {
    type: 'feed'
    //,label: 'フィード'
  },
  {
    type: 'stylesheet'
    //,label: 'スタイルシート'
  },
  {
    type: 'script'
    //,label: 'スクリプト'
  },
  {
    type: 'favicon'
    //,label: 'ファビコン'
  }
];

/**
 * Types of the prev/next navigation.
 *
 * @note The values is displayed.
 */
const kSiblingScanType = {
  preset:    'プリセット',
  official:  '公式',
  searching: '推測(リンク)',
  numbering: '推測(URL)'
};

/**
 * UI settings.
 *
 * @note %alias% is formatted by |MenuUI::F()|.
 */
const kUI = {
  upper: {
    id: 'ucjs_NaviLink_upper',
    label: '上の階層'
  },

  prev: {
    id: 'ucjs_NaviLink_prev',
    label: '前ページ - %scanType%'
  },

  next: {
    id: 'ucjs_NaviLink_next',
    label: '次ページ - %scanType%'
  },

  naviLink: {
    id: 'ucjs_NaviLink_naviLink',
    label: 'Navi Link'
  },

  pageInfo: {
    id: 'ucjs_NaviLink_pageInfo',
    label: 'Page Info'
  },

  startSeparator: {
    id: 'ucjs_NaviLink_startSeparator'
  },

  endSeparator: {
    id: 'ucjs_NaviLink_endSeparator'
  },

  items: {
    // Items of |SiblingNavi|.
    preset: '[%name%] %title%',
    official: '%title%',
    searching: '%title% (%score%)',
    numbering: '%here% -> %there%',
    // Submit mode warning.
    submit: '<submit mode>',

    // Items of |NaviLink| / |PageInfo|.
    type: ['%title%', '%title% (%count%)'],
    data: ['%title%', '%title% [%attributes%]'],
    meta: '%name%: %content%',
    // Item numbers limitation warning.
    tooManyItems: '項目が多いので表示を制限'
  }
};

/**
 * Key names for storing data.
 */
const kDataKey = {
  // Extended property name of a menuitem.
  commandData: 'ucjs_NaviLink_commandData'
};

/**
 * Handler of the menu UI settings.
 */
const MenuUI = (function() {
  function init() {
    URLBarContextMenu.register({
      events: [
        ['click', onClick, false],
        ['command', onCommand, false],
        ['popupshowing', onPopupShowing, false],
        ['popuphiding', onPopupHiding, false]
      ],

      onCreate: createMenu
    });
  }

  function createMenu(aContextMenu) {
    setSeparators(aContextMenu);
  }

  function onClick(aEvent) {
    let item = aEvent.target;

    let data = item[kDataKey.commandData];

    if (!data) {
      return;
    }

    if (aEvent.button === 1) {
      // @see chrome://browser/content/utilityOverlay.js::closeMenus
      window.closeMenus(item);
      onCommand(aEvent);
    }
  }

  function onCommand(aEvent) {
    let item = aEvent.target;

    let data = item[kDataKey.commandData];

    if (!data) {
      return;
    }

    /**
     * command: Load in current tab.
     * <Ctrl> / <MiddleClick>: Open a new tab.
     * <Ctrl+Shift> / <Shift+MiddleClick>: Open a new tab in background.
     */
    let {ctrlKey, shiftKey, button} = aEvent;
    let [inTab, inBackground] = [ctrlKey || button === 1,  shiftKey];

    if (data.open) {
      if (!/^(?:https?|ftp|file):/.test(data.open)) {
        warn('Invalid scheme to open:\n' + data.open);

        return;
      }

      openURL(data.open, {
        inTab,
        inBackground,
        relatedToCurrent: true
      });
    }
    else if (data.submit) {
      let submit = (aDocument) => {
        try {
          aDocument.forms[data.submit].submit();
        }
        catch (ex) {
          warn('Error for the <form> element:\n' + ex);
        }
      };

      if (inTab) {
        // TODO: A document sometimes cannot be duplicated with the same
        // content.
        // @note I have tested only 'DuckDuckGo'.
        let newTab = gBrowser.duplicateTab(gBrowser.selectedTab);

        if (!inBackground) {
          gBrowser.selectedTab = newTab;
        }

        let browser = gBrowser.getBrowserForTab(newTab);

        if (browser.contentDocument.readyState === 'complete') {
          submit(browser.contentDocument);
        }
        else {
          browser.addEventListener('load', function onLoad(event) {
            if (event.target === browser.contentDocument) {
              browser.removeEventListener('load', onLoad, true);

              submit(browser.contentDocument);
            }
          }, true);
        }
      }
      else {
        submit(gBrowser.contentDocument);
      }
    }
  }

  function onPopupShowing(aEvent) {
    let contextMenu = aEvent.currentTarget;

    if (aEvent.target !== contextMenu) {
      return;
    }

    Promise.all([
      promiseUpperNavi(),
      promiseSiblingNavi('prev'),
      promiseSiblingNavi('next'),
      promiseNaviLink(),
      promisePageInfo()
    ]).
    catch(Cu.reportError);
  }

  function onPopupHiding(aEvent) {
    let contextMenu = aEvent.currentTarget;

    if (aEvent.target !== contextMenu) {
      return;
    }

    let [sSep, eSep] = getSeparators();

    // Remove existing items.
    for (let item; (item = sSep.nextSibling) !== eSep; /**/) {
      contextMenu.removeChild(item);
    }
  }

  /**
   * Create a promise object for building menu items asynchronously.
   */
  function createPromiseBuild(aPlaceholder, aBuilder) {
    let contextMenu = URLBarContextMenu.get();
    let [, eSep] = getSeparators();

    contextMenu.insertBefore(aPlaceholder, eSep);

    return new Promise(() => {
      if (contextMenu.state !== 'showing' && contextMenu.state !== 'open') {
        return;
      }

      let item = aBuilder();

      if (item) {
        contextMenu.replaceChild(item, aPlaceholder);
      }
    });
  }

  /**
   * UpperNavi builder.
   */
  function promiseUpperNavi() {
    let placeholder = $E('menu', {
      id: kUI.upper.id,
      label: kUI.upper.label,
      disabled: true
    });

    return createPromiseBuild(placeholder, buildUpperNavi);
  }

  function buildUpperNavi() {
    let URLList = UpperNavi.getList();

    if (!URLList) {
      return null;
    }

    let popup = $E('menupopup');

    URLList.forEach((URL) => {
      popup.appendChild($E('menuitem', {
        crop: 'start',
        label: URL,
        'open': URL
      }));
    });

    let menu = $E('menu', {
      id: kUI.upper.id,
      label: kUI.upper.label
    });

    menu.appendChild(popup);

    return menu;
  }

  /**
   * SiblingNavi builder.
   */
  function promiseSiblingNavi(aDirection) {
    let placeholder = $E('menuitem', {
      id: kUI[aDirection].id,
      hidden: true
    });

    return createPromiseBuild(placeholder, () => buildSiblingNavi(aDirection));
  }

  function buildSiblingNavi(aDirection) {
    let result = SiblingNavi.getResult(aDirection);

    if (!result) {
      return null;
    }

    let {list, scanType} = result;

    let node;

    if (list.length === 1) {
      let data = list[0];
      let tooltiptext = formatTooltip(
        formatText(data, {
          siblingScanType: scanType
        }),
        data.URL || kUI.items.submit
      );

      node = $E('menuitem', {
        tooltiptext,
        'open': data.URL,
        'submit': data.formIndex
      });
    }
    else {
      let popup = $E('menupopup');

      list.forEach((data) => {
        let text = formatText(data, {
          siblingScanType: scanType
        });

        let URL = data.URL;

        popup.appendChild($E('menuitem', {
          label: text,
          tooltiptext: formatTooltip(text, URL),
          'open': URL
        }));
      });

      node = $E('menu');
      node.appendChild(popup);
    }

    $E(node, {
      id: kUI[aDirection].id,
      label: F(kUI[aDirection].label, {
        scanType: kSiblingScanType[scanType]
      })
    });

    return node;
  }

  /**
   * NaviLink builder.
   */
  function promiseNaviLink() {
    let placeholder = $E('menu', {
      id: kUI.naviLink.id,
      label: kUI.naviLink.label,
      disabled: true
    });

    return createPromiseBuild(placeholder, buildNaviLink);
  }

  function buildNaviLink() {
    let naviList = NaviLink.getNaviList();
    let subNaviList = NaviLink.getSubNaviList();;

    if (!naviList && !subNaviList) {
      return null;
    }

    let popup = $E('menupopup');

    [naviList, subNaviList].forEach((result) => {
      if (!result) {
        return;
      }

      if (popup.hasChildNodes()) {
        popup.appendChild($E('menuseparator'));
      }

      result.forEach(({type, list, trimmed}) => {
        let child;
        let tooltiptext;

        if (list.length === 1) {
          let data = list[0];
          let URL = data.URL;

          child = $E('menuitem', {
            'open': URL
          });

          tooltiptext = URL;
        }
        else {
          let childPopup = $E('menupopup');

          list.forEach((data) => {
            let [text, URL] = [formatText(data), data.URL];

            childPopup.appendChild($E('menuitem', {
              crop: 'center',
              label: text,
              tooltiptext: formatTooltip(text, URL),
              'open': URL
            }));
          });

          child = $E('menu');
          child.appendChild(childPopup);

          if (trimmed) {
            tooltiptext = kUI.items.tooManyItems;
          }
        }

        let label = F(kUI.items.type, {
          title: getLabelForType(kNaviLinkType, type),
          count: (list.length > 1) ? list.length : null
        });

        if (tooltiptext) {
          tooltiptext = formatTooltip(label, tooltiptext);
        }

        popup.appendChild($E(child, {
          label,
          tooltiptext
        }));
      });
    });

    let menu = $E('menu', {
      id: kUI.naviLink.id,
      label: kUI.naviLink.label
    });

    menu.appendChild(popup);

    return menu;
  }

  /**
   * PageInfo builder.
   */
  function promisePageInfo() {
    let placeholder = $E('menu', {
      id: kUI.pageInfo.id,
      label: kUI.pageInfo.label,
      disabled: true
    });

    return createPromiseBuild(placeholder, buildPageInfo);
  }

  function buildPageInfo() {
    let result = NaviLink.getInfoList();

    if (!result) {
      return null;
    }

    let popup = $E('menupopup');

    result.forEach(({type, list, trimmed}) => {
      let childPopup = $E('menupopup');

      if (type === 'meta') {
        // Only shows <meta> information with no command.
        list.forEach((data) => {
          let text = formatText(data, {
            meta: true
          });

          childPopup.appendChild($E('menuitem', {
            closemenu: 'none',
            label: text,
            tooltiptext: text
          }));
        });
      }
      else {
        list.forEach((data) => {
          let [text, URL] = [formatText(data), data.URL];

          childPopup.appendChild($E('menuitem', {
            crop: 'center',
            label: text,
            tooltiptext: formatTooltip(text, URL),
            'open': URL
          }));
        });
      }

      let child = $E('menu');

      child.appendChild(childPopup);

      popup.appendChild($E(child, {
        label: F(kUI.items.type, {
          title: getLabelForType(kPageInfoType, type),
          count: (list.length > 1) ? list.length : null
        }),
        tooltiptext: trimmed ? kUI.items.tooManyItems : null
      }));
    });

    let menu = $E('menu', {
      id: kUI.pageInfo.id,
      label: kUI.pageInfo.label
    });

    menu.appendChild(popup);

    return menu;
  }

  /**
   * String format functions.
   */
  function formatText(aData, aOption = {}) {
    if ('siblingScanType' in aOption) {
      switch (aOption.siblingScanType) {
        case 'preset':
          return F(kUI.items.preset, {
            name: aData.name,
            title: aData.title
          });

        case 'official':
          return F(kUI.items.official, {
            title: aData.title
          });

        case 'searching':
          return F(kUI.items.searching, {
            title: aData.title,
            score: formatScore(aData.score)
          });

        case 'numbering':
          return F(kUI.items.numbering, {
            here: aData.here,
            there: aData.there
          });
      }

      // @note Unreachable here usually.
      return null;
    }

    if (aOption.meta) {
      return F(kUI.items.meta, {
        name: aData.name,
        content: aData.content
      });
    }

    return F(kUI.items.data, {
      title: aData.title,
      attributes: formatAttributes(aData.attributes) || null
    });
  }

  /**
   * Attribute formatter.
   *
   * @param aAttributes {array}
   *   [['name', 'value'], ..., ['rel', ['value', 'value', ...]]]
   *   @see |NaviLink| for detail.
   * @return {string}
   */
  function formatAttributes(aAttributes) {
    const kAttributeFormat = '%name%: %value%',
          kValuesDelimiter = ',',
          kAttributesDelimiter = ' ';

    if (!aAttributes || !aAttributes.length) {
      return '';
    }

    let attributes = [];

    aAttributes.forEach(([name, value]) => {
      if (Array.isArray(value)) {
        value = value.join(kValuesDelimiter);
      }

      if (value) {
        attributes.push(F(kAttributeFormat, {
          name,
          value
        }));
      }
    });

    return attributes.join(kAttributesDelimiter);
  }

  /**
   * Tooltip text formatter.
   *
   * TODO: Fix broken tooltip text. Sometimes text wrapping breaks and the
   * latter text is cut off. It seems to happen when a long text has '-' and
   * '\n'. Other characters may break it.
   */
  function formatTooltip(aText, aURL) {
    if (aText && aText !== getLeaf(aURL)) {
      return aText + '\n' + aURL;
    }

    return aURL;
  }

  function getLabelForType(aTypeList, aType) {
    function capitalize(aText) {
      return aText.substr(0, 1).toUpperCase() + aText.substr(1);
    }

    for (let i = 0, l = aTypeList.length; i < l; i++) {
      let {type, label} = aTypeList[i];

      type = type.toLowerCase();

      if (type === aType) {
        return label || capitalize(type);
      }
    }

    return aType;
  }

  /**
   * Alias formatter.
   *
   * @param aFormat {string|string[]}
   *   The string including aliases like %foo%.
   * @param aReplacement {hash}
   *   The key-value items corresponding to the aliases of |aFormat|.
   * @return {string}
   *
   * [Example for aliases]
   * aFormat: 'The number of %foo% is %bar%!'
   * aReplacement: {foo: 'Foo', bar: 3}
   * Returns 'The number of Foo is 3!'
   *
   * @note
   * 1.If |aFormat| doesn't have all alias keys of |aReplacement|, |aFormat|
   * string itself returns without replacing.
   * 2.When an array of strings is passed to |aFormat|, the string that has all
   * alias keys of |aReplacement| is used for replacing. If no matches, the
   * first string returns unreplaced.
   *
   * @see |kUI| for the format strings.
   */
  function F(aFormat, aReplacement) {
    // Filter items that the value is |null| or |undefined|.
    let replacement = {};

    for (let name in aReplacement) {
      let value = aReplacement[name];

      if (value !== null && value !== undefined) {
        replacement['%' + name + '%'] = value;
      }
    }

    if (!Array.isArray(aFormat)) {
      aFormat = [aFormat];
    }

    // Retreive the format that has all alias keys of replacement.
    let format;
    let names = Object.keys(replacement);

    for (let i = 0, l = aFormat.length; i < l; i++) {
      if (names.every((name) => aFormat[i].includes(name))) {
        format = aFormat[i];
        break;
      }
    }

    if (!format) {
      return aFormat[0];
    }

    for (let name in replacement) {
      format = format.replace(name, replacement[name]);
    }

    return format;
  }

  /**
   * Score formatter.
   */
  function formatScore(aScore) {
    return aScore.toFixed(3);
  }

  /**
   * Get/Set the menu separators.
   */
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
   * Expose
   */
  return {
    init
  };
})();

/**
 * Handler of the user preset of the navigation links.
 */
const PresetNavi = (function() {
  let mURL;
  let mData;

  function init(aDirection) {
    if (aDirection !== 'prev' && aDirection !== 'next') {
      throw Error('aDirection should be "prev" or "next": ' + aDirection);
    }

    let URI = URIUtil.getCurrentURI();

    if (!URI || !isHTMLDocument()) {
      mURL = null;
      mData = null;

      return;
    }

    if (mURL !== URI.spec) {
      mURL = URI.spec;
      mData = {};
    }

    if (!(aDirection in mData)) {
      mData[aDirection] = createData(aDirection, URI);
    }
  }

  /**
   * Gets the preset data for the previous or next page.
   *
   * @param aDirection {string}
   *   'prev' or 'next'.
   * @return {hash|null}
   *   name:
   *   title:
   *   URL or formIndex:
   */
  function getData(aDirection) {
    init(aDirection);

    if (!mData) {
      return null;
    }

    return mData[aDirection];
  }

  function createData(aDirection, aURI) {
    let item;

    let URL = aURI.spec;

    for (let i = 0; i < kPresetNavi.length; i++) {
      if (kPresetNavi[i].URL.test(URL)) {
        item = kPresetNavi[i];
        break;
      }
    }

    if (!item) {
      return null;
    }

    let contentDocument = gBrowser.contentDocument;

    let node = $X1(item[aDirection], contentDocument);

    if (node && node.href) {
      return {
        // <data> for a preset.
        name: item.name,
        title: trim(node.title) || trim(node.textContent) || '',
        URL: node.href
      };
    }

    if (node instanceof HTMLInputElement && node.form && node.value) {
      let index = 0;

      for (let form of contentDocument.forms) {
        if (node.form === form) {
          break;
        }

        index++;
      }

      return {
        // <data> for a submit preset.
        name: item.name,
        title: node.value,
        formIndex: index
      };
    }

    // A preset element not found.
    log([
      'A navigation element is not found.',
      `Preset: ${item.name}`,
      `${aDirection}: '${item[aDirection]}'`
    ]);

    return null;
  }

  /**
   * Expose
   */
  return {
    getData
  };
})();

/**
 * Handler of the official navigation links according to the 'rel' attribute.
 *
 * @note [additional] Makes a list of the page information.
 */
const NaviLink = (function() {
  // The max number of the items of each type.
  const kMaxNumItemsOfType = 20;

  /**
   * Helper handler of RSS feed.
   */
  const FeedUtil = (function() {
    const kFeedType = {
      'application/rss+xml': 'RSS',
      'application/atom+xml': 'ATOM',
      'text/xml': 'XML',
      'application/xml': 'XML',
      'application/rdf+xml': 'XML'
    };

    // @see resource:///modules/Feeds.jsm
    const {Feeds} = Modules.require('/modules/Feeds.jsm');

    function getFeedType(aLink, aIsFeed) {
      let principal = gBrowser.contentDocument.nodePrincipal;

      let feedType = Feeds.isValidFeed(aLink, principal, aIsFeed);

      if (!feedType) {
        return null;
      }

      return kFeedType[feedType] || 'RSS';
    }

    return {
      getFeedType
    };
  })();

  /**
   * Handler of the types of link navigations.
   *
   * @see |kNaviLinkType|
   */
  const NaviLinkTypeFixup = (function() {
    let naviLinkType = {};
    let naviLinkTypeConversion = {};

    kNaviLinkType.forEach(({type, synonym}) => {
      naviLinkType[type] = true;

      if (synonym) {
        synonym.toLowerCase().split('|').forEach((item) => {
          naviLinkTypeConversion[item] = type;
        });
      }
    });

    function registered(aType) {
      let type = naviLinkTypeConversion[aType] || aType;

      if (type in naviLinkType) {
        return type;
      }

      return '';
    }

    function unregistered(aType) {
      let type = naviLinkTypeConversion[aType] || aType;

      if (!(type in naviLinkType)) {
        return type;
      }

      return '';
    }

    return {
      registered,
      unregistered
    };
  })();

  let mURL;
  let mNaviList, mSubNaviList, mInfoList;

  function init() {
    let URI = URIUtil.getCurrentURI();

    if (!URI || !isHTMLDocument()) {
      mURL = null;
      mNaviList = null;
      mSubNaviList = null;
      mInfoList = null;

      return;
    }

    if (mURL !== URI.spec) {
      mURL = URI.spec;
      [mNaviList, mSubNaviList, mInfoList] = createLists();
    }
  }

  /**
   * Retrieves the first data of the list for the type.
   *
   * @param aType {string}
   *   |kNaviLinkType.type| or |kPageInfoType.type|.
   * @return {hash|null}
   *   title:
   *   attributes:
   *   URL:
   *
   *   [For <meta>]
   *   name:
   *   content:
   *
   *   @see |addItem()| for detail.
   */
  function getData(aType) {
    let result = getNaviList();

    if (result) {
      for (let i = 0, l = result.length; i < l; i++) {
        if (result[i].type === aType) {
          return result[i].list[0];
        }
      }
    }

    return null;
  }

  /**
   * Retrieves the list by types.
   *
   * @return {hash[]|null}
   *   type: |kNaviLinkType.type| or |kPageInfoType.type|.
   *   list: {<data>[]}
   *     @see |getData()| for detail.
   *   trimmed: {boolean}
   *     A list has been limited because of too much items if true.
   */
  function getNaviList() {
    init();

    return mNaviList;
  }

  function getSubNaviList() {
    init();

    return mSubNaviList;
  }

  function getInfoList() {
    init();

    return mInfoList;
  }

  function createLists() {
    let naviList = {},
        subNaviList = {},
        infoList = {};

    let contentDocument = gBrowser.contentDocument;

    scanMeta(infoList, contentDocument);
    scanScript(infoList, contentDocument);

    [...$S('[rel][href], [rev][href]', contentDocument)].forEach((node) => {
      let rel = node.rel || node.rev;

      if (!rel ||
          !node.href ||
          !/^(?:https?|mailto):/.test(node.href)) {
        return;
      }

      let rels = makeRels(rel);

      scanInfoLink(infoList, node, rels) ||
      scanNaviLink(naviList, node, rels) ||
      scanSubNaviLink(subNaviList, node, rels);
    });

    return [
      {
        list: naviList,
        orderList: kNaviLinkType
      },
      {
        list: subNaviList
      },
      {
        list: infoList,
        orderList: kPageInfoType
      }
    ].map(formatList);
  }

  function formatList({list, orderList}) {
    let types = Object.keys(list);

    if (!types.length) {
      return null;
    }

    sortByTypeOrder(types, orderList);

    let result = [];

    types.forEach((type) => {
      let resultList = [];
      let trimmed = false;

      list[type].some((data) => {
        if (testUniqueData(resultList, data)) {
          resultList.push(data);

          // Stop scanning the source list.
          if (resultList.length >= kMaxNumItemsOfType) {
            trimmed = true;

            return true;
          }
        }

        return false;
      });

      result.push({
        type,
        list: resultList,
        trimmed
      });
    });

    return result;
  }

  function testUniqueData(aArray, aData) {
    return aArray.every((data) => {
      for (let key in data) {
        // |attributes| is {array}, the others are {string}.
        if (key === 'attributes') {
          if (data[key].join() !== aData[key].join()) {
            return true;
          }
        }
        else if (data[key] !== aData[key]) {
          return true;
        }
      }

      return false;
    });
  }

  function makeRels(aRelAttribute) {
    let rels = aRelAttribute.toLowerCase().split(/\s+/);

    let relsList = {};

    rels.forEach((aValue) => {
      relsList[aValue] = true;
    });

    Object.defineProperty(relsList, 'exceptFor', {
      value(aSourceValue) {
        if (rels.length > 1) {
          return rels.filter((aValue) => aValue !== aSourceValue);
        }

        return [];
      }
    });

    return relsList;
  }

  function scanMeta(aList, aDocument) {
    let metas = [...aDocument.getElementsByTagName('meta')];

    // Add <content-type> to avoid an empty meta list.
    let empty = !metas.some((meta) =>
      meta.httpEquiv &&
      meta.httpEquiv.toLowerCase() === 'content-type'
    );

    if (empty) {
      metas.unshift({
        httpEquiv: 'Content-Type',
        content: aDocument.contentType + ';charset=' + aDocument.characterSet
      });
    }

    metas.forEach((node) => {
      addItem(aList, 'meta', node);
    });
  }

  function scanScript(aList, aDocument) {
    [...aDocument.getElementsByTagName('script')].forEach((node) => {
      addItem(aList, 'script', node);
    });
  }

  function scanInfoLink(aList, aNode, aRels) {
    let type = '';
    let attributes = [];

    if (aRels.feed ||
        (aNode.type && aRels.alternate && !aRels.stylesheet)) {
      let feedType = FeedUtil.getFeedType(aNode, aRels.feed);

      if (feedType) {
        type = 'feed';
        attributes.push(['type', feedType]);
      }
    }
    else if (aRels.stylesheet) {
      type = 'stylesheet';
      attributes.push(['media', aNode.media || 'all']);
    }
    else if (aRels.icon) {
      type = 'favicon';

      if (aNode.type) {
        attributes.push(['type', aNode.type]);
      }
    }

    if (type) {
      addItem(aList, type, aNode, attributes);

      return true;
    }

    return false;
  }

  function scanNaviLink(aList, aNode, aRels) {
    let attributes = [];

    if (aRels.alternate) {
      if (aNode.media) {
        attributes.push(['media', aNode.media]);
      }

      if (aNode.hreflang) {
        attributes.push(['hreflang', aNode.hreflang]);
      }
    }

    let itemNums = 0;

    for (let type in aRels) {
      type = NaviLinkTypeFixup.registered(type);

      if (type) {
        attributes.push(['rel', aRels.exceptFor(type)]);
        addItem(aList, type, aNode, attributes);
        itemNums++;
      }
    }

    return itemNums > 0;
  }

  function scanSubNaviLink(aList, aNode, aRels) {
    for (let type in aRels) {
      type = NaviLinkTypeFixup.unregistered(type);

      if (type) {
        addItem(aList, type, aNode, [['rel', aRels.exceptFor(type)]]);
      }
    }
  }

  function addItem(aList, aType, aNode, aAttributes) {
    let data;

    if (aType === 'meta') {
      data = getMetaData(aNode);
    }
    else {
      data = getNodeData(aNode, aAttributes);
    }

    if (data) {
      if (!(aType in aList)) {
        aList[aType] = [];
      }

      aList[aType].push(data);
    }
  }

  function getMetaData(aNode) {
    let content = trim(aNode.content);

    if (!content) {
      return null;
    }

    let name =
      trim(aNode.name) ||
      trim(aNode.httpEquiv) ||
      trim(aNode.getAttribute('property')) ||
      trim(aNode.getAttribute('itemprop')) ;

    if (name) {
      return {
        // <data> for a meta.
        name,
        content
      };
    }

    return null;
  }

  function getNodeData(aNode, aAttributes) {
    let URL = trim(aNode.href) || trim(aNode.src);

    if (!URL) {
      return null;
    }

    let title =
      trim(aNode.title) ||
      (!/^(?:script|link)$/.test(aNode.localName) &&
       trim(aNode.textContent)) ||
      getLeaf(URL);

    if (title) {
      return {
        // <data> for a script or rel.
        title,
        attributes: aAttributes || [],
        URL
      };
    }

    return null;
  }

  function sortByTypeOrder(aTypes, aOrderList) {
    if (aTypes.length <= 1) {
      return;
    }

    let order;

    if (aOrderList && aOrderList.length) {
      if (aOrderList.length <= 1) {
        return;
      }

      order = aOrderList.map((aItem) => aItem.type.toLowerCase());
    }

    let comparator = order ?
      (a, b) => order.indexOf(a) - order.indexOf(b) :
      (a, b) => a.localeCompare(b);

    aTypes.sort(comparator);
  }

  /**
   * Expose
   */
  return {
    getData,
    getNaviList,
    getSubNaviList,
    getInfoList
  };
})();

/**
 * Handler of links to the sibling(prev/next) page.
 */
const SiblingNavi = (function() {
  // Max number of guessed siblings to display.
  const kMaxNumSiblings = 3;
  // Max number of entries that are scored as the sibling page.
  const kMaxNumScoredEntries = kMaxNumSiblings * 10;
  // Max number of links that are scanned to guess the sibling page.
  const kMaxNumScanningLinks = kMaxNumScoredEntries * 10;

  let mURL;
  let mResult;

  function init(aDirection) {
    if (aDirection !== 'prev' && aDirection !== 'next') {
      throw Error('aDirection should be "prev" or "next": ' + aDirection);
    }

    let URI = URIUtil.getCurrentURI();

    if (!URI) {
      mURL = null;
      mResult = null;

      return;
    }

    if (mURL !== URI.spec) {
      mURL = URI.spec;
      mResult = {};
    }

    if (!(aDirection in mResult)) {
      mResult[aDirection] = createResult(aDirection, URI);
    }
  }

  /**
   * Retrieves the URL string for the direction.
   *
   * @param aDirection {string}
   *   'prev' or 'next'.
   * @return {string}
   */
  function getURLFor(aDirection) {
    let result = getResult(aDirection);

    if (!result) {
      return '';
    }

    return result.list[0].URL;
  }

  /**
   * Gets the information for the previous or next page.
   *
   * @param aDirection {string}
   *   'prev' or 'next'.
   * @return {hash|null}
   *   list: {<data>[]}
   *   scanType: {string}
   *     @see |kSiblingScanType| for detail.
   *
   * <data> has the proper members assigned to |kSiblingScanType|.
   * {name:, title:, URL:} for a |preset|.
   * {name:, title:, formIndex:} for a submit |preset|.
   * {name:, content:} for a meta of |official|.
   * {title:, attributes:, URL:} for a script or rel of |official|.
   * {title:, score:, URL:} for a sibling by |searching|.
   * {here:, there:, URL:} for a sibling by |numbering|.
   */
  function getResult(aDirection) {
    init(aDirection);

    if (!mResult) {
      return null;
    }

    return mResult[aDirection];
  }

  function createResult(aDirection, aURI) {
    let list;
    let scanType;

    [
      ['preset', PresetNavi.getData],
      ['official', NaviLink.getData],
      ['searching', guessBySearching, aURI],
      ['numbering', guessByNumbering, aURI]
    ].
    some(([type, getter, URI]) => {
      let data = getter(aDirection, URI);

      if (data) {
        list = data;
        scanType = type;

        return true;
      }

      return false;
    });

    if (!list) {
      return null;
    }

    return {
      list: Array.isArray(list) ? list : [list],
      scanType
    };
  }

  /**
   * Gets a list of the prev/next page by searching links.
   *
   * @param aDirection {string}
   *   'prev' or 'next'.
   * @return {<data>[]|null}
   * <data> {hash}
   *   title: {string}
   *   score: {number}
   *   URL: {string}
   *
   * @note Allows only URL that has the same as the base domain of the document
   * to avoid jumping to the outside by a |prev|/|next| command.
   */
  function guessBySearching(aDirection, aURI) {
    if (!isHTMLDocument()) {
      return null;
    }

    let URI = URIUtil.createURI(aURI, {
      hash: false
    });

    let naviLinkScorer = NaviLinkScorer.init(URI, aDirection);

    let entries = getSearchEntries();
    let link, href, text, score;

    for (link of getSearchLinks()) {
      href = link.href;

      if (!href ||
          entries.has(href) ||
          !/^https?:/.test(href) ||
          URI.isSamePage(href) ||
          !URI.isSameBaseDomain(href)) {
        continue;
      }

      for (text of getSearchTexts(link)) {
        // Normalize white-spaces.
        text = trim(text);

        score = text && naviLinkScorer.score(text, href);

        if (score) {
          entries.add(text, href, score);

          break;
        }
      }

      if (entries.isFull()) {
        break;
      }
    }

    return entries.collect();
  }

  function getSearchEntries() {
    let entries = [];
    let URLs = [];

    function detach() {
      entries.length = 0;
      URLs.length = 0;
    }

    function add(aText, aURL, aScore) {
      entries[entries.length] = {
        text: aText,
        URL: aURL,
        score: aScore
      };

      // Cache for |has()|.
      URLs[URLs.length] = aURL;
    }

    function has(aURL) {
      return URLs.indexOf(aURL) > -1;
    }

    function isFull() {
      return entries.length >= kMaxNumScoredEntries;
    }

    function collect() {
      if (!entries.length) {
        return null;
      }

      // Sort items in a *descending* of the score.
      entries.sort((a, b) => b.score - a.score);

      let list = entries.map(({text, URL, score}) => {
        return {
          // <data> for a sibling by searching.
          title: text,
          score,
          URL
        };
      });

      detach();

      return trimSiblingsList(list);
    }

    return {
      add,
      has,
      isFull,
      collect
    };
  }

  /**
   * Generator for hyperlinked elements in the current content document.
   *
   * @return {Generator}
   */
  function* getSearchLinks() {
    // <a> or <area> with the 'href' attribute.
    let links = gBrowser.contentDocument.links;
    let count = links.length;

    if (kMaxNumScanningLinks < count) {
      let limit = Math.floor(kMaxNumScanningLinks / 2);

      for (let i = 0; i < limit; i++) {
        yield links[i];
      }

      for (let i = count - limit; i < count; i++) {
        yield links[i];
      }
    }
    else {
      for (let i = 0; i < count; i++) {
        yield links[i];
      }
    }
  }

  /**
   * Generator for all possible texts of a link.
   *
   * @param aNode {Element}
   *   @note Pass a hyperlinked element that |getSearchLinks| generates.
   * @return {Generator}
   */
  function* getSearchTexts(aNode) {
    yield aNode.textContent;
    yield aNode.getAttribute('title');

    let images = aNode.getElementsByTagName('img');
    let image = images.length ? images[0] : null;

    if (image) {
      yield image.getAttribute('alt');
      yield image.getAttribute('title');
      yield getLeaf(image.getAttribute('src'));
    }
  }

  /**
   * Gets a list of the prev/next page by numbering of URL.
   *
   * @param aDirection {string}
   *   'prev' or 'next'.
   * @return {<data>[]|null}
   *   <data> {hash}
   *     here: {string}
   *     there: {string}
   *     URL: {string}
   */
  function guessByNumbering(aDirection, aURI) {
    /**
     * RegExp patterns for string like the page numbers in URL.
     *
     * @note Must specify the global flag 'g'.
     */
    const kNumberRE = [
      // Parameter with a numeric value: [?&]page=123 or [?&]123
      /([?&](?:[a-z_-]{1,20}=)?)(\d{1,12})(?=$|&)/ig,

      // Path ended with numbers: (abc)123 or (abc)123.jpg or (abc)123/
      /(\/[a-z0-9_-]{0,20}?)(\d{1,12})(\.\w+|\/)?(?=$|\?)/ig
    ];

    let URI = URIUtil.createURI(aURI, {
      hash: false
    });

    if (!URI.hasPath()) {
      return null;
    }

    let direction = (aDirection === 'next') ? 1 : -1;
    let list = [];

    kNumberRE.forEach((pattern) => {
      let URL = URI.spec;
      let matches;

      while ((matches = pattern.exec(URL))) {
        let [match, leading , oldNum, trailing] = matches;

        let newNum = parseInt(oldNum, 10) + direction;

        if (newNum > 0) {
          newNum = newNum + '';

          while (newNum.length < oldNum.length) {
            newNum = '0' + newNum;
          }

          let newVal = leading + newNum + (trailing || '');

          list.push({
            // <data> for a sibling by numbering.
            here: match,
            there: newVal,
            URL: URL.replace(match, newVal)
          });
        }
      }
    });

    if (!list.length) {
      return null;
    }

    return trimSiblingsList(list);
  }

  function trimSiblingsList(aList) {
    return aList.slice(0, kMaxNumSiblings);
  }

  /**
   * For the exposed functions.
   */
  function getCurrentPrev() {
    return getURLFor('prev');
  }

  function getCurrentNext() {
    return getURLFor('next');
  }

  /**
   * Expose
   */
  return {
    getResult,
    getPrev: getCurrentPrev,
    getNext: getCurrentNext
  };
})();

/**
 * Evaluator of the navigation-like text and URL.
 */
const NaviLinkScorer = (function() {
  const TextScorer = (function() {
    // &lsaquo;(<):\u2039, &laquo;(<<):\u00ab, ＜:\uff1c, ≪:\u226a,
    // ←:\u2190
    // &rsaquo;(>):\u203a, &raquo;(>>):\u00bb, ＞:\uff1e, ≫:\u226b,
    // →:\u2192
    const kNaviSign = {
      prev: '<|\\u2039|\\u00ab|\\uff1c|\\u226a|\\u2190',
      next: '>|\\u203a|\\u00bb|\\uff1e|\\u226b|\\u2192'
    };

    // 前:\u524D, 古い:\u53e4\u3044
    // 次:\u6b21, 新し:\u65b0\u3057
    const kNaviWord = {
      prev: {
        en: 'prev(?:ious)?|old(?:er)?|back(?:ward)?|less',
        ja: '\\u524d|\\u53e4\\u3044'
      },
      next: {
        en: 'next|new(?:er)?|forward|more',
        ja: '\\u6b21|\\u65b0\\u3057'
      }
    };

    // List of text not navigation-like.
    const kNGTextList = [
      // "response anchor" on BBS.
      /^(?:>|\uff1e){2,}[-\d ]+$/
    ];

    // Score weighting.
    const kScoreWeight = initScoreWeight({
      matchSign: 50,
      matchWord: 50,
      noOppositeWord: 25,
      lessText: 20
    });

    let mNaviSign = null,
        mNaviWord = null;

    function init(aDirection) {
      let sign, word;
      let forward, backward;

      let opposite = (aDirection === 'prev') ? 'next' : 'prev';

      // Set up data for finding a navigation sign.
      // @note The white-spaces of a test text are normalized.
      sign = kNaviSign[aDirection];
      forward = RegExp('^(?:' + sign + ')+|(?:' +  sign + ')+$');

      backward = RegExp(kNaviSign[opposite]);

      mNaviSign = initNaviData(forward, backward);

      // Set up data for finding a text string or an image filename like a
      // navigation.
      // @note The white-spaces of a test text are normalized.
      // @note Allows the short leading words before an english navigation
      // word (e.g. 'Go to next page', 'goto-next-page.png').
      word = kNaviWord[aDirection];

      let en = '(?:^|^[- \\w]{0,10}[-_ ])(?:' + word.en + ')(?:$|[-_. ])';
      let ja = '^(?:' +  word.ja + ')';

      forward = RegExp(en + '|' +  ja, 'i');

      word = kNaviWord[opposite];
      backward = RegExp(word.en + '|' +  word.ja, 'i');

      mNaviWord = initNaviData(forward, backward);
    }

    function initNaviData(aForward, aBackward) {
      function hasOpposite(aText) {
        if (!aText) {
          return false;
        }

        return aBackward.test(aText);
      }

      function match(aText) {
        if (!aText) {
          return null;
        }

        let matches = aForward.exec(aText);

        if (!matches) {
          return null;
        }

        return {
          remainingText: aText.replace(matches[0], '').trim()
        };
      }

      return {
        hasOpposite,
        match
      };
    }

    function score(aText) {
      let point = 0;
      let match;

      // Filter the NG text.
      if (kNGTextList.some((ng) => ng.test(aText))) {
        return 0;
      }

      // Test signs for navigation.
      if (!mNaviSign.hasOpposite(aText)) {
        match = mNaviSign.match(aText);

        if (match) {
          point += kScoreWeight.matchSign;

          aText = match.remainingText;
        }
      }

      // Test words for navigation.
      match = mNaviWord.match(aText);

      if (match) {
        point += kScoreWeight.matchWord;

        aText = match.remainingText;

        if (!mNaviWord.hasOpposite(aText)) {
          point += kScoreWeight.noOppositeWord;
        }
      }

      if (point > 0) {
        // Test the text length.
        if (aText) {
          // The text seems less to be for navigation if more than 10
          // characters remain.
          let rate = (aText.length < 10) ? 1 - (aText.length / 10) : 0;

          point += (kScoreWeight.lessText * rate);
        }
        else {
          // Exact match.
          point += kScoreWeight.lessText;
        }
      }

      return point;
    }

    return {
      init,
      score
    };
  })();

  const URLScorer = (function() {
    const kScoreWeight = initScoreWeight({
      lengthRate: 30,
      intersectionRate: 70
    });

    let mURLData = null;

    function init(aURI) {
      mURLData = initURLData(aURI);
    }

    function initURLData(aOriginalURI) {
      let originalPrePath = aOriginalURI.prePath;
      let originalPath = aOriginalURI.path;

      let originalURL = createData(originalPath);

      function match(aURL) {
        // No path for comparison.
        if (originalPath === '/') {
          return null;
        }

        // @note The target URL might be including the original URL encoded.
        // @note Decode only special characters for URL.
        aURL = unescURLChars(aURL);

        // Search the same pre path as the original in the target URL:
        // - The target pre path equals the original.
        // - The target path has a pre path that equals the original.
        let index = aURL.indexOf(originalPrePath);

        // No information of the original URL.
        if (index < 0) {
          return null;
        }

        let otherPath = aURL.substr(index + originalPrePath.length);

        // No path or no difference for comparison.
        if (!otherPath || otherPath === '/' || otherPath === originalPath) {
          return null;
        }

        return {
          originalURL,
          otherURL: createData(otherPath)
        };
      }

      function createData(aPath) {
        return {
          path: aPath,
          parts: breakApart(aPath)
        };
      }

      function breakApart(aPath) {
        // Make an array of parts for comparison excluding empty values.
        return aPath.split(/[-_./?#&=]/).filter(Boolean);
      }

      return {
        match
      };
    }

    function score(aURL) {
      let URLData = mURLData.match(aURL);

      if (!URLData) {
        return 0;
      }

      let point = 0;

      point += kScoreWeight.lengthRate * getLengthRate(URLData);
      point += kScoreWeight.intersectionRate * getIntersectionRate(URLData);

      return point;
    }

    function getLengthRate({originalURL, otherURL}) {
      let originalLength = originalURL.path.length;
      let otherLength = otherURL.path.length;

      // Be less than (1.0).
      return 1 - (Math.abs(originalLength - otherLength) /
        (originalLength + otherLength));
    }

    function getIntersectionRate({originalURL, otherURL}) {
      let originalParts = originalURL.parts;

      // @note We will destruct the array |otherParts|, but |otherURL.parts| is
      // created only for this function this time so that we don't have to copy
      // the array.
      // let otherParts = otherURL.parts.slice();
      let otherParts = otherURL.parts;

      let originalLength = originalParts.length;

      if (!originalLength || !otherParts.length) {
        return 0;
      }

      let matches = 0;

      for (let i = 0; i < originalLength; i++) {
        let matchIndex = otherParts.indexOf(originalParts[i]);

        if (matchIndex > -1) {
          matches++;

          // Remove the matched item to avoid matching with the same value of
          // another item of the original parts.
          delete otherParts[matchIndex];

          if (!otherParts.length) {
            break;
          }
        }
      }

      // Be less than (1.0).
      return matches / originalLength;
    }

    return {
      init,
      score
    };
  })();

  let mURL;
  let mDirection;

  function init(aURI, aDirection) {
    if (mURL !== aURI.spec) {
      mURL = aURI.spec;
      mDirection = null;

      URLScorer.init(aURI);
    }

    if (mDirection !== aDirection) {
      mDirection = aDirection;

      TextScorer.init(aDirection);
    }

    return {
      score
    };
  }

  function score(aText, aURL) {
    let point = TextScorer.score(aText);

    if (point) {
      point += URLScorer.score(aURL);
    }

    // Integer range:
    // Text score: [0,1]
    // URL score:  [0,1]
    // Text + URL: [0,2]
    return point;
  }

  function initScoreWeight(aWeights) {
    let total = 0;

    for (let key in aWeights) {
      total += aWeights[key];
    }

    for (let key in aWeights) {
      aWeights[key] /= total;
    }

    return aWeights;
  }

  /**
   * Expose
   */
  return {
    init
  };
})();

/**
 * Handler of the links to the upper(top/parent) page.
 */
const UpperNavi = (function() {
  let mURL;
  let mList;

  function init() {
    let URI = URIUtil.getCurrentURI();

    if (!URI) {
      mURL = null;
      mList = null;

      return;
    }

    if (mURL !== URI.spec) {
      mURL = URI.spec;
      mList = createList(URI);
    }
  }

  /**
   * Gets the list of the upper page URLs from parent to top in order.
   *
   * @return {string[]}
   */
  function getList() {
    init();

    return mList;
  }

  function createList(aURI) {
    let URI = URIUtil.createURI(aURI, {
      search: false
    });

    let list = [];

    let parentURL;

    while ((parentURL = getParent(URI))) {
      list.push(parentURL);

      URI = URIUtil.createURI(parentURL);
    }

    if (!list.length) {
      return null;
    }

    return list;
  }

  function getParent(aURI) {
    if (aURI.hasPath()) {
      let path = aURI.path.replace(/\/(?:index\.html?)?$/i, '')
      let segments = path.split('/');

      // Remove the last one.
      segments.pop();

      let URL = aURI.prePath + segments.join('/') + '/';

      if (URL === 'file:///') {
        return '';
      }

      return URL;
    }

    return getUpperHost(aURI);
  }

  function getTop(aURI) {
    if (aURI.scheme === 'file') {
      // Test a drive letter.
      let match = /^(file:\/\/\/[a-z]:\/).+/i.exec(aURI.spec);

      if (!match) {
        return '';
      }

      return match[1];
    }

    if (aURI.hasPath()) {
      return aURI.prePath + '/';
    }

    return getUpperHost(aURI);
  }

  function getUpperHost(aURI) {
    let host = aURI.host;

    if (!host || aURI.baseDomain === host) {
      return '';
    }

    let levels = host.split('.');

    levels.shift();

    return aURI.scheme + '://' + levels.join('.') + '/';
  }

  /**
   * For the exposed functions.
   */
  function getCurrentParent() {
    let URI = URIUtil.getCurrentURI({
      search: false
    });

    if (!URI) {
      return '';
    }

    return getParent(URI);
  }

  function getCurrentTop() {
    let URI = URIUtil.getCurrentURI({
      search: false
    });

    if (!URI) {
      return '';
    }

    return getTop(URI);
  }

  /**
   * Expose
   */
  return {
    getList,
    getParent: getCurrentParent,
    getTop: getCurrentTop
  };
})();

/**
 * Custom URI object handler.
 */
const URIUtil = (function() {
  function getCurrentURI(aOption) {
    let currentURI = gBrowser.currentURI;

    if (!/^(?:https?|ftp|file)$/.test(currentURI.scheme)) {
      return null;
    }

    return createURI(currentURI, aOption);
  }

  function createURI(aURI, aOption = {}) {
    // @note Returns a valid |nsIURI| object since we always pass a valid
    // |aURI| for now.
    let URI = makeNSIURI(aURI);

    let {scheme, prePath, path, spec} = URI;
    let noHashSpec = trimHash(spec);
    let host = getHost(URI);
    let baseDomain = getBaseDomain(prePath, host);

    if (aOption.search === false) {
      path = trimSearch(path);
      spec = trimSearch(spec);
    }
    else if (aOption.hash === false) {
      path = trimHash(path);
      spec = trimHash(spec);
    }

    return {
      scheme,
      host,
      baseDomain,
      prePath,
      path,
      spec,
      hasPath: hasPath.bind(null, path),
      isSamePage: isSamePage.bind(null, noHashSpec),
      isSameBaseDomain: isSameBaseDomain.bind(null, baseDomain)
    };
  }

  /**
   * Binding functions.
   */
  function hasPath(aPath) {
    return aPath !== '/';
  }

  function isSamePage(aNoHashSpec, aTargetURL) {
    if (!aTargetURL) {
      return false;
    }

    return trimHash(aTargetURL) === aNoHashSpec;
  }

  function isSameBaseDomain(aBaseDomain, aTargetURL) {
    if (!aTargetURL) {
      return false;
    }

    return getBaseDomain(aTargetURL) === aBaseDomain;
  }

  /**
   * Helper functions.
   */
  function trimSearch(aURL) {
    return aURL.replace(/[?#].*$/, '');
  }

  function trimHash(aURL) {
    return aURL.replace(/#.*$/, '');
  }

  function makeNSIURI(aURL) {
    if (aURL instanceof Ci.nsIURI) {
      return aURL;
    }

    // Reform our custom URI object.
    // TODO: Test by some reliable method.
    if (aURL.spec) {
      aURL = aURL.spec;
    }

    try {
      return Modules.BrowserUtils.makeURI(aURL);
    }
    catch (ex) {}

    return null;
  }

  function getHost(aURI) {
    if (!aURI || /^file:/.test(aURI.prePath)) {
      return '';
    }

    try {
      return aURI.host;
    }
    catch (ex) {}

    return aURI.prePath.
      match(/^(?:[a-z]+:\/\/)?(?:[^\/]+@)?\[?(.+?)\]?(?::\d+)?$/)[1];
  }

  function getBaseDomain(aURL, aHost) {
    if (!aURL || /^file:/.test(aURL)) {
      return '';
    }

    if (!aHost) {
      aHost = getHost(makeNSIURI(aURL));

      if (!aHost) {
        return '';
      }
    }

    try {
      /**
       * @note |getBaseDomain| returns:
       * - the base domain includes the public suffix. (e.g. '.com', '.co.jp',
       *   '.aisai.aichi.jp', '.github.io')
       *   @see https://wiki.mozilla.org/Public_Suffix_List
       * - a value in ACE format for IDN.
       */
      let baseDomain = Services.eTLD.getBaseDomainFromHost(host);

      const IDNService =
        Modules.$S('@mozilla.org/network/idn-service;1', 'nsIIDNService');

      return IDNService.convertACEtoUTF8(baseDomain);
    }
    catch (ex) {}

    return aHost;
  }

  /**
   * Expose
   */
  return {
    getCurrentURI,
    createURI
  };
})();

/**
 * Utility functions.
 */
function isHTMLDocument() {
  let doc = gBrowser.contentDocument;

  if (doc instanceof HTMLDocument) {
    let mime = doc.contentType;

    return (
      mime === 'text/html' ||
      mime === 'text/xml' ||
      mime === 'application/xml' ||
      mime === 'application/xhtml+xml'
    );
  }

  return false;
}

function getLeaf(aURL) {
  if (!aURL) {
    return '';
  }

  let lastSlash = aURL.replace(/[?#].*$/, '').lastIndexOf('/');

  return aURL.slice(lastSlash + 1) || aURL;
}

function trim(aText) {
  if (!aText) {
    return '';
  }

  return aText.trim().replace(/\s+/g, ' ');
}

/**
 * Callback function for |ucjsUtil.createNode|.
 */
function handleAttribute(aNode, aName, aValue) {
  switch (aName) {
    // Set the value to a property of the node.
    case 'open':
    case 'submit': {
      if (aValue) {
        aNode[kDataKey.commandData] = {};
        aNode[kDataKey.commandData][aName] = aValue;
      }

      return true;
    }
  }

  return false;
}

/**
 * Warning and Log.
 */
function warn(aMessage) {
  const kMaxMessageLength = 200;

  let message = log(aMessage, Components.stack.caller)

  if (message.length > kMaxMessageLength) {
    message = message.substr(0, kMaxMessageLength);
    message += '\n...(Too long and truncated)';
  }

  message += '\n[Logged in the Browser Console]';

  Services.prompt.alert(null, null, message);
}

/**
 * Entry point.
 */
function NaviLink_init() {
  MenuUI.init();
}

NaviLink_init();

/**
 * Expose
 */
return {
  getNext: SiblingNavi.getNext,
  getPrev: SiblingNavi.getPrev,
  getParent: UpperNavi.getParent,
  getTop: UpperNavi.getTop
};


})(this);
