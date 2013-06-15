// ==UserScript==
// @name NaviLink.uc.js
// @description Detects the links for navigation.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the URLbar context menu.
// @note Some functions are exported to global (ucjsNaviLink.XXX).

// TODO: The URLbar is initialized when the toolbar customization panel opens.
// Observe it and fix our broken functions.
// WORKAROUND: Restart Firefox after customizing.


var ucjsNaviLink = (function(window, undefined) {


"use strict";


const kPref = {
  // show the page information menu
  showPageInfo: true,
  // show the unregistered navigation links
  showSubNaviLinks: true,
  // max number of the items of each categories in the navigation links
  maxNaviLinkItemsNum: 30
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
 * @note |U()| converts embedded chars in the code for displaying properly.
 */
const kPresetNavi = [
  {
    name: U('Google Search'),
    URL: /^https?:\/\/www\.google\.(?:com|co\.jp)\/(?:#|cse|custom|search)/,
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
 * @note The keys are values of the <rel> attribute of a linkable element like
 * <link>.
 * @note The values is displayed in this order.
 * @note |U()| for UI display.
 */
const kNaviLinkType = U({
  top:        'Top',
  up:         'Up',
  first:      'First',
  prev:       'Prev',
  next:       'Next',
  last:       'Last',
  contents:   'Contents',
  index:      'Index',
  chapter:    'Chapter',
  section:    'Section',
  subsection: 'Subsection',
  appendix:   'Appendix',
  bookmark:   'Bookmark',
  glossary:   'Glossary',
  help:       'Help',
  search:     'Search',
  author:     'Author',
  copyright:  'Copyright',
  alternate:  'Alternate'
});

/**
 * Synonymous keys of the link navigations
 * @note The values are defined as the keys of |kNaviLinkType|.
 */
const kNaviLinkTypeConversion = {
  home:     'top',
  origin:   'top',
  start:    'top',
  parent:   'up',
  begin:    'first',
  end:      'last',
  previous: 'prev',
  child:    'next',
  toc:      'contents',
  made:     'author'
};

/**
 * Types of the page information
 * @note The values is displayed in this order.
 * @note |U()| for UI display.
 */
const kPageInfoType = U({
  meta:       'Meta',
  feed:       'Feed',
  stylesheet: 'Stylesheet',
  script:     'Script',
  favicon:    'Favicon'
});

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
const kFormat = U({
  // for the main categories
  upper: '上の階層',
  prev: '前ページ - %scanType%',
  next: '次ページ - %scanType%',
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
  tooManyItems: '項目が多いので表示を制限 (%count%/%total%)',
  type: ['%title%', '%title% (%count%)'],
  item: ['%title%', '%title% [%attributes%]'],
  meta: '%name%: %content%'
});

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
var mMenu = (function() {
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

    if (aEvent.button === 2) {
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

    var contextMenu = aEvent.target;
    if (contextMenu !== getURLBarContextMenu()) {
      return;
    }

    if (!/^(?:https?|ftp|file)$/.test(getURI().scheme)) {
      return;
    }

    var isHtmlDocument = getDocument() instanceof HTMLDocument;
    var [, eSep] = getSeparators();

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

    var contextMenu = aEvent.target;
    if (contextMenu !== getURLBarContextMenu()) {
      return;
    }

    // remove existing items
    var [sSep, eSep] = getSeparators();
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
    var URLList = mUpperNavi.getList();

    var popup = $E('menupopup');

    if (URLList) {
      URLList.forEach(function(URL) {
        popup.appendChild($E('menuitem', {
          crop: 'start',
          label: URL,
          'open': URL
        }));
      });
    }

    var menu = $E('menu', {
      id: kID.upper,
      label: kFormat.upper,
      disabled: URLList === null || null
    });
    menu.appendChild(popup);

    return menu;
  }

  function buildSiblingNavi(aDirection) {
    var res = mSiblingNavi.getResult(aDirection);
    if (!res) {
      return null;
    }

    var {list, scanType} = res;

    var node;

    if (list.length === 1) {
      let data = list[0];
      let tooltip = formatTip(
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
        popup.appendChild($E('menuitem', {
          label: formatText(data, {
            siblingScanType: scanType
          }),
          tooltiptext: data.URL,
          'open': data.URL
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
    var naviList, subNaviList;
    naviList = mNaviLink.getNaviList();
    if (kPref.showSubNaviLinks) {
      subNaviList = mNaviLink.getSubNaviList();
    }

    if (!naviList && !subNaviList) {
      return null;
    }

    var popup = $E('menupopup');

    [naviList, subNaviList].forEach(function(list) {
      if (!list) {
        return;
      }

      if (popup.hasChildNodes()) {
        popup.appendChild($E('menuseparator'));
      }

      for (let type in list) {
        let child;
        let itemCount;
        let tooltip;

        if (list[type].length === 1) {
          let data = list[type][0];

          child = $E('menuitem', {
            tooltiptext: formatTip(formatText(data), data.URL),
            'open': data.URL
          });
        } else {
          let childPopup = $E('menupopup');

          let censored = list[type].length > kPref.maxNaviLinkItemsNum;

          list[type].some(function(data, i) {
            childPopup.appendChild($E('menuitem', {
              crop: 'center',
              label: formatText(data),
              tooltiptext: data.URL,
              'open': data.URL
            }));

            return censored && i >= kPref.maxNaviLinkItemsNum - 1;
          });

          child = $E('menu');
          child.appendChild(childPopup);

          itemCount = childPopup.childElementCount;
          if (censored) {
            tooltip = F(kFormat.tooManyItems, {
              count: itemCount,
              total: list[type].length
            });
          }
        }

        popup.appendChild($E(child, {
          label: F(kFormat.type, {
            title: kNaviLinkType[type] || type,
            count: (itemCount > 1) ? itemCount : null
          }),
          tooltiptext: tooltip || null
        }));
      }
    });

    var menu = $E('menu', {
      id: kID.naviLink,
      label: kFormat.naviLink
    });
    menu.appendChild(popup);

    return menu;
  }

  function buildPageInfo() {
    var list = mNaviLink.getInfoList();
    if (!list) {
      return null;
    }

    var popup = $E('menupopup');

    for (let type in list) {
      let childPopup = $E('menupopup');

      if (type === 'meta') {
        // no command and only show <meta> informations
        list[type].forEach(function(data) {
          childPopup.appendChild($E('menuitem', {
            closemenu: 'none',
            label: formatText(data, {meta: true}),
            tooltiptext: data.content
          }));
        });
      } else {
        list[type].forEach(function(data) {
          childPopup.appendChild($E('menuitem', {
            crop: 'center',
            label: formatText(data),
            tooltiptext: data.URL,
            'open': data.URL
          }));
        });
      }

      let itemCount = childPopup.childElementCount;
      let child = $E('menu');
      child.appendChild(childPopup);
      popup.appendChild($E(child, {
        label: F(kFormat.type, {
          title: kPageInfoType[type],
          count: (itemCount > 1) ? itemCount : null
        })
      }));
    }

    var menu = $E('menu', {
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
   * @param aAttributes {array} see |mNaviLink|
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

    var attributes = [];

    aAttributes.forEach(function([name, value]) {
      if (Array.isArray(value)) {
        value = value.join(kValuesDelimiter);
      }
      attributes.push(
        F(kAttributeFormat, {
          name: name,
          value: value
        })
      );
    });

    return attributes.join(kAttributesDelimiter);
  }

  function formatTip(aText, aURL) {
    if (aText && aText !== getLeaf(aURL)) {
      return aText + '\n' + aURL;
    }
    return aURL;
  }

  return {
    init: init
  };
})();

/**
 * Handler of the user preset of the navigation links
 */
var mPresetNavi = (function() {
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
    var item;

    var URL = getURI().spec;
    for (let i = 0; i < kPresetNavi.length; i++) {
      if (kPresetNavi[i].URL.test(URL)) {
        item = kPresetNavi[i];
        break;
      }
    }
    if (!item) {
      return null;
    }

    var node = $X1(item[aDirection]);

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
var mNaviLink = (function() {
  const kFeedType = {
    'application/rss+xml': 'RSS',
    'application/atom+xml': 'ATOM',
    'text/xml': 'XML',
    'application/xml': 'XML',
    'application/rdf+xml': 'XML'
  };

  var mWorkURL = '';
  var mNaviList, mSubNaviList, mInfoList;

  function init() {
    var URI = getURI();

    if (!URI.isSamePage(mWorkURL)) {
      mWorkURL = URI.spec;
      [mNaviList, mSubNaviList, mInfoList] = getLinkList();
    }
  }

  /**
   * Retrieves the first data of the list for the type
   * @param aType {string} |kNaviLinkType| or |kPageInfoType|
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
    var list = getNaviList();
    return (list && list[aType] && list[aType][0]) || null;
  }

  /**
   * Retrieves the list for the types
   * @return {hash|null}
   * {
   *   <type>: [<data>, ...],
   *   ...
   * }
   * <type>: |kNaviLinkType| or |kPageInfoType|
   * <data>: see |getData()|
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
    // keep the order list of sort to the first item
    var naviList = [kNaviLinkType],
        subNaviList = [{}],
        infoList = [kPageInfoType];

    scanMeta(infoList);
    scanScript(infoList);

    Array.forEach($SA('[rel][href], [rev][href]'), function(node, i) {
      var rel = node.rel || node.rev;
      if (!rel || !node.href || !/^(?:https?|mailto):/.test(node.href)) {
        return;
      }

      var rels = makeRels(rel);

      scanInfoLink(infoList, i, node, rels) ||
      scanNaviLink(naviList, i, node, rels) ||
      scanSubNaviLink(subNaviList, i, node, rels);
    });

    return [naviList, subNaviList, infoList].map(function(list) {
      if (list.length === 1) {
        return null;
      }

      // pick out the order list
      var order = [i for (i in list.shift())];
      list.sort(order.length ?
        function(a, b) {
          return order.indexOf(a.type) - order.indexOf(b.type) ||
                 a.index - b.index;
        } :
        function(a, b) {
          return a.type.localeCompare(b.type) ||
                 a.index - b.index;
        }
      );

      var res = {};

      list.forEach(function({type, data}) {
        if (!(type in res)) {
          res[type] = [];
        }

        let unique = !res[type].some(function(item) {
          return JSON.stringify(item) === JSON.stringify(data);
        });
        if (unique) {
          res[type].push(data);
        }
      });

      return res;
    });
  }

  function makeRels(aRelAttribute) {
    var relValues = aRelAttribute.toLowerCase().split(/\s+/);

    var rels = Object.create(null, {
      length: {
        value: relValues.length
      },
      except: {
        value: function(aValue) {
          return relValues.filter(function(val) val !== aValue);
        }
      }
    });

    relValues.forEach(function(val) {rels[val] = true});

    return rels;
  }

  function scanMeta(aList) {
    var doc = getDocument();
    var metas = Array.slice(doc.getElementsByTagName('meta'));

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

    metas.forEach(function(node, i) {
      addItem(aList, i, 'meta', node);
    });
  }

  function scanScript(aList) {
    var doc = getDocument();

    Array.forEach(doc.getElementsByTagName('script'),
    function(node, i) {
      addItem(aList, i, 'script', node);
    });
  }

  function scanInfoLink(aList, aIndex, aNode, aRels) {
    var type = '';
    var attributes = [];

    if (aRels.feed ||
        (aNode.type && aRels.alternate && !aRels.stylesheet)) {
      // @see chrome://browser/content/utilityOverlay.js::
      // isValidFeed
      let feedType = window.isValidFeed(
        aNode, getDocument().nodePrincipal, aRels.feed);
      if (feedType) {
        type = 'feed';
        attributes.push(['type', kFeedType[feedType] || 'RSS']);
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
      addItem(aList, aIndex, type, aNode, attributes);
      return true;
    }
    return false;
  }

  function scanNaviLink(aList, aIndex, aNode, aRels) {
    var startLen = aList.length;
    var attributes = [];

    if (aRels.alternate) {
      if (aNode.media) {
        attributes.push(['media', aNode.media]);
      }
      if (aNode.hreflang) {
        attributes.push(['hreflang', aNode.hreflang]);
      }
    }

    let plural = aRels.length > 1;
    let others;
    for (let type in aRels) {
      type = kNaviLinkTypeConversion[type] || type;
      if (type in kNaviLinkType) {
        others = plural ? [['rel', aRels.except(type)]] : [];
        addItem(aList, aIndex, type, aNode, attributes.concat(others));
      }
    }

    return aList.length - startLen > 0;
  }

  function scanSubNaviLink(aList, aIndex, aNode, aRels) {
    let plural = aRels.length > 1;
    let others;
    for (let type in aRels) {
      type = kNaviLinkTypeConversion[type] || type;
      if (!(type in kNaviLinkType)) {
        others = plural ? [['rel', aRels.except(type)]] : [];
        addItem(aList, aIndex, type, aNode, others);
      }
    }
  }

  function addItem(aList, aIndex, aType, aNode, aAttributes) {
    let data;
    if (aType === 'meta') {
      data = getMetaData(aNode);
    } else {
      data = getNodeData(aNode, aAttributes);
    }

    if (data) {
      aList.push({
        index: aIndex,
        type: aType,
        data: data
      });
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
        attributes: aAttributes,
        URL: URL
      };
    }
    return null;
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
var mSiblingNavi = (function() {
  // max number of links that are scanned to guess the sibling page
  const kMaxNumScanningLinks = 400;
  // max number of entries that are scored as the sibling page
  const kMaxNumScoredEntries = 10;
  // max number of guessed siblings to display
  const kMaxNumSiblings = 3;

  function getURLFor(aDirection) {
    var res = getResult(aDirection);
    return (res && res.list[0].URL) || '';
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
    var data;
    var scanType;

    [
      ['preset', mPresetNavi.getData],
      ['official', mNaviLink.getData],
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

  function guessBySearching(aDirection) {
    var URI = getURI('NO_REF');

    NaviLinkTester.init(URI.spec, aDirection);

    var entries = getSearchEntries();
    var link, href, text, score;

    for (link in getSearchLinks()) {
      href = link.href;
      if (!href || !/^https?:/.test(href) || URI.isSamePage(href) ||
        entries.contains(href)) {
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
    var entries = [];
    var URLs = [];

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

      // sort items in a descending of the score
      entries.sort(function(a, b) b.score - a.score);

      var list = entries.map(function({text, URL, score}) {
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
    var links = getDocument().links;
    var count = links.length;

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

    var images = aNode.getElementsByTagName('img');
    var image = images.length ? images[0] : null;

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

    var style = aNode.ownerDocument.defaultView.
      getComputedStyle(aNode, '');

    return style.visibility === 'visible' &&
           style.display !== 'none';
  }

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

    var URI = getURI('NO_REF');
    if (!URI.hasPath()) {
      return null;
    }

    var direction = (aDirection === 'next') ? 1 : -1;
    var list = [];

    [kNumQuery, kNumEndPath].forEach(function(pattern) {
      var URL = URI.spec;
      var matches;
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
var NaviLinkTester = (function() {
  /**
   * Test for text
   */
  var textLike = (function() {
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
      unmatchOppositeWord: 20,
      lessText: 30
    });

    var naviSign = null, oppositeSign = null,
        naviWord = null, oppositeWord = null;

    function init(aDirection) {
      var opposite, sign, word;

      opposite = (aDirection === 'prev') ? 'next' : 'prev';
      oppositeSign = RegExp(kNaviSign[opposite]);

      sign = kNaviSign[aDirection];
      naviSign = RegExp('^(?:' + sign + ')+\\s*|\\s*(?:' +  sign + ')+$');

      word = kNaviWord[opposite];
      oppositeWord = RegExp(word[0] + '|' +  word[1], 'i');

      word = kNaviWord[aDirection];
      naviWord = RegExp('(?:^|^.{0,10}[\\s-_])(?:' + word[0] +
        ')(?:$|[\\s-_.])|^(?:' +  word[1] + ')', 'i');
    }

    function score(aText) {
      var point = 0;
      var match;

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

    function removeMatched(aText, aMatched)
      aText.replace(aMatched, '').trim();

    return {
      init: init,
      score: score
    };
  })();

  /**
   * Test for URL
   */
  var URLLike = (function() {
    const kWeight = normalizeWeight({
      equalLength: 35,
      overlapParts: 65
    });

    var srcURL = '';

    function init(aURL) {
      srcURL = unescURLChar(aURL);
    }

    function score(aURL) {
      var dstURL = unescURLChar(aURL);

      return (kWeight.equalLength * getEqualLengthRate(srcURL, dstURL)) +
             (kWeight.overlapParts * getOverlapPartsRate(srcURL, dstURL));
    }

    function getEqualLengthRate(aSrc, aDst) {
      var sLen = aSrc.length, dLen = aDst.length;

      // be less than (1.0)
      return 1 - (Math.abs(sLen - dLen) / (sLen + dLen));
    }

    function getOverlapPartsRate(aSrc, aDst) {
      var [sParts, dParts] =
        [aSrc, aDst].map(function(a) a.split(/[/?&=#;]+/));

      var overlaps = sParts.filter(function(part) {
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

  var workDirection = '',
      workURL = '';

  function init(aURL, aDirection) {
    if (workURL !== aURL) {
      workDirection = '';
      workURL = aURL;

      URLLike.init(aURL);
    }

    if (workDirection !== aDirection) {
      workDirection = aDirection;

      textLike.init(aDirection);
    }
  }

  function score(aText, aURL) {
    var point = textLike.score(aText);

    if (point > 0) {
      point += URLLike.score(aURL);
    }

    return (point > 1.0) ? point : 0;
  }

  function normalizeWeight(aWeights) {
    var total = 0;
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
var mUpperNavi = (function() {
  /**
   * Gets the list of the upper page URLs from parent to top in order
   * @return {string[]}
   */
  function getList() {
    var list = [];

    var URI = getURI('NO_QUERY');
    var URL;
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
    var host = aURI.host;
    if (!host) {
      return '';
    }

    var baseDomain = host;
    try {
      // @see resource://gre/modules/Services.jsm
      baseDomain = window.Services.eTLD.getBaseDomainFromHost(host);
    } catch (ex) {
      // @throws NS_ERROR_UNEXPECTED: host contains characters disallowed in
      // URIs.
      // @throws NS_ERROR_HOST_IS_IP_ADDRESS: host is a numeric IPv4 or IPv6
      // address.
      return '';
    }

    if (baseDomain !== host) {
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
  if (!(aURI instanceof window.Ci.nsIURI)) {
    // @see chrome://global/content/contentAreaUtils.js::
    // makeURI
    aURI = window.makeURI(aURI, null, null);
  }

  var {scheme, prePath, path, spec} = aURI;
  var host;
  try {
    // returns an empty string for the host of 'file:///C:/...'
    host = aURI.host;
  } catch (ex) {
    host = aURI.spec.
      match(/^(?:[a-z]+:\/\/)?(?:[^\/]+@)?\[?(.+?)\]?(?::\d+)?(?:\/|$)/)[1];
  }

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
    return removeRef(aTargetURL) === removeRef(spec);
  }

  return {
    scheme: scheme,
    host: host,
    prePath: prePath,
    path: path,
    spec: spec,
    hasPath: hasPath,
    isSamePage: isSamePage
  };
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
  mMenu.init();
}

NaviLink_init();


//********** Expose

return {
  getNext: mSiblingNavi.getNext,
  getPrev: mSiblingNavi.getPrev,
  getParent: mUpperNavi.getParent,
  getTop: mUpperNavi.getTop
};


})(this);
