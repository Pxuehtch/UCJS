// ==UserScript==
// @name        UI.uc.js
// @description Helpers for user interface of the main browser.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @require [optional] TabEx.uc.js
// @note Some default functions are modified. search @modified.
// @usage Access to items through global property (ucjsUI.XXX).


var ucjsUI = (function() {


"use strict";


/**
 * Context area.
 */
var mContentArea = {
  get contextMenu() {
    delete this.contextMenu;
    return this.contextMenu = $ID('contentAreaContextMenu');
  }
};


/**
 * Location bar.
 */
var mURLBar = {
  get textBox() {
    delete this.textBox;
    return this.textBox = $ANONID('textbox-input-box', gURLBar);
  },

  get contextMenu() {
    delete this.contextMenu;
    return this.contextMenu = $ANONID('input-box-contextmenu', this.textBox);
  }
};


/**
 * Find bar.
 */
var mFindBar = {
  get textBox() {
    delete this.textBox;
    return this.textBox = gFindBar.getElement('findbar-textbox');
  },

  get highlightButton() {
    delete this.highlightButton;
    return this.highlightButton = gFindBar.getElement('highlight');
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
    if (!aText)
      return;

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
 * Status bar.
 */
var mStatusField = (function() {
  const kStatusAttribute = {
    LINKSTATE: 'ucjs_ui_statusField_linkstate',
    MESSAGE: 'ucjs_ui_statusField_message'
  };


  // Exported object.
  var _mStatusField = {
    get textBox() {
      delete this.textBox;
      return this.textBox = $ID('statusbar-display');
    },

    get text() this.textBox.label,

    exists: function () {
      return this.textBox !== null;
    },

    update: function (aText) {
      var text = aText || '';
      var field = this.textBox;

      if (this.text !== text) {
        field.label = text;
      }

      if (text) {
        if (!field.hasAttribute(kStatusAttribute.MESSAGE)) {
          field.setAttribute(kStatusAttribute.MESSAGE, true);
        }
      } else {
        if (field.hasAttribute(kStatusAttribute.MESSAGE)) {
          field.removeAttribute(kStatusAttribute.MESSAGE);
        }
      }
    },

    setOverLink: function(aEnabled) {
      // @modified chrome://browser/content/browser.js::XULBrowserWindow::setOverLink
      if (!aEnabled) {
        if (!this.$setOverLink) {
          this.$setOverLink = XULBrowserWindow.setOverLink;
        }
        XULBrowserWindow.setOverLink = function(url, anchorElt) {};
      } else {
        if (this.$setOverLink) {
          XULBrowserWindow.setOverLink = this.$setOverLink;
        }
      }
    }
  };


  // Custom status display.
  customize();

  function customize() {
    // Custom styles.
    setCSS('\
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
    '
    .replace(/%%(.+?)%%/g, function($0, $1) eval($1)));


    // Custom functions.
    var linkState = null;

    // @modified chrome://browser/content/browser.js::XULBrowserWindow::setOverLink
    var $setOverLink = XULBrowserWindow.setOverLink;
    XULBrowserWindow.setOverLink = function(url, anchorElt) {
      var URI = null;
      try {
        URI = PlacesUtils._uri(url);
      } catch (e) {}

      if (URI) {
        if (PlacesUtils.bookmarks.isBookmarked(URI)) {
          linkState = 'bookmarked';
        } else if (PlacesUtils.history.isVisited(URI)) {
          linkState = 'visited';
        } else {
          linkState = 'unknown';
        }
      }

      this.hideOverLinkImmediately = true;
      $setOverLink.apply(this, arguments);
      this.hideOverLinkImmediately = false;
    };

    // @modified chrome://browser/content/browser.js::XULBrowserWindow::updateStatusField
    var $updateStatusField = XULBrowserWindow.updateStatusField;
    XULBrowserWindow.updateStatusField = function() {
      var {LINKSTATE, MESSAGE} = kStatusAttribute;
      var textField = XULBrowserWindow.statusTextField;

      if (XULBrowserWindow.overLink && linkState) {
        textField.setAttribute(LINKSTATE, linkState);
        linkState = null;
      } else if (textField.hasAttribute(LINKSTATE)) {
        textField.removeAttribute(LINKSTATE);
      }

      if (textField.hasAttribute(MESSAGE)) {
        textField.removeAttribute(MESSAGE);
      }

      $updateStatusField.apply(this, arguments);
    };
  }


  // Exports.
  return _mStatusField;
})();


/**
 * Menuitem of popup menu.
 * @require TabEx.uc.js
 */
var mMenuitem = {
  toggleUnreadTab: function (aMenuitem, aTab) {
    if (!ucjsTabEx)
      throw 'TabEx.uc.js is required.';

    const ATTR_UNREADTAB = 'ucjs_ui_menuitem_unreadTab';

    if (ucjsTabEx.tabState.isUnread(aTab)) {
      aMenuitem.classList.add(ATTR_UNREADTAB);
    } else {
      aMenuitem.classList.remove(ATTR_UNREADTAB);
    }
  }
};


// Functions.

// Manages visibility of menu separators in context menu.
function manageContextMenuSeparators() {
  [mContentArea, mURLBar].forEach(function(aContainer) {
    var contextMenu = aContainer.contextMenu;
    addEvent([contextMenu, 'popupshowing', function(aEvent) {
      if (aEvent.target === contextMenu) {
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
    var node = aSeparator;
    do {
      node = node[aSibling];
    } while (node && !isElementVisible(node));

    return node && node.localName !== 'menuseparator';
  }
}


// Utilities.

function $ID(aId)
  document.getElementById(aId);

function $ANONID(aId, aContext)
  ucjsUtil.getNodeByAnonid(aId, aContext);

function $X(aXPath, aContext)
  ucjsUtil.getNodesByXPath(aXPath, aContext);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function setCSS(aCSS, aTitle)
  ucjsUtil.setChromeStyleSheet(aCSS);

function log(aMsg)
  ucjsUtil.logMessage('UI.uc.js', aMsg);


// Entry point.

function UI_init() {
  manageContextMenuSeparators();
}

UI_init();


// Exports.

return {
  ContentArea: mContentArea,
  URLBar: mURLBar,
  FindBar: mFindBar,
  StatusField: mStatusField,
  Menuitem: mMenuitem
};


})();
