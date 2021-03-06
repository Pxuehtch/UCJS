// ==UserScript==
// @name SpotFindResult.uc.js
// @description Highlight a result of the page find command.
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
    id: 'ucjs_SpotFindResult_highlightBox'
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
      // Observe the user actions to cancel the highlighting.
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
   * Wait for trigger events just after the find command, and then highlight
   * a find result.
   * - The command event by clicking the triangle button for find-again in the
   *   findbar.
   * - The keyup event by typing in the findbar.
   * - The keyup event by pressing <F3/ctrl+g> for find-again. This provides
   *   to skip highlighting when the find-again command is called in quick
   *   repeating by holding <F3/ctrl+g> down.
   */
  const HighlightTrigger = (function() {
    let listener = null;

    function addListener(resolve) {
      // Clear existing listener.
      removeListener();

      listener = () => {
        removeListener();

        resolve();
      };

      gBrowser.mPanelContainer.addEventListener('command', listener);
      // @note Use the capture mode to catch the key event anytime.
      window.addEventListener('keyup', listener, true);
    }

    function removeListener() {
      if (!listener) {
        return;
      }

      gBrowser.mPanelContainer.removeEventListener('command', listener);
      window.removeEventListener('keyup', listener, true);

      listener = null;
    }

    function wait() {
      return new Promise(addListener);
    }

    return {
      wait
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

    HighlightTrigger.wait().then(() => {
      // TODO: Check whether tasks could be queued or not. If they could, we
      // must terminate the elders.
      promiseFindResultInfo().then((findResultInfo) => {
        if (!findResultInfo) {
          return;
        }

        Highlighting.start(findResultInfo);
      }).
      catch(Cu.reportError);
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
  /**
   * Animation manager.
   */
  const Animation = {
    start() {
      this.animation = vars.box.animate(
        [
          {
            opacity: 0.2
          },
          {
            opacity: 1
          }
        ],
        {
          // The duration time for one cycle of a highlighting animation.
          // @note Divide the whole duration of highlighting by a proper value
          // for smooth animation.
          duration: kPref.highlightDuration / 10,
          direction: 'alternate',
          iterations: Infinity
        }
      );
    },

    stop() {
      if (!this.animation) {
        return;
      }

      this.animation.cancel();
      this.animation = null;
    }
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

    Animation.start();
  }

  function hide() {
    vars.box.hidePopup();

    Animation.stop();
  }

  function clear() {
    hide();

    vars.box = null;
  }

  function getBox() {
    let {id} = kUI.highlightBox;

    let box = $ID(id);

    if (box) {
      return box;
    }

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
