// ==UserScript==
// @name        TabEx.uc.js
// @description Extends the tab functions
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
  SUSPENDED: 'ucjs_tabex_suspended'
};

/**
 * Position for OPENPOS/SELECTPOS
 */
const kPosType = {
  // Firefox default
  DEFAULT: 1,
  // at the first
  FIRST_END: 2,
  // at the last
  LAST_END: 3,
  // at the previous adjacent
  // @note SELECTPOS: if no previous tab, no match
  PREV_ADJACENT: 4,
  // at the next adjacent
  // @note SELECTPOS: if no next tab, no match
  NEXT_ADJACENT: 5,

  //***** OPENPOS only

  // after the far end tab of the sequential followings that are descendants of
  // the base tab from its next adjacent, or at the next adjacent
  NEXT_INCREMENT_DESCENDANT: 6,

  //***** SELECTPOS only

  // the previous adjacent tab that is an ancestor of the closed tab
  // @note may be no match
  PREV_ADJACENT_ANCESTOR: 7,
  // the next adjacent tab that is a descendant of the closed tab or is a
  // sibling(has the same parent of the closed tab) or his descendant
  // @note may be no match
  NEXT_ADJACENT_EXTENDED_DESCENDANT: 8,
  // the parent tab of the closed tab
  // @note may be no match
  ANYWHERE_OPENER: 9,
  // tab that has been selected most recently before the closed tab
  // @note may be no match
  ANYWHERE_PREV_SELECTED: 10
};

/**
 * User preference
 */
const kPref = {
  // where a new tab is opened
  // @value {kPosType}
  // @note The count of positioning starts from the first *un*pinned tab.
  // @note OPENPOS_LINKED works when the tab is opened by a link in the
  // content area or a command with 'relatedToCurrent', otherwise
  // OPENPOS_UNLINKED.
  OPENPOS_LINKED:    kPosType.NEXT_INCREMENT_DESCENDANT,
  OPENPOS_UNLINKED:  kPosType.LAST_END,
  OPENPOS_DUPLICATE: kPosType.NEXT_ADJACENT,
  // DEFAULT: a tab reopens at the same position where it closed
  OPENPOS_UNDOCLOSE: kPosType.DEFAULT,

  // which tab is selected after a *selected* tab is closed
  // @value {array of kPosType}
  // @note The default selection works if no matches.
  SELECTPOS_TABCLOSE: [
    kPosType.NEXT_ADJACENT_EXTENDED_DESCENDANT,
    kPosType.PREV_ADJACENT_ANCESTOR,
    kPosType.NEXT_ADJACENT,
    kPosType.ANYWHERE_OPENER,
    kPosType.ANYWHERE_PREV_SELECTED
    // if no matches, may be the same as PREV_ADJACENT
  ],
  // for closing a selected pinned tab
  SELECTPOS_PINNEDTABCLOSE: [
    kPosType.PREV_ADJACENT
  ],

  // delayed-stops the loading of a tab that is opened in background
  // @value {boolean}
  //   false: the same as the default 'tabs on demand' behavior
  //   true: stops the loading of the tab after SUSPEND_DELAY passes
  // @note This function works after the default process is done. So even if
  // setting SUSPEND_DELAY to 0, it takes time a little.
  SUSPEND_LOADING: true,
  // the delay time until the loading is suspended
  // @value {integer} millisecond
  SUSPEND_DELAY: 0,
  // auto-reloads the suspended tab that is next adjacent of a selected tab
  // @value {boolean}
  SUSPEND_NEXTTAB_RELOAD: false,

  // the delay time until it considers that "a user has read it" after the tab
  // is selected and loaded completely
  // @value {integer} millisecond
  // @note The marking is canceled when the other tab is selected in a short
  // time. (e.g. while flipping tabs with a shortcut key or mouse wheeling)
  SELECTED_DELAY: 1000
};

/**
 * Tabs state handler
 */
var mTabState = {
  isUnread: function(aTab) {
    return !aTab.hasAttribute(kID.READ);
  },

  isSuspended: function(aTab) {
    return aTab.hasAttribute(kID.SUSPENDED);
  }
};


/**
 * Session store handler
 */
var mSessionStore = {
  // whether a tab is in restoring (dupricated or undo-closed)
  isRestoring: false,

  init: function() {
    this.SessionStore = Cc['@mozilla.org/browser/sessionstore;1'].
      getService(Ci.nsISessionStore);

    [
      kID.OPEN,
      kID.READ,
      kID.SELECT,
      kID.ANCESTORS,
      kID.OPENQUERY
    ].forEach(function(key) {
      this.SessionStore.persistTabAttribute(key);
    }.bind(this));

    addEvent([window, 'SSWindowStateBusy', this, false]);
    addEvent([window, 'SSWindowStateReady', this, false]);
  },

  handleEvent: function(aEvent) {
    switch (aEvent.type) {
      case 'SSWindowStateBusy':
        this.isRestoring = true;
        break;
      case 'SSWindowStateReady':
        this.isRestoring = false;
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
 * Tab opening handler
 */
var mTabOpener = {
  init: function() {
    // @modified chrome://browser/content/tabbrowser.xml::addTab
    var $addTab = gBrowser.addTab;
    gBrowser.addTab = function(
      aURI, // {string}
      aReferrerURI, // {nsIURI}
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

      aReferrerURI = aReferrerURI && aReferrerURI.spec;

      var fromVisit;
      if (!aReferrerURI) {
        if (aRelatedToCurrent) {
          fromVisit = /^https?:/.test(gBrowser.currentURI.spec) &&
            gBrowser.currentURI.spec;
        } else {
          fromVisit = /^https?:/.test(aURI) &&
            mReferrer.getFromVisit(aURI);
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
        URI: aURI,
        flags: flags,
        referrerURI: aReferrerURI || undefined,
        charset: aCharset || undefined,
        postData: aPostData || undefined,
        relatedToCurrent: aRelatedToCurrent || undefined,
        fromVisit: fromVisit || undefined
      });

      newTab.setAttribute(kID.OPENQUERY, query);

      var event = document.createEvent('Events');
      event.initEvent('UcjsTabExTabOpen', true, false);
      newTab.dispatchEvent(event);

      return newTab;
    };
  },

  set: function(aTab, aType) {
    switch (aType) {
      case 'BootedStartupTab': {
        let browser = gBrowser.getBrowserForTab(aTab);
        let URL = browser.userTypedValue || browser.currentURI.spec;
        let query = JSON.stringify({
          URI: URL,
          flags: Ci.nsIWebNavigation.LOAD_FLAGS_NONE
        });
        aTab.setAttribute(kID.OPENQUERY, query);
        break;
      }
      case 'NewTab': {
        if (mReferrer.isRelatedToCurrent(aTab)) {
          let parent = gBrowser.selectedTab;
          let ancs = parent.getAttribute(kID.OPEN);
          if (parent.hasAttribute(kID.ANCESTORS)) {
            ancs += ' ' + parent.getAttribute(kID.ANCESTORS);
          }
          aTab.setAttribute(kID.ANCESTORS, ancs);
        }
        break;
      }
      case 'DuprecatedTab': {
        let ancs = aTab.getAttribute(kID.OPEN);
        if (aTab.hasAttribute(kID.ANCESTORS)) {
          ancs += ' ' + aTab.getAttribute(kID.ANCESTORS);
        }
        aTab.setAttribute(kID.ANCESTORS, ancs);
        break;
      }
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
 * Tab referrer handler
 */
var mReferrer = {
  getURL: function(aTab) {
    var query = mTabOpener.parseQuery(aTab);
    if (!query)
      return null;

    return query.referrerURI || query.fromVisit;
  },

  getTitle: function(aTab) {
    return getPageTitle(this.getURL(aTab));
  },

  exists: function(aTab) {
    return !!this.getURL(aTab);
  },

  isRelatedToCurrent: function(aTab) {
    var query = mTabOpener.parseQuery(aTab);
    if (!query)
      return null;

    return !!(query.referrerURI ||
      (query.relatedToCurrent && query.fromVisit));
  },

  getFromVisit: function(aURL) {
    if (!aURL)
      return null;

    var sql =
      "SELECT p1.url " +
      "FROM moz_places p1 " +
      "JOIN moz_historyvisits h1 ON h1.place_id = p1.id " +
      "JOIN moz_historyvisits h2 ON h2.from_visit = h1.id " +
      "JOIN moz_places p2 ON p2.id = h2.place_id " +
      "WHERE p2.url = :page_url " +
      "ORDER BY h1.visit_date DESC";

    return scanHistoryDatabase(sql, {'page_url': aURL}, 'url');
  }
};

/**
 * Tab selecting handler
 */
var mTabSelector = {
  prevSelectedTime: 0,
  currentSelectedTime: 0,

  set: function(aTab) {
    this.clear();
    // repeatly observes a tab until its document completely loads while the
    // tab is selected
    this.timer = setInterval(function(tab) {
      this.select(tab);
    }.bind(this), kPref.SELECTED_DELAY, aTab);
  },

  clear: function() {
    if (this.timer) {
      clearInterval(this.timer);
      delete this.timer;
    }
  },

  select: function(aTab) {
    // in loading yet
    if (aTab && aTab.hasAttribute('busy'))
      return;

    this.clear();

    // cancel the dealing when the tab is removed or deselected while the timer
    // is waiting
    if (!aTab || !aTab.selected)
      return;

    this.update(aTab);
  },

  update: function(aTab, aOption) {
    var {reset, read} = aOption || {};

    if (reset) {
      aTab.removeAttribute(kID.SELECT);
      aTab.removeAttribute(kID.READ);
      return;
    }

    var time = getTime();
    aTab.setAttribute(kID.SELECT, time);
    if (read || !aTab.hasAttribute(kID.READ)) {
      aTab.setAttribute(kID.READ, time);
    }

    this.prevSelectedTime = this.currentSelectedTime;
    this.currentSelectedTime = time;
  }
};

/**
 * Handler of suspending the loading of a tab
 */
var mTabSuspender = {
  timers: {},

  set: function(aTab, aDelay) {
    // ensure that our process works after the default one for the loading of
    // a background tab
    var timer = setTimeout(function(tab) {
      this.stop(tab);
    }.bind(this), aDelay || 0, aTab);

    // the opened time of each tab is an unique value
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

    // cancel suspending the tab when is removed or selected while the timer
    // is waiting
    if (!aTab || aTab.selected)
      return;

    var browser = gBrowser.getBrowserForTab(aTab);

    // |userTypedValue| holds the URL till a document successfully loads
    var loadingURL = browser.userTypedValue;
    if (loadingURL) {
      aTab.setAttribute(kID.SUSPENDED, true);

      if (aTab.hasAttribute('busy')) {
        browser.stop();
      }
      if (browser.currentURI.spec === 'about:blank') {
        aTab.label = getPageTitle(loadingURL);
      }
    }
  },

  reload: function(aTab) {
    this.clear(aTab);

    if (!aTab || aTab.hidden || aTab.closing ||
        !aTab.hasAttribute(kID.SUSPENDED))
      return;

    aTab.removeAttribute(kID.SUSPENDED);

    var browser = gBrowser.getBrowserForTab(aTab);

    // |userTypedValue| holds the URL till a document successfully loads
    var loadingURL = browser.userTypedValue;
    if (loadingURL) {
      // a tab has no query when it bypassed our hooked |gBrowser.addTab|
      let query = mTabOpener.parseQuery(aTab);
      if (query) {
        browser.loadURIWithFlags(
          loadingURL, // === query.URI
          query.flags,
          window.makeURI(query.referrerURI),
          query.charset,
          query.postData
        );
      } else {
        browser.loadURI(loadingURL);
      }
    }
  }
};

/**
 * Startup session handler
 */
var mStartup = {
  init: function() {
    var SessionStartup = Cc["@mozilla.org/browser/sessionstartup;1"].
      getService(Ci.nsISessionStartup);

    if (SessionStartup.doRestore()) {
      this.restoredTabs = [];
      this.firstTabRestored = false;
    }

    // TODO: Ensure to execute it just after all tabs open.
    // @note This unstable timer causes an exception of the first restored tab.
    setTimeout(this.initStartingTabs.bind(this), 1000);
  },

  initStartingTabs: function() {
    Array.forEach(gBrowser.tabs, function(tab) {
      // initialize a booted startup tab
      if (!this.restoredTabs) {
        mTabOpener.set(tab, 'BootedStartupTab');
      }

      if (!tab.selected) {
        mTabSuspender.set(tab);
      }

      // collect a restored tab
      if (this.restoredTabs) {
        if (!this.firstTabRestored || !tab.selected) {
          this.restoredTabs.push(tab.getAttribute(kID.OPEN));
        }
      }
    }, this);

    delete this.firstTabRestored;

    mTabSelector.update(gBrowser.selectedTab);
  },

  isRestored: function(aTab) {
    // |restoredTabs| is created only in the restore startup and it is deleted
    // when all startup restored tabs is passed here
    if (!this.restoredTabs)
      return false;

    // @note The startup restored tab that is selected and *unpending* is sure
    // to come first here through |SSTabRestored|. This first tab sometimes
    // comes before |initStartingTabs| that is waiting by the timer. Then
    // |restoredTabs| excludes the first tab.
    // TODO: Do not make an exception of the first tab.
    if (this.firstTabRestored === false) {
      this.firstTabRestored = true;
      return true;
    }

    var open = aTab.getAttribute(kID.OPEN);
    var index = this.restoredTabs.indexOf(open);

    // 1.a startup restored tab matches, return true
    // 2.a duplicated or undo-closed tab does not match, return false
    if (index > -1) {
      this.restoredTabs.splice(index, 1);
      if (!this.restoredTabs.length) {
        delete this.restoredTabs;
      }
      return true;
    }
    return false;
  }
};

/**
 * Tab event handler
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
    // handle a restored tab in |onTabRestored|
    if (mSessionStore.isRestoring)
      return;

    mTabOpener.set(aTab, 'NewTab')

    if (kPref.SUSPEND_LOADING) {
      mTabSuspender.set(aTab, kPref.SUSPEND_DELAY);
    }

    var openPos = mReferrer.isRelatedToCurrent(aTab) ?
      kPref.OPENPOS_LINKED : kPref.OPENPOS_UNLINKED;

    moveTabTo(aTab, openPos);
  },

  onTabSelect: function(aTab) {
    mTabSelector.set(aTab);

    if (kPref.SUSPEND_LOADING) {
      mTabSuspender.reload(aTab);
    }
    if (kPref.SUSPEND_NEXTTAB_RELOAD) {
      let nextTab = getAdjacentTab(aTab, +1);
      if (nextTab) {
        mTabSuspender.reload(nextTab);
      }
    }
  },

  onTabClose: function(aTab) {
    if (kPref.SUSPEND_LOADING) {
      mTabSuspender.clear(aTab);
    }

    if (aTab.selected) {
      let selectPos = aTab.pinned ?
        kPref.SELECTPOS_PINNEDTABCLOSE : kPref.SELECTPOS_TABCLOSE;

      selectTabAt(aTab, selectPos);
    }
  },

  onTabRestored: function(aTab) {
    // do not handle a startup restored tab
    if (mStartup.isRestored(aTab))
      return;

    var openPos, baseTab;

    var originalTab = getOriginalTabOfDuplicated(aTab);
    if (originalTab) {
      mTabOpener.set(aTab, 'DuprecatedTab');

      if (aTab.selected) {
        mTabSelector.update(aTab, {read: true});
      } else {
        mTabSelector.update(aTab, {reset: true});
      }

      openPos = kPref.OPENPOS_DUPLICATE;
      baseTab = originalTab;
    } else {
      openPos = kPref.OPENPOS_UNDOCLOSE;
      // sets the previous selected tab to the base tab for moving a reopened
      // tab that has been force-selected
      baseTab = getPrevSelectedTab();
    }

    moveTabTo(aTab, openPos, baseTab);
  }
};


//********** Tab handling functions

function getOriginalTabOfDuplicated(aTab) {
  var openTime = aTab.getAttribute(kID.OPEN);

  var tabs = gBrowser.tabs;

  for (let i = 0, l = tabs.length, tab; i < l; i++) {
    tab = tabs[i];
    if (tab !== aTab &&
        tab.getAttribute(kID.OPEN) === openTime)
      return tab;
  }
  return null;
}

function moveTabTo(aTab, aPosType, aBaseTab) {
  var baseTab = aBaseTab || gBrowser.selectedTab;

  // excluding pinned tabs
  var tabs = getTabs('active');
  var tabsNum = tabs.length;

  // returns -1 for a pinned or closing tab
  var basePos = getTabPos(tabs, baseTab);
  var tabPos = getTabPos(tabs, aTab);
  var pos = -1;

  switch (aPosType) {
    case kPosType.DEFAULT:
      break;
    case kPosType.FIRST_END:
      pos = 0;
      break;
    case kPosType.LAST_END:
      pos = tabsNum - 1;
      break;
    case kPosType.PREV_ADJACENT:
      pos = (0 < basePos) ?
        ((tabPos < basePos) ? basePos - 1 : basePos) :
        0;
      break;
    case kPosType.NEXT_ADJACENT:
      pos = (basePos < tabsNum - 1) ? basePos + 1 : tabsNum - 1;
      break;
    case kPosType.NEXT_INCREMENT_DESCENDANT:
      pos = getTabPos(tabs, getFamilyTab(baseTab,
        'next farthest descendant'));
      pos = (-1 < pos) ?
        ((pos < tabsNum - 1) ? pos + 1 : tabsNum - 1) :
        basePos + 1;
      break;
    default:
      throw 'Unknown kPosType for OPENPOS.';
  }

  if (-1 < pos && pos !== tabPos) {
    gBrowser.moveTabTo(aTab, getTabPos(gBrowser.tabs, tabs[pos]));
  }
}

function selectTabAt(aBaseTab, aPosTypes) {
  aPosTypes.some(function(posType) {
    switch (posType) {
      case kPosType.DEFAULT:
        return true;
      case kPosType.FIRST_END:
        gBrowser.selectTabAtIndex(0)
        return true;
      case kPosType.LAST_END:
        gBrowser.selectTabAtIndex(-1)
        return true;
      case kPosType.PREV_ADJACENT:
        return !!selectTab(getAdjacentTab(aBaseTab, -1));
      case kPosType.NEXT_ADJACENT:
        return !!selectTab(getAdjacentTab(aBaseTab, +1));
      case kPosType.PREV_ADJACENT_ANCESTOR:
        return !!selectTab(getFamilyTab(aBaseTab,
          'prev adjacent ancestor'));
      case kPosType.NEXT_ADJACENT_EXTENDED_DESCENDANT:
        return !!selectTab(getFamilyTab(aBaseTab,
          'next adjacent extended descendant'));
      case kPosType.ANYWHERE_OPENER:
        return !!selectOpenerTab(aBaseTab);
      case kPosType.ANYWHERE_PREV_SELECTED:
        return !!selectPrevSelectedTab(aBaseTab, {traceBack: true});
      default:
        throw 'Unknown kPosType for SELECTPOS.';
    }
    // never reached, but avoid warning
    return true;
  });
}

/**
 * Retrieves a family tab of the base tab in the active tabs
 * @param aBaseTab {Element}
 * @param aStatement {string} keywords divided by ' '
 * @return {Element}
 */
function getFamilyTab(aBaseTab, aStatement) {
  const supportedStatements = [
    'prev adjacent ancestor',
    'next adjacent extended descendant',
    'next farthest descendant'
  ];

  var statement = StatementParser(aStatement, ' ', supportedStatements);

  var direction = statement.matchKey(['prev', 'next']),
      position = statement.matchKey(['adjacent', 'farthest']),
      extended = !!statement.matchKey(['extended']),
      family = statement.matchKey(['ancestor', 'descendant']);

  var activeTabs, startPos, baseId, baseAncs, isRelated, relatedPos;

  /**
   * Finds the tab that meets the statement
   */
  // excluding pinned tabs, including the base tab
  activeTabs = getTabs('active', aBaseTab);

  /**
   * Sets the starting position to examine
   */
  // returns -1 when the base tab is pinned or closing
  startPos = getTabPos(activeTabs, aBaseTab);

  // useless when no adjacent tab is in the direction
  // @note startPos is always 0 when the base tab is pinned and the state has
  // 'next'.
  if ((direction === 'prev' && --startPos < 0) ||
      (direction === 'next' && ++startPos > activeTabs.length - 1))
    return null;

  /**
   * Sets the comparator function
   */
  baseId = aBaseTab.getAttribute(kID.OPEN);
  if (aBaseTab.hasAttribute(kID.ANCESTORS)) {
    baseAncs = aBaseTab.getAttribute(kID.ANCESTORS).split(' ');
  }

  if (family === 'ancestor') {
    // useless when no ancestors is examined
    if (!baseAncs)
      return null;

    isRelated = function(tab) {
      let id = tab.getAttribute(kID.OPEN);
      // 1.this tab is an ancestor of the base tab
      return baseAncs.indexOf(id) > -1;
    };
  } else /* family === 'descendant' */ {
    isRelated = function(tab) {
      if (!tab.hasAttribute(kID.ANCESTORS))
        return false;

      let ancs = tab.getAttribute(kID.ANCESTORS).split(' ');
      // 1.this tab is a descendant of the base tab
      // 2.the parent of the base tab is an ancestor of this tab(sibling or
      // its descendant)
      return ancs.indexOf(baseId) > -1 ||
        (extended && baseAncs && ancs.indexOf(baseAncs[0]) > -1);
    };
  }

  /**
   * Ready to examine
   */
  relatedPos = -1;
  if (position === 'adjacent') {
    // get the adjacent one
    if (isRelated(activeTabs[startPos])) {
      relatedPos = startPos;
    }
  } else /* position === 'farthest' */ {
    // get the farthest one of a sequence of tabs
    // @note No implementation for the unsupported 'prev farthest'.
    for (let i = startPos, l = activeTabs.length; i < l; i++) {
      if (!isRelated(activeTabs[i]))
        break;
      relatedPos = i;
    }
  }

  if (-1 < relatedPos) {
    return activeTabs[relatedPos];
  }
  return null;
}

function selectOpenerTab(aBaseTab, aOption) {
  return selectTab(getOpenerTab(aBaseTab, aOption));
}

function getOpenerTab(aBaseTab, aOption) {
  var {undoClose} = aOption || {};

  var baseTab = aBaseTab || gBrowser.selectedTab;

  // no ancestors and no parent
  if (!baseTab.hasAttribute(kID.ANCESTORS)) {
    if (undoClose) {
      // has referrer (e.g. opened from bookmark)
      // @note A tab that has no opener tab is independent. So its referred URL
      // should be newly opened even if it exists in the current tabs.
      let referrerURL = mReferrer.getURL(baseTab);
      if (referrerURL) {
        // TODO: opens in foreground or background?
        return openTab(referrerURL);
      }
    }
    return null;
  }

  var parentId = (baseTab.getAttribute(kID.ANCESTORS).split(' '))[0];

  // including the base tab
  var tabs = getTabs('active, pinned', baseTab);

  // search in the current tabs
  for (let i = 0, l = tabs.length; i < l; i++) {
    if (tabs[i].getAttribute(kID.OPEN) === parentId) {
      return tabs[i];
    }
  }

  // search in the closed tabs
  if (undoClose) {
    let undoList = mSessionStore.getClosedTabList();
    if (undoList) {
      for (let i = 0, l = undoList.length; i < l; i++) {
        if (undoList[i].state.attributes[kID.OPEN] === parentId) {
          // @see chrome://browser/content/browser.js::undoCloseTab
          return window.undoCloseTab(i);
        }
      }
    }
  }

  // not found
  return null;
}

function selectPrevSelectedTab(aBaseTab, aOption) {
  return selectTab(getPrevSelectedTab(aBaseTab, aOption));
}

function getPrevSelectedTab(aBaseTab, aOption) {
  var {traceBack, undoClose} = aOption || {};

  var baseTab = aBaseTab || gBrowser.selectedTab;
  // including the base tab
  var tabs = getTabs('active, pinned', baseTab);

  var time, recentTime = 0;
  var pos = -1;

  for (let i = 0, l = tabs.length, tab; i < l; i++) {
    tab = tabs[i];
    if (tab === baseTab)
      continue;
    if (tab.hasAttribute(kID.SELECT)) {
      time = parseInt(tab.getAttribute(kID.SELECT), 10);
      if (time > recentTime) {
        recentTime = time;
        pos = i;
      }
    }
  }

  if (-1 < pos) {
    // found regardless of the selected time
    if (traceBack ||
        recentTime === mTabSelector.prevSelectedTime) {
      return tabs[pos];
    }
  }

  // reopen a previous selected tab
  if (undoClose) {
    let undoList = mSessionStore.getClosedTabList();
    if (undoList) {
      for (let i = 0, l = undoList.length; i < l; i++) {
        if (undoList[i].state.attributes[kID.SELECT] ===
            mTabSelector.prevSelectedTime + '') {
          // @see chrome://browser/content/browser.js::undoCloseTab
          return window.undoCloseTab(i);
        }
      }
    }
  }

  // not found
  return null;
}

function getAdjacentTab(aBaseTab, aDirection) {
  if (aDirection !== -1 && aDirection !== +1)
    throw new TypeError('aDirection should be -1 or +1');

  // including the base tab
  var tabs = getTabs('active, pinned', aBaseTab);

  var basePos = getTabPos(tabs, aBaseTab);
  // no tabs in the direction
  if ((aDirection === -1 && basePos === 0) ||
      (aDirection === +1 && basePos === tabs.length - 1))
    return null;
  return tabs[pos + aDirection];
}

function closeRightTabs(aBaseTab) {
  closeTabsFromAdjacentToEnd(aBaseTab, +1);
}

function closeTabsFromAdjacentToEnd(aBaseTab, aDirection) {
  if (aDirection !== -1 && aDirection !== +1)
    throw new TypeError('aDirection should be -1 or +1');

  // excluding pinned tabs
  var tabs = getTabs('active');

  var basePos = getTabPos(tabs, aBaseTab);
  // 1.the base tab is not active
  // 2.no tabs in the direction
  if (basePos < 0 ||
      (aDirection === -1 && basePos === 0) ||
      (aDirection === +1 && basePos === tabs.length - 1))
    return;

  var start, end;
  // closing from end to first
  if (aDirection === -1) {
    first = basePos - 1;
    end = 0;
  } else {
    first = tabs.length - 1;
    end = basePos + 1;
  }

  for (let i = end; i >= first ; i--) {
    removeTab(tabs[i], {safeBlock: true});
  }
}

function closeReadTabs() {
  // excluding pinned tabs
  var tabs = getTabs('active');

  // closing from the last tab
  for (let i = tabs.length - 1, tab; i >= 0 ; i--) {
    tab = tabs[i];
    if (tab.hasAttribute(kID.READ)) {
      removeTab(tab, {safeBlock: true});
    }
  }
}

/**
 * Gets an array of tabs
 * @param aStatement {string} keywords divided by ',' to include
 *   'pinned': pinned tabs
 *   'active': tabs of the current active group (exclude pinned tabs)
 * @param aForcedTab {Element} [optional]
 *   forces to include this tab regardless of aStatement
 * @return {Array}
 *
 * TODO: |aForcedTab| needs for a closing tab on |TabClose| event. How should
 * handle a closing tab?
 */
function getTabs(aStatement, aForcedTab) {
  var statement = StatementParser(aStatement, ',');
  var pinned = !!statement.matchKey(['pinned']),
      active = !!statement.matchKey(['active']);

  return Array.filter(gBrowser.tabs, function(tab) {
    if (tab === aForcedTab)
      return true;
    if (tab.closing)
      return false;
    return (pinned && tab.pinned)  ||
           (active && !tab.pinned && !tab.hidden);
  });
}

function getTabPos(aTabs, aTab) {
  return Array.indexOf(aTabs, aTab);
}

function selectTab(aTab) {
  if (aTab) {
    if (!aTab.selected) {
      gBrowser.selectedTab = aTab;
    }
    return aTab;
  }
  return null;
}


//********** Utilities

/**
 * Makes an unique value with the current time
 * @return {integer}
 */
var getTime = (function() {
  var time = 0;

  return function() {
    var now = Date.now();
    return time = (time === now ? ++now : now);
  };
})();

function getPageTitle(aURL) {
  var title = '';
  try {
    // @see resource://modules/PlacesUIUtils.jsm::
    // PlacesUIUtils::getBestTitle
    // @see chrome://global/content/contentAreaUtils.js::makeURI
    title = PlacesUtils.history.getPageTitle(window.makeURI(aURL));
  } catch (e) {}

  return title || aURL;
}

function scanHistoryDatabase(aSQL, aParams, aColumnName) {
  var statement =
    Cc['@mozilla.org/browser/nav-history-service;1'].
    getService(Ci.nsPIPlacesDatabase).
    DBConnection.
    createStatement(aSQL);

  for (let key in aParams) {
    statement.params[key] = aParams[key];
  }

  try {
    if (statement.executeStep()) {
      return statement.row[aColumnName];
    }
  } finally {
    statement.reset();
    statement.finalize();
  }
  return null;
}

/**
 * Creates a statement parser
 * @param aStatement {string}
 * @param aDelimiter {string}
 * @param aSupportedStatements {array} [optional]
 * @return {hash}
 *   @member matchKey {function}
 *
 * @note used in getFamilyTab(), getTabs()
 */
function StatementParser(aStatement, aDelimiter, aSupportedStatements) {
  var mKeys;

  init();

  function init() {
    var delimiterRE = (aDelimiter === ' ') ?
      RegExp('\\s+', 'g') :
      RegExp('\\s*\\' + aDelimiter + '\\s*', 'g');

    var statement = aStatement.trim().replace(delimiterRE, aDelimiter);

    if (aSupportedStatements &&
        aSupportedStatements.indexOf(statement) < 0) {
      log('aStatement: "' + aStatement + '" is invalid\n' +
          'supported values;\n' + aSupportedStatements.join('\n'));
      throw 'Unsupported aStatement is given';
    }

    mKeys = statement.split(aDelimiter);
  }

  function matchKey(aSortOfKeys) {
    for (let i = 0; i < aSortOfKeys.length; i++) {
      if (mKeys.indexOf(aSortOfKeys[i]) > -1)
        return aSortOfKeys[i];
    }
    return null;
  }

  return {
    matchKey: matchKey
  };
}


//********** Imports

function getPref(aKey)
  ucjsUtil.getPref(aKey);

function setPref(aKey, aVal)
  ucjsUtil.setPref(aKey, aVal);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function openTab(aURL, aOption)
  ucjsUtil.openTab(aURL, aOption);

function removeTab(aTab, aOption)
  ucjsUtil.removeTab(aTab, aOption);

function log(aMsg)
  ucjsUtil.logMessage('TabEx.uc.js', aMsg);


//********** Entry point

/**
 * Patches for the system default
 */
function modifySystemSetting() {
  const prefs = [
    // @pref Disable the custom positioning and focusing of tabs.
    {key: 'browser.tabs.insertRelatedAfterCurrent', value: false},
    {key: 'browser.tabs.selectOwnerOnClose', value: false},
    // @pref Disable loading of the background tabs in restoring startup.
    {key: 'browser.sessionstore.restore_on_demand', value: true},
    {key: 'browser.sessionstore.restore_pinned_tabs_on_demand', value: true}
  ];

  prefs.forEach(function(pref) {
    var value = getPref(pref.key);
    if (value !== pref.value) {
      setPref(pref.key, pref.value);
      addEvent([window, 'unload', function() {
        setPref(pref.key, value);
      }, false]);
    }
  });
}

function TabEx_init() {
  modifySystemSetting();

  mTabEvent.init();
  mSessionStore.init();
  mTabOpener.init();
  mStartup.init();
}

TabEx_init();


//********** Export

return {
  tabState: mTabState,
  referrer: mReferrer,
  selectOpenerTab: selectOpenerTab,
  selectPrevSelectedTab: selectPrevSelectedTab,
  closeRightTabs: closeRightTabs,
  closeReadTabs: closeReadTabs
};


})();
