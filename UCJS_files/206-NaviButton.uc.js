// ==UserScript==
// @name        NaviButton.uc.js
// @description Customizes the navigation buttons with a enhanced tooltip.
// @include     main
// ==/UserScript==

// @require Util.uc.js, TabEx.uc.js
// @note Some default functions are modified. search @modified.

/**
 * @usage If 'middle click', a new tab will open.
 *   click: go back or forward a step. (On the back-button with a referrer, a new tab opens.)
 *   shift+click: go to the border of the same domain of the current page.
 *   ctrl+click: go to the stop of history.
 * @see mHistory.jump().
 */


(function() {


"use strict";


// Preferences.

const kID = {
  // Default.
  BACK_BUTTON:    'back-button',
  FORWARD_BUTTON: 'forward-button',

  // Custom.
  TOOLTIP:  'ucjs_navibutton_tooltip',
  REFERRER: 'ucjs_navibutton_referrer'
};

const kBundle = {
  title: {
    NOTITLE:   'No title',
    NOHISTORY: 'No history',
    DITTO:     'Ditto'
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
    referrer:    'Ref:'
  }
};

const kStyle = {
  title: 'font-weight:bold;',
  referrer: 'color:blue;'
};


// Handlers.

/**
 * Handler of a navigation button.
 */
var mButton = {
  init: function(aButton) {
    if (!aButton)
      return;

    aButton.removeAttribute('tooltip');
    aButton.removeAttribute('onclick');
    aButton.removeAttribute('oncommand');

    this.preventCommand(aButton);

    aButton.addEventListener('mouseover', this, false);
    aButton.addEventListener('mouseout', this, false);
    aButton.addEventListener('click', this, false);
  },

  uninit: function(aButton) {
    if (!aButton)
      return;

    aButton.removeEventListener('mouseover', this, false);
    aButton.removeEventListener('mouseout', this, false);
    aButton.removeEventListener('click', this, false);
  },

  handleEvent: function(aEvent) {
    switch (aEvent.type) {
      case 'mouseover':
        mTooltip.show(aEvent);
        break;
      case 'mouseout':
        mTooltip.hide(aEvent);
        break;
      case 'click':
        if (aEvent.button !== 2) {
          mTooltip.hide(aEvent);
          mHistory.jump(aEvent);
          mTooltip.delayShow(aEvent);
        }
        break;
    }
  },

  preventCommand: function(aButton) {
    var command = (aButton.id === kID.BACK_BUTTON) ? 'BrowserBack' : 'BrowserForward';

    // @modified chrome://browser/content/browser.js::BrowserBack
    // @modified chrome://browser/content/browser.js::BrowserForward
    var $func = window[command];
    window[command] = function(aEvent) {
      if (aEvent &&
          aEvent.sourceEvent &&
          aEvent.sourceEvent.target.id === aButton.id)
        return;

      $func.apply(this, arguments);
    };
  }
};


/**
 * Progress listener.
 * @see NaviButton_init().
 */
var mBrowserProgressListener = {
  onLocationChange: function(aWebProgress, aRequest, aLocation, aFlag) {
    var back = $(kID.BACK_BUTTON);

    if (!gBrowser.canGoBack && mReferrer.exists()) {
      back.setAttribute(kID.REFERRER, true);
    } else if (back.hasAttribute(kID.REFERRER)) {
      back.removeAttribute(kID.REFERRER);
    }
  },

  onProgressChange: function() {},
  onStateChange: function() {},
  onStatusChange: function() {},
  onSecurityChange: function() {}
};


/**
 * Handler of referrer.
 * @note Declared in TabEx.uc.js
 */
var mReferrer = {
  get ref() {
    delete this.ref;
    return this.ref = (ucjsTabEx && ucjsTabEx.referrer);
  },

  exists: function()
    this.ref && this.ref.exists(gBrowser.mCurrentTab),

  getURL: function()
    this.ref && this.ref.getURL(gBrowser.mCurrentTab),

  getTitle: function()
    this.ref && this.ref.getTitle(gBrowser.mCurrentTab)
};


/**
 * Handler of a tooltip panel.
 */
var mTooltip = {
  init: function() {
    this.tooltip = $('mainPopupSet').appendChild($E('tooltip'));
    this.tooltip.id = kID.TOOLTIP;
  },

  delayShow: function(aEvent) {
    this.timer = setTimeout(this.show.bind(this), 500, aEvent);
  },

  hide: function(aEvent) {
    if (this.timer) {
      clearTimeout(this.timer);
      delete this.timer;
    }

    this.tooltip.hidePopup();
  },

  show: function(aEvent) {
    var btn = aEvent.target;

    var isBackButton = (btn.id === kID.BACK_BUTTON);
    var disabled = btn.disabled;
    var hasReferrer = isBackButton && mReferrer.exists();

    this.build(mHistory.scan(isBackButton, disabled, hasReferrer));

    this.tooltip.openPopup(btn, 'after_start', 0, 0, false, false);
  },

  build: function(aData) {
    var tooltip = this.tooltip;

    while (tooltip.hasChildNodes()) {
      tooltip.removeChild(tooltip.firstChild);
    }

    ['neighbor', 'border', 'stop', 'referrer'].
    forEach(function(key) {
      var [title, URL] = this.formatData(aData, key);
      setLabel(title, true, key === 'referrer');
      setLabel(URL);
    }, this);

    function setLabel(aVal, aTitle, aReferrer) {
      if (!aVal)
        return;

      var label = $E('label');
      label.setAttribute('value', aVal);
      label.setAttribute('crop', 'center');

      var style = '';
      if (aTitle) {
        style += kStyle.title
      }
      if (aReferrer) {
        style += kStyle.referrer
      }
      if (style) {
        label.setAttribute('style', style);
      }

      tooltip.appendChild(label);
    }
  },

  formatData: function(aData, aKey) {
    var back = aData.backward;
    var {title, URL, distance} = aData[aKey];
    var dir = '';

    if (URL && title === URL) {
      title = kBundle.title.NOTITLE;
    }

    switch (aKey) {
      case 'neighbor':
        dir = back ? 'prev' : 'next';
        title = title || kBundle.title.NOHISTORY;
        break;
      case 'border':
        dir = back ? 'rewind' : 'fastforward';
        if (distance === 1) {
          title = kBundle.title.DITTO;
          URL = '';
        }
        break;
      case 'stop':
        dir = back ? 'start' : 'end';
        if (distance === 1) {
          title = '';
          URL = '';
        } else if (distance && aData.border.distance === distance) {
          title = kBundle.title.DITTO;
          URL = '';
        }
        break;
      case 'referrer':
        dir = 'referrer';
        break;
    }

    if (title) {
      title = kBundle.form[(distance < 2) ? 'near' : 'far'].
        replace('%dir', kBundle.sign[dir]).
        replace('%distance', distance).
        replace('%title', title);
    }

    return [title, URL];
  }
};


/**
 * Handler of history.
 */
var mHistory = {
  initData: function(aBackward, aReferrer) {
    function Entry() {
      return {title: '', URL: '', index: -1, distance: 0};
    }

    var data = {
      backward: aBackward,
      neighbor: Entry(),
      border:   Entry(),
      stop:     Entry(),
      referrer: Entry()
    };

    if (aReferrer) {
      data.referrer.title = mReferrer.getTitle();
      data.referrer.URL = mReferrer.getURL();
    }

    return this.data = data;
  },

  jump: function(aEvent) {
    var btn = aEvent.target;

    if (btn.hasAttribute(kID.REFERRER)) {
      openReferrer();
      return;
    }

    var idx = this.data.neighbor.index;
    if (aEvent.shiftKey) {
      idx = this.data.border.index;
    } else if (aEvent.ctrlKey) {
      idx = this.data.stop.index;
    }

    if (idx < 0)
      return;

    if (aEvent.button === 1) {
      gBrowser.selectedTab = gBrowser.duplicateTab(gBrowser.mCurrentTab);
    }
    gBrowser.webNavigation.gotoIndex(idx);
  },

  scan: function(aBackward, aDisabled, aReferrer) {
    var back = aBackward;
    var data = this.initData(back, aReferrer);
    var sh = this.getSessionHistory();

    if (!sh || aDisabled)
      return data;
    if ((back && sh.index === 0) || (!back && sh.index === sh.count - 1))
      return data;

    var step = back ? -1 : 1;
    var border = sh.index + step;

    var within = back ? function(i) -1 < i : function(i) i < sh.count;
    var host = sh.getEntryAt(sh.index).host;

    for (; within(border); border += step) {
      if (host !== sh.getEntryAt(border).host)
        break;
    }

    [
      [data.neighbor, sh.index + step],
      [data.border, border - step],
      [data.stop, back ? 0 : sh.count - 1]
    ].
    forEach(function([entry, dist]) {
      if (sh.index !== dist) {
        let src = sh.getEntryAt(dist);
        entry.title = src.title;
        entry.URL = src.URL;
        entry.index = dist;
        entry.distance = Math.abs(dist - sh.index);
      }
    });

    return data;
  },

  getSessionHistory: function() {
    var sh = gBrowser.sessionHistory;
    if (sh) {
      return {index: sh.index, count: sh.count, getEntryAt: getEntryAt};
    }
    return null;

    function getEntryAt(aIdx) {
      var info = {title: '', URL: '', host: ''};

      var entry = gBrowser.sessionHistory.getEntryAtIndex(aIdx, false);
      if (entry) {
        if (entry.title) {
          info.title = entry.title;
        }
        if (entry.URI) {
          info.URL = entry.URI.spec;
          try {
            info.host = entry.URI.host;
          } catch (e) {
            info.host = entry.URI.scheme;
          }
        }
      }

      return info;
    }
  }
};


// Utilities.

function openReferrer() {
  var tabs = gBrowser.mTabs;
  var referrer = mReferrer.getURL();

  for (let i = 0; i < tabs.length; i++) {
    if (gBrowser.getBrowserAtIndex(i).currentURI.spec === referrer) {
      gBrowser.selectedTab = tabs[i];
      return;
    }
  }
  gBrowser.loadOneTab(referrer);
}

function $(aId)
  document.getElementById(aId);

function $E(aTag)
  document.createElement(aTag);


// Imports.

function log(aStr)
  ucjsUtil.logMessage('NaviButton.uc.js', aStr);


// Main.

function NaviButton_init() {
  var back = $(kID.BACK_BUTTON), forward = $(kID.FORWARD_BUTTON);

  mButton.init(back);
  mButton.init(forward);

  mTooltip.init();

  gBrowser.addProgressListener(mBrowserProgressListener);

  window.addEventListener('unload', function cleanup() {
    window.removeEventListener('unload', cleanup, false);
    gBrowser.removeProgressListener(mBrowserProgressListener);
    mButton.uninit(back);
    mButton.uninit(forward);
  }, false);
}

NaviButton_init();


})();
