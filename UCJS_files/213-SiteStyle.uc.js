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
 * List of noisy URL of the search results
 *
 * @param {string} Tests with 'https?://(www.)?' + value
 * @param {regexp}
 * @note cf. http://d.hatena.ne.jp/edvakf/20090723/1248365807
 */
const kNoiseList = [
  // Hatena
  'a.hatena.ne.jp',
  'b.hatena.ne.jp',
  'd.hatena.ne.jp/keyword',
  'k.hatena.ne.jp/keywordblog',
  'q.hatena.ne.jp',
  // Yahoo
  'chiebukuro.yahoo.co.jp',
  'bookmarks.yahoo.co.jp',
  'psearch.yahoo.co.jp',
  // misc.
  '1470.net',
  'basefeed.net',
  'bookmark.fc2.com',
  'buzz.goo.ne.jp',
  'buzzurl.jp',
  'ceron.jp',
  'clip.livedoor.com',
  'clip.nifty.com',
  'del.icio.us',
  'delicious.com',
  'faves.com',
  'favolog.org',
  'favotter.net',
  'friendfeed.com',
  'hiwihhi.com',
  'i.pecipeci.net',
  'knowledge.livedoor.com',
  'mark.jolt.jp',
  'matope.com',
  'newsing.jp',
  'pookmark.jp',
  'script-scrap.com',
  'swik.net',
  'synclick.jp',
  'tech.newzia.jp',
  'twib.jp',
  'tweetmeme.com',
  'tyudon.com/blog',
  'atwiki.jp',
  'blogpet.net/bookmark',
  'choix.jp',
  'cssclip.com',
  'google.com/buzz',
  'marici.com',
  'movook.com',
  'soukyu-mugen.com',
  'tarikin.net',
  'twitmunin.com',
  'wadaitter.com',
  'wdclip.com',
  /^http:\/\/(?:[\w-]+\.)*brothersoft\./,
  /^http:\/\/(?:[\w-]+\.)*clipp\.in/,
  /^http:\/\/(?:[\w-]+\.)*designiddatabase\./,
  /^http:\/\/(?:[\w-]+\.)*designlinkdatabase\./,
  /^http:\/\/(?:[\w-]+\.)*designrecipedatabase\./,
  /^http:\/\/(?:[\w-]+\.)*pastebin\./,
  /^http:\/\/(?:[\w-]+\.)*pg\-feed\./,
  /^http:\/\/(?:[\w-]+\.)*recipester\./,
  /^http:\/\/(?:[\w-]+\.)*rightclicksright\./,
  /^http:\/\/(?:[\w-]+\.)*softpedia./,
  /^http:\/\/(?:[\w-]+\.)*softonic\./,
  /^http:\/\/(?:[\w-]+\.)*thumbnailcloud\./,
  /^http:\/\/(?:[\w-]+\.)*tweetbuzz\./,
  // OKWave Q&A
  'nandemo.',
  'otasuke.',
  'qa.',
  'qanda.',
  'questionbox.',
  'mag2qa.com',
  'ziddy.japan.zdnet.com',
  /^http:\/\/(?:[\w-]+\.)*okwave\.jp/,
  /^http:\/\/oshiete\d?\./,
  /^http:\/\/soudan\d?\./,
  // proxy
  '24hr-computersecurity.com',
  'anticensure.com',
  'autobypass.com',
  'myproxysite.org',
  'proxy.citec.us',
  'proxydock.com',
  'qqclip.appspot.com',
  'rightpaths.com',
  'safesurf.foxrot.com',
  'takewii.com',
  'tehvu.ir',
  'unblockweb.us',
  // shopping
  '3mori.com',
  'e-shops.jp',
  'r.tabelog.com',
  /^http:\/\/(?:[\w-]+\.)*amazon\.(?:com|co\.jp)/,
  /^http:\/\/(?:[\w-]+\.)*kakaku\.(?:com|co\.jp)/,
  /^http:\/\/(?:[\w-]+\.)*rakuten\.(?:com|co\.jp)/
  //,
];

/**
 * List of sites
 *
 * @key name {string}
 *   this is displayed in the preference menu
 * @key include {regexp|string}|{regexp[]|string[]}
 *   describe the URL (or an array of URLs) that commands should run
 *   {string}: an exact match
 *
 * define one or more commands;
 *
 * @key quickScript {function} [optional]
 *   run the script as soon as a location changes
 *   @param aDocument {Document}
 *   @return {boolean}
 *     whether |script| is applied after |quickScript|
 *     true: do apply
 *     false: don't apply
 * @key script {function} [optional]
 *   run the script after the document loaded
 *   @param aDocument {Document}
 * @key style {function} [optional]
 *   make CSS to apply to the document
 *   @param aDocument {Document}
 *   @return {CSS}
 *
 * @key disabled {boolean} [optional]
 */
const kSiteList = [
  {
    name: 'Google Result',
    include: /^https?:\/\/www\.google\.[a-z.]+\/.*q=/,
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
        if (NoisyURLHandler.test(link.href)) {
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
          .ucjs_sitestyle_weaken h3{\
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
    include: /^http:\/\/search\.yahoo\.co\.jp\/search/,
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
      Array.forEach($S('.w'), (item) => {
        let link = $S1('.hd>h3>a', item);

        if (!link) {
          return;
        }

        // weaken a noisy item
        if (NoisyURLHandler.test(link.href)) {
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
    disabled: true,
    name: 'bing Result',
    include: /^http:\/\/www\.bing\.com\/search/
  },
  {
    name: 'Wikipedia Article',
    include: /^https?:\/\/[a-z]+\.wikipedia\.org\/wiki/,
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
    include: /^https?:\/\/(?:www\.)?youtube\.com\/(?:watch\?|channel\/|user\/)/,
    quickScript: function(aDocument) {
      let location = aDocument.location;

      // WORKAROUND: changes a hash for the start time of a video jumped
      // from 'Play in Youtube.com' of an embedded player, so that we can pause
      // at the time
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
 * Page observer handler
 *
 * @return {hash}
 *   @member init {function}
 *
 * TODO: surely detect that the document is loaded
 * WORKAROUND: applies a script when the complete request URL equals the
 * document URL
 *
 * TODO: surely detect that a request in the same document is loaded
 *   e.g.
 *   - a next page from a link of the navigation bar of Google result
 * WORKAROUND: observes |about:document-onload-blocker| and delays execution
 * of a command
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
            try {
              // error will occur if the document is not alive
              if (aDocument.readyState) {
                state.site.script(aDocument);
              }
            }
            catch (ex) {}
          }, 500, aBrowser.contentDocument);

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

  function fixupURL(aURL) {
    let uri;

    const uriFixup = Services.uriFixup;

    try {
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

  function testURL(aSite, aTargetURL) {
    let {include} = aSite;

    if (!Array.isArray(include)) {
      include = [include];
    }

    return include.some((url) =>
      (typeof url === 'string') ?
      url === aTargetURL :
      url.test(aTargetURL)
    );
  }

  function init() {
    mProgressListener.init();
  }

  return {
    init: init
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
 * Noisy URL handler
 *
 * @return {hash}
 *   @member test {function}
 */
const NoisyURLHandler = (function() {
  function test(aURL) {
    if (!/^https?:/.test(aURL)) {
      return false;
    }

    return kNoiseList.some((item) =>
      (typeof item === 'string') ?
      aURL.replace(/^https?:\/\/(?:www\.)?/, '').startsWith(item) :
      item.test(aURL)
    );
  }

  return {
    test: test
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
 * Entry point
 */
function SiteStyle_init() {
  PageObserver.init();
  PrefMenu.init();
}

SiteStyle_init();


})(this);
