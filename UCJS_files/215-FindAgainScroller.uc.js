// ==UserScript==
// @name FindAgainScroller.uc.js
// @description Customizes the scroll style on <Find again> command.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @note A native function |gFindBar.onFindAgainCommand| is modified (see
// @modified).


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
  getNodesByXPath: $X,
  setChromeStyleSheet: setCSS
} = window.ucjsUtil;

// For debugging.
function log(aMsg) {
  return window.ucjsUtil.logMessage('FindAgainScroller.uc.js', aMsg);
}

const {
  FindBar
} = window.ucjsUI;

/**
 * UI setting.
 */
const kUI = {
  highlightBox: {
    id: 'ucjs_FindAgainScroller_highlightBox',
    animationName: 'ucjs_FindAgainScroller_highlightAnimation'
  }
};

/**
 * Custom event type.
 */
const kEventType = {
  SmoothScroll: 'ucjs_FindAgainScroller_SmoothScroll'
};

/**
 * Preferences
 */
const kPref = {
  /**
   * Skip a found text that a user can not see.
   *
   * @value {boolean}
   */
  skipInvisible: true,

  /**
   * Center a found text horizontally.
   *
   * @value {boolean}
   */
  horizontalCentered: true,

  /**
   * Scroll smoothly to a found text.
   *
   * @value {boolean}
   */
  smoothScroll: true,

  /**
   * Highlight a found text.
   *
   * @value {boolean}
   */
  foundHighlight: true
};

/**
 * Wrapper of the finder of the current tab.
 *
 * @see resource://gre/modules/Finder.jsm
 */
const TextFinder = {
  get finder() {
    return gBrowser.finder;
  },

  get isResultFound() {
    let {foundEditable, currentWindow} = this.finder._fastFind;

    return !!(foundEditable || currentWindow);
  },

  get selectionController() {
    let {foundEditable, currentWindow} = this.finder._fastFind;

    if (foundEditable) {
      try {
        return foundEditable.
          QueryInterface(Ci.nsIDOMNSEditableElement).
          editor.
          selectionController;
      }
      catch (ex) {}

      return null;
    }

    if (currentWindow) {
      return this.finder._getSelectionController(currentWindow);
    }

    return null;
  },

  get selectionRange() {
    let selectionController = this.selectionController;

    if (selectionController) {
      return selectionController.
        getSelection(Ci.nsISelectionController.SELECTION_NORMAL).
        getRangeAt(0);
    }

    return null;
  }
};

/**
 * Handler of a custom find-again command.
 *
 * @return {hash}
 *   init: {function}
 */
const FindAgainCommand = (function() {
  /**
   * Detects a short time interval of calls of a find-again command.
   *
   * @note Perform only the native processing when the command is called in
   * quick repeating (e.g. holding F3 key down) because an observation of
   * scrolling and animations are useless when they are reset in a short time.
   */
  let isRepeating = (function() {
    /**
     * Max threshold interval time for a repeating command.
     *
     * @value {integer} [millisecond]
     */
    const kMaxIntervalForRepeating = 500;

    let mLastTime = 0;

    return function() {
      let currentTime = window.performance.now();
      let interval = currentTime - mLastTime;

      mLastTime = currentTime;

      return interval < kMaxIntervalForRepeating;
    }
  })();

  let mScrollObserver = ScrollObserver();

  // Optional functions.
  let mSkipInvisible = kPref.skipInvisible && SkipInvisible();
  let mHCentered = kPref.horizontalCentered && HorizontalCentered();
  let mSmoothScroll = kPref.smoothScroll && SmoothScroll();
  let mFoundHighlight = kPref.foundHighlight && FoundHighlight();

  function init() {
    // Customize the native function.
    // @modified chrome://global/content/bindings/findbar.xml::onFindAgainCommand
    const $onFindAgainCommand = gFindBar.onFindAgainCommand;

    gFindBar.onFindAgainCommand =
    function ucjsFindAgainScroller_onFindAgainCommand(...aParams) {
      // Terminate the active processing.
      if (mSmoothScroll) {
        mSmoothScroll.cancel();
      }

      if (mFoundHighlight) {
        mFoundHighlight.cancel();
      }

      // Apply only the native processing for a short time repeating command.
      if (isRepeating()) {
        $onFindAgainCommand.apply(this, aParams);

        return;
      }

      // Take a snapshot of the state of scroll before finding.
      mScrollObserver.attach();

      do {
        $onFindAgainCommand.apply(this, aParams);
      } while (mSkipInvisible && mSkipInvisible.test());

      if (TextFinder.isResultFound) {
        if (mHCentered) {
          let scrollState = mScrollObserver.check();

          if (scrollState) {
            mHCentered.align(scrollState);
          }
        }

        if (mSmoothScroll) {
          let scrollState = mScrollObserver.check();

          if (scrollState) {
            mSmoothScroll.start(scrollState);
          }
        }

        if (mFoundHighlight) {
          mFoundHighlight.start();
        }
      }

      mScrollObserver.detach();
    };
  }

  /**
   * Expose
   */
  return {
    init
  };
})();

/**
 * Observer of the scrollable elements.
 *
 * @return {hash}
 *   attach: {function}
 *   detach: {function}
 *   check: {function}
 */
function ScrollObserver() {
  let mScrollables = new Map();
  let mScrollState = null;

  function attach() {
    scanScrollables(gBrowser.contentWindow);
  }

  function scanScrollables(aWindow) {
    if (aWindow.frames) {
      // @note [...window.frames] doesn't work since |window.frames| doesn't
      // have '@@iterator'.
      Array.forEach(aWindow.frames, (frame) => {
        // Recursively scan for a frame window.
        scanScrollables(frame);
      });
    }

    // <frame> window has |contentDocument|.
    let doc = aWindow.contentDocument || aWindow.document;
    // |body| returns <body> or <frameset> element.
    let root = doc.body || doc.documentElement;

    if (!root) {
      return;
    }

    // Register the document that can be scrolled.
    // @note Including scrollable <html> and <body>.
    if (aWindow.scrollMaxX || aWindow.scrollMaxY) {
      addScrollable(aWindow);
    }

    // Register the elements that can be scrolled.
    // @note We have a simple processing for performance problems.

    // WORKAROUND: Filter out a big document.
    // TODO: Handle any size.
    if (doc.getElementsByTagName('*').length > 10000) {
      return;
    }

    // WORKAROUND: Find only the typical scrollable element.
    // TODO: Grab all kind of scrollable elements.
    let xpath = [
      './/textarea',
      './/pre',
      './/ul',
      './/ol',
      './/div',
      './/p'
    ].join('|');

    let nodes = $X(xpath, root);

    // WORKAROUND: Check the scrollability of an element itself only.
    // TODO: Handle scrollable ancestors.
    for (let i = 0, l = nodes.snapshotLength; i < l; i++) {
      let node = nodes.snapshotItem(i);

      if (node.clientHeight < node.scrollHeight ||
          node.clientWidth < node.scrollWidth) {
        addScrollable(node);
      }
    }
  }

  function addScrollable(aNode) {
    mScrollables.set(aNode, getScroll(aNode));
  }

  function detach() {
    mScrollables.clear();
    mScrollState = null;
  }

  function check() {
    if (!mScrollables.size) {
      return null;
    }

    updateScrollState();

    return mScrollState;
  }

  function updateScrollState() {
    // Update the goal.
    // @note Once the scrolled node is found, we simply observe it.
    if (mScrollState) {
      let {node, goal} = mScrollState;
      let now = getScroll(node);

      if (now.x !== goal.x || now.y !== goal.y) {
        mScrollState.goal = now;
      }

      return;
    }

    // First updating.
    for (let [node, scroll] of mScrollables) {
      let now = getScroll(node);

      if (now.x !== scroll.x || now.y !== scroll.y) {
        // @note |mScrollState| is used as the parameters of
        // |SmoothScroll::start|, |HorizontalCentered::align|.
        mScrollState = {
          node,
          start: scroll,
          goal: now
        };

        return;
      }
    }
  }

  function getScroll(aNode) {
    let x, y;

    if (aNode instanceof Window) {
      x = aNode.scrollX;
      y = aNode.scrollY;
    }
    else {
      x = aNode.scrollLeft;
      y = aNode.scrollTop;
    }

    return {
      x,
      y
    };
  }

  /**
   * Expose
   */
  return {
    attach,
    detach,
    check
  };
}

/**
 * Handler for skipping a found text that a user can not see.
 *
 * @return {hash}
 *   test: {function}
 *
 * @note Skip an entirely invisible text that is out of view by being extreme
 * positioned.
 * @note A text that is transparent or same color as background isn't skipped.
 * @note If a document has only invisible found texts, they will be selected.
 *
 * @note |test()| must be called as the loop condition in |onFindAgainCommand|
 * until it returns false to clear all state of |SkipInvisible|.
 *
 * @note This is a workaround for Fx default behavior.
 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=407817
 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=622801
 */
function SkipInvisible() {
  /**
   * A fail-safe counter to avoid an infinite loop of testing.
   *
   * This is a workaround for when a document has only invisible found results
   * and some trouble happens in finding.
   */
  let mTestCounter = {
    maxCount: 50,
    count: 0,

    clear() {
      this.count = 0;
    },

    isExpired() {
      return ++this.count > this.maxCount;
    }
  };

  let mFirstInvisible = null;

  function test() {
    // Check the loop counter.
    if (mTestCounter.isExpired()) {
      clear();

      return false;
    }

    let invisible = getInvisibleResult();

    if (invisible) {
      // The first test passed.
      if (!mFirstInvisible) {
        mFirstInvisible = invisible;

        return true;
      }

      // Got a result that is tested at the first time.
      if (mFirstInvisible !== invisible) {
        return true;
      }
    }

    // Not found.
    // 1.No invisible result is found.
    // 2.An invisible result is found but it has been tested ever.
    clear();

    return false;
  }

  function clear() {
    mTestCounter.clear();
    mFirstInvisible = null;
  }

  function getInvisibleResult() {
    let selectionRange = TextFinder.selectionRange;

    if (!selectionRange) {
      return null;
    }

    // Get the text node that contains the find range object.
    let result = selectionRange.commonAncestorContainer;

    // A visible result is found.
    if (isVisible(result)) {
      return null;
    }

    // Found an invisible result.
    return result;
  }

  function isVisible(aNode) {
    let getComputedStyle = aNode.ownerDocument.defaultView.getComputedStyle;
    let style;

    // The initial node is a text node.
    let node = aNode;

    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.hidden || node.collapsed) {
          return false;
        }

        style = getComputedStyle(node, '');

        if (
          style.visibility !== 'visible' ||
          style.display === 'none' ||

          // TODO: Ensure to detect the position hacks to hide the content.
          (/absolute|fixed/.test(style.position) &&
           (parseInt(style.left, 10) < 0 ||
            parseInt(style.top, 10) < 0 ||
            parseInt(style.right, 10) <= -999)) ||
          style.textIndent === '100%' ||
          parseInt(style.textIndent, 10) <= -999
        ) {
          return false;
        }
      }

      node = node.parentNode;
    }

    return true;
  }

  /**
   * Expose
   */
  return {
    test
  };
}

/**
 * Handler for horizontally centering a found text.
 *
 * @return {hash}
 *   align: {function}
 *
 * @note The result is scrolled *vertically* centered by Fx default behavior,
 * but not *horizontally*.
 * @see [vertically] https://bugzilla.mozilla.org/show_bug.cgi?id=171237
 * @see [horizontally] https://bugzilla.mozilla.org/show_bug.cgi?id=743103
 */
function HorizontalCentered() {
  function align({node}) {
    let selectionRange = TextFinder.selectionRange;

    if (!selectionRange) {
      return;
    }

    centerSelectionInView(selectionRange, node);
  }

  function centerSelectionInView(aRange, aView) {
    let {left, right, width} = aRange.getBoundingClientRect();
    let viewWidth, center;

    if (aView instanceof Window) {
      viewWidth = aView.innerWidth;
    }
    else {
      let {left: viewLeft} = aView.getBoundingClientRect();

      left -= viewLeft;
      right -= viewLeft;
      viewWidth = aView.clientWidth;
    }

    center = (viewWidth - width) / 2;

    if (right < center) {
      doHScrollBy(aView, right - center);
    }
    else if (left > center) {
      doHScrollBy(aView, left - center);
    }
  }

  function doHScrollBy(aView, aX) {
    if (aView instanceof Window) {
      aView.scrollBy(aX, 0);
    }
    else {
      aView.scrollLeft += aX;
    }
  }

  /**
   * Expose
   */
  return {
    align
  };
}

/**
 * Handler for smoothly scrolling an element.
 *
 * @return {hash}
 *   start: {function}
 *   cancel: {function}
 */
function SmoothScroll() {
  const kOption = {
    /**
     * Pitch of a scroll.
     *
     * @value {integer}
     * far: The goal is away from the current viewport over its width/height.
     * near: The goal comes within the w/h of the viewport.
     *
     * @note 6 pitches mean approaching to the goal by each remaining distance
     * divided by 6.
     * @note The bigger value, the slower moving.
     */
    pitch: {
      far: 2,
      near: 6
    }
  };

  const mState = {
    init({node, start, goal}) {
      if (!node || !start || !goal) {
        return false;
      }

      let scrollable = testScrollable(node);

      if (!scrollable) {
        return false;
      }

      this.view = scrollable.view;
      this.width = scrollable.width;
      this.height = scrollable.height;

      this.node = node;
      this.start = start;
      this.goal = goal;

      this.frameAnimator = FrameAnimator(onEnterFrame);
      this.param = {
        step: getStep(start)
      };

      this.initialized = true;

      return true;
    },

    uninit() {
      this.initialized = null;

      this.view = null;
      this.width = null;
      this.height = null;
      this.node = null;
      this.start = null;
      this.goal = null;
      this.frameAnimator = null;
      this.param = null;
    }
  };

  function start(aState) {
    if (!mState.init(aState)) {
      return;
    }

    doScrollTo(mState.start);

    mState.frameAnimator.request();
  }

  function onEnterFrame(aTime) {
    let {step} = mState.param;

    let was = getScroll();

    doScrollBy(step);

    let now = getScroll();

    // Took too much time. Stop stepping and jump to goal.
    if (aTime.current - aTime.start > 1000) {
      stop(true);

      return false;
    }

    // Reached the goal or went over. Stop stepping at here.
    if (was.delta.x * now.delta.x <= 0 &&
        was.delta.y * now.delta.y <= 0) {
      stop(false);

      return false;
    }

    // Ready for the next frame.
    mState.param.step = getStep(now.position);

    return true;
  }

  function stop(aForceGoal) {
    if (!mState.initialized) {
      return;
    }

    mState.frameAnimator.cancel();

    if (aForceGoal) {
      doScrollTo(mState.goal);
    }

    mState.uninit();
  }

  function cancel() {
    // Terminate scrolling at the current position.
    stop(false);
  }

  function getStep(aPosition) {
    const {far, near} = kOption.pitch;

    let dX = mState.goal.x - aPosition.x,
        dY = mState.goal.y - aPosition.y;

    let pitchX = (Math.abs(dX) < mState.width) ? near : far,
        pitchY = (Math.abs(dY) < mState.height) ? near : far;

    return Position(round(dX / pitchX), round(dY / pitchY));
  }

  function round(aValue) {
    if (aValue > 0) {
      return Math.ceil(aValue);
    }

    if (aValue < 0) {
      return Math.floor(aValue);
    }

    return 0;
  }

  function getScroll() {
    let x, y;

    if (mState.view) {
      x = mState.view.scrollX;
      y = mState.view.scrollY;
    }
    else {
      x = mState.node.scrollLeft;
      y = mState.node.scrollTop;
    }

    return {
      position: Position(x, y),
      delta: Position(mState.goal.x - x, mState.goal.y - y)
    };
  }

  function doScrollTo(aPosition) {
    if (mState.view) {
      mState.view.scrollTo(aPosition.x, aPosition.y);
    }
    else {
      mState.node.scrollLeft = aPosition.x;
      mState.node.scrollTop  = aPosition.y;
    }

    dispatchEvent();
  }

  function doScrollBy(aPosition) {
    if (mState.view) {
      mState.view.scrollBy(aPosition.x, aPosition.y);
    }
    else {
      mState.node.scrollLeft += aPosition.x;
      mState.node.scrollTop  += aPosition.y;
    }

    dispatchEvent();
  }

  function dispatchEvent() {
    let event = new CustomEvent(kEventType.SmoothScroll);

    gBrowser.dispatchEvent(event);
  }

  function testScrollable(aNode) {
    let view = null;
    let scrollable = false;
    let width, height;

    if (aNode instanceof Window ||
        aNode instanceof HTMLHtmlElement ||
        aNode instanceof HTMLBodyElement) {
      view = getWindow(aNode);

      scrollable = view.scrollMaxX || view.scrollMaxY;

      if (scrollable) {
        width = view.innerWidth;
        height = view.innerHeight;
      }
    }
    else if (aNode instanceof Element) {
      scrollable =
        aNode.scrollHeight > aNode.clientHeight ||
        aNode.scrollWidth > aNode.clientWidth;

      if (scrollable) {
        width = aNode.clientWidth;
        height = aNode.clientHeight;
      }
    }

    if (scrollable) {
      return {
        view,
        width,
        height
      };
    }

    return null;
  }

  function getWindow(aNode) {
    if (aNode instanceof Window) {
      return aNode;
    }

    return aNode.ownerDocument.defaultView;
  }

  function Position(aX, aY) {
    return {
      x: aX,
      y: aY
    };
  }

  /**
   * Expose
   */
  return {
    start,
    cancel
  };
}

/**
 * Handler for highlighting a found text for clear visibility.
 *
 * @return {hash}
 *   start: {function}
 *   cancel: {function}
 */
function FoundHighlight() {
  const kOption = {
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
     * clear visibility against dark background.
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
    set() {
      // @note |cancel| calls |DurationObserver.clear|.
      this.timerId = setTimeout(cancel, kOption.duration);
    },

    clear() {
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
    }
  };

  /**
   * Terminates highlighting when a selection is removed by clicking.
   */
  const DeselectObserver = {
    set() {
      // @note A selection is collapsed by 'mousedown' event actually.
      // @note Use the capture mode to surely catch the event in the content
      // area.
      gBrowser.mPanelContainer.addEventListener('mousedown', this, true);

      // Make sure to clean up.
      window.addEventListener('unload', this, false);
    },

    clear() {
      gBrowser.mPanelContainer.removeEventListener('mousedown', this, true);
      window.removeEventListener('unload', this, false);
    },

    handleEvent(aEvent) {
      // @note |cancel| calls |DeselectObserver.clear|.
      cancel();
    }
  };

  /**
   * Updates the position of highlight to follow a selection each time
   * scrolling of view.
   */
  const ScrollObserver = {
    set() {
      gBrowser.addEventListener(kEventType.SmoothScroll, this, false);

      // Make sure to clean up.
      window.addEventListener('unload', this, false);
    },

    clear() {
      gBrowser.removeEventListener(kEventType.SmoothScroll, this, false);
      window.removeEventListener('unload', this, false);
    },

    handleEvent(aEvent) {
      switch (aEvent.type) {
        case kEventType.SmoothScroll: {
          update();

          break;
        }
        case 'unload': {
          // @note |cancel| calls |ScrollObserver.clear|.
          cancel();

          break;
        }
      }
    }
  };

  const mState = {
    init() {
      let selectionRange = TextFinder.selectionRange;

      if (!selectionRange) {
        return false;
      }

      this.range = selectionRange;
      this.view = this.range.commonAncestorContainer.ownerDocument.defaultView;

      this.highlightBox = HighlightBox();

      DurationObserver.set();
      DeselectObserver.set();
      ScrollObserver.set();

      this.initialized = true;

      return true;
    },

    uninit() {
      this.initialized = null;

      DurationObserver.clear();
      DeselectObserver.clear();
      ScrollObserver.clear();

      this.highlightBox.clear();
      this.highlightBox = null;

      this.range = null;
      this.view = null;
    }
  };

  function start() {
    if (!mState.init()) {
      return;
    }

    update();
  }

  function cancel() {
    if (!mState.initialized) {
      return;
    }

    mState.uninit();
  }

  function update() {
    // Bail out when the range is out of view.
    if (!isRangeInView()) {
      return;
    }

    mState.highlightBox.update();
  }

  function isRangeInView() {
    let {top, bottom} = mState.range.getBoundingClientRect();

    return 0 <= top && bottom <= mState.view.innerHeight;
  }

  function HighlightBox() {
    /**
     * The outermost border for clear visibility against dark background.
     *
     * width: {integer} [px]
     * color: {string} [CSS color]
     *   @note Set a bright color.
     */
    const kOuterBorder = {
      width: 2,
      color: 'white'
    };

    let box = getBox();

    let innerScreenY = mState.view.mozInnerScreenY;
    let fullZoom = mState.view.getInterface(Ci.nsIDOMWindowUtils).fullZoom;
    let borderWidth = kOption.blink.width + kOuterBorder.width;

    // Initialize
    init();

    function init() {
      let {screenX, width} = gBrowser.selectedBrowser.boxObject;
      let {height} = mState.range.getBoundingClientRect();

      box.left = screenX;
      box.width = width;
      box.height = (height * fullZoom) + (borderWidth * 2);
    }

    function update() {
      let {top} = mState.range.getBoundingClientRect();

      let x = box.left;
      let y = ((top + innerScreenY) * fullZoom) - borderWidth;

      if (box.state !== 'open') {
        box.openPopupAtScreen(x, y);

        // Start animation from the beginning.
        box.style.animation = '';
      }
      else {
        box.moveTo(x, y);
      }
    }

    function clear() {
      box.hidePopup();

      // Suppress animation.
      box.style.animation = 'none';

      box = null;
    }

    function getBox() {
      let {id, animationName} = kUI.highlightBox;

      let box = $ID(id);

      if (box) {
        return box;
      }

      let {interval, width: innerWidth, color: innerColor} = kOption.blink;
      let {width: outerWidth, color: outerColor} = kOuterBorder;

      let borderWidth = innerWidth + outerWidth;
      let borderColors =
        Array(outerWidth).fill(outerColor).concat(innerColor).join(' ');

      setCSS(`
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
      update,
      clear
    };
  }

  /**
   * Expose
   */
  return {
    start,
    cancel
  };
}

/**
 * Handler of the frame animation.
 *
 * @return {hash}
 *   request: {function}
 *   cancel: {function}
 *
 * @note Used in |SmoothScroll|.
 */
function FrameAnimator(aCallback) {
  let mCallback;
  let mTime;
  let mRequestID;

  // Initialize
  init(aCallback);

  function init(aCallback) {
    mCallback = aCallback;

    let now = window.performance.now();

    mTime = {
      start: now,
      last: now,
      current: now
    };
  }

  function uninit() {
    mCallback = null;
    mTime = null;
    mRequestID = null;
  }

  function request() {
    mRequestID = window.requestAnimationFrame(onEnterFrame);
  }

  function onEnterFrame(aTimeStamp) {
    mTime.current = aTimeStamp;

    if (!mCallback(mTime)) {
      return;
    }

    mTime.last = aTimeStamp;

    mRequestID = window.requestAnimationFrame(onEnterFrame);
  }

  function cancel() {
    window.cancelAnimationFrame(mRequestID);

    uninit();
  }

  /**
   * Expose
   */
  return {
    request,
    cancel
  };
}

/**
 * Entry point.
 */
function FindAgainScroller_init() {
  FindBar.register({
    onCreate: FindAgainCommand.init
  });
}

FindAgainScroller_init();


})(this);
