// ==UserScript==
// @name PrefButton.uc.js
// @description Adds buttons for setting the preferences.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @usage Buttons are appended on the navigation toolbar.

// @note Some about:config preferences are changed (see @prefs).

// @note The button styles are adjusted to the themes of my Fx and OS.
// @see |setStyleSheet()|

// TODO: Support the customizable UI.
// TODO: Observe state changes in an external process and update our buttons.


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  ContentTask,
  Listeners: {
    $event,
    $page
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
 *   'checkbox': A toggle button with checked/unchecked states.
 * @param label {string}
 *   A label text of a button.
 * @param image {URL string} [optional]
 *   The image instead of the label text of a button.
 * @param description {string}
 *   @note Used as a tooltip text.
 * @param checkState {function} [required for 'checkbox' type]
 *   @return {Promise}
 *     Promise for the state of checkbox button should be checked or not.
 * @param command {function}
 *   @param aChecked {boolean} [optional for 'checkbox' type]
 *     The state of checkbox button changes to checked or not.
 * @param disabled {boolean} [optional]
 */
const kItemList = [
  {
    // Switch CSS for each tab.
    tabMode: true,
    type: 'checkbox',
    label: 'CSS',
    description: 'Switch CSS (Tab)',

    checkState() {
      return ContentTask.spawn(function*() {
        return !docShell.contentViewer.authorStyleDisabled;
      });
    },

    command(aChecked) {
      if (aChecked) {
        // Apply the default stylesheet.
        // @see chrome://browser/content/browser.js::gPageStyleMenu
        window.gPageStyleMenu.switchStyleSheet('');
      }
      else {
        // @see chrome://browser/content/browser.js::gPageStyleMenu
        window.gPageStyleMenu.disableStyle();
      }
    }
  },
  {
    // Switch the referrer header sending.
    type: 'checkbox',
    label: 'Ref.',
    description: 'Switch Referrer sending',

    // @prefs
    // 0: Never send the referrer header.
    // 1: Send when clicking on a link.
    // 2: Send when clicking on a link or loading an image [default].
    // @see http://kb.mozillazine.org/Network.http.sendRefererHeader
    prefs: PrefsManager({
      name: 'network.http.sendRefererHeader',
      values: {
        'never': 0,
        'link': 1,
        'linkOrImage': 2
      }
    }),

    checkState() {
      let shouldCheck = this.prefs.get() !== 'never';

      return Promise.resolve(shouldCheck);
    },

    command(aChecked) {
      this.prefs.set(aChecked ? 'linkOrImage' : 'never');
    }
  },
  {
    // Switch the image animation.
    type: 'checkbox',
    label: 'GIF',
    description: 'Switch GIF animation',

    // @prefs
    // 'none': Prevent image animation.
    // 'once': Let the image animate once.
    // 'normal': Allow it to play over and over [default].
    // @see http://kb.mozillazine.org/Animated_images
    prefs: PrefsManager({
      name: 'image.animation_mode',
      values: {
        'none': 'none',
        'once': 'once',
        'normal': 'normal'
      }
    }),

    checkState() {
      let shouldCheck = this.prefs.get() !== 'none';

      return Promise.resolve(shouldCheck);
    },

    command(aChecked) {
      this.prefs.set(aChecked ? 'normal' : 'none');

      // Immediately apply the new mode in the animate-able image document.
      if (/^image\/(?:gif|png)$/.
        test(gBrowser.selectedBrowser.documentContentType)) {
        // @see chrome://browser/content/browser.js::BrowserReload
        window.BrowserReload();
      }
    }
  }//,
];

function PrefButton_init() {
  makeButtons();

  $page('pageshow', () => {
    updateState();
  });

  $page('pageselect', (aEvent) => {
    // If a document is loading, 'pageshow' event will fire after loaded and
    // update all buttons for the new document.
    if (aEvent.readyState !== 'complete') {
      return;
    }

    // Enough to update only tab mode buttons if an existing tab is selected
    // without any loading.
    updateState({
      tabMode: true
    });
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
        item.checkState().then((aShouldCheck) => {
          if (button.checked !== aShouldCheck) {
            button.checked = aShouldCheck;
          }
        }).
        catch(Cu.reportError);

        break;
      }
    }
  });
}

function doCommand(aEvent) {
  if (aEvent.button !== 0) {
    return;
  }

  let {id, checked} = aEvent.target;

  if (id && id.startsWith(kUI.button.id)) {
    kItemList[+id.replace(kUI.button.id, '')].command(checked);
  }
}

function makeButtons() {
  setStyleSheet();

  let toolbar = $ID('nav-bar');

  let container = $E('hbox', {
    id: kUI.container.id
  });

  // XXX: I can't handle the 'command' event on <hbox>.
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
 * Preferences manager.
 */
function PrefsManager(prefsData) {
  let data = {
    name: prefsData.name,
    values: prefsData.values
  };

  function get() {
    let value = Modules.Prefs.get(data.name);

    for (let key in data.values) {
      if (data.values[key] === value) {
        return key;
      }
    }

    return null;
  }

  function set(value) {
    return Modules.Prefs.set(data.name, data.values[value]);
  }

  return {
    get,
    set
  };
}

/**
 * Entry point.
 */
PrefButton_init();


})(this);
