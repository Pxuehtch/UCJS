// ==UserScript==
// @name SiteStyle.uc.js
// @description Customizes the style of web sites.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @note Creates a preference menu in 'tools' of the menu bar.


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Timer: {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  },
  createNode: $E,
  getNodeById: $ID,
  getNodesBySelector: $S,
  getFirstNodeBySelector: $S1,
  addEvent,
  setContentStyleSheet,
  // Log to console for debug.
  logMessage: log
} = window.ucjsUtil;

/**
 * UI settings.
 */
const kUI = {
  pageStyleSheet: {
    id: 'ucjs_SiteStyle_pageStyleSheet'
  },

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
 *   URL where the commands should run.
 *   @see |URLFilter| for filter rules.
 *
 * Define one or more commands;
 * ----------
 * @key quickScript {function} [optional]
 *   A function that runs as soon as a location changes.
 *   @param aDocument {Document}
 *   @return {boolean}
 *     Whether |script| is applied or not after |quickScript|.
 * @key script {function} [optional]
 *   A function that runs after the document loaded.
 *   @param aDocument {Document}
 * @key style {function} [optional]
 *   A function that makes CSS to apply to the document.
 *   @param aDocument {Document}
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
    include: '||google.tld/*q=',
    script(aDocument) {
      // Sanitize links.
      [...$S('li.g a', aDocument)].forEach((link) => {
        link.removeAttribute('onmousedown');

        let url =
          /google\./.test(link.hostname) &&
          /^\/url$/.test(link.pathname) &&
          /[&?](?:q|url)=([^&]+)/.exec(link.search);

        if (url) {
          link.href = decodeURIComponent(url[1]);
        }
      });

      let lastHost = null;

      [...$S('li.g', aDocument)].forEach((item) => {
        let link = $S1('.r>a, .ts a', item);

        if (!link) {
          return;
        }

        // Weaken noisy item.
        if (NoisyURLFilter.test(link.href)) {
          item.classList.add('ucjs_SiteStyle_weaken');
        }

        // Emphasize the same host item.
        let host = link.hostname;

        if (host === lastHost) {
          item.classList.add('ucjs_SiteStyle_sameHost');
        }
        else {
          lastHost = host;
        }
      });
    },
    style(aDocument) {
      let testMode = (function() {
        let params = aDocument.location.hash || aDocument.location.search;
        let [, mode] = /[?&#]tb[ms]=([^&]+)/.exec(params) || [];

        return (aModeList) => {
          if (aModeList) {
            return mode && RegExp('^(' + aModeList + ')$').test(mode);
          }

          // The main result page or not.
          return !mode;
        };
      })();

      // Common styles.
      let css = `
        /* Block items. */
        .nrgt > tbody > tr > td, .ts > tbody > tr >td {
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
        /* Footer navi. */
        #foot {
          width: auto !important;
          margin: 0 !important;
        }
        /* Special result (Wikipedia, delivery tracking, etc.) */
        .kp-blk {
          margin: 0 !important;
          box-shadow: none !important;
        }
        .kp-blk .mod {
          padding: 0 !important;
        }
      `;

      // Workaround for broken styles.
      // Except for images, shopping.
      if (!testMode('isch|shop')) {
        css += `
          /* Content area container */
          .col {
            float: none !important;
            width: auto !important;
          }
        `;
      }

      // Each item styles.
      // Except for images, shopping, application, books.
      if (!testMode('isch|shop|app|bks')) {
        css += `
          .ucjs_SiteStyle_sameHost cite::before {
            content: "=";
            font-weight: bold;
            color: red;
            margin-right: 2px;
          }
          #res .ucjs_SiteStyle_weaken h3{
            font-size: small !important;
          }
          .ucjs_SiteStyle_weaken h3 ~ * {
            opacity: .3 !important;
          }
          .ucjs_SiteStyle_weaken:hover * {
            opacity: 1 !important;
            transition: opacity .5s !important;
          }
        `;
      }

      // Multi column.
      // Except for images, shopping.
      if (!testMode('isch|shop')) {
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

      return css;
    }
  },
  {
    name: 'Yahoo!JAPAN Result',
    include: '|search.yahoo.co.jp/search',
    script(aDocument) {
      // Sanitize links.
      [...$S('#contents a')].forEach((link) => {
        link.removeAttribute('onmousedown');

        let url =
          /yahoo\./.test(link.hostname) &&
          /^\/\*\-/.test(link.pathname) &&
          /\/\*\-([^?]+)/.exec(link.pathname);

        if (url) {
          link.href = decodeURIComponent(url[1]);
        }
      });

      // Process items.
      [...$S('.w, .cmm')].forEach((item) => {
        let link = $S1('.hd>h3>a', item);

        if (!link) {
          return;
        }

        // Weaken a noisy item.
        if (NoisyURLFilter.test(link.href)) {
          item.classList.add('ucjs_SiteStyle_weaken');
        }
      });
    },
    style(aDocument) {
      let css = `
        /* Custom class. */
        .ucjs_SiteStyle_weaken h3 {
          font-size: small !important;
        }
        .ucjs_SiteStyle_weaken .hd ~ *,
        .ucjs_SiteStyle_weaken h3 ~ *
        {
          opacity: .3 !important;
        }
        .ucjs_SiteStyle_weaken:hover * {
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
    style(aDocument) {
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
    quickScript(aDocument) {
      let location = aDocument.location;

      // WORKAROUND: Changes a parameter key for the start time of a video page
      // that comes from 'Play in Youtube.com' of an embedded player so that we
      // can pause at that time.
      if (/#at=\d+/.test(location.href)) {
        location.replace(location.href.replace('#at=', '#t='));

        return false;
      }

      return true;
    },
    script(aDocument) {
      // Excluding the playlist mode.
      if (!/[?&]list=/.test(aDocument.location.search)) {
        preventAutoplay(aDocument);
      }

      function preventAutoplay(aDocument) {
        let intervalTime = 500;
        let waitCount = 20;
        let timerID = null;

        let clear = () => {
          aDocument.defaultView.removeEventListener('unload', clear, false);

          clearInterval(timerID);
          timerID = null;
        }

        aDocument.defaultView.addEventListener('unload', clear, false);

        timerID = setInterval(() => {
          if (--waitCount < 0) {
            clear();

            return;
          }

          if (pauseVideo(aDocument)) {
            clear();
          }
        }, intervalTime);

        /**
         * Pauses a video in an embedded player.
         *
         * @param aDocument {HTMLDocument}
         * @return {boolean}
         *   true if a video is paused, false otherwise.
         *
         * @note Using Youtube Player API.
         * @see https://developers.google.com/youtube/js_api_reference
         */
        function pauseVideo(aDocument) {
          let player =
            // New Flash in channel page.
            aDocument.getElementById('c4-player') ||
            // Old Flash in channel page / Flash in watch page.
            aDocument.getElementById('movie_player') ||
            // HTML5 in watch page.
            aDocument.getElementById('watch7-video');

          if (player) {
            player = player.wrappedJSObject;

            /**
             * |player.getPlayerState()| returns the state of the player.
             *
             * Possible values are:
             * -1 – unstarted
             * 0 – ended
             * 1 – playing
             * 2 – paused
             * 3 – buffering
             * 5 – video cued
             */
            if (player.getPlayerState) {
              switch (player.getPlayerState()) {
                case 1:
                case 2: {
                  player.pauseVideo();
                  player.seekTo(getStartTime(aDocument.location.href));

                  return true;
                }
              }
            }
          }

          return false;
        }

        function getStartTime(aURL) {
          let time = /[?&#]t=(\d+h)?(\d+m)?(\d+s?)?/.exec(aURL);

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
    }
  }//,
];

/**
 * URL filter handler.
 *
 * @return {hash}
 *   @key init {function}
 *
 * [URL filter rules]
 * @value {regexp|string}|{regexp[]|string[]}
 *   {regexp} Used as-is.
 *   {string} Usually a partial match.
 *     @note Special symbols are available;
 *     1.The leading '||' -> ^https?:\/\/[\w-.]*?
 *                        -> ^ (If URL scheme follows after.)
 *     2.The leading '|'  -> ^https?:\/\/(?:www\d*\.)?
 *                        -> ^ (If URL scheme follows after.)
 *     3.The wildcard '*' -> .+?
 *     4.'.tld' will match any top level domain.
 */
const URLFilter = (function() {
  /**
   * Create URL filter instance.
   *
   * @param aList {array}
   * @return {hash}
   *   @key test {function}
   */
  function init(aList) {
    let [mergedRegExp, mergedRegExpTLD] = makeMergedRegExp(aList);

    return {
      test: test.bind(null, [mergedRegExp, mergedRegExpTLD])
    };
  }

  function makeMergedRegExp(aList) {
    let regExpList = [], regExpTLDList = [];

    if (!Array.isArray(aList)) {
      aList = [aList];
    }

    aList.forEach((item) => {
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
        replace(/[.?+\-|${}()\[\]\/\\]/g, '\\$&').
        replace(/\*+/g, '.+?');

      if (prefix) {
        item = prefix + item;
      }

      (hasTLD ? regExpTLDList : regExpList).push(item);
    });

    return [regExpList, regExpTLDList].map(merge);
  }

  function merge(aList) {
    if (!aList.length) {
      return null;
    }

    if (aList.length < 2) {
      return RegExp(aList[0]);
    }

    return RegExp(aList.map((data) => '(?:' + data + ')').join('|'));
  }

  function test([mergedRegExp, mergedRegExpTLD], aURL) {
    if (!/^https?:/.test(aURL)) {
      return false;
    }

    return (mergedRegExp && mergedRegExp.test(aURL)) ||
           (mergedRegExpTLD && mergedRegExpTLD.test(getTLDURL(aURL)));
  }

  /**
   * Get a URL being converted its TLD with a string 'tld'.
   *
   * TODO: Fix a wrong detection of the TLD for a specific host.
   * @note |getPublicSuffix| returns a wrong value for '*.github.io'.
   * But for now, there is no 'github.io' in URL filters and no workaround for
   * fixing it.
   * @see NaviLink.uc.js::getBaseDomain
   */
  function getTLDURL(aURL) {
    try {
      // @see chrome://global/content/contentAreaUtils.js::makeURI
      let uri = window.makeURI(aURL);
      let tld = Services.eTLD.getPublicSuffix(uri);

      uri.host = uri.host.slice(0, -tld.length) + 'tld';

      return uri.spec;
    }
    catch (ex) {}

    return aURL;
  }

  return {
    init
  };
})();

/**
 * Page observer handler.
 *
 * @return {hash}
 *   @key init {function}
 *
 * TODO: Detect surely when the document is loaded.
 * WORKAROUND: Applies a script when the complete request URL equals the
 * document URL.
 *
 * TODO: Detect surely when a request in the same document is loaded (e.g.
 * a next page from a link of the navigation bar of Google result).
 * WORKAROUND: Observes |about:document-onload-blocker| and delays execution
 * of a command.
 *
 * TODO: Detect surely the result page from the Google top page.
 */
const PageObserver = (function() {
  const {
    LOCATION_CHANGE_SAME_DOCUMENT,
    STATE_STOP, STATE_IS_WINDOW, STATE_IS_REQUEST
  } = Ci.nsIWebProgressListener;

  let mBrowserState = new WeakMap();

  const mProgressListener = {
    init() {
      addEvent(gBrowser.tabContainer, 'TabClose', (aEvent) => {
        let browser = gBrowser.getBrowserForTab(aEvent.target);

        mBrowserState.delete(browser);
      }, false);

      gBrowser.addTabsProgressListener(mProgressListener);

      addEvent(window, 'unload', () => {
        gBrowser.removeTabsProgressListener(mProgressListener);
      }, false);
    },

    onLocationChange(aBrowser, aWebProgress, aRequest, aLocation, aFlags) {
      let URL = aLocation.spec;

      if (!/^https?/.test(URL)) {
        return;
      }

      mBrowserState.delete(aBrowser);

      let site = matchSiteList(URL);

      if (!site) {
        return;
      }

      // 1. Apply the stylesheet.
      if (site.style) {
        let css = site.style(aBrowser.contentDocument);

        PageCSS.set(aBrowser.contentDocument, css);
      }

      // 2. Run the quick script before the document loading.
      if (site.quickScript) {
        if (!site.quickScript(aBrowser.contentDocument)) {
          // Suppress the following script.
          return;
        }
      }

      // 3. Wait the document loads and run the script.
      if (site.script) {
        mBrowserState.set(aBrowser, {
          URL,
          site,
          isSameDocument: aFlags & LOCATION_CHANGE_SAME_DOCUMENT
        });
      }
    },

    onStateChange(aBrowser, aWebProgress, aRequest, aFlags, aStatus) {
      let URL = aBrowser.currentURI.spec;

      if (!/^https?/.test(URL)) {
        return;
      }

      let state = mBrowserState.get(aBrowser);

      if (!state || state.URL !== URL) {
        return;
      }

      if (aFlags & STATE_STOP) {
        // Fix up a cached page URL (wyciwyg:).
        if (fixupURL(aRequest.name) === URL ||
            (aFlags & STATE_IS_WINDOW &&
             aWebProgress.DOMWindow === aBrowser.contentWindow) ||
            (state.isSameDocument &&
             aFlags & STATE_IS_REQUEST &&
             aRequest.name === 'about:document-onload-blocker')) {
          setTimeout((aDocument) => {
            if (checkAlive(aDocument)) {
              state.site.script(aDocument);
            }
          }, 100, aBrowser.contentDocument);

          mBrowserState.delete(aBrowser);
        }
      }
    },

    onProgressChange() {},
    onSecurityChange() {},
    onStatusChange() {},
    onRefreshAttempted() {},
    onLinkIconAvailable() {}
  };

  /**
   * Checks whether a document is alive or not.
   *
   * @param aDocument {Document}
   * @return {boolean}
   *
   * TODO: This is a workaround for checking a dead object. Make a reliable
   * method instead.
   */
  function checkAlive(aDocument) {
    try {
      return !Cu.isDeadWrapper(aDocument);
    }
    catch (ex) {}

    return false;
  }

  function fixupURL(aURL) {
    let uri;

    try {
      const uriFixup = Services.uriFixup;

      uri = uriFixup.createFixupURI(aURL, uriFixup.FIXUP_FLAG_NONE);
      uri = uriFixup.createExposableURI(uri);
    }
    catch (ex) {}

    return uri ? uri.spec : aURL;
  }

  function matchSiteList(aURL) {
    let site = null;

    kSiteList.some((item) => {
      if (!item.disabled && testURL(item, aURL)) {
        site = item;

        return true;
      }

      return false;
    });

    return site;
  }

  function testURL(aSite, aURL) {
    // Set the URL filter for inclusion inside each item.
    // TODO: Avoid adding a hidden key that could cause an unexpected conflict
    // in a constant |kSiteList|.
    if (!aSite._includeFilter) {
      aSite._includeFilter = URLFilter.init(aSite.include);
    }

    return aSite._includeFilter.test(aURL);
  }

  function init() {
    mProgressListener.init();
  }

  return {
    init
  };
})();

/**
 * Noisy URL filter.
 *
 * @return {hash}
 *   @key test {function}
 */
const NoisyURLFilter = (function() {
  let filter = URLFilter.init(kNoiseList);

  return {
    test: filter.test
  };
})();

/**
 * Page CSS handler.
 *
 * @return {hash}
 *   @key set {function}
 */
const PageCSS = (function() {
  function set(aDocument, aCSS) {
    if (/^(?:complete|interactive)$/.test(aDocument.readyState)) {
      setCSS(aDocument, aCSS);

      return;
    }

    aDocument.addEventListener('DOMContentLoaded', onReady, false);
    aDocument.defaultView.addEventListener('unload', cleanup, false);

    function cleanup() {
      aDocument.removeEventListener('DOMContentLoaded', onReady, false);
      aDocument.defaultView.removeEventListener('unload', cleanup, false);
    }

    function onReady() {
      cleanup();

      setCSS(aDocument, aCSS);
    }
  }

  function setCSS(aDocument, aCSS) {
    setContentStyleSheet(aCSS, {
      document: aDocument,
      id: kUI.pageStyleSheet.id
    });
  }

  return {
    set
  };
})();

/**
 * Preference menu handler.
 *
 * @return {hash}
 *   @key init {function}
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

      addEvent(popup, 'command', onCommand, false);

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

  function onCommand(aEvent) {
    let item = aEvent.target;

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
