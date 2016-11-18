// ==UserScript==
// @name TabEx.uc.js
// @description Extends tabs function.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @note Some functions are exported (window.ucjsTabEx.XXX).

// @note Some about:config preferences are changed (see @prefs).
// @note Some native functions are modified (see @modified).

// @note The custom attributes of tabs are saved in the session store file.
// @see |SessionStore.persistTabAttribute|


window.ucjsTabEx = (function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  Listeners: {
    $event
  },
  TabUtils,
  PlacesUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

// Extract usual functions.
const {
  Timer: {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  }
} = Modules;

/**
 * Key name for storing data.
 */
const kDataKey = {
  /**
   * The persisted attribute name of <tab>.
   * @see |SessionStore.persistTabAttribute|
   */
  openInfo: 'ucjs_TabEx_openInfo',
  openTime: 'ucjs_TabEx_openTime',
  selectTime: 'ucjs_TabEx_selectTime',
  readTime: 'ucjs_TabEx_readTime',
  ancestors: 'ucjs_TabEx_ancestors',

  /**
   * Temporary state of <tab>.
   */
  suspended: 'ucjs_TabEx_suspended',
  read: 'ucjs_TabEx_read',
  startup: 'ucjs_TabEx_startup',

  /**
   * The property name of <browser> for moving tab between windows.
   * @see |MovingTabObserver|
   */
  tabData: 'ucjs_TabEx_tabData'
};

/**
 * The names for the custom notifications.
 */
const kNotificationName = {
  TabOpenInfoSet: 'ucjs_TabEx_TabOpenInfoSet',
  TabBecomingWindow: 'ucjs_TabEx_TabBecomingWindow'
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
  // @note No matches if no previous tab for |SELECTPOS|.
  PREV_ADJACENT: 4,

  // At the next adjacent.
  // @note No matches if no next tab for |SELECTPOS|.
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
  // @note May be no matches.
  PREV_ADJACENT_ANCESTOR: 7,

  // The next adjacent tab that is a descendant of the closed tab or is a
  // sibling (has the same parent of the closed tab) or his descendant.
  // @note May be no matches.
  NEXT_ADJACENT_EXTENDED_DESCENDANT: 8,

  // The parent tab of the closed tab.
  // @note May be no matches.
  ANYWHERE_OPENER: 9,

  // Tab that has been selected most recently before the closed tab.
  // @note May be no matches.
  ANYWHERE_PREV_SELECTED: 10,

  // The oldest opened tab of unread tabs.
  // @note May be no matches.
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
  // @note The marking is cancelled when the other tab is selected in a short
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
   *   name: The ID name for the key (kDataKey.XXX).
   *   type: The data type for the key. Supported only 'boolean' for now.
   *   getter: A converter from a string in order to get a data.
   *   setter: A converter to a string in order to set a data.
   */
  function getInfo(aKey) {
    let getInt = (value) => parseInt(value, 10);

    let name, type, getter, setter;

    switch (aKey) {
      case 'openInfo': // {hash}
        name = kDataKey.openInfo;
        getter = (value) => JSON.parse(htmlUnescape(value));
        setter = (value) => htmlEscape(JSON.stringify(value));
        break;

      case 'openTime': // {integer}
        name = kDataKey.openTime;
        getter = getInt;
        break;

      case 'selectTime': // {integer}
        name = kDataKey.selectTime;
        getter = getInt;
        break;

      case 'readTime': // {integer}
        name = kDataKey.readTime;
        getter = getInt;
        break;

      case 'ancestors': // {integer[]}
        name = kDataKey.ancestors;
        getter = (value) => value.split(' ').map(getInt);
        setter = (value) => value.join(' ');
        break;

      case 'suspended': // {boolean}
        name = kDataKey.suspended;
        type = 'boolean';
        break;

      case 'read': // {boolean}
        name = kDataKey.read;
        type = 'boolean';
        break;

      case 'startup': // {boolean}
        name = kDataKey.startup;
        type = 'boolean';
        break;

      default:
        throw Error('unknown aKey of tab data');
    }

    return {
      name,
      type,
      getter,
      setter
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
   * Removes a tab data.
   *
   * @param aTab {Element}
   * @param aKey {string}
   *   A reserved key corresponding to a data.
   */
  function remove(aTab, aKey) {
    set(aTab, aKey, null);
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
    getData(aTab, aKey) {
      return get(aTab, aKey);
    },

    /**
     * Tests whether a user read a tab.
     *
     * @param aTab {Element}
     * @return {boolean}
     */
    isRead(aTab) {
      return get(aTab, 'read');
    },

    /**
     * Tests whether the loading of a tab is suspended.
     *
     * @param aTab {Element}
     * @return {boolean}
     */
    isSuspended(aTab) {
      return get(aTab, 'suspended');
    }
  };

  return {
    get,
    set,
    remove,
    getSS,
    state
  };
})();

/**
 * Tab opening handler.
 */
const TabOpener = {
  init() {
    // Patch the native function.
    // @modified chrome://browser/content/tabbrowser.xml::addTab
    const $addTab = gBrowser.addTab;

    gBrowser.addTab = function ucjsTabEx_addTab(...aParams) {
      let newTab = $addTab.apply(this, aParams);

      // Set 'openInfo' data of a tab.
      // @note This dispatches the custom event 'TabOpenInfoSet' and then the
      // other tab data will be newly set.
      setOpenInfo(newTab, aParams);

      return newTab;
    };

    function setOpenInfo(aTab, aParams) {
      Task.spawn(function*() {
        let aURI, // {string}
            aReferrerURI, // {nsIURI}
            aCharset,
            aAllowThirdPartyFixup,
            aRelatedToCurrent,
            aFromExternal,
            aAllowMixedContent;

        if (aParams.length === 2 &&
            typeof aParams[1] === 'object' &&
            !(aParams[1] instanceof Ci.nsIURI)) {
          aURI                  = aParams[0];
          aReferrerURI          = aParams[1].referrerURI;
          aCharset              = aParams[1].charset;
          aAllowThirdPartyFixup = aParams[1].allowThirdPartyFixup;
          aRelatedToCurrent     = aParams[1].relatedToCurrent;
          aFromExternal         = aParams[1].fromExternal;
          aAllowMixedContent    = aParams[1].allowMixedContent;
        }
        else {
          aURI                  = aParams[0];
          aReferrerURI          = aParams[1];
          aCharset              = aParams[2];
          // aParams[3]: the POST data.
          // aParams[4]: the owner tab.
          aAllowThirdPartyFixup = aParams[5];
        }

        let openInfo;

        if (!aURI || aURI === 'about:blank') {
          openInfo = {
            url: 'about:blank',
            flags: Ci.nsIWebNavigation.LOAD_FLAGS_NONE
          };
        }
        else {
          // Convert |nsIURI| into a URL string.
          aReferrerURI = aReferrerURI && aReferrerURI.spec;

          let fromVisit;

          if (!aReferrerURI) {
            let testHTTP = (value) => /^https?:/.test(value);

            if (aRelatedToCurrent) {
              let currentURL = gBrowser.currentURI.spec;

              if (testHTTP(currentURL)) {
                fromVisit = currentURL;
              }
            }
            else {
              if (testHTTP(aURI)) {
                fromVisit = yield Referrer.promiseFromVisit(aURI);
              }
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

          if (aAllowMixedContent) {
            flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_MIXED_CONTENT;
          }

          // @note Set |undefined| not to record a falsy value.
          // TODO: Handle the POST data.
          openInfo = {
            url: aURI,
            flags,
            referrerURL: aReferrerURI || undefined,
            charset: aCharset || undefined,
            relatedToCurrent: aRelatedToCurrent || undefined,
            fromVisit: fromVisit || undefined
          };
        }

        TabData.set(aTab, 'openInfo', openInfo);

        let event = new CustomEvent(kNotificationName.TabOpenInfoSet, {
          // @note Listen the event on |gBrowser.tabContainer|.
          // @see |TabEvent::init|
          bubbles: true
        });

        aTab.dispatchEvent(event);
      }).
      catch(Cu.reportError);
    }
  },

  set(aTab, aType) {
    switch (aType) {
      case 'StartupTab': {
        let browser = gBrowser.getBrowserForTab(aTab);
        // @note |userTypedValue| holds the URL of a document till it
        // successfully loads.
        let url = browser.userTypedValue || browser.currentURI.spec;
        let openInfo = {
          url,
          flags: Ci.nsIWebNavigation.LOAD_FLAGS_NONE
        };

        TabData.set(aTab, 'openInfo', openInfo);

        break;
      }

      case 'NewTab': {
        if (Referrer.isRelatedToCurrent(aTab)) {
          // Inherit the ancestors so that the opener tab becomes the parent.
          let parent = gBrowser.selectedTab;
          let open = TabData.get(parent, 'openTime');
          let ancs = TabData.get(parent, 'ancestors') || [];

          TabData.set(aTab, 'ancestors', [open].concat(ancs));
        }

        break;
      }

      case 'DuplicatedTab': {
        // This duplicated tab has the same data of its original tab.
        // Renew the ancestors so that the original tab becomes the parent.
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
 * Tab referrer handler.
 */
const Referrer = {
  getURL(aTab) {
    let openInfo = TabData.get(aTab, 'openInfo');

    if (!openInfo) {
      return null;
    }

    let {referrerURL, fromVisit} = openInfo;

    return referrerURL || fromVisit;
  },

  promiseInfo(tab) {
    let url = this.getURL(tab);

    // The document title is fetched by async history API.
    return promisePageTitle(url).then((title) => {
      return {
        title,
        url
      };
    });
  },

  exists(aTab) {
    return !!this.getURL(aTab);
  },

  isRelatedToCurrent(aTab) {
    let openInfo = TabData.get(aTab, 'openInfo');

    if (!openInfo) {
      return null;
    }

    let {referrerURL, relatedToCurrent, fromVisit} = openInfo;

    return !!(referrerURL || (relatedToCurrent && fromVisit));
  },

  promiseFromVisit(aURL) {
    if (!aURL) {
      // Resolved with |null| as no data available.
      return Promise.resolve(null);
    }

    let sql = [
      "SELECT p1.url",
      "FROM moz_places p1",
      "JOIN moz_historyvisits h1 ON h1.place_id = p1.id",
      "JOIN moz_historyvisits h2 ON h2.from_visit = h1.id",
      "JOIN moz_places p2 ON p2.id = h2.place_id",
      "WHERE p2.url = :url",
      "ORDER BY h1.visit_date DESC",
      "LIMIT 1"
    ].join(' ');

    return PlacesUtils.promisePlacesDBResult({
      sql,
      parameters: {'url': aURL},
      columns: ['url']
    }).
    // Resolved with the URL, or null if no data.
    // @note We ordered a single row.
    then((aRows) => aRows ? aRows[0].url : null);
  }
};

/**
 * Tab selecting handler.
 */
const TabSelector = {
  prevSelectedTime: 0,
  currentSelectedTime: 0,

  set(aTab) {
    // TODO: Clear the interval timer in the proper way.
    // The timer is cleared every |onTabSelect| for now. This is on the premise
    // that the other tab is *surely* selected after the tab is closed.
    this.clear();

    // Repeatly observes a tab until its document completely loads while the
    // tab is selected.
    this.timer = setInterval((tab) => {
      this.select(tab);
    }, kPref.SELECTED_DELAY, aTab);
  },

  clear() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  select(aTab) {
    // A tab in loading yet.
    if (aTab && aTab.hasAttribute('busy')) {
      return;
    }

    this.clear();

    // Cancel the working when the tab is removed or deselected while the timer
    // is waiting.
    if (!aTab || !aTab.selected) {
      return;
    }

    this.update(aTab);
  },

  update(aTab, aOption = {}) {
    let {reset, read} = aOption;

    if (reset) {
      TabData.remove(aTab, 'selectTime');
      TabData.remove(aTab, 'readTime');
      TabData.remove(aTab, 'read');

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
 * Handler of suspending the loading of a tab.
 */
const TabSuspender = {
  timers: {},

  set(aTab, aDelay) {
    // WORKAROUND: Too small delay can't stop the native loading.
    if (aDelay < 100) {
      aDelay = 100;
    }

    let timer = setTimeout((tab) => {
      this.stop(tab);
    }, aDelay, aTab);

    // The opened time of a tab is a unique value.
    this.timers[TabData.get(aTab, 'openTime')] = timer;
  },

  clear(aTab) {
    let id = aTab && TabData.get(aTab, 'openTime');
    let timer = id && this.timers[id];

    if (timer) {
      clearTimeout(timer);

      // Delete the property that is not used anymore.
      delete this.timers[id];
    }
  },

  stop(aTab) {
    this.clear(aTab);

    // Cancel suspending the tab when is removed or selected while the timer
    // is waiting.
    if (!aTab || aTab.selected) {
      return;
    }

    let [browser, loadingURL] = this.getBrowserForTab(aTab);

    if (loadingURL) {
      // A document in loading.
      let isBusy = aTab.hasAttribute('busy');

      let isBlank =
        browser.currentURI.spec === 'about:blank' ||
        // Handle as a blank page when the native 'tabs on demand' works on
        // resume startup.
        (aTab.hasAttribute('pending') && isBusy);

      if (isBusy || isBlank) {
        TabData.set(aTab, 'suspended', true);
      }

      if (isBusy) {
        browser.stop();
      }

      if (isBlank) {
        promisePageTitle(loadingURL).then((title) => {
          aTab.label = title;
        }).
        catch(Cu.reportError);
      }
    }
  },

  reload(aTab) {
    this.clear(aTab);

    // Pass only the visible and suspended tab.
    if (!aTab || aTab.hidden || aTab.closing ||
        !TabData.get(aTab, 'suspended')) {
      return;
    }

    TabData.remove(aTab, 'suspended');

    let [browser, loadingURL, openInfo] = this.getBrowserForTab(aTab);

    if (loadingURL) {
      let loadPage;

      if (openInfo) {
        // TODO: Handle the POST data.
        browser.loadURIWithFlags(
          loadingURL,
          openInfo.flags,
          makeURI(openInfo.referrerURL) || null,
          openInfo.charset || null,
          null // POST data.
        );
      }
      else {
        browser.loadURI(loadingURL);
      }
    }
  },

  getBrowserForTab(aTab) {
    let browser = gBrowser.getBrowserForTab(aTab);
    let loadingURL;
    let openInfo;

    // TODO: Use a proper method of detection whether a tab newly opens or not.
    let isNewTab = !browser.canGoBack;

    if (isNewTab) {
      openInfo = TabData.get(aTab, 'openInfo');
    }

    // 1.A new tab has no |openInfo| when it bypassed our hooked
    //   |gBrowser.addTab|.
    // 2.|userTypedValue| holds the URL of a document till it successfully
    //   loads.
    if (openInfo && openInfo.url !== 'about:blank') {
      loadingURL = openInfo.url;
    }
    else {
      loadingURL = browser.userTypedValue;
    }

    return [browser, loadingURL, openInfo];
  }
};

/**
 * Session store handler.
 */
const SessionStore = {
  persistTabAttribute() {
    let savedAttributes = [
      kDataKey.openInfo,
      kDataKey.openTime,
      kDataKey.selectTime,
      kDataKey.readTime,
      kDataKey.ancestors
    ];

    savedAttributes.forEach((key) => {
      Modules.SessionStore.persistTabAttribute(key);
    });
  },

  getClosedTabList() {
    if (Modules.SessionStore.getClosedTabCount(window) > 0) {
      return JSON.parse(Modules.SessionStore.getClosedTabData(window));
    }

    return null;
  }
};

/**
 * Startup handler.
 */
const Startup = {
  init() {
    /**
     * Wait the initialization for startup.
     *
     * @note |SessionStore.promiseInitialized| resolves after
     * 'sessionstore-state-finalized' and 'browser-delayed-startup-finished'
     * have finished.
     * WORKAROUND: I want to execute my startup processing after all tabs are
     * loaded. I'm not sure that it has done so wait a moment just in case.
     * TODO: Observe a reliable notification, or no need to wait?
     */
    Modules.SessionStore.promiseInitialized.then(() => {
      setTimeout(() => {
        Startup.setStartupTabs();
        SessionStore.persistTabAttribute();
      }, 1000);
    });
  },

  setStartupTabs() {
    // Scan all tabs (including hidden tabs).
    [...gBrowser.tabs].forEach((tab) => {
      TabData.set(tab, 'startup', true)

      // A boot startup tab (e.g. homepage).
      if (!TabData.get(tab, 'openInfo')) {
        TabOpener.set(tab, 'StartupTab');
      }

      if (tab.selected) {
        // Update |select|, and set |read| if first selected.
        TabSelector.update(tab);
      }
      else {
        // Immediately stop loading of background tab.
        TabSuspender.stop(tab);
      }
    });
  }
};

/**
 * Observer of moving tab between windows.
 */
const MovingTabObserver = {
  init() {
    // Observe a tab that moves to the other window.
    // @note The event fires on both our browser and the other browser:
    // 1.|originalTarget| = our browser, |detail| = the other browser.
    // 2.|originalTarget| = the other browser, |detail| = our browser.
    // @see chrome://browser/content/tabbrowser.xml::_swapBrowserDocShells
    $event(gBrowser, 'SwapDocShells', this);

    // Observe a tab that becomes a new window.
    // @note 'SwapDocShells' event fires after 'TabBecomingWindow' event.
    // @note We add this custom event to |gBrowser.replaceTabWithWindow|.
    $event(gBrowser, kNotificationName.TabBecomingWindow, this);

    // Patch the native function.
    // @modified chrome://browser/content/tabbrowser.xml::replaceTabWithWindow
    const $replaceTabWithWindow = gBrowser.replaceTabWithWindow;

    gBrowser.replaceTabWithWindow =
    function ucjsTabEx_replaceTabWithWindow(...aParams) {
      if (this.tabs.length === 1) {
        return null;
      }

      // Dispatch our custom event.
      let event = new CustomEvent(kNotificationName.TabBecomingWindow, {
        detail: {
          tab: aParams[0]
        }
      });

      gBrowser.dispatchEvent(event);

      return $replaceTabWithWindow.apply(this, aParams);
    };
  },

  handleEvent(aEvent) {
    switch (aEvent.type) {
      case 'SwapDocShells': {
        let originalBrowser = aEvent.originalTarget;
        let newBrowser = aEvent.detail;

        let originalTab = this.getTabFor(originalBrowser);
        let newTab = this.getTabFor(newBrowser);

        // When our window (A) with one tab is replaced into a tab of the other
        // window (B), |newBrowser| of the event on (B) is attached to the
        // closing (A) and the tab has been removed.
        if (!newTab) {
          return;
        }

        // Retrieve the tab data that is saved on 'TabBecomingWindow' event.
        let originalData = originalBrowser[kDataKey.tabData];

        if (originalData) {
          // Delete the temporary property that is not used anymore.
          delete originalBrowser[kDataKey.tabData];
        }
        else {
          // Ignore the event on the other browser.
          if (TabData.get(newTab, 'openTime') <
              TabData.get(originalTab, 'openTime')) {
            return;
          }

          originalData = this.getTabData(originalTab);
        }

        // Restore the original open info.
        // @note The other data have been created for a new tab.
        TabData.set(newTab, 'openInfo', originalData.openInfo);

        // Set a flag to load the suspended tab.
        if (originalData.suspended) {
          TabData.set(newTab, 'suspended', true);
        }

        break;
      }

      case kNotificationName.TabBecomingWindow: {
        let originalTab = aEvent.detail.tab;

        // Evacuate the tab data into our browser. We can refer to it on
        // 'SwapDocShells' event that fires after a new browser opens. At that
        // point our original tab is removed but the browser still remains.
        // @see chrome://browser/content/browser.js::_delayedStartup
        // @see chrome://browser/content/tabbrowser.xml::swapBrowsersAndCloseOther
        let originalBrowser = gBrowser.getBrowserForTab(originalTab);

        originalBrowser[kDataKey.tabData] = this.getTabData(originalTab);

        break;
      }
    }
  },

  getTabFor(aBrowser) {
    let tabBrowser = aBrowser.getTabBrowser();

    if (tabBrowser) {
      return tabBrowser.getTabForBrowser(aBrowser);
    }

    return null;
  },

  getTabData(aTab) {
    return {
      openInfo: TabData.get(aTab, 'openInfo'),
      suspended: TabData.get(aTab, 'suspended')
    };
  }
};

/**
 * Tab event handler.
 */
const TabEvent = {
  init() {
    let tc = gBrowser.tabContainer;

    $event(tc, kNotificationName.TabOpenInfoSet, this);
    $event(tc, 'TabSelect', this);
    $event(tc, 'TabClose', this);
    $event(tc, 'SSTabRestored', this);
  },

  handleEvent(aEvent) {
    let tab = aEvent.originalTarget;

    switch (aEvent.type) {
      case kNotificationName.TabOpenInfoSet:
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

  onTabOpen(aTab) {
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

  onTabSelect(aTab) {
    // TODO: Don't pass an undoclosed or a duplicated tab because reloadings
    // for them are unwanted and the select info of them will be updated on
    // |onSSTabRestored|.
    // XXX: How can I know that this tab is undoclosed or duplicated?

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

  onTabClose(aTab) {
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

  onSSTabRestored(aTab) {
    // 1.Pass a duplicated or an undoclosed tab only.
    // 2.Do not pass a startup tab because of no relocation needed.
    if (TabData.get(aTab, 'startup')) {
      TabData.remove(aTab, 'startup');

      return;
    }

    let openPos, baseTab;

    let originalTab = getOriginalTabOfDuplicated(aTab);

    if (originalTab) {
      // @note A duplicated tab has the same data as its original tab and we
      // update some data to be as a new opened tab.

      // Update |open| and |ancestors|.
      TabOpener.set(aTab, 'DuplicatedTab');

      if (aTab.selected) {
        // Force to update |read|.
        TabSelector.update(aTab, {read: true});
      }
      else {
        // Remove |select| and |read|.
        TabSelector.update(aTab, {reset: true});
      }

      openPos = kPref.OPENPOS_DUPLICATE;
      baseTab = originalTab;
    }
    else {
      // @note An undoclosed tab has the restored data.
      // @note |window.undoCloseTab| opens a tab and forcibly selects it.

      // Update |select|, and set |read| if first selected.
      TabSelector.update(aTab);

      openPos = kPref.OPENPOS_UNDOCLOSE;

      // Sets the previous selected tab to the base tab for moving this tab.
      // @note The previous selected tab surely exists because it was selected
      // then this undoclosed tab has been opened and selected.
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

  // Excluding pinned tabs.
  let tabs = getTabs('active');
  let tabsNum = tabs.length;

  // Returns -1 for a pinned or closing tab.
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

    // Never reached, but avoid lint warning.
    return true;
  });
}

/**
 * Retrieves a family tab of the base tab in the active tabs.
 *
 * @param aBaseTab {Element}
 * @param aStatement {string}
 *   @note Keywords divided by ' '.
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
   * Finds the tab that meets the statement.
   */

  // Excluding pinned tabs, including the base tab.
  activeTabs = getTabs('active', aBaseTab);

  /**
   * Sets the starting position to examine.
   */

  // Returns -1 when the base tab is pinned or closing.
  startPos = getTabPos(activeTabs, aBaseTab);

  // Useless when no adjacent tab is in the direction.
  // @note |startPos| is always 0 when the base tab is pinned and the state has
  // 'next'.
  if ((direction === 'prev' && --startPos < 0) ||
      (direction === 'next' && ++startPos > activeTabs.length - 1)) {
    return null;
  }

  /**
   * Sets the comparator function.
   */

  baseId = TabData.get(aBaseTab, 'openTime');
  baseAncs = TabData.get(aBaseTab, 'ancestors');

  if (family === 'ancestor') {
    // Useless when no ancestors is examined.
    if (!baseAncs) {
      return null;
    }

    isRelated = function(tab) {
      let id = TabData.get(tab, 'openTime');

      // 1.This tab is an ancestor of the base tab.
      return baseAncs.includes(id);
    };
  }
  else /* family === 'descendant' */ {
    isRelated = function(tab) {
      let ancs = TabData.get(tab, 'ancestors');

      // This tab that has no ancestors does not related with the base tab.
      if (!ancs) {
        return false;
      }

      // 1.This tab is a descendant of the base tab.
      // 2.The parent of the base tab is an ancestor of this tab (sibling or
      //   its descendant).
      return ancs.includes(baseId) ||
        (extended && baseAncs && ancs.includes(baseAncs[0]));
    };
  }

  /**
   * Ready to examine.
   */

  relatedPos = -1;

  if (position === 'adjacent') {
    // Get the adjacent one.
    if (isRelated(activeTabs[startPos])) {
      relatedPos = startPos;
    }
  }
  else /* position === 'farthest' */ {
    // Get the farthest one of a sequence of tabs.
    // @note No implementation for the unsupported 'prev farthest'.
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

function getOpenerTab(aBaseTab, aOption = {}) {
  let {undoClose} = aOption;

  let baseTab = aBaseTab || gBrowser.selectedTab;

  let ancs = TabData.get(baseTab, 'ancestors');

  // No ancestor and no parent.
  if (!ancs) {
    if (undoClose) {
      // The referrer exists (e.g. opened from bookmark).
      // @note A tab that has no opener tab is independent. so its referred URL
      // should be newly opened even if it exists in the current tabs.
      let referrerURL = Referrer.getURL(baseTab);

      if (referrerURL) {
        // TODO: Opens in foreground or background?
        return TabUtils.openTab(referrerURL);
      }
    }

    return null;
  }

  // The parent exists.
  let parent = ancs[0];

  // Including the base tab.
  let tabs = getTabs('active, pinned', baseTab);

  // Search in the current tabs.
  for (let i = 0, l = tabs.length; i < l; i++) {
    if (TabData.get(tabs[i], 'openTime') === parent) {
      return tabs[i];
    }
  }

  // Search in the closed tabs.
  if (undoClose) {
    let undoList = SessionStore.getClosedTabList();

    if (undoList) {
      for (let i = 0, l = undoList.length; i < l; i++) {
        if (TabData.getSS(undoList[i], 'openTime') === parent) {
          // @see chrome://browser/content/browser.js::undoCloseTab
          // @note |undoCloseTab| opens a tab and forcibly selects it.
          return window.undoCloseTab(i);
        }
      }
    }
  }

  // Not found.
  return null;
}

function selectPrevSelectedTab(aBaseTab, aOption) {
  return selectTab(getPrevSelectedTab(aBaseTab, aOption));
}

function getPrevSelectedTab(aBaseTab, aOption = {}) {
  let {traceBack, undoClose} = aOption;

  let baseTab = aBaseTab || gBrowser.selectedTab;

  // Including the base tab.
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
    // Found regardless of the selected time.
    if (traceBack ||
        recentTime === prevSelectedTime) {
      return tabs[pos];
    }
  }

  // Reopen a previous selected tab.
  if (undoClose) {
    let undoList = SessionStore.getClosedTabList();

    if (undoList) {
      for (let i = 0, l = undoList.length; i < l; i++) {
        if (TabData.getSS(undoList[i], 'selectTime') === prevSelectedTime) {
          // @see chrome://browser/content/browser.js::undoCloseTab
          // @note |undoCloseTab| opens a tab and forcibly selects it.
          return window.undoCloseTab(i);
        }
      }
    }
  }

  // Not found.
  return null;
}

function selectOldestUnreadTab(aOption) {
  return selectTab(getOldestUnreadTab(aOption));
}

function getOldestUnreadTab(aOption = {}) {
  let {includePinned} = aOption;

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

  // Including the base tab.
  let tabs = getTabs('active, pinned', aBaseTab);

  let basePos = getTabPos(tabs, aBaseTab);

  // No tabs in the direction.
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

  // Excluding pinned tabs.
  let tabs = getTabs('active');

  let basePos = getTabPos(tabs, baseTab);

  // 1.The base tab is not active.
  // 2.No tabs in the direction.
  if (basePos < 0 ||
      (aDirection === -1 && basePos === 0) ||
      (aDirection === +1 && basePos === tabs.length - 1)) {
    return;
  }

  let top, last;

  // Closing from the last tab.
  if (aDirection === -1) {
    top = 0;
    last = basePos - 1;
  }
  else {
    top = basePos + 1;
    last = tabs.length - 1;
  }

  for (let i = last; i >= top; i--) {
    TabUtils.removeTab(tabs[i], {safetyLock: true});
  }
}

function closeReadTabs() {
  // Excluding pinned tabs.
  let tabs = getTabs('active');

  // Closing from the last tab.
  for (let i = tabs.length - 1, tab; i >= 0; i--) {
    tab = tabs[i];

    if (TabData.get(tab, 'read')) {
      TabUtils.removeTab(tab, {safetyLock: true});
    }
  }
}

/**
 * Gets an array of tabs.
 *
 * @param aStatement {string}
 *   Keywords divided by ',' to include:
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
  let all = !!statement.matchKey(['all']),
      pinned = !!statement.matchKey(['pinned']),
      active = !!statement.matchKey(['active']);

  if (all) {
    return [...gBrowser.tabs];
  }

  return [...gBrowser.tabs].filter((tab) => {
    if (aEssentialTab && tab === aEssentialTab) {
      return true;
    }

    if (tab.closing) {
      return false;
    }

    return (pinned && tab.pinned) ||
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
 * Helper functions.
 */
function htmlEscape(aString) {
  return aString.
    replace(/&/g, '&amp;'). // Must escape at first.
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
    replace(/&amp;/g, '&'); // Must unescape at last.
}

function promisePageTitle(url) {
  let uri = makeURI(url);

  if (!uri) {
    return Promise.resolve(url);
  }

  return Modules.PlacesUtils.promisePlaceInfo(uri).then(
    function resolve(info) {
      return info.title || url;
    },
    function reject() {
      return url;
    }
  );
}

function makeURI(url) {
  if (!url) {
    return null;
  }

  try {
    return Modules.BrowserUtils.makeURI(url);
  }
  catch (ex) {}

  return null;
}

/**
 * Creates a statement parser.
 *
 * @param aStatement {string}
 * @param aDelimiter {string}
 * @param aSupportedStatements {array} [optional]
 * @return {hash}
 *   @key matchKey {function}
 *
 * @note used in |getFamilyTab()|, |getTabs()|.
 */
function StatementParser(aStatement, aDelimiter, aSupportedStatements) {
  let mKeys;

  // Initialize
  init();

  function init() {
    let delimiterRE = (aDelimiter === ' ') ?
      RegExp('\\s+', 'g') :
      RegExp('\\s*\\' + aDelimiter + '\\s*', 'g');

    let statement = aStatement.trim().replace(delimiterRE, aDelimiter);

    if (aSupportedStatements &&
        !aSupportedStatements.includes(statement)) {
      throw Error('unsupported aStatement');
    }

    mKeys = statement.split(aDelimiter);
  }

  function matchKey(aSortOfKeys) {
    for (let i = 0; i < aSortOfKeys.length; i++) {
      if (mKeys.includes(aSortOfKeys[i])) {
        return aSortOfKeys[i];
      }
    }

    return null;
  }

  return {
    matchKey
  };
}

/**
 * Modifies the native preference values to match with our functions.
 */
function modifyPreference() {
  const kPrefSet = [
    // @prefs Disable the custom positioning and focusing of tab.
    {
      key: 'browser.tabs.insertRelatedAfterCurrent',
      value: false
    },
    {
      key: 'browser.tabs.selectOwnerOnClose',
      value: false
    },

    // @prefs Stop loading of background tabs in resume startup.
    {
      key: 'browser.sessionstore.restore_on_demand',
      value: true
    },
    {
      key: 'browser.sessionstore.restore_pinned_tabs_on_demand',
      value: true
    }
  ];

  kPrefSet.forEach(({key, value}) => {
    if (Modules.Prefs.get(key) !== value) {
      Modules.Prefs.set(key, value);
    }
  });
}

/**
 * Entry point.
 */
function TabEx_init() {
  modifyPreference();

  TabOpener.init();
  TabEvent.init();
  Startup.init();
  MovingTabObserver.init();
}

TabEx_init();

/**
 * Export
 */
return {
  tabState: TabData.state,
  referrer: Referrer,
  selectOpenerTab,
  selectPrevSelectedTab,
  closeLeftTabs,
  closeRightTabs,
  closeReadTabs
};


})(this);
