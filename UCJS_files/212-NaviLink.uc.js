// ==UserScript==
// @name NaviLink.uc.js
// @description Detects the links for navigation.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage creates items in the URLbar context menu
// @note some functions are exposed to the global scope
// |window.ucjsNaviLink.XXX|

// TODO: The URLbar is initialized when the toolbar customization panel opens.
// Observe it and fix our broken functions.
// WORKAROUND: Restart Firefox after customizing.


const ucjsNaviLink = (function(window, undefined) {


"use strict";


const kPref = {
  // show the unregistered navigation links
  // @see |kNaviLinkType| for the registered types
  showSubNaviLinks: true,
  // show the page information menu
  // @see |kPageInfoType|
  showPageInfo: true
};

/**
 * User presets
 * @key name {string}
 *   a display name in the UI item
 * @key URL {RegExp}
 *   a URL of a page that should be scan the navigations
 * @key prev {XPath}
 * @key next {XPath}
 *   set xpath of an element for navigation
 *   any element which has <href> attribute: opens its URL
 *   <input> element: submits with its form
 *
 * @note |U()| encodes an embedded string with the proper character code for
 * UI displaying
 */
const kPresetNavi = [
  {
    name: U('Google Search'),
    URL: /^https?:\/\/www\.google\.(?:com|co\.jp)\/(?:#|search|webhp)/,
    prev: 'id("nav")//td[1]/a | id("nf")/parent::a',
    next: 'id("nav")//td[last()]/a | id("nn")/parent::a'
  },
  {
    name: U('DuckDuckGo Search'),
    URL: /^https?:\/\/duckduckgo.com\/(?:html|lite)/,
    prev: '//input[@class="navbutton" and @value[contains(.,"Prev")]]',
    next: '//input[@class="navbutton" and @value[contains(.,"Next")]]'
  }
  //,
];

/**
 * Types of the link navigations
 *
 * @key type {string}
 *   the value of <rel> attribute of an element that has <href> (e.g. <link>,
 *   <a>)
 * @key synonym {string} [optional]
 *   the synonymous value that is converted to <type>
 *   the values can be combined with '|'
 * @key label {string} [optional]
 *   a displayed string
 *   a capitalized text of <type> will be displayed if <label> is empty
 *
 * @note displayed in the declared order
 * @note |U()| for UI display
 */
const kNaviLinkType = [
  {
    type: 'top',
    synonym: 'home|origin'
    //,label: U('トップページ')
  },
  {
    type: 'up',
    synonym: 'parent'
    //,label: U(親ページ')
  },
  {
    type: 'first',
    synonym: 'begin|start'
    //,label: U('最初のページ')
  },
  {
    type: 'prev',
    synonym: 'previous'
    //,label: U('前のページ')
  },
  {
    type: 'next',
    synonym: 'child'
    //,label: U('次のページ')
  },
  {
    type: 'last',
    synonym: 'end'
    //,label: U('最後のページ')
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
 * Types of the page information
 *
 * @key type {string}
 * @key label {string} [optional]
 *   a displayed string
 *   a capitalized text of <type> will be displayed if <label> is empty
 *
 * @note displayed in the declared order
 * @note |U()| for UI display
 */
const kPageInfoType = [
  {
    type: 'meta'
    //,label: U('メタ情報')
  },
  {
    type: 'feed'
    //,label: U('フィード')
  },
  {
    type: 'stylesheet'
    //,label: U('スタイルシート')
  },
  {
    type: 'script'
    //,label: U('スクリプト')
  },
  {
    type: 'favicon'
    //,label: U('ファビコン')
  }
];

/**
 * Types of the prev/next navigation
 * @note The values is displayed.
 * @note |U()| for UI display.
 */
const kSiblingScanType = U({
  preset:    'プリセット',
  official:  '公式',
  searching: '推測(リンク)',
  numbering: '推測(URL)'
});

/**
 * Strings format
 * @note The values is displayed through |F()|.
 * @note |U()| for UI display.
 */
const kFormat = {
  // for the main categories
  upper: U('上の階層'),
  prev: U('前ページ - %scanType%'),
  next: U('次ページ - %scanType%'),
  naviLink: 'Navi Link',
  pageInfo: 'Page Info',

  // for the item of <Sibling Navi>
  preset: '[%name%] %title%',
  official: '%title%',
  searching: '%title% (%score%)',
  numbering: '%here% -> %there%',
  // submit mode warning
  submit: '<submit mode>',

  // for the sub items of <Navi Link>/<Page Info>
  tooManyItems: U('項目が多いので表示を制限'),
  type: ['%title%', '%title% (%count%)'],
  item: ['%title%', '%title% [%attributes%]'],
  meta: '%name%: %content%'
};

/**
 * Identifiers
 */
const kID = (function() {
  const prefix = 'ucjs_navilink_';
  const names = [
    'upper', 'prev', 'next', 'naviLink', 'pageInfo',
    'startSeparator', 'endSeparator', 'pageInfoSeparator',
    'data'
  ];

  let hash = {};
  names.forEach(function(name) {
    hash[name] = prefix + name;
  });
  return hash;
})();

/**
 * Handler of the menu UI settings
 */
const MenuUI = (function() {
  function init() {
    let contextMenu = getURLBarContextMenu();

    setSeparators(contextMenu);

    addEvent([contextMenu, 'click', onClick, false]);
    addEvent([contextMenu, 'command', onCommand, false]);
    addEvent([contextMenu, 'popupshowing', onPopupShowing, false]);
    addEvent([contextMenu, 'popuphiding', onPopupHiding, false]);
  }

  function onClick(aEvent) {
    aEvent.stopPropagation();
    let item = aEvent.target;

    let data = item[kID.data];
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
    aEvent.stopPropagation();
    let item = aEvent.target;

    let data = item[kID.data];
    if (!data) {
      return;
    }

    if (data.open) {
      if (!/^(?:https?|ftp|file):/.test(data.open)) {
        log('invalid scheme to open:\n' + data.open);
        return;
      }

      let [inTab, inBG] = [aEvent.button === 1,  aEvent.ctrlKey];
      openURL(data.open, inTab, {
        inBackground: inBG,
        relatedToCurrent: true
      });
    } else if (data.submit) {
      data.submit.submit();
    }
  }

  function onPopupShowing(aEvent) {
    aEvent.stopPropagation();

    let contextMenu = aEvent.target;
    if (contextMenu !== getURLBarContextMenu()) {
      return;
    }

    if (!/^(?:https?|ftp|file)$/.test(getURI().scheme)) {
      return;
    }

    let isHtmlDocument = getDocument() instanceof HTMLDocument;
    let [, eSep] = getSeparators();

    [
      buildUpperNavi(),
      isHtmlDocument && buildSiblingNavi('prev'),
      isHtmlDocument && buildSiblingNavi('next'),
      isHtmlDocument && buildNaviLink(),
      kPref.showPageInfo && $E('menuseparator', {id: kID.pageInfoSeparator}),
      kPref.showPageInfo && buildPageInfo()
    ].
    forEach(function(item) {
      if (item) {
        contextMenu.insertBefore(item, eSep);
      }
    });
  }

  function onPopupHiding(aEvent) {
    aEvent.stopPropagation();

    let contextMenu = aEvent.target;
    if (contextMenu !== getURLBarContextMenu()) {
      return;
    }

    // remove existing items
    let [sSep, eSep] = getSeparators();
    for (let item; (item = sSep.nextSibling) !== eSep; /**/) {
      contextMenu.removeChild(item);
    }
  }

  // @note ucjsUI_manageContextMenuSeparators() manages the visibility of
  // separators.
  function setSeparators(aContextMenu, aReferenceNode) {
    if (aReferenceNode === undefined) {
      aReferenceNode = null;
    }

    [kID.startSeparator, kID.endSeparator].
    forEach(function(id) {
      aContextMenu.insertBefore(
        $E('menuseparator', {id: id}), aReferenceNode);
    });
  }

  function getSeparators() {
    return [$ID(kID.startSeparator), $ID(kID.endSeparator)];
  }

  function buildUpperNavi() {
    let URLList = UpperNavi.getList();

    let popup = $E('menupopup');

    if (URLList) {
      URLList.forEach(function(URL) {
        popup.appendChild($E('menuitem', {
          crop: 'start',
          label: URL,
          'open': URL
        }));
      });
    }

    let menu = $E('menu', {
      id: kID.upper,
      label: kFormat.upper,
      disabled: URLList === null || null
    });
    menu.appendChild(popup);

    return menu;
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
      let tooltip = formatTooltip(
        formatText(data, {
          siblingScanType: scanType
        }),
        data.form ? kFormat.submit : data.URL
      );

      node = $E('menuitem', {
        tooltiptext: tooltip,
        'open': data.URL,
        'submit': data.form
      });
    } else {
      let popup = $E('menupopup');

      list.forEach(function(data) {
        let text = formatText(data, {siblingScanType: scanType});
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
      id: kID[aDirection],
      label: F(kFormat[aDirection], {
        scanType: kSiblingScanType[scanType]
      })
    });

    return node;
  }

  function buildNaviLink() {
    let naviList, subNaviList;
    naviList = NaviLink.getNaviList();
    if (kPref.showSubNaviLinks) {
      subNaviList = NaviLink.getSubNaviList();
    }

    if (!naviList && !subNaviList) {
      return null;
    }

    let popup = $E('menupopup');

    [naviList, subNaviList].forEach(function(result) {
      if (!result) {
        return;
      }

      if (popup.hasChildNodes()) {
        popup.appendChild($E('menuseparator'));
      }

      result.forEach(function({type, list, trimmed}) {
        let child;
        let tooltiptext;

        if (list.length === 1) {
          let data = list[0];
          let URL = data.URL;
          child = $E('menuitem', {
            'open': URL
          });
          tooltiptext = URL;
        } else {
          let childPopup = $E('menupopup');
          list.forEach(function(data) {
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
            tooltiptext = kFormat.tooManyItems;
          }
        }

        let label = F(kFormat.type, {
          title: getLabelForType(kNaviLinkType, type),
          count: (list.length > 1) ? list.length : null
        });
        if (tooltiptext) {
          tooltiptext = formatTooltip(label, tooltiptext);
        }
        popup.appendChild($E(child, {
          label: label,
          tooltiptext: tooltiptext || null
        }));
      });
    });

    let menu = $E('menu', {
      id: kID.naviLink,
      label: kFormat.naviLink
    });
    menu.appendChild(popup);

    return menu;
  }

  function buildPageInfo() {
    let result = NaviLink.getInfoList();
    if (!result) {
      return null;
    }

    let popup = $E('menupopup');

    result.forEach(function({type, list, trimmed}) {
      let childPopup = $E('menupopup');

      if (type === 'meta') {
        // only shows <meta> information with no command
        list.forEach(function(data) {
          let text = formatText(data, {meta: true});
          childPopup.appendChild($E('menuitem', {
            closemenu: 'none',
            label: text,
            tooltiptext: text
          }));
        });
      } else {
        list.forEach(function(data) {
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
        label: F(kFormat.type, {
          title: getLabelForType(kPageInfoType, type),
          count: (list.length > 1) ? list.length : null
        }),
        tooltiptext: trimmed ? kFormat.tooManyItems : null
      }));
    });

    let menu = $E('menu', {
      id: kID.pageInfo,
      label: kFormat.pageInfo
    });
    menu.appendChild(popup);

    return menu;
  }

  function formatText(aData, aOption) {
    aOption = aOption || {};

    if ('siblingScanType' in aOption) {
      switch (aOption.siblingScanType) {
        case 'preset':
          return F(kFormat.preset, {
            name: aData.name,
            title: aData.title
          });
        case 'official':
          return F(kFormat.official, {
            title: aData.title
          });
        case 'searching':
          return F(kFormat.searching, {
            title: aData.title,
            score: +(aData.score).toFixed(5)
          });
        case 'numbering':
          return F(kFormat.numbering, {
            here: aData.here,
            there: aData.there
          });
      }
      // unreachable here, for avoiding warnings
      return null;
    }

    if (aOption.meta) {
      return F(kFormat.meta, {
        name: aData.name,
        content: aData.content
      });
    }

    return F(kFormat.item, {
      title: aData.title,
      attributes: formatAttributes(aData.attributes) || null
    });
  }

  /**
   * Attributes formatter
   * @param aAttributes {array} see |NaviLink|
   *   [['name', 'value'], ..., ['rel', ['value', 'value', ...]]]
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

    aAttributes.forEach(function([name, value]) {
      if (Array.isArray(value)) {
        value = value.join(kValuesDelimiter);
      }

      if (value) {
        attributes.push(F(kAttributeFormat, {
          name: name,
          value: value
        }));
      }
    });

    return attributes.join(kAttributesDelimiter);
  }

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

  return {
    init: init
  };
})();

/**
 * Handler of the user preset of the navigation links
 */
const PresetNavi = (function() {
  /**
   * Gets the preset data for the previous or next page
   * @param aDirection {string} 'prev' or 'next'
   * @return {hash|null}
   * {
   *   name:,
   *   title:,
   *   URL or form:
   * }
   */
  function getData(aDirection) {
    let item;

    let URL = getURI().spec;
    for (let i = 0; i < kPresetNavi.length; i++) {
      if (kPresetNavi[i].URL.test(URL)) {
        item = kPresetNavi[i];
        break;
      }
    }
    if (!item) {
      return null;
    }

    let node = $X1(item[aDirection]);

    if (node && node.href) {
      return {
        // <data> for a preset
        name: item.name,
        title: trim(node.title) || trim(node.textContent) || '',
        URL: node.href
      };
    }

    if (node instanceof HTMLInputElement && node.form && node.value) {
      return {
        // <data> for a submit preset
        name: item.name,
        title: node.value,
        form: node.form
      };
    }

    log('Match preset: %name%\n%dir%: \'%xpath%\' is not found'.
      replace('%name%', item.name).
      replace('%dir%', aDirection).
      replace('%xpath%', item[aDirection]));
    return {error: true};
  }

  return {
    getData: getData
  };
})();

/**
 * Handler of the official navigation links according to the <rel> attribute
 * @note [additional] Makes a list of the page information.
 */
const NaviLink = (function() {
  const kFeedType = {
    'application/rss+xml': 'RSS',
    'application/atom+xml': 'ATOM',
    'text/xml': 'XML',
    'application/xml': 'XML',
    'application/rdf+xml': 'XML'
  };

  /**
   * The max number of the items of each type
   */
  const kMaxNumItemsOfType = 20;

  /**
   * Handler of the types of link navigations
   * @see |kNaviLinkType|
   */
  const NaviLinkTypeFixup = (function() {
    let naviLinkType = {};
    let naviLinkTypeConversion = {};

    kNaviLinkType.forEach(function({type, synonym}) {
      naviLinkType[type] = true;
      if (synonym) {
        synonym.toLowerCase().split('|').forEach(function(item) {
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
      registered: registered,
      unregistered: unregistered
    };
  })();

  let mWorkURL = '';
  let mNaviList, mSubNaviList, mInfoList;

  function init() {
    let URI = getURI();

    if (!URI.isSamePage(mWorkURL)) {
      mWorkURL = URI.spec;
      [mNaviList, mSubNaviList, mInfoList] = getLinkList();
    }
  }

  /**
   * Retrieves the first data of the list for the type
   * @param aType {string} |kNaviLinkType.type| or |kPageInfoType.type|
   * @return {hash|null} see |addItem()|
   * {
   *   title:,
   *   attributes:,
   *   URL:
   * }
   *
   * for <meta>:
   * {
   *   name:,
   *   content:
   * }
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
   * Retrieves the list by types
   *
   * @return {hash[]|null}
   * {
   *   type: |kNaviLinkType.type| or |kPageInfoType.type|
   *   list: {<data>[]} see |getData()|
   *   trimmed: {boolean} whether a list has been cut because of too much
   *     items
   * }
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

  function getLinkList() {
    let naviList = {},
        subNaviList = {},
        infoList = {};

    scanMeta(infoList);
    scanScript(infoList);

    Array.forEach($SA('[rel][href], [rev][href]'), function(node) {
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

    types.forEach(function(type) {
      let resultList = [];
      let trimmed = false;

      list[type].some(function(data) {
        if (testUniqueData(resultList, data)) {
          resultList.push(data);

          // stop scanning the source list
          if (resultList.length >= kMaxNumItemsOfType) {
            trimmed = true;
            return true;
          }
        }
        return false;
      });

      result.push({
        type: type,
        list: resultList,
        trimmed: trimmed
      });
    });

    return result;
  }

  function testUniqueData(aArray, aData) {
    return aArray.every(function(data) {
      for (let key in data) {
        // <attributes> is {array}, the others are {string}
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
    rels.forEach(function(aValue) {
      relsList[aValue] = true;
    });

    function exceptFor(aSourceValue) {
      if (rels.length > 1) {
        return rels.filter(function(aValue) {
          return aValue !== aSourceValue;
        });
      }
      return [];
    }

    return {
      list: relsList,
      exceptFor: exceptFor
    };
  }

  function scanMeta(aList) {
    let doc = getDocument();
    let metas = Array.slice(doc.getElementsByTagName('meta'));

    // be sure to add <content-type> so that the meta list is not empty
    let empty = !metas.some(function(meta) {
      return meta.httpEquiv &&
             meta.httpEquiv.toLowerCase() === 'content-type';
    });
    if (empty) {
      metas.unshift({
        httpEquiv: 'Content-Type',
        content: doc.contentType + ';charset=' + doc.characterSet
      });
    }

    metas.forEach(function(node) {
      addItem(aList, 'meta', node);
    });
  }

  function scanScript(aList) {
    let doc = getDocument();

    Array.forEach(doc.getElementsByTagName('script'),
    function(node) {
      addItem(aList, 'script', node);
    });
  }

  function scanInfoLink(aList, aNode, aRels) {
    let {list: rels} = aRels;
    let type = '';
    let attributes = [];

    if (rels.feed ||
        (aNode.type && rels.alternate && !rels.stylesheet)) {
      // @see chrome://browser/content/utilityOverlay.js::
      // isValidFeed
      let feedType = window.isValidFeed(
        aNode, getDocument().nodePrincipal, rels.feed);
      if (feedType) {
        type = 'feed';
        attributes.push(['type', kFeedType[feedType] || 'RSS']);
      }
    }
    else if (rels.stylesheet) {
      type = 'stylesheet';
      attributes.push(['media', aNode.media || 'all']);
    }
    else if (rels.icon) {
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
    let {list: rels, exceptFor} = aRels;
    let attributes = [];

    if (rels.alternate) {
      if (aNode.media) {
        attributes.push(['media', aNode.media]);
      }
      if (aNode.hreflang) {
        attributes.push(['hreflang', aNode.hreflang]);
      }
    }

    // TODO: smart flag setting
    let added = false;

    for (let type in rels) {
      type = NaviLinkTypeFixup.registered(type);
      if (type) {
        attributes.push(['rel', exceptFor(type)]);
        addItem(aList, type, aNode, attributes);
        added || (added = true);
      }
    }

    return added;
  }

  function scanSubNaviLink(aList, aNode, aRels) {
    let {list: rels, exceptFor} = aRels;

    for (let type in rels) {
      type = NaviLinkTypeFixup.unregistered(type);
      if (type) {
        addItem(aList, type, aNode, [['rel', exceptFor(type)]]);
      }
    }
  }

  function addItem(aList, aType, aNode, aAttributes) {
    let data;

    if (aType === 'meta') {
      data = getMetaData(aNode);
    } else {
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
        // <data> for a meta
        name: name,
        content: content
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
        // <data> for a script or rel
        title: title,
        attributes: aAttributes || [],
        URL: URL
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
      order = aOrderList.map(function(aItem) {
        return aItem.type.toLowerCase();
      });
    }

    let comparator;

    if (order) {
      comparator = function(a, b) {
        return order.indexOf(a) - order.indexOf(b);
      };
    } else {
      comparator = function(a, b) {
        return a.localeCompare(b);
      };
    }

    aTypes.sort(comparator);
  }

  return {
    getData: getData,
    getNaviList: getNaviList,
    getSubNaviList: getSubNaviList,
    getInfoList: getInfoList
  };
})();

/**
 * Handler of links to the sibling(prev/next) page
 */
const SiblingNavi = (function() {
  // max number of links that are scanned to guess the sibling page
  const kMaxNumScanningLinks = 400;
  // max number of entries that are scored as the sibling page
  const kMaxNumScoredEntries = 100;
  // max number of guessed siblings to display
  const kMaxNumSiblings = 3;

  /**
   * Retrieves the URL string for the direction
   * @param aDirection {string} 'prev' or 'next'
   * @return {string}
   */
  function getURLFor(aDirection) {
    let result = getResult(aDirection);
    return (result && result.list[0].URL) || '';
  }

  /**
   * Gets the information for the previous or next page
   * @param aDirection {string} 'prev' or 'next'
   * @return {hash|null}
   * {
   *   list: {<data>[]}
   *   scanType: {string} see |kSiblingScanType|
   * }
   *
   * <data> has the proper members assigned to |kSiblingScanType|
   * {name:, title:, URL:} for a <preset>
   * {name:, title:, form:} for a submit <preset>
   * {name:, content:} for a meta of <official>
   * {title:, attributes:, URL:} for a script or rel of <official>
   * {title:, score:, URL:} for a sibling by <searching>
   * {here:, there:, URL:} for a sibling by <numbering>
   */
  function getResult(aDirection) {
    let data;
    let scanType;

    [
      ['preset', PresetNavi.getData],
      ['official', NaviLink.getData],
      ['searching', guessBySearching],
      ['numbering', guessByNumbering]
    ].
    some(function([type, getter]) {
      let res = getter(aDirection);
      if (res) {
        data = res;
        scanType = type;
        return true;
      }
      return false;
    });

    if (data && !data.error) {
      return {
        list: Array.isArray(data) ? data : [data],
        scanType: scanType
      };
    }
    return null;
  }

  /**
   * Gets a list of the prev/next page by searching links
   *
   * @param aDirection {string} 'prev' or 'next'
   * @return {<data>[]|null}
   * <data> {hash}
   * {
   *   title: {string}
   *   score: {number}
   *   URL: {string}
   * }
   *
   * @note allows only URL that has the same as the base domain of the document
   * to avoid jumping to the outside by a 'prev/next' command
   */
  function guessBySearching(aDirection) {
    let URI = getURI('NO_REF');

    NaviLinkTester.init(URI.spec, aDirection);

    let entries = getSearchEntries();
    let link, href, text, score;

    for (link in getSearchLinks()) {
      href = link.href;
      if (entries.contains(href) ||
          !href ||
          !/^https?:/.test(href) ||
          URI.isSamePage(href) ||
          !URI.isSameBaseDomain(href)) {
        continue;
      }

      for (text in getSearchTexts(link)) {
        text = trim(text);
        score = text && NaviLinkTester.score(text, href);

        if (score && isVisible(link)) {
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

      // cache for |contains()|
      URLs[URLs.length] = aURL;
    }

    function contains(aURL) {
      return URLs.indexOf(aURL) > -1;
    }

    function isFull() {
      return entries.length >= kMaxNumScoredEntries;
    }

    function collect() {
      if (!entries.length) {
        return null;
      }

      // sort items in a *descending* of the score
      entries.sort(function(a, b) b.score - a.score);

      let list = entries.map(function({text, URL, score}) {
        return {
          // <data> for a sibling by searching
          title: text,
          score: score,
          URL: URL
        };
      });

      detach();

      return trimSiblingsList(list);
    }

    return {
      add: add,
      contains: contains,
      isFull: isFull,
      collect: collect
    };
  }

  function getSearchLinks() {
    let links = getDocument().links;
    let count = links.length;

    if (kMaxNumScanningLinks < count) {
      let limit = Math.floor(kMaxNumScanningLinks / 2);

      for (let i = 0; i < limit; i++) {
        yield links[i];
      }
      for (let i = count - limit; i < count; i++) {
        yield links[i];
      }
    } else {
      for (let i = 0; i < count; i++) {
        yield links[i];
      }
    }
  }

  function getSearchTexts(aNode) {
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

  function isVisible(aNode) {
    if (aNode.hidden) {
      return false;
    }

    let style = aNode.ownerDocument.defaultView.
      getComputedStyle(aNode, '');

    return style.visibility === 'visible' &&
           style.display !== 'none';
  }

  /**
   * Gets a list of the prev/next page by numbering of URL
   *
   * @param aDirection {string} 'prev' or 'next'
   * @return {<data>[]|null}
   * <data> {hash}
   * {
   *   here: {string}
   *   there: {string}
   *   URL: {string}
   * }
   */
  function guessByNumbering(aDirection) {
    /**
     * Patterns like the page numbers in URL
     * @const kNumQuery {RegExp}
     *   Query with a numeric value; [?&]page=123 or [?&]123
     * @const kNumEndPath {RegExp}
     *   Path ended with numbers; (abc)123 or (abc)123.jpg or (abc)123/
     */
    const kNumQuery =
      /([?&](?:[a-z_-]{1,20}=)?)(\d{1,12})(?=$|&)/ig;
    const kNumEndPath =
      /(\/[a-z0-9_-]{0,20}?)(\d{1,12})(\.\w+|\/)?(?=$|\?)/ig;

    let URI = getURI('NO_REF');
    if (!URI.hasPath()) {
      return null;
    }

    let direction = (aDirection === 'next') ? 1 : -1;
    let list = [];

    [kNumQuery, kNumEndPath].forEach(function(pattern) {
      let URL = URI.spec;
      let matches;
      while ((matches = pattern.exec(URL))) {
        let [match, leading , oldNum, trailing] = matches;

        let newNum = parseInt(oldNum, 10) + direction;
        if (newNum > 0) {
          newNum = String(newNum);
          while (newNum.length < oldNum.length) {
            newNum = '0' + newNum;
          }

          let newVal = leading + newNum + (trailing || '');
          list.push({
            // <data> for a sibling by numbering
            here: match,
            there: newVal,
            URL: URL.replace(match, newVal)
          });
        }
      }
    });

    if (list.length) {
      return trimSiblingsList(list);
    }
    return null;
  }

  function trimSiblingsList(aList) {
    return aList.slice(0, kMaxNumSiblings);
  }

  return {
    getResult: getResult,
    getPrev: function() {
      return getURLFor('prev');
    },
    getNext: function() {
      return getURLFor('next');
    }
  };
})();

/**
 * Evaluator of the navigation-like text and URL
 */
const NaviLinkTester = (function() {
  /**
   * Test for text
   */
  const TextLike = (function() {
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
      prev: ['prev(?:ious)?|old(?:er)?|back(?:ward)?|less',
             '\\u524d|\\u53e4\\u3044'],
      next: ['next|new(?:er)?|forward|more',
             '\\u6b21|\\u65b0\\u3057']
    };

    // score weighting
    const kWeight = normalizeWeight({
      matchSign: 50,
      matchWord: 50,
      unmatchOppositeWord: 25,
      lessText: 20
    });

    let naviSign = null, oppositeSign = null,
        naviWord = null, oppositeWord = null;

    function init(aDirection) {
      let opposite, sign, word;

      opposite = (aDirection === 'prev') ? 'next' : 'prev';
      oppositeSign = RegExp(kNaviSign[opposite]);

      sign = kNaviSign[aDirection];
      naviSign = RegExp('^(?:' + sign + ')+\\s*|\\s*(?:' +  sign + ')+$');

      word = kNaviWord[opposite];
      oppositeWord = RegExp(word[0] + '|' +  word[1], 'i');

      word = kNaviWord[aDirection];
      // find a text string or image filename like a navigation
      // @note allows the short leading words before the navigation word for
      // the ascii characters (e.g. 'Go to next page', 'goto-next-page.png')
      naviWord = RegExp('(?:^|^.{0,10}[\\s-_])(?:' + word[0] +
        ')(?:$|[\\s-_.])|^(?:' +  word[1] + ')', 'i');
    }

    function score(aText) {
      let point = 0;
      let match;

      if (!oppositeSign.test(aText) && (match = naviSign.exec(aText))) {
        point += kWeight.matchSign;
        aText = removeMatched(aText, match[0]);
      }

      if (aText && (match = naviWord.exec(aText))) {
        point += kWeight.matchWord;
        aText = removeMatched(aText, match[0]);

        if (aText && !oppositeWord.test(aText)) {
          point += kWeight.unmatchOppositeWord;
        }
      }

      if (point) {
        if (aText) {
          let adjust = (aText.length < 10) ? 1 - (aText.length / 10) : 0;
          point += (kWeight.lessText * adjust);
        } else {
          // exact match
          point += kWeight.lessText;
        }
      }

      return point;
    }

    function removeMatched(aText, aMatched) {
      return aText.replace(aMatched, '').trim();
    }

    return {
      init: init,
      score: score
    };
  })();

  /**
   * Test for URL
   */
  const URLLike = (function() {
    const kWeight = normalizeWeight({
      equalLength: 30,
      overlapParts: 70
    });

    let srcURL = '';

    function init(aURL) {
      srcURL = unescURLChar(aURL);
    }

    function score(aURL) {
      let dstURL = unescURLChar(aURL);

      return (kWeight.equalLength * getEqualLengthRate(srcURL, dstURL)) +
             (kWeight.overlapParts * getOverlapPartsRate(srcURL, dstURL));
    }

    function getEqualLengthRate(aSrc, aDst) {
      let sLen = aSrc.length, dLen = aDst.length;

      // be less than (1.0)
      return 1 - (Math.abs(sLen - dLen) / (sLen + dLen));
    }

    function getOverlapPartsRate(aSrc, aDst) {
      let [sParts, dParts] = [aSrc, aDst].map(function(item) {
        return item.split(/[\W_]+/);
      });

      let overlaps = sParts.filter(function(part) {
        if (part) {
          let i = dParts.indexOf(part);
          if (i > -1) {
            dParts[i] = '';
            return true;
          }
        }
        return false;
      });

      // be less than (1.0)
      return overlaps.length / sParts.length;
    }

    return {
      init: init,
      score: score
    };
  })();

  let mWorkDirection = '',
      mWorkURL = '';

  function init(aURL, aDirection) {
    if (mWorkURL !== aURL) {
      mWorkDirection = '';
      mWorkURL = aURL;

      URLLike.init(aURL);
    }

    if (mWorkDirection !== aDirection) {
      mWorkDirection = aDirection;

      TextLike.init(aDirection);
    }
  }

  function score(aText, aURL) {
    let point = TextLike.score(aText);

    if (point > 0) {
      point += URLLike.score(aURL);
    }

    return (point > 1.0) ? point : 0;
  }

  function normalizeWeight(aWeights) {
    let total = 0;
    for (let key in aWeights) {
      total += aWeights[key];
    }

    for (let key in aWeights) {
      aWeights[key] /= total;
    }

    return aWeights;
  }

  return {
    init: init,
    score: score
  };
})();

/**
 * Handler of the links to the upper(top/parent) page
 */
const UpperNavi = (function() {
  /**
   * Gets the list of the upper page URLs from parent to top in order
   * @return {string[]}
   */
  function getList() {
    let list = [];

    let URI = getURI('NO_QUERY');
    let URL;
    while ((URL = getParent(URI))) {
      list.push(URL);
      URI = createURI(URL);
    }

    return list.length ? list : null;
  }

  function getParent(aURI) {
    if (aURI.hasPath()) {
      let path = aURI.path.replace(/\/(?:index\.html?)?$/i, '')
      let segments = path.split('/');

      // remove the last one
      segments.pop();

      let URL = aURI.prePath + segments.join('/') + '/';
      return (URL !== 'file:///') ? URL : '';
    }
    return getUpperHost(aURI);
  }

  function getTop(aURI) {
    if (aURI.scheme === 'file') {
      let match = /^(file:\/\/\/[a-z]:\/).+/i.exec(aURI.spec);
      return match ? match[1] : '';
    }
    return aURI.hasPath() ? aURI.prePath + '/' : getUpperHost(aURI);
  }

  function getUpperHost(aURI) {
    let host = aURI.host;
    if (!host) {
      return '';
    }

    if (aURI.baseDomain !== host) {
      let levels = host.split('.');
      levels.shift();
      return aURI.scheme + '://' + levels.join('.') + '/';
    }
    return '';
  }

  return {
    getList: getList,
    getParent: function() {
      return getParent(getURI('NO_QUERY'));
    },
    getTop: function() {
      return getTop(getURI('NO_QUERY'));
    }
  };
})();


//********** Utilities

/**
 * Gets the document object of the current content
 */
function getDocument() {
  return window.content.document;
}

/**
 * Gets the URI object of the current content
 */
function getURI(aFlag) {
  return createURI(getDocument().documentURI, aFlag);
}

/**
 * URI object wrapper
 */
function createURI(aURI, aFlag) {
  // assuming nsIURI object is valid
  // TODO: should do an error handling?
  aURI = makeURI(aURI);

  let {scheme, prePath, path, spec} = aURI;
  let noRefSpec = removeRef(spec);
  let host = getHost(aURI);
  let baseDomain = getBaseDomain(aURI);

  switch (aFlag) {
    case 'NO_QUERY':
      path = removeQuery(path);
      spec = removeQuery(spec);
      // fall through
    case 'NO_REF':
      path = removeRef(path);
      spec = removeRef(spec);
      break;
  }

  function removeQuery(aTargetURL) {
    return aTargetURL.replace(/\?.*$/, '');
  }

  function removeRef(aTargetURL) {
    return aTargetURL.replace(/#.*$/, '');
  }

  function hasPath() {
    return path !== '/';
  }

  function isSamePage(aTargetURL) {
    return removeRef(aTargetURL) === noRefSpec;
  }

  function isSameBaseDomain(aTargetURL) {
    return getBaseDomain(makeURI(aTargetURL)) === baseDomain;
  }

  return {
    scheme: scheme,
    host: host,
    baseDomain: baseDomain,
    prePath: prePath,
    path: path,
    spec: spec,
    hasPath: hasPath,
    isSamePage: isSamePage,
    isSameBaseDomain: isSameBaseDomain
  };
}

function makeURI(aURL) {
  if (aURL instanceof window.Ci.nsIURI) {
    return aURL;
  }

  try {
    // @see resource://gre/modules/Services.jsm
    return Services.io.newURI(aURL, null, null);
  } catch (ex) {}

  return null;
}

function getHost(aURI) {
  if (!aURI) {
    return '';
  }

  try {
    // @note returns an empty string for the host of 'file:///C:/...'
    return aURI.host;
  } catch (ex) {}

  return aURI.spec.
    match(/^(?:[a-z]+:\/\/)?(?:[^\/]+@)?\[?(.+?)\]?(?::\d+)?(?:\/|$)/)[1];
}

function getBaseDomain(aURI) {
  if (!aURI) {
    return '';
  }

  try {
    // @see resource://gre/modules/Services.jsm
    return window.Services.eTLD.getBaseDomain(aURI);
  } catch (ex) {}

  return getHost(aURI);
}

/**
 * Creates an element with the attributes
 */
function $E(aTagOrNode, aAttribute) {
  let node = (typeof aTagOrNode === 'string') ?
    window.document.createElement(aTagOrNode) : aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value === null || value === undefined) {
        continue;
      }

      switch (name) {
        case 'open':
        case 'submit':
          node[kID.data] = {};
          node[kID.data][name] = value;
          break;
        default:
          node.setAttribute(name, value);
          break;
      }
    }
  }

  return node;
}

function $ID(aID){
  return window.document.getElementById(aID);
}

/**
 * String formatter
 * @param aFormat {string|string[]} see |kFormat|
 * @param aReplacement {hash}
 * @return {string}
 */
function F(aFormat, aReplacement) {
  // filter items that its value is |null| or |undefined|
  let replacement = {};
  for (let [name, value] in Iterator(aReplacement)) {
    if (value !== null && value !== undefined) {
      replacement['%' + name + '%'] = value;
    }
  }

  if (!Array.isArray(aFormat)) {
    aFormat = [aFormat];
  }

  // retreive a format that has all aliases of the name of replacements
  let format;
  let names = Object.keys(replacement);
  for (let i = 0, l = aFormat.length; i < l; i++) {
    if (names.every(function(name) aFormat[i].contains(name))) {
      format = aFormat[i];
      break;
    }
  }

  if (!format) {
    return aFormat[0];
  }

  for (let [name, value] in Iterator(replacement)) {
    format = format.replace(name, value);
  }
  return format;
}

function getLeaf(aURL) {
  if (aURL) {
    let lastSlash = aURL.replace(/[?#].*$/, '').lastIndexOf('/');
    return aURL.slice(lastSlash + 1) || aURL;
  }
  return '';
}

function trim(aText) {
  if (aText) {
    return aText.trim().replace(/\s+/g, ' ');
  }
  return '';
}


//********** Imports

function getURLBarContextMenu() {
  return window.ucjsUI.URLBar.contextMenu;
}

function $SA(aSelector) {
  return window.ucjsUtil.getNodesBySelector(aSelector);
}

function $X1(aXPath) {
  return window.ucjsUtil.getFirstNodeByXPath(aXPath);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function unescURLChar(aURL) {
  return window.ucjsUtil.unescapeURLCharacters(aURL);
}

function U(aText) {
  return window.ucjsUtil.toStringForUI(aText);
}

function openURL(aURL, aInTab, aOption) {
  window.ucjsUtil.openURLIn(aURL, aInTab, aOption);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('NaviLink.uc.js', aMsg);
}


//********** Entry point

function NaviLink_init() {
  MenuUI.init();
}

NaviLink_init();


//********** Expose

return {
  getNext: SiblingNavi.getNext,
  getPrev: SiblingNavi.getPrev,
  getParent: UpperNavi.getParent,
  getTop: UpperNavi.getTop
};


})(this);
