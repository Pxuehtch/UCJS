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
 * List of noisy URL on the search results like Bookmark, Q&A, Proxy, etc.
 * @note cf. http://d.hatena.ne.jp/edvakf/20090723/1248365807
 */
const kNoisyURLs = [
  /^http:\/\/b\.hatena\.ne\.jp\/entry/,
  /^http:\/\/d\.hatena\.ne\.jp\/keyword/,
  /^http:\/\/k\.hatena\.ne\.jp\/keywordblog/,
  /^http:\/\/(?:chiebukuro|bookmarks|psearch)\.yahoo\.co\.jp/,
  /^http:\/\/[\w\-\.]*brothersoft\./,
  /^http:\/\/[\w\-\.]*clipp\.in/,
  /^http:\/\/[\w\-\.]*designiddatabase\./,
  /^http:\/\/[\w\-\.]*designlinkdatabase\./,
  /^http:\/\/[\w\-\.]*designrecipedatabase\./,
  /^http:\/\/[\w\-\.]*pastebin\.ca/,
  /^http:\/\/[\w\-\.]*pg\-feed\.com/,
  /^http:\/\/[\w\-\.]*recipester\.org/,
  /^http:\/\/[\w\-\.]*rightclicksright\./,
  /^http:\/\/[\w\-\.]*softpedia.com\./,
  /^http:\/\/[\w\-\.]*thumbnailcloud\./,
  /^http:\/\/[\w\-\.]*tweetbuzz\.jp/,
  /^http:\/\/1470\.net/,
  /^http:\/\/basefeed\.net/,
  /^http:\/\/bookmark\.fc2\.com/,
  /^http:\/\/buzz\.goo\.ne\.jp/,
  /^http:\/\/buzzurl\.jp/,
  /^http:\/\/ceron\.jp/,
  /^http:\/\/del\.icio\.us/,
  /^http:\/\/clip\.livedoor\.com/,
  /^http:\/\/clip\.nifty\.com/,
  /^http:\/\/faves\.com/,
  /^http:\/\/favotter\.net/,
  /^http:\/\/friendfeed\.com/,
  /^http:\/\/hiwihhi\.com/,
  /^http:\/\/i\.pecipeci\.net/,
  /^http:\/\/mark\.jolt\.jp/,
  /^http:\/\/matope\.com/,
  /^http:\/\/newsing\.jp/,
  /^http:\/\/pookmark\.jp/,
  /^http:\/\/script\-scrap\.com/,
  /^http:\/\/swik\.net/,
  /^http:\/\/synclick\.jp/,
  /^http:\/\/tech\.newzia\.jp/,
  /^http:\/\/twib\.jp/,
  /^http:\/\/tweetmeme\.com/,
  /^http:\/\/tyudon\.com\/blog/,
  /^http:\/\/www\.atwiki\.jp/,
  /^http:\/\/www\.blogpet\.net\/bookmark/,
  /^http:\/\/www\.choix\.jp/,
  /^http:\/\/www\.cssclip\.com/,
  /^http:\/\/www\.google\.com\/buzz/,
  /^http:\/\/www\.marici\.com/,
  /^http:\/\/www\.movook\.com/,
  /^http:\/\/www\.soukyu\-mugen\.com/,
  /^http:\/\/www\.tarikin\.net/,
  /^http:\/\/www\.twitmunin\.com/,
  /^http:\/\/www\.wdclip\.com/,
  // About okwave Q&A.
  /^http:\/\/[\w\-\.]*okwave\.jp/,
  /^http:\/\/oshiete\d?\./,
  /^http:\/\/soudan\d?\./,
  /^http:\/\/otasuke\./,
  /^http:\/\/nandemo\./,
  /^http:\/\/qa\./,
  /^http:\/\/qanda\./,
  /^http:\/\/questionbox\./,
  /^http:\/\/www\.mag2qa\.com/,
  /^http:\/\/ziddy\.japan\.zdnet\.com/,
  // Proxy.
  /^http:\/\/(?:www\.)?anticensure\.com/,
  /^http:\/\/(?:www\.)?autobypass\.com/,
  /^http:\/\/(?:www\.)?myproxysite\.org/,
  /^http:\/\/(?:www\.)?proxydock\.com/,
  /^http:\/\/(?:www\.)?rightpaths.com/,
  /^http:\/\/(?:www\.)?unblockweb\.us/,
  /^http:\/\/24hr\-computersecurity\.com/,
  /^http:\/\/proxy\.citec\.us/,
  /^http:\/\/qqclip\.appspot.com/,
  /^http:\/\/safesurf\.foxrot\.com/,
  /^http:\/\/takewii\.com/,
  /^http:\/\/tehvu\.ir/,
  // Price comparison.
  /^http:\/\/3mori\.com/,
  /^http:\/\/(?:www\.)?amazon\.[\w-.]+?\/.+?\/dp/,
  /^http:\/\/(?:m|review)\.kakaku\.com/,
  /^http:\/\/(?:www\.)?kakaku\.[\w-.]+?\/item/,
  /^http:\/\/[\w\-\.]+rakuten\.co\.jp/,
  // Application market.
  /^https:\/\/addons\.mozilla\.org\/\w+\/firefox\/addon/,
  /^https:\/\/addons\.mozilla\.\w+\/firefox\/details/,
  /^https:\/\/chrome\.google\.com\/webstore\/detail/,
  /^https:\/\/market\.android\.com\/details\?id=/,
  /^https:\/\/itunes\.apple\.com\/\w+\/app/,
  //,
];


/**
 * List of target site.
 * @param disabled {boolean} [optional] Set true and this item is ignored.
 * @param name {string}
 * @param include {regExp|string}|{array of (regexp|string)} {string}:exact match.
 * @param exclude {regexp|string}|{Array of (regexp|string)} [optional]
 * @param wait {integer} [optional] Millisecond waiting time after document loaded.
 *   If you do not have to wait for DOM build, set to 0.
 *   e.g. command only changes the location.
 * @param command {function}
 */
const kSiteList = [
  {
    name: 'Google Result',
    include: /^https?:\/\/www\.google\.(?:com|co\.jp)\/(?:search|webhp|#).*q=/,
    // image, shopping, place, realtime, recent, wonderwheel, timeline
    exclude: /&tb[ms]=[^&]*(?:isch|shop|plcs|rltm|mbl|ww|tl)/,
    // @WORKAROUND When page is loaded from page navigation or related searches in Google result,
    // I need to wait for DOM build.
    wait: 500,
    command: function (aDocument) {
      /**
       * |-li.g (Each item)
       *   |-div.vsc
       *     *
       *     |-h3.r
       *       |-a.l
       *
       * --- Old style
       * table#mn
       * *
       * |-li.g, blockquote (Each item)
       *   *
       *   |-h3.r
       *     |-a
       */

      var lastHeaderText = null;
      var lastDomain = null;

      // skip items in same domain block and realtime block.
      const kLinkSelector = '.vsc:not(.sld)>.r:not(.hcw)>a.l,.r>a';
      Array.forEach(aDocument.querySelectorAll(kLinkSelector), function(a) {
        normalizeURL(a);

        // weaken noisy URL.
        kNoisyURLs.some(function(URL) {
          if (URL.test(a.href)) {
            weaken(a);
            return true;
          }
          return false;
        });

        // emphasize same domain item.
        var domain = a.hostname;
        if (domain === lastDomain) {
          let cite = a.parentNode.parentNode.getElementsByTagName('cite')[0];
          if (cite) {
            cite.title = 'Ditto';
            cite.classList.add('ucjs_sitestyle_samedomain');
          }
        } else {
          lastDomain = domain;
        }
      });

      function normalizeURL(a) {
        a.removeAttribute('onmousedown');

        var url = /google\./.test(a.hostname) && /^\/url$/.test(a.pathname) &&
          /[&?]q=([^&]+)/.exec(a.search);
        if (url) {
          a.href = decodeURIComponent(url[1]);
        }
      }

      function weaken(a) {
        var li = $X1('ancestor::li[contains(concat(" ",normalize-space(@class)," "), " g ")]', a);
        if (li) {
          li.classList.add('ucjs_sitestyle_weaken');
        }
      }

      // Page styles.
      setStyleSheet('\
        /* @note ucjs_XXX is custom class */\
        .ucjs_sitestyle_samedomain::before\
        {\
          content:">";\
          font-weight:bold;\
          color:red;\
          margin-right:2px;\
        }\
        .ucjs_sitestyle_weaken h3\
        {\
          font-size:small!important;\
        }\
        .ucjs_sitestyle_weaken\
        {\
          opacity:.3!important;\
        }\
        .ucjs_sitestyle_weaken:hover\
        {\
          opacity:1!important;\
        }\
        /* @WORKAROUND disable pseudo link underline. */\
        h3 a\
        {\
          border-bottom:none!important;\
        }\
        /* @WORKAROUND ensure visible typing. */\
        input:focus\
        {\
          color:black!important;\
        }\
        /* @WORKAROUND adjust position of predictions box. */\
        #subform_ctrl, .ksfccl\
        {\
          margin-top:15px!important;\
        }\
        /* hidden parts. */\
        /* right pane. */\
        #rhs, #rhscol,\
        /* brand thumbnail */\
        img[id^="leftthumb"]\
        {\
          display:none!important;\
          visibility:collapse!important;\
        }\
        /* video items. */\
        #videobox>table>tbody>tr>td\
        {\
          float:left!important;\
          width:auto!important;\
        }\
        /* same domain items. */\
        .vsc~table\
        {\
          margin-left:0!important;\
          padding-left:0!important;\
        }\
        .mslg>td, .mslg>td>div\
        {\
          width:auto!important;\
          margin-left:1em!important;\
          padding:0!important;\
        }\
        .mslg .l\
        {\
          font-size:small!important;\
        }\
        /* multi-column */\
        #cnt, #res, .s, #mn\
        {\
          width:auto!important;\
          max-width:100%!important;\
          margin:0!important;\
          padding:0!important;\
        }\
        #center_col\
        {\
          width:auto!important;\
          margin-right:0!important;\
        }\
        h2.hd+div>ol, #mn #ires>ol\
        {\
          -moz-column-count:2;\
          -moz-column-gap:1em;\
        }',
      aDocument);
    }
  },

  {
    name: 'GoogleImage Result',
    include: [
      /^http:\/\/www\.google\.(?:com|co\.jp)\/(?:search|webhp|#).*tbm=isch/,
      /^http:\/\/www\.google\.(?:com|co\.jp)\/(?:imghp|imgres).*q=/,
      /^http:\/\/images\.google\.(?:com|co\.jp)\/.*q=/
    ],
    wait: 0,
    command: function (aDocument) {
      // switch to the old mode.
      if (aDocument.URL.indexOf('&sout=1') < 0) {
        aDocument.location.replace(aDocument.URL + '&sout=1');
      }
    }
  },

  {
    name: 'Yahoo!JAPAN Result',
    include: /^http:\/\/search\.yahoo\.co\.jp\/search/,
    command: function (aDocument) {
      /**
       * li (Each item)
       * *
       * |-div.hd
       *   |-h3
       *     |-a
       */

      const kLinkSelector = 'div.hd>h3>a';
      Array.forEach(aDocument.querySelectorAll(kLinkSelector), function(a) {
        normalizeURL(a);

        // weaken noisy URL.
        kNoisyURLs.some(function(URL) {
          if (URL.test(a.href)) {
            weaken(a);
            return true;
          }
          return false;
        });
      });

      function normalizeURL(a) {
        a.removeAttribute('onmousedown');

        var url = /yahoo\./.test(a.hostname) && /^\/\*\-/.test(a.pathname) &&
          /\/\*\-([^?]+)/.exec(a.pathname);
        if (url) {
          a.href = decodeURIComponent(url[1]);
        }
      }

      function weaken(a) {
        var li = $X1('ancestor::li', a);
        if (li) {
          li.classList.add('ucjs_sitestyle_weaken');
        }
      }

      // Page styles.
      setStyleSheet('\
        /* @note ucjs_XXX is custom class */\
        .ucjs_sitestyle_weaken h3\
        {\
          font-size:small!important;\
        }\
        .ucjs_sitestyle_weaken\
        {\
          opacity:.3!important;\
        }\
        .ucjs_sitestyle_weaken:hover\
        {\
          opacity:1!important;\
        }\
        /* multi-column */\
        #wrapper, .size2of3, #WS2m .w, .dd\
        {\
          width:100%!important;\
          overflow-x:hidden;\
        }\
        .nws .noimg\
        {\
          margin-left:0!important;\
        }\
        #WS2m>ul\
        {\
          -moz-column-count:2;\
          -moz-column-gap:1em;\
        }',
      aDocument);
    }
  },

  {
    name: 'bing Result',
    include: /^http:\/\/www\.bing\.com\/search/,
    command: function (aDocument) {
      // Page styles.
      setStyleSheet('\
        /* multi-column */\
        #content, .sa_cc\
        {\
          max-width:100%!important;\
          padding-right:0!important;\
        }\
        #wg0\
        {\
          -moz-column-count:2;\
          -moz-column-gap:1em;\
        }\
        #wg0>li\
        {\
          float:inherit!important;\
        }',
      aDocument);
    }
  },

  {
    name: 'Wikipedia Article',
    include: /^http:\/\/[a-z]+?\.wikipedia\.org\/wiki/,
    command: function (aDocument) {
      // Page styles.
      setStyleSheet('\
        /* popup reference */\
        .references li\
        {\
          list-style-type:none;\
        }\
        .references li:target\
        {\
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
    include: /^http:\/\/(?:www\.)?youtube\.com\/(?:watch|user)/,
    exclude: /&list=/,
    command: function (aDocument) {
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
  var mProgressListener = {
    onLocationChange: function(aBrowser, aWebProgress, aRequest, aLocation) {
      apply(aBrowser, aWebProgress, aLocation.spec);
    },

    onProgressChange: function() {},
    onSecurityChange: function() {},
    onStateChange: function() {},
    onStatusChange: function() {},
    onRefreshAttempted: function() {},
    onLinkIconAvailable: function() {}
  };

  var mTimerID = null;

  function clearTimer() {
    if (mTimerID) {
      clearInterval(mTimerID);
      mTimerID = null;
    }
  }

  function apply(aBrowser, aWebProgress, aURL) {
    if (!/^https?/.test(aURL))
      return;

    clearTimer();

    kSiteList.some(function(site) {
      if (!site.disabled && testURL(site, aURL)) {
        if (site.wait === 0) {
          site.command(aBrowser.contentDocument);
          return true;
        }

        mTimerID = setInterval(function() {
          if (aWebProgress.isLoadingDocument)
            return;

          clearTimer();

          setTimeout(function() {
            if (aBrowser.contentDocument) {
              site.command(aBrowser.contentDocument);
            }
          }, site.wait || 0);
        }, 0);
        return true;
      }
      return false;
    });
  }

  function testURL(aSite, aTargetURL) {
    var {include, exclude} = aSite;

    // test inclusion.
    if (!Array.isArray(include)) {
      include = [include];
    }
    var matched = include.some(function(val) {
      return (typeof val === 'string') ? val === aTargetURL : val.test(aTargetURL);
    });

    // test exclusion.
    if (matched && exclude) {
      if (!Array.isArray(exclude)) {
        exclude = [exclude];
      }
      matched = exclude.every(function(val) {
        return (typeof val === 'string') ? aTargetURL.indexOf(val) < 0 : !val.test(aTargetURL);
      });
    }

    return matched;
  }

  function init() {
    gBrowser.addTabsProgressListener(mProgressListener);

    window.addEventListener('unload', function removeEvent() {
      uninit();
      window.removeEventListener('unload', removeEvent, false);
    }, false);
  }

  function uninit() {
    gBrowser.removeTabsProgressListener(mProgressListener);
    clearTimer();
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
    var menu = $ID('menu_ToolsPopup').appendChild($E('menu', {
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

function $ID(aID)
  document.getElementById(aID);


// Imports.

function $E(aTagOrNode, aAttribute)
  ucjsUtil.createNode(aTagOrNode, aAttribute);

function $X1(aXPath, aNode)
  ucjsUtil.getFirstNodeByXPath(aXPath, aNode);

function U(aStr)
  ucjsUtil.convertForSystem(aStr);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function setStyleSheet(aCSS, aDocument)
  ucjsUtil.setContentStyleSheet(aCSS, aDocument, kID.STYLESHEET);

function log(aMsg)
  ucjsUtil.logMessage('SiteStyle.uc.js', aMsg);


// Entry point.

mPageObserver.init();
mPrefMenu.init();


})();
