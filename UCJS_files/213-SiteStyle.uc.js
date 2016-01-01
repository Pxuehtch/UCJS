// ==UserScript==
// @name SiteStyle.uc.js
// @description Customizes the style of web sites.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @note A preference menu is added in 'tools' of the menu bar.


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  ContentTask,
  Listeners: {
    $event,
    $messageOnce,
    $page,
    $pageOnce
  },
  DOMUtils: {
    $E,
    $ID
  },
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

/**
 * UI settings.
 */
const kUI = {
  prefMenu: {
    id: 'ucjs_SiteStyle_prefMenu',
    label: 'ucjsSiteStyle',
    accesskey: 'S',
    noSiteRegistered: '登録サイトなし'
  }
};

/**
 * Key name for storing data.
 */
const kDataKey = {
  // Extended property name of a menuitem.
  itemIndex: 'ucjs_SiteStyle_itemIndex'
};

/**
 * List of noisy URLs in the search results of the web search engine.
 *
 * @value {string|regexp}
 *   @see |URLFilter| for filter rules.
 *
 * @see http://d.hatena.ne.jp/edvakf/20090723/1248365807
 */
const kNoiseList = [
  // Hatena
  '|a.hatena.ne.jp/*',
  '|b.hatena.ne.jp/*',
  '|d.hatena.ne.jp/keyword/*',
  '|q.hatena.ne.jp/*',

  // Google
  '|google.com/buzz/*',

  // Yahoo
  '||chiebukuro.yahoo.co.jp/*',

  // OKWave Q&A
  '||okwave.tld',
  '||okweb.tld',
  '|mag2qa.com',
  '|nandemo.',
  '|otasuke.',
  '|qa.',
  '|qanda.',
  '|questionbox.',
  '|ziddy.japan.zdnet.com',
  /^http:\/\/oshiete\d?\./,
  /^http:\/\/soudan\d?\./,

  // shopping
  '|addons.mozilla.tld/*',
  '|chrome.google.com/*',
  '|itunes.apple.com/*',
  '|play.google.com/*',
  '||amazon.tld/*',
  '||kakaku.tld/*',
  '||rakuten.tld/*',

  // proxy
  '||anticensure.com',
  '||autobypass.com',
  '||proxydock.com',
  '||qqclip.appspot.com',
  '||rightpaths.com',
  '||tehvu.ir',

  // misc.
  '||1470.net',
  '||atwiki.jp',
  '||basefeed.net',
  '||brothersoft.tld',
  '||buzz.goo.ne.jp',
  '||buzzurl.jp',
  '||ceron.jp',
  '||choix.jp',
  '||cssclip.com',
  '||del.icio.us',
  '||delicious.com',
  '||designiddatabase.tld',
  '||designlinkdatabase.tld',
  '||designrecipedatabase.tld',
  '||dic.nicovideo.jp',
  '||faves.com',
  '||favolog.org',
  '||favotter.net',
  '||friendfeed.com',
  '||hiwihhi.com',
  '||marici.com',
  '||matope.com',
  '||matome.naver.jp',
  '||newsing.jp',
  '||newzia.jp',
  '||pastebin.tld',
  '||pecipeci.net',
  '||pg-feed.tld',
  '||rightclicksright.tld',
  '||script-scrap.com',
  '||softonic.tld',
  '||soukyu-mugen.com',
  '||tabelog.com',
  '||tarikin.net',
  '||thumbnailcloud.tld',
  '||tweetmeme.com',
  '||tweetbuzz.jp',
  '||twib.jp',
  '||twitmunin.com',
  '||tyudon.com',
  '||wdclip.com',
  '||xmarks.com'//,
];

/**
 * List of sites.
 *
 * @key name {string}
 *   A display name in the preference menu.
 * @key include {regexp|string}|{regexp[]|string[]}
 *   The URL where the commands should run.
 *   @see |URLFilter| for filter rules.
 *
 * Must define least one following commands:
 * ----------
 * @key preload {function} [optional]
 *   A function to be executed before the document is loaded.
 *   @param uri {nsIURI}
 *     The URI object of the document.
 *   @param browser {xul:browser}
 *     The selected browser that has the target document.
 *   @return {boolean}
 *     true if allowed |script| or |style| to follow after the document loaded,
 *     otherwise false.
 * @key script {function} [optional]
 *   A function to be executed after the document is loaded.
 *   @param uri {nsIURI}
 *     The URI object of the document.
 *   @param browser {xul:browser}
 *     The selected browser that has the target document.
 *   @return {hash}
 *     contentTask: {generator}
 *       A task to be run in the content frame.
 * @key style {function} [optional]
 *   A function to build CSS to be applied to the document.
 *   @param uri {nsIURI}
 *     The URI object of the document.
 *   @param browser {xul:browser}
 *     The selected browser that has the target document.
 *   @return {CSS}
 * ----------
 *
 * @key disabled {boolean} [optional]
 *
 * @note Don't add a key '_includeFilter' that is reserved for internal use.
 * @see |PageObserver::testURL()|
 */
const kSiteList = [
  {
    name: 'Google Result',
    include: '||google.tld/*?^q=',
    // Adding own property.
    utils: {
      testMode: (uri) => {
        /**
         * Retrieve the mode parameter from Google search result URL.
         *
         * The mode values:
         * - main: the main result. [Our own definition]
         * - isch, vid, nws, shop, app, bks. [Google definition]
         *
         * [URL parameters format]
         * ?q=previous&tbm=app&...#q=current&tbm=shop&...
         * The search part is for the previous result and the hash part is for
         * the current result. We need the latter.
         */
        let {search, hash} = new window.URL(uri.spec);
        let params = hash || search;
        let [, mode] = params && /[?&#]tbm=([^&]+)/.exec(params) || [];

        if (!mode) {
          mode = 'main';
        }

        return (modeList) => RegExp(`^(?:${modeList})$`).test(mode);
      }
    },
    script(uri, browser) {
      let testMode = this.utils.testMode(uri);

      // Apply to main, videos and news.
      if (!testMode('main|vid|nws')) {
        return;
      }

      // 1.Receive the result items list from content process.
      // 2.Add informations to each items.
      // 3.Send back the list to content process.
      $messageOnce('ucjs:SiteStyle:resultItemList', (message) => {
        let {resultItemList} = message.data;

        let mm = browser.messageManager

        if (!mm) {
          return;
        }

        // Mark on a noisy item.
        for (let item of resultItemList) {
          if (NoisyURLFilter.test(item.href)) {
            item.noisy = true;
          }
        }

        mm.sendAsyncMessage('ucjs:SiteStyle:resultItemList', {
          resultItemList
        });
      });

      function* content_task() {
        '${ContentTask.ContentScripts.Listeners}';
        '${ContentTask.ContentScripts.DOMUtils}';

        const kSelectors = {
          allLink: '.g a',
          resultItem: '.g',
          resultLink: '.r>a, .ts a'
        };

        // Sanitize links.
        for (let link of DOMUtils.$S(kSelectors.allLink)) {
          link.removeAttribute('onmousedown');

          let url =
            /google\./.test(link.hostname) &&
            /^\/url$/.test(link.pathname) &&
            /[&?](?:q|url)=([^&]+)/.exec(link.search);

          if (url) {
            link.href = decodeURIComponent(url[1]);
          }
        }

        // Process result items.
        let resultItemList = [];
        let lastHost = null;

        for (let item of DOMUtils.$S(kSelectors.resultItem)) {
          let link = DOMUtils.$S1(kSelectors.resultLink, item);

          // Collect items data to be sent to chrome process.
          resultItemList.push({
            href: link && link.href
          });

          if (!link || link.hidden) {
            continue;
          }

          // Put a mark on the same host items.
          let host = link.hostname;

          if (host === lastHost) {
            item.classList.add('ucjs_SiteStyle_sameHost');
          }
          else {
            lastHost = host;
          }
        }

        // 1.Send result items list to chrome process.
        // 2.Receive the list that has been added informations to each items.
        Listeners.$messageOnce('ucjs:SiteStyle:resultItemList', (message) => {
          let {resultItemList} = message.data;

          let items = DOMUtils.$S(kSelectors.resultItem);

          resultItemList.forEach((item, i) => {
            // Understate noisy items.
            if (item.noisy) {
              items[i].classList.add('ucjs_SiteStyle_understate');
            }
          });
        });

        sendAsyncMessage('ucjs:SiteStyle:resultItemList', {
          resultItemList
        });
      }

      return {
        contentTask: content_task
      };
    },
    style(uri) {
      let testMode = this.utils.testMode(uri);

      // The common styles.
      let css = `
        /* Search text box. */
        .srp #searchform {
          top: auto !important;
        }
        /* Footer navi. */
        #foot {
          width: auto !important;
          margin: 0 !important;
        }
      `;

      // Styles for result items except for images.
      if (!testMode('isch')) {
        css += `
          /* Block items. */
          .nrgt > tbody > tr > td, .ts > tbody > tr > td {
            float: left !important;
            width: auto !important;
          }
          /* Sub contents items. */
          .nrgt, .nrgt *, .r ~ div {
            width: auto !important;
            margin-top: 0 !important;
            margin-left: 0 !important;
            padding-top: 0 !important;
            padding-left: 0 !important;
          }
          .nrgt .l {
            font-size: small !important;
          }
          /* Special result (Wikipedia, delivery tracking, etc.) */
          .kp-blk {
            margin: 0 !important;
            box-shadow: none !important;
          }
          .kp-blk .mod {
            padding: 0 !important;
          }
          /* Translation link. */
          .fl {
            display: none !important
          }
        `;
      }

      // Multi column except for images, shopping, applications, books.
      if (!testMode('isch|shop|app|bks')) {
        css += `
          /* hide right pane */
          #rhs, #rhscol, #leftnav + td + td {
            display: none !important;
          }
          #cnt, #res, .s, #mn {
            max-width: 100% !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #leftnav + td {
            width: 100% !important;
          }
          #center_col {
            width: auto !important;
            margin: 0 2em !important;
          }
          h2.hd + div > ol, #mn #ires > ol {
            -moz-column-count: 2;
            -moz-column-gap: 1em;
          }
        `;
      }

      // Workaround for broken styles except for images, shopping.
      if (!testMode('isch|shop')) {
        css += `
          /* Content area container */
          .col {
            float: none !important;
            width: auto !important;
          }
        `;
      }

      // Styles for our customizations for main, videos and news.
      if (testMode('main|vid|nws')) {
        css += `
          /* For main and news. */
          .ucjs_SiteStyle_sameHost cite::before,
          /* For videos. */
          .ucjs_SiteStyle_sameHost h3 + .slp::before {
            content: "=";
            font-weight: bold;
            color: red;
            margin-right: 2px;
          }
          .ucjs_SiteStyle_understate h3 {
            font-size: small !important;
          }
          .ucjs_SiteStyle_understate h3 ~ * {
            opacity: .3 !important;
          }
          .ucjs_SiteStyle_understate:hover * {
            opacity: 1 !important;
            transition: opacity .5s !important;
          }
        `;
      }

      return css;
    }
  },
  {
    name: 'Yahoo!JAPAN Result',
    include: '|search.yahoo.co.jp/search^',
    script(uri, browser) {
      // 1.Receive the result items list from content process.
      // 2.Add informations to each items.
      // 3.Send back the list to content process.
      $messageOnce('ucjs:SiteStyle:resultItemList', (message) => {
        let {resultItemList} = message.data;

        let mm = browser.messageManager

        if (!mm) {
          return;
        }

        // Mark on a noisy item.
        for (let item of resultItemList) {
          if (NoisyURLFilter.test(item.href)) {
            item.noisy = true;
          }
        }

        mm.sendAsyncMessage('ucjs:SiteStyle:resultItemList', {
          resultItemList
        });
      });

      function* content_task() {
        '${ContentTask.ContentScripts.Listeners}';
        '${ContentTask.ContentScripts.DOMUtils}';

        const kSelectors = {
          allLink: '#contents a',
          resultItem: '.w, .cmm',
          resultLink: '.hd>h3>a'
        };

        // Sanitize links.
        for (let link of DOMUtils.$S(kSelectors.allLink)) {
          link.removeAttribute('onmousedown');

          let url =
            /yahoo\./.test(link.hostname) &&
            /^\/\*\-/.test(link.pathname) &&
            /\/\*\-([^?]+)/.exec(link.pathname);

          if (url) {
            link.href = decodeURIComponent(url[1]);
          }
        }

        // Process result items.
        let resultItemList = [];

        for (let item of DOMUtils.$S(kSelectors.resultItem)) {
          let link = DOMUtils.$S1(kSelectors.resultLink, item);

          // Collect items data to be sent to chrome process.
          resultItemList.push({
            href: link && link.href
          });
        }

        // 1.Send result items list to chrome process.
        // 2.Receive the list that has been added informations to each items.
        Listeners.$messageOnce('ucjs:SiteStyle:resultItemList', (message) => {
          let {resultItemList} = message.data;

          let items = DOMUtils.$S(kSelectors.resultItem);

          resultItemList.forEach((item, i) => {
            // Understate noisy items.
            if (item.noisy) {
              items[i].classList.add('ucjs_SiteStyle_understate');
            }
          });
        });

        sendAsyncMessage('ucjs:SiteStyle:resultItemList', {
          resultItemList
        });
      }

      return {
        contentTask: content_task
      };
    },
    style(uri) {
      let css = `
        /* Custom class. */
        /* '.ah38' lists Q&A sites. */
        .ah38 h3,
        .ucjs_SiteStyle_understate h3 {
          font-size: small !important;
        }
        .ah38 .hd ~ *,
        .ucjs_SiteStyle_understate .hd ~ *,
        .ucjs_SiteStyle_understate h3 ~ *
        {
          opacity: .3 !important;
        }
        .ah38:hover *,
        .ucjs_SiteStyle_understate:hover * {
          opacity: 1 !important;
          transition: opacity .5s !important;
        }
      `;

      return css;
    }
  },
  {
    name: 'Wikipedia Article',
    include: '||wikipedia.org/wiki/',
    style(uri) {
      let css = `
        /* Popup reference. */
        .references li {
          list-style-type: none;
        }
        .references li:target {
          position: fixed;
          left: 170px;
          right: 13px;
          bottom: 0;
          border: 1px solid black;
          background-color: khaki !important;
        }
      `;

      return css;
    }
  },
  {
    name: 'Youtube Player',
    include: /^https?:\/\/(?:www\.)?youtube\.com\/(?:watch|channel|user)/,
    preload(uri, browser) {
      // WORKAROUND: Changes a parameter for the start time of a video page
      // coming from 'Play in Youtube.com' of an embedded player so that we can
      // pause at that time.
      if (/#at=\d+/.test(uri.spec)) {
        browser.loadURI(uri.spec.replace('#at=', '#t='));

        // Stop the execution of the following |script|.
        return false
      }

      return true;
    },
    script(uri) {
      function* content_task() {
        '${ContentTask.ContentScripts.DOMUtils}';

        let window = content.window;
        let location = window.document.location;

        // Prevent auto play a video not in when playlist mode.
        if (!/[?&]list=/.test(location.search)) {
          preventAutoplay();
        }

        function preventAutoplay() {
          let intervalTime = 500;
          let waitCount = 20;
          let timerId = null;

          let clear = () => {
            window.removeEventListener('unload', clear);

            window.clearInterval(timerId);
            timerId = null;
          };

          window.addEventListener('unload', clear);

          timerId = window.setInterval(() => {
            if (--waitCount < 0 || pauseVideo()) {
              clear();
            }
          }, intervalTime);
        }

        /**
         * Pauses a video in an embedded player.
         *
         * @return {boolean}
         *   true if a video is paused, false otherwise.
         *
         * @note Using Youtube Player API.
         * @see https://developers.google.com/youtube/js_api_reference
         */
        function pauseVideo() {
          let player =
            DOMUtils.$ID('c4-player') ||
            DOMUtils.$ID('movie_player') ||
            DOMUtils.$ID('watch7-video');

          if (!player) {
            return false;
          }

          player = player.wrappedJSObject;

          if (player.getPlayerState) {
            switch (player.getPlayerState()) {
              // 1:playing or 2:paused
              case 1:
              case 2: {
                player.pauseVideo();
                player.seekTo(getStartTime(location.href));

                return true;
              }
            }
          }

          return false;
        }

        function getStartTime(url) {
          let time = /[?&#]t=(\d+h)?(\d+m)?(\d+s?)?/.exec(url);

          if (!time) {
            return 0;
          }

          let [, h, m, s] = time;

          h = (h && parseInt(h, 10) * 3600) || 0;
          m = (m && parseInt(m, 10) * 60) || 0;
          s = (s && parseInt(s, 10)) || 0;

          return h + m + s;
        }
      }

      return {
        contentTask: content_task
      };
    }
  }//,
];

/**
 * URL filter handler.
 *
 * @return {hash}
 *   init: {function}
 *
 * [URL filter rules]
 * @value {regexp|string}|{regexp[]|string[]}
 *   {regexp} Tested as it is.
 *   {string} Usually a partial match.
 *     [Special symbols are converted regexp as follows:]
 *     - The leading '||' -> ^https?:\/\/[\w-.]*?
 *     - The leading '|'  -> ^https?:\/\/(?:www\d*\.)?
 *     - URL scheme follows after '||' or '|' -> ^
 *     - Wildcard (non-greedy, 1 or more chracters) '*'  -> .+?
 *     - Wildcard (non-greedy, 0 or more chracters) '*?' -> .*?
 *     - Separators '^' -> [/?&#]
 *     - '.tld' will match any top level domain including public suffix.
 *       @see |getTLDURL|
 */
const URLFilter = (function() {
  /**
   * Create URL filter instance.
   *
   * @param list {array}
   * @return {hash}
   *   test: {function}
   */
  function init(list) {
    let [mergedRegExp, mergedRegExpTLD] = makeMergedRegExp(list);

    return {
      test: test.bind(null, [mergedRegExp, mergedRegExpTLD])
    };
  }

  function makeMergedRegExp(list) {
    let regExpList = [], regExpTLDList = [];

    if (!Array.isArray(list)) {
      list = [list];
    }

    list.forEach((item) => {
      if (item instanceof RegExp) {
        regExpList.push(item.source);

        return;
      }

      let hasTLD = /^[^\/]*(?:\/\/)?[^\/]*\.tld(?:[:\/]|$)/.test(item);

      let prefix;

      [
        ['||', /^https?:\/\/[\w-.]*?/],
        ['|',  /^https?:\/\/(?:www\d*\.)?/]
      ].
      some(([symbol, re]) => {
        if (item.startsWith(symbol)) {
          item = item.slice(symbol.length);

          prefix = /^\w+:/.test(item) ? '^' : re.source;

          return true;
        }

        return false;
      });

      item = item.
        replace(/[*.?+\-|^${}()\[\]\/\\]/g, '\\$&').
        replace(/\\\*\\\?/g, '.*?').
        replace(/\\\*/g, '.+?').
        replace(/\\\^/g, '[/?&#]');

      if (prefix) {
        item = prefix + item;
      }

      (hasTLD ? regExpTLDList : regExpList).push(item);
    });

    return [regExpList, regExpTLDList].map(merge);
  }

  function merge(list) {
    if (!list.length) {
      return null;
    }

    if (list.length < 2) {
      return RegExp(list[0]);
    }

    return RegExp(list.map((data) => '(?:' + data + ')').join('|'));
  }

  function test([mergedRegExp, mergedRegExpTLD], url) {
    if (!/^https?:/.test(url)) {
      return false;
    }

    return (mergedRegExp && mergedRegExp.test(url)) ||
           (mergedRegExpTLD && mergedRegExpTLD.test(getTLDURL(url)));
  }

  /**
   * Get a URL being converted its TLD with a string 'tld'.
   *
   * @note TLD includes the public suffix. (e.g. '.com', '.co.jp',
   * '.aisai.aichi.jp', '.github.io')
   * @see https://wiki.mozilla.org/Public_Suffix_List
   */
  function getTLDURL(url) {
    try {
      let uri = Modules.BrowserUtils.makeURI(url);
      let tld = Services.eTLD.getPublicSuffix(uri);

      uri.host = uri.host.slice(0, -tld.length) + 'tld';

      return uri.spec;
    }
    catch (ex) {}

    return url;
  }

  return {
    init
  };
})();

/**
 * Page observer handler.
 *
 * @return {hash}
 *   init: {function}
 */
const PageObserver = (function() {
  function init() {
    $page('pageurlchange', onURLChange);
  }

  function onURLChange(event) {
    let {newURI, newDocumentLoaded} = event;

    if (!newDocumentLoaded) {
      return;
    }

    let site = matchSiteList(newURI.spec);

    if (!site) {
      return;
    }

    let browser = gBrowser.selectedBrowser;

    if (site.preload) {
      let canProceed = site.preload(newURI, browser);

      if (!canProceed) {
        return;
      }
    }

    if (!site.style && !site.script) {
      return;
    }

    $pageOnce('pageready', onPageReady);

    function onPageReady() {
      Task.spawn(function*() {
        let css = site.style && site.style(newURI, browser);

        if (css) {
          yield ContentTask.spawn({
            params: {css},
            task: function*(params) {
              '${ContentTask.ContentScripts.CSSUtils}';

              let {css} = params;

              if (css) {
                CSSUtils.injectStyleSheet(css, {
                  id: 'ucjs_SiteStyle_css'
                });
              }
            }
          });
        }

        let script = site.script && site.script(newURI, browser);

        if (script && script.contentTask) {
          ContentTask.spawn({
            task: script.contentTask
          });
        }
      }).
      catch(Cu.reportError);
    }
  }

  function matchSiteList(url) {
    let site = null;

    kSiteList.some((item) => {
      if (!item.disabled && testURL(item, url)) {
        site = item;

        return true;
      }

      return false;
    });

    return site;
  }

  function testURL(site, url) {
    // Injects the URL filter into each item for inclusion test.
    // TODO: Avoid adding a hidden key that could cause an unexpected conflict
    // in a constant |kSiteList|.
    if (!site._includeFilter) {
      site._includeFilter = URLFilter.init(site.include);
    }

    return site._includeFilter.test(url);
  }

  return {
    init
  };
})();

/**
 * Noisy URL filter.
 *
 * @return {hash}
 *   test: {function}
 */
const NoisyURLFilter = (function() {
  let filter = URLFilter.init(kNoiseList);

  return {
    test: filter.test
  };
})();

/**
 * Preference menu handler.
 *
 * @return {hash}
 *   init: {function}
 */
const PrefMenu = (function() {
  function init() {
    let menu = $E('menu', {
      id: kUI.prefMenu.id,
      label: kUI.prefMenu.label,
      accesskey: kUI.prefMenu.accesskey
    });

    if (kSiteList.length) {
      let popup = $E('menupopup');

      $event(popup, 'command', onCommand);

      kSiteList.forEach(({name, disabled}, i) => {
        let menuitem = popup.appendChild($E('menuitem', {
          label: name + (disabled ? ' [disabled]' : ''),
          type: 'checkbox',
          checked: !disabled,
          closemenu: 'none'
        }));

        menuitem[kDataKey.itemIndex] = i;
      });

      menu.appendChild(popup);
    }
    else {
      $E(menu, {
        tooltiptext: kUI.prefMenu.noSiteRegistered,
        disabled: true
      });
    }

    $ID('menu_ToolsPopup').appendChild(menu);
  }

  function onCommand(event) {
    let item = event.target;

    let index = item[kDataKey.itemIndex];

    if (index > -1) {
      kSiteList[index].disabled = !item.hasAttribute('checked');
    }
  }

  return {
    init
  };
})();

/**
 * Entry point.
 */
function SiteStyle_init() {
  PageObserver.init();
  PrefMenu.init();
}

SiteStyle_init();


})(this);
