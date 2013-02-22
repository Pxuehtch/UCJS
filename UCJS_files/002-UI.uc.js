// ==UserScript==
// @name        UI.uc.js
// @description Helpers for user interface of the main browser.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @require [optional] TabEx.uc.js
// @note Some default functions are modified. see @modified.
// @usage Access to items through global property (ucjsUI.XXX).


var ucjsUI = (function(window, undefined) {


"use strict";


/**
 * Context area
 */
var mContentArea = {
  get contextMenu() {
    return $ID('contentAreaContextMenu');
  }
};

/**
 * Location bar
 * @see chrome://browser/content/urlbarBindings.xml
 */
var mURLBar = {
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
var mFindBar = {
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
    } else {
      gFindBar.close();
    }
  },

  toggleHighlight: function(aHighlight) {
    gFindBar.toggleHighlight(aHighlight);

    if (aHighlight) {
      this.highlightButton.setAttribute('checked', 'true');
    } else {
      this.highlightButton.removeAttribute('checked');
    }
  },

  findWith: function(aText, aHighlight) {
    if (!aText) {
      return;
    }

    if (this.text) {
      this.clearText();
    }

    gFindBar.onFindCommand();
    this.text = aText;
    gFindBar.onFindAgainCommand();

    if (aHighlight) {
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
var mStatusField = (function() {
  // @see chrome://browser/content/browser.js::XULBrowserWindow
  const {XULBrowserWindow} = window;

  const kStatusAttribute = {
    LINKSTATE: 'ucjs_ui_statusField_linkstate',
    MESSAGE: 'ucjs_ui_statusField_message'
  };

  // @see http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
  const kTimeFormat = '%Y/%m/%d %H:%M:%S';
  const kLinkFormat = '%url% [%time%]';

  function getTextBox() {
    return XULBrowserWindow.statusTextField;
  }

  /**
   * Show a message text
   */
  let messageStatus;
  function showMessage(aText) {
    const {MESSAGE} = kStatusAttribute;
    let text = aText || '';
    let textField = getTextBox();

    if (text || messageStatus) {
      textField.label = text;
      textField.setAttribute('crop', 'end');
      messageStatus = text;
    }

    if (text) {
      if (!textField.hasAttribute(MESSAGE)) {
        textField.setAttribute(MESSAGE, true);
      }
    } else {
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
    let linkState = null;

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
    XULBrowserWindow.setOverLink = function(url, anchorElt) {
      if (disableSetOverLink) {
        return;
      }

      // clear the message to hide it after the cursor leaves
      showMessage('');

      // @see resource:///modules/PlacesUtils.jsm
      const {PlacesUtils} = window;

      var URI;
      try {
        URI = PlacesUtils._uri(url);
      } catch (ex) {}

      if (URI) {
        let visited;
        // TODO: Fix the character escaping problem
        // see https://bugzilla.mozilla.org/show_bug.cgi?id=817374
        if (PlacesUtils.history.isVisited(URI)) {
          url = format(url, getLastVisitTime(URI));
          visited = true;
        }
        if (PlacesUtils.bookmarks.isBookmarked(URI)) {
          linkState = 'bookmarked';
        } else if (visited) {
          linkState = 'visited';
        } else {
          linkState = 'unknown';
        }
      }

      // disable the delayed showing
      this.hideOverLinkImmediately = true;
      // @note use |call| for a updated |url|
      $setOverLink.call(this, url, anchorElt);
      this.hideOverLinkImmediately = false;
    };

    // @modified chrome://browser/content/browser.js::
    // XULBrowserWindow::updateStatusField
    const $updateStatusField = XULBrowserWindow.updateStatusField;
    XULBrowserWindow.updateStatusField = function() {
      // suppress the display except a message
      if (messageStatus) {
        return;
      }

      var {LINKSTATE} = kStatusAttribute;
      var textField = getTextBox();

      if (XULBrowserWindow.overLink && linkState) {
        textField.setAttribute(LINKSTATE, linkState);
        linkState = null;
      } else if (textField.hasAttribute(LINKSTATE)) {
        textField.removeAttribute(LINKSTATE);
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
        #statusbar-display:not([%%kStatusAttribute.LINKSTATE%%]) label{\
          color:brown!important;\
        }\
        #statusbar-display[%%kStatusAttribute.LINKSTATE%%="bookmarked"] label{\
          color:green!important;\
        }\
        #statusbar-display[%%kStatusAttribute.LINKSTATE%%="visited"] label{\
          color:purple!important;\
        }\
        #statusbar-display[%%kStatusAttribute.LINKSTATE%%="unknown"] label{\
          color:red!important;\
        }\
        #statusbar-display[%%kStatusAttribute.MESSAGE%%] label{\
          color:blue!important;\
        }\
        #statusbar-display[inactive],\
        #statusbar-display[label=""]{\
          display:none!important;\
        }\
      ';
      setCSS(css.replace(/%%(.+?)%%/g, function($0, $1) eval($1)));
    }

    // TODO: Get the time of a redirected URL
    function getLastVisitTime(aURI) {
      if (aURI.schemeIs('about')) {
        return 0;
      }

      // @see resource:///modules/PlacesUtils.jsm
      const history = window.PlacesUtils.history;
      const {Ci} = window;

      var query, options, root;
      var time;

      query = history.getNewQuery();
      query.uri = aURI;

      options = history.getNewQueryOptions();
      options.queryType =
        Ci.nsINavHistoryQueryOptions.QUERY_TYPE_HISTORY;
      options.sortingMode =
        Ci.nsINavHistoryQueryOptions.SORT_BY_DATE_DESCENDING;
      options.maxResults = 1;

      root = history.executeQuery(query, options).root;
      root.containerOpen = true;
      try {
        // convert microseconds into milliseconds
        time = root.getChild(0).time / 1000;
      } catch (ex) {}
      root.containerOpen = false;

      return time || 0;
    }

    function format(aURL, aTime) {
      let time = aTime ?
        (new Date(aTime)).toLocaleFormat(kTimeFormat) :
        'Redirected';

      return kLinkFormat.replace('%url%', aURL).replace('%time%', time);
    }

    // expose
    return {
      toggle: toggle
    };
  })();


  //********** Expose

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
var mMenuitem = {
  setStateForUnreadTab: function(aMenuitem, aTab) {
    const kATTR_UNREADTAB = 'ucjs_ui_menuitem_unreadTab';

    if (window.ucjsTabEx) {
      // @note We check the *read* state of a tab and then set the *unread*
      // attribute of a menuitem.
      if (window.ucjsTabEx.tabState.read(aTab)) {
        aMenuitem.classList.remove(kATTR_UNREADTAB);
      } else {
        aMenuitem.classList.add(kATTR_UNREADTAB);
      }
    }
  }
};


//********** Functions

/**
 * Manages the visibility of menu separators in the context menu
 */
function manageContextMenuSeparators() {
  [mContentArea, mURLBar].forEach(function(container) {
    var contextMenu = container.contextMenu;
    addEvent([contextMenu, 'popupshowing', function(event) {
      if (event.target === contextMenu) {
        setTimeout(manage, 0, $X('xul:menuseparator', contextMenu));
      }
    }, false]);
  });

  function manage(aSeparators) {
    var last = null;

    Array.forEach(aSeparators, function(separator) {
      if (separator.hidden) {
        separator.hidden = false;
      }

      if (!shouldShow(separator, 'previousSibling')) {
        separator.hidden = true;
      } else {
        last = separator;
      }
    });

    if (last && !shouldShow(last, 'nextSibling')) {
      last.hidden = true;
    }
  }

  function shouldShow(aSeparator, aSibling) {
    // @see chrome://browser/content/utilityOverlay.js::
    // isElementVisible()
    var isElementVisible = window.isElementVisible;
    var node = aSeparator;
    do {
      node = node[aSibling];
    } while (node && !isElementVisible(node));

    return node && node.localName !== 'menuseparator';
  }
}


//********** Utility

function $ID(aId) {
  return window.document.getElementById(aId);
}


//********** Imports

function $ANONID(aId, aContext) {
  return window.ucjsUtil.getNodeByAnonid(aId, aContext);
}

function $X(aXPath, aContext) {
  return window.ucjsUtil.getNodesByXPath(aXPath, aContext);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function setCSS(aCSS, aTitle) {
  window.ucjsUtil.setChromeStyleSheet(aCSS);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('UI.uc.js', aMsg);
}


//********** Entry point

function UI_init() {
  manageContextMenuSeparators();
}

UI_init();


//********** Exports

return {
  ContentArea: mContentArea,
  URLBar: mURLBar,
  FindBar: mFindBar,
  StatusField: mStatusField,
  Menuitem: mMenuitem
};


})(this);
