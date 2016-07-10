// ==UserScript==
// @name SpotFindResult.uc.js
// @description Highlight a result of the page find command to be easily
// noticed.
// @include main
// ==/UserScript==

// @require Util.uc.js

/**
 * @note The highlight will show even when a hidden text is caught by Fx's
 * behavior.
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
   * @value {integer} [millisecond > 0]
   */
  highlightDuration: 2000,

  /**
   * Setting of the border of a highlight box.
   *
   * inner: {hash}
   *   The inner portion of the border.
   *   width: {integer} [px > 0]
   *   color: {string} [CSS color]
   * outer: {hash}
   *   The outermost border for clearer visibility against dark background.
   *   width: {integer} [px > 0]
   *   color: {string} [CSS color]
   *     @note Set a bright color.
   */
  highlightBoxBorder: {
    inner: {
      width: 2,
      color: 'red'
    },
    outer: {
      width: 2,
      color: 'white'
    }
  }
};

/**
 * Highlighting handler.
 *
 * @return {hash}
 *   init: {function}
 *   start: {function}
 *   stop: {function}
 */
const Highlighting = (function() {
  /**
   * Terminates highlighting when the duration period expires.
   */
  const DurationObserver = {
    init() {
      // Make sure to clean up when the browser closes.
      $shutdown(this.terminate);
    },

    set() {
      this.timerId = setTimeout(this.terminate, kPref.highlightDuration);
    },

    clear() {
      if (this.timerId) {
        clearTimeout(this.timerId);

        this.timerId = null;
      }
    },

    terminate() {
      // @note |Highlighting.stop| calls |DurationObserver.clear|.
      stop();
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
      // @note Use the capture mode to catch the events anytime.
      // TODO: Fix disabled text selecting by drag in the highlight box.
      window.addEventListener('mousedown', this, true);
      window.addEventListener('keydown', this, true);
      window.addEventListener('wheel', this, true);
    },

    clear() {
      window.removeEventListener('mousedown', this, true);
      window.removeEventListener('keydown', this, true);
      window.removeEventListener('wheel', this, true);
    },

    handleEvent() {
      // @note |Highlighting.stop| calls |CancelObserver.clear|.
      stop();
    }
  };

  let vars = {
    initialized: false,
    highlightBox: null
  };

  function init() {
    DurationObserver.init();
    CancelObserver.init();
  }

  function start(findResultInfo) {
    vars.highlightBox = HighlightBox(findResultInfo);

    DurationObserver.set();
    CancelObserver.set();

    vars.highlightBox.show();

    vars.initialized = true;
  }

  function stop() {
    if (!vars.initialized) {
      return;
    }

    vars.initialized = null;

    DurationObserver.clear();
    CancelObserver.clear();

    vars.highlightBox.clear();
    vars.highlightBox = null;
  }

  return {
    init,
    start,
    stop
  };
})();

/**
 * Find command observer.
 *
 * @return {hash}
 *   init: {function}
 */
const FindCommandObserver = (function() {
  /**
   * Detects a short time interval of calls of command.
   *
   * @note Perform only the native processing when the command is called in
   * quick repeating (e.g. holding <F3> key down) because a highlighting is
   * useless when it is reset in a short time.
   */
  let isRepeating = (function() {
    /**
     * Max threshold interval time for a repeating command.
     *
     * @value {integer} [millisecond]
     */
    const kMaxInterval = 500;

    let lastTime = 0;

    return () => {
      let currentTime = window.performance.now();
      let interval = currentTime - lastTime;

      lastTime = currentTime;

      return interval < kMaxInterval;
    };
  })();

  function init() {
    Highlighting.init();

    // Observe the execution of Fx's find command.
    // TODO: Observe 'Finder:Result' message for e10s.
    $event(gBrowser.mPanelContainer, 'find', spotFindResult);
    $event(gBrowser.mPanelContainer, 'findagain', spotFindResult);
  }

  function spotFindResult() {
    // Terminate the active highlighting.
    Highlighting.stop();

    // Don't highlight in quick repeating of command.
    if (isRepeating()) {
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
  }

  /**
   * Promise for the information of the found result in the content process.
   */
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

    let getResult = (selection) => {
      if (selection && selection.rangeCount && !selection.isCollapsed) {
        return {
          view,
          range: selection.getRangeAt(0)
        };
      }

      return null;
    };

    // Test the normal selection.
    let result = getResult(view.getSelection());

    if (result) {
      return result;
    }

    // The selection can be into an editable element.
    for (let node of view.document.querySelectorAll('input, textarea')) {
      if (node instanceof Ci.nsIDOMNSEditableElement && node.editor) {
        let selection =
          node.editor.selectionController.
          getSelection(Ci.nsISelectionController.SELECTION_NORMAL);
        let result = getResult(selection);

        if (result) {
          return result;
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

  return {
    init
  };
})();

/**
 * Creates HighlightBox handler.
 *
 * @param findResultInfo {hash}
 * @return {hash}
 *   show: {function}
 *   clear: {function}
 */
function HighlightBox(findResultInfo) {
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

    let {
      inner: {
        width: innerBorderWidth
      },
      outer: {
        width: outerBorderWidth
      }
    } = kPref.highlightBoxBorder;

    let borderWidth = innerBorderWidth + outerBorderWidth;

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

    // The duration time for one cycle of a highlighting animation.
    // @note Divide the whole duration of highlighting by a proper value for
    // smooth animation.
    let animationDuration = kPref.highlightDuration / 10;

    let {
      inner: {
        width: innerBorderWidth,
        color: innerBorderColor
      },
      outer: {
        width: outerBorderWidth,
        color: outerBorderColor
      }
    } = kPref.highlightBoxBorder;

    let borderWidth = innerBorderWidth + outerBorderWidth;

    // The list of colors for '-moz-border-*-colors'.
    let borderColors =
      Array(outerBorderWidth).fill(outerBorderColor).concat(innerBorderColor).
      join(' ');

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
        animation: ${animationName} ${animationDuration}ms infinite alternate;
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

/**
 * Entry point
 */
function SpotFindResult_init() {
  FindCommandObserver.init();
}

SpotFindResult_init()


})(this);
