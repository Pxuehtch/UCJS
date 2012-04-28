// ==UserScript==
// @name NaviLink.uc.js
// @description Detects the links for navigation.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the URLbar context menu.
// @note Some functions are exported to global (ucjsNaviLink.XXX).


var ucjsNaviLink = (function() {


"use strict";


// Preferences.

const kPref = {
  // Show page information menu.
  showPageInfo: true,
  // Show unregistered navigation links.
  showSubNaviLinks: true,
  // Max number of guessed siblings.
  maxGuessSiblingsNum: 3,
  // Max number of items of each categories in navigation links.
  maxNaviLinkItemsNum: 30
};

/**
 * User presets.
 * @key name {string} Display name. U() for UI.
 * @key URL {RegExp}
 * @key submit {boolean}
 *   true: Scan form and submit.
 *   false[default]: Scan link and open URL.
 * @key prev {XPath}
 *   If submit is true, set xpath of <input>.
 *   If submit is false, set xpath of element which has URL.
 * @key next {XPath}
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
    submit: true,
    prev: '//input[@class="navbutton" and @value[contains(.,"Prev")]]',
    next: '//input[@class="navbutton" and @value[contains(.,"Next")]]'
  }
  //,
];

/**
 * Items of link navigations.
 * @note Key is 'rel' attribute of <link> or linkable element.
 * @note Displayed in this order. U() for UI.
 */
const kNaviLink = U({
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
 * Synonymous keys.
 * @note Value is in a key of kNaviLink.
 */
const kNaviLinkConversion = {
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
 * Items of page infomation.
 * @note Displayed in this order. U() for UI.
 */
const kPageInfo = U({
  meta:       'Meta',
  feed:       'Feed',
  stylesheet: 'Stylesheet',
  script:     'Script',
  favicon:    'Favicon'
});

/**
 * Types of a prev/next navigation.
 * @note U() for UI display.
 */
const kSiblingScanType = U({
  preset:    'プリセット',
  official:  '公式',
  searching: '推測(リンク)',
  numbering: '推測(URL)'
});

/**
 * Strings format.
 * @see format().
 * @note U() for UI display.
 */
const kFormat = U({
  // Main categories.
  upper: '上の階層',
  prev: '前ページ - %scanType%',
  next: '次ページ - %scanType%',
  naviLink: 'Navi Link',
  pageInfo: 'Page Info',

  // Title of siblings.
  preset: '[%name%] %title%',
  official: '%title%',
  searching: '%title% (%score%)',
  numbering: '%old% -> %new%',
  // Tooltip of submit mode of preset.
  submit: '<FORM> submit',

  // Sub items of NaviLink or PageInfo.
  type: '%title%%count%{ (%>1%)}',
  tooManyItems: '項目が多いので表示を制限 (%count%/%total%)',
  item: '%title%%attributes%{ [%%]}',
  noMetaContent: '[No content]'
});

/**
 * Identifiers.
 */
const kID = (function() {
  const prefix = 'ucjs_navilink_';
  const keys = [
    'upper', 'prev', 'next', 'naviLink', 'pageInfo',
    'startSeparator', 'endSeparator', 'pageInfoSeparator'
  ];

  var hash = {prefix: prefix};
  keys.forEach(function(a) {
    hash[a] = prefix + a;
  });

  return hash;
})();


// Handlers.

/**
 * Handler of the menu settings.
 */
var mMenu = (function() {

  function init() {
    var contextMenu = getURLBarContextMenu();

    setSeparators(contextMenu);

    addEvent([contextMenu, 'click', onCommand, false]);
    addEvent([contextMenu, 'popupshowing', onPopupShowing, false]);
  }

  function onCommand(aEvent) {
    aEvent.stopPropagation();

    var item = aEvent.target;

    // checks whether this event comes from an item of NaviLink.
    var contextMenu = getURLBarContextMenu();
    var node = item, id = node.id;
    while (node !== contextMenu && !id) {
      node = node.parentNode;
      id = node.id;
    }
    if (!id || id.indexOf(kID.prefix) !== 0)
      return;

    if (aEvent.button === 2)
      return;
    if (aEvent.button === 1) {
      closeMenus(item);
    }

    var value = item.value;
    if (!value)
      return;

    if (/^(?:https?|ftp|file):/.test(item.value)) {
      let inTab = aEvent.button === 1, inBackground = aEvent.ctrlKey;
      openURL(item.value, inTab, {inBackground: inBackground, relatedToCurrent: true});
    } else {
      submitForm(item.value);
    }
  }

  function onPopupShowing(aEvent) {
    aEvent.stopPropagation();

    var contextMenu = aEvent.target;
    if (contextMenu !== getURLBarContextMenu())
      return;

    var [sSep, eSep] = getSeparators();

    // Remove existing items.
    for (let item; (item = sSep.nextSibling) !== eSep; /**/) {
      contextMenu.removeChild(item);
    }

    if (!/^(?:https?|ftp|file)$/.test(getCurrentURI().scheme))
      return;

    var isHtmlDocument = gBrowser.contentDocument instanceof HTMLDocument;

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

  function setSeparators(aContextMenu) {
    // @note ucjsUI_manageContextMenuSeparators() manages the visibility of separators.
    aContextMenu.appendChild($E('menuseparator', {'id': kID.startSeparator}));
    aContextMenu.appendChild($E('menuseparator', {'id': kID.endSeparator}));
  }

  function getSeparators() {
    function $ID(id) document.getElementById(id);

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
          'value': URL
        }));
      });
    }

    var menu = $E('menu', {
      'id': kID.upper,
      'label': format(kFormat.upper),
      'disabled': list === null || null
    });
    menu.appendChild(popup);

    return menu;
  }

  function buildSiblingNavi(aDirection) {
    var state = mSiblingNavi.getState(aDirection);
    if (!state)
      return null;

    var {list, scanType} = state;
    if ((scanType === 'searching' || scanType === 'numbering') &&
        list.length > kPref.maxGuessSiblingsNum) {
      list = list.slice(0, kPref.maxGuessSiblingsNum);
    }

    var element;

    if (list.length === 1) {
      let {text, URL, submit} = list[0];
      let description = submit ? kFormat.submit : URL;

      element = $E('menuitem', {
        'tooltiptext':
          makeTooltip(getFormedText(text, {'siblingScanType': scanType}), description),
        'value': URL || submit
      });
    } else {
      let popup = $E('menupopup');

      list.forEach(function({text, URL}) {
        popup.appendChild($E('menuitem', {
          'label': getFormedText(text, {'siblingScanType': scanType}),
          'tooltiptext': URL,
          'value': URL
        }));
      });

      element = $E('menu');
      element.appendChild(popup);
    }

    $E(element, {
      'id': kID[aDirection],
      'label': format(kFormat[aDirection], {'scanType': kSiblingScanType[scanType]})
    });

    return element;
  }

  function buildNaviLink() {
    var naviList = mNaviLink.getNaviList(),
        subNaviList = kPref.showSubNaviLinks ? mNaviLink.getSubNaviList() : null;
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
          let {text, URL} = list[type][0];

          child = $E('menuitem', {
            'tooltiptext': makeTooltip(getFormedText(text), URL),
            'value': URL
          });
        } else {
          let childPopup = $E('menupopup');

          let censored = list[type].length > kPref.maxNaviLinkItemsNum;

          list[type].some(function({text, URL}, i) {
            childPopup.appendChild($E('menuitem', {
              'crop': 'center',
              'label': getFormedText(text),
              'tooltiptext': URL,
              'value': URL
            }));

            return censored && i >= kPref.maxNaviLinkItemsNum - 1;
          });

          child = $E('menu');
          child.appendChild(childPopup);

          itemCount = childPopup.childElementCount;
          if (censored) {
            tooltip = format(kFormat.tooManyItems,
              {'count': itemCount, 'total': list[type].length});
          }
        }

        popup.appendChild($E(child, {
          'label': format(kFormat.type,
            {'title': kNaviLink[type] || type, 'count': itemCount}),
          'tooltiptext': tooltip
        }));
      }
    });

    var menu = $E('menu', {'id': kID.naviLink, 'label': format(kFormat.naviLink)});
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
        list[type].forEach(function({text, URL}) {
          childPopup.appendChild($E('menuitem', {
            'closemenu': 'none',
            'label': getFormedText(text, {'metaContent': URL}),
            'tooltiptext': URL || format(kFormat.noMetaContent)
          }));
        });
      } else {
        list[type].forEach(function({text, URL}) {
          childPopup.appendChild($E('menuitem', {
            'crop': 'center',
            'label': getFormedText(text),
            'tooltiptext': URL,
            'value': URL
          }));
        });
      }

      let child = $E('menu');
      child.appendChild(childPopup);
      popup.appendChild($E(child, {
        'label': format(kFormat.type,
          {'title': kPageInfo[type], 'count': childPopup.childElementCount})
      }));
    }

    var menu = $E('menu', {'id': kID.pageInfo, 'label': format(kFormat.pageInfo)});
    menu.appendChild(popup);

    return menu;
  }

  function getFormedText(aText, aOption) {
    aOption = aOption || {};

    if ('siblingScanType' in aOption) {
      switch (aOption.siblingScanType) {
        case 'preset':
          return format(kFormat.preset,
            {'name': aText[0], 'title': aText[1]});
        case 'official':
          return format(kFormat.official,
            {'title': aText[0]});
        case 'searching':
          return format(kFormat.searching,
            {'title': aText[0], 'score': trimFigures(aText[1])});
        case 'numbering':
          return format(kFormat.numbering,
            {'old': aText[0], 'new': aText[1]});
      }
      return null;
    }

    if ('metaContent' in aOption) {
      return format(kFormat.item, {
        'title': formatAttributes([[aText[0], aOption.metaContent]]),
        'attributes': null
      });
    }

    return format(kFormat.item, {
      'title': aText[0], 'attributes': formatAttributes(aText[1])
    });
  }

  /**
   * Formats attributes.
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
      attributes.push(format(kAttributeFormat, {'name': name, 'value': value}));
    });

    return attributes.join(kAttributesDelimiter);
  }

  function makeTooltip(aText, aURL)
    (aText && aText !== getLeaf(aURL)) ? aText + '\n' + aURL : aURL;

  return {
    init: init
  };

})();


/**
 * Handler of the user preset navigation links.
 */
var mPresetNavi = (function() {

  function getItem(aDirection) {
    var item = null;

    var URL = getCurrentURI().spec;

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
          text: [item.name, trim(node.title) || trim(node.textContent) || ''],
          URL: node.href
        };
      } else if (item.submit && node && node.value) {
        return {
          text: [item.name, trim(node.value)],
          submit: item[aDirection]
        };
      } else {
        log('Match preset: %name% ->\n%dir%: \'%xpath%\' is not found.'.
          replace('%name%', item.name).
          replace('%dir%', aDirection).
          replace('%xpath%', item[aDirection]));
        return {error: true};
      }
    }
    return null;
  }

  return {
    getItem: getItem
  };

})();


/**
 * Handler of official navigation links according to 'rel' attribute.
 * @note [Additional] makes the list of page information.
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
    var URI = getCurrentURI();

    if (!URI.isSamePage(mWorkURL)) {
      mWorkURL = URI.spec;
      [mNaviList, mSubNaviList, mInfoList] = getLinkList();
    }
  }

  function getTypeItem(aList, aType) {
    return aList && aList[aType] && aList[aType][0];
  }

  function getNaviList(aType) {
    init();
    return aType ? getTypeItem(mNaviList, aType) : mNaviList;
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
    // Keep the order list of sort to the first item.
    var naviList = [kNaviLink], subNaviList = [{}], infoList = [kPageInfo];

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
        function(a, b) order.indexOf(a.type) - order.indexOf(b.type) || a.index - b.index :
        function(a, b) a.type.localeCompare(b.type) || a.index - b.index
      );

      var res = {};

      list.forEach(function({type, text, URL}) {
        !(type in res) && (res[type] = []);

        if (!res[type].some(function(a) a.text[0] === text[0] && a.URL === URL)) {
          res[type].push({text: text, URL: URL});
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
    var d = gBrowser.contentDocument;
    var metas = Array.slice(d.getElementsByTagName('meta'));

    // Make sure that the meta list is not empty.
    if (!metas.some(function(a) a.httpEquiv && a.httpEquiv.toLowerCase() === 'content-type')) {
      metas.unshift({
        httpEquiv: 'Content-Type',
        content: d.contentType + ';charset=' + d.characterSet
      });
    }

    // @note Meta list member, {URL: content}, would be not a URL string.
    metas.forEach(function(a, i) {
      var name = a.name || a.httpEquiv || a.getAttribute('property');
      if (name) {
        aList.push(newItem(i, {title: name, href: a.content}, 'meta'));
      }
    });
  }

  function scanScript(aList) {
    var d = gBrowser.contentDocument;

    Array.forEach(d.getElementsByTagName('script'), function(node, i) {
      if (node.src) {
        aList.push(newItem(i, node, 'script'));
      }
    });
  }

  function scanInfoLink(aList, aIndex, aNode, aRels) {
    var type = '', attributes = [];

    if (aRels.feed || (aNode.type && aRels.alternate && !aRels.stylesheet)) {
      let feedType = isValidFeed(aNode, gBrowser.contentDocument.nodePrincipal, aRels.feed);
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
      aList.push(newItem(aIndex, aNode, type, attributes));
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
      type = kNaviLinkConversion[type] || type;
      if (type in kNaviLink) {
        let others = (aRels.length > 1) ? [['rel', aRels.except(type)]] : [];

        aList.push(newItem(aIndex, aNode, type, others.concat(attributes)));
      }
    }

    return (aList.length - startLen);
  }

  function scanSubNaviLink(aList, aIndex, aNode, aRels) {
    for (let type in aRels) {
      type = kNaviLinkConversion[type] || type;
      if (!(type in kNaviLink)) {
        let others = (aRels.length > 1) ? [['rel', aRels.except(type)]] : [];

        aList.push(newItem(aIndex, aNode, type, others));
      }
    }
  }

  /**
   * Creates a new list item.
   * @param aIndex {int}
   * @param aNode {Node}
   * @param aType {kNaviLink or kPageInfo}
   * @param aAttributes {array}
   *   [['name1', 'value1'], ['name2', ['value1', 'value2']]]
   * @return {hash}
   */
  function newItem(aIndex, aNode, aType, aAttributes) {
    var hasContent = !/^(?:meta|script|link)$/.test(aNode.localName);
    var URL = aNode.href || aNode.src;
    var text = [
      trim(aNode.title) || (hasContent && trim(aNode.textContent)) || getLeaf(URL) || '',
      aAttributes
    ];

    return {index: aIndex, type: aType, text: text, URL: URL};
  }

  return {
    getNaviList: getNaviList,
    getSubNaviList: getSubNaviList,
    getInfoList: getInfoList
  };

})();


/**
 * Handler of links to the sibling(prev/next) page.
 */
var mSiblingNavi = (function() {

  function getURL(aDirection) {
    var state = getState(aDirection);

    return state ? state.list[0].URL : '';
  }

  function getState(aDirection) {
    var res = null;
    // Set keys of kSiblingScanType.
    var scanType = '';

    if (!res) {
      res = mPresetNavi.getItem(aDirection);
      scanType = 'preset';
    }

    if (!res) {
      res = mNaviLink.getNaviList(aDirection);
      scanType = 'official';
    }

    if (!res) {
      res = guessBySearching(aDirection);
      scanType = 'searching';
    }

    if (!res) {
      res = guessByNumbering(aDirection);
      scanType = 'numbering';
    }

    if (res && !res.error) {
      return {list: Array.isArray(res) ? res : [res], scanType: scanType};
    }
    return null;
  }

  function guessBySearching(aDirection) {
    var currentURI = getCurrentURI('NO_REF');

    naviTester.init(currentURI.spec, aDirection);

    var entries = getSearchEntries();
    var link, href, text, score;

    for (link in getSearchLinks()) {
      href = link.href;
      if (!href || !/^https?:/.test(href) || currentURI.isSamePage(href) ||
        entries.contains(href))
        continue;

      for (text in getSearchTexts(link)) {
        text = trim(text);
        score = text && naviTester.score(text, href);

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

      // Cache for contains().
      URLs[URLs.length] = aURL;
    }

    function contains(aURL) URLs.indexOf(aURL) > -1;

    function getResult() {
      if (!entries.length)
        return null;

      entries.sort(function(a, b) b.score - a.score);

      var list = entries.map(function({text, URL, score}) {
        return {text: [text, score], URL: URL};
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

    var links = gBrowser.contentDocument.links;
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

  /**
   * Evaluator of the navigation-like text and URL.
   */
  var naviTester = (function() {

    // Test for text.
    var textLike = (function() {
      // &lsaquo;(<):\u2039, &laquo;(<<):\u00ab, ＜:\uff1c, ≪:\u226a, ←:\u2190
      // &rsaquo;(>):\u203a, &raquo;(>>):\u00bb, ＞:\uff1e, ≫:\u226b, →:\u2192
      const kNaviSign = {
        prev: '<|\\u2039|\\u00ab|\\uff1c|\\u226a|\\u2190',
        next: '>|\\u203a|\\u00bb|\\uff1e|\\u226b|\\u2192'
      };

      // 前:\u524D, 古い:\u53e4\u3044
      // 次:\u6b21, 新し:\u65b0\u3057
      const kNaviWord = {
        prev: ['prev(?:ious)?|old(?:er)?|back(?:ward)?|less', '\\u524d|\\u53e4\\u3044'],
        next: ['next|new(?:er)?|forward|more', '\\u6b21|\\u65b0\\u3057']
      };

      // Weight of ratings.
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
        naviWord = RegExp('(?:^|^.{0,10}[\\s-_])(?:' + word[0] + ')(?:$|[\\s-_.])|^(?:' +  word[1] + ')', 'i');
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
            // Exact match.
            point += kWeight.lessText;
          }
        }

        return point;
      }

      function removeMatched(aText, aMatched) aText.replace(aMatched, '').trim();

      return {
        init: init,
        score: score
      };
    })();

    // Test for URL.
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

        // Be less than (1.0).
        return 1 - (Math.abs(sLen - dLen) / (sLen + dLen));
      }

      function getOverlapPartsRate(aSrc, aDst) {
        var [sParts, dParts] = [aSrc, aDst].map(function(a) a.split(/[/?&=#;]+/));

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

        // Be less than (1.0).
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
      for each (let value in aWeights) {
        total += value;
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

  function guessByNumbering(aDirection) {
    /**
     * Part like page numbers in URL.
     * @const kNumQuery {RegExp}
     *   Query with a numeric value; [?&]page=123 or [?&]123
     * @const kNumEndPath {RegExp}
     *   Path ended with numbers; (abc)123 or (abc)123.jpg or (abc)123/
     */
    const kNumQuery = /([?&](?:[a-z_-]{1,20}=)?)(\d{1,12})(?=$|&)/ig,
          kNumEndPath = /(\/[a-z0-9_-]{0,20}?)(\d{1,12})(\.\w+|\/)?(?=$|\?)/ig;

    var URI = getCurrentURI('NO_REF');
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
          list.push({text: [match, newVal], URL: URL.replace(match, newVal)});
        }
      }
    });

    return list.length ? list : null;
  }

  return {
    getNextURL: function() getURL('next'),
    getPrevURL: function() getURL('prev'),
    getState: getState
  };

})();


/**
 * Handler of links to the upper(top/parent) page.
 */
var mUpperNavi = (function() {

  function getURLList() {
    var list = [];

    var URI = getCurrentURI('NO_QUERY');
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
      baseDomain = Services.eTLD.getBaseDomainFromHost(host);
    } catch (e) {
      // @throws NS_ERROR_UNEXPECTED host contains characters disallowed in URIs.
      // @throws NS_ERROR_HOST_IS_IP_ADDRESS host is a numeric IPv4 or IPv6 address.
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
    getParentURL: function() guessParentURL(getCurrentURI('NO_QUERY')),
    getTopURL: function() guessTopURL(getCurrentURI('NO_QUERY')),
    getURLList: getURLList
  };

})();


// Utilities.

/**
 * Wrapper of URI object.
 */
function getCurrentURI(aFlags) createURI(gBrowser.currentURI, aFlags);

function createURI(aURI, aFlags) {
  if (!(aURI instanceof Ci.nsIURI)) {
    aURI = makeURI(aURI, null, null);
  }

  var host;
  try {
    // host of 'file:///C:/...' is ''.
    host = aURI.host;
  } catch (e) {
    host = aURI.spec.match(/^(?:[a-z]+:\/\/)?(?:[^\/]+@)?\[?(.+?)\]?(?::\d+)?(?:\/|$)/)[1];
  }

  var {path, spec} = aURI;
  switch (aFlags) {
    case 'NO_QUERY':
      path = removeQuery(path);
      spec = removeQuery(spec);
      // Fall through.

    case 'NO_REF':
      path = removeRef(path);
      spec = removeRef(spec);
      break;
  }

  function removeQuery(a) a.replace(/\?.*$/, '');
  function removeRef(a) a.replace(/#.*$/, '');

  return {
    scheme: aURI.scheme,
    host: host,
    prePath: aURI.prePath,
    path: path,
    spec: spec,
    hasPath: function() path !== '/',
    isSamePage: function(aTestURL) removeRef(aTestURL) === removeRef(spec)
  };
}

function $E(aTagOrNode, aAttribute) {
  var element = (typeof aTagOrNode === 'string') ?
    document.createElement(aTagOrNode) : aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value !== null && typeof value !== 'undefined') {
        element.setAttribute(name, value);
      }
    }
  }

  return element;
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
 * Formats string.
 * @param aFormat {string} kFormat.
 * @param aAttribute {hash} {name, value}
 * @return {string} a formatted string.
 * @usage
 *   aFormat:'%key% has %num% letters' and aAttribute:{key:'ABC',num:3} into
 *   'ABC has 3 letters'
 * @usage A conditional replacement
 *   aFormat:'%num%{%(>1)% letters}' and aAttribute:{num:#} into
 *   #>1 -> '# letters', otherwise -> ''
 */
function format(aFormat, aAttribute) {
  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      name = '%' + name + '%';
      // When value is null or undefined or '', the match word will be removed.
      if (value === null || typeof value === 'undefined') {
        value = '';
      }

      let [conditional, condition] = aFormat.match(RegExp(name + '\{(.+?)\}')) || [];
      if (conditional) {
        let result = '';

        if (value !== '') {
          let [target, expression] = condition.match(/%(.*?)%/) || [];
          if (target) {
            let right = true;

            if (expression) {
              let val = (typeof value === 'string') ? '"' + value + '"' : value;
              try {
                right = Function('return ' + val + expression)();
              } catch (e) {
                right = false;
              }
            }

            if (right) {
              result = condition.replace(target, name);
            }
          }
        }
  
        aFormat = aFormat.replace(conditional, result);
      }

      aFormat = aFormat.replace(name, value);
    }
  }

  return trim(aFormat);
}

function getLeaf(aURL) {
  if (aURL) {
    return aURL.slice(aURL.replace(/[?#].*$/, '').lastIndexOf('/') + 1) || aURL;
  }
  return '';
}

function trim(aText) aText ? aText.trim().replace(/\s+/g, ' ') : '';

function trimFigures(aNumber) (+aNumber).toFixed(5);

/**
 * Converts 2-byte characters into UTF-16 in order to properly display UI.
 * @param aData {string}|{hash}
 */
function U(aData) {
  if (typeof aData === 'string') {
    return str4ui(aData);
  }

  for (let i in aData) {
    aData[i] = str4ui(aData[i]);
  }
  return aData;
}


// Imports.

function getURLBarContextMenu()
  ucjsUI.URLBar.contextMenu;

function $SA(aSelector)
  ucjsUtil.getNodesBySelector(aSelector);

function $X1(aXPath)
  ucjsUtil.getFirstNodeByXPath(aXPath);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function unesc(aURL)
  ucjsUtil.unescapeURLCharacters(aURL);

function str4ui(aText)
  ucjsUtil.convertForSystem(aText);

function openURL(aURL, aInTab, aOption)
  ucjsUtil.openURLIn(aURL, aInTab, aOption);

function log(aMsg)
  ucjsUtil.logMessage('NaviLink.uc.js', aMsg);


// Entry point.

function NaviLink_init() {
  mMenu.init();
}

NaviLink_init();


// Exports to global.

return {
  getNext:   mSiblingNavi.getNextURL,
  getPrev:   mSiblingNavi.getPrevURL,
  getParent: mUpperNavi.getParentURL,
  getTop:    mUpperNavi.getTopURL
};


})();
