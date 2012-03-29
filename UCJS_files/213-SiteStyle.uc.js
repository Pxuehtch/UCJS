// ==UserScript==
// @name        SiteStyle.uc.js
// @description Customizes the site styles.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note Creates a preference menu in 'tools' of menu bar.


(function() {


"use strict";


/**
 * Identifiers.
 */
const kID = {
  STYLESHEET: 'ucjs_sitestyle_stylesheet',
  PREFMENU: 'ucjs_sitestyle_prefmenu'
};


/**
 * Settings for UI.
 * @note U() for display.
 */
const kUI = {
  PREFMENU: {
    label: U('ucjsSiteStyle'),
    accesskey: 'S',
    disabledTip: U('登録サイトなし')
  }
};


/**
 * List of noisy URL of the search results.
 * @param {string} Tests with 'https?://(www.)?' + value.
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
  /^http:\/\/(?:[\w-]+\.)*pastebin\.ca/,
  /^http:\/\/(?:[\w-]+\.)*pg\-feed\.com/,
  /^http:\/\/(?:[\w-]+\.)*recipester\.org/,
  /^http:\/\/(?:[\w-]+\.)*rightclicksright\./,
  /^http:\/\/(?:[\w-]+\.)*softpedia.com/,
  /^http:\/\/(?:[\w-]+\.)*softonic\./,
  /^http:\/\/(?:[\w-]+\.)*thumbnailcloud\./,
  /^http:\/\/(?:[\w-]+\.)*tweetbuzz\.jp/,
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
  // comparison
  '3mori.com',
  'e-shops.jp',
  'r.tabelog.com',
  /^http:\/\/(?:[\w-]+\.)*amazon\.(?:com|co\.jp)\/.+/,
  /^http:\/\/(?:[\w-]+\.)*kakaku\.(?:com|co\.jp)\/.+/,
  /^http:\/\/(?:[\w-]+\.)*rakuten\.(?:com|co\.jp)\/.+/
  //,
];


/**
 * List of target site.
 * @param disabled {boolean} [optional] Set true and this item is ignored.
 * @param name {string}
 * @param include {regExp|string}|{array of (regexp|string)} {string} tests exact match.
 * @param wait {integer} [optional] Millisecond waiting time after document loaded.
 *   Set to 0 if you do not have to wait for DOM build.
 * @param command {function}
 */
const kSiteList = [
  {
    // @note needed to put before 'Google Result'
    name: 'Google Image Result',
    include: [
      /^https?:\/\/www\.google\.[a-z.]+\/[^#]*tb[ms]=isch[^#]*$/,
      /^https?:\/\/www\.google\.[a-z.]+\/.*#.*tb[ms]=isch/,
      /^https?:\/\/images\.google\.[a-z.]+\/search\?.+/
    ],
    wait: 0,
    command: function(aDocument) {
      var location = aDocument.location;
      // switch to the old mode.
      if (!/[?&#]sout=1/.test(location.href)) {
        location.replace(location.href + '&sout=1');
      }
    }
  },
  {
    name: 'Google Result',
    include: /^https?:\/\/www\.google\.[a-z.]+\/.*q=/,
    command: function(aDocument) {
      var params = aDocument.location.hash || aDocument.location.search;
      function testMode(a) {
        var [mode] = /[?&#]tb[ms]=[^&]+/.exec(params) || [];
        // main or not.
        if (!a)
          return !mode;
        return mode && a.test(mode);
      }

      processResultItems();
      setPageCSS({
        // except for shopping, application, books, places.
        custom: !testMode(/shop|app|bks|plcs/),
        // except for shopping, places.
        multiColumn: !testMode(/shop|plcs/)
      });

      function processResultItems() {
        // sanitize links.
        Array.forEach($S('li.g a', aDocument), function(a) {
          a.removeAttribute('onmousedown');

          var url = /google\./.test(a.hostname) && /^\/url$/.test(a.pathname) &&
            /[&?](?:q|url)=([^&]+)/.exec(a.search);
          if (url) {
            a.href = decodeURIComponent(url[1]);
          }
        });

        var lastHost = null;
        Array.forEach($S('li.g', aDocument), function(item) {
          var link = $S1('.r>a, .ts a', item);
          if (!link)
            return;

          // weaken noisy item.
          if (testNoisyURL(link.href)) {
            item.classList.add('ucjs_sitestyle_weaken');
          }

          // emphasize same host item.
          var host = link.hostname;
          if (host === lastHost) {
            item.classList.add('ucjs_sitestyle_samehost');
          } else {
            lastHost = host;
          }
        });
      }

      function setPageCSS(aOption) {
        var {custom, multiColumn} = aOption || {};

        var css = '\
          /* block items */\
          .nrgt>tbody>tr>td,.ts>tbody>tr>td{\
            float:left!important;\
            width:auto!important;\
          }\
          .nrgt,.nrgt *,.r~div{\
            width:auto!important;\
            margin-top:0!important;\
            margin-left:0!important;\
            padding-top:0!important;\
            padding-left:0!important;\
          }\
          .nrgt .l{\
            font-size:small!important;\
          }';

        if (custom) {
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
              opacity:.2!important;\
            }\
            .ucjs_sitestyle_weaken *:hover{\
              opacity:1!important;\
              -moz-transition:opacity .5s!important;\
            }';
        }
        if (multiColumn) {
          css += '\
            /* hidden right pane */\
            #rhs,#rhscol{\
              display:none!important;\
            }\
            #cnt,#res,.s,#mn{\
              width:auto!important;\
              max-width:100%!important;\
              margin:0!important;\
              padding:0!important;\
            }\
            #center_col{\
              width:auto!important;\
              margin-right:0!important;\
            }\
            h2.hd+div>ol,#mn #ires>ol{\
              -moz-column-count:2;\
              -moz-column-gap:1em;\
            }';
        }

        // On ajax loading, replace the old CSS.
        setStyleSheet(css, aDocument, {replace: true});
      }
    }
  },
  {
    name: 'Yahoo!JAPAN Result',
    include: /^http:\/\/search\.yahoo\.co\.jp\/search/,
    command: function(aDocument) {
      // sanitize links.
      Array.forEach($S('#contents a'), function(a) {
        a.removeAttribute('onmousedown');

        var url = /yahoo\./.test(a.hostname) && /^\/\*\-/.test(a.pathname) &&
          /\/\*\-([^?]+)/.exec(a.pathname);
        if (url) {
          a.href = decodeURIComponent(url[1]);
        }
      });

      // process items.
      Array.forEach($S('li'), function(item) {
        var link = $S1('.hd>h3>a', item);
        if (!link)
          return;

        // weaken noisy item.
        if (testNoisyURL(link.href)) {
          item.classList.add('ucjs_sitestyle_weaken');
        }
      });

      // set page CSS.
      setStyleSheet('\
        /* custom class */\
        .ucjs_sitestyle_weaken h3{\
          font-size:small!important;\
        }\
        .ucjs_sitestyle_weaken .hd~*{\
          opacity:.3!important;\
        }\
        .ucjs_sitestyle_weaken *:hover{\
          opacity:1!important;\
          -moz-transition:opacity .5s!important;\
        }\
        /* multi-column */\
        #wrapper, .size2of3, #WS2m .w, .dd{\
          width:100%!important;\
          overflow-x:hidden;\
        }\
        .nws .noimg{\
          margin-left:0!important;\
        }\
        #WS2m>ul{\
          -moz-column-count:2;\
          -moz-column-gap:1em;\
        }',
      aDocument);
    }
  },
  {
    name: 'bing Result',
    include: /^http:\/\/www\.bing\.com\/search/,
    command: function(aDocument) {
      setStyleSheet('\
        /* multi-column */\
        #content, .sa_cc{\
          max-width:100%!important;\
          padding-right:0!important;\
        }\
        #wg0{\
          -moz-column-count:2;\
          -moz-column-gap:1em;\
        }\
        #wg0>li{\
          float:inherit!important;\
        }',
      aDocument);
    }
  },
  {
    name: 'Wikipedia Article',
    include: /^http:\/\/[a-z]+\.wikipedia\.org\/wiki/,
    command: function(aDocument) {
      setStyleSheet('\
        /* popup reference */\
        .references li{\
          list-style-type:none;\
        }\
        .references li:target{\
          position:fixed;\
          left:155px;\
          right:13px;\
          bottom:0;\
          border:1px solid black;\
          background-color:khaki!important;\
        }',
      aDocument);
    }
  },
  {
    name: 'Youtube Player',
    include: /^https?:\/\/(?:www\.)?youtube\.com\/(?:watch|user)/,
    command: function(aDocument) {
      // exclude playlist mode.
      if (/[?&]list=/.test(aDocument.location.search))
        return;

      preventAutoplay();

      function preventAutoplay() {
        var player;
        // Flash version.
        player = aDocument.getElementById('movie_player');
        if (player) {
          let flashvars = player.getAttribute('flashvars');
          if (flashvars.indexOf('autoplay=0') < 0) {
            player.setAttribute('flashvars', flashvars + '&autoplay=0');
            player.src += '#';
          }
          return;
        }
        // HTML5 version.
        player = (aDocument.getElementsByTagName('video') || [])[0];
        if (player) {
          player.pause();
          player.currentTime = 0;
          return;
        }
      }
    }
  }
  //,
];


/**
 * Page observer handler.
 * @return {hash}
 *   @member init {function}
 */
var mPageObserver = (function() {
  /**
   * Handler for the cache of browsers on progress listener.
   */
  var mBrowserState = (function() {
    var browsers = new WeakMap();

    function clear(aBrowser) {
      browsers.delete(aBrowser);
    }

    function get(aBrowser) {
      return browsers.get(aBrowser, null);
    }

    function set(aBrowser, aState) {
      browsers.set(aBrowser, aState);
    }

    return {
      clear: clear,
      get: get,
      set: set
    };
  })();

  var mProgressListener = {
    onLocationChange: function(aBrowser, aWebProgress, aRequest, aLocation, aFlags) {
      mBrowserState.clear(aBrowser);

      var URL = aLocation.spec;
      if (!/^https?/.test(URL))
        return;

      // 1st. test quick apply.
      if (apply(aBrowser, {quick: true}))
        return;

      // 2nd. wait document loading.
      // aFlags: LOCATION_CHANGE_SAME_DOCUMENT=0x1
      var observing = (aFlags & 0x1) ? 'STOP_REQUEST' : 'STOP_WINDOW';
      mBrowserState.set(aBrowser, {URL: URL, observing: observing});
    },

    onStateChange: function(aBrowser, aWebProgress, aRequest, aFlags, aStatus) {
      var URL = aBrowser.currentURI.spec;
      if (!/^https?/.test(URL))
        return;

      var state = mBrowserState.get(aBrowser);
      if (!state || state.URL !== URL)
        return;

      // aFlags: STATE_STOP=0x10, STATE_IS_REQUEST=0x10000, STATE_IS_WINDOW=0x80000
      if ((state.observing === 'STOP_WINDOW' && (aFlags & 0x10) && (aFlags & 0x80000) &&
          aRequest.name === URL) ||
          (state.observing === 'STOP_REQUEST' && (aFlags & 0x10) && (aFlags & 0x10000) &&
          aRequest.name === 'about:document-onload-blocker')) {
        apply(aBrowser);
        mBrowserState.clear(aBrowser);
      }
    },

    onProgressChange: function() {},
    onSecurityChange: function() {},
    onStatusChange: function() {},
    onRefreshAttempted: function() {},
    onLinkIconAvailable: function() {}
  };

  function apply(aBrowser, aOption) {
    var {quick} = aOption || {};
    var URL = aBrowser.currentURI.spec;

    return kSiteList.some(function(site) {
      if (!site.disabled && testURL(site, URL)) {
        if (quick) {
          if (site.wait === 0) {
            site.command(aBrowser.contentDocument);
            return true;
          }
          return false;
        }

        setTimeout(function() {
          if (aBrowser && aBrowser.contentDocument) {
            site.command(aBrowser.contentDocument);
          }
        }, site.wait || 0);
        return true;
      }
      return false;
    });
  }

  function testURL(aSite, aTargetURL) {
    var {include} = aSite;

    // test inclusion.
    if (!Array.isArray(include)) {
      include = [include];
    }
    return include.some(function(a) {
      return (typeof a === 'string') ? a === aTargetURL : a.test(aTargetURL);
    });
  }

  function init() {
    gBrowser.addTabsProgressListener(mProgressListener);
    addEvent([window, 'unload', function() {
      gBrowser.removeTabsProgressListener(mProgressListener);
    }, false]);
  }

  return {
    init: init
  };
})();


/**
 * Preference menu handler.
 * @return {hash}
 *   @member init {function}
 */
var mPrefMenu = (function() {
  function init() {
    var menu = document.getElementById('menu_ToolsPopup').appendChild($E('menu', {
      id: kID.PREFMENU,
      label: kUI.PREFMENU.label,
      accesskey: kUI.PREFMENU.accesskey
    }));
    addEvent([menu, 'command', doCommand, false]);

    if (kSiteList.length) {
      let popup = $E('menupopup', {
        onpopupshowing: 'event.stopPropagation();'
      });
      kSiteList.forEach(function(a, i) {
        popup.appendChild($E('menuitem', {
          value: i,
          label: a.name,
          type: 'checkbox',
          checked: !a.disabled,
          closemenu: 'none'
        }));
      });
      menu.appendChild(popup);
    } else {
      $E(menu, {
        tooltiptext: kUI.PREFMENU.disabledTip,
        disabled: true
      });
    }
  }

  function doCommand(aEvent) {
    aEvent.stopPropagation();
    var item = aEvent.target;
    if (!item.value)
      return;

    kSiteList[+(item.value)].disabled = !item.hasAttribute('checked');
  }

  return {
    init: init
  };
})();


// Utilities.

function testNoisyURL(aURL) {
  if (!/^https?:/.test(aURL))
    return false;

  return kNoiseList.some(function(a) {
    if (typeof a === 'string') {
      return aURL.replace(/^https?:\/\/(?:www.)?/, '').indexOf(a) === 0;
    }
    return a.test(aURL);
  });
}


// Imports.

function $E(aTagOrNode, aAttribute)
  ucjsUtil.createNode(aTagOrNode, aAttribute);

function $S(aSelector, aContext)
  ucjsUtil.getNodesBySelector(aSelector, aContext);

function $S1(aSelector, aContext)
  ucjsUtil.getFirstNodeBySelector(aSelector, aContext);

function U(aStr)
  ucjsUtil.convertForSystem(aStr);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function setStyleSheet(aCSS, aDocument, aOption) {
  var {replace} = aOption || {};
  ucjsUtil.setContentStyleSheet(aCSS, {doc: aDocument, id: kID.STYLESHEET, replace: replace});
}

function log(aMsg)
  ucjsUtil.logMessage('SiteStyle.uc.js', aMsg);


// Entry point.

function SiteStyle_init() {
  mPageObserver.init();
  mPrefMenu.init();
}

SiteStyle_init();


})();
