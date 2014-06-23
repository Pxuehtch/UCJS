// ==UserScript==
// @name        UI.uc.js
// @description Helpers for user interface of the main browser
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @require [optional] TabEx.uc.js
// @note some default functions are modified. see @modified
// @usage access to items through the global property;
// |window.ucjsUI.XXX|


const ucjsUI = (function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  Timer: {
    setImmediate
  },
  getNodeById: $ID,
  getNodeByAnonid: $ANONID,
  getNodesByXPath: $X,
  addEvent,
  setChromeStyleSheet: setCSS,
  promisePlacesDBResult
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('UI.uc.js', aMsg);
}

/**
 * Content area
 */
const mContentArea = (function() {
  let getContextMenu = () => $ID('contentAreaContextMenu');

  let contextMenu = createPopupMenuHandler(getContextMenu);

  return {
    contextMenu: contextMenu
  };
})();

/**
 * URL bar
 *
 * @see chrome://browser/content/urlbarBindings.xml
 */
const mURLBar = (function() {
  let getTextBox = () => $ANONID('textbox-input-box', gURLBar);
  let getContextMenu = () => $ANONID('input-box-contextmenu', getTextBox());

  // UI customization resets the context menu of the URL bar to Fx default
  // value. so, observe it to fix user settings for the context menu
  let contextMenu = createPopupMenuHandler(getContextMenu, {
    observeUICustomization: true
  });

  return {
    contextMenu: contextMenu
  };
})();

/**
 * Find bar
 *
 * @see chrome://global/content/bindings/findbar.xml
 */
const mFindBar = {
  get textBox() {
    return gFindBar.getElement('findbar-textbox');
  },

  get highlightButton() {
    return gFindBar.getElement('highlight');
  },

  get text() {
    return this.textBox.value;
  },

  set text(aValue) {
    aValue =  aValue || '';

    if (this.text !== aValue) {
      this.textBox.value = aValue;
    }

    if (!gFindBar.hidden) {
      this.textBox.focus();
      this.textBox.select();
    }
  },

  toggleFindbar: function() {
    if (gFindBar.hidden) {
      gFindBar.onFindCommand();
    }
    else {
      gFindBar.close();
    }
  },

  toggleHighlight: function(aHighlight) {
    gFindBar.toggleHighlight(aHighlight);

    if (aHighlight) {
      this.highlightButton.setAttribute('checked', 'true');
    }
    else {
      this.highlightButton.removeAttribute('checked');
    }
  },

  findWith: function(aText, aOption) {
    if (!aText) {
      return;
    }

    let {
      doHighlight
    } = aOption || {};

    if (this.text) {
      this.clearText();
    }

    gFindBar.onFindCommand();
    this.text = aText;
    gFindBar.onFindAgainCommand();

    if (doHighlight) {
      this.toggleHighlight(true);
    }
  },

  clearText: function() {
    this.text = '';

    if (this.highlightButton.checked) {
      this.toggleHighlight(false);
    }
  }
};

/**
 * Status bar
 */
const mStatusField = (function() {
  // @see chrome://browser/content/browser.js::XULBrowserWindow
  const {XULBrowserWindow} = window;

  const kStatusAttribute = {
    LINKSTATE: 'ucjs_ui_statusField_linkstate',
    MESSAGE: 'ucjs_ui_statusField_message'
  };

  // @see http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
  const kTimeFormat = '%Y/%m/%d %H:%M:%S';
  const kLinkFormat = '%url% [%time%]';

  let getTextBox = () => XULBrowserWindow.statusTextField;

  /**
   * Show a message text
   */
  let messageStatus = '';

  function showMessage(aText) {
    let text = aText || '';

    if (text === messageStatus) {
      return;
    }

    const {MESSAGE} = kStatusAttribute;
    let textField = getTextBox();

    messageStatus = text;

    // overwrite the displayed status
    textField.label = text;

    // restore the hidden status
    if (!text) {
      XULBrowserWindow.statusText = '';
      XULBrowserWindow.updateStatusField();
    }

    if (text) {
      if (!textField.hasAttribute(MESSAGE)) {
        textField.setAttribute(MESSAGE, true);
      }
    }
    else {
      if (textField.hasAttribute(MESSAGE)) {
        textField.removeAttribute(MESSAGE);
      }
    }
  }

  /**
   * Handler of the state of a link under a cursor
   */
  const OverLink = (function() {
    let disableSetOverLink = false;
    let lastOverLinkURL;

    /**
     * Toggle the showing
     */
    function toggle(aShouldShow) {
      if (!aShouldShow) {
        // clear the former state
        XULBrowserWindow.setOverLink('', null);
      }

      disableSetOverLink = !aShouldShow;
    }

    /**
     * Patches the native function
     *
     * @modified chrome://browser/content/browser.js::XULBrowserWindow::setOverLink
     */
    const $setOverLink = XULBrowserWindow.setOverLink;

    XULBrowserWindow.setOverLink =
    function ucjsUI_StatusField_setOverLink(url, anchorElt) {
      if (disableSetOverLink) {
        return;
      }

      // WORKAROUND: sometimes |setOverLink| is called on mouseover event (e.g.
      // on history/bookmark sidebar), so we discard redundant callings
      if (lastOverLinkURL === url) {
        return;
      }
      lastOverLinkURL = url;

      // clear the message to hide it after the cursor leaves
      showMessage('');

      Task.spawn(function*() {
        // |newURL| can be updated with its visited date
        let {linkState, newURL} = yield examineLinkURL(url, anchorElt);

        // this task was not completed while over link
        if (lastOverLinkURL !== url) {
          return;
        }

        const {LINKSTATE} = kStatusAttribute;
        let textField = getTextBox();

        if (linkState) {
          if (textField.getAttribute(LINKSTATE) !== linkState) {
            textField.setAttribute(LINKSTATE, linkState);
          }
        }
        else {
          if (textField.hasAttribute(LINKSTATE)) {
            textField.removeAttribute(LINKSTATE);
          }
        }

        // disable the delayed showing while over link
        this.hideOverLinkImmediately = true;

        // @note use |call| for the updated |newURL|
        $setOverLink.call(this, newURL, anchorElt);

        // restore the delayed showing
        this.hideOverLinkImmediately = false;

      // make |this| to refer to |window.XULBrowserWindow|
      }.bind(this)).
      then(null, Cu.reportError);
    };

    /**
     * Gets the bookmarked or visited state of a link URL, and update the URL
     * with the visited date
     *
     * @param aURL {string}
     * @param aAnchorElt {Element}
     * @return {Promise}
     *   @resolved {hash}
     *     newURL: {string}
     *     linkState: {string}
     *
     * @note called from a task in |ucjsUI_StatusField_setOverLink|
     */
    function examineLinkURL(aURL, aAnchorElt) {
      return Task.spawn(function*() {
        if (!aURL) {
          return {
            newURL: '',
            linkState: null
          };
        }

        // query the Places DB with the raw URL of a link in the content area
        // so that we can get the proper result
        let originalURL = (aAnchorElt && aAnchorElt.href) || aURL;
        let newURL = aURL;
        let linkState = 'unknown';

        // visited check
        let visitedDate = yield getVisitedDate(originalURL);

        if (visitedDate) {
          // convert microseconds into milliseconds
          let time = (new Date(visitedDate / 1000)).
            toLocaleFormat(kTimeFormat);

          // update the URL with the visited date
          newURL = kLinkFormat.
            replace('%url%', newURL).replace('%time%', time);

          linkState = 'visited';
        }

        // bookmarked check
        let bookmarked = yield checkBookmarked(originalURL);

        if (bookmarked) {
          linkState = 'bookmarked';
        }

        return {
          newURL: newURL,
          linkState: linkState
        };
      });
    }

    function getVisitedDate(aURL) {
      // don't query a URL which cannot be recorded about its visit date in the
      // places DB
      if (!/^(?:https?|ftp|file):/.test(aURL)) {
        return Promise.resolve(null);
      }

      let SQLExp = [
        "SELECT h.visit_date",
        "FROM moz_historyvisits h",
        "JOIN moz_places p ON p.id = h.place_id",
        "WHERE p.url = :url",
        "ORDER BY h.visit_date DESC",
        "LIMIT 1"
      ].join(' ');

      return promisePlacesDBResult({
        expression: SQLExp,
        params: {'url': aURL},
        columns: ['visit_date']
      }).
      // resolved with the date or null
      // @note we ordered a single row
      then((aRows) => aRows ? aRows[0].visit_date : null);
    }

    function checkBookmarked(aURL) {
      let SQLExp = [
        "SELECT b.id",
        "FROM moz_bookmarks b",
        "JOIN moz_places p ON p.id = b.fk",
        "WHERE p.url = :url",
        "LIMIT 1"
      ].join(' ');

      return promisePlacesDBResult({
        expression: SQLExp,
        params: {'url': aURL},
        columns: ['id']
      }).
      // resolved with bookmarked or not
      then((aRows) => !!aRows);
    }

    /**
     * Patches the native function
     *
     * @modified chrome://browser/content/browser.js::XULBrowserWindow::updateStatusField
     */
    const $updateStatusField = XULBrowserWindow.updateStatusField;

    XULBrowserWindow.updateStatusField =
    function ucjsUI_StatusField_updateStatusField() {
      // suppress the others while a message is shown
      if (messageStatus) {
        return;
      }

      $updateStatusField.apply(this, arguments);
    };

    /**
     * Register the appearance
     */
    registerCSS();

    function registerCSS() {
      const css = '\
        .statuspanel-label{\
          font-weight:bolder!important;\
        }\
        statuspanel:not([%%kStatusAttribute.LINKSTATE%%]) label{\
          color:brown!important;\
        }\
        statuspanel[%%kStatusAttribute.LINKSTATE%%="bookmarked"] label{\
          color:green!important;\
        }\
        statuspanel[%%kStatusAttribute.LINKSTATE%%="visited"] label{\
          color:purple!important;\
        }\
        statuspanel[%%kStatusAttribute.LINKSTATE%%="unknown"] label{\
          color:red!important;\
        }\
        statuspanel[%%kStatusAttribute.MESSAGE%%] label{\
          color:blue!important;\
        }\
        statuspanel[inactive],\
        statuspanel[label=""]{\
          visibility:collapse!important;\
        }\
      ';

      setCSS(css.replace(/%%(.+?)%%/g, ($0, $1) => eval($1)));
    }

    // Expose
    return {
      toggle: toggle
    };
  })();

  /**
   * Expose
   */
  return {
    message: showMessage,
    setOverLink: OverLink.toggle
  };
})();

/**
 * Menuitems of a popup menu
 *
 * @require TabEx.uc.js
 */
const mMenuitem = {
  setStateForUnreadTab: function(aMenuitem, aTab) {
    const kATTR_UNREADTAB = 'ucjs_ui_menuitem_unreadTab';

    if (window.ucjsTabEx) {
      // @note we check the *read* state of a tab and then set the *unread*
      // attribute of a menuitem
      if (window.ucjsTabEx.tabState.read(aTab)) {
        aMenuitem.classList.remove(kATTR_UNREADTAB);
      }
      else {
        aMenuitem.classList.add(kATTR_UNREADTAB);
      }
    }
  }
};

/**
 * Creates PopupMenu handler
 *
 * @param aPopupMenuGetter {function}
 *   a function to get the <popupmenu> element
 *   @see |EventManager|
 * @param aOption {hash}
 *   @key observeUICustomization {boolean}
 *     whether observe UI customization to restore user settings
 *     @see |EventManager|
 * @return {hash}
 *   @member get {function}
 *   @member register {function}
 */
function createPopupMenuHandler(aPopupMenuGetter, aOption) {
  let eventManager = EventManager(aPopupMenuGetter, aOption);

  eventManager.register({
    events: [
      ['popupshowing', manageMenuSeparators, false]
    ]
  });

  return {
    get: aPopupMenuGetter,
    register: eventManager.register
  };
}

/**
 * Manages the visibility of menu separators in a popup menu
 *
 * @param aEvent {Event}
 *
 * @note 'popupshowing' event should be attached to the <menupopup> element
 */
function manageMenuSeparators(aEvent) {
  let popupMenu = aEvent.currentTarget;

  if (aEvent.target !== popupMenu) {
    return;
  }

  let separators = $X('xul:menuseparator', popupMenu, {
    ordered: true,
    toArray: true
  });

  setImmediate(manage, separators);

  function manage(aSeparators) {
    let last = null;

    aSeparators.forEach((separator) => {
      if (separator.hidden) {
        separator.hidden = false;
      }

      if (!shouldShow(separator, 'previousSibling')) {
        separator.hidden = true;
      }
      else {
        last = separator;
      }
    });

    if (last && !shouldShow(last, 'nextSibling')) {
      last.hidden = true;
    }
  }

  function shouldShow(aSeparator, aSibling) {
    // @see chrome://browser/content/utilityOverlay.js::isElementVisible()
    const isElementVisible = window.isElementVisible;

    let node = aSeparator;

    do {
      node = node[aSibling];
    } while (node && !isElementVisible(node));

    return node && node.localName !== 'menuseparator';
  }
}

/**
 * Event manager
 *
 * @param aTargetGetter {function}
 *   a function to get the target node
 *   @note it is not the node itself to update it when cleanup and rebuild
 * @param aOption {hash}
 *   @key observeUICustomization {boolean}
 *     if UI customization breaks user settings to the target, set true to
 *     observe UI customization to restore user settings
 *     @note used only to the context menu of the URL bar for now
 * @return {hash}
 *   @member register {function}
 */
function EventManager(aTargetGetter, aOption) {
  const {observeUICustomization} = aOption || {};

  let setTarget = () => aTargetGetter();

  let mTarget;
  let mEventData = [];
  let mOnCreateHandlers = [];
  let mOnDestroyHandlers = [];

  init();

  function init() {
    create();

    // restore user settings after UI customization
    if (observeUICustomization) {
      addEvent(window, 'beforecustomization', destroy, false);
      addEvent(window, 'aftercustomization', create, false);
    }

    // cleanup at shutdown of the main browser
    addEvent(window, 'unload', uninit, false);
  }

  function uninit() {
    destroy();

    mTarget = null;
    mEventData = null;
    mOnCreateHandlers = null;
    mOnDestroyHandlers = null;
  }

  function create() {
    // update the reference
    mTarget = setTarget();

    manageEvents(true);
    manageHandlers(true);
  }

  function destroy() {
    manageEvents(false);
    manageHandlers(false);
  }

  function manageEvents(aDoCreate) {
    let method = aDoCreate ? 'addEventListener' : 'removeEventListener';

    mEventData.forEach(([type, listener, capture]) => {
      mTarget[method](type, listener, capture);
    });
  }

  function manageHandlers(aDoCreate) {
    let handlers = aDoCreate ? mOnCreateHandlers : mOnDestroyHandlers;

    handlers.forEach((handler) => {
      handler(mTarget);
    });
  }

  /**
   * Registers event handlers and functions
   *
   * @param {hash}
   *   @key events {array}
   *     array of array [type, listener, capture] for event handler
   *     @note the handlers are attached when the target is initialized, and
   *     detached when the target is cleaned up
   *   @key onCreate {function}
   *     a function called once when the target is initialized. the target is
   *     passed as an argument
   *   @key onDestroy {function}
   *     a function called once when the target is cleaned up. the target is
   *     passed as an argument
   *
   * @note the registered event to the target will be detached automatically.
   * if you attach an event to descendant element of the target, you should do
   * |removeEventListener| to it in |onDestroy| function. so it is recommended
   * to attach all events to the target and observe the descendants by event
   * delegation
   */
  function register({events, onCreate, onDestroy}) {
    if (events) {
      events.forEach(([type, listener, capture]) => {
        mEventData.push([type, listener, !!capture]);

        mTarget.addEventListener(type, listener, capture);
      });
    }

    if (onCreate) {
      mOnCreateHandlers.push(onCreate);

      onCreate(mTarget);
    }

    if (onDestroy) {
      mOnDestroyHandlers.push(onDestroy);
    }
  }

  return {
    register: register
  };
}

/**
 * Exports
 */
return {
  ContentArea: mContentArea,
  URLBar: mURLBar,
  FindBar: mFindBar,
  StatusField: mStatusField,
  Menuitem: mMenuitem
};


})(this);
