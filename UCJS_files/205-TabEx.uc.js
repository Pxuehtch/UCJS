// ==UserScript==
// @name        TabEx.uc.js
// @description Extends the tab functions
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note Some about:config preferences are changed. see @pref
// @note A default function is modified. see @modified
// @note Some functions are exported (ucjsTabEx.XXX)


var ucjsTabEx = (function(window, undefined) {


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
  SUSPENDED: 'ucjs_tabex_suspended',
  RESTORING: 'ucjs_tabex_restoring'
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
  SUSPEND_LOADING: true,
  // the delay time until the loading is suspended
  // @value {integer} millisecond
  //   0: immediately stop loading
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
 * Tab data manager
 */
var mTab = (function () {
  /**
   * Gets/Sets or Removes the tab data
   * @param aTab {Element}
   * @param aKey {string} a reserved key that corresponds to a data
   * @param aValue {} [optional] a value to set
   *   null: *remove* a data
   * @return {}
   *   get: a value that is requested if exists, null otherwise.
   *   set: a value that is set, null if removed.
   */
  function data(aTab, aKey, aValue) {
    var id, getter, setter;
    switch (aKey) {
      case 'query': // {hash}
        id = kID.OPENQUERY;
        getter = function(aValue) {
          return JSON.parse(aValue);
        };
        setter = function(aValue) {
          return JSON.stringify(aValue);
        };
        break;
      case 'open': // {integer}
        id = kID.OPEN;
        getter = function(aValue) {
          return parseInt(aValue, 10);
        };
        setter = function(aValue) {
          return aValue;
        };
        break;
      case 'select': // {integer}
        id = kID.SELECT;
        getter = function(aValue) {
          return parseInt(aValue, 10);
        };
        setter = function(aValue) {
          return aValue;
        };
        break;
      case 'read': // {integer}
        id = kID.READ;
        getter = function(aValue) {
          return parseInt(aValue, 10);
        };
        setter = function(aValue) {
          return aValue;
        };
        break;
      case 'ancestors': // {integer[]}
        id = kID.ANCESTORS;
        getter = function(aValue) {
          return aValue.split(' ').map(function(value) parseInt(value, 10));
        };
        setter = function(aValue) {
          return aValue.join(' ');
        };
        break;
      default:
        throw new TypeError('unknown aKey of tab data');
    }

    // get a data
    if (aValue === undefined) {
      if (aTab.hasAttribute(id)) {
        return getter(aTab.getAttribute(id));
      }
      return null;
    }

    // remove or set a data
    if (aValue === null) {
      if (aTab.hasAttribute(id)) {
        aTab.removeAttribute(id);
      }
    } else {
      aTab.setAttribute(id, setter(aValue));
    }
    return aValue;
  }

  /**
   * Retrieves the data of a closed tab from the session store
   * @param aClosedTabData {hash} a parsed JSON of a closed tab
   * @param aKey {string} a reserved key that corresponds to a data
   * @return {}
   *
   * @note |aKey| is the same as the keys of |data|. Only the keys that is
   * called in the code is supported.
   */
  function SSdata(aClosedTabData, aKey) {
    var id, getter;
    switch (aKey) {
      case 'open': // {integer}
        id = kID.OPEN;
        getter = function(aValue) {
          return parseInt(aValue, 10);
        };
        break;
      case 'select': // {integer}
        id = kID.SELECT;
        getter = function(aValue) {
          return parseInt(aValue, 10);
        };
        break;
      default:
        throw new TypeError('unsupported aKey of a closed tab data');
    }

    return getter(aClosedTabData.state.attributes[id]);
  }

  /**
   * State of a tab
   */
  var state = {
    // whether a user read a tab or not
    read: function(aTab, aValue) {
      return manageFlagAttribute(aTab, kID.READ, aValue);
    },

    // whether the loading of a tab is suspended or not
    suspended: function(aTab, aValue) {
      return manageFlagAttribute(aTab, kID.SUSPENDED, aValue);
    },

    // duplicated/undo-closed is opening
    restoring: function(aTab, aValue) {
      return manageFlagAttribute(aTab, kID.RESTORING, aValue);
    }
  };

  function manageFlagAttribute(aTab, aKey, aValue) {
    var has = aTab.hasAttribute(aKey);
    if (aValue === undefined)
      return has;

    if (has && aValue === false) {
      aTab.removeAttribute(aKey);
    } else if (!has && aValue === true) {
      aTab.setAttribute(aKey, true);
    }
    return aValue;
  }

  return {
    data: data,
    SSdata: SSdata,
    state: state
  };
})();

/**
 * Session store handler
 */
var mSessionStore = {
  // whether a tab is in restoring (duplicated/undo-closed tab)
  isRestoring: false,

  init: function() {
    this.SessionStore =
      Cc['@mozilla.org/browser/sessionstore;1'].
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

      // when a tab is duplicated or undo-closed, its tab data is restored.
      if (mSessionStore.isRestoring) {
        mTab.state.restoring(newTab, true);
        return newTab;
      }

      var aRelatedToCurrent, aFromExternal, aIsUTF8;
      if (arguments.length === 2 &&
          typeof arguments[1] === 'object' &&
          !(arguments[1] instanceof Ci.nsIURI)) {
        let params = arguments[1];
        aReferrerURI          = params.referrerURI;
        aCharset              = params.charset;
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

      // TODO: POST data handling. |aPostData| is a |nsIInputStream| object
      // that JSON does not support.
      var query = {
        URL: aURI,
        flags: flags,
        referrerURL: aReferrerURI || undefined,
        charset: aCharset || undefined,
        relatedToCurrent: aRelatedToCurrent || undefined,
        fromVisit: fromVisit || undefined
      };
      mTab.data(newTab, 'query', query);

      var event = document.createEvent('Events');
      event.initEvent('UcjsTabExTabOpen', true, false);
      newTab.dispatchEvent(event);

      return newTab;
    };
  },

  set: function(aTab, aType) {
    switch (aType) {
      case 'StartupTab':
        let browser = gBrowser.getBrowserForTab(aTab);
        // |userTypedValue| holds the URL of a document till it successfully
        // loads.
        let URL = browser.userTypedValue || browser.currentURI.spec;
        let query = {
          URL: URL,
          flags: Ci.nsIWebNavigation.LOAD_FLAGS_NONE
        };
        mTab.data(aTab, 'query', query);
        break;
      case 'NewTab':
        if (mReferrer.isRelatedToCurrent(aTab)) {
          // inherit the ancestors so that the opener tab becomes the parent
          let parent = gBrowser.selectedTab;
          let open = mTab.data(parent, 'open');
          let ancs = mTab.data(parent, 'ancestors') || [];
          mTab.data(aTab, 'ancestors', [open].concat(ancs));
        }
        break;
      case 'DuplicatedTab':
        // this duplicated tab has the same data of its original tab
        // renew the ancestors so that the original tab becomes the parent
        let open = mTab.data(aTab, 'open');
        let ancs = mTab.data(aTab, 'ancestors') || [];
        mTab.data(aTab, 'ancestors', [open].concat(ancs));
        break;
    }

    mTab.data(aTab, 'open', getTime());
  }
};

/**
 * Tab referrer handler
 */
var mReferrer = {
  getURL: function(aTab) {
    var query = mTab.data(aTab, 'query');
    if (!query)
      return null;

    return query.referrerURL || query.fromVisit;
  },

  getTitle: function(aTab) {
    return getPageTitle(this.getURL(aTab));
  },

  exists: function(aTab) {
    return !!this.getURL(aTab);
  },

  isRelatedToCurrent: function(aTab) {
    var query = mTab.data(aTab, 'query');
    if (!query)
      return null;

    return !!(query.referrerURL ||
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
      mTab.data(aTab, 'select', null);
      mTab.data(aTab, 'read', null);
      return;
    }

    var time = getTime();
    mTab.data(aTab, 'select', time);
    if (read || !mTab.state.read(aTab)) {
      mTab.data(aTab, 'read', time);
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
    }.bind(this), aDelay, aTab);

    // the opened time of each tab is an unique value
    this.timers[mTab.data(aTab, 'open')] = timer;
  },

  clear: function(aTab) {
    var id = aTab && mTab.data(aTab, 'open');
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

    var [browser, loadingURL] = this.getBrowserForTab(aTab);
    var isBusy = aTab.hasAttribute('busy');
    var isBlank = browser.currentURI.spec === 'about:blank';

    // 1.a document in loading
    // 2.a blank page when the default 'tabs on demand' works
    if (loadingURL && (isBusy || isBlank)) {
      mTab.state.suspended(aTab, true);

      if (isBusy) {
        browser.stop();
      }
      if (isBlank) {
        aTab.label = getPageTitle(loadingURL);
      }
    }
  },

  reload: function(aTab) {
    this.clear(aTab);

    // pass only the visible and suspended tab
    if (!aTab || aTab.hidden || aTab.closing ||
        !mTab.state.suspended(aTab))
      return;

    mTab.state.suspended(aTab, false);

    var [browser, loadingURL, query] = this.getBrowserForTab(aTab);
    if (loadingURL) {
      if (query) {
        // TODO: POST data handling.
        browser.loadURIWithFlags(
          query.URL,
          query.flags,
          makeURI(query.referrerURL),
          query.charset,
          null
        );
      } else {
        browser.loadURI(loadingURL);
      }
    }
  },

  getBrowserForTab: function(aTab) {
    var browser = gBrowser.getBrowserForTab(aTab);
    var loadingURL;
    var query;

    // TODO: Use a certain detection
    var isNewTab = !browser.canGoBack;
    if (isNewTab) {
      query = mTab.data(aTab, 'query');
    }

    // 1.a new tab has no query when it bypassed our hooked |gBrowser.addTab|
    // 2.|userTypedValue| holds the URL of a document till it successfully
    // loads
    if (query && query.URL !== 'about:blank') {
      loadingURL = query.URL;
    } else {
      loadingURL = browser.userTypedValue;
    }

    return [browser, loadingURL, query];
  }
};

/**
 * Startup tabs handler
 */
var mStartup = {
  init: function() {
    // execute |setupTabs| just after all tabs open
    // TODO: Use a certain observer.
    setTimeout(this.setupTabs.bind(this), 1000);
  },

  setupTabs: function() {
    Array.forEach(gBrowser.tabs, function(tab) {
      // a boot startup tab (e.g. homepage)
      if (!mTab.data(tab, 'open')) {
        mTabOpener.set(tab, 'StartupTab');
      }

      if (tab.selected) {
        mTabSelector.update(tab);
      } else {
        // immediately stop the loading of a background tab
        mTabSuspender.stop(tab);
      }
    }, this);
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
        this.onSSTabRestored(tab);
        break;
    }
  },

  onTabOpen: function(aTab) {
    mTabOpener.set(aTab, 'NewTab');

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

  onSSTabRestored: function(aTab) {
    // handle a duplicated/undo-closed tab
    // do not pass a restored startup tab
    if (!mTab.state.restoring(aTab))
      return;

    var openPos, baseTab;

    var originalTab = getOriginalTabOfDuplicated(aTab);
    if (originalTab) {
      mTabOpener.set(aTab, 'DuplicatedTab');

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
      // tab that has been forcibly selected
      baseTab = getPrevSelectedTab();
    }

    moveTabTo(aTab, openPos, baseTab);
  }
};


//********** Tab handling functions

function getOriginalTabOfDuplicated(aTab) {
  var openTime = mTab.data(aTab, 'open');

  var tabs = gBrowser.tabs;

  for (let i = 0, l = tabs.length, tab; i < l; i++) {
    tab = tabs[i];
    if (tab !== aTab &&
        mTab.data(tab, 'open') === openTime) {
      return tab;
    }
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
      throw 'unknown kPosType for OPENPOS';
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
        throw 'unknown kPosType for SELECTPOS';
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
  baseId = mTab.data(aBaseTab, 'open');
  baseAncs = mTab.data(aBaseTab, 'ancestors');

  if (family === 'ancestor') {
    // useless when no ancestors is examined
    if (!baseAncs)
      return null;

    isRelated = function(tab) {
      let id = mTab.data(tab, 'open');
      // 1.this tab is an ancestor of the base tab
      return baseAncs.indexOf(id) > -1;
    };
  } else /* family === 'descendant' */ {
    isRelated = function(tab) {
      let ancs = mTab.data(tab, 'ancestors');
      // this tab that has no ancestors does not related with the base tab
      if (!ancs)
        return false;

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

  var ancs = mTab.data(baseTab, 'ancestors');
  // no ancestor then no parent
  if (!ancs) {
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

  // the parent exists
  var parent = ancs[0];

  // including the base tab
  var tabs = getTabs('active, pinned', baseTab);

  // search in the current tabs
  for (let i = 0, l = tabs.length; i < l; i++) {
    if (mTab.data(tabs[i], 'open') === parent) {
      return tabs[i];
    }
  }

  // search in the closed tabs
  if (undoClose) {
    let undoList = mSessionStore.getClosedTabList();
    if (undoList) {
      for (let i = 0, l = undoList.length; i < l; i++) {
        if (mTab.SSdata(undoList[i], 'open') === parent) {
          // @see chrome://browser/content/browser.js::undoCloseTab
          // @note |undoCloseTab| opens a tab and forcibly selects it.
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
  var prevSelectedTime = mTabSelector.prevSelectedTime;
  var pos = -1;

  for (let i = 0, l = tabs.length, tab; i < l; i++) {
    tab = tabs[i];
    if (tab === baseTab)
      continue;
    time = mTab.data(tab, 'select');
    if (time && time > recentTime) {
      recentTime = time;
      pos = i;
    }
  }

  if (-1 < pos) {
    // found regardless of the selected time
    if (traceBack ||
        recentTime === prevSelectedTime) {
      return tabs[pos];
    }
  }

  // reopen a previous selected tab
  if (undoClose) {
    let undoList = mSessionStore.getClosedTabList();
    if (undoList) {
      for (let i = 0, l = undoList.length; i < l; i++) {
        if (mTab.SSdata(undoList[i], 'select') === prevSelectedTime) {
          // @see chrome://browser/content/browser.js::undoCloseTab
          // @note |undoCloseTab| opens a tab and forcibly selects it.
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

function closeLeftTabs(aBaseTab) {
  closeTabsFromAdjacentToEnd(aBaseTab, -1);
}

function closeRightTabs(aBaseTab) {
  closeTabsFromAdjacentToEnd(aBaseTab, +1);
}

function closeTabsFromAdjacentToEnd(aBaseTab, aDirection) {
  if (aDirection !== -1 && aDirection !== +1)
    throw new TypeError('aDirection should be -1 or +1');

  var baseTab = aBaseTab || gBrowser.selectedTab;
  // excluding pinned tabs
  var tabs = getTabs('active');

  var basePos = getTabPos(tabs, baseTab);
  // 1.the base tab is not active
  // 2.no tabs in the direction
  if (basePos < 0 ||
      (aDirection === -1 && basePos === 0) ||
      (aDirection === +1 && basePos === tabs.length - 1))
    return;

  var top, last;
  // closing from the last tab
  if (aDirection === -1) {
    top = 0;
    last = basePos - 1;
  } else {
    top = basePos + 1;
    last = tabs.length - 1;
  }

  for (let i = last; i >= top ; i--) {
    removeTab(tabs[i], {safeBlock: true});
  }
}

function closeReadTabs() {
  // excluding pinned tabs
  var tabs = getTabs('active');

  // closing from the last tab
  for (let i = tabs.length - 1, tab; i >= 0 ; i--) {
    tab = tabs[i];
    if (mTab.state.read(tab)) {
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
 * TODO: |aForcedTab| is used only for a closing tab on |TabClose| event.
 * Make a smart handling.
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
  var title;
  try {
    // @see resource:///modules/PlacesUtils.jsm
    title = PlacesUtils.history.getPageTitle(makeURI(aURL));
  } catch (e) {}

  return title || aURL;
}

function makeURI(aURL) {
  try{
    // @see chrome://global/content/contentAreaUtils.js::makeURI
    return window.makeURI(aURL);
  } catch (e) {}
  return null;
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
      log('aStatement: "' + aStatement + '" is unsupported\n' +
          'supported values;\n' + aSupportedStatements.join('\n'));
      throw new TypeError('unsupported aStatement');
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
  tabState: mTab.state,
  referrer: mReferrer,
  selectOpenerTab: selectOpenerTab,
  selectPrevSelectedTab: selectPrevSelectedTab,
  closeLeftTabs: closeLeftTabs,
  closeRightTabs: closeRightTabs,
  closeReadTabs: closeReadTabs
};


})(this);
