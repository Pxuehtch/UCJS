// ==UserScript==
// @name        TabEx.uc.js
// @description Customizes tab functions
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note Some about:config preferences are changed. see @pref
// @note A default function is modified. see @modified
// @note Some functions are exported (ucjsTabEx.XXX)


var ucjsTabEx = (function() {


"use strict";


/**
 * Identifier
 */
const kID = {
  OPEN: 'ucjs_tabex_open',
  READ: 'ucjs_tabex_read',
  SELECT: 'ucjs_tabex_select',
  ANCESTORS: 'ucjs_tabex_ancestors',
  OPENQUERY: 'ucjs_tabex_openquery',
  FROMVISIT: 'ucjs_tabex_fromvisit',
  SUSPENDED: 'ucjs_tabex_suspended'
};

/**
 * Position of a tab which is opened or focused
 */
const kPosType = {
  DEFAULT:           1,
  FIRST_END:         2,
  PREV_ADJACENT:     3,
  LAST_END:          4,
  NEXT_ADJACENT:     5,
  RELATED_INCREMENT: 6, // for OPENPOS
  NEXT_RELATED:      7, // for FOCUSPOS
  PREV_SELECTED:     8, // for FOCUSPOS
  OPENER:            9  // for FOCUSPOS
};

/**
 * User preference
 */
const kPref = {
  // where new tab is opened.
  OPENPOS_LINKED:    kPosType.RELATED_INCREMENT,
  OPENPOS_UNLINKED:  kPosType.LAST_END,
  OPENPOS_DUPLICATE: kPosType.NEXT_ADJACENT,
  OPENPOS_UNDOCLOSE: kPosType.DEFAULT,

  // which tab is focused when selected tab is closed.
  // Reserve the alternative positions,
  // since NEXT_RELATED/PREV_SELECTED/OPENER tab is not exist maybe.
  FOCUSPOS_TABCLOSE: [
    kPosType.NEXT_RELATED,
    kPosType.PREV_SELECTED,
    kPosType.PREV_ADJACENT
  ],

  // delayed stop loading on tab that is opened in background.
  SUSPEND_LOADING: true,
  // delay time (> 1000 ms).
  SUSPEND_DELAY: 1000,
  // auto reload the suspended next-adjacent tab of the selected one.
  SUSPEND_NEXTTAB_RELOAD: false,
};


/**
 * Handles the state of a tab
 */
var mTabState = {
  isUnread: function(aTab) !aTab.hasAttribute(kID.READ)
};


/**
 * Handles the session store
 */
var mSessionStore = {
  init: function() {
    this.SessionStore =
      Cc['@mozilla.org/browser/sessionstore;1'].
      getService(Ci.nsISessionStore);

    [
      kID.OPEN,
      kID.READ,
      kID.SELECT,
      kID.ANCESTORS,
      kID.OPENQUERY,
      kID.FROMVISIT
    ].forEach(function(key) {
      mSessionStore.SessionStore.persistTabAttribute(key);
    });

    addEvent([window, 'SSWindowStateBusy', this, false]);
    addEvent([window, 'SSWindowStateReady', this, false]);
  },

  handleEvent: function(aEvent) {
    switch (aEvent.type) {
      case 'SSWindowStateBusy':
        this.isRestoring = true;
        break;
      case 'SSWindowStateReady':
        delete this.isRestoring;
        break;
    }
  },

  getClosedTabList: function() {
    if (this.SessionStore.getClosedTabCount(window) > 0) {
      return JSON.parse(this.SessionStore.getClosedTabData(window));
    }
    return null;
  }
};


/**
 * Handles to open a tab
 */
var mTabOpener = {
  init: function() {
    // @modified chrome://browser/content/tabbrowser.xml::addTab
    var $addTab = gBrowser.addTab;
    gBrowser.addTab = function(
      aURI,
      aReferrerURI,
      aCharset,
      aPostData,
      aOwner,
      aAllowThirdPartyFixup
    ) {
      var newTab = $addTab.apply(this, arguments);

      var aRelatedToCurrent, aFromExternal, aIsUTF8;
      if (arguments.length === 2 &&
          typeof arguments[1] === 'object' &&
          !(arguments[1] instanceof Ci.nsIURI)) {
        let params = arguments[1];
        aReferrerURI          = params.referrerURI;
        aCharset              = params.charset;
        aPostData             = params.postData;
        aAllowThirdPartyFixup = params.allowThirdPartyFixup;
        aFromExternal         = params.fromExternal;
        aRelatedToCurrent     = params.relatedToCurrent;
        aIsUTF8               = params.isUTF8;
      }

      if (!aReferrerURI) {
        let fromVisit = aRelatedToCurrent ?
          isHTTP(gBrowser.currentURI) && gBrowser.currentURI.spec :
          mReferrer.scanHistory(aURI);
        if (fromVisit) {
          newTab.setAttribute(kID.FROMVISIT, fromVisit);
        }
      }

      var flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE;
      if (aAllowThirdPartyFixup)
        flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP;
      if (aFromExternal)
        flags |= Ci.nsIWebNavigation.LOAD_FLAGS_FROM_EXTERNAL;
      if (aIsUTF8)
        flags |= Ci.nsIWebNavigation.LOAD_FLAGS_URI_IS_UTF8;

      var query = JSON.stringify({
        URI: getURLStr(aURI),
        flags: flags,
        referrerURI: getURLStr(aReferrerURI),
        charset: aCharset,
        postData: aPostData
      });

      newTab.setAttribute(kID.OPENQUERY, query);

      var event = document.createEvent('Events');
      event.initEvent('UcjsTabExTabOpen', true, false);
      newTab.dispatchEvent(event);

      return newTab;
    };
  },

  set: function(aTab) {
    // Startup tab.
    if (!aTab.hasAttribute(kID.OPENQUERY)) {
      let browser = gBrowser.getBrowserForTab(aTab);
      let URL = browser.userTypedValue || browser.currentURI.spec;
      let query = JSON.stringify({
        URI: getURLStr(URL),
        flags: Ci.nsIWebNavigation.LOAD_FLAGS_NONE
      });
      aTab.setAttribute(kID.OPENQUERY, query);

    // A new opened tab.
    } else if (!aTab.hasAttribute(kID.OPEN)) {
      if (mReferrer.exists(aTab)) {
        let parent = gBrowser.selectedTab;
        let ancs = parent.getAttribute(kID.OPEN);
        if (parent.hasAttribute(kID.ANCESTORS)) {
          ancs += ' ' + parent.getAttribute(kID.ANCESTORS);
        }
        aTab.setAttribute(kID.ANCESTORS, ancs);
      }

    // A duplicated tab.
    } else {
      let ancs = aTab.getAttribute(kID.OPEN);
      if (aTab.hasAttribute(kID.ANCESTORS)) {
        ancs += ' ' + aTab.getAttribute(kID.ANCESTORS);
      }
      aTab.setAttribute(kID.ANCESTORS, ancs);
    }

    aTab.setAttribute(kID.OPEN, getTime());
  },

  parseQuery: function(aTab, aKey) {
    if (aTab.hasAttribute(kID.OPENQUERY)) {
      let query = JSON.parse(aTab.getAttribute(kID.OPENQUERY));
      return aKey ? query[aKey] : query;
    }
    return null;
  }
};

/**
 * Handles the referrer of a tab
 */
var mReferrer = {
  getURL: function(aTab)
    mTabOpener.parseQuery(aTab, 'referrerURI') ||
    aTab.getAttribute(kID.FROMVISIT),

  getTitle: function(aTab)
    getPageTitle(this.getURL(aTab)),

  exists: function(aTab)
    !!this.getURL(aTab),

  scanHistory: function(aURI) {
    if (!isHTTP(aURI))
      return null;

    // @see http://www.forensicswiki.org/wiki/Mozilla_Firefox_3_History_File_Format
    const sql =
      "SELECT p1.url " +
      "FROM moz_places p1 " +
      "JOIN moz_historyvisits h1 ON h1.place_id=p1.id " +
      "JOIN moz_historyvisits h2 ON h2.from_visit=h1.id " +
      "JOIN moz_places p2 ON p2.id=h2.place_id " +
      "WHERE p2.url=:url " +
      "ORDER BY h1.visit_date DESC";

    var referrer = null;

    try {
      var statement =
        Cc['@mozilla.org/browser/nav-history-service;1'].
        getService(Ci.nsPIPlacesDatabase).
        DBConnection.
        createStatement(sql);

      statement.params.url = getURLStr(aURI);

      while (statement.executeStep()) {
        referrer = statement.row.url;
        if (referrer)
          break;
      }
    } finally {
      statement.reset();
    }

    return referrer;
  }
};

/**
 * Handles to select a tab
 */
var mTabSelector = {
  set: function(aTab) {
    this.clear();
    this.timer =
      setInterval(function(tab) mTabSelector.select(tab), 1000, aTab);
  },

  clear: function() {
    if (this.timer) {
      clearInterval(this.timer);
      delete this.timer;
    }
  },

  select: function(aTab) {
    if (aTab && aTab.hasAttribute('busy'))
      return;

    this.clear();

    if (!aTab || !aTab.selected)
      return;

    this.update(aTab);
  },

  update: function(aTab, aOption) {
    var {read, remove} = aOption || {};

    if (remove) {
      aTab.removeAttribute(kID.SELECT);
      aTab.removeAttribute(kID.READ);
      return;
    }

    var time = getTime();
    aTab.setAttribute(kID.SELECT, time);
    if (read || !aTab.hasAttribute(kID.READ)) {
      aTab.setAttribute(kID.READ, time);
    }
  }
};

/**
 * Handles to suspend the loading of a tab
 */
var mTabSuspender = {
  timers: {},

  set: function(aTab, aDelay) {
    var timer =
      setTimeout(function(tab) mTabSuspender.stop(tab), aDelay || 0, aTab);

    // The opened time of each tab is an unique value.
    this.timers[aTab.getAttribute(kID.OPEN)] = timer;
  },

  clear: function(aTab) {
    var id = aTab && aTab.getAttribute(kID.OPEN);
    var timer = id && this.timers[id];
    if (timer) {
      clearTimeout(timer);
      delete this.timers[id];
    }
  },

  stop: function(aTab) {
    this.clear(aTab);

    if (!aTab || aTab.selected)
      return;

    var browser = gBrowser.getBrowserForTab(aTab);

    var isBlank = browser.currentURI &&
      browser.currentURI.spec === 'about:blank';
    var isBusy = aTab.hasAttribute('busy');

    // In restoring startup, a background tab has a 'pending' attribute.
    if (isBlank || isBusy || aTab.hasAttribute('pending')) {
      let URL = mTabOpener.parseQuery(aTab, 'URI');
      URL = (URL && URL !== 'about:blank') ? URL : browser.userTypedValue;
      if (URL) {
        aTab.setAttribute(kID.SUSPENDED, true);

        if (isBusy) {
          browser.stop();
        }
        if (isBlank) {
          aTab.label = getPageTitle(URL);
        }
      }
    }
  },

  reload: function(aTab) {
    this.clear(aTab);

    if (!aTab || !aTab.hasAttribute(kID.SUSPENDED))
      return;

    aTab.removeAttribute(kID.SUSPENDED);

    var browser = gBrowser.getBrowserForTab(aTab);

    // userTypedValue holds URL till the document successfully loads.
    var URL = browser.userTypedValue;
    if (URL) {
      let query = mTabOpener.parseQuery(aTab);
      if (query) {
        browser.loadURIWithFlags(
          URL,
          query.flags,
          makeURI(query.referrerURI),
          query.charset,
          query.postData
        );
      } else {
        browser.loadURI(URL);
      }
    } else {
      browser.reload();
    }
  }
};

/**
 * Handles the startup session
 */
var mStartup = {
  init: function() {
    // Wait until tabs is loaded.
    setTimeout(mStartup.initStartingTabs, 1000);
  },

  initStartingTabs: function() {
    Array.forEach(gBrowser.tabs, function(tab) {
      // A startup tab not in restoring.
      if (!tab.hasAttribute(kID.OPENQUERY)) {
        mTabOpener.set(tab);
      }
      if (!tab.selected) {
        mTabSuspender.set(tab);
      }
    });

    mTabSelector.update(gBrowser.selectedTab);
  }
};

/**
 * Handles the events of tabs
 */
var mTabEvent = {
  init: function() {
    var tc = gBrowser.tabContainer;

    addEvent([tc, 'UcjsTabExTabOpen', this, false]);
    addEvent([tc, 'TabSelect', this, false]);
    addEvent([tc, 'TabClose', this, false]);
    addEvent([tc, 'SSTabRestored', this, false]);
  },

  handleEvent: function(aEvent) {
    var tab = aEvent.originalTarget;

    switch (aEvent.type) {
      case 'UcjsTabExTabOpen':
        this.onTabOpen(tab);
        break;
      case 'TabSelect':
        this.onTabSelect(tab);
        break;
      case 'TabClose':
        this.onTabClose(tab);
        break;
      case 'SSTabRestored':
        this.onTabRestored(tab);
        break;
    }
  },

  onTabOpen: function(aTab) {
    if (mSessionStore.isRestoring)
      return;

    mTabOpener.set(aTab)

    if (kPref.SUSPEND_LOADING) {
      mTabSuspender.set(aTab, kPref.SUSPEND_DELAY);
    }

    var openPos = mReferrer.exists(aTab) ?
      kPref.OPENPOS_LINKED : kPref.OPENPOS_UNLINKED;
    moveTabTo(aTab, openPos);
  },

  onTabSelect: function(aTab) {
    mTabSelector.set(aTab);

    if (kPref.SUSPEND_LOADING) {
      mTabSuspender.reload(aTab);
      if (kPref.SUSPEND_NEXTTAB_RELOAD) {
        mTabSuspender.reload(getNextTab(aTab));
      }
    }
  },

  onTabClose: function(aTab) {
    if (kPref.SUSPEND_LOADING) {
      mTabSuspender.clear(aTab);
    }

    if (aTab.selected) {
      focusTabTo(aTab, kPref.FOCUSPOS_TABCLOSE);
    }
  },

  onTabRestored: function(aTab) {
    var openPos;

    if (isDuplicatedTab(aTab)) {
      mTabOpener.set(aTab);

      if (aTab.selected) {
        mTabSelector.update(aTab, {read: true});
      } else {
        mTabSelector.update(aTab, {remove: true});
      }

      openPos = kPref.OPENPOS_DUPLICATE;
    } else {
      openPos = kPref.OPENPOS_UNDOCLOSE;
    }

    moveTabTo(aTab, openPos, getPrevSelectedTab());
  }
};


// Helper functions

function isDuplicatedTab(aTab) {
  var tabs = gBrowser.visibleTabs;
  var openTime = aTab.getAttribute(kID.OPEN);

  return tabs.some(function(tab) {
    return tab !== aTab &&
           tab.getAttribute(kID.OPEN) === openTime;
  });
}

function moveTabTo(aTab, aPosType, aBaseTab) {
  var tabs = gBrowser.visibleTabs;
  var tabsNum = tabs.length;
  var baseTab = aBaseTab || gBrowser.selectedTab;
  var basePos = Array.indexOf(tabs, baseTab);
  var tabPos = Array.indexOf(tabs, aTab);
  var pos = -1;

  switch (aPosType) {
    case kPosType.DEFAULT:
      break;
    case kPosType.FIRST_END:
      pos = 0;
      break;
    case kPosType.PREV_ADJACENT:
      pos = (0 < basePos) ?
        ((tabPos < basePos) ? basePos - 1 : basePos) :
        0;
      break;
    case kPosType.LAST_END:
      pos = tabsNum - 1;
      break;
    case kPosType.NEXT_ADJACENT:
      pos = (basePos < tabsNum - 1) ? basePos + 1 : tabsNum - 1;
      break;
    case kPosType.RELATED_INCREMENT:
      pos = getRelatedPosAfter(baseTab);
      pos = (-1 < pos) ?
        ((pos < tabsNum - 1) ? pos + 1 : tabsNum - 1) :
        basePos + 1;
      break;
    default:
      throw 'kPosType is invalid for OPENPOS.';
  }

  if (-1 < pos && pos !== tabPos) {
    pos = Array.indexOf(gBrowser.tabs, tabs[pos]);
    gBrowser.moveTabTo(aTab, pos);
  }
}

function focusTabTo(aTab, aPosTypes) {
  if (!Array.isArray(aPosTypes)) {
    aPosTypes = [aPosTypes];
  }

  aPosTypes.some(function(posType) {
    switch (posType) {
      case kPosType.DEFAULT:
        return true;
      case kPosType.FIRST_END:
        gBrowser.selectTabAtIndex(0)
        return true;
      case kPosType.PREV_ADJACENT:
        gBrowser.tabContainer.advanceSelectedTab(-1, false);
        return true;
      case kPosType.LAST_END:
        gBrowser.selectTabAtIndex(-1)
        return true;
      case kPosType.NEXT_ADJACENT:
        gBrowser.tabContainer.advanceSelectedTab(+1, false);
        return true;
      case kPosType.NEXT_RELATED:
        return !!focusNextRelatedTab(aTab);
      case kPosType.PREV_SELECTED:
        return !!focusPrevSelectedTab(aTab);
      case kPosType.OPENER:
        return !!focusOpenerTab(aTab);
      default:
        throw 'kPosType is invalid for FOCUSPOS.';
    }
    return true;
  });
}

function focusNextRelatedTab(aTab) {
  var tab = getRelatedTabAfter(aTab, {allowSibling: true, onlyNextTab: true});
  if (tab) {
    gBrowser.selectedTab = tab;
    return tab;
  }
  return null;
}

function getRelatedPosAfter(aTab, aOption) {
  var tab = getRelatedTabAfter(aTab, aOption);
  if (tab) {
    return Array.indexOf(gBrowser.tabs, tab);
  }
  return -1;
}

function getRelatedTabAfter(aTab, aOption) {
  var {allowSibling, onlyNextTab} = aOption || {};

  var tabId = aTab.getAttribute(kID.OPEN);
  var parentId = '';
  if (allowSibling && aTab.hasAttribute(kID.ANCESTORS)) {
    parentId = (aTab.getAttribute(kID.ANCESTORS).split(' '))[0];
  }

  function isRelated(_tab) {
    if (_tab.hasAttribute(kID.ANCESTORS)) {
      let ancs = _tab.getAttribute(kID.ANCESTORS);
      return ancs.indexOf(tabId) > -1 ||
        (parentId && ancs.indexOf(parentId) === 0);
    }
    return false;
  }

  var tabs = gBrowser.visibleTabs;
  var tabPos = Array.indexOf(tabs, aTab);
  if (tabPos === -1)
    return null;

  var pos = tabPos;
  var start = aTab.pinned ? gBrowser._numPinnedTabs : pos + 1;

  if (onlyNextTab) {
    if (start < tabs.length && isRelated(tabs[start])) {
      pos = start;
    }
  } else {
    for (let i = start; i < tabs.length; i++) {
      if (!isRelated(tabs[i]))
        break;
      pos = i;
    }
  }

  return (pos !== tabPos) ? tabs[pos] : null;
}

function focusOpenerTab(aTab, aOption) {
  var {undoClose} = aOption || {};

  var tab = getAncestorTab(aTab, {undoClose: undoClose});
  if (tab) {
    gBrowser.selectedTab = tab;
    return tab;
  }
  return null;
}

function getAncestorTab(aTab, aOption) {
  var {traceBack, undoClose} = aOption || {};

  var baseTab = aTab || gBrowser.selectedTab;
  if (!baseTab.hasAttribute(kID.ANCESTORS))
    return null;

  var ancs = baseTab.getAttribute(kID.ANCESTORS).split(' ');
  var traceLen = traceBack ? ancs.length : 1;

  var tabs = gBrowser.visibleTabs;
  var undoList = undoClose && mSessionStore.getClosedTabList();

  for (let i = 0, anc; i < traceLen; i++) {
    anc = ancs[i];

    for (let j = 0; j < tabs.length; j++) {
      if (tabs[j].getAttribute(kID.OPEN) === anc) {
        return tabs[j];
      }
    }

    if (undoClose) {
      if (undoList) {
        for (let j = 0; j < undoList.length; j++) {
          if (undoList[j].state.attributes[kID.OPEN] === anc) {
            return undoCloseTab(j);
          }
        }
      }

      if (i === traceLen - 1) {
        return openTab(mReferrer.getURL(baseTab));
      }
    }
  }

  return null;
}

function focusPrevSelectedTab(aTab) {
  var tab = getPrevSelectedTab(aTab);
  if (tab) {
    gBrowser.selectedTab = tab;
    return tab;
  }
  return null;
}

function getPrevSelectedTab(aTab) {
  var tabs = gBrowser.visibleTabs;
  var baseTab = aTab || gBrowser.selectedTab;
  var pos = -1;

  for (let i = 0, tab, last = 0; i < tabs.length; i++) {
    tab = tabs[i];
    if (tab.hasAttribute(kID.SELECT) && tab !== baseTab) {
      let time = parseInt(tab.getAttribute(kID.SELECT), 10);
      if (time > last) {
        last = time;
        pos = i;
      }
    }
  }

  return (pos > -1) ? tabs[pos] : null;
}

function getNextTab(aTab) {
  var tabs = gBrowser.visibleTabs;
  var pos = Array.indexOf(tabs, aTab);

  return (-1 < pos && pos < tabs.length - 1) ? tabs[pos + 1] : null;
}

function closeReadTabs(aOption) {
  var {allTabs} = aOption || {};

  var tabs = allTabs ? gBrowser.tabs : gBrowser.visibleTabs;

  for (let i = tabs.length - 1, tab; i >= 0 ; i--) {
    tab = tabs[i];
    if (tab.hasAttribute(kID.READ)) {
      removeTab(tab, {safeBlock: true});
    }
  }
}


// Patches for the default

function modifySystemSetting() {
  const prefs = [
    // @pref Disable the default behavior.
    {key: 'browser.tabs.insertRelatedAfterCurrent', value: false},
    {key: 'browser.tabs.selectOwnerOnClose', value: false},
    // @pref No loading of the background tabs in restoring startup.
    {key: 'browser.sessionstore.restore_on_demand', value: true},
    {key: 'browser.sessionstore.restore_pinned_tabs_on_demand', value: true}
  ];

  prefs.forEach(function(pref) {
    var value = getPref(pref.key);
    if (value !== pref.value) {
      setPref(pref.key, pref.value);
      addEvent([window, 'unload', function() setPref(pref.key, value), false]);
    }
  });
}


// Utilities

var getTime = (function() {
  // Make sure to be an unique value.
  var time = 0;

  return function() {
    var now = Date.now();
    return time = (time === now ? ++now : now);
  };
})();

function getPageTitle(aURL) {
  var title = '';
  try {
    title = PlacesUtils.history.getPageTitle(makeURI(aURL));
  } catch (e) {}

  return title || aURL;
}

function getURLStr(aVal)
  (aVal instanceof Ci.nsIURI) ? aVal.spec : aVal;

function isHTTP(aVal)
  /^https?:/.test(getURLStr(aVal));


// Imports

function getPref(aKey)
  ucjsUtil.getPref(aKey);

function setPref(aKey, aVal)
  ucjsUtil.setPref(aKey, aVal);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function openTab(aURL)
  ucjsUtil.openTab(aURL);

function removeTab(aTab, aParam)
  ucjsUtil.removeTab(aTab, aParam);

function log(aMsg)
  ucjsUtil.logMessage('TabEx.uc.js', aMsg);


// Entry point

function TabEx_init() {
  modifySystemSetting();

  mTabEvent.init();
  mSessionStore.init();
  mTabOpener.init();
  mStartup.init();
}

TabEx_init();


// Export

return {
  tabState: mTabState,
  referrer: mReferrer,
  focusOpenerTab: focusOpenerTab,
  focusPrevSelectedTab: focusPrevSelectedTab,
  closeReadTabs: closeReadTabs
};


})();
