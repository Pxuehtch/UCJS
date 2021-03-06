// ==UserScript==
// @name NaviLink.uc.js
// @description Detects the links for navigations.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage Some menus and menuitems are added in the URLbar context menu.

// @note Reopen the context menu for the same document and the cached result
// will be listed. Open it with the <Alt> key and the list will be rebuilt.

// @note This script scans the top content document only and does not traverse
// frames.

// @note Some functions are exposed (window.ucjsNaviLink.XXX).


window.ucjsNaviLink = (function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  ContentTask,
  EventManager,
  Listeners: {
    $page,
    $pageOnce,
    $shutdown
  },
  DOMUtils: {
    init$E,
    $ID
  },
  URLUtils,
  TabUtils,
  BrowserUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

// Makes $E with the attributes handler.
const $E = init$E(handleAttribute);

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
 * @key url {RegExp}
 *   A URL of a page that has the navigations.
 *
 * @key prev {XPath}
 *   A navigation element for the previous page.
 * @key next {XPath}
 *   A navigation element for the next page.
 *   @note Command actions:
 *   - Opens the URL for the element which has 'href' attribute.
 *   - Submits with the form for the <input> element.
 */
const kPresetNavi = [
  {
    name: 'Google Search',
    url: /^https:\/\/www\.google\.(?:com|co\.jp)\/(?:#|search|webhp).+/,
    prev: 'id("nav")//td[1]/a | id("nf")/parent::a',
    next: 'id("nav")//td[last()]/a | id("nn")/parent::a'
  },
  {
    name: 'DuckDuckGo Search',
    url: /^https:\/\/duckduckgo.com\/(?:html|lite)/,
    prev: './/input[@type="submit" and @value[starts-with(.,"Prev")]]',
    next: './/input[@type="submit" and @value[starts-with(.,"Next")]]'
  }
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
 * @note %alias% is fixed by |MenuUI::$f()|.
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
    // No navigation warning in preset page.
    presetNoNavigation: '<No navigation>',
    // Submit mode warning in preset page.
    presetSubmitMode: '<submit mode>',

    // Items of |NaviLink| / |PageInfo|.
    type: ['%title%', '%title% (%count%)'],
    data: ['%title%', '%title% [%attributes%]'],
    meta: '%name%: %content%',
    // Menu item numbers limitation warning.
    tooManyMenuItems: '項目が多いので表示を制限',
    // The max number of menu items in a menu.
    // @note all <meta> data shows without limit.
    maxNumMenuItems: 20
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
        ['click', onClick],
        ['command', onCommand],
        ['popupshowing', onPopupShowing],
        ['popuphiding', onPopupHiding]
      ],

      onCreate: createMenu
    });
  }

  function createMenu(contextMenu) {
    // TODO: Make the insertion position of items fixed for useful access.
    // WORKAROUND: Appends to the end of the context menu items at this time.
    setSeparators(contextMenu);
  }

  function onClick(event) {
    let item = event.target;

    let data = item[kDataKey.commandData];

    if (!data) {
      return;
    }

    if (event.button === 1) {
      // @see chrome://browser/content/utilityOverlay.js::closeMenus
      window.closeMenus(item);
      onCommand(event);
    }
  }

  function onCommand(event) {
    let item = event.target;

    let data = item[kDataKey.commandData];

    if (!data) {
      return;
    }

    /**
     * command: Load in current tab.
     * <Ctrl> / <MiddleClick>: Open a new tab.
     * <Ctrl+Shift> / <Shift+MiddleClick>: Open a new tab in background.
     */
    let {ctrlKey, shiftKey, button} = event;
    let [inTab, inBackground] = [ctrlKey || button === 1, shiftKey];

    if (data.open) {
      if (!/^(?:https?|ftp|file):/.test(data.open)) {
        warn('Invalid scheme to open:\n' + data.open);

        return;
      }

      TabUtils.openURL(data.open, {
        inTab,
        inBackground,
        relatedToCurrent: true
      });
    }
    else if (data.submit) {
      (async () => {
        let browser;

        if (inTab) {
          let newTab = gBrowser.duplicateTab(gBrowser.selectedTab);

          // Wait for the duplicated tab to complete.
          await EventManager.promiseEvent(newTab, 'SSTabRestored');

          browser = gBrowser.getBrowserForTab(newTab);

          if (!inBackground) {
            gBrowser.selectedTab = newTab;
          }
        }

        $pageOnce('pageready', {
          browser,
          listener: () => {
            ContentTask.spawn({
              browser,
              params: {
                formIndex: data.submit.formIndex
              },
              task: function*(params) {
                let {formIndex} = params;

                try {
                  let form = content.document.forms[formIndex];

                  if (form) {
                    form.submit();

                    return true;
                  }
                }
                catch(ex) {}

                return false;
              }
            }).
            then((submitted) => {
              if (!submitted) {
                warn(`Cannot submit form: ${data.submit.name}`);
              }
            }).
            catch(Cu.reportError);
          }
        });
      })().
      catch(Cu.reportError);;
    }
  }

  function onPopupShowing(event) {
    let contextMenu = event.currentTarget;

    if (event.target !== contextMenu) {
      return;
    }

    if (event.altKey) {
      DataCache.purgeCache();
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

  function setSeparators(contextMenu) {
    [
      kUI.startSeparator,
      kUI.endSeparator
    ].
    forEach((separatorName) => {
      contextMenu.appendChild($E('menuseparator', {
        id: separatorName.id
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
   * Create a promise object for building menu items asynchronously.
   */
  function createPromiseBuild(placeholder, builder) {
    let contextMenu = URLBarContextMenu.get();
    let [, endSeparator] = getSeparators();

    contextMenu.insertBefore(placeholder, endSeparator);

    return (async () => {
      let item = await builder();

      // Do nothing if the context menu has been closed.
      if (!URLBarContextMenu.isOpen()) {
        return;
      }

      if (item) {
        contextMenu.replaceChild(item, placeholder);
      }
    })();
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

  async function buildUpperNavi() {
    let upperURLList = await UpperNavi.promiseUpperURLList();

    if (!upperURLList) {
      return null;
    }

    let upperNaviPopup = $E('menupopup');

    upperURLList.forEach((url) => {
      upperNaviPopup.appendChild($E('menuitem', {
        crop: 'start',
        label: url,
        [$a('open')]: url
      }));
    });

    let upperNaviMenu = $E('menu', {
      id: kUI.upper.id,
      label: kUI.upper.label
    });

    upperNaviMenu.appendChild(upperNaviPopup);

    return upperNaviMenu;
  }

  /**
   * SiblingNavi builder.
   */
  function promiseSiblingNavi(direction) {
    let placeholder = $E('menuitem', {
      id: kUI[direction].id,
      hidden: true
    });

    return createPromiseBuild(placeholder, () => buildSiblingNavi(direction));
  }

  async function buildSiblingNavi(direction) {
    let siblingData = await SiblingNavi.promiseSiblingData(direction);

    if (!siblingData) {
      return null;
    }

    let {scanType, dataItems} = siblingData;

    let siblingNaviMenuElement;

    if (dataItems.length === 1) {
      let data = dataItems[0];

      let tooltiptext, command;

      if (data.url) {
        tooltiptext = data.url;
        command = {
          key: 'open',
          value: data.url
        };
      }
      else if (data.formIndex) {
        tooltiptext = kUI.items.presetSubmitMode;
        command = {
          key: 'submit',
          value: {
            name: data.name,
            formIndex: data.formIndex
          }
        };
      }
      else {
        tooltiptext = kUI.items.presetNoNavigation;
      }

      tooltiptext = formatTooltip(
        formatText(data, {
          siblingScanType: scanType
        }),
        tooltiptext
      );

      siblingNaviMenuElement = $E('menuitem', {
        tooltiptext
      });

      if (command) {
        $E(siblingNaviMenuElement, {
          [$a(command.key)]: command.value
        });
      }
      else {
        $E(siblingNaviMenuElement, {
          disabled: true
        });
      }
    }
    else {
      let siblingNaviPopup = $E('menupopup');

      dataItems.forEach((data) => {
        let text = formatText(data, {
          siblingScanType: scanType
        });

        siblingNaviPopup.appendChild($E('menuitem', {
          label: text,
          tooltiptext: formatTooltip(text, data.url),
          [$a('open')]: data.url
        }));
      });

      siblingNaviMenuElement = $E('menu');
      siblingNaviMenuElement.appendChild(siblingNaviPopup);
    }

    $E(siblingNaviMenuElement, {
      id: kUI[direction].id,
      label: $f(kUI[direction].label, {
        scanType: kSiblingScanType[scanType]
      })
    });

    return siblingNaviMenuElement;
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

  async function buildNaviLink() {
    let [naviLinkList, subNaviLinkList] = await Promise.all([
      NaviLink.promiseNaviLinkList(),
      NaviLink.promiseSubNaviLinkList()
    ]);

    if (!naviLinkList && !subNaviLinkList) {
      return null;
    }

    let naviLinkPopup = $E('menupopup');

    [naviLinkList, subNaviLinkList].forEach((linkList) => {
      if (!linkList) {
        return;
      }

      if (naviLinkPopup.hasChildNodes()) {
        naviLinkPopup.appendChild($E('menuseparator'));
      }

      linkList.forEach(({type, dataItems}) => {
        let typeMenu = $E('menu');
        let typePopup = typeMenu.appendChild($E('menupopup'));

        let maxNumMenuItems = kUI.items.maxNumMenuItems;
        let typeItems = dataItems.slice(0, maxNumMenuItems);

        typeItems.forEach((data) => {
          let text = formatText(data);

          typePopup.appendChild($E('menuitem', {
            crop: 'center',
            label: text,
            tooltiptext: formatTooltip(text, data.url),
            [$a('open')]: data.url
          }));
        });

        let label = $f(kUI.items.type, {
          title: getLabelForType(kNaviLinkType, type),
          count: formatMenuItemsCount(dataItems)
        });

        let tooltiptext;

        if (dataItems.length > maxNumMenuItems) {
          tooltiptext = formatTooltip(label, kUI.items.tooManyMenuItems);
        }

        naviLinkPopup.appendChild($E(typeMenu, {
          label,
          tooltiptext
        }));
      });
    });

    let naviLinkMenu = $E('menu', {
      id: kUI.naviLink.id,
      label: kUI.naviLink.label
    });

    naviLinkMenu.appendChild(naviLinkPopup);

    return naviLinkMenu;
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

  async function buildPageInfo() {
    let pageInfoList = await NaviLink.promisePageInfoList();

    if (!pageInfoList) {
      return null;
    }

    let pageInfoPopup = $E('menupopup');

    pageInfoList.forEach(({type, dataItems}) => {
      let typeMenu = $E('menu');
      let typePopup = typeMenu.appendChild($E('menupopup'));

      let maxNumMenuItems = kUI.items.maxNumMenuItems;
      let metaInfo = type === 'meta';

      if (metaInfo) {
        dataItems.sort((a, b) => {
          return a.name.localeCompare(b.name) ||
                 a.content.localeCompare(b.content);
        });

        let metaGroupList = {};
        let metaAloneItems = [];

        dataItems.forEach((data) => {
          let metaGroupName = (/^(.+?)[:.].+/.exec(data.name) || [])[1];

          if (metaGroupName) {
            if (!(metaGroupName in metaGroupList)) {
              metaGroupList[metaGroupName] = [];
            }

            metaGroupList[metaGroupName].push(data);
          }
          else {
            metaAloneItems.push(data);
          }
        });

        metaAloneItems.forEach((data) => {
          typePopup.appendChild(createMetaMenuItem(data));
        });

        for (let metaGroupName in metaGroupList) {
          let metaGroupPopup = $E('menupopup');

          let metaGroupItems = metaGroupList[metaGroupName];

          metaGroupItems.forEach((data) => {
            metaGroupPopup.appendChild(createMetaMenuItem(data));
          });

          let metaGroupMenu = $E('menu', {
            label: $f(kUI.items.type, {
              title: metaGroupName,
              count: formatMenuItemsCount(metaGroupItems, {
                noLimit: true
              })
            })
          });

          metaGroupMenu.appendChild(metaGroupPopup);
          typePopup.appendChild(metaGroupMenu);
        }
      }
      else {
        let typeItems = dataItems.slice(0, maxNumMenuItems);

        typeItems.forEach((data) => {
          let text = formatText(data);

          typePopup.appendChild($E('menuitem', {
            crop: 'center',
            label: text,
            tooltiptext: formatTooltip(text, data.url),
            [$a('open')]: data.url
          }));
        });
      }

      let label = $f(kUI.items.type, {
        title: getLabelForType(kPageInfoType, type),
        count: formatMenuItemsCount(dataItems, {
          noLimit: metaInfo
        })
      });

      let tooltiptext;

      if (!metaInfo && dataItems.length > maxNumMenuItems) {
        tooltiptext = formatTooltip(label, kUI.items.tooManyMenuItems);
      }

      pageInfoPopup.appendChild($E(typeMenu, {
        label,
        tooltiptext
      }));
    });

    let pageInfoMenu = $E('menu', {
      id: kUI.pageInfo.id,
      label: kUI.pageInfo.label
    });

    pageInfoMenu.appendChild(pageInfoPopup);

    return pageInfoMenu;
  }

  function createMetaMenuItem(data) {
    let text = formatText(data, {
      meta: true
    });

    // Shows <meta> information with no command.
    return $E('menuitem', {
      closemenu: 'none',
      label: text,
      tooltiptext: text
    });
  }

  /**
   * String format functions.
   */
  function formatText(dataItem, options = {}) {
    let {siblingScanType, meta} = options;

    if (siblingScanType) {
      switch (siblingScanType) {
        case 'preset': {
          return $f(kUI.items.preset, {
            name: dataItem.name,
            title: dataItem.title
          });
        }

        case 'official': {
          return $f(kUI.items.official, {
            title: dataItem.title
          });
        }

        case 'searching': {
          return $f(kUI.items.searching, {
            title: dataItem.title,
            score: formatScore(dataItem.score)
          });
        }

        case 'numbering': {
          return $f(kUI.items.numbering, {
            here: dataItem.here,
            there: dataItem.there
          });
        }

        default:
          throw Error(`Unknown siblingScanType: ${siblingScanType}`);
      }
    }

    if (meta) {
      return $f(kUI.items.meta, {
        name: dataItem.name,
        content: dataItem.content
      });
    }

    return $f(kUI.items.data, {
      title: dataItem.title,
      attributes: formatAttributes(dataItem.attributes) || null
    });
  }

  /**
   * Attribute formatter.
   *
   * @param attributes {array[]}
   *   [
   *     ['attr-name', 'attr-value'], ...,
   *     ['rel', ['rel-value1', 'rel-value2', ...]]
   *   ]
   *   @see |NaviLink| for detail.
   * @return {string}
   */
  function formatAttributes(attributes) {
    const kAttributeFormat = '%name%: %value%';
    const kValuesDelimiter = ',';
    const kAttributesDelimiter = ' ';

    if (!attributes || !attributes.length) {
      return '';
    }

    let formattedAttributes = [];

    attributes.forEach(([name, value]) => {
      if (Array.isArray(value)) {
        value = value.join(kValuesDelimiter);
      }

      if (value) {
        formattedAttributes.push($f(kAttributeFormat, {name, value}));
      }
    });

    return formattedAttributes.join(kAttributesDelimiter);
  }

  /**
   * Tooltip text formatter.
   *
   * TODO: Fix broken tooltip text. Text wrapping sometimes breaks and the
   * latter text is cut off. It seems to happen when a long text has '-' and
   * '\n'.
   */
  function formatTooltip(text, subText) {
    if (text && text !== getLeaf(subText)) {
      return text + '\n' + subText;
    }

    return subText;
  }

  function getLabelForType(typeList, testType) {
    for (let i = 0, l = typeList.length; i < l; i++) {
      let {type, label} = typeList[i];

      type = type.toLowerCase();

      if (type === testType) {
        return label || capitalize(type);
      }
    }

    return testType;
  }

  /**
   * The formatter of menu items count.
   */
  function formatMenuItemsCount(items, options = {}) {
    let {noLimit} = options;

    let count = items.length;

    if (count < 2) {
      // No use if the numbers is 0 or 1.
      return null;
    }

    if (!noLimit && count > kUI.items.maxNumMenuItems) {
      return kUI.items.maxNumMenuItems + '/' + count;
    }

    return count + '';
  }

  /**
   * The formatter of the score of searching link navigation.
   */
  function formatScore(num) {
    return num.toFixed(3);
  }

  /**
   * Alias fixup formatter.
   *
   * @param formats {string|string[]}
   *   The string(s) including aliases like %foo%.
   * @param replacements {hash}
   *   The key-value items corresponding to the aliases of |formats|.
   * @return {string}
   *
   * [Example for aliases]
   * formats: 'The number of %foo% is %bar%!'
   * replacements: {foo: 'Foo', bar: 3}
   * Returns 'The number of Foo is 3!'
   *
   * @note
   * - If |formats| doesn't have all alias keys of |replacements|, |formats|
   *   string itself returns without replacing.
   * - When an array of strings is passed to |formats|, the string that has all
   *   alias keys of |replacements| is used for replacing. If no matches, the
   *   first string returns unreplaced.
   *
   * @see |kUI| for the format strings.
   */
  function $f(formats, replacements) {
    let aliasList = {};

    for (let name in replacements) {
      let value = replacements[name];

      // @note Pass through falsy value 0 or ''.
      if (value !== null && value !== undefined) {
        aliasList[`%${name}%`] = value;
      }
    }

    if (!Array.isArray(formats)) {
      formats = [formats];
    }

    // Try to retreive the format that has all alias keys of replacements.
    let validFormat;
    let aliases = Object.keys(aliasList);

    for (let i = 0, l = formats.length; i < l; i++) {
      if (aliases.every((alias) => formats[i].includes(alias))) {
        validFormat = formats[i];

        break;
      }
    }

    if (!validFormat) {
      return formats[0];
    }

    for (let alias in aliasList) {
      validFormat = validFormat.replace(alias, aliasList[alias]);
    }

    return validFormat;
  }

  /**
   * Expose
   */
  return {
    init
  };
})();

/**
 * Data cache handler.
 *
 * @return {hash}
 *   create: {function}
 *   purgeCache: {function}
 */
const DataCache = (function() {
  const PageState = {
    states: new Set(),

    create() {
      let state = {
        changed: false
      };

      this.states.add(state);

      return state;
    },

    uninit() {
      this.states.clear();
      this.states = null;
    },

    change() {
      this.states.forEach((state) => {
        state.changed = true;
      });
    }
  };

  // Initialize.
  init();

  function init() {
    $page('pageready', () => {
      PageState.change();
    });

    $shutdown(() => {
      PageState.uninit();
    });
  }

  function purgeCache() {
    PageState.change();
  }

  function create(promiseData) {
    let vars = {
      promiseData,
      sequence: Promise.resolve(),
      pageState: PageState.create()
    };

    function update(...params) {
      // Make a sequential promise to wait for the previous process.
      vars.sequence = vars.sequence.then(() => {
        let uri = URIUtil.getCurrentURI();
        let doUpdate = vars.pageState.changed;

        if (doUpdate) {
          vars.pageState.changed = false;
        }

        let state = {uri, doUpdate};

        return vars.promiseData(state, params);
      });

      return vars.sequence;
    }

    return {
      update
    };
  }

  /**
   * Expose
   */
  return {
    create,
    purgeCache
  };
})();

/**
 * Handler of the user preset for the navigation links.
 */
const PresetNavi = (function() {
  const Cache = (function() {
    let dataCache = DataCache.create(promiseData);

    let data = {
      presetData: null
    };

    async function promiseData(state, params) {
      let [direction] = params;

      if (!state.uri || !BrowserUtils.isHTMLDocument()) {
        data.presetData = null;

        return data;
      }

      if (state.doUpdate) {
        data.presetData = {};
      }

      if (!(direction in data.presetData)) {
        data.presetData[direction] =
          await createPresetData(direction, state.uri);
      }

      return data;
    }

    return {
      update: dataCache.update
    };
  })();

  /**
   * Promise for the preset data for the previous or next page.
   *
   * @param direction {string} 'prev' or 'next'.
   * @return {Promise}
   *   resolve: {function}
   *     Resolved with the preset data.
   *     @param result {hash|null}
   *
   * [Preset data hash format]
   *   <Link preset>
   *   name: {string}
   *   title: {string}
   *   url: {string}
   *   <Submit preset>
   *   name: {string}
   *   title: {string}
   *   formIndex: {number}
   */
  function promisePresetData(direction) {
    return Cache.update(direction).then(({presetData}) => {
      if (!presetData) {
        return null;
      }

      return presetData[direction];
    });
  }

  function createPresetData(direction, uri) {
    let item;
    let url = uri.spec;

    for (let i = 0, l = kPresetNavi.length; i < l; i++) {
      if (kPresetNavi[i].url.test(url)) {
        item = kPresetNavi[i];

        break;
      }
    }

    if (!item) {
      return Promise.resolve(null);
    }

    return ContentTask.spawn({
      params: {
        xpath: item[direction]
      },
      task: function*(params) {
        '${ContentTask.ContentScripts.DOMUtils}';

        let {xpath} = params;

        let node = DOMUtils.$X1(xpath);

        if (node && node.href) {
          return {
            title: node.title || node.textContent,
            url: node.href
          };
        }

        if (node && node.localName === 'input' && node.form && node.value) {
          let formIndex = 0;

          for (let form of content.document.forms) {
            if (node.form === form) {
              break;
            }

            formIndex++;
          }

          return {
            title: node.value,
            formIndex
          };
        }

        return null;
      }
    }).
    then((result) => {
      if (!result) {
        // The preset page matches but the navigation element is not found.
        return {
          name: item.name,
          title : capitalize(direction)
        };
      }

      return {
        // [Preset data format for preset]
        name: item.name,
        title : trim(result.title) || capitalize(direction),
        url: result.url,
        formIndex: result.formIndex
      };
    });
  }

  /**
   * Expose
   */
  return {
    promisePresetData
  };
})();

/**
 * Handler of the official navigation links according to the 'rel' attribute.
 *
 * @note [additional] Makes a list of the page information.
 */
const NaviLink = (function() {
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

    function registered(type) {
      type = naviLinkTypeConversion[type] || type;

      if (type in naviLinkType) {
        return type;
      }

      return '';
    }

    function unregistered(type) {
      type = naviLinkTypeConversion[type] || type;

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

  const Cache = (function() {
    let dataCache = DataCache.create(promiseData);

    let data = {
      naviLinkList: null,
      subNaviLinkList: null,
      pageInfoList: null
    };

    async function promiseData(state) {
      if (!state.uri || !BrowserUtils.isHTMLDocument()) {
        data.naviLinkList = null;
        data.subNaviLinkList = null;
        data.pageInfoList = null;

        return data;
      }

      if (state.doUpdate) {
        [
          data.naviLinkList,
          data.subNaviLinkList,
          data.pageInfoList
        ] = await createLists();;
      }

      return data;
    }

    return {
      update: dataCache.update
    };
  })();

  /**
   * Promise for each list.
   *
   * @return {Promise}
   *   resolve: {function}
   *     Resolved with the array of list item.
   *     @param result {hash[]|null}
   *
   * [List item hash format]
   *   type: |kNaviLinkType.type| or |kPageInfoType.type|.
   *   dataItems: {hash[]}
   *     @see |promiseFirstDataForType|
   */
  function promiseNaviLinkList() {
    return Cache.update().then((data) => data.naviLinkList);
  }

  function promiseSubNaviLinkList() {
    return Cache.update().then((data) => data.subNaviLinkList);
  }

  function promisePageInfoList() {
    return Cache.update().then((data) => data.pageInfoList);
  }

  /**
   * Promise for the first data item of the list for the given type.
   *
   * @param type {string} |kNaviLinkType.type| or |kPageInfoType.type|
   * @return {Promise}
   *   resolve: {function}
   *     Resolved with the data item.
   *     @param result {hash}
   *   <link>/<script>
   *   title: {string}
   *   attributes: {array[]}
   *   url: {string}
   *   <meta>
   *   name: {string}
   *   content: {string}
   *
   * [attributes array format]
   *   [
   *     ['attr-name', 'attr-value'], ...,
   *     ['rel', ['rel-value1', 'rel-value2', ...]]
   *   ]
   */
  async function promiseFirstDataForType(type) {
    let [naviLinkList, pageInfoList] = await Promise.all([
      NaviLink.promiseNaviLinkList(),
      NaviLink.promisePageInfoList()
    ]);

    let list = [];

    if (naviLinkList) {
      list = list.concat(naviLinkList);
    }

    if (pageInfoList) {
      list = list.concat(pageInfoList);
    }

    if (list.length) {
      for (let i = 0, l = list.length; i < l; i++) {
        if (list[i].type === type) {
          return list[i].dataItems[0];
        }
      }
    }

    return null;
  }

  async function createLists() {
    let {metaInfo, scriptInfo, linkInfo} = await promiseInfoData();

    let naviLinkList = {};
    let subNaviLinkList = {};
    let pageInfoList = {};

    addMetaInfo(pageInfoList, metaInfo);
    addScriptInfo(pageInfoList, scriptInfo);

    linkInfo.forEach((info) => {
      let {rel, href} = info;

      let rels = createRelList(rel);

      // Process from the list that needs to test special rel values.
      updatePageInfoList(pageInfoList, info, rels) ||
      updateNaviLinkList(naviLinkList, info, rels) ||
      updateSubNaviLinkList(subNaviLinkList, info, rels);
    });

    return [
      {
        list: naviLinkList,
        typeOrder: kNaviLinkType
      },
      {
        list: subNaviLinkList
        // @note No typeOrder will sort the types in alphabetical order.
      },
      {
        list: pageInfoList,
        typeOrder: kPageInfoType
      }
    ].map(formatList);
  }

  function createRelList(relAttribute) {
    let rels = relAttribute.toLowerCase().split(/\s+/);

    let relList = {};

    rels.forEach((rel) => {
      relList[rel] = true;
    });

    // The function to filter the rels except for the given rel.
    Object.defineProperty(relList, 'exceptFor', {
      value(testRel) {
        // No exceptions if the numbers of 'rel' attribute values is one.
        if (rels.length < 2) {
          return [];
        }

        return rels.filter((rel) => rel !== testRel);
      }
    });

    return relList;
  }

  function formatList({list, typeOrder}) {
    let types = Object.keys(list);

    if (!types.length) {
      return null;
    }

    sortByType(types, typeOrder);

    let resultList = [];

    types.forEach((type) => {
      let dataItems = [];

      for (let data of list[type]) {
        if (testUniqueData(dataItems, data)) {
          dataItems.push(data);
        }
      }

      resultList.push({
        // [List item format]
        type,
        dataItems
      });
    });

    if (!resultList.length) {
      return null;
    }

    return resultList;
  }

  function sortByType(types, typeOrder) {
    if (types.length <= 1) {
      return;
    }

    let order;

    if (typeOrder && typeOrder.length) {
      if (typeOrder.length <= 1) {
        return;
      }

      order = typeOrder.map((item) => item.type.toLowerCase());
    }

    let comparator = order ?
      (a, b) => order.indexOf(a) - order.indexOf(b) :
      (a, b) => a.localeCompare(b);

    types.sort(comparator);
  }

  function testUniqueData(dataItems, testData) {
    return dataItems.every((data) => {
      for (let key in data) {
        // |attributes| is {array[]}, the others are {string}.
        if (key === 'attributes') {
          if (data[key].join() !== testData[key].join()) {
            return true;
          }
        }
        else if (data[key] !== testData[key]) {
          return true;
        }
      }

      return false;
    });
  }

  function promiseInfoData() {
    return ContentTask.spawn(function*() {
      const {Feeds} = Modules.require('/modules/Feeds.jsm');
      const kFeedTypes = {
        'application/rss+xml': 'RSS',
        'application/atom+xml': 'ATOM',
        'text/xml': 'XML',
        'application/xml': 'XML',
        'application/rdf+xml': 'XML'
      };

      let doc = content.document;

      let metas = doc.getElementsByTagName('meta');
      let metaInfo = [...metas].map((node) => {
        let name =
          node.name ||
          node.httpEquiv ||
          node.getAttribute('property') ||
          node.getAttribute('itemprop');

        // @note Don't name a temp variable |content| to avoid conflict with
        // the global |content|.
        let contentData = node.content;

        if (!name && !contentData) {
          return null;
        }

        return {
          name,
          content: contentData
        };
      }).
      filter(Boolean);

      let scripts = doc.getElementsByTagName('script');
      let scriptInfo = [...scripts].map(({src, title}) => {
        if (!src) {
          return null;
        }

        return {src, title};
      }).
      filter(Boolean);

      let links = doc.querySelectorAll('[rel][href], [rev][href]');
      let linkInfo = [...links].map((node) => {
        let {rel, rev, href, title, textContent, media, type, hreflang} = node;

        rel = rel || rev;

        if (!rel || !href || !/^(?:https?|mailto):/.test(href)) {
          return null;
        }

        title = title || textContent || undefined;
        media = media || undefined;
        type = type || undefined;
        hreflang = hreflang || undefined;

        let rels = {};

        for (let value of rel.split(/\s+/)) {
          rels[value] = true;
        }

        if (rels.feed || (type && rels.alternate && !rels.stylesheet)) {
          let feedType =
            Feeds.isValidFeed(node, doc.nodePrincipal, !!rels.feed);

          if (feedType) {
            rel = 'feed';
            type = kFeedTypes[feedType] || 'RSS';
          }
        }

        return {rel, href, title, media, type, hreflang};
      }).
      filter(Boolean);

      return {metaInfo, scriptInfo, linkInfo};
    });
  }

  function addMetaInfo(pageInfoList, metaInfo) {
    // Put at least <content-type> in the meta list.
    let hasContentType = metaInfo.some(({name, content}) =>
      name && name.toLowerCase() === 'content-type' && content);

    if (!hasContentType) {
      let contentType = gBrowser.selectedBrowser.documentContentType;
      let characterSet = gBrowser.selectedBrowser.characterSet;

      metaInfo.unshift({
        name: 'Content-Type',
        content: `${contentType}; charset=${characterSet}`
      });
    }

    metaInfo.forEach((info) => {
      addListItem(pageInfoList, 'meta', info);
    });
  }

  function addScriptInfo(pageInfoList, scriptInfo) {
    scriptInfo.forEach((info) => {
      addListItem(pageInfoList, 'script', info);
    });
  }

  function updatePageInfoList(pageInfoList, itemInfo, rels) {
    let pageInfoType = '';
    let attributes = [];

    if (rels.feed) {
      pageInfoType = 'feed';
      attributes.push(['type', itemInfo.type]);
    }
    else if (rels.stylesheet) {
      pageInfoType = 'stylesheet';
      attributes.push(['media', itemInfo.media || 'all']);
    }
    else if (rels.icon) {
      pageInfoType = 'favicon';

      if (itemInfo.type) {
        attributes.push(['type', itemInfo.type]);
      }
    }

    if (pageInfoType) {
      addListItem(pageInfoList, pageInfoType, itemInfo, attributes);

      return true;
    }

    return false;
  }

  function updateNaviLinkList(naviLinkList, itemInfo, rels) {
    let attributes = [];

    if (rels.alternate) {
      if (itemInfo.media) {
        attributes.push(['media', itemInfo.media]);
      }

      if (itemInfo.hreflang) {
        attributes.push(['hreflang', itemInfo.hreflang]);
      }
    }

    let itemNums = 0;

    for (let naviLinkType in rels) {
      naviLinkType = NaviLinkTypeFixup.registered(naviLinkType);

      if (naviLinkType) {
        // Make a temporary attributes list for appending the array of 'rel'
        // values except for this link type.
        let thisAttributes = [...attributes];

        let extraRels = rels.exceptFor(naviLinkType);

        if (extraRels.length) {
          thisAttributes.push(['rel', extraRels]);
        }

        addListItem(naviLinkList, naviLinkType, itemInfo, thisAttributes);

        itemNums++;
      }
    }

    return itemNums > 0;
  }

  function updateSubNaviLinkList(subNaviLinkList, itemInfo, rels) {
    for (let naviLinkType in rels) {
      naviLinkType = NaviLinkTypeFixup.unregistered(naviLinkType);

      if (naviLinkType) {
        // The array of 'rel' values except for this type.
        let attributes = [['rel', rels.exceptFor(naviLinkType)]];

        addListItem(subNaviLinkList, naviLinkType, itemInfo, attributes);
      }
    }
  }

  function addListItem(list, itemType, itemInfo, attributes) {
    let data;

    let url = itemInfo.href || itemInfo.src;

    if (url) {
      data = {
        // [Data item format for <script>/<link>]
        url,
        title: trim(itemInfo.title) || getLeaf(url) || '[N/A]',
        attributes: attributes || []
      };
    }
    else {
      data = {
        // [Data item format for <meta>]
        name: trim(itemInfo.name) || '[N/A]',
        content: trim(itemInfo.content) || '[N/A]'
      };
    }

    if (!(itemType in list)) {
      list[itemType] = [];
    }

    list[itemType].push(data);
  }

  /**
   * Expose
   */
  return {
    promiseNaviLinkList,
    promiseSubNaviLinkList,
    promisePageInfoList,
    promiseFirstDataForType
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

  const Cache = (function() {
    let dataCache = DataCache.create(promiseData);

    let data = {
      siblingData: null
    };

    async function promiseData(state, params) {
      let [direction] = params;

      if (!state.uri) {
        data.siblingData = null;

        return data;
      }

      if (state.doUpdate) {
        data.siblingData = {};
      }

      if (!(direction in data.siblingData)) {
        data.siblingData[direction] =
          await createSiblingData(direction, state.uri);
      }

      return data;
    }

    return {
      update: dataCache.update
    };
  })();

  /**
   * Promise for the sibling page info for the previous or next page.
   *
   * @param direction {string} 'prev' or 'next'.
   * @return {Promise}
   *   resolve: {function}
   *     Resolved with the sibling page info.
   *     @param result {hash|null}
   *
   * [Sibling page info hash format]
   *   scanType: {string} |kSiblingScanType|
   *   dataItems: {hash[]}
   *
   * [Data item hash format]
   *   The data item has the proper members assigned to |kSiblingScanType|:
   *   - {name, title, url} for link |preset|.
   *   - {name, title, formIndex} for submit |preset|.
   *   - {name, content} for <meta> of |official|.
   *   - {title, attributes, url} for <script> or <link> of |official|.
   *   - {title, score, url} for sibling by |searching|.
   *   - {here, there, url} for sibling by |numbering|.
   */
  function promiseSiblingData(direction) {
    return Cache.update(direction).then(({siblingData}) => {
      if (!siblingData) {
        return null;
      }

      return siblingData[direction];
    });
  }

  /**
   * Promise for the first URL of sibling pages for the given direction.
   *
   * @param direction {string} 'prev' or 'next'.
   * @return {Promise}
   *   resolve: {function}
   *     Resolved with the URL string of sibling page.
   *     @param result {string|null}
   *
   * [The order of finding the URL]
   *   1.Matching the user preset.
   *   2.Retrieving the official page.
   *   3.Guessing by searching of links and the highest scored item.
   *   4.Guessing by URL numbering.
   *   @see |createSiblingData|
   */
  function promiseSiblingURLFor(direction) {
    return promiseSiblingData(direction).then((siblingData) => {
      if (!siblingData) {
        return null;
      }

      return siblingData.dataItems[0].url;
    });
  }

  async function createSiblingData(direction, uri) {
    let scanType;
    let dataItems;

    let handlers = [
      ['preset', PresetNavi.promisePresetData],
      ['official', NaviLink.promiseFirstDataForType],
      ['searching', guessBySearching],
      ['numbering', guessByNumbering]
    ];

    for (let [type, handler] of handlers) {
      let data = await handler(direction, uri);

      if (data) {
        dataItems = data;
        scanType = type;

        break;
      }
    }

    if (!dataItems) {
      return null;
    }

    if (!Array.isArray(dataItems)) {
      dataItems = [dataItems];
    }

    return {
      // [Sibling page info format]
      scanType,
      dataItems
    };
  }

  /**
   * Promise for a list of the prev/next page by searching links.
   *
   * @param direction {string} 'prev' or 'next'
   * @param uri {nsIURI}
   *   The URI of the document to be examined (usually in the current tab).
   * @return {Promise}
   *   resolve: {function}
   *     Resolved with the array of data item of sibling page.
   *     @param result {hash[]|null}
   *
   * [Data item format]
   *   title: {string}
   *   score: {number}
   *   url: {string}
   *
   * @note Allows only URL that has the same as the base domain of the document
   * to avoid jumping to the outer domain.
   */
  async function guessBySearching(direction, uri) {
    if (!BrowserUtils.isHTMLDocument()) {
      return null;
    }

    let pageURI = URIUtil.createURI(uri, {
      hash: false
    });

    let naviLinkScorer = NaviLinkScorer.create(pageURI, direction);
    let entries = createSearchEntries();

    let links = await promiseLinkList();

    for (let {url, texts, attributes} of links) {
      if (entries.has(url) ||
          !/^https?:/.test(url) ||
          pageURI.isSamePage(url) ||
          !pageURI.isSameBaseDomain(url)) {
        continue;
      }

      for (let text of texts) {
        // Examine the filename of a URL-like text.
        if (/^https?:\S+$/.test(text)) {
          text = getLeaf(text, {
            removeParams: true
          });
        }

        let score = naviLinkScorer.score({url, text, attributes});

        if (score) {
          entries.add({url, text, score});

          break;
        }
      }

      if (entries.isFull()) {
        break;
      }
    }

    return entries.collect();
  }

  function createSearchEntries() {
    let entries = [];
    let urls = [];

    function clear() {
      entries.length = 0;
      urls.length = 0;
    }

    function add({url, text, score}) {
      entries[entries.length] = {url, text, score};

      // Cache for |has()|.
      urls[urls.length] = url;
    }

    function has(url) {
      return urls.includes(url);
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

      let list = entries.map(({url, text, score}) => {
        return {
          // [Data item format for sibling by searching]
          title: text,
          score,
          url
        };
      });

      clear();

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
   * Promise for the data list of hyperlinked elements in the current content
   * document.
   *
   * @return {Promise}
   *   resolve {function}
   *     Resolved with the array of link data.
   *     @param {hash[]}
   *       url: {string}
   *       texts: {string[]}
   *       attributes: {string[]}
   */
  function promiseLinkList() {
    return ContentTask.spawn({
      params: {
        maxNumScanningLinks: kMaxNumScanningLinks
      },
      task: function*(params) {
        let {maxNumScanningLinks} = params;

        let linkList = [];

        let trim = (str) => {
          if (!str || !/\S/.test(str)) {
            return '';
          }

          return str.trim().replace(/\s+/g, ' ');
        };

        let addData = (node) => {
          let url = node.href;

          if (!url) {
            return;
          }

          let images = node.getElementsByTagName('img');
          let image = images.length ? images[0] : null;

          let texts = [
            node.textContent,
            node.title,
            image && image.alt,
            image && image.title,
            image && image.src,
            '[No text]'
          ].
          map(trim).filter(Boolean);

          let attributes = [];

          // Numbers of ancestor elements to be looked up.
          // @value {integer}
          //   4 from the typical structure <nav><ul><li><a>.
          let elementNums = 4;

          for (let element = node; element; element = element.parentElement) {
            if (elementNums-- === 0) {
              break;
            }

            if (element.localName === 'nav') {
              attributes.push('nav-element');
            }

            if (element.className) {
              attributes.push(element.className);
            }

            if (element.id) {
              attributes.push(element.id);
            }
          }

          attributes = attributes.map(trim).filter(Boolean);

          linkList.push({
            url,
            texts,
            attributes
          });
        };

        // Collect <a> and <area> with the 'href' attribute.
        let links = content.document.links;
        let count = links.length;

        if (maxNumScanningLinks < count) {
          // Examines near the top and near the bottom of the page that seem to
          // contain informations for navigation.
          let limit = Math.floor(maxNumScanningLinks / 2);

          for (let i = 0; i < limit; i++) {
            addData(links[i]);
          }

          for (let i = count - limit; i < count; i++) {
            addData(links[i]);
          }
        }
        else {
          for (let i = 0; i < count; i++) {
            addData(links[i]);
          }
        }

        return linkList;
      }
    });
  }

  /**
   * Promise for a list of the prev/next page by numbering of URL.
   *
   * @param direction {string} 'prev' or 'next'
   * @param uri {nsIURI}
   *   The URI of the document to be examined (usually in the current tab).
   * @return {hash[]|null}
   *
   * [Data item format]
   *   here: {string}
   *   there: {string}
   *   url: {string}
   *
   * @note This function has no await, but must return a promise for
   * |createSiblingData|.
   */
  async function guessByNumbering(direction, uri) {
    /**
     * RegExp patterns for string like the page number in URL.
     *
     * @note Must specify the global flag 'g'.
     */
    const kPageNumberRE = [
      // Parameter with a numeric value: [?&]foo=123 or [?&]123
      /([?&](?:[a-z_-]{1,20}=)?)(\d{1,12})(?=$|&)/ig,

      // Path ended with numbers: (foo)123 or (foo)123.jpg or (foo)123/
      /(\/[a-z0-9_-]{0,20}?)(\d{1,12})(\.\w+|\/)?(?=$|\?)/ig
    ];

    let pageURI = URIUtil.createURI(uri, {
      hash: false
    });

    if (!pageURI.hasPath()) {
      return null;
    }

    let pageURL = pageURI.spec;
    let directionNum = (direction === 'next') ? 1 : -1;

    let list = [];

    kPageNumberRE.forEach((pattern) => {
      let matches;

      while ((matches = pattern.exec(pageURL))) {
        let [match, leading , oldNum, trailing] = matches;

        let newNum = parseInt(oldNum, 10) + directionNum;

        if (newNum > 0) {
          newNum = newNum + '';

          while (newNum.length < oldNum.length) {
            newNum = '0' + newNum;
          }

          let newVal = leading + newNum + (trailing || '');

          list.push({
            // [Data item format for sibling by numbering]
            here: match,
            there: newVal,
            url: pageURL.replace(match, newVal)
          });
        }
      }
    });

    if (!list.length) {
      return null;
    }

    return trimSiblingsList(list);
  }

  function trimSiblingsList(list) {
    return list.slice(0, kMaxNumSiblings);
  }

  /**
   * Wrappers for the exposed functions.
   */
  function promisePrevPageURL() {
    return promiseSiblingURLFor('prev');
  }

  function promiseNextPageURL() {
    return promiseSiblingURLFor('next');
  }

  /**
   * Expose
   */
  return {
    promiseSiblingData,
    promisePrevPageURL,
    promiseNextPageURL
  };
})();

/**
 * Evaluator of the navigation-like values.
 */
const NaviLinkScorer = (function() {
  const TextScorer = (function() {
    // Data for finding a navigation sign.
    const kNaviSign = (function() {
      // «(&laquo;):\u00ab, ‹(&lsaquo;):\u2039, ←(&larr;):\u2190,
      // ≪(&Lt;):\u226a, ◀:\u25c0, ◂(&ltrif;):\u25c2, ＜:\uff1c
      const prev = '<|\\u00ab|\\u2039|\\u2190|\\u226a|\\u25c0|\\u25c2|\\uff1c';

      // »(&raquo;):\u00bb, ›(&rsaquo;):\u203a, →(&rarr;):\u2192,
      // ≫(&Gt;):\u226b, ▶:\u25b6, ▸(&rtrif;):\u25b8, ＞:\uff1e
      const next = '>|\\u00bb|\\u203a|\\u2192|\\u226b|\\u25b6|\\u25b8|\\uff1e';

      let directionRE = (forward, backward) => {
        return {
          forward: RegExp(`^(?:${forward})+|(?:${forward})+$`),
          backward: RegExp(backward)
        };
      };

      return {
        direction: {
          prev: directionRE(prev, next),
          next: directionRE(next, prev)
        }
      };
    })();

    // Data for finding a text string or an image filename like a
    // navigation.
    const kNaviWord = (function() {
      const prev = {
        en: 'prev|previous|old|older|back|backward',
        // 前:\u524D, 古い:\u53e4\u3044
        ja: '\\u524d|\\u53e4\\u3044'
      };

      const next = {
        en: 'next|new|newer|later|forward|more|continue',
        // 次:\u6b21, 新し:\u65b0\u3057, 続き:\u7d9a\u304d
        ja: '\\u6b21|\\u65b0\\u3057|\\u7d9a\\u304d'
      };

      let directionRE = (forward, backward) => {
        // Expects the navi word at the first word of string;
        // 'prev', 'Previous *', 'next-*', 'newer.jpg'.
        // Allows the short leading words before an english navigation word;
        // 'Go to next page', 'goto-next-page.png'.
        let en = `(?:^|^[- \\w]{0,10}[-_ ])(?:${forward.en})(?:$|[-_. ])`;
        let ja = `^(?:${forward.ja})`;

        return {
          forward: RegExp(`(?:${en})|(?:${ja})`, 'i'),
          backward: RegExp(`${backward.en}|${backward.ja}`, 'i')
        };
      };

      return {
        direction: {
          prev: directionRE(prev, next),
          next: directionRE(next, prev)
        }
      };
    })();

    // RegExp list of text not navigation-like.
    const kNGTextList = [
      // "response anchor" on BBS.
      /^(?:>|\uff1e){2,}[-\d ]+$/
    ];

    // Score weighting.
    const kScoreWeight = initScoreWeight({
      matchSign: 100,
      matchWord: 100,
      noBackwardWord: 50,
      lessText: 50
    });

    let vars = {
      SignTester: null,
      WordTester: null
    };

    function init(direction) {
      let testers = [
        ['SignTester', kNaviSign],
        ['WordTester', kNaviWord]
      ];

      for (let [tester, data] of testers) {
        vars[tester] = initNaviTester(data.direction[direction]);
      }
    }

    function initNaviTester({forward, backward}) {
      function hasBackward(text) {
        if (!text) {
          return false;
        }

        return backward.test(text);
      }

      function match(text) {
        if (!text) {
          return null;
        }

        let matches = forward.exec(text);

        if (!matches) {
          return null;
        }

        return {
          remainingText: text.replace(matches[0], '').trim()
        };
      }

      return {
        hasBackward,
        match
      };
    }

    function score(text) {
      let point = 0;
      let match;

      // Filter the NG text.
      if (kNGTextList.some((ng) => ng.test(text))) {
        return 0;
      }

      // Test signs for navigation.
      if (!vars.SignTester.hasBackward(text)) {
        match = vars.SignTester.match(text);

        if (match) {
          point += kScoreWeight.matchSign;

          text = match.remainingText;
        }
      }

      // Test words for navigation.
      match = vars.WordTester.match(text);

      if (match) {
        point += kScoreWeight.matchWord;

        text = match.remainingText;

        if (!vars.WordTester.hasBackward(text)) {
          point += kScoreWeight.noBackwardWord;
        }
      }

      // Test the length of the navigation-like text.
      if (point > 0) {
        if (text) {
          // The text seems less to be for navigation if more than 10
          // characters remain.
          const maxLenToBeNavi = 10;
          let len = text.length;
          let rate = (len < maxLenToBeNavi) ? 1 - (len / maxLenToBeNavi) : 0;

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

  const AttributeScorer = (function() {
    const kNaviAttribute = (function() {
      // Expects navigation-like identifier come from 'navigation', 'page',
      // 'pagination', 'link'.
      const navi = 'nav|page|pagi|link';

      // The direction words for navigation.
      const prev = 'prev|back';
      const next = 'next|forward';

      // Allows the word anywhere; 'navi next', 'nextpage'.
      let wordRE = (str) => RegExp(`(?:${str})`, 'i');

      let directionRE = (forward, backward) => {
        return {
          forward: wordRE(forward),
          backward: wordRE(backward)
        };
      };

      return {
        navi: wordRE(navi),
        direction: {
          prev: directionRE(prev, next),
          next: directionRE(next, prev)
        }
      };
    })();

    const kScoreWeight = initScoreWeight({
      matchAttribute: 100
    });

    let vars = {
      AttributeTester: null
    };

    function init(direction) {
      vars.AttributeTester = initAttributeTester(
        kNaviAttribute.navi,
        kNaviAttribute.direction[direction]
      );
    }

    function initAttributeTester(navi, {forward, backward}) {
      function match(attributes) {
        if (!attributes.length) {
          return false;
        }

        let values = attributes.join(' ');

        return navi.test(values) && forward.test(values) &&
               !backward.test(values);
      }

      return {
        match
      };
    }

    function score(attributes) {
      let point = 0;

      if (vars.AttributeTester.match(attributes)) {
        point += kScoreWeight.matchAttribute;
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

    let vars = {
      URLTester: null
    };

    function init(uri) {
      vars.URLTester = initURLTester(uri);
    }

    function initURLTester(uri) {
      let originalPrePath = uri.prePath;
      let originalPath = uri.path;

      let originalURL = createData(originalPath);

      function match(url) {
        // No path for comparison.
        if (originalPath === '/') {
          return null;
        }

        // @note The target URL might be including the original URL encoded.
        // @note Decode only special characters for URL.
        url = URLUtils.unescapeURLCharacters(url);

        // Search the same pre path as the original in the target URL:
        // - The target pre path equals the original.
        // - The target path has a pre path that equals the original.
        let index = url.indexOf(originalPrePath);

        // No information of the original URL.
        if (index < 0) {
          return null;
        }

        let otherPath = url.substr(index + originalPrePath.length);

        // No path or no difference for comparison.
        if (!otherPath || otherPath === '/' || otherPath === originalPath) {
          return null;
        }

        return {
          originalURL,
          otherURL: createData(otherPath)
        };
      }

      function createData(path) {
        return {
          path,
          // Make an array of parts for comparison excluding empty values.
          parts: path.split(/[-_./?#&=]/).filter(Boolean)
        };
      }

      return {
        match
      };
    }

    function score(url) {
      let URLData = vars.URLTester.match(url);

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
      // let otherParts = [...otherURL.parts];
      let otherParts = otherURL.parts;

      let originalLength = originalParts.length;
      let otherLength = otherParts.length;

      if (!originalLength || !otherLength) {
        return 0;
      }

      let matches = 0;

      for (let i = 0; i < originalLength; i++) {
        let matchIndex = otherParts.indexOf(originalParts[i]);

        if (matchIndex > -1) {
          matches++;

          // Disable the matched item to avoid matching with the same value of
          // another item of the original parts.
          otherParts[matchIndex] = null;
          otherLength--;

          if (!otherLength) {
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

  const Cache = (function() {
    let vars = {
      url: null,
      direction: null
    };

    function update(uri, direction) {
      if (vars.url !== uri.spec) {
        vars.url = uri.spec;
        vars.direction = null;

        URLScorer.init(uri);
      }

      if (vars.direction !== direction) {
        vars.direction = direction;

        TextScorer.init(direction);
        AttributeScorer.init(direction);
      }

      return {
        score
      };
    }

    function score({url, text, attributes}) {
      let point = 0;

      point += AttributeScorer.score(attributes);
      point += TextScorer.score(text);

      if (point) {
        point += URLScorer.score(url);
      }

      // Number ranges:
      // - Attribute score [0,1]
      // - Text score [0,1]
      // - URL score  [0,1]
      // - Return value [0,1]
      return point / 3;
    }

    return {
      update
    };
  })();

  function create(uri, direction) {
    return Cache.update(uri, direction);
  }

  /**
   * Helper functions.
   */
  function initScoreWeight(weights) {
    let total = 0;

    for (let key in weights) {
      total += weights[key];
    }

    for (let key in weights) {
      weights[key] /= total;
    }

    return weights;
  }

  /**
   * Expose
   */
  return {
    create
  };
})();

/**
 * Handler of the links to the upper(top/parent) page.
 */
const UpperNavi = (function() {
  const Cache = (function() {
    let dataCache = DataCache.create(promiseData);

    let data = {
      upperURLList: null
    };

    // @note This function has no await, but must return a promise for
    // |DataCache.update|.
    async function promiseData(state) {
      if (!state.uri) {
        data.upperURLList = null;

        return data;
      }

      if (state.doUpdate) {
        data.upperURLList = createUpperURLList(state.uri);
      }

      return data;
    }

    return {
      update: dataCache.update
    };
  })();

  /**
   * Promise for the list of the upper page URLs from parent to top in order.
   *
   * @return {Promise}
   *   resolve: {function}
   *     Resolved with the array of URL string.
   *     @param result {string[]|null}
   */
  function promiseUpperURLList() {
    return Cache.update().then((data) => data.upperURLList);
  }

  function createUpperURLList(uri) {
    let currentURI = URIUtil.createURI(uri, {
      search: false
    });

    let list = [];

    let parentURL;

    while ((parentURL = getParentURL(currentURI))) {
      list.push(parentURL);

      currentURI = URIUtil.createURI(parentURL);
    }

    if (!list.length) {
      return null;
    }

    return list;
  }

  function getParentURL(uri) {
    if (uri.hasPath()) {
      let path = uri.path.replace(/\/(?:index\.html?)?$/i, '')
      let segments = path.split('/');

      // Remove the last one.
      segments.pop();

      let url = uri.prePath + segments.join('/') + '/';

      if (url === 'file:///') {
        return '';
      }

      return url;
    }

    return getUpperHost(uri);
  }

  function getTopURL(uri) {
    if (uri.scheme === 'file') {
      // Test a drive letter.
      let match = /^(file:\/\/\/[a-z]:\/).+/i.exec(uri.spec);

      if (!match) {
        return '';
      }

      return match[1];
    }

    if (uri.hasPath()) {
      return uri.prePath + '/';
    }

    return getUpperHost(uri);
  }

  function getUpperHost(uri) {
    let host = uri.host;

    if (!host || uri.baseDomain === host) {
      return '';
    }

    let levels = host.split('.');

    levels.shift();

    return uri.scheme + '://' + levels.join('.') + '/';
  }

  /**
   * Wrappers for the exposed functions.
   */
  function getCurrentParentURL() {
    let uri = URIUtil.getCurrentURI({
      search: false
    });

    if (!uri) {
      return '';
    }

    return getParentURL(uri);
  }

  function getCurrentTopURL() {
    let uri = URIUtil.getCurrentURI({
      search: false
    });

    if (!uri) {
      return '';
    }

    return getTopURL(uri);
  }

  /**
   * Expose
   */
  return {
    promiseUpperURLList,
    getParent: getCurrentParentURL,
    getTop: getCurrentTopURL
  };
})();

/**
 * Custom URI object handler.
 */
const URIUtil = (function() {
  function getCurrentURI(options) {
    let currentURI = gBrowser.selectedBrowser.currentURI;

    if (!/^(?:https?|ftp|file)$/.test(currentURI.scheme)) {
      return null;
    }

    return createURI(currentURI, options);
  }

  function createURI(sourceURI, options = {}) {
    let {search, hash} = options;

    // TODO: Validation check for URI.
    // WORKAROUND: Passes a valid |sourceURI| for now.
    let uri = makeNSIURI(sourceURI);

    let {scheme, prePath, path, spec} = uri;
    let noHashSpec = trimHash(spec);
    let host = getHost(uri);
    let baseDomain = getBaseDomain(prePath, host);

    if (search === false) {
      path = trimSearch(path);
      spec = trimSearch(spec);
    }
    else if (hash === false) {
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
  function hasPath(path) {
    return path !== '/';
  }

  function isSamePage(noHashSpec, targetURL) {
    if (!targetURL) {
      return false;
    }

    return trimHash(targetURL) === noHashSpec;
  }

  function isSameBaseDomain(baseDomain, targetURL) {
    if (!targetURL) {
      return false;
    }

    return getBaseDomain(targetURL) === baseDomain;
  }

  /**
   * Helper functions.
   */
  function trimSearch(url) {
    return url.replace(/[?#].*$/, '');
  }

  function trimHash(url) {
    return url.replace(/#.*$/, '');
  }

  function makeNSIURI(url) {
    if (url instanceof Ci.nsIURI) {
      return url;
    }

    // Reform our custom URI object.
    // TODO: Test by some reliable method.
    if (url.spec) {
      url = url.spec;
    }

    try {
      return Modules.BrowserUtils.makeURI(url);
    }
    catch (ex) {
      Cu.reportError(ex);
    }

    return null;
  }

  function getHost(uri) {
    if (!uri || /^file:/.test(uri.prePath)) {
      return '';
    }

    try {
      return uri.host;
    }
    catch (ex) {
      Cu.reportError(ex);
    }

    // The scheme is (https?|ftp).
    return uri.prePath.
      match(/^(?:[a-z]+:\/\/)?(?:[^\/]+@)?\[?(.+?)\]?(?::\d+)?$/)[1];
  }

  function getBaseDomain(url, host) {
    if (!url || /^file:/.test(url)) {
      return '';
    }

    if (!host) {
      host = getHost(makeNSIURI(url));

      if (!host) {
        return '';
      }
    }

    try {
      /**
       * @note |getBaseDomain| returns:
       * - The base domain includes the public suffix. (e.g. '.com', '.co.jp',
       *   '.aisai.aichi.jp', '.github.io')
       *   @see https://wiki.mozilla.org/Public_Suffix_List
       * - A string value in ACE format for IDN.
       */
      let baseDomain = Services.eTLD.getBaseDomainFromHost(host);

      const IDNService =
        Modules.$S('@mozilla.org/network/idn-service;1', 'nsIIDNService');

      return IDNService.convertACEtoUTF8(baseDomain);
    }
    catch (ex) {
      Cu.reportError(ex);
    }

    return host;
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
 * Attribute handler for |ucjsUtil.DOMUtils.$E|.
 */
function handleAttribute(node, name, value) {
  let userAttribute = parse$a(name);

  if (userAttribute) {
    let {category, key} = userAttribute;

    node[category] = {};
    node[category][key] = value;

    return true;
  }

  return false;
}

/**
 * User attribute handler.
 *
 * @note Handles only a command data for |onCommand| for now.
 */
function $a(command) {
  return kDataKey.commandData + command;
}

function parse$a(name) {
  let commandData = kDataKey.commandData;

  if (name.startsWith(commandData)) {
    return {
      category: commandData,
      key: name.slice(commandData.length)
    }
  }

  return null;
}

/**
 * Utility functions.
 */
function getLeaf(url, options = {}) {
  let {removeParams} = options;

  if (!url) {
    return '';
  }

  // Return back a mail address to display the whole text as title.
  if (/^mailto:/.test(url)) {
    return url;
  }

  if (!/^https?:/.test(url)) {
    return '';
  }

  let path = url.replace(/^https?:\/\/[^\/]+/, '');

  if (removeParams) {
    path = path.replace(/[?#].*$/, '');
  }

  let leaf = path.split('/').filter(Boolean).pop();

  return leaf || url;
}

function capitalize(str) {
  if (!str) {
    return '';
  }

  return str.substr(0, 1).toUpperCase() + str.substr(1);
}

function trim(str) {
  if (!str || !/\S/.test(str)) {
    return '';
  }

  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Warning dialog.
 */
function warn(message) {
  const kMaxMessageLength = 200;

  // Log to console.
  let str = log(message, Components.stack.caller)

  if (str.length > kMaxMessageLength) {
    str = str.substr(0, kMaxMessageLength);
    str += '\n...(Too long and truncated)';
  }

  str += '\n[Logged in the Browser Console]';

  Services.prompt.alert(null, null, str);
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
  promiseNextPageURL: SiblingNavi.promiseNextPageURL,
  promisePrevPageURL: SiblingNavi.promisePrevPageURL,
  getParent: UpperNavi.getParent,
  getTop: UpperNavi.getTop
};


})(this);
