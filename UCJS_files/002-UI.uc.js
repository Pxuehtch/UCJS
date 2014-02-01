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
  scanPlacesDB
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('UI.uc.js', aMsg);
}

/**
 * Context area
 */
const mContentArea = {
  get contextMenu() {
    return $ID('contentAreaContextMenu');
  }
};

/**
 * Location bar
 * @see chrome://browser/content/urlbarBindings.xml
 */
const mURLBar = {
  get textBox() {
    return $ANONID('textbox-input-box', gURLBar);
  },

  get contextMenu() {
    return $ANONID('input-box-contextmenu', this.textBox);
  }
};

/**
 * Find bar
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
     * Customize the default functions
     */
    // @modified chrome://browser/content/browser.js::
    // XULBrowserWindow::setOverLink
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

      // |URL| can be updated with its visited date
      let {linkState, URL} = getLinkState(url, anchorElt);

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

      // @note use |call| for the updated |URL|
      $setOverLink.call(this, URL, anchorElt);

      // restore the delayed showing
      this.hideOverLinkImmediately = false;
    };

    // @modified chrome://browser/content/browser.js::
    // XULBrowserWindow::updateStatusField
    const $updateStatusField = XULBrowserWindow.updateStatusField;

    XULBrowserWindow.updateStatusField =
    function ucjsUI_StatusField_updateStatusField() {
      // suppress the display except a message
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

    function getLinkState(aURL, aAnchorElt) {
      if (!aURL) {
        return {
          linkState: null,
          URL: aURL
        };
      }

      // query the Places DB with the raw URL of a link in the content area
      // so that we can get the proper result
      let originalURL = (aAnchorElt && aAnchorElt.href) || aURL;
      let linkState;
      let SQLExp, resultRows;

      // visited check
      SQLExp = [
        "SELECT h.visit_date",
        "FROM moz_historyvisits h",
        "JOIN moz_places p ON p.id = h.place_id",
        "WHERE p.url = :url",
        "ORDER BY h.visit_date DESC",
        "LIMIT 1"
      ].join(' ');

      resultRows = scanPlacesDB({
        expression: SQLExp,
        params: {'url': originalURL},
        columns: ['visit_date']
      });

      if (resultRows) {
        // we ordered one row
        let row = resultRows[0];
        // convert microseconds into milliseconds
        let time = row.visit_date / 1000;

        time = (new Date(time)).toLocaleFormat(kTimeFormat);

        aURL = kLinkFormat.replace('%url%', aURL).replace('%time%', time);

        linkState = 'visited';
      }

      // bookmarked check
      SQLExp = [
        "SELECT b.id",
        "FROM moz_bookmarks b",
        "JOIN moz_places p ON p.id = b.fk",
        "WHERE p.url = :url",
        "LIMIT 1"
      ].join(' ');

      resultRows = scanPlacesDB({
        expression: SQLExp,
        params: {'url': originalURL},
        columns: ['id']
      });

      if (resultRows) {
        linkState = 'bookmarked';
      }

      if (!linkState) {
        linkState = 'unknown';
      }

      return {
        linkState: linkState,
        URL: aURL
      };
    }

    // expose
    return {
      toggle: toggle
    };
  })();

  /**
   * Expose
   */
  return {
    get textBox() {
      return getTextBox();
    },
    message: showMessage,
    setOverLink: OverLink.toggle
  };
})();

/**
 * Menuitems of a popup menu
 * @require TabEx.uc.js
 */
const mMenuitem = {
  setStateForUnreadTab: function(aMenuitem, aTab) {
    const kATTR_UNREADTAB = 'ucjs_ui_menuitem_unreadTab';

    if (window.ucjsTabEx) {
      // @note We check the *read* state of a tab and then set the *unread*
      // attribute of a menuitem.
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
 * Manages the visibility of menu separators in the context menu
 */
function manageContextMenuSeparators() {
  [mContentArea, mURLBar].forEach((container) => {
    let contextMenu = container.contextMenu;

    addEvent(contextMenu, 'popupshowing', (event) => {
      if (event.target === contextMenu) {
        setImmediate(
          manage,
          $X('xul:menuseparator', contextMenu, {
            ordered: true,
            toArray: true
          })
        );
      }
    }, false);
  });

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
 * Entry point
 */
function UI_init() {
  manageContextMenuSeparators();
}

UI_init();

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
