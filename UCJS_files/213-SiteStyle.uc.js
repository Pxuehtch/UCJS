// ==UserScript==
// @name        SiteStyle.uc.js
// @description Customizes the style of web sites
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note creates a preference menu in 'tools' of the menu bar


(function(window, undefined) {


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
  setContentStyleSheet
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('SiteStyle.uc.js', aMsg);
}

/**
 * Identifiers
 */
const kID = {
  STYLESHEET: 'ucjs_sitestyle_stylesheet',
  PREFMENU: 'ucjs_sitestyle_prefmenu'
};

/**
 * Settings for UI
 */
const kUI = {
  PREFMENU: {
    label: 'ucjsSiteStyle',
    accesskey: 'S',
    disabledTip: '登録サイトなし'
  }
};

/**
 * List of noisy URLs in the search results of the web search engine
 *
 * @value {string|regexp}
 *   @see |URLFilter| for filter rules
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
 * List of sites
 *
 * @key name {string}
 *   displayed in the preference menu
 * @key include {regexp|string}|{regexp[]|string[]}
 *   describe the URL where the commands should run
 *   @see |URLFilter| for filter rules
 *
 * define one or more commands;
 * ----------
 * @key quickScript {function} [optional]
 *   run the script as soon as a location changes
 *   @param aDocument {Document}
 *   @return {boolean}
 *     whether |script| is applied or not after |quickScript|
 * @key script {function} [optional]
 *   run the script after the document loaded
 *   @param aDocument {Document}
 * @key style {function} [optional]
 *   make CSS to apply to the document
 *   @param aDocument {Document}
 *   @return {CSS}
 * ----------
 *
 * @key disabled {boolean} [optional]
 *
 * @note don't add a key '_includeFilter' that is reserved for internal use
 * @see |PageObserver::testURL()|
 */
const kSiteList = [
  {
    name: 'Google Result',
    include: '||google.tld/*q=',
    script: function(aDocument) {
      // sanitize links
      Array.forEach($S('li.g a', aDocument), (link) => {
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

      Array.forEach($S('li.g', aDocument), (item) => {
        let link = $S1('.r>a, .ts a', item);

        if (!link) {
          return;
        }

        // weaken noisy item
        if (NoisyURLFilter.test(link.href)) {
          item.classList.add('ucjs_sitestyle_weaken');
        }

        // emphasize the same host item
        let host = link.hostname;

        if (host === lastHost) {
          item.classList.add('ucjs_sitestyle_samehost');
        }
        else {
          lastHost = host;
        }
      });
    },
    style: function(aDocument) {
      let testMode = (function() {
        let params = aDocument.location.hash || aDocument.location.search;
        let [, mode] = /[?&#]tb[ms]=([^&]+)/.exec(params) || [];

        return (aModeList) => {
          if (aModeList) {
            return mode && RegExp('^(' + aModeList + ')$').test(mode);
          }

          // the main result page or not
          return !mode;
        };
      })();

      // common styles
      let css = '\
        /* block items */\
        .nrgt>tbody>tr>td,.ts>tbody>tr>td{\
          float:left!important;\
          width:auto!important;\
        }\
        /* sub contents items */\
        .nrgt,.nrgt *,.r~div{\
          width:auto!important;\
          margin-top:0!important;\
          margin-left:0!important;\
          padding-top:0!important;\
          padding-left:0!important;\
        }\
        .nrgt .l{\
          font-size:small!important;\
        }\
        /* footer navi */\
        #foot{\
          width:auto!important;\
          margin:0!important;\
        }';

      // workaround for broken styles
      // except for images, shopping
      if (!testMode('isch|shop')) {
        css += '\
          /* content area container */\
          .col{\
            float:none!important;\
            width:auto!important;\
          }';
      }

      // each item styles
      // except for images, shopping, application, books
      if (!testMode('isch|shop|app|bks')) {
        css += '\
          .ucjs_sitestyle_samehost cite::before{\
            content:"=";\
            font-weight:bold;\
            color:red;\
            margin-right:2px;\
          }\
          #res .ucjs_sitestyle_weaken h3{\
            font-size:small!important;\
          }\
          .ucjs_sitestyle_weaken h3~*{\
            opacity:.3!important;\
          }\
          .ucjs_sitestyle_weaken:hover *{\
            opacity:1!important;\
            transition:opacity .5s!important;\
          }';
      }

      // multi-column
      // except for images, shopping
      if (!testMode('isch|shop')) {
        css += '\
          /* hide right pane */\
          #rhs,#rhscol,#leftnav+td+td{\
            display:none!important;\
          }\
          #cnt,#res,.s,#mn{\
            max-width:100%!important;\
            width:auto!important;\
            margin:0!important;\
            padding:0!important;\
          }\
          #leftnav+td{\
            width:100%!important;\
          }\
          #center_col{\
            width:auto!important;\
            margin:0 2em!important;\
          }\
          h2.hd+div>ol,#mn #ires>ol{\
            -moz-column-count:2;\
            -moz-column-gap:1em;\
          }';
      }

      return css;
    }
  },
  {
    name: 'Yahoo!JAPAN Result',
    include: '|search.yahoo.co.jp/search',
    script: function(aDocument) {
      // sanitize links
      Array.forEach($S('#contents a'), (link) => {
        link.removeAttribute('onmousedown');

        let url =
          /yahoo\./.test(link.hostname) &&
          /^\/\*\-/.test(link.pathname) &&
          /\/\*\-([^?]+)/.exec(link.pathname);

        if (url) {
          link.href = decodeURIComponent(url[1]);
        }
      });

      // process items
      Array.forEach($S('.w,.cmm'), (item) => {
        let link = $S1('.hd>h3>a', item);

        if (!link) {
          return;
        }

        // weaken a noisy item
        if (NoisyURLFilter.test(link.href)) {
          item.classList.add('ucjs_sitestyle_weaken');
        }
      });
    },
    style: function(aDocument) {
      let css = '\
        /* custom class */\
        .ucjs_sitestyle_weaken h3{\
          font-size:small!important;\
        }\
        .ucjs_sitestyle_weaken .hd~*,\
        .ucjs_sitestyle_weaken h3~*\
        {\
          opacity:.3!important;\
        }\
        .ucjs_sitestyle_weaken:hover *{\
          opacity:1!important;\
          transition:opacity .5s!important;\
        }';

      return css;
    }
  },
  {
    name: 'Wikipedia Article',
    include: '||wikipedia.org/wiki/',
    style: function(aDocument) {
      let css = '\
        /* popup reference */\
        .references li{\
          list-style-type:none;\
        }\
        .references li:target{\
          position:fixed;\
          left:170px;\
          right:13px;\
          bottom:0;\
          border:1px solid black;\
          background-color:khaki!important;\
        }';

      return css;
    }
  },
  {
    name: 'Youtube Player',
    include: /^https?:\/\/(?:www\.)?youtube\.com\/(?:watch|channel|user)/,
    quickScript: function(aDocument) {
      let location = aDocument.location;

      // WORKAROUND: changes a parameter key for the start time of a video page
      // that comes from 'Play in Youtube.com' of an embedded player so that we
      // can pause at that time
      if (/#at=\d+/.test(location.href)) {
        location.replace(location.href.replace('#at=', '#t='));
        return false;
      }
      return true;
    },
    script: function(aDocument) {
      // exclude the playlist mode
      if (!/[?&]list=/.test(aDocument.location.search)) {
        preventAutoplay();
      }

      // using Youtube Player API
      // @see https://developers.google.com/youtube/js_api_reference
      function preventAutoplay() {
        let intervalTime = 500;
        let waitCount = 20;

        let timerID = setInterval(() => {
          if (--waitCount < 0) {
            clear();
            return;
          }

          let player = $S1('[id^="movie_player"]', aDocument);
          if (player) {
            player = player.wrappedJSObject;
            if (player.getPlayerState) {
              switch (player.getPlayerState()) {
                case 1: // playing
                case 2: // paused
                  clear();
                  player.pauseVideo();
                  player.seekTo(getStartTime(aDocument.location.href));
                  break;
              }
            }
          }
        }, intervalTime);

        aDocument.defaultView.
          addEventListener('unload', clear, false);

        function clear() {
          aDocument.defaultView.
            removeEventListener('unload', clear, false);

          clearInterval(timerID);
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
 * URL filter handler
 *
 * @return {hash}
 *   @member init {function}
 *
 * [URL filter rules]
 * @value {regexp|string}|{regexp[]|string[]}
 *   {regexp} - used as-is
 *   {string} - usually a partial match
 *     @note special symbols are available;
 *     1.the leading '||' -> ^https?:\/\/[\w-.]*?
 *                        -> ^ if URL scheme follows after
 *     2.the leading '|'  -> ^https?:\/\/(?:www\d*\.)?
 *                        -> ^ if URL scheme follows after
 *     3.the wildcard '*' -> .+?
 *     4.'.tld' will match any top level domain
 */
const URLFilter = (function() {
  /**
   * Create URL filter instance
   *
   * @param aList {array}
   * @return {hash}
   *   @member test {function}
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
        ['|',  /^https?:\/\/(?:www\d*\.)?/],
      ].
      some(([symbol, re]) => {
        if (item.startsWith(symbol)) {
          item = item.substring(symbol.length);

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
   * TODO: fix a wrong return value for a specific host
   * I have found only 'github.io' for now
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
    init: init
  };
})();

/**
 * Page observer handler
 *
 * @return {hash}
 *   @member init {function}
 *
 * TODO: surely detect when the document is loaded
 * WORKAROUND: applies a script when the complete request URL equals the
 * document URL
 *
 * TODO: surely detect when a request in the same document is loaded (e.g.
 * a next page from a link of the navigation bar of Google result)
 * WORKAROUND: observes |about:document-onload-blocker| and delays execution
 * of a command
 *
 * TODO: surely detect the result page from the Google top page
 */
const PageObserver = (function() {
  const {
    LOCATION_CHANGE_SAME_DOCUMENT,
    STATE_STOP, STATE_IS_WINDOW, STATE_IS_REQUEST
  } = Ci.nsIWebProgressListener;

  let mBrowserState = new WeakMap();

  const mProgressListener = {
    init: function() {
      addEvent(gBrowser.tabContainer, 'TabClose', (aEvent) => {
        let browser = aEvent.target.linkedBrowser;

        mBrowserState.delete(browser);
      }, false);

      gBrowser.addTabsProgressListener(mProgressListener);

      addEvent(window, 'unload', () => {
        gBrowser.removeTabsProgressListener(mProgressListener);
      }, false);
    },

    onLocationChange: function(
      aBrowser, aWebProgress, aRequest, aLocation, aFlags) {
      let URL = aLocation.spec;

      if (!/^https?/.test(URL)) {
        return;
      }

      mBrowserState.delete(aBrowser);

      let site = matchSiteList(URL);

      if (!site) {
        return;
      }

      // 1. apply the stylesheet
      if (site.style) {
        let css = site.style(aBrowser.contentDocument);

        PageCSS.set(aBrowser.contentDocument, css);
      }

      // 2. run the quick script before the document loading
      if (site.quickScript) {
        if (!site.quickScript(aBrowser.contentDocument)) {
          // suppress the following script
          return;
        }
      }

      // 3. wait the document loads and run the script
      if (site.script) {
        mBrowserState.set(aBrowser, {
          URL: URL,
          site: site,
          isSameDocument: aFlags & LOCATION_CHANGE_SAME_DOCUMENT
        });
      }
    },

    onStateChange: function(
      aBrowser, aWebProgress, aRequest, aFlags, aStatus) {
      let URL = aBrowser.currentURI.spec;

      if (!/^https?/.test(URL)) {
        return;
      }

      let state = mBrowserState.get(aBrowser, null);

      if (!state || state.URL !== URL) {
        return;
      }

      if (aFlags & STATE_STOP) {
        // fix up a cached page URL (wyciwyg:)
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

    onProgressChange: function() {},
    onSecurityChange: function() {},
    onStatusChange: function() {},
    onRefreshAttempted: function() {},
    onLinkIconAvailable: function() {}
  };

  /**
   * Checks whether a document is alive or not
   *
   * @param aDocument {Document}
   * @return {boolean}
   *
   * TODO: this is a workaround for checking a dead object. consider a reliable
   * method instead
   */
  function checkAlive(aDocument) {
    try {
      return !!(aDocument && aDocument.defaultView);
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
    // set the URL filter for inclusion inside each item
    // TODO: avoid adding a hidden key that could cause an unexpected conflict
    // in a constant |kSiteList|
    if (!aSite._includeFilter) {
      aSite._includeFilter = URLFilter.init(aSite.include);
    }

    return aSite._includeFilter.test(aURL);
  }

  function init() {
    mProgressListener.init();
  }

  return {
    init: init
  };
})();

/**
 * Noisy URL filter
 *
 * @return {hash}
 *   @member test {function}
 */
const NoisyURLFilter = (function() {
  let filter = URLFilter.init(kNoiseList);

  return {
    test: filter.test
  };
})();

/**
 * Page CSS handler
 *
 * @return {hash}
 *   @member set {function}
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
      id: kID.STYLESHEET
    });
  }

  return {
    set: set
  };
})();

/**
 * Preference menu handler
 *
 * @return {hash}
 *   @member init {function}
 */
const PrefMenu = (function() {
  function init() {
    let menu = $ID('menu_ToolsPopup').

    appendChild($E('menu', {
      id: kID.PREFMENU,
      label: kUI.PREFMENU.label,
      accesskey: kUI.PREFMENU.accesskey
    }));

    addEvent(menu, 'command', doCommand, false);

    if (kSiteList.length) {
      let popup = $E('menupopup', {
        onpopupshowing: 'event.stopPropagation();'
      });

      kSiteList.forEach(({name, disabled}, i) => {
        popup.appendChild($E('menuitem', {
          value: i,
          label: name + (disabled ? ' [disabled]' : ''),
          type: 'checkbox',
          checked: !disabled,
          closemenu: 'none'
        }));
      });

      menu.appendChild(popup);
    }
    else {
      $E(menu, {
        tooltiptext: kUI.PREFMENU.disabledTip,
        disabled: true
      });
    }
  }

  function doCommand(aEvent) {
    aEvent.stopPropagation();

    let item = aEvent.target;

    if (!item.value) {
      return;
    }

    kSiteList[+(item.value)].disabled = !item.hasAttribute('checked');
  }

  return {
    init: init
  };
})();

/**
 * Entry point
 */
function SiteStyle_init() {
  PageObserver.init();
  PrefMenu.init();
}

SiteStyle_init();


})(this);
