// ==UserScript==
// @name        PrefButton.uc.js
// @description Adds buttons for setting the preferences.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @usage Access to items on the navigation toolbar.
// @note Some about:config preferences are changed. see @pref

// @note The styles are adjusted to the themes of my Firefox. see
// |setStyleSheet()|


(function(window, undefined) {


"use strict";


/**
 * Identifiers
 */
const kID = {
  // default
  NAVIGATION_TOOLBAR: 'nav-bar',

  // custom
  CONTAINER: 'ucjs_prefbutton_container',
  ITEM: 'ucjs_prefbutton_item'
};

/**
 * Preset button items
 *
 * @param tabMode {boolean} [optional]
 *   true: updates the button state whenever a tab is selected
 *   set true if |command| should work only on the selected tab
 * @param type {string}
 *   'button': a normal button
 *   'checkbox': can be in two states
 * @param label {string}
 * @param image {URL string} [optional]
 *   the image instead of the label text of a button
 * @param description {string}
 *   the text of tooltip
 * @param checked {boolean} [optional]
 *   necessary for 'checkbox' type button
 *   returns on or off state of this function
 * @param command {function}
 * @param disabled {boolean} [optional]
 */
const Items = [
  {
    // switch CSS for each tab
    tabMode: true,
    type: 'checkbox',
    label: 'CSS',
    description: 'Switch CSS (Tab)',

    // gets the content viewer for the current content document
    // @see chrome://browser/content/tabbrowser.xml::
    // markupDocumentViewer
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
    // switch the referrer header sending
    type: 'checkbox',
    label: 'Ref.',
    description: 'Switch Referrer sending',

    // @pref
    // 0: never send the referrer header
    // 1: send when clicking on a link
    // 2: send when clicking on a link or loading an image [default]
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
    // switch the image animation
    type: 'checkbox',
    label: 'GIF',
    description: 'Switch GIF animation',

    // @pref
    // 'none': prevent image animation
    // 'once': let the image animate once
    // 'normal': allow it to play over and over [default]
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

      // immediately apply the new mode in the animate-able image document
      if (gBrowser.contentDocument instanceof ImageDocument &&
          /^image\/(?:gif|png)$/.test(gBrowser.contentDocument.contentType)) {
        // @see chrome://browser/content/browser.js::BrowserReload
        window.BrowserReload();
      }
    }
  },
  {
    // switch Java
    // @note I uninstalled Java plugin, so, I can't test this block
    type: 'checkbox',
    label: 'Java',
    description: 'Switch Java',

    get disabled() {
      return this.plugin === null;
    },

    get plugin() {
      const {Cc, Ci} = window;

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
    // open the sanitize dialog
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
 * Progress listener
 */
const BrowserProgressListener = {
  onStateChange: function(aWebProgress, aRequest, aFlags, aStatus) {
    const {STATE_STOP, STATE_IS_WINDOW} = window.Ci.nsIWebProgressListener;
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

  addEvent([gBrowser, 'select', function() {
    updateState({tabMode: true});
  }, false]);

  gBrowser.addProgressListener(BrowserProgressListener);
  addEvent([window, 'unload', function() {
    gBrowser.removeProgressListener(BrowserProgressListener);
  }, false]);
}

function updateState(aOption) {
  let {tabMode} = aOption || {};

  Items.forEach(function(item, i) {
    if (item.disabled || (tabMode && !item.tabMode)) {
      return;
    }

    let button = $ID(kID.ITEM + i);

    switch (item.type) {
      case 'button':
        // nothing to do
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
    Items[+button.id.replace(kID.ITEM, '')].command();
  }
}

function makeButtons() {
  let toolbar = $ID(kID.NAVIGATION_TOOLBAR);

  let hbox = $E('hbox');
  hbox.id = kID.CONTAINER;
  addEvent([hbox, 'click', doCommand, false]);

  Items.forEach(function(item, i) {
    if (item.disabled) {
      return;
    }

    let button = $E('button');

    button.id = kID.ITEM + i;
    button.className = kID.ITEM;

    if (item.type !== 'button') {
      button.setAttribute('type', item.type);
    }

    if (item.image) {
      button.setAttribute('image', item.image);
    } else {
      button.setAttribute('label', item.label);
    }

    button.setAttribute('tooltiptext', item.description);

    hbox.appendChild(button);
  });

  toolbar.appendChild(hbox);
}

function setStyleSheet() {
  // @note the styles are adjusted to the themes of my Firefox
  // @note on condition that the height of the toolbar-menubar is 24pt
  let css = '\
    #%%kID.CONTAINER%%{\
      margin:3px 0 3px 2px;\
    }\
    .%%kID.ITEM%%,\
    .%%kID.ITEM%%:focus{\
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

  setCSS(css.replace(/%%(.+?)%%/g, function($0, $1) eval($1)));
}


//********** Utilities

function $ID(aId) {
  return window.document.getElementById(aId);
}

function $E(aTag) {
  return window.document.createElement(aTag);
}


//********** Imports

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function setCSS(aCSS) {
  window.ucjsUtil.setChromeStyleSheet(aCSS);
}

function getPref(aKey, aDefaultValue) {
  return window.ucjsUtil.Prefs.get(aKey, aDefaultValue);
}

function setPref(aKey, aValue) {
  window.ucjsUtil.Prefs.set(aKey, aValue);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('PrefButton.uc.js', aMsg);
}


//********** Entry point

PrefButton_init();


})(this);
