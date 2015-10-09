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


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  Listeners: {
    $shutdown
  },
  DOMUtils: {
    $E,
    $ID
  },
  HistoryUtils: {
    promiseSessionHistory
  },
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

// Extract usual functions.
const {
  Timer: {
    setTimeout,
    clearTimeout
  }
} = Modules;

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

    aButton.addEventListener('mouseover', this);
    aButton.addEventListener('mouseout', this);
    aButton.addEventListener('click', this);
  },

  uninit(aButton) {
    if (!aButton) {
      return;
    }

    aButton.removeEventListener('mouseover', this);
    aButton.removeEventListener('mouseout', this);
    aButton.removeEventListener('click', this);
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

  promiseInfo() {
    return this.referrer.promiseInfo(gBrowser.selectedTab);
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
    }).
    then((historyData) => {
      this.build(historyData);

      this.tooltip.openPopup(button, 'after_start', 0, 0, false, false);
    }).
    catch(Cu.reportError);
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
  scan(params) {
    return this.initHistoryData(params).then((data) => {
      return this.updateHistoryData(params, data).then(() => data);
    });
  },

  initHistoryData(params) {
    return Task.spawn(function*() {
      function Entry() {
        return {
          title: '',
          URL: '',
          index: -1,
          distance: 0
        };
      }

      let {backward, referrer} = params;

      // Make a new property.
      this.data = {
        backward,
        neighbor: Entry(),
        border:   Entry(),
        stop:     Entry(),
        referrer: Entry()
      };

      if (referrer) {
        let referrerInfo = yield Referrer.promiseInfo();

        this.data.referrer.title = referrerInfo.title;
        this.data.referrer.URL = referrerInfo.URL;
      }

      return this.data;
    }.bind(this));
  },

  updateHistoryData(params, data) {
    return Task.spawn(function*() {
      let {backward, disabled} = params;

      if (disabled) {
        return data;
      }

      let sessionHistory = yield promiseSessionHistory();

      if (!sessionHistory) {
        return data;
      }

      let {
        index: historyIndex,
        count: historyCount,
        entries: historyEntries
      } = sessionHistory;

      if ((backward && historyIndex === 0) ||
          (!backward && historyIndex === historyCount - 1)) {
        return data;
      }

      let step = backward ? -1 : 1;
      let border = historyIndex + step;

      let within = backward ? (i) => -1 < i : (i) => i < historyCount;
      let host = getHost(historyEntries[historyIndex].URL);

      for (/**/; within(border); border += step) {
        if (host !== getHost(historyEntries[border].URL)) {
          break;
        }
      }

      [
        [data.neighbor, historyIndex + step],
        [data.border, border - step],
        [data.stop, backward ? 0 : historyCount - 1]
      ].
      forEach(([entry, index]) => {
        if (historyIndex !== index) {
          let info = historyEntries[index];

          entry.title = info.title;
          entry.URL = info.URL;
          entry.index = index;
          entry.distance = Math.abs(index - historyIndex);
        }
      });

      return data
    });
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
      Task.spawn(function*() {
        let sessionHistory = yield promiseSessionHistory();
        let delta = index - sessionHistory.index;

        // @see chrome://browser/content/browser.js::duplicateTabIn
        window.duplicateTabIn(gBrowser.selectedTab, 'tab', delta);
      }).
      catch(Cu.reportError);
    }
    else {
      gBrowser.gotoIndex(index);
    }
  }
};

/**
 * Helper function.
 */
function getHost(url) {
  if (!url) {
    return null;
  }

  try {
    return Modules.BrowserUtils.makeURI(url).host;
  }
  catch (ex) {}

  // Return scheme.
  return /^(\w+):/.exec(url)[1];
}

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

  $shutdown(() => {
    gBrowser.removeProgressListener(BrowserProgressListener);

    Button.uninit(UI.backButton);
    Button.uninit(UI.forwardButton);
  });
}

NaviButton_init();


})(this);
