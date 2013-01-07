// ==UserScript==
// @name NaviLink.uc.js
// @description Detects the links for navigation.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the URLbar context menu.
// @note Some functions are exported to global (ucjsNaviLink.XXX).


var ucjsNaviLink = (function(window, undefined) {


"use strict";


const kPref = {
  // Show page information menu
  showPageInfo: true,
  // Show unregistered navigation links
  showSubNaviLinks: true,
  // Max number of guessed siblings
  maxGuessSiblingsNum: 3,
  // Max number of items of each categories in navigation links
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
 * @note |U()| for UI display.
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
 * Items of link navigations
 * @note Key is 'rel' attribute of <link> or linkable element.
 * @note Displayed in this order. U() for UI.
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
 * Synonymous keys
 * @note Value is in a key of kNaviLinkType.
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
 * Items of page infomation
 * @note Displayed in this order. U() for UI.
 */
const kPageInfoType = U({
  meta:       'Meta',
  feed:       'Feed',
  stylesheet: 'Stylesheet',
  script:     'Script',
  favicon:    'Favicon'
});

/**
 * Types of a prev/next navigation
 * @note U() for UI display.
 */
const kSiblingScanType = U({
  preset:    'プリセット',
  official:  '公式',
  searching: '推測(リンク)',
  numbering: '推測(URL)'
});

/**
 * Strings format
 * @see |F()|
 * @note U() for UI display.
 */
const kFormat = U({
  // Main categories
  upper: '上の階層',
  prev: '前ページ - %scanType%',
  next: '次ページ - %scanType%',
  naviLink: 'Navi Link',
  pageInfo: 'Page Info',

  // Title of siblings
  preset: '[%name%] %title%',
  official: '%title%',
  searching: '%title% (%score%)',
  numbering: '%here% -> %there%',
  // Tooltip of submit mode of preset
  submit: '<FORM> submit',

  // Sub items of NaviLink or PageInfo
  type: ['%title%', '%title% (%count%)'],
  tooManyItems: '項目が多いので表示を制限 (%count%/%total%)',
  item: ['%title%', '%title% [%attributes%]'],
  meta: '%name%: %content%'
});

/**
 * Identifiers
 */
const kID = (function() {
  const prefix = 'ucjs_navilink_';
  const keys = [
    'upper', 'prev', 'next', 'naviLink', 'pageInfo',
    'startSeparator', 'endSeparator', 'pageInfoSeparator',
    'data'
  ];

  let hash = {};
  keys.forEach(function(a) {
    hash[a] = prefix + a;
  });
  return hash;
})();


//********** Handlers

/**
 * Handler of the menu settings
 */
var mMenu = (function() {

  function init() {
    var contextMenu = getURLBarContextMenu();

    setSeparators(contextMenu);

    addEvent([contextMenu, 'click', onCommand, false]);
    addEvent([contextMenu, 'popupshowing', onPopupShowing, false]);
    addEvent([contextMenu, 'popuphiding', onPopupHiding, false]);
  }

  function onCommand(aEvent) {
    aEvent.stopPropagation();
    var item = aEvent.target;

    let data = item[kID.data];
    if (!data) {
      return;
    }

    if (aEvent.button === 2)
      return;
    if (aEvent.button === 1) {
      // @see chrome://browser/content/utilityOverlay.js::
      // closeMenus
      window.closeMenus(item);
    }

    if (data.open) {
      if (/^(?:https?|ftp|file):/.test(data.open)) {
        let inTab = aEvent.button === 1, inBackground = aEvent.ctrlKey;
        openURL(data.open, inTab,
          {inBackground: inBackground, relatedToCurrent: true});
      }
    } else if (data.submit) {
      data.submit.submit();
    }
  }

  function onPopupShowing(aEvent) {
    aEvent.stopPropagation();

    var contextMenu = aEvent.target;
    if (contextMenu !== getURLBarContextMenu())
      return;

    var [, eSep] = getSeparators();

    if (!/^(?:https?|ftp|file)$/.test(getURI().scheme))
      return;

    var isHtmlDocument = getDocument() instanceof HTMLDocument;

    [
      buildUpperNavi(),
      isHtmlDocument && buildSiblingNavi('prev'),
      isHtmlDocument && buildSiblingNavi('next'),
      isHtmlDocument && buildNaviLink(),
      kPref.showPageInfo && $E('menuseparator', {'id': kID.pageInfoSeparator}),
      kPref.showPageInfo && buildPageInfo()
    ].
    forEach(function(item) {
      item && contextMenu.insertBefore(item, eSep);
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

  function setSeparators(aContextMenu) {
    // @note ucjsUI_manageContextMenuSeparators() manages the visibility of
    // separators.
    aContextMenu.appendChild($E('menuseparator', {'id': kID.startSeparator}));
    aContextMenu.appendChild($E('menuseparator', {'id': kID.endSeparator}));
  }

  function getSeparators() {
    function $ID(id) window.document.getElementById(id);

    return [$ID(kID.startSeparator), $ID(kID.endSeparator)];
  }

  function buildUpperNavi() {
    var list = mUpperNavi.getURLList();

    var popup = $E('menupopup');

    if (list) {
      list.forEach(function(URL) {
        popup.appendChild($E('menuitem', {
          'crop': 'start',
          'label': URL,
          'open': URL
        }));
      });
    }

    var menu = $E('menu', {
      'id': kID.upper,
      'label': F(kFormat.upper),
      'disabled': list === null || null
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
    if ((scanType === 'searching' || scanType === 'numbering') &&
        list.length > kPref.maxGuessSiblingsNum) {
      list = list.slice(0, kPref.maxGuessSiblingsNum);
    }

    var element;

    if (list.length === 1) {
      let data = list[0];
      let tooltip = formatTip(
        formatText(data, {
          siblingScanType: scanType
        }),
        data.form ? kFormat.submit : data.URL
      );

      element = $E('menuitem', {
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

      element = $E('menu');
      element.appendChild(popup);
    }

    $E(element, {
      'id': kID[aDirection],
      'label': F(kFormat[aDirection],
        {'scanType': kSiblingScanType[scanType]})
    });

    return element;
  }

  function buildNaviLink() {
    var naviList = mNaviLink.getNaviList(),
        subNaviList =
          kPref.showSubNaviLinks ? mNaviLink.getSubNaviList() : null;
    if (!naviList && !subNaviList)
      return null;

    var popup = $E('menupopup');

    [naviList, subNaviList].forEach(function(list) {
      if (!list)
        return;

      popup.hasChildNodes() && popup.appendChild($E('menuseparator'));

      for (let type in list) {
        let child;
        let itemCount = 0, tooltip = null;

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
            tooltip = F(kFormat.tooManyItems,
              {'count': itemCount, 'total': list[type].length});
          }
        }

        popup.appendChild($E(child, {
          'label': F(kFormat.type,
            {'title': kNaviLinkType[type] || type, 'count': itemCount}),
          'tooltiptext': tooltip
        }));
      }
    });

    var menu = $E('menu',
      {'id': kID.naviLink, 'label': F(kFormat.naviLink)});
    menu.appendChild(popup);

    return menu;
  }

  function buildPageInfo() {
    var list = mNaviLink.getInfoList();
    if (!list)
      return null;

    var popup = $E('menupopup');

    for (let type in list) {
      let childPopup = $E('menupopup');

      if (type === 'meta') {
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

      let child = $E('menu');
      child.appendChild(childPopup);
      popup.appendChild($E(child, {
        'label': F(kFormat.type,
          {'title': kPageInfoType[type], 'count': childPopup.childElementCount})
      }));
    }

    var menu = $E('menu',
      {'id': kID.pageInfo, 'label': F(kFormat.pageInfo)});
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
   * Formats attributes
   * @param aAttributes {array}
   *   [['name1', 'value1'], ['name2', ['value1', 'value2']]]
   * @return {string}
   */
  function formatAttributes(aAttributes) {
    const kAttributeFormat = '%name%: %value%',
          kValuesDelimiter = ',',
          kAttributesDelimiter = ' ';

    if (!aAttributes || !aAttributes.length)
      return '';

    var attributes = [];

    aAttributes.forEach(function([name, value]) {
      if (Array.isArray(value)) {
        value = value.join(kValuesDelimiter);
      }
      attributes.push(F(kAttributeFormat,
        {'name': name, 'value': value}));
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
 * Handler of the user preset navigation links
 */
var mPresetNavi = (function() {

  function getData(aDirection) {
    var item = null;

    var URL = getURI().spec;

    for (let i = 0; i < kPresetNavi.length; i++) {
      if (kPresetNavi[i].URL.test(URL)) {
        item = kPresetNavi[i];
        break;
      }
    }

    if (item) {
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

      log('Match preset: %name% ->\n%dir%: \'%xpath%\' is not found.'.
        replace('%name%', item.name).
        replace('%dir%', aDirection).
        replace('%xpath%', item[aDirection]));
      return {error: true};
    }
    return null;
  }

  return {
    getData: getData
  };

})();


/**
 * Handler of the official navigation links according to the 'rel' attribute
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

  function getData(aType) {
    var list = getNaviList();
    return (list && list[aType] && list[aType][0]) || null;
  }

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
    // Keep the order list of sort to the first item
    var naviList = [kNaviLinkType],
        subNaviList = [{}],
        infoList = [kPageInfoType];

    scanMeta(infoList);
    scanScript(infoList);

    Array.forEach($SA('[rel][href], [rev][href]'), function(node, i) {
      var rel = node.rel || node.rev;
      if (!rel || !node.href || !/^(?:https?|mailto):/.test(node.href))
        return;

      var rels = makeRels(rel);

      scanInfoLink(infoList, i, node, rels) ||
      scanNaviLink(naviList, i, node, rels) ||
      scanSubNaviLink(subNaviList, i, node, rels);
    });

    return [naviList, subNaviList, infoList].map(function(list) {
      if (list.length === 1)
        return null;

      // Pick out the order list.
      var order = [i for (i in list.shift())];
      list.sort(order.length ?
        function(a, b)
          order.indexOf(a.type) - order.indexOf(b.type) || a.index - b.index :
        function(a, b)
          a.type.localeCompare(b.type) || a.index - b.index
      );

      var res = {};

      list.forEach(function({type, data}) {
        !(type in res) && (res[type] = []);

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
    var relVals = aRelAttribute.toLowerCase().split(/\s+/);

    var rels = Object.create(null, {
      length: {value: relVals.length},
      except: {value: function(val) relVals.filter(function(a) a !== val)}
    });

    relVals.forEach(function(a) {rels[a] = true});

    return rels;
  }

  function scanMeta(aList) {
    var d = getDocument();
    var metas = Array.slice(d.getElementsByTagName('meta'));

    // Make sure that the meta list is not empty.
    if (!metas.
        some(function(a) a.httpEquiv &&
                         a.httpEquiv.toLowerCase() === 'content-type')) {
      metas.unshift({
        httpEquiv: 'Content-Type',
        content: d.contentType + ';charset=' + d.characterSet
      });
    }

    metas.forEach(function(node, i) {
      addItem(aList, i, 'meta', node);
    });
  }

  function scanScript(aList) {
    var d = getDocument();

    Array.forEach(d.getElementsByTagName('script'),
    function(node, i) {
      addItem(aList, i, 'script', node);
    });
  }

  function scanInfoLink(aList, aIndex, aNode, aRels) {
    var type = '', attributes = [];

    if (aRels.feed || (aNode.type && aRels.alternate && !aRels.stylesheet)) {
      // @see chrome://browser/content/utilityOverlay.js::isValidFeed
      let feedType = window.isValidFeed(
        aNode, getDocument().nodePrincipal, aRels.feed);
      if (feedType) {
        type = 'feed';
        attributes.push(['type', kFeedType[feedType] || 'RSS']);
      }
    } else if (aRels.stylesheet) {
      type = 'stylesheet';
      attributes.push(['media', aNode.media || 'all']);
    } else if (aRels.icon) {
      type = 'favicon';
      aNode.type && attributes.push(['type', aNode.type]);
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
      aNode.media && attributes.push(['media', aNode.media]);
      aNode.hreflang && attributes.push(['hreflang', aNode.hreflang]);
    }

    for (let type in aRels) {
      type = kNaviLinkTypeConversion[type] || type;
      if (type in kNaviLinkType) {
        let others = (aRels.length > 1) ? [['rel', aRels.except(type)]] : [];

        addItem(aList, aIndex, type, aNode, attributes.concat(others));
      }
    }

    return (aList.length - startLen);
  }

  function scanSubNaviLink(aList, aIndex, aNode, aRels) {
    for (let type in aRels) {
      type = kNaviLinkTypeConversion[type] || type;
      if (!(type in kNaviLinkType)) {
        let others = (aRels.length > 1) ? [['rel', aRels.except(type)]] : [];

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

  function getURL(aDirection) {
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
    var currentURI = getURI('NO_REF');

    NaviLinkTester.init(currentURI.spec, aDirection);

    var entries = getSearchEntries();
    var link, href, text, score;

    for (link in getSearchLinks()) {
      href = link.href;
      if (!href || !/^https?:/.test(href) || currentURI.isSamePage(href) ||
        entries.contains(href))
        continue;

      for (text in getSearchTexts(link)) {
        text = trim(text);
        score = text && NaviLinkTester.score(text, href);

        if (score && isVisible(link)) {
          entries.push(text, href, score);
          break;
        }
      }
    }

    return entries.getResult();
  }

  function getSearchEntries() {
    var entries = [];
    var URLs = [];

    function detach() {
      entries.length = 0;
      URLs.length = 0;
    }

    function push(aText, aURL, aScore) {
      entries[entries.length] = {text: aText, URL: aURL, score: aScore};

      // Cache for contains()
      URLs[URLs.length] = aURL;
    }

    function contains(aURL) URLs.indexOf(aURL) > -1;

    function getResult() {
      if (!entries.length)
        return null;

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

      return list;
    }

    return {
      push: push,
      contains: contains,
      getResult: getResult
    };
  }

  function getSearchLinks() {
    const kScanLimit = 400;

    var links = getDocument().links;
    var count = links.length;

    if (kScanLimit < count) {
      let limit = Math.floor(kScanLimit / 2);

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

  function guessByNumbering(aDirection) {
    /**
     * Part like page numbers in URL
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
    if (!URI.hasPath())
      return null;

    var list = [];

    [kNumQuery, kNumEndPath].forEach(function(re) {
      var URL = URI.spec;
      var matches;
      while ((matches = re.exec(URL))) {
        let [match, leading , oldNum, trailing] = matches;

        let newNum = parseInt(oldNum, 10) + ((aDirection === 'next') ? 1 : -1);
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

    return list.length ? list : null;
  }

  return {
    getNextURL: function() getURL('next'),
    getPrevURL: function() getURL('prev'),
    getResult: getResult
  };

})();

/**
 * Evaluator of the navigation-like text and URL
 */
var NaviLinkTester = (function() {

  // Test for text
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

    // Weight of ratings
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
          // Exact match
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

  // Test for URL
  var URLLike = (function() {
    const kWeight = normalizeWeight({
      equalLength: 35,
      overlapParts: 65
    });

    var srcURL = '';

    function init(aURL) {
      srcURL = unesc(aURL);
    }

    function score(aURL) {
      var dstURL = unesc(aURL);

      return (kWeight.equalLength * getEqualLengthRate(srcURL, dstURL)) +
             (kWeight.overlapParts * getOverlapPartsRate(srcURL, dstURL));
    }

    function getEqualLengthRate(aSrc, aDst) {
      var sLen = aSrc.length, dLen = aDst.length;

      // Be less than (1.0)
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

      // Be less than (1.0)
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
 * Handler of links to the upper(top/parent) page
 */
var mUpperNavi = (function() {

  function getURLList() {
    var list = [];

    var URI = getURI('NO_QUERY');
    var URL;
    while ((URL = guessParentURL(URI))) {
      list.push(URL);

      URI = createURI(URL);
    }

    return list.length ? list : null;
  }

  function guessParentURL(aURI) {
    if (aURI.hasPath()) {
      let segments = aURI.path.replace(/\/(?:index\.html?)?$/i, '').split('/');
      segments.pop();

      let URL = aURI.prePath + segments.join('/') + '/';
      return (URL !== 'file:///') ? URL : '';
    }
    return guessUpperHost(aURI);
  }

  function guessTopURL(aURI) {
    if (aURI.scheme === 'file') {
      let match = /^(file:\/\/\/[a-z]:\/).+/i.exec(aURI.spec);
      return match ? match[1] : '';
    }
    return aURI.hasPath() ? aURI.prePath + '/' : guessUpperHost(aURI);
  }

  function guessUpperHost(aURI) {
    var host = aURI.host;
    if (!host)
      return '';

    var baseDomain = host;
    try {
      // @see resource:///modules/Services.jsm
      baseDomain = window.Services.eTLD.getBaseDomainFromHost(host);
    } catch (e) {
      // @throws NS_ERROR_UNEXPECTED host contains characters disallowed in
      // URIs.
      // @throws NS_ERROR_HOST_IS_IP_ADDRESS host is a numeric IPv4 or IPv6
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
    getParentURL:
      function() guessParentURL(getURI('NO_QUERY')),
    getTopURL:
      function() guessTopURL(getURI('NO_QUERY')),
    getURLList: getURLList
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
  var node = (typeof aTagOrNode === 'string') ?
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

function isVisible(aNode) {
  if (aNode.hidden)
    return false;

  var style = (aNode.ownerDocument.defaultView || gBrowser.contentWindow).
    getComputedStyle(aNode, '');

  return style.visibility === 'visible' && style.display !== 'none';
}

function submitForm(aSubmitInput) {
  var input = $X1(aSubmitInput);
  if (input) {
    input.form.submit();
  }
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
    if (names.every(function(name) aFormat[i].indexOf(name) > -1)) {
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
    return aURL.slice(aURL.replace(/[?#].*$/, '').lastIndexOf('/') + 1) ||
           aURL;
  }
  return '';
}

function trim(aText)
  aText ? aText.trim().replace(/\s+/g, ' ') : '';


//********** Imports

function getURLBarContextMenu()
  window.ucjsUI.URLBar.contextMenu;

function $SA(aSelector)
  window.ucjsUtil.getNodesBySelector(aSelector);

function $X1(aXPath)
  window.ucjsUtil.getFirstNodeByXPath(aXPath);

function addEvent(aData)
  window.ucjsUtil.setEventListener(aData);

function unesc(aURL)
  window.ucjsUtil.unescapeURLCharacters(aURL);

function U(aText)
  window.ucjsUtil.toStringForUI(aText);

function openURL(aURL, aInTab, aOption)
  window.ucjsUtil.openURLIn(aURL, aInTab, aOption);

function log(aMsg)
  window.ucjsUtil.logMessage('NaviLink.uc.js', aMsg);


//********** Entry point

function NaviLink_init() {
  mMenu.init();
}

NaviLink_init();


//********** Expose

return {
  getNext:   mSiblingNavi.getNextURL,
  getPrev:   mSiblingNavi.getPrevURL,
  getParent: mUpperNavi.getParentURL,
  getTop:    mUpperNavi.getTopURL
};


})(this);
