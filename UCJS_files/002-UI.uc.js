// ==UserScript==
// @name UI.uc.js
// @description Helper modules for UI of the main browser.
// @include main
// ==/UserScript==

// @require Util.uc.js
// @require [optional] TabEx.uc.js

// @usage Access to items through the global property (window.ucjsUI.XXX).

// @note Some native functions are modified (see @modified).


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
  resolveURL,
  setChromeStyleSheet: setCSS,
  promisePlacesDBResult
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('UI.uc.js', aMsg);
}

/**
 * Popup menu handler.
 *
 * @return {hash}
 *   @key init {function}
 */
const PopupMenuHandler = (function() {
  /**
   * Creates a new handler.
   *
   * @param aPopupMenuGetter {function}
   *   A function to get the <popupmenu> element.
   *   @see |HandlerManager|
   * @param aOption {hash}
   *   @key observeUICustomization {boolean}
   *     Whether observe UI customization to restore user settings.
   *     @see |HandlerManager|
   * @return {hash}
   *   @key get {function}
   *   @key register {function}
   */
  function init(aPopupMenuGetter, aOption) {
    let handlerManager = HandlerManager(aPopupMenuGetter, aOption);

    handlerManager.register({
      events: [
        ['popupshowing', manageMenuSeparators, false]
      ]
    });

    return {
      get: aPopupMenuGetter,
      register: handlerManager.register
    };
  }

  /**
   * Manages the visibility of menu separators in a popup menu.
   *
   * @param aEvent {Event}
   *
   * @note Triggered by the 'popupshowing' event of a <menupopup> element.
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
   * Manager of handlers on create/destroy the target popup menu.
   *
   * @param aTargetGetter {function}
   *   A function to get the target popup menu element.
   *   @note It is not the element itself since we should update the reference
   *   to the new target when cleaned up and rebuilt.
   * @param aOption {hash}
   *   @key observeUICustomization {boolean}
   *     If UI customization breaks user settings to the target, set true to
   *     observe UI customization to restore user settings.
   *     @note Used only to the context menu of the URL bar for now.
   * @return {hash}
   *   @key register {function}
   */
  function HandlerManager(aTargetGetter, aOption) {
    const {
      observeUICustomization
    } = aOption || {};

    let setTarget = () => aTargetGetter();

    let mTarget;
    let mEventData = [];
    let mOnCreateHandlers = [];
    let mOnDestroyHandlers = [];

    init();

    function init() {
      create();

      // Restore user settings after UI customization.
      if (observeUICustomization) {
        addEvent(window, 'beforecustomization', destroy, false);
        addEvent(window, 'aftercustomization', create, false);
      }

      // Clean up on shutdown of the main browser.
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
      // Update the reference of the popup menu.
      mTarget = setTarget();

      manageHandlers({
        doCreate: true
      });
    }

    function destroy() {
      manageHandlers({
        doDestroy: true
      });
    }

    /**
     * Creates the parameter of handler.
     *
     * @param {hash}
     *   @key target {Element}
     *     A target element.
     * @return {Element}
     *   The target itself.
     *
     * XXX: Just passed a target itself for now. Should I write
     * |handler(mTarget)| on each calling?
     */
    function HandlerParam({target}) {
      return target;
    }

    function manageHandlers({doCreate}) {
      let method = doCreate ? 'addEventListener' : 'removeEventListener';

      mEventData.forEach(([type, listener, capture]) => {
        mTarget[method](type, listener, capture);
      });

      let handlers = doCreate ? mOnCreateHandlers : mOnDestroyHandlers;

      handlers.forEach((handler) => {
        handler(HandlerParam({
          target: mTarget
        }));
      });
    }

    /**
     * Registers events and handlers
     *
     * @param {hash}
     *   @key events {array}
     *     Array of array [type, listener, capture] for events.
     *     @note The listeners are attached after the target popup menu element
     *     is initialized, and detached before the target is destroyed.
     *   @key onCreate {function}
     *     A function called when the target is initialized.
     *     @note Also applied once when this registration is called.
     *     @param {Element} A target popup menu element.
     *     @see |HandlerParam|
     *   @key onDestroy {function}
     *     A function called when the target is about to be destroyed.
     *     @param {Element} A target popup menu element.
     *     @see |HandlerParam|
     *
     * @note The registered events to the target will be automatically detached
     * on destroy of the target. If you attach some events to the descendant
     * element of the target, you should do |removeEventListener| to it in
     * |onDestroy| function. So it is recommended to attach all events to the
     * target and observe the descendants by event delegation.
     */
    function register({events, onCreate, onDestroy}) {
      if (events) {
        events.forEach(([type, listener, capture]) => {
          mEventData.push([type, listener, !!capture]);

          mTarget.addEventListener(type, listener, capture);
        });
      }

      if (onCreate) {
        // Apply the init handler for the first time.
        onCreate(HandlerParam({
          target: mTarget
        }));

        mOnCreateHandlers.push(onCreate);
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
   * Expose
   */
  return {
    init: init
  };
})();

/**
 * Content area handler.
 */
const ContentArea = (function() {
  let getContextMenu = () => $ID('contentAreaContextMenu');

  let contextMenu = PopupMenuHandler.init(getContextMenu);

  return {
    contextMenu: contextMenu
  };
})();

/**
 * URL bar handler.
 *
 * @see chrome://browser/content/urlbarBindings.xml
 */
const URLBar = (function() {
  let getTextBox = () => $ANONID('textbox-input-box', gURLBar);
  let getContextMenu = () => $ANONID('input-box-contextmenu', getTextBox());

  // The UI customization resets the context menu of the URL bar to Fx default
  // value. So, observe it to fix user settings for the context menu.
  let contextMenu = PopupMenuHandler.init(getContextMenu, {
    observeUICustomization: true
  });

  return {
    contextMenu: contextMenu
  };
})();

/**
 * Find bar handler.
 *
 * @see chrome://global/content/bindings/findbar.xml
 */
const FindBar = (function() {
  /**
   * Fx native UI elements.
   */
  const UI = {
    get textBox() {
      return gFindBar.getElement('findbar-textbox');
    },

    get highlightButton() {
      return gFindBar.getElement('highlight');
    }
  };

  /**
   * Manager of handlers on create/destroy the target findbar.
   *
   * @return {hash}
   *   @key register {function}
   */
  const HandlerManager = (function() {
    let mOnCreateHandlers = [];
    let mOnDestroyHandlers = [];

    let tc = gBrowser.tabContainer;

    addEvent(tc, 'TabFindInitialized', handleEvent, false);
    addEvent(tc, 'TabClose', handleEvent, false);

    function handleEvent(aEvent) {
      let tab = aEvent.target;

      switch (aEvent.type) {
        case 'TabFindInitialized':
          manageHandlers({
            doCreate: true,
            tab: tab
          });
          break;

        case 'TabClose':
          manageHandlers({
            doDestroy: true,
            tab: tab
          });
          break;
      }
    }

    /**
     * Creates the parameter of handler.
     *
     * @param {hash}
     *   @key tab {Element}
     *     A tab element.
     * @return {hash}
     *   @key tab {Element}
     *   @key findBar {Element}
     *     A findbar that is associated with the tab.
     */
    function HandlerParam({tab}) {
      return {
        tab: tab,
        findBar: gBrowser.getFindBar(tab)
      };
    }

    function manageHandlers({doCreate, tab}) {
      let handlers = doCreate ? mOnCreateHandlers : mOnDestroyHandlers;

      handlers.forEach((handler) => {
        handler(HandlerParam({
          tab: tab
        }));
      });
    }

    /**
     * Registers the handlers.
     *
     * @param {hash}
     *   @key onCreate {function}
     *     A function called when the findbar of a tab is initialized.
     *     @note Also applied to findbars that have been already initialized
     *     on this registration is called.
     *     @param {hash}
     *       @key tab {Element} The tab that has the initialized findbar.
     *       @key findBar {Element} The initialized findbar.
     *       @see |HandlerParam|
     *   @key onDestroy {function}
     *     A function called when the findbar is about to be destroyed.
     *     @param {hash}
     *       @key tab {Element}
     *       @key findBar {Element}
     */
    function register(aParam = {}) {
      let {
        onCreate,
        onDestroy
      } = aParam;

      if (onCreate) {
        // Apply the init handler to existing findbars (including hidden tabs).
        Array.forEach(gBrowser.tabs, (tab) => {
          if (gBrowser.isFindBarInitialized(tab)) {
            onCreate(HandlerParam({
              tab: tab
            }));
          }
        });

        mOnCreateHandlers.push(onCreate);
      }

      if (onDestroy) {
        mOnDestroyHandlers.push(onDestroy);
      }
    }

    return {
      register: register
    };
  })();

  /**
   * Handler of a find text string.
   */
  const FindText = {
    get value() {
      return UI.textBox.value;
    },

    set value(aText) {
      aText = aText || '';

      if (this.value !== aText) {
        UI.textBox.value = aText;
      }
    },

    focus: function() {
      if (!gFindBar.hidden) {
        UI.textBox.focus();
        UI.textBox.select();
      }
    }
  };

  function reset() {
    gFindBar.clear();

    if (UI.highlightButton.checked) {
      toggleHighlight(false);
    }
  }

  function open() {
    if (gFindBar.hidden) {
      // Open a findbar but not focus on it.
      gFindBar.open(gFindBar.FIND_NORMAL);
    }
  }

  function toggle() {
    if (gFindBar.hidden) {
      // Open a findbar and focus on it.
      gFindBar.onFindCommand();
    }
    else {
      gFindBar.close();
    }
  }

  function find(aText, aOption = {}) {
    if (!aText) {
      return;
    }

    let {
      doHighlight
    } = aOption;

    // Reset all status.
    reset();

    // Open a findbar and ready for the first finding.
    gFindBar.onFindCommand();

    // Find the text.
    FindText.value = aText;
    gFindBar.onFindAgainCommand();

    if (doHighlight) {
      toggleHighlight(true);
    }
  }

  function toggleHighlight(aHighlight) {
    gFindBar.toggleHighlight(aHighlight);

    UI.highlightButton.checked = aHighlight;
  }

  /**
   * Expose
   */
  return {
    register: HandlerManager.register,
    findText: FindText,
    reset: reset,
    open: open,
    toggle: toggle,
    find: find
  };
})();

/**
 * Status bar handler.
 */
const StatusField = (function() {
  // @see chrome://browser/content/browser.js::XULBrowserWindow
  const {XULBrowserWindow} = window;

  const kStatusAttribute = {
    LINKSTATE: 'ucjs_UI_StatusField_linkState',
    MESSAGE: 'ucjs_UI_StatusField_message'
  };

  // @see http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
  const kTimeFormat = '%Y/%m/%d %H:%M:%S';
  const kLinkFormat = '%url% [%time%]';

  /**
   * Fx native UI elements.
   */
  const UI = {
    get textBox() {
      return XULBrowserWindow.statusTextField;
    }
  };

  /**
   * Message text handler.
   */
  const MessageHandler = (function() {
    let mMessageStatus = '';

    /**
     * Determines if a message text exists.
     */
    function hasMessage() {
      return !!mMessageStatus;
    }

    /**
     * Show a message text.
     */
    function showMessage(aText) {
      let text = aText || '';

      if (text === mMessageStatus) {
        return;
      }

      const {MESSAGE} = kStatusAttribute;
      let textField = UI.textBox;

      mMessageStatus = text;

      // Overwrite the displayed status.
      textField.label = text;

      // Restore the hidden status.
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
     * Expose
     */
    return {
      hasMessage: hasMessage,
      showMessage: showMessage
    };
  })();

  /**
   * Handler of the state of a link under a cursor.
   */
  const OverLinkHandler = (function() {
    let mDisableSetOverLink = false;
    let mLastOverLinkURL;

    /**
     * Switches the over link state.
     */
    function setOverLink(aShouldShow) {
      if (!aShouldShow) {
        // Clear the former state.
        XULBrowserWindow.setOverLink('', null);
      }

      mDisableSetOverLink = !aShouldShow;
    }

    /**
     * Patches the native function.
     *
     * @modified chrome://browser/content/browser.js::XULBrowserWindow::setOverLink
     */
    const $setOverLink = XULBrowserWindow.setOverLink;

    XULBrowserWindow.setOverLink =
    function ucjsUI_StatusField_setOverLink(url, anchorElt) {
      if (mDisableSetOverLink) {
        return;
      }

      // WORKAROUND: Sometimes |setOverLink| is called on mousemove event (e.g.
      // on history/bookmark sidebar), so we discard redundant callings.
      if (mLastOverLinkURL === url) {
        return;
      }

      mLastOverLinkURL = url;

      // Clear the message to hide it after the cursor leaves.
      MessageHandler.showMessage('');

      Task.spawn(function*() {
        // |newURL| can be updated with its visited date.
        let {linkState, newURL} = yield examineLinkURL(url, anchorElt);

        // This task is useless any more since it was not completed while over
        // link and a new task has raised on another over link.
        if (mLastOverLinkURL !== url) {
          return;
        }

        const {LINKSTATE} = kStatusAttribute;
        let textField = UI.textBox;

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

        // Disable the delayed showing while over link.
        this.hideOverLinkImmediately = true;

        // @note Use |call| for the updated |newURL|.
        $setOverLink.call(this, newURL, anchorElt);

        // Restore the delayed showing.
        this.hideOverLinkImmediately = false;

      // Make |this| to refer to |window.XULBrowserWindow|.
      }.bind(this)).
      then(null, Cu.reportError);
    };

    /**
     * Gets the bookmarked or visited state of a link URL, and update the URL
     * with the visited date.
     *
     * @param aURL {string}
     * @param aAnchorElt {Element}
     * @return {Promise}
     *   @resolved {hash}
     *     newURL: {string}
     *     linkState: {string}
     *
     * @note Called from a task in |ucjsUI_StatusField_setOverLink|.
     */
    function examineLinkURL(aURL, aAnchorElt) {
      return Task.spawn(function*() {
        if (!aURL) {
          return {
            newURL: '',
            linkState: null
          };
        }

        // |aURL| that is passed to the native function |setOverLink| may be
        // a processed URL for UI, so we query the Places DB with the raw URL
        // of an anchor element to fetch the proper result.
        // @note |Element.href| will always return the absolute path.
        let rawURL = aAnchorElt && aAnchorElt.href;

        // Get a URL sring of an SVGAElement.
        if (rawURL && rawURL.baseVal) {
          // @note |baseVal| may be a relative path.
          rawURL = resolveURL(rawURL.baseVal, aAnchorElt.baseURI);
        }

        // Use the cooked URL if a raw URL cannot be retrieved.
        // TODO: Ensure an absolute |aURL|. I'm not sure whether an absolute
        // URL is always passed to |setOverLink| in Fx native processing.
        if (!rawURL) {
          rawURL = aURL;
        }

        let newURL = aURL;
        let linkState = 'unknown';

        // Visited check.
        let visitedDate = yield getVisitedDate(rawURL);

        if (visitedDate) {
          // Convert microseconds into milliseconds.
          let time = (new Date(visitedDate / 1000)).
            toLocaleFormat(kTimeFormat);

          // Update the URL with the visited date.
          newURL = kLinkFormat.
            replace('%url%', newURL).replace('%time%', time);

          linkState = 'visited';
        }

        // Bookmarked check.
        let bookmarked = yield checkBookmarked(rawURL);

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
      // Don't query a URL which cannot be recorded about its visit date in the
      // places DB.
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
      // Resolved with the date or null.
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
      // Resolved with bookmarked or not
      then((aRows) => !!aRows);
    }

    /**
     * Patches the native function.
     *
     * @modified chrome://browser/content/browser.js::XULBrowserWindow::updateStatusField
     */
    const $updateStatusField = XULBrowserWindow.updateStatusField;

    XULBrowserWindow.updateStatusField =
    function ucjsUI_StatusField_updateStatusField() {
      // Suppress the others while a message is shown.
      if (MessageHandler.hasMessage()) {
        return;
      }

      $updateStatusField.apply(this, arguments);
    };

    /**
     * Register the appearance.
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

    /**
     * Expose
     */
    return {
      setOverLink: setOverLink
    };
  })();

  /**
   * Expose
   */
  return {
    showMessage: MessageHandler.showMessage,
    setOverLink: OverLinkHandler.setOverLink
  };
})();

/**
 * Menuitems of a popup menu.
 */
const Menuitem = {
  /**
   * Set a state for an unread tab.
   *
   * @note Based on handling for unread tabs by TabEx.uc.js but not the native
   * function.
   * @require TabEx.uc.js
   */
  setStateForUnreadTab: function(aMenuitem, aTab) {
    const kATTR_UNREADTAB = 'ucjs_UI_Menuitem_unreadTab';

    if (window.ucjsTabEx) {
      // @note Check the *read* state of a tab and then set the *unread*
      // attribute of a menuitem.
      if (window.ucjsTabEx.tabState.isRead(aTab)) {
        aMenuitem.classList.remove(kATTR_UNREADTAB);
      }
      else {
        aMenuitem.classList.add(kATTR_UNREADTAB);
      }
    }
  }
};

/**
 * Exports
 */
return {
  ContentArea: ContentArea,
  URLBar: URLBar,
  FindBar: FindBar,
  StatusField: StatusField,
  Menuitem: Menuitem
};


})(this);
