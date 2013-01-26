// ==UserScript==
// @name        SiteStyle.uc.js
// @description Customizes the site styles.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note Creates a preference menu in 'tools' of the menu bar.


(function(window, undefined) {


"use strict";


/**
 * Identifiers
 */
const kID = {
  STYLESHEET: 'ucjs_sitestyle_stylesheet',
  PREFMENU: 'ucjs_sitestyle_prefmenu'
};

/**
 * Settings for UI
 * @note |U()| converts embedded chars in the code for displaying properly.
 */
const kUI = {
  PREFMENU: {
    label: U('ucjsSiteStyle'),
    accesskey: 'S',
    disabledTip: U('登録サイトなし')
  }
};

/**
 * List of noisy URL of the search results
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
  // comparison
  '3mori.com',
  'e-shops.jp',
  'r.tabelog.com',
  /^http:\/\/(?:[\w-]+\.)*amazon\.(?:com|co\.jp)/,
  /^http:\/\/(?:[\w-]+\.)*kakaku\.(?:com|co\.jp)/,
  /^http:\/\/(?:[\w-]+\.)*rakuten\.(?:com|co\.jp)/
  //,
];

/**
 * Preset list of the site
 * @key name {string}
 *   this is displayed in the preference menu
 * @key include {regexp|string}|{regexp[]|string[]}
 *   describe the URL (or an array of URLs) that commands should run
 *   {string}: an exact match
 *
 * define one or more commands
 * @key quickScript {function} [optional]
 *   run the script as soon as a location changes
 *   @param aDocument {Document}
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
    // @note Needed to put before 'Google Result'
    name: 'Google Image Result',
    include: [
      /^https?:\/\/www\.google\.[a-z.]+\/[^#]*tb[ms]=isch[^#]*$/,
      /^https?:\/\/www\.google\.[a-z.]+\/.*#.*tb[ms]=isch/,
      /^https?:\/\/images\.google\.[a-z.]+\/search\?.+/
    ],
    quickScript: function(aDocument) {
      var location = aDocument.location;
      // switch to the old mode
      if (!/[?&#]sout=1/.test(location.href)) {
        location.replace(location.href + '&sout=1');
      }
    }
  },
  {
    name: 'Google Result',
    include: /^https?:\/\/www\.google\.[a-z.]+\/.*q=/,
    script: function(aDocument) {
      // sanitize links
      Array.forEach($S('li.g a', aDocument), function(link) {
        link.removeAttribute('onmousedown');

        var url =
          /google\./.test(link.hostname) &&
          /^\/url$/.test(link.pathname) &&
          /[&?](?:q|url)=([^&]+)/.exec(link.search);
        if (url) {
          link.href = decodeURIComponent(url[1]);
        }
      });

      var lastHost = null;
      Array.forEach($S('li.g', aDocument), function(item) {
        var link = $S1('.r>a, .ts a', item);
        if (!link) {
          return;
        }

        // weaken noisy item.
        if (NoisyURLHandler.test(link.href)) {
          item.classList.add('ucjs_sitestyle_weaken');
        }

        // emphasize the same host item
        var host = link.hostname;
        if (host === lastHost) {
          item.classList.add('ucjs_sitestyle_samehost');
        } else {
          lastHost = host;
        }
      });
    },
    style: function(aDocument) {
      let testMode = (function() {
        let params = aDocument.location.hash || aDocument.location.search;
        let [, mode] = /[?&#]tb[ms]=([^&]+)/.exec(params) || [];

        return function(aModeList) {
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

      // each item styles
      // except for shopping, application, books, places
      if (!testMode('shop|app|bks|plcs')) {
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
            transition:opacity .5s!important;\
          }';
      }

      // multi-column
      // except for shopping, places
      if (!testMode('shop|plcs')) {
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
      Array.forEach($S('#contents a'), function(link) {
        link.removeAttribute('onmousedown');

        var url =
          /yahoo\./.test(link.hostname) &&
          /^\/\*\-/.test(link.pathname) &&
          /\/\*\-([^?]+)/.exec(link.pathname);
        if (url) {
          link.href = decodeURIComponent(url[1]);
        }
      });

      // process items
      Array.forEach($S('li'), function(item) {
        var link = $S1('.hd>h3>a', item);
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
        .ucjs_sitestyle_weaken .hd~*{\
          opacity:.3!important;\
        }\
        .ucjs_sitestyle_weaken *:hover{\
          opacity:1!important;\
          transition:opacity .5s!important;\
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
        }';

      return css;
    }
  },
  {
    name: 'bing Result',
    include: /^http:\/\/www\.bing\.com\/search/,
    style: function(aDocument) {
      let css = '\
        /* multi-column */\
        #results_area{\
          width:100%!important;\
        }\
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
        }';

      return css;
    }
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
    include: /^https?:\/\/(?:www\.)?youtube\.com\/(?:watch\?|user\/|\w+$)/,
    script: function(aDocument) {
      // exclude the playlist mode
      if (/[?&]list=/.test(aDocument.location.search)) {
        return;
      }

      // wait for the player ready
      setTimeout(preventAutoplay, 1000);

      function preventAutoplay() {
        if (!aDocument) {
          return;
        }

        var player;

        // Flash version
        player = $S1('embed[id^="movie_player"]', aDocument);
        if (player) {
          let flashvars = player.getAttribute('flashvars');
          if (!flashvars.contains('autoplay=0')) {
            player.setAttribute('flashvars', flashvars + '&autoplay=0');
            player.src += '#';
          }
          return;
        }

        // HTML5 version
        player = $S1('video', aDocument);
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
 * Page observer handler
 * @return {hash}
 *   @member init {function}
 */
var PageObserver = (function() {
  let mBrowserState = new WeakMap();

  var mProgressListener = {
    init: function() {
      addEvent([gBrowser.tabContainer, 'TabClose', function(aEvent) {
        var browser = aEvent.target.linkedBrowser;
        mBrowserState.delete(browser);
      }, false]);

      gBrowser.addTabsProgressListener(mProgressListener);
      addEvent([window, 'unload', function() {
        gBrowser.removeTabsProgressListener(mProgressListener);
      }, false]);
    },

    onLocationChange: function(aBrowser, aWebProgress, aRequest, aLocation,
      aFlags) {
      var URL = aLocation.spec;
      if (!/^https?/.test(URL)) {
        return;
      }

      mBrowserState.delete(aBrowser);

      var site = matchSiteList(URL);
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
        site.quickScript(aBrowser.contentDocument);
      }

      // 3. wait the document loads and run the script
      if (site.script) {
        // aFlags: LOCATION_CHANGE_SAME_DOCUMENT=0x1
        let observing = (aFlags & 0x1) ?
          'FIRST_STOP_REQUEST' : 'FIRST_STOP_WINDOW';
        mBrowserState.set(aBrowser, {
          URL: URL,
          site: site,
          observing: observing
        });
      }
    },

    onStateChange: function(aBrowser, aWebProgress, aRequest, aFlags,
      aStatus) {
      var URL = aBrowser.currentURI.spec;
      if (!/^https?/.test(URL)) {
        return;
      }

      var state = mBrowserState.get(aBrowser, null);
      if (!state || state.URL !== URL) {
        return;
      }

      // aFlags: STATE_STOP=0x10, STATE_IS_REQUEST=0x10000,
      // STATE_IS_WINDOW=0x80000
      if (
          (state.observing === 'FIRST_STOP_WINDOW' &&
           (aFlags & 0x10) && (aFlags & 0x80000) &&
           aRequest.name === URL) ||

          (state.observing === 'FIRST_STOP_REQUEST' &&
           (aFlags & 0x10) && (aFlags & 0x10000) &&
           aRequest.name === 'about:document-onload-blocker')
      ) {
        state.site.script(aBrowser.contentDocument);
        mBrowserState.delete(aBrowser);
      }
    },

    onProgressChange: function() {},
    onSecurityChange: function() {},
    onStatusChange: function() {},
    onRefreshAttempted: function() {},
    onLinkIconAvailable: function() {}
  };

  function matchSiteList(aURL) {
    var site = null;

    kSiteList.some(function(item) {
      if (!item.disabled && testURL(item, aURL)) {
        site = item;
        return true;
      }
      return false;
    });

    return site;
  }

  function testURL(aSite, aTargetURL) {
    var {include} = aSite;

    if (!Array.isArray(include)) {
      include = [include];
    }

    return include.some(function(url) {
      return (typeof url === 'string') ?
        url === aTargetURL : url.test(aTargetURL);
    });
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
 * @return {hash}
 *   @member init {function}
 */
var PrefMenu = (function() {
  function init() {
    var menu = window.document.getElementById('menu_ToolsPopup').
    appendChild($E('menu', {
      id: kID.PREFMENU,
      label: kUI.PREFMENU.label,
      accesskey: kUI.PREFMENU.accesskey
    }));
    addEvent([menu, 'command', doCommand, false]);

    if (kSiteList.length) {
      let popup = $E('menupopup', {
        onpopupshowing: 'event.stopPropagation();'
      });
      kSiteList.forEach(function(item, i) {
        popup.appendChild($E('menuitem', {
          value: i,
          label: item.name,
          type: 'checkbox',
          checked: !item.disabled,
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
 * @return {hash}
 *   @member test {function}
 */
var NoisyURLHandler = (function() {
  function test(aURL) {
    if (!/^https?:/.test(aURL)) {
      return false;
    }

    return kNoiseList.some(function(item) {
      if (typeof item === 'string') {
        return aURL.replace(/^https?:\/\/(?:www.)?/, '').startsWith(item);
      }
      return item.test(aURL);
    });
  }

  return {
    test: test
  };
})();


/**
 * Page CSS handler
 * @return {hash}
 *   @member set {function}
 */
var PageCSS = (function() {
  function set(aDocument, aCSS) {
    if (/^(?:complete|interactive)$/.test(aDocument.readyState)) {
      setContentStyleSheet(aDocument, aCSS);
      return;
    }

    aDocument.addEventListener('DOMContentLoaded',
    function onReady() {
      aDocument.removeEventListener('DOMContentLoaded', onReady, false);

      setContentStyleSheet(aDocument, aCSS);
    }, false);
  }

  return {
    set: set
  };
})();


//********** Imports

function $E(aTagOrNode, aAttribute) {
  return window.ucjsUtil.createNode(aTagOrNode, aAttribute);
}

function $S(aSelector, aContext) {
  return window.ucjsUtil.getNodesBySelector(aSelector, aContext);
}

function $S1(aSelector, aContext) {
  return window.ucjsUtil.getFirstNodeBySelector(aSelector, aContext);
}

function U(aStr) {
  return window.ucjsUtil.toStringForUI(aStr);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function setContentStyleSheet(aDocument, aCSS) {
  window.ucjsUtil.setContentStyleSheet(aCSS, {
    document: aDocument,
    id: kID.STYLESHEET
  });
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('SiteStyle.uc.js', aMsg);
}


//********** Entry point

function SiteStyle_init() {
  PageObserver.init();
  PrefMenu.init();
}

SiteStyle_init();


})(this);
