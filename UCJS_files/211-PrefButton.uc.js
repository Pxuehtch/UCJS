// ==UserScript==
// @name PrefButton.uc.js
// @description Adds buttons for setting the preferences.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @usage Creates items on the navigation toolbar.

// @note Some about:config preferences are changed (see @pref).

// @note The button styles are adjusted to the themes of my Fx and OS.
// @see |setStyleSheet()|

// TODO: Support the customizable UI.


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  Prefs: {
    get: getPref,
    set: setPref
  },
  createNode: $E,
  getNodeById: $ID,
  addEvent,
  setChromeStyleSheet: setCSS
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('PrefButton.uc.js', aMsg);
}

/**
 * Identifiers
 */
const kID = {
  // Native ID.
  NAVIGATION_TOOLBAR: 'nav-bar',
  PANELUI_BUTTON: 'PanelUI-button',

  // Custom ID.
  CONTAINER: 'ucjs_PrefButton_container',
  ITEM: 'ucjs_PrefButton_item'
};

/**
 * List of buttons.
 *
 * @param tabMode {boolean} [optional]
 *   true: Updates the button state whenever a tab is selected.
 *   Set true if |command| should work only on the selected tab.
 * @param type {string}
 *   'button': A normal button.
 *   'checkbox': A toggle button with On/Off.
 * @param label {string}
 * @param image {URL string} [optional]
 *   The image instead of the label text of a button.
 * @param description {string}
 *   @note Used as a tooltip text.
 * @param checked {getter} [optional]
 *   @return {boolean}
 *   Set a getter that returns On/Off state for 'checkbox' type button.
 * @param command {function}
 * @param disabled {boolean} [optional]
 */
const kItemList = [
  {
    // Switch CSS for each tab.
    tabMode: true,
    type: 'checkbox',
    label: 'CSS',
    description: 'Switch CSS (Tab)',

    // Gets the content viewer for the current content document.
    // @see chrome://browser/content/tabbrowser.xml::markupDocumentViewer
    get documentViewer() {
      return gBrowser.markupDocumentViewer;
    },

    get checked() {
      return !this.documentViewer.authorStyleDisabled;
    },

    command: function() {
      this.documentViewer.authorStyleDisabled = this.checked;
    }
  },
  {
    // Switch the referrer header sending.
    type: 'checkbox',
    label: 'Ref.',
    description: 'Switch Referrer sending',

    // @pref
    // 0: Never send the referrer header.
    // 1: Send when clicking on a link.
    // 2: Send when clicking on a link or loading an image [default].
    // @see http://kb.mozillazine.org/Network.http.sendRefererHeader
    pref: {
      key: 'network.http.sendRefererHeader',
      value: {
        never: 0,
        link: 1,
        linkOrImage: 2
      }
    },

    get checked() {
      let {key, value} = this.pref;

      return getPref(key, value.linkOrImage) !== value.never;
    },

    command: function() {
      let {key, value} = this.pref;

      setPref(key, this.checked ? value.never : value.linkOrImage);
    }
  },
  {
    // Switch the image animation.
    type: 'checkbox',
    label: 'GIF',
    description: 'Switch GIF animation',

    // @pref
    // 'none': Prevent image animation.
    // 'once': Let the image animate once.
    // 'normal': Allow it to play over and over [default].
    // @see http://kb.mozillazine.org/Animated_images
    pref: {
      key: 'image.animation_mode',
      value: {
        none: 'none',
        once: 'once',
        normal: 'normal'
      }
    },

    get checked() {
      let {key, value} = this.pref;

      return getPref(key, value.normal) !== value.none;
    },

    command: function() {
      let {key, value} = this.pref;

      setPref(key, this.checked ? value.none : value.normal);

      // Immediately apply the new mode in the animate-able image document.
      if (gBrowser.contentDocument instanceof ImageDocument &&
          /^image\/(?:gif|png)$/.test(gBrowser.contentDocument.contentType)) {
        // @see chrome://browser/content/browser.js::BrowserReload
        window.BrowserReload();
      }
    }
  },
  {
    // Switch Java.
    // @note I can't test this block anymore since I uninstalled Java plugin.
    type: 'checkbox',
    label: 'Java',
    description: 'Switch Java',

    get disabled() {
      return this.plugin === null;
    },

    get plugin() {
      let plugins =
        Cc['@mozilla.org/plugin/host;1'].
        getService(Ci.nsIPluginHost).
        getPluginTags({});

      let plugin = null;

      for (let i = 0; i < plugins.length; i++) {
        if (plugins[i].name.contains('Java(TM)')) {
          plugin = plugins[i];
          break;
        }
      }

      // Lazy definition.
      delete this.plugin;
      return this.plugin = plugin;
    },

    get checked() {
      return !(this.plugin.disabled || this.plugin.blocklisted);
    },

    command: function() {
      if (!this.plugin.blocklisted) {
        this.plugin.disabled = !this.plugin.disabled;
      }
    }
  },
  {
    // Open the sanitize dialog.
    // @note Disabled since I hardly use this.
    disabled: true,
    type: 'button',
    label: 'CLR',
    description: 'Clear cache',
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAe1BMVEUAAAC6urpmZmZvb2+qqqpmZjOZZjMzMzOZmZmZZmbMzGbMmTOZmTOZmWbMzJnFxcXMmWb//5n/zGZmMzPS0tL//8z/zJlaW1szM2bMmZlaZGd7e3szZmbi4uKHh4fMzMzv7+/IyMhecnqZmcxmZswzM5mZZpmZzMxmZpkJF2RIAAAAKXRSTlMA/////////////////////////////////////////////////////0LHzqgAAACJSURBVHhefc7JEsIgEARQYkZFMIPEsCiSqLjk/7/QEU1JLvbtdddQMPY3KamSz5TGcQIAqEe63f3kOET+M4oBzpcYrtkKEY1BiD24/r2SKBoDD/WJig4tUdv2cAzOd7nRxloUonG+yk+qHepWCLndf8xY1dAu5Zp/Tb/Y0F6YmuVqZrpa1DMXeQFq7Aju0wjcLAAAAABJRU5ErkJggg==',

    command: function() {
      $ID('Tools:Sanitize').doCommand();
    }
  }//,
];

/**
 * Progress listener.
 */
const BrowserProgressListener = {
  onStateChange: function(aWebProgress, aRequest, aFlags, aStatus) {
    const {STATE_STOP, STATE_IS_WINDOW} = Ci.nsIWebProgressListener;

    if (aFlags & STATE_STOP) {
      if (aFlags & STATE_IS_WINDOW &&
          aWebProgress.DOMWindow === gBrowser.contentWindow) {
        updateState();
      }
    }
  },

  onLocationChange: function() {},
  onProgressChange: function() {},
  onStatusChange: function() {},
  onSecurityChange: function() {}
};

function PrefButton_init() {
  setStyleSheet();
  makeButtons();

  addEvent(gBrowser, 'select', () => {
    updateState({tabMode: true});
  }, false);

  gBrowser.addProgressListener(BrowserProgressListener);

  addEvent(window, 'unload', () => {
    gBrowser.removeProgressListener(BrowserProgressListener);
  }, false);
}

function updateState(aOption) {
  let {tabMode} = aOption || {};

  kItemList.forEach((item, i) => {
    if (item.disabled || (tabMode && !item.tabMode)) {
      return;
    }

    let button = $ID(kID.ITEM + i);

    switch (item.type) {
      case 'button':
        // Nothing to do.
        break;

      case 'checkbox':
        if (button.checked !== item.checked) {
          button.checked = item.checked;
        }
        break;
    }
  });
}

function doCommand(aEvent) {
  aEvent.stopPropagation();
  if (aEvent.button !== 0) {
    return;
  }

  let button = aEvent.target;

  if (button.id && button.id.startsWith(kID.ITEM)) {
    kItemList[+button.id.replace(kID.ITEM, '')].command();
  }
}

function makeButtons() {
  let toolbar = $ID(kID.NAVIGATION_TOOLBAR);

  let hbox = $E('hbox', {
    id: kID.CONTAINER
  });

  addEvent(hbox, 'click', doCommand, false);

  kItemList.forEach((item, i) => {
    if (item.disabled) {
      return;
    }

    hbox.appendChild($E('button', {
      id: kID.ITEM + i,
      class: kID.ITEM,
      type: (item.type !== 'button') ? item.type : null,
      image: item.image || null,
      label: !item.image ? item.label : null,
      tooltiptext: item.description
    }));
  });

  toolbar.insertBefore(hbox, $ID(kID.PANELUI_BUTTON));
}

function setStyleSheet() {
  // @note The styles are adjusted to the themes of my Firefox and OS.
  // @note The positioning assumes that the nav-bar's height is 24px.
  let css = '\
    #%%kID.CONTAINER%%{\
      margin:3px 0 3px 2px;\
    }\
    .%%kID.ITEM%%{\
      -moz-user-focus:ignore;\
      -moz-appearance:none;\
      width:20px;\
      min-width:20px;\
      height:16px;\
      margin:0 2px 0 0;\
      padding:0;\
      border:1px solid #999;\
      -moz-border-top-colors:none;\
      -moz-border-right-colors:none;\
      -moz-border-bottom-colors:none;\
      -moz-border-left-colors:none;\
      background:transparent none center center no-repeat;\
      font:8px "Arial";\
    }\
    .%%kID.ITEM%%:active,\
    .%%kID.ITEM%%[checked=true]{\
      border:1px inset #ccc;\
      background-color:#ffcccc;\
    }\
    .%%kID.ITEM%%:hover{\
      cursor:pointer;\
      opacity:0.6;\
    }\
    .%%kID.ITEM%%>hbox{\
      border:none;\
      padding:0;\
    }\
  ';

  setCSS(css.replace(/%%(.+?)%%/g, ($0, $1) => eval($1)));
}

/**
 * Entry point.
 */
PrefButton_init();


})(this);
