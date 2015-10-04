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


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  Listeners: {
    $event,
    $shutdown
  },
  DOMUtils: {
    $E,
    $ID
  },
  CSSUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

/**
 * UI setting.
 */
const kUI = {
  container: {
    id: 'ucjs_PrefButton_container'
  },
  button: {
    // @note The id prefix of a button.
    // @note The class name for styling a button.
    id: 'ucjs_PrefButton_button'
  }
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
 *   A label text of a button.
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

    command() {
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

      return Modules.Prefs.get(key, value.linkOrImage) !== value.never;
    },

    command() {
      let {key, value} = this.pref;

      Modules.Prefs.set(key, this.checked ? value.never : value.linkOrImage);
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

      return Modules.Prefs.get(key, value.normal) !== value.none;
    },

    command() {
      let {key, value} = this.pref;

      Modules.Prefs.set(key, this.checked ? value.none : value.normal);

      // Immediately apply the new mode in the animate-able image document.
      if (gBrowser.contentDocument instanceof ImageDocument &&
          /^image\/(?:gif|png)$/.test(gBrowser.contentDocument.contentType)) {
        // @see chrome://browser/content/browser.js::BrowserReload
        window.BrowserReload();
      }
    }
  }//,
];

/**
 * Progress listener.
 */
const BrowserProgressListener = {
  onStateChange(aWebProgress, aRequest, aFlags, aStatus) {
    const {STATE_STOP, STATE_IS_WINDOW} = Ci.nsIWebProgressListener;

    if (aFlags & STATE_STOP &&
        aFlags & STATE_IS_WINDOW &&
        aWebProgress.DOMWindow === gBrowser.contentWindow) {
      updateState();
    }
  },

  onLocationChange() {},
  onProgressChange() {},
  onStatusChange() {},
  onSecurityChange() {}
};

function PrefButton_init() {
  setStyleSheet();
  makeButtons();

  $event(gBrowser, 'select', () => {
    updateState({tabMode: true});
  });

  gBrowser.addProgressListener(BrowserProgressListener);

  $shutdown(() => {
    gBrowser.removeProgressListener(BrowserProgressListener);
  });
}

function updateState(aOption = {}) {
  let {tabMode} = aOption;

  kItemList.forEach((item, i) => {
    if (item.disabled || (tabMode && !item.tabMode)) {
      return;
    }

    let button = $ID(kUI.button.id + i);

    switch (item.type) {
      case 'button': {
        // Nothing to do.
        break;
      }

      case 'checkbox': {
        if (button.checked !== item.checked) {
          button.checked = item.checked;
        }

        break;
      }
    }
  });
}

function doCommand(aEvent) {
  if (aEvent.button !== 0) {
    return;
  }

  let button = aEvent.target;

  if (button.id && button.id.startsWith(kUI.button.id)) {
    kItemList[+button.id.replace(kUI.button.id, '')].command();
  }
}

function makeButtons() {
  let toolbar = $ID('nav-bar');

  let container = $E('hbox', {
    id: kUI.container.id
  });

  $event(container, 'click', doCommand);

  kItemList.forEach((item, i) => {
    if (item.disabled) {
      return;
    }

    container.appendChild($E('button', {
      id: kUI.button.id + i,
      class: kUI.button.id,
      type: (item.type !== 'button') ? item.type : null,
      image: item.image,
      label: !item.image ? item.label : null,
      tooltiptext: item.description
    }));
  });

  toolbar.insertBefore(container, $ID('PanelUI-button'));
}

function setStyleSheet() {
  // @note The styles are adjusted to the themes of my Firefox and OS.
  CSSUtils.setChromeStyleSheet(`
    #${kUI.container.id} {
      margin: 3px 0 3px 2px;
    }
    .${kUI.button.id} {
      -moz-user-focus: ignore;
      -moz-appearance: none;
      min-width: 20px;
      height: 16px;
      margin: 0 2px 0 0;
      padding: 0;
      border: 1px solid #999;
      -moz-border-top-colors: none;
      -moz-border-right-colors: none;
      -moz-border-bottom-colors: none;
      -moz-border-left-colors: none;
      background: transparent none center center no-repeat;
      font: 8px "Arial";
    }
    .${kUI.button.id}:active,
    .${kUI.button.id}[checked=true] {
      border: 1px inset #ccc;
      background-color: #ffcccc;
    }
    .${kUI.button.id}:hover {
      cursor: pointer;
      opacity: .6;
    }
    .${kUI.button.id} > hbox {
      border: none;
      padding: 0;
    }
  `);
}

/**
 * Entry point.
 */
PrefButton_init();


})(this);
