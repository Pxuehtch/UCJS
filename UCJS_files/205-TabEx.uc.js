// ==UserScript==
// @name        TabEx.uc.js
// @description Extends the tab functions
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note some about:config preferences are changed. see @pref
// @note a default function is modified. see @modified
// @note some properties are exposed to the global scope;
// |window.ucjsTabEx.XXX|


const ucjsTabEx = (function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  XPCOM: {
    getModule
  },
  Timer: {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  },
  Prefs,
  addEvent,
  openTab,
  removeTab,
  getPlacesDBResult
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('TabEx.uc.js', aMsg);
}

/**
 * Identifier
 */
const kID = {
  OPENTIME: 'ucjs_tabex_opentime',
  READTIME: 'ucjs_tabex_readtime',
  SELECTTIME: 'ucjs_tabex_selecttime',
  ANCESTORS: 'ucjs_tabex_ancestors',
  OPENQUERY: 'ucjs_tabex_openquery',
  SUSPENDED: 'ucjs_tabex_suspended',
  READ: 'ucjs_tabex_read',
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
  // @note SELECTPOS: no match if no previous tab
  PREV_ADJACENT: 4,

  // at the next adjacent
  // @note SELECTPOS: no match if no next tab
  NEXT_ADJACENT: 5,

  /**
   * only for OPENPOS
   */

  // after the far end tab of the sequential followings that are descendants of
  // the base tab from its next adjacent, or at the next adjacent
  // @note the family relation is kept even if the base tab changes its
  // location
  NEXT_INCREMENT_DESCENDANT: 6,

  /**
   * only for SELECTPOS
   */

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
  ANYWHERE_PREV_SELECTED: 10,

  // the oldest opened tab of unread tabs
  // @note may be no match
  ANYWHERE_OLDEST_UNREAD: 11
};

/**
 * Preference
 */
const kPref = {
  // where a new tab is opened to
  //
  // @value {kPosType}
  // @note the count of positioning starts from the first *un*pinned tab
  // @note |OPENPOS_LINKED| works when the tab is opened by a link in the
  // content area or |addTab| with |relatedToCurrent| option, otherwise
  // |OPENPOS_UNLINKED|
  OPENPOS_LINKED:    kPosType.NEXT_INCREMENT_DESCENDANT,
  OPENPOS_UNLINKED:  kPosType.LAST_END,
  OPENPOS_DUPLICATE: kPosType.NEXT_ADJACENT,
  // DEFAULT: a tab reopens at the same position where it closed
  OPENPOS_UNDOCLOSE: kPosType.DEFAULT,

  // which tab is selected after the *selected* tab is closed
  //
  // @value {kPosType[]}
  // @note the default selection works if no matches (may be the same as
  // |PREV_ADJACENT|)
  SELECTPOS_TABCLOSE: [
    kPosType.NEXT_ADJACENT_EXTENDED_DESCENDANT,
    kPosType.PREV_ADJACENT_ANCESTOR,
    kPosType.ANYWHERE_OPENER,
    kPosType.ANYWHERE_PREV_SELECTED,
    kPosType.FIRST_END
  ],
  // for closing a selected pinned tab
  SELECTPOS_PINNEDTABCLOSE: [
    kPosType.PREV_ADJACENT
  ],

  // delayed-stops the loading of a tab that is opened in background
  //
  // @value {boolean}
  //   false: the same as the default 'tabs on demand' behavior
  //   true: stops the loading of the tab after |SUSPEND_DELAY| passes
  SUSPEND_LOADING: true,

  // the delay time until the loading is suspended
  //
  // @value {integer} millisecond
  //   0: try to stop loading immediately
  // @note it may take time because our process works after the Fx default one
  // for a background tab
  SUSPEND_DELAY: 0,

  // auto-reloads the suspended tab that is next adjacent of a selected tab
  //
  // @value {boolean}
  SUSPEND_NEXTTAB_RELOAD: false,

  // the delay time until it considers that "a user has read it" after the tab
  // is selected and loaded completely
  //
  // @value {integer} millisecond
  // @note the marking is canceled when the other tab is selected in a short
  // time (e.g. while flipping tabs with a shortcut key or mouse wheeling)
  SELECTED_DELAY: 1000
};

/**
 * Makes a unique value with the current time
 *
 * @return {integer}
 */
const getTime = (function() {
  let time = 0;

  return function() {
    let now = Date.now();

    return time = (time === now ? ++now : now);
  };
})();

/**
 * Tab data manager
 */
const mTab = (function () {
  /**
   * Gets/Sets or Removes the tab data
   *
   * @param aTab {Element}
   * @param aKey {string} a reserved key that corresponds to a data
   * @param aValue {} [optional] a value to set
   *   null: *remove* a data
   * @return {}
   *   get: a value that is requested if exists, null otherwise
   *   set: a value that is set, null if removed
   */
  function data(aTab, aKey, aValue) {
    let getInt = (value) => parseInt(value, 10);

    let name, getter, setter;

    switch (aKey) {
      case 'query': // {hash}
        name = kID.OPENQUERY;
        getter = (value) =>  JSON.parse(htmlUnescape(value));
        setter = (value) => htmlEscape(JSON.stringify(value));
        break;

      case 'open': // {integer}
        name = kID.OPENTIME;
        getter = getInt;
        break;

      case 'select': // {integer}
        name = kID.SELECTTIME;
        getter = getInt;
        break;

      case 'read': // {integer}
        name = kID.READTIME;
        getter = getInt;
        break;

      case 'ancestors': // {integer[]}
        name = kID.ANCESTORS;
        getter = (value) => value.split(' ').map(getInt);
        setter = (value) => value.join(' ');
        break;

      default:
        throw Error('unknown aKey of tab data');
    }

    // get a data
    if (aValue === undefined) {
      if (aTab.hasAttribute(name)) {
        return getter(aTab.getAttribute(name));
      }
      return null;
    }

    // remove or set a data
    if (aValue === null) {
      if (aTab.hasAttribute(name)) {
        aTab.removeAttribute(name);
      }
    }
    else {
      let value = setter ? setter(aValue) : aValue;
      aTab.setAttribute(name, value);
    }

    return aValue;
  }

  /**
   * Retrieves the data of a closed tab from the session store
   *
   * @param aClosedTabData {hash} a parsed JSON of a closed tab
   * @param aKey {string} a reserved key that corresponds to a data
   * @return {}
   *
   * @note |aKey| is the same as the keys of |data|. but only the keys used in
   * this script file is supported
   */
  function SSdata(aClosedTabData, aKey) {
    let getInt = (value) => parseInt(value, 10);

    let name, getter;

    switch (aKey) {
      case 'open': // {integer}
        name = kID.OPENTIME;
        getter = getInt;
        break;

      case 'select': // {integer}
        name = kID.SELECTTIME;
        getter = getInt;
        break;

      default:
        throw Error('unsupported aKey of a closed tab data');
    }

    return getter(aClosedTabData.state.attributes[name]);
  }

  /**
   * Gets/Sets the state of a tab
   */
  const state = {
    // whether a user read a tab
    read: function(aTab, aValue) {
      return manageFlagAttribute(aTab, kID.READ, aValue);
    },

    // whether the loading of a tab is suspended
    suspended: function(aTab, aValue) {
      return manageFlagAttribute(aTab, kID.SUSPENDED, aValue);
    },

    // whether duplicated/undo-closed is opening
    restoring: function(aTab, aValue) {
      return manageFlagAttribute(aTab, kID.RESTORING, aValue);
    }
  };

  /**
   * Tests the state of a tab
   */
  const stateTest = {
    // whether a user read a tab
    //
    // @return {boolean}
    read: function(aTab) {
      return manageFlagAttribute(aTab, kID.READ);
    },

    // whether the loading of a tab is suspended
    //
    // @return {boolean}
    suspended: function(aTab) {
      return manageFlagAttribute(aTab, kID.SUSPENDED);
    }
  };

  /**
   * Gets/Sets or Removes the key attribute of a tab
   *
   * @param aTab {Element}
   * @param aKey {string}
   * @param aValue {boolean} [optional]
   * @return {boolean}
   */
  function manageFlagAttribute(aTab, aKey, aValue) {
    let has = aTab.hasAttribute(aKey);

    if (aValue === undefined) {
      return has;
    }

    if (has && aValue === false) {
      aTab.removeAttribute(aKey);
    }
    else if (!has && aValue === true) {
      aTab.setAttribute(aKey, true);
    }

    return aValue;
  }

  return {
    data: data,
    SSdata: SSdata,
    state: state,
    stateTest: stateTest
  };
})();

/**
 * Tab opening handler
 */
const mTabOpener = {
  init: function() {
    // @modified chrome://browser/content/tabbrowser.xml::addTab
    const $addTab = gBrowser.addTab;

    gBrowser.addTab = function ucjsTabEx_addTab(
      aURI, // {string}
      aReferrerURI, // {nsIURI}
      aCharset,
      aPostData,
      aOwner,
      aAllowThirdPartyFixup
    ) {
      let newTab = $addTab.apply(this, arguments);

      // the data of duplicated/undo-closed tab will be restored
      if (mSessionStore.isRestoring) {
        mTab.state.restoring(newTab, true);

        return newTab;
      }

      let aRelatedToCurrent, aFromExternal, aDisableMCB;

      if (arguments.length === 2 &&
          typeof arguments[1] === 'object' &&
          !(arguments[1] instanceof Ci.nsIURI)) {
        let params = arguments[1];

        aReferrerURI          = params.referrerURI;
        aCharset              = params.charset;
        aAllowThirdPartyFixup = params.allowThirdPartyFixup;
        aFromExternal         = params.fromExternal;
        aRelatedToCurrent     = params.relatedToCurrent;
        aDisableMCB           = params.disableMCB;
      }

      let query;

      if (!aURI || aURI === 'about:blank') {
        query = {
          URL: 'about:blank',
          flags: Ci.nsIWebNavigation.LOAD_FLAGS_NONE
        };
      }
      else {
        // convert |nsIURI| into a URL string
        aReferrerURI = aReferrerURI && aReferrerURI.spec;

        let fromVisit;

        if (!aReferrerURI) {
          let testHTTP = (value) => /^https?:/.test(value);

          if (aRelatedToCurrent) {
            let currentURL = gBrowser.currentURI.spec;

            fromVisit = testHTTP(currentURL) && currentURL;
          }
          else {
            // TODO: I want to make asynchronous |getFromVisit|. but I don't
            // know how to handle it in this modified native function |addTab|
            fromVisit = testHTTP(aURI) && mReferrer.getFromVisit(aURI);
          }
        }

        let flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE;

        if (aAllowThirdPartyFixup) {
          flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP;
          flags |= Ci.nsIWebNavigation.LOAD_FLAGS_FIXUP_SCHEME_TYPOS;
        }

        if (aFromExternal) {
          flags |= Ci.nsIWebNavigation.LOAD_FLAGS_FROM_EXTERNAL;
        }

        if (aDisableMCB) {
          flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_MIXED_CONTENT;
        }

        // TODO: handle the POST data
        // @note |aPostData| is a |nsIInputStream| object that JSON does not
        // support
        query = {
          URL: aURI,
          flags: flags,
          referrerURL: aReferrerURI || undefined,
          charset: aCharset || undefined,
          relatedToCurrent: aRelatedToCurrent || undefined,
          fromVisit: fromVisit || undefined
        };
      }

      mTab.data(newTab, 'query', query);

      let event = document.createEvent('Events');

      event.initEvent('UcjsTabExTabOpen', true, false);
      newTab.dispatchEvent(event);

      return newTab;
    };
  },

  set: function(aTab, aType) {
    switch (aType) {
      case 'StartupTab': {
        let browser = gBrowser.getBrowserForTab(aTab);
        // |userTypedValue| holds the URL of a document till it successfully
        // loads
        let URL = browser.userTypedValue || browser.currentURI.spec;
        let query = {
          URL: URL,
          flags: Ci.nsIWebNavigation.LOAD_FLAGS_NONE
        };

        mTab.data(aTab, 'query', query);
        break;
      }

      case 'NewTab':
        if (mReferrer.isRelatedToCurrent(aTab)) {
          // inherit the ancestors so that the opener tab becomes the parent
          let parent = gBrowser.selectedTab;
          let open = mTab.data(parent, 'open');
          let ancs = mTab.data(parent, 'ancestors') || [];

          mTab.data(aTab, 'ancestors', [open].concat(ancs));
        }
        break;

      case 'DuplicatedTab': {
        // this duplicated tab has the same data of its original tab
        // renew the ancestors so that the original tab becomes the parent
        let open = mTab.data(aTab, 'open');
        let ancs = mTab.data(aTab, 'ancestors') || [];

        mTab.data(aTab, 'ancestors', [open].concat(ancs));
        break;
      }
    }

    mTab.data(aTab, 'open', getTime());
  }
};

/**
 * Tab referrer handler
 */
const mReferrer = {
  getURL: function(aTab) {
    let query = mTab.data(aTab, 'query');

    if (!query) {
      return null;
    }

    return query.referrerURL || query.fromVisit;
  },

  fetchTitle: function(aTab, aCallback) {
    fetchPageTitle(this.getURL(aTab), aCallback);
  },

  exists: function(aTab) {
    return !!this.getURL(aTab);
  },

  isRelatedToCurrent: function(aTab) {
    let query = mTab.data(aTab, 'query');

    if (!query) {
      return null;
    }

    return !!(query.referrerURL ||
      (query.relatedToCurrent && query.fromVisit));
  },

  getFromVisit: function(aURL) {
    if (!aURL) {
      return null;
    }

    // @see http://www.forensicswiki.org/wiki/Mozilla_Firefox_3_History_File_Format
    let SQLExp = [
      "SELECT p1.url",
      "FROM moz_places p1",
      "JOIN moz_historyvisits h1 ON h1.place_id = p1.id",
      "JOIN moz_historyvisits h2 ON h2.from_visit = h1.id",
      "JOIN moz_places p2 ON p2.id = h2.place_id",
      "WHERE p2.url = :url",
      "ORDER BY h1.visit_date DESC",
      "LIMIT 1"
    ].join(' ');

    // TODO: async-query Places DB
    let resultRows = getPlacesDBResult({
      expression: SQLExp,
      params: {'url': aURL},
      columns: ['url']
    });

    if (resultRows) {
      // we ordered a single row
      return resultRows[0].url;
    }
    return null;
  }
};

/**
 * Tab selecting handler
 */
const mTabSelector = {
  prevSelectedTime: 0,
  currentSelectedTime: 0,

  set: function(aTab) {
    // TODO: clear the interval timer in the proper way
    // at the present, the timer is cleared every |onTabSelect|. this is on
    // the premise that the other tab is *surely* selected after the tab is
    // closed
    this.clear();

    // repeatly observes a tab until its document completely loads while the
    // tab is selected
    this.timer = setInterval((tab) => {
      this.select(tab);
    }, kPref.SELECTED_DELAY, aTab);
  },

  clear: function() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  select: function(aTab) {
    // in loading yet
    if (aTab && aTab.hasAttribute('busy')) {
      return;
    }

    this.clear();

    // cancel the dealing when the tab is removed or deselected while the timer
    // is waiting
    if (!aTab || !aTab.selected) {
      return;
    }

    this.update(aTab);
  },

  update: function(aTab, aOption) {
    let {reset, read} = aOption || {};

    if (reset) {
      mTab.data(aTab, 'select', null);
      mTab.data(aTab, 'read', null);
      mTab.state.read(aTab, false);
      return;
    }

    let time = getTime();

    mTab.data(aTab, 'select', time);

    if (read || !mTab.state.read(aTab)) {
      mTab.data(aTab, 'read', time);
      mTab.state.read(aTab, true);
    }

    this.prevSelectedTime = this.currentSelectedTime;
    this.currentSelectedTime = time;
  }
};

/**
 * Handler of suspending the loading of a tab
 */
const mTabSuspender = {
  timers: {},

  set: function(aTab, aDelay) {
    let timer = setTimeout((tab) => {
      this.stop(tab);
    }, aDelay, aTab);

    // the opened time of a tab is a unique value
    this.timers[mTab.data(aTab, 'open')] = timer;
  },

  clear: function(aTab) {
    let id = aTab && mTab.data(aTab, 'open');
    let timer = id && this.timers[id];

    if (timer) {
      clearTimeout(timer);

      // delete the property that is not used anymore
      delete this.timers[id];
    }
  },

  stop: function(aTab) {
    this.clear(aTab);

    // cancel suspending the tab when is removed or selected while the timer
    // is waiting
    if (!aTab || aTab.selected) {
      return;
    }

    let [browser, loadingURL] = this.getBrowserForTab(aTab);

    if (loadingURL) {
      // a document in loading
      let isBusy = aTab.hasAttribute('busy');

      // a blank page when the default 'tabs on demand' works
      let isBlank =
        browser.currentURI.spec === 'about:blank' ||
        (aTab.hasAttribute('pending') && isBusy);


      if (isBusy || isBlank) {
        mTab.state.suspended(aTab, true);
      }

      if (isBusy) {
        // WORKAROUND: wait for the Fx processing to stop surely
        setTimeout(() => browser.stop(), 0);
      }

      if (isBlank) {
        fetchPageTitle(loadingURL, (aTitle) => {
          aTab.label = aTitle;
        });
      }
    }
  },

  reload: function(aTab) {
    this.clear(aTab);

    // pass only the visible and suspended tab
    if (!aTab || aTab.hidden || aTab.closing ||
        !mTab.state.suspended(aTab)) {
      return;
    }

    mTab.state.suspended(aTab, false);

    let [browser, loadingURL, query] = this.getBrowserForTab(aTab);

    if (loadingURL) {
      let loadPage;

      if (query) {
        // TODO: handle the POST data
        loadPage = () => browser.loadURIWithFlags(
          loadingURL,
          query.flags,
          makeURI(query.referrerURL) || null,
          query.charset || null,
          null // POST data
        );
      }
      else {
        loadPage = () => browser.loadURI(loadingURL);
      }

      // WORKAROUND: wait for the Fx processing to load correctly
      setTimeout(loadPage, 0);
    }
  },

  getBrowserForTab: function(aTab) {
    let browser = gBrowser.getBrowserForTab(aTab);
    let loadingURL;
    let query;

    // TODO: use a proper method of detection whether a tab newly opens or not
    let isNewTab = !browser.canGoBack;

    if (isNewTab) {
      query = mTab.data(aTab, 'query');
    }

    // 1.a new tab has no query when it bypassed our hooked |gBrowser.addTab|
    // 2.|userTypedValue| holds the URL of a document till it successfully
    // loads
    if (query && query.URL !== 'about:blank') {
      loadingURL = query.URL;
    }
    else {
      loadingURL = browser.userTypedValue;
    }

    return [browser, loadingURL, query];
  }
};

/**
 * Session store handler
 */
const mSessionStore = {
  // whether a tab is in restoring (duplicated/undo-closed tab)
  isRestoring: false,

  init: function() {
    this.SessionStore =
      Cc['@mozilla.org/browser/sessionstore;1'].
      getService(Ci.nsISessionStore);

    addEvent(window, 'SSWindowStateBusy', () => {
      this.isRestoring = true;
    }, false);

    addEvent(window, 'SSWindowStateReady', () => {
      this.isRestoring = false;
    }, false);

    /**
     * execute processing just after all tabs open at startup
     *
     * TODO: use a reliable observer
     * WORKAROUND:
     * 1.on boot startup, observes |DOMContentLoaded| that fires on the
     * document first selected
     * 2.on resume startup, observes |SSTabRestored| that fires on the tab
     * first selected
     */
    let isResumeStartup =
      Cc['@mozilla.org/browser/sessionstartup;1'].
      getService(Ci.nsISessionStartup).
      doRestore();

    let eventTarget, eventType;

    if (isResumeStartup) {
      eventTarget = gBrowser.tabContainer;
      eventType = 'SSTabRestored';
    }
    else {
      eventTarget = window;
      eventType = 'DOMContentLoaded';
    }

    let onLoad = () => {
      eventTarget.removeEventListener(eventType, onLoad, false);

      this.setStartupTabs();
      this.persistTabAttribute();
    };

    eventTarget.addEventListener(eventType, onLoad, false);
  },

  setStartupTabs: function() {
    Array.forEach(gBrowser.tabs, (tab) => {
      // a boot startup tab (e.g. homepage)
      if (!mTab.data(tab, 'open')) {
        mTabOpener.set(tab, 'StartupTab');
      }

      if (tab.selected) {
        // update |select|, and set |read| if first selected
        mTabSelector.update(tab);
      }
      else {
        // immediately stop the loading of a background tab
        mTabSuspender.stop(tab);
      }
    });
  },

  persistTabAttribute: function() {
    let savedAttributes = [
      kID.OPENTIME,
      kID.READTIME,
      kID.SELECTTIME,
      kID.ANCESTORS,
      kID.OPENQUERY
    ];

    savedAttributes.forEach((key) => {
      this.SessionStore.persistTabAttribute(key);
    });
  },

  getClosedTabList: function() {
    if (this.SessionStore.getClosedTabCount(window) > 0) {
      return JSON.parse(this.SessionStore.getClosedTabData(window));
    }
    return null;
  }
};

/**
 * Tab event handler
 */
const mTabEvent = {
  init: function() {
    let tc = gBrowser.tabContainer;

    addEvent(tc, 'UcjsTabExTabOpen', this, false);
    addEvent(tc, 'TabSelect', this, false);
    addEvent(tc, 'TabClose', this, false);
    addEvent(tc, 'SSTabRestored', this, false);
  },

  handleEvent: function(aEvent) {
    let tab = aEvent.originalTarget;

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

    let openPos =
      mReferrer.isRelatedToCurrent(aTab) ?
      kPref.OPENPOS_LINKED :
      kPref.OPENPOS_UNLINKED;

    moveTabTo(aTab, openPos);
  },

  onTabSelect: function(aTab) {
    // 1.do not pass a duplicated/undo-closed tab. handle it in
    // |onSSTabRestored|
    // 2.pass a startup restored tab
    if (mTab.state.restoring(aTab)) {
      return;
    }

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
      let selectPos =
        aTab.pinned ?
        kPref.SELECTPOS_PINNEDTABCLOSE :
        kPref.SELECTPOS_TABCLOSE;

      selectTabAt(aTab, selectPos);
    }
  },

  onSSTabRestored: function(aTab) {
    // 1.pass a duplicated/undo-closed tab
    // 2.do not pass a startup restored tab. no relocation needed
    if (!mTab.state.restoring(aTab)) {
      return;
    }

    mTab.state.restoring(aTab, false);

    let openPos, baseTab;

    let originalTab = getOriginalTabOfDuplicated(aTab);

    if (originalTab) {
      // @note a duplicated tab has the same data as its original tab and we
      // update some data to be as a new opened tab

      // update |open| and |ancestors|
      mTabOpener.set(aTab, 'DuplicatedTab');

      if (aTab.selected) {
        // force to update |read|
        mTabSelector.update(aTab, {read: true});
      }
      else {
        // remove |select| and |read|
        mTabSelector.update(aTab, {reset: true});
      }

      openPos = kPref.OPENPOS_DUPLICATE;
      baseTab = originalTab;
    }
    else {
      // @note an undoclosed tab has the restored data
      // @note |window.undoCloseTab| opens a tab and forcibly selects it

      // update |select|, and set |read| if first selected
      mTabSelector.update(aTab);

      openPos = kPref.OPENPOS_UNDOCLOSE;

      // sets the previous selected tab to the base tab for moving this tab.
      // the previous selected tab surely exists because it was selected then
      // this undoclosed tab has been opened and selected
      baseTab = getPrevSelectedTab();
    }

    moveTabTo(aTab, openPos, baseTab);
  }
};

/**
 * Tab handling functions
 */
function getOriginalTabOfDuplicated(aTab) {
  let openTime = mTab.data(aTab, 'open');

  let tabs = gBrowser.tabs;

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
  let baseTab = aBaseTab || gBrowser.selectedTab;

  // excluding pinned tabs
  let tabs = getTabs('active');
  let tabsNum = tabs.length;

  // returns -1 for a pinned or closing tab
  let basePos = getTabPos(tabs, baseTab);
  let tabPos = getTabPos(tabs, aTab);
  let pos = -1;

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
      pos =
        (0 < basePos) ?
        ((tabPos < basePos) ? basePos - 1 : basePos) :
        0;
      break;

    case kPosType.NEXT_ADJACENT:
      pos = (basePos < tabsNum - 1) ? basePos + 1 : tabsNum - 1;
      break;

    case kPosType.NEXT_INCREMENT_DESCENDANT:
      pos = getTabPos(tabs, getFamilyTab(baseTab,
        'next farthest descendant'));
      pos =
        (-1 < pos) ?
        ((pos < tabsNum - 1) ? pos + 1 : tabsNum - 1) :
        basePos + 1;
      break;

    default:
      throw Error('unknown kPosType for OPENPOS');
  }

  if (-1 < pos && pos !== tabPos) {
    gBrowser.moveTabTo(aTab, getTabPos(gBrowser.tabs, tabs[pos]));
  }
}

function selectTabAt(aBaseTab, aPosTypes) {
  aPosTypes.some((posType) => {
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

      case kPosType.ANYWHERE_OLDEST_UNREAD:
        return !!selectOldestUnreadTab();

      default:
        throw Error('unknown kPosType for SELECTPOS');
    }

    // never reached, but avoid warning
    return true;
  });
}

/**
 * Retrieves a family tab of the base tab in the active tabs
 *
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

  let statement = StatementParser(aStatement, ' ', supportedStatements);

  let direction = statement.matchKey(['prev', 'next']),
      position = statement.matchKey(['adjacent', 'farthest']),
      extended = !!statement.matchKey(['extended']),
      family = statement.matchKey(['ancestor', 'descendant']);

  let activeTabs, startPos, baseId, baseAncs, isRelated, relatedPos;

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
  // @note |startPos| is always 0 when the base tab is pinned and the state has
  // 'next'
  if ((direction === 'prev' && --startPos < 0) ||
      (direction === 'next' && ++startPos > activeTabs.length - 1)) {
    return null;
  }

  /**
   * Sets the comparator function
   */
  baseId = mTab.data(aBaseTab, 'open');
  baseAncs = mTab.data(aBaseTab, 'ancestors');

  if (family === 'ancestor') {
    // useless when no ancestors is examined
    if (!baseAncs) {
      return null;
    }

    isRelated = function(tab) {
      let id = mTab.data(tab, 'open');
      // 1.this tab is an ancestor of the base tab
      return baseAncs.indexOf(id) > -1;
    };
  }
  else /* family === 'descendant' */ {
    isRelated = function(tab) {
      let ancs = mTab.data(tab, 'ancestors');

      // this tab that has no ancestors does not related with the base tab
      if (!ancs) {
        return false;
      }

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
  }
  else /* position === 'farthest' */ {
    // get the farthest one of a sequence of tabs
    // @note no implementation for the unsupported 'prev farthest'
    for (let i = startPos, l = activeTabs.length; i < l; i++) {
      if (!isRelated(activeTabs[i])) {
        break;
      }

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
  let {undoClose} = aOption || {};

  let baseTab = aBaseTab || gBrowser.selectedTab;

  let ancs = mTab.data(baseTab, 'ancestors');

  // no ancestor then no parent
  if (!ancs) {
    if (undoClose) {
      // has referrer (e.g. opened from bookmark)
      // @note a tab that has no opener tab is independent. so its referred URL
      // should be newly opened even if it exists in the current tabs
      let referrerURL = mReferrer.getURL(baseTab);

      if (referrerURL) {
        // TODO: opens in foreground or background?
        return openTab(referrerURL);
      }
    }
    return null;
  }

  // the parent exists
  let parent = ancs[0];

  // including the base tab
  let tabs = getTabs('active, pinned', baseTab);

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
          // @note |undoCloseTab| opens a tab and forcibly selects it
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
  let {traceBack, undoClose} = aOption || {};

  let baseTab = aBaseTab || gBrowser.selectedTab;

  // including the base tab
  let tabs = getTabs('active, pinned', baseTab);

  let time, recentTime = 0;
  let prevSelectedTime = mTabSelector.prevSelectedTime;
  let pos = -1;

  for (let i = 0, l = tabs.length, tab; i < l; i++) {
    tab = tabs[i];

    if (tab === baseTab) {
      continue;
    }

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
          // @note |undoCloseTab| opens a tab and forcibly selects it
          return window.undoCloseTab(i);
        }
      }
    }
  }

  // not found
  return null;
}

function selectOldestUnreadTab(aOption) {
  return selectTab(getOldestUnreadTab(aOption));
}

function getOldestUnreadTab(aOption) {
  let {includePinned} = aOption || {};

  let tabs = getTabs(includePinned ? 'active, pinned' : 'active');

  let time, oldTime = getTime();
  let pos = -1;

  for (let i = 0, l = tabs.length, tab; i < l; i++) {
    tab = tabs[i];

    if (mTab.state.read(tab)) {
      continue;
    }

    time = mTab.data(tab, 'open');

    if (time && time < oldTime) {
      oldTime = time;
      pos = i;
    }
  }

  if (-1 < pos) {
    return tabs[pos];
  }
  return null;
}

function getAdjacentTab(aBaseTab, aDirection) {
  if (aDirection !== -1 && aDirection !== +1) {
    throw Error('aDirection should be -1 or +1');
  }

  // including the base tab
  let tabs = getTabs('active, pinned', aBaseTab);

  let basePos = getTabPos(tabs, aBaseTab);

  // no tabs in the direction
  if ((aDirection === -1 && basePos === 0) ||
      (aDirection === +1 && basePos === tabs.length - 1)) {
    return null;
  }
  return tabs[basePos + aDirection];
}

function closeLeftTabs(aBaseTab) {
  closeTabsFromAdjacentToEnd(aBaseTab, -1);
}

function closeRightTabs(aBaseTab) {
  closeTabsFromAdjacentToEnd(aBaseTab, +1);
}

function closeTabsFromAdjacentToEnd(aBaseTab, aDirection) {
  if (aDirection !== -1 && aDirection !== +1) {
    throw Error('aDirection should be -1 or +1');
  }

  let baseTab = aBaseTab || gBrowser.selectedTab;

  // excluding pinned tabs
  let tabs = getTabs('active');

  let basePos = getTabPos(tabs, baseTab);

  // 1.the base tab is not active
  // 2.no tabs in the direction
  if (basePos < 0 ||
      (aDirection === -1 && basePos === 0) ||
      (aDirection === +1 && basePos === tabs.length - 1)) {
    return;
  }

  let top, last;

  // closing from the last tab
  if (aDirection === -1) {
    top = 0;
    last = basePos - 1;
  }
  else {
    top = basePos + 1;
    last = tabs.length - 1;
  }

  for (let i = last; i >= top ; i--) {
    removeTab(tabs[i], {safeBlock: true});
  }
}

function closeReadTabs() {
  // excluding pinned tabs
  let tabs = getTabs('active');

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
 *
 * @param aStatement {string} keywords divided by ',' to include
 *   'pinned': pinned tabs
 *   'active': tabs of the current active group (exclude pinned tabs)
 * @param aForcedTab {Element} [optional]
 *   forces to include this tab regardless of aStatement
 * @return {Array}
 *
 * TODO: |aForcedTab| is used only for a closing tab on |TabClose| event. make
 * a smart handling
 */
function getTabs(aStatement, aForcedTab) {
  let statement = StatementParser(aStatement, ',');
  let pinned = !!statement.matchKey(['pinned']),
      active = !!statement.matchKey(['active']);

  return Array.filter(gBrowser.tabs, (tab) => {
    if (tab === aForcedTab) {
      return true;
    }

    if (tab.closing) {
      return false;
    }

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

function htmlEscape(aString) {
  return aString.
    replace(/&/g, '&amp;'). // must escape at first
    replace(/>/g, '&gt;').
    replace(/</g, '&lt;').
    replace(/"/g, '&quot;').
    replace(/'/g, '&apos;');
}

function htmlUnescape(aString) {
  return aString.
    replace(/&gt;/g, '>').
    replace(/&lt;/g, '<').
    replace(/&quot;/g, '"').
    replace(/&apos;/g, "'").
    replace(/&amp;/g, '&'); // must unescape at last
}

function fetchPageTitle(aURL, aCallback) {
  let uri = makeURI(aURL);

  if (!uri) {
    aCallback(aURL);
  }

  const {PlacesUtils} = getModule('resource://gre/modules/PlacesUtils.jsm');

  PlacesUtils.promisePlaceInfo(uri).then(
    function onFulfill(aPlaceInfo) {
      aCallback(aPlaceInfo.title || aURL);
    },
    function onReject(aReason) {
      aCallback(aURL);
    }
  ).then(null, Cu.reportError);
}

function makeURI(aURL) {
  try {
    // @see chrome://global/content/contentAreaUtils.js::makeURI
    return window.makeURI(aURL);
  }
  catch (ex) {}

  return null;
}

/**
 * Creates a statement parser
 *
 * @param aStatement {string}
 * @param aDelimiter {string}
 * @param aSupportedStatements {array} [optional]
 * @return {hash}
 *   @member matchKey {function}
 *
 * @note used in getFamilyTab(), getTabs()
 */
function StatementParser(aStatement, aDelimiter, aSupportedStatements) {
  let mKeys;

  init();

  function init() {
    let delimiterRE = (aDelimiter === ' ') ?
      RegExp('\\s+', 'g') :
      RegExp('\\s*\\' + aDelimiter + '\\s*', 'g');

    let statement = aStatement.trim().replace(delimiterRE, aDelimiter);

    if (aSupportedStatements &&
        aSupportedStatements.indexOf(statement) < 0) {
      throw Error('unsupported aStatement');
    }

    mKeys = statement.split(aDelimiter);
  }

  function matchKey(aSortOfKeys) {
    for (let i = 0; i < aSortOfKeys.length; i++) {
      if (mKeys.indexOf(aSortOfKeys[i]) > -1) {
        return aSortOfKeys[i];
      }
    }
    return null;
  }

  return {
    matchKey: matchKey
  };
}

/**
 * Patches for the system default
 */
function modifySystemSetting() {
  const {get, set} = Prefs;
  const prefs = [
    // @pref disable the custom positioning and focusing of tab
    {key: 'browser.tabs.insertRelatedAfterCurrent', value: false},
    {key: 'browser.tabs.selectOwnerOnClose', value: false},
    // @pref disable loading of the background tabs in restoring startup
    {key: 'browser.sessionstore.restore_on_demand', value: true},
    {key: 'browser.sessionstore.restore_pinned_tabs_on_demand', value: true}
  ];

  prefs.forEach((pref) => {
    let value = get(pref.key);

    if (value !== pref.value) {
      set(pref.key, pref.value);
    }
  });
}

/**
 * Customizes the tab tooltip
 *
 * TODO: consider to combine the customizations of tab tooltip into one
 * @see |AllTabs::customizeTabTooltip|
 */
function customizeTabTooltip() {
  // @see chrome://browser/content/tabbrowser.xml::createTooltip
  addEvent(
    window.document.getElementById('tabbrowser-tab-tooltip'),
    'popupshowing',
    onPopup,
    false
  );

  function onPopup(aEvent) {
    aEvent.stopPropagation();

    let tab = window.document.tooltipNode;

    if (tab.localName !== 'tab' || tab.mOverCloseButton) {
      return;
    }

    // WORKAROUND: the tooltip is delayed-shown after a tab under a cursor is
    // removed (e.g. clicking the middle button of mouse on the tab). so, this
    // tooltip is useless
    if (!tab.linkedBrowser) {
      return;
    }

    let tooltip = aEvent.target;
    // add the information of the parent tab to a tab which is newly opened
    if (!tab.linkedBrowser.canGoBack && mReferrer.exists(tab)) {
      // the document title is fetched by async history API
      mReferrer.fetchTitle(tab, (aTitle) => {
        let label = tooltip.label + '\n\nFrom: ' + aTitle;

        tooltip.setAttribute('label', label);
      });
    }
  }
}

/**
 * Entry point
 */
function TabEx_init() {
  modifySystemSetting();
  customizeTabTooltip();

  mTabOpener.init();
  mTabEvent.init();
  mSessionStore.init();
}

TabEx_init();

/**
 * Export
 */
return {
  tabState: mTab.stateTest,
  referrer: mReferrer,
  selectOpenerTab: selectOpenerTab,
  selectPrevSelectedTab: selectPrevSelectedTab,
  closeLeftTabs: closeLeftTabs,
  closeRightTabs: closeRightTabs,
  closeReadTabs: closeReadTabs
};


})(this);
