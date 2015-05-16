// ==UserScript==
// @name NaviButton.uc.js
// @description Customizes the navigation buttons with an enhanced tooltip.
// @include main
// ==/UserScript==

// @require Util.uc.js
// @require [optional for referrer] TabEx.uc.js

// @note Some native functions are modified (see @modified).

/**
 * @usage
 * <Click>: Go back or forward a step if the history exists.
 * <Shift+Click>: Go to the border of the same domain of the current page.
 * <Ctrl+Click>: Go to the first or end stop of history.
 * @note A new tab will open in *foreground* by middle-button-click.
 *
 * [Special usage for the back-button with a referrer.]
 * <Shift+Ctrl+Click>: Select a tab with the referrer URL if already opens,
 * Open a tab in *foreground* otherwise.
 * @note The referrer's tab will open in *background* by middle-button-click.
 * @note Does the same action by <Click> for the back-button without backward
 * history.
 *
 * @see |History.jump()|
 */


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  Timer: {
    setTimeout,
    clearTimeout
  },
  createNode: $E,
  getNodeById: $ID,
  // Log to console for debug.
  logMessage: log
} = window.ucjsUtil;

/**
 * UI settings.
 */
const kUI = {
  tooltip: {
    id: 'ucjs_NaviButton_tooltip'
  },

  title: {
    noTitle:   'No title',
    noHistory: 'No history',
    ditto:     'Ditto'
  },

  form: {
    near: '%dir %title',
    far:  '%dir(%distance) %title'
  },

  sign: {
    prev:        '<',
    next:        '>',
    rewind:      '<<',
    fastforward: '>>',
    start:       '|<',
    end:         '>|',
    referrer:    'From:'
  },

  style: {
    title: 'font-weight:bold;',
    URL: '',
    referrer: 'color:blue;'
  }
};

/**
 * Key name for storing data.
 */
const kDataKey = {
  // @note An attribute name of the back button for the referrer check.
  referrer: 'ucjs_NaviButton_referrer'
};

/**
 * Fx native UI elements.
 */
const UI = {
  get backButton() {
    return $ID('back-button');
  },

  get forwardButton() {
    return $ID('forward-button');
  }
};

/**
 * Handler of a navigation button.
 */
const Button = {
  init(aButton) {
    if (!aButton) {
      return;
    }

    aButton.removeAttribute('tooltip');
    aButton.removeAttribute('onclick');
    aButton.removeAttribute('oncommand');

    this.preventDefaultCommand(aButton);

    aButton.addEventListener('mouseover', this, false);
    aButton.addEventListener('mouseout', this, false);
    aButton.addEventListener('click', this, false);
  },

  uninit(aButton) {
    if (!aButton) {
      return;
    }

    aButton.removeEventListener('mouseover', this, false);
    aButton.removeEventListener('mouseout', this, false);
    aButton.removeEventListener('click', this, false);
  },

  handleEvent(aEvent) {
    switch (aEvent.type) {
      case 'mouseover': {
        Tooltip.show(aEvent);

        break;
      }

      case 'mouseout': {
        Tooltip.hide(aEvent);

        break;
      }

      case 'click': {
        if (aEvent.button !== 2) {
          Tooltip.hide(aEvent);
          History.jump(aEvent);
          Tooltip.delayShow(aEvent);
        }

        break;
      }
    }
  },

  preventDefaultCommand(aButton) {
    let command =
      (aButton === UI.backButton) ? 'BrowserBack' : 'BrowserForward';

    // @modified chrome://browser/content/browser.js::BrowserBack
    // @modified chrome://browser/content/browser.js::BrowserForward
    let $func = window[command];
    window[command] = function(aEvent) {
      if (aEvent &&
          aEvent.sourceEvent &&
          aEvent.sourceEvent.target === aButton) {
        return;
      }

      $func.apply(this, [aEvent]);
    };
  }
};

/**
 * Progress listener.
 *
 * @see |NaviButton_init()|
 */
const BrowserProgressListener = {
  onLocationChange(aWebProgress, aRequest, aLocation, aFlag) {
    let backButton = UI.backButton;
    let referrerKey = kDataKey.referrer;

    if (!gBrowser.canGoBack && Referrer.exists()) {
      backButton.setAttribute(referrerKey, true);
    }
    else if (backButton.hasAttribute(referrerKey)) {
      backButton.removeAttribute(referrerKey);
    }
  },

  onProgressChange() {},
  onStateChange() {},
  onStatusChange() {},
  onSecurityChange() {}
};

/**
 * Referrer handler.
 *
 * @require TabEx.uc.js
 */
const Referrer = {
  get referrer() {
    // Lazy definition.
    delete this.referrer;

    return this.referrer =
      window.ucjsTabEx &&
      window.ucjsTabEx.referrer;
  },

  exists() {
    if (this.referrer) {
      return this.referrer.exists(gBrowser.selectedTab);
    }

    return false;
  },

  fetchInfo(aCallback) {
    this.referrer.fetchInfo(gBrowser.selectedTab, aCallback);
  }
};

/**
 * Tooltip handler.
 */
const Tooltip = {
  init() {
    this.tooltip = $ID('mainPopupSet').appendChild($E('tooltip', {
      id: kUI.tooltip.id
    }));
  },

  delayShow(aEvent) {
    const kTooltipShowDelay = 500; // [millisecond]

    this.timer = setTimeout(this.show.bind(this), kTooltipShowDelay, aEvent);
  },

  hide(aEvent) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.tooltip.hidePopup();
  },

  show(aEvent) {
    let button = aEvent.target;

    let backward = button === UI.backButton;
    let referrer = backward && Referrer.exists();
    let disabled = button.disabled;

    History.scan({
      backward,
      referrer,
      disabled
    },
    (aData) => {
      this.build(aData);
      this.tooltip.openPopup(button, 'after_start', 0, 0, false, false);
    });
  },

  build(aData) {
    let tooltip = this.tooltip;

    while (tooltip.hasChildNodes()) {
      tooltip.removeChild(tooltip.firstChild);
    }

    [
      'neighbor',
      'border',
      'stop',
      'referrer'
    ].
    forEach((key) => {
      let [title, URL] = this.formatData(aData, key);

      setLabel({
        title,
        referrer: key === 'referrer'
      });

      setLabel({
        URL
      });
    });

    function setLabel({title, URL, referrer}) {
      let value = title || URL;

      if (!value) {
        return;
      }

      let style = '';

      if (title) {
        style += kUI.style.title
      }

      if (URL) {
        style += kUI.style.URL
      }

      if (referrer) {
        style += kUI.style.referrer
      }

      let label = $E('label', {
        value,
        crop: 'center',
        style
      });

      tooltip.appendChild(label);
    }
  },

  formatData(aData, aKey) {
    let backward = aData.backward;
    let {title, URL, distance} = aData[aKey];
    let dir = '';

    if (URL && title === URL) {
      title = kUI.title.noTitle;
    }

    switch (aKey) {
      case 'neighbor': {
        dir = backward ? 'prev' : 'next';
        title = title || kUI.title.noHistory;

        break;
      }

      case 'border': {
        dir = backward ? 'rewind' : 'fastforward';

        if (distance === 1) {
          title = kUI.title.ditto;
          URL = '';
        }

        break;
      }

      case 'stop': {
        dir = backward ? 'start' : 'end';

        if (distance === 1) {
          title = '';
          URL = '';
        }
        else if (distance && aData.border.distance === distance) {
          title = kUI.title.ditto;
          URL = '';
        }

        break;
      }

      case 'referrer': {
        dir = 'referrer';

        break;
      }
    }

    if (title) {
      title = kUI.form[(distance < 2) ? 'near' : 'far'].
        replace('%dir', kUI.sign[dir]).
        replace('%distance', distance).
        replace('%title', title);
    }

    return [title, URL];
  }
};

/**
 * Session history handler.
 */
const History = {
  scan(aParam, aCallback) {
    this.initData(aParam, (aData) => {
      this.updateData(aParam, aData);
      aCallback(aData);
    });
  },

  initData(aParam, aCallback) {
    function Entry() {
      return {
        title: '',
        URL: '',
        index: -1,
        distance: 0
      };
    }

    let {backward, referrer} = aParam;

    // Make a new property.
    this.data = {
      backward,
      neighbor: Entry(),
      border:   Entry(),
      stop:     Entry(),
      referrer: Entry()
    };

    if (referrer) {
      Referrer.fetchInfo((aInfo) => {
        this.data.referrer.title = aInfo.title;
        this.data.referrer.URL = aInfo.URL;

        aCallback(this.data);
      });

      return;
    }

    aCallback(this.data);
  },

  updateData(aParam, aData) {
    let {backward, disabled} = aParam;

    if (disabled) {
      return;
    }

    let sh = this.getSessionHistory();

    if (!sh ||
        (backward && sh.index === 0) ||
        (!backward && sh.index === sh.count - 1)) {
      return;
    }

    let step = backward ? -1 : 1;
    let border = sh.index + step;

    let within = backward ? function(i) -1 < i : function(i) i < sh.count;
    let host = sh.getEntryAt(sh.index).host;

    for (; within(border); border += step) {
      if (host !== sh.getEntryAt(border).host) {
        break;
      }
    }

    [
      [aData.neighbor, sh.index + step],
      [aData.border, border - step],
      [aData.stop, backward ? 0 : sh.count - 1]
    ].
    forEach(([entry, index]) => {
      if (sh.index !== index) {
        let info = sh.getEntryAt(index);

        entry.title = info.title;
        entry.URL = info.URL;
        entry.index = index;
        entry.distance = Math.abs(index - sh.index);
      }
    });
  },

  getSessionHistory() {
    let sh = gBrowser.sessionHistory;

    if (sh) {
      return {
        index: sh.index,
        count: sh.count,
        getEntryAt
      };
    }

    return null;

    function getEntryAt(aIndex) {
      let info = {
        title: '',
        URL: '',
        host: ''
      };

      let entry = sh.getEntryAtIndex(aIndex, false);

      if (entry) {
        if (entry.title) {
          info.title = entry.title;
        }

        if (entry.URI) {
          info.URL = entry.URI.spec;
          try {
            info.host = entry.URI.host;
          }
          catch (ex) {
            info.host = entry.URI.scheme;
          }
        }
      }

      return info;
    }
  },

  jump(aEvent) {
    let {shiftKey, ctrlKey, button} = aEvent;

    let referrer = this.data.referrer.URL;

    if (referrer) {
      if (!gBrowser.canGoBack || (shiftKey && ctrlKey)) {
        selectOrOpen(referrer, {inBackground: button === 1});

        return;
      }
    }

    let index = -1;

    if (!shiftKey && !ctrlKey) {
      index = this.data.neighbor.index;
    }
    else if (shiftKey && !ctrlKey) {
      index = this.data.border.index;
    }
    else if (ctrlKey && !shiftKey) {
      index = this.data.stop.index;
    }

    if (index < 0) {
      return;
    }

    if (button === 1) {
      let delta = index - gBrowser.sessionHistory.index;

      // @see chrome://browser/content/browser.js::duplicateTabIn
      window.duplicateTabIn(gBrowser.selectedTab, 'tab', delta);
    }
    else {
      gBrowser.gotoIndex(index);
    }
  }
};

/**
 * Helper function.
 */
function selectOrOpen(aURL, aOption = {}) {
  function getURL(aTab) {
    let browser = gBrowser.getBrowserForTab(aTab);

    // @note |userTypedValue| holds the URL of a document till it successfully
    // loads.
    return browser.userTypedValue || browser.currentURI.spec;
  }

  let {inBackground} = aOption;

  let tabs = gBrowser.visibleTabs;

  for (let i = 0; i < tabs.length; i++) {
    if (getURL(tabs[i]) === aURL) {
      if (!inBackground) {
        gBrowser.selectedTab = tabs[i];
      }

      return;
    }
  }

  gBrowser.loadOneTab(aURL, {
    inBackground
  });
}

/**
 * Entry point.
 */
function NaviButton_init() {
  Button.init(UI.backButton);
  Button.init(UI.forwardButton);

  Tooltip.init();

  gBrowser.addProgressListener(BrowserProgressListener);

  window.addEventListener('unload', function onUnload() {
    window.removeEventListener('unload', onUnload, false);
    gBrowser.removeProgressListener(BrowserProgressListener);

    Button.uninit(UI.backButton);
    Button.uninit(UI.forwardButton);
  }, false);
}

NaviButton_init();


})(this);
