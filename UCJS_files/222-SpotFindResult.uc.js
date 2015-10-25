// ==UserScript==
// @name SpotFindResult.uc.js
// @description Highlight a result of the page find command to be easily
// noticed.
// @include main
// ==/UserScript==

// @require Util.uc.js

/**
 * @note The highlight shows with no found text when a hidden text is caught
 * by Fx's behavior.
 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=407817
 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=622801
 */


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules: {
    Timer: {
      setTimeout,
      clearTimeout
    }
  },
  ContentTask,
  Listeners: {
    $message,
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
	highlightBox: {
		id: 'ucjs_SpotFindResult_highlightBox',
		animationName: 'ucjs_SpotFindResult_highlightAnimation'
	}
};

/**
 * Preferences
 */
const kPref = {
  /**
   * Duration time of highlighting.
   *
   * @value {integer} [millisecond]
   */
  duration: 2000,

  /**
   * Setting of the blinking border of the highlight box.
   *
   * interval: {integer} [millisecond]
   *   Interval time for one blink.
   * width: {integer} [px]
   * color: {string} [CSS color]
   *
   * @note Another bright color border is added outside of this border for
   * clearer visibility against dark background.
   * @see |HighlightBox()|
   */
  blink: {
    interval: 200,
    width: 2,
    color: 'red'
  }
};

/**
 * Terminates highlighting when the duration period expires.
 */
const DurationObserver = {
  init() {
    // Make sure to clean up when the browser closes.
    $shutdown(this.terminate);
  },

  set() {
    this.timerId = setTimeout(this.terminate, kPref.duration);
  },

  clear() {
    if (this.timerId) {
      clearTimeout(this.timerId);

      this.timerId = null;
    }
  },

  terminate() {
    // @note |Highlighting.stop| calls |DurationObserver.clear|.
    Highlighting.stop();
  }
};

/**
 * Cancels useless highlighting.
 */
const CancelObserver = {
  init() {
    // Make sure to clean up when the browser closes.
    $shutdown(this);
  },

  set() {
    // Observe the user actions to be cancelled the highlighting.
    // @note Add the events on |window| to cancel by actions on wherever in
    // the browser window.
    // TODO: Fix disabled text selecting by drag in the highlight box.
    window.addEventListener('mousedown', this);
    window.addEventListener('keydown', this);
    window.addEventListener('wheel', this);
  },

  clear() {
    window.removeEventListener('mousedown', this);
    window.removeEventListener('keydown', this);
    window.removeEventListener('wheel', this);
  },

  handleEvent() {
    // @note |Highlighting.stop| calls |CancelObserver.clear|.
    Highlighting.stop();
  }
};

/**
 * Highlighting handler.
 */
const Highlighting = {
  init() {
    DurationObserver.init();
    CancelObserver.init();
  },

  start(findResultInfo) {
    this.highlightBox = HighlightBox(findResultInfo);

    DurationObserver.set();
    CancelObserver.set();

    this.highlightBox.show();

    this.initialized = true;
  },

  stop() {
    if (!this.initialized) {
      return;
    }

    this.initialized = null;

    DurationObserver.clear();
    CancelObserver.clear();

    this.highlightBox.clear();
    this.highlightBox = null;
  }
};

/**
 * Find command observer.
 */
const FindCommandObserver = {
  /**
   * Max threshold interval time for a repeating command.
   *
   * @value {integer} [millisecond]
   */
  maxIntervalForRepeating: 500,

  lastTime: 0,

  /**
   * Detects a short time interval of calls of command.
   *
   * @note Perform only the native processing when the command is called in
   * quick repeating (e.g. holding <F3> key down) because a highlighting is
   * useless when it is reset in a short time.
   */
  isRepeating() {
    let currentTime = window.performance.now();
    let interval = currentTime - this.lastTime;

    this.lastTime = currentTime;

    return interval < this.maxIntervalForRepeating;
  }
};

/**
 * Creates HighlightBox handler.
 *
 * @param findResultInfo {hash}
 * @return {hash}
 *   show: {function}
 *   clear: {function}
 */
function HighlightBox(findResultInfo) {
  /**
   * The outermost border for clearer visibility against dark background.
   *
   * width: {integer} [px]
   * color: {string} [CSS color]
   *   @note Set a bright color.
   */
  const kOuterBorder = {
    width: 2,
    color: 'white'
  };

  let vars = {
    box: null
  };

  // Initialize.
  init(findResultInfo);

  function init(findResultInfo) {
    let box = getBox();

    let {screenX, width} = gBrowser.selectedBrowser.boxObject;
    let {top, bottom} = findResultInfo.findResultRect;
    let innerScreenY = findResultInfo.innerScreenY;
    let fullZoom = findResultInfo.fullZoom;
    let borderWidth = kPref.blink.width + kOuterBorder.width;

    box.left = screenX;
    box.top = ((top + innerScreenY) * fullZoom) - borderWidth;
    box.width = width;
    box.height = ((bottom - top) * fullZoom) + (borderWidth * 2);

    vars.box = box;
  }

  function show() {
    // Hide existing highlight.
    if (vars.box.state === 'open') {
      hide();
    }

    vars.box.openPopupAtScreen(vars.box.left, vars.box.top);

    // Start animation from the beginning.
    vars.box.style.animation = '';
  }

  function hide() {
    vars.box.hidePopup();

    // Suppress animation.
    vars.box.style.animation = 'none';
  }

  function clear() {
    hide();

    vars.box = null;
  }

  function getBox() {
    let {id, animationName} = kUI.highlightBox;

    let box = $ID(id);

    if (box) {
      return box;
    }

    let {interval, width: innerWidth, color: innerColor} = kPref.blink;
    let {width: outerWidth, color: outerColor} = kOuterBorder;

    let borderWidth = innerWidth + outerWidth;
    let borderColors =
      Array(outerWidth).fill(outerColor).concat(innerColor).join(' ');

    CSSUtils.setChromeStyleSheet(`
      #${id} {
        -moz-appearance: none !important;
        margin: 0;
        padding: 0;
        max-width: none;
        background: transparent;
        border: ${borderWidth}px solid transparent;
        border-left: none;
        border-right: none;
        -moz-border-top-colors: ${borderColors};
        -moz-border-bottom-colors: ${borderColors};
        animation: ${animationName} ${interval}ms infinite alternate;
      }
      @keyframes ${animationName} {
        from {
          opacity: .2;
        }
        to {
          opacity: 1;
        }
      }
    `);

    // WORKAROUND: Use <tooltip> instead of <panel> since the transparent
    // background becomes black in using <panel>.
    // @see https://bugzilla.mozilla.org/show_bug.cgi?id=436003
    return $ID('mainPopupSet').appendChild($E('tooltip', {
      id
    }));
  }

  /**
   * Expose
   */
  return {
    show,
    clear
  };
}

function SpotFindResult_init() {
  Highlighting.init();

  // Observe the execution of Fx's find command.
  // WORKAROUND: 'Finder:Result' returns the rect of found text, but its value
  // seems not to be suitable for our use. So we retrieve it by own function.
  $message('Finder:Result', () => {
    // Terminate the active highlighting.
    Highlighting.stop();

    // Don't highlight in quick repeating of command.
    if (FindCommandObserver.isRepeating()) {
      return;
    }

    // TODO: Check whether tasks could be queued or not. If they could, we
    // must terminate the elders.
    promiseFindResultInfo().then((findResultInfo) => {
      if (!findResultInfo) {
        return;
      }

      Highlighting.start(findResultInfo);
    }).
    catch(Cu.reportError);
  });
}

function promiseFindResultInfo() {
  return ContentTask.spawn(`function*() {
    ${content_getFindResult.toString()}
    ${content_getFindResultRect.toString()}

    let findResult = content_getFindResult();

    if (!findResult) {
      return null;
    }

    return {
      findResultRect: content_getFindResultRect(findResult.range),
      innerScreenY: findResult.view.mozInnerScreenY,
      fullZoom: findResult.view.getInterface(Ci.nsIDOMWindowUtils).fullZoom
    };
  }`);
}

function content_getFindResult(view = content.window) {
  // Recursively scan into sub frame windows.
  if (view.frames.length) {
    for (let i = 0, l = view.frames.length; i < l; i++) {
      let findResult = content_getFindResult(view.frames[i]);

      if (findResult) {
        return findResult;
      }
    }
  }

  let testSelection = (selection) =>
    selection && selection.rangeCount && !selection.isCollapsed;

  let selection = view.getSelection();

  if (testSelection(selection)) {
    return {
      view,
      range: selection.getRangeAt(0)
    };
  }

  // The selection can be into an input or a textarea element.
  for (let node of view.document.querySelectorAll('input, textarea')) {
    if (node instanceof Ci.nsIDOMNSEditableElement && node.editor) {
      selection =
        node.editor.selectionController.
        getSelection(Ci.nsISelectionController.SELECTION_NORMAL);

      if (testSelection(selection)) {
        return {
          view,
          range: selection.getRangeAt(0)
        };
      }
    }
  }

  // No find result in this window.
  return null;
}

function content_getFindResultRect(range) {
  // Collect necessary properties for our use.
  let {top, bottom} = range.getBoundingClientRect();

  return {top, bottom};
}

/**
 * Entry point
 */
SpotFindResult_init()


})(this);
