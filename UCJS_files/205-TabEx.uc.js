// ==UserScript==
// @name TabEx.uc.js
// @description Extends tabs function.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @note Some functions are exported (window.ucjsTabEx.XXX).

// @note Some about:config preferences are changed (see @pref). 
// @note A native function |gBrowser.addTab| is modified (see @modified).

// @note The custom attributes of tabs are saved in the session store file.
// @see |SessionStore.persistTabAttribute|


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
  OPENINFO: 'ucjs_TabEx_openInfo',
  OPENTIME: 'ucjs_TabEx_openTime',
  SELECTTIME: 'ucjs_TabEx_selectTime',
  READTIME: 'ucjs_TabEx_readTime',
  ANCESTORS: 'ucjs_TabEx_ancestors',
  SUSPENDED: 'ucjs_TabEx_suspended',
  READ: 'ucjs_TabEx_read',
  RESTORING: 'ucjs_TabEx_restoring'
};

/**
 * Custom event type.
 */
const kEventType = {
  TabOpen: 'ucjs_TabEx_TabOpen',
  LoadedBrowserOpen: 'ucjs_TabEx_LoadedBrowserOpen'
};

/**
 * Positions for a new tab or tab selection.
 *
 * @note Set to |kPref.OPENPOS_*| and |kPref.SELECTPOS_*|.
 */
const kPosType = {
  // Follows Firefox default behavior.
  DEFAULT: 1,

  // At the first position.
  FIRST_END: 2,

  // At the last position.
  LAST_END: 3,

  // At the previous adjacent.
  // @note No match if no previous tab for |SELECTPOS|.
  PREV_ADJACENT: 4,

  // At the next adjacent.
  // @note No match if no next tab for |SELECTPOS|.
  NEXT_ADJACENT: 5,

  /**
   * Only for |OPENPOS|.
   */

  // After the far end tab of the sequential followings that are descendants of
  // the base tab from its next adjacent, or at the next adjacent.
  // @note The family relation is kept even if the base tab changes its
  // location.
  NEXT_INCREMENT_DESCENDANT: 6,

  /**
   * Only for |SELECTPOS|.
   */

  // The previous adjacent tab that is an ancestor of the closed tab.
  // @note May be no match.
  PREV_ADJACENT_ANCESTOR: 7,

  // The next adjacent tab that is a descendant of the closed tab or is a
  // sibling (has the same parent of the closed tab) or his descendant.
  // @note May be no match.
  NEXT_ADJACENT_EXTENDED_DESCENDANT: 8,

  // The parent tab of the closed tab.
  // @note May be no match.
  ANYWHERE_OPENER: 9,

  // Tab that has been selected most recently before the closed tab.
  // @note May be no match.
  ANYWHERE_PREV_SELECTED: 10,

  // The oldest opened tab of unread tabs.
  // @note May be no match
  ANYWHERE_OLDEST_UNREAD: 11
};

/**
 * Preference
 */
const kPref = {
  // Where a new tab is opened to.
  //
  // @value {kPosType}
  // @note The count of positioning starts from the first *unpinned* tab.
  // @note |OPENPOS_LINKED| works when the tab is opened by a link or |addTab|
  // with |relatedToCurrent| option, otherwise |OPENPOS_UNLINKED| works.
  OPENPOS_LINKED:    kPosType.NEXT_INCREMENT_DESCENDANT,
  OPENPOS_UNLINKED:  kPosType.LAST_END,

  // @note |DEFAULT| opens a tab at the last position.
  OPENPOS_DUPLICATE: kPosType.NEXT_ADJACENT,
  // @note |DEFAULT| reopens a tab at the same position where it closed.
  OPENPOS_UNDOCLOSE: kPosType.DEFAULT,

  // Which tab is selected after the *selected* tab is closed.
  //
  // @value {kPosType[]}
  // @note The Firefox default selection works if no matches (may be the same
  // as |PREV_ADJACENT|).
  SELECTPOS_TABCLOSE: [
    kPosType.NEXT_ADJACENT_EXTENDED_DESCENDANT,
    kPosType.PREV_ADJACENT_ANCESTOR,
    kPosType.ANYWHERE_OPENER,
    kPosType.ANYWHERE_PREV_SELECTED,
    kPosType.FIRST_END
  ],
  // For closing of a selected pinned tab.
  SELECTPOS_PINNEDTABCLOSE: [
    kPosType.PREV_ADJACENT
  ],

  // Delayed-stops the loading of a tab that is opened in background.
  //
  // @value {boolean}
  //   true: Stops the loading of the tab after |SUSPEND_DELAY| passes.
  //   false: The same as the native behavior for a background tab.
  SUSPEND_LOADING: true,

  // The delay time until the loading is suspended.
  //
  // @value {integer} [millisecond]
  //   0: Try to stop loading immediately.
  //   @note It may take time because our processing works after the native
  //   process for a background tab.
  SUSPEND_DELAY: 0,

  // Auto-reloads the suspended tab in the next adjacent of a selected tab.
  //
  // @value {boolean}
  SUSPEND_NEXTTAB_RELOAD: false,

  // The delay time until it considers that "a user has read it" after the tab
  // is selected and loaded completely.
  //
  // @value {integer} [millisecond]
  // @note The marking is canceled when the other tab is selected in a short
  // time (e.g. while flipping tabs with a shortcut key or mouse wheeling).
  SELECTED_DELAY: 1000
};

/**
 * Makes a unique value with the current time.
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
 * Tab data manager.
 */
const TabData = (function () {
  /**
   * Prepares information for handling a tab data.
   *
   * @param aKey {string}
   *   A reserved key that corresponds to a data.
   * @return {}
   *   name: ID for the key (kID.XXX).
   *   type: The data type for the key. Supported only 'boolean' for now.
   *   getter: A converter from a string in order to get a data.
   *   setter: A converter to a string in order to set a data.
   */
  function getInfo(aKey) {
    let getInt = (value) => parseInt(value, 10);

    let name, type, getter, setter;

    switch (aKey) {
      case 'openInfo': // {hash}
        name = kID.OPENINFO;
        getter = (value) => JSON.parse(htmlUnescape(value));
        setter = (value) => htmlEscape(JSON.stringify(value));
        break;

      case 'openTime': // {integer}
        name = kID.OPENTIME;
        getter = getInt;
        break;

      case 'selectTime': // {integer}
        name = kID.SELECTTIME;
        getter = getInt;
        break;

      case 'readTime': // {integer}
        name = kID.READTIME;
        getter = getInt;
        break;

      case 'ancestors': // {integer[]}
        name = kID.ANCESTORS;
        getter = (value) => value.split(' ').map(getInt);
        setter = (value) => value.join(' ');
        break;

      case 'suspended': // {boolean}
        name = kID.SUSPENDED;
        type = 'boolean';
        break;

      case 'read': // {boolean}
        name = kID.READ;
        type = 'boolean';
        break;

      case 'restoring': // {boolean}
        name = kID.RESTORING;
        type = 'boolean';
        break;

      default:
        throw Error('unknown aKey of tab data');
    }

    return {
      name: name,
      type: type,
      getter: getter,
      setter: setter
    };
  }

  /**
   * Gets a tab data.
   *
   * @param aTab {Element}
   * @param aKey {string}
   *   A reserved key corresponding to a data.
   * @return {}
   *   Returns true/false for the data is boolean. For the other value, returns
   *   the requested data if exists, null otherwise.
   */
  function get(aTab, aKey) {
    let {name, type, getter} = getInfo(aKey);

    let has = aTab.hasAttribute(name);

    if (type === 'boolean') {
      return has;
    }

    if (has) {
      let value = aTab.getAttribute(name);

      return getter ? getter(value) : value;
    }

    return null;
  }

  /**
   * Sets or Removes a tab data.
   *
   * @param aTab {Element}
   * @param aKey {string}
   *   A reserved key corresponding to a data.
   * @param aValue {}
   *   A data that is set for the key of the tab.
   *   Set null in order to *remove* a data.
   */
  function set(aTab, aKey, aValue) {
    let {name, setter} = getInfo(aKey);

    // Remove a data.
    if (aValue === null) {
      if (aTab.hasAttribute(name)) {
        aTab.removeAttribute(name);
      }

      return;
    }

    // Set a data.
    let value = setter ? setter(aValue) : aValue;

    aTab.setAttribute(name, value);
  }

  /**
   * Retrieves the data of a closed tab from the session store.
   *
   * @param aClosedTabData {hash}
   *   A parsed JSON of a closed tab.
   * @param aKey {string}
   *   A reserved key corresponding to a data.
   * @return {}
   *
   * @note |aKey| is the same as the keys of |data|. But only the keys used in
   * this script file is supported.
   */
  function getSS(aClosedTabData, aKey) {
    switch (aKey) {
      case 'openTime':
      case 'selectTime': {
        // @note The info for these keys has always getter.
        let {name, getter} = getInfo(aKey);

        return getter(aClosedTabData.state.attributes[name]);
      }
    }

    throw Error('unsupported aKey of a closed tab data');
  }

  /**
   * Exported members of |ucjsTabEx| in the global scope.
   */
  const state = {
    /**
     * Gets the data of a tab.
     *
     * @param aTab {Element}
     * @param aKey {string}
     * @return {}
     * @see |data|
     */
    getData: function(aTab, aKey) {
      return get(aTab, aKey);
    },

    /**
     * Tests whether a user read a tab.
     *
     * @param aTab {Element}
     * @return {boolean}
     */
    isRead: function(aTab) {
      return get(aTab, 'read');
    },

    /**
     * Tests whether the loading of a tab is suspended.
     *
     * @param aTab {Element}
     * @return {boolean}
     */
    isSuspended: function(aTab) {
      return get(aTab, 'suspended');
    }
  };

  return {
    get: get,
    set: set,
    getSS: getSS,
    state: state
  };
})();

/**
 * Tab opening handler
 */
const TabOpener = {
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
      if (SessionStore.isRestoring) {
        TabData.set(newTab, 'restoring', true);

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

      let openInfo;

      if (!aURI || aURI === 'about:blank') {
        openInfo = {
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
            fromVisit = testHTTP(aURI) && Referrer.getFromVisit(aURI);
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
        openInfo = {
          URL: aURI,
          flags: flags,
          referrerURL: aReferrerURI || undefined,
          charset: aCharset || undefined,
          relatedToCurrent: aRelatedToCurrent || undefined,
          fromVisit: fromVisit || undefined
        };
      }

      TabData.set(newTab, 'openInfo', openInfo);

      let event = document.createEvent('Events');

      event.initEvent(kEventType.TabOpen, true, false);
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
        let openInfo = {
          URL: URL,
          flags: Ci.nsIWebNavigation.LOAD_FLAGS_NONE
        };

        TabData.set(aTab, 'openInfo', openInfo);
        break;
      }

      case 'NewTab':
        if (Referrer.isRelatedToCurrent(aTab)) {
          // inherit the ancestors so that the opener tab becomes the parent
          let parent = gBrowser.selectedTab;
          let open = TabData.get(parent, 'openTime');
          let ancs = TabData.get(parent, 'ancestors') || [];

          TabData.set(aTab, 'ancestors', [open].concat(ancs));
        }
        break;

      case 'DuplicatedTab': {
        // this duplicated tab has the same data of its original tab
        // renew the ancestors so that the original tab becomes the parent
        let open = TabData.get(aTab, 'openTime');
        let ancs = TabData.get(aTab, 'ancestors') || [];

        TabData.set(aTab, 'ancestors', [open].concat(ancs));
        break;
      }
    }

    TabData.set(aTab, 'openTime', getTime());
  }
};

/**
 * Tab referrer handler
 */
const Referrer = {
  getURL: function(aTab) {
    let openInfo = TabData.get(aTab, 'openInfo');

    if (!openInfo) {
      return null;
    }

    let {referrerURL, fromVisit} = openInfo;

    return referrerURL || fromVisit;
  },

  fetchInfo: function(aTab, aCallback) {
    let URL = this.getURL(aTab);

    // the document title is fetched by async history API
    fetchPageTitle(URL, (aTitle) => {
      aCallback({
        title: aTitle,
        URL: URL
      });
    });
  },

  exists: function(aTab) {
    return !!this.getURL(aTab);
  },

  isRelatedToCurrent: function(aTab) {
    let openInfo = TabData.get(aTab, 'openInfo');

    if (!openInfo) {
      return null;
    }

    let {referrerURL, relatedToCurrent, fromVisit} = openInfo;

    return !!(referrerURL || (relatedToCurrent && fromVisit));
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
const TabSelector = {
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
      TabData.set(aTab, 'selectTime', null);
      TabData.set(aTab, 'readTime', null);
      TabData.set(aTab, 'read', null);
      return;
    }

    let time = getTime();

    TabData.set(aTab, 'selectTime', time);

    if (read || !TabData.get(aTab, 'read')) {
      TabData.set(aTab, 'readTime', time);
      TabData.set(aTab, 'read', true);
    }

    this.prevSelectedTime = this.currentSelectedTime;
    this.currentSelectedTime = time;
  }
};

/**
 * Handler of suspending the loading of a tab
 */
const TabSuspender = {
  timers: {},

  set: function(aTab, aDelay) {
    let timer = setTimeout((tab) => {
      this.stop(tab);
    }, aDelay, aTab);

    // the opened time of a tab is a unique value
    this.timers[TabData.get(aTab, 'openTime')] = timer;
  },

  clear: function(aTab) {
    let id = aTab && TabData.get(aTab, 'openTime');
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
        TabData.set(aTab, 'suspended', true);
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
        !TabData.get(aTab, 'suspended')) {
      return;
    }

    TabData.set(aTab, 'suspended', null);

    let [browser, loadingURL, openInfo] = this.getBrowserForTab(aTab);

    if (loadingURL) {
      let loadPage;

      if (openInfo) {
        // TODO: handle the POST data
        loadPage = () => browser.loadURIWithFlags(
          loadingURL,
          openInfo.flags,
          makeURI(openInfo.referrerURL) || null,
          openInfo.charset || null,
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
    let openInfo;

    // TODO: use a proper method of detection whether a tab newly opens or not
    let isNewTab = !browser.canGoBack;

    if (isNewTab) {
      openInfo = TabData.get(aTab, 'openInfo');
    }

    // 1.a new tab has no |openInfo| when it bypassed our hooked
    // |gBrowser.addTab|
    // 2.|userTypedValue| holds the URL of a document till it successfully
    // loads
    if (openInfo && openInfo.URL !== 'about:blank') {
      loadingURL = openInfo.URL;
    }
    else {
      loadingURL = browser.userTypedValue;
    }

    return [browser, loadingURL, openInfo];
  }
};

/**
 * Session store handler
 */
const SessionStore = {
  // Whether a duplicated or undo-closed tab is in restoring.
  isRestoring: false,

  init: function() {
    this.SS = Cc['@mozilla.org/browser/sessionstore;1'].
      getService(Ci.nsISessionStore);

    addEvent(window, 'SSWindowStateBusy', () => {
      this.isRestoring = true;
    }, false);

    addEvent(window, 'SSWindowStateReady', () => {
      this.isRestoring = false;
    }, false);
  },

  persistTabAttribute: function() {
    let savedAttributes = [
      kID.OPENINFO,
      kID.OPENTIME,
      kID.SELECTTIME,
      kID.READTIME,
      kID.ANCESTORS
    ];

    savedAttributes.forEach((key) => {
      this.SS.persistTabAttribute(key);
    });
  },

  getClosedTabList: function() {
    if (this.SS.getClosedTabCount(window) > 0) {
      return JSON.parse(this.SS.getClosedTabData(window));
    }
    return null;
  }
};

/**
 * Startup handler
 */
const Startup = {
  init: function() {
    /**
     * Execute processing just after all tabs open at startup.
     *
     * TODO: Use a reliable observer.
     * @note 'browser-delayed-startup-finished' was already fired on this
     * timing so that we can't catch it.
     *
     * For the first window;
     * 1.On boot startup: Observe |DOMContentLoaded| that fires on the document
     * first selected.
     * 2.On resume startup: Observe |SSTabRestored| that fires on the tab first
     * selected.
     *
     * For sub windows that the current window opens;
     * 3.With |DOMContentLoaded|: Catch in case 1.
     * 4.Without any catchable event: Observe new window opened and dispatch
     * a custom event for it. (e.g. a window by |window.openDialog| with a tab
     * node in arguments has no loading tab.)
     */
    const LoadEvents = {
      add: function(aTarget, aType) {
        if (!this.events) {
          this.events = new Map();
        }

        this.events.set(aTarget, aType);

        aTarget.addEventListener(aType, this, false);
      },

      clear: function() {
        for (let [target, type] of this.events) {
          target.removeEventListener(type, this, false);
        }

        this.events.clear();
        delete this.events;
      },

      handleEvent: function (aEvent) {
        this.clear();

        Startup.setStartupTabs();
        SessionStore.persistTabAttribute();
      }
    };

    let isResumeStartup =
      Cc['@mozilla.org/browser/sessionstartup;1'].
      getService(Ci.nsISessionStartup).
      doRestore();

    if (isResumeStartup) {
      LoadEvents.add(gBrowser.tabContainer, 'SSTabRestored');
    }
    else {
      LoadEvents.add(window, 'DOMContentLoaded');
    }

    // Observe new sub window without any loading.
    LoadEvents.add(gBrowser, kEventType.LoadedBrowserOpen);

    let onBrowserOpen = (aSubject) => {
      if (!aSubject.gBrowser.mIsBusy) {
        // Ensure that the new browser can catch the event at startup.
        // TODO: Use a reliable observer instead of waiting.
        setTimeout(() => {
          let event = new CustomEvent(kEventType.LoadedBrowserOpen);

          aSubject.gBrowser.dispatchEvent(event);

          // Update some states for the selected tab, notify onLocationChange,
          // correct the URL bar, etc.
          // TODO: I don't know how to update them properly. Watch side effects
          // by using this function.
          aSubject.gBrowser.updateCurrentBrowser(true);
        }, 500);
      }
    };

    let topic = 'browser-delayed-startup-finished';

    Services.obs.addObserver(onBrowserOpen, topic, false);

    addEvent(window, 'unload', () => {
      Services.obs.removeObserver(onBrowserOpen, topic);
    }, false);
  },

  setStartupTabs: function() {
    // Scan all tabs (including hidden tabs).
    Array.forEach(gBrowser.tabs, (tab) => {
      // A boot startup tab (e.g. homepage).
      if (!TabData.get(tab, 'openInfo')) {
        TabOpener.set(tab, 'StartupTab');
      }

      if (tab.selected) {
        // Update |select|, and set |read| if first selected.
        TabSelector.update(tab);
      }
      else {
        // Immediately stop the loading of a background tab.
        TabSuspender.stop(tab);
      }
    });
  }
};

/**
 * Observer of moving tab between windows
 */
const JumpTabObserver = {
  init: function() {
    // Observe a tab that moves to the other window.
    // @see chrome://browser/content/tabbrowser.xml::_swapBrowserDocShells
    addEvent(gBrowser, 'SwapDocShells', this, false);

    // Observe a tab that moves to a newly opened window.
    // @see chrome://browser/content/tabbrowser.xml::replaceTabWithWindow
    addEvent(gBrowser.tabContainer, 'TabBecomingWindow', this, false);
  },

  handleEvent: function(aEvent) {
    switch (aEvent.type) {
      case 'SwapDocShells': {
        let browser = aEvent.originalTarget;
        let originalBrowser = aEvent.detail;

        let originalTabbrowser =
          originalBrowser.ownerDocument.defaultView.gBrowser;

        if (!originalTabbrowser) {
          return;
        }

        let tab = gBrowser._getTabForBrowser(browser);
        let originalTab =
          originalTabbrowser._getTabForBrowser(originalBrowser);

        if (!originalTab) {
          return;
        }

        this.TabState.renew(tab, originalTab);

        break;
      }

      case 'TabBecomingWindow': {
        let tab = aEvent.originalTarget;

        // Save the tab state since this original tab will be removed by the
        // native process after a new browser opens.
        this.TabState.save(tab);

        let topic = 'browser-delayed-startup-finished';

        let onBrowserOpen = (aSubject) => {
          Services.obs.removeObserver(onBrowserOpen, topic);

          this.TabState.renew(aSubject.gBrowser.selectedTab);
        };

        Services.obs.addObserver(onBrowserOpen, topic, false)

        break;
      }
    }
  },

  TabState: {
    save: function(aTab) {
      this.state = {
        openInfo: TabData.get(aTab, 'openInfo'),
        suspended: TabData.get(aTab, 'suspended')
      };
    },

    renew: function(aTab, aOriginalTab) {
      if (aOriginalTab) {
        this.save(aOriginalTab);
      }

      // Copy the original open info.
      // @note Other states are created for a new tab.
      TabData.set(aTab, 'openInfo', this.state.openInfo);

      // Set a flag to load the suspended tab.
      if (this.state.suspended) {
        TabData.set(aTab, 'suspended', true);
      }

      delete this.state;
    }
  }
};

/**
 * Tab event handler
 */
const TabEvent = {
  init: function() {
    let tc = gBrowser.tabContainer;

    addEvent(tc, kEventType.TabOpen, this, false);
    addEvent(tc, 'TabSelect', this, false);
    addEvent(tc, 'TabClose', this, false);
    addEvent(tc, 'SSTabRestored', this, false);
  },

  handleEvent: function(aEvent) {
    let tab = aEvent.originalTarget;

    switch (aEvent.type) {
      case kEventType.TabOpen:
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
    TabOpener.set(aTab, 'NewTab');

    if (kPref.SUSPEND_LOADING) {
      TabSuspender.set(aTab, kPref.SUSPEND_DELAY);
    }

    let openPos =
      Referrer.isRelatedToCurrent(aTab) ?
      kPref.OPENPOS_LINKED :
      kPref.OPENPOS_UNLINKED;

    moveTabTo(aTab, openPos);
  },

  onTabSelect: function(aTab) {
    // 1.do not pass a duplicated/undo-closed tab. handle it in
    // |onSSTabRestored|
    // 2.pass a startup restored tab
    if (TabData.get(aTab, 'restoring')) {
      return;
    }

    TabSelector.set(aTab);

    if (kPref.SUSPEND_LOADING) {
      TabSuspender.reload(aTab);
    }

    if (kPref.SUSPEND_NEXTTAB_RELOAD) {
      let nextTab = getAdjacentTab(aTab, +1);

      if (nextTab) {
        TabSuspender.reload(nextTab);
      }
    }
  },

  onTabClose: function(aTab) {
    if (kPref.SUSPEND_LOADING) {
      TabSuspender.clear(aTab);
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
    if (!TabData.get(aTab, 'restoring')) {
      return;
    }

    TabData.set(aTab, 'restoring', null);

    let openPos, baseTab;

    let originalTab = getOriginalTabOfDuplicated(aTab);

    if (originalTab) {
      // @note a duplicated tab has the same data as its original tab and we
      // update some data to be as a new opened tab

      // update |open| and |ancestors|
      TabOpener.set(aTab, 'DuplicatedTab');

      if (aTab.selected) {
        // force to update |read|
        TabSelector.update(aTab, {read: true});
      }
      else {
        // remove |select| and |read|
        TabSelector.update(aTab, {reset: true});
      }

      openPos = kPref.OPENPOS_DUPLICATE;
      baseTab = originalTab;
    }
    else {
      // @note an undoclosed tab has the restored data
      // @note |window.undoCloseTab| opens a tab and forcibly selects it

      // update |select|, and set |read| if first selected
      TabSelector.update(aTab);

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
 * Utility functions for handle tabs.
 */
function getOriginalTabOfDuplicated(aTab) {
  let openTime = TabData.get(aTab, 'openTime');

  let tabs = getTabs('active, pinned');

  for (let i = 0, l = tabs.length, tab; i < l; i++) {
    tab = tabs[i];

    if (tab !== aTab &&
        TabData.get(tab, 'openTime') === openTime) {
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
    // |gBrowser.moveTabTo| expects the actual position in all tabs.
    let actualPos = getTabPos(getTabs('all'), tabs[pos]);

    gBrowser.moveTabTo(aTab, actualPos);
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
  baseId = TabData.get(aBaseTab, 'openTime');
  baseAncs = TabData.get(aBaseTab, 'ancestors');

  if (family === 'ancestor') {
    // useless when no ancestors is examined
    if (!baseAncs) {
      return null;
    }

    isRelated = function(tab) {
      let id = TabData.get(tab, 'openTime');
      // 1.this tab is an ancestor of the base tab
      return baseAncs.indexOf(id) > -1;
    };
  }
  else /* family === 'descendant' */ {
    isRelated = function(tab) {
      let ancs = TabData.get(tab, 'ancestors');

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

  let ancs = TabData.get(baseTab, 'ancestors');

  // no ancestor then no parent
  if (!ancs) {
    if (undoClose) {
      // has referrer (e.g. opened from bookmark)
      // @note a tab that has no opener tab is independent. so its referred URL
      // should be newly opened even if it exists in the current tabs
      let referrerURL = Referrer.getURL(baseTab);

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
    if (TabData.get(tabs[i], 'openTime') === parent) {
      return tabs[i];
    }
  }

  // search in the closed tabs
  if (undoClose) {
    let undoList = SessionStore.getClosedTabList();

    if (undoList) {
      for (let i = 0, l = undoList.length; i < l; i++) {
        if (TabData.getSS(undoList[i], 'openTime') === parent) {
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
  let prevSelectedTime = TabSelector.prevSelectedTime;
  let pos = -1;

  for (let i = 0, l = tabs.length, tab; i < l; i++) {
    tab = tabs[i];

    if (tab === baseTab) {
      continue;
    }

    time = TabData.get(tab, 'selectTime');

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
    let undoList = SessionStore.getClosedTabList();

    if (undoList) {
      for (let i = 0, l = undoList.length; i < l; i++) {
        if (TabData.getSS(undoList[i], 'selectTime') === prevSelectedTime) {
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

    if (TabData.get(tab, 'read')) {
      continue;
    }

    time = TabData.get(tab, 'openTime');

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

    if (TabData.get(tab, 'read')) {
      removeTab(tab, {safeBlock: true});
    }
  }
}

/**
 * Gets an array of tabs.
 *
 * @param aStatement {string}
 *   Keywords divided by ',' to include;
 *   'all': All tabs.
 *   'pinned': Pinned tabs.
 *   'active': Visible normal tabs (excluding pinned tabs).
 * @param aEssentialTab {Element} [optional]
 *   Forces to include this tab regardless of |aStatement|.
 * @return {array}
 *
 * @note |aEssentialTab| is used only for a closing tab on |TabClose| event.
 */
function getTabs(aStatement, aEssentialTab) {
  let statement = StatementParser(aStatement, ',');
  let all =  !!statement.matchKey(['all']),
      pinned = !!statement.matchKey(['pinned']),
      active = !!statement.matchKey(['active']);

  if (all) {
    return Array.from(gBrowser.tabs);
  }

  return Array.filter(gBrowser.tabs, (tab) => {
    if (aEssentialTab && tab === aEssentialTab) {
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
  return aTabs.indexOf(aTab);
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

/**
 * Helper functions
 */
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
 *   @key matchKey {function}
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
 * Entry point
 */
function TabEx_init() {
  modifySystemSetting();

  TabOpener.init();
  TabEvent.init();
  SessionStore.init();
  Startup.init();
  JumpTabObserver.init();
}

TabEx_init();

/**
 * Export
 */
return {
  tabState: TabData.state,
  referrer: Referrer,
  selectOpenerTab: selectOpenerTab,
  selectPrevSelectedTab: selectPrevSelectedTab,
  closeLeftTabs: closeLeftTabs,
  closeRightTabs: closeRightTabs,
  closeReadTabs: closeReadTabs
};


})(this);
