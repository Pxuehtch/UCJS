// ==UserScript==
// @name FindAgainScroller.uc.js
// @description Customizes the scroll style on <Find again> command.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @note A native function |gFindBar.onFindAgainCommand| is modified (see
// @modified).

// !!! This script doesn't yet support e10s. !!!


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
  DOMUtils: {
    $E,
    $ID,
    $X
  },
  CSSUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

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
 * Handler of custom <Find again> command.
 *
 * @return {hash}
 *   init: {function}
 */
const FindAgainCommand = (function() {
  /**
   * Detects a short time interval of calls of <Find again> command.
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
      // have [Symbol.iterator].
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
 * positioned or overflowed.
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
   * This is a workaround for when some trouble happens in processing.
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

  let mFirstInvisible = {
    set(aRange) {
      this.startContainer = aRange.startContainer;
      this.startOffset = aRange.startOffset;
      this.endContainer = aRange.endContainer;
      this.endOffset = aRange.endOffset;
    },

    clear() {
      this.startContainer = null;
      this.startOffset = null;
      this.endContainer = null;
      this.endOffset = null;
    },

    exists() {
      return !!this.startContainer;
    },

    equals(aRange) {
      return (
        this.startContainer === aRange.startContainer &&
        this.startOffset === aRange.startOffset &&
        this.endContainer === aRange.endContainer &&
        this.endOffset === aRange.endOffset
      );
    }
  };

  function test() {
    // Check the loop counter.
    if (mTestCounter.isExpired()) {
      clear();

      return false;
    }

    let selectionRange = TextFinder.selectionRange;

    if (!selectionRange) {
      clear();

      return false;
    }

    if (isInvisible(selectionRange)) {
      // The first invisible range is found.
      if (!mFirstInvisible.exists()) {
        mFirstInvisible.set(selectionRange);

        return true;
      }

      // Another new invisible range is found.
      if (!mFirstInvisible.equals(selectionRange)) {
        return true;
      }
    }

    // 1.No invisible ranges are found.
    // 2.An invisible range is found but it is the known one in wrapped-find.
    clear();

    return false;
  }

  function clear() {
    mTestCounter.clear();
    mFirstInvisible.clear();
  }

  function isInvisible(aRange) {
    let ownerText = aRange.commonAncestorContainer;
    let ownerElement = ownerText.parentNode;
    let ownerDocument = ownerText.ownerDocument;

    // @note The selection range in a textbox exists in a child container
    // <div.anonymous-div> that Fx puts inside the textbox.
    if (ownerElement.parentNode instanceof Ci.nsIDOMNSEditableElement) {
      ownerElement = ownerElement.parentNode;
    }

    let rangeRect = aRange.getBoundingClientRect();

    // Determine if the range is actually invisible at all corner points.
    let rangePoints = [
      [rangeRect.left, rangeRect.top],
      [rangeRect.right, rangeRect.top],
      [rangeRect.right, rangeRect.bottom],
      [rangeRect.left, rangeRect.bottom]
    ];

    let isAllPointsInvisible = rangePoints.every(([x, y]) => {
      let element = ownerDocument.elementFromPoint(x, y);

      return !(element && ownerElement.contains(element));
    });

    if (isAllPointsInvisible) {
      return true;
    }

    // Determine if the range entirely overflows in the container.
    // Start from the closest element which contains the text node.
    let node = ownerElement;

    while (node) {
      let style = ownerDocument.defaultView.getComputedStyle(node);

      if (style.overflow === 'hidden') {
        let containerRect = node.getBoundingClientRect();
        let borderWidth = {
          top: parseInt(style.borderTopWidth, 10),
          right: parseInt(style.borderRightWidth, 10),
          bottom: parseInt(style.borderBottomWidth, 10),
          left: parseInt(style.borderLeftWidth, 10)
        };

        if (containerRect.right - borderWidth.right <= rangeRect.left ||
            containerRect.bottom - borderWidth.bottom <= rangeRect.top ||
            rangeRect.right <= containerRect.left + borderWidth.left ||
            rangeRect.bottom <= containerRect.top + borderWidth.top) {
          return true
        }
      }

      // Get the closest positioned containing element.
      node = node.parentOffset;
    }

    // The range is visible.
    return false;
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
 * @note The found text is scrolled *vertically* centered by Fx default
 * behavior, but not *horizontally*.
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
 * Handler for smoothly scrolling a found text.
 *
 * @return {hash}
 *   start: {function}
 *   cancel: {function}
 *
 * TODO: Fix scrolling lag in a big document.
 */
function SmoothScroll() {
  const kOption = {
    /**
     * The pitch of scrolling.
     *
     * @value {integer} [>= 2]
     *
     * @note 2 pitches mean approaching to the goal by each remaining distance
     * divided by 2. So, the bigger value, the slower moving.
     */
    pitch: 2,

    /**
     * The minimum distance of scrolling.
     *
     * @value {integer} [> 0] [px]
     *
     * @note The scrolling stops when the distances to goal of both X and Y
     * drop below this value.
     */
    minDistance: 10
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

    mState.frameAnimator.start();
  }

  function onEnterFrame(aTime) {
    let {step} = mState.param;

    let nextStep;

    if (step) {
      doScrollBy(step);

      nextStep = getStep(getScroll());
    }

    // No next step needed for enough close to the goal.
    if (!nextStep) {
      // Stop stepping at here.
      stop(false);

      return false;
    }

    // Took too much time. [1000ms]
    if (aTime.current - aTime.start > 1000) {
      // Stop stepping and jump to goal.
      stop(true);

      return false;
    }

    // Ready for the next frame.
    mState.param.step = nextStep;

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
    let {pitch, minDistance} = kOption;

    let x = mState.goal.x - aPosition.x;
    let y = mState.goal.y - aPosition.y;

    // The distances to the goal become short enough.
    if (Math.abs(x) < minDistance && Math.abs(y) < minDistance) {
      return null;
    }

    return Position(x / pitch, y / pitch);
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

    return Position(x, y);
  }

  function doScrollTo(aPosition) {
    if (mState.view) {
      mState.view.scrollTo(aPosition.x, aPosition.y);
    }
    else {
      mState.node.scrollLeft = aPosition.x;
      mState.node.scrollTop  = aPosition.y;
    }
  }

  function doScrollBy(aPosition) {
    if (mState.view) {
      mState.view.scrollBy(aPosition.x, aPosition.y);
    }
    else {
      mState.node.scrollLeft += aPosition.x;
      mState.node.scrollTop  += aPosition.y;
    }
  }

  function testScrollable(aNode) {
    let view;
    let scrollable = false;

    if (aNode instanceof Window ||
        aNode instanceof HTMLHtmlElement ||
        aNode instanceof HTMLBodyElement) {
      view = getView(aNode);
      scrollable = view.scrollMaxX || view.scrollMaxY;
    }
    else if (aNode instanceof Element) {
      view = null;
      scrollable =
        aNode.scrollHeight > aNode.clientHeight ||
        aNode.scrollWidth > aNode.clientWidth;
    }

    if (scrollable) {
      return {
        view
      };
    }

    return null;
  }

  function getView(aNode) {
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
 * Handler for highlighting a found text.
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
   * Cancels useless highlighting.
   */
  const CancelObserver = {
    set() {
      // Cancel when a selection is removed by click.
      // @note Actually a selection is collapsed by 'mousedown' event.
      // @note Use the capture mode to surely catch the event in the content
      // area.
      // @note Add the event on |window| to cancel by click on wherever in the
      // browser window.
      // TODO: Fix disabled text selecting by drag in the highlight box.
      window.addEventListener('mousedown', this, true);

      // Cancel when the document is switched.
      gBrowser.addEventListener('select', this);
      gBrowser.addEventListener('pagehide', this);

      // Make sure to clean up.
      window.addEventListener('unload', this);
    },

    clear() {
      window.removeEventListener('mousedown', this, true);
      gBrowser.removeEventListener('select', this);
      gBrowser.removeEventListener('pagehide', this);
      window.removeEventListener('unload', this);
    },

    handleEvent(aEvent) {
      // @note |cancel| calls |CancelObserver.clear|.
      cancel();
    }
  };

  /**
   * Updates the position of highlight to follow a found text each time
   * scrolling of view.
   */
  const ScrollObserver = {
    set() {
      // @note Use the capture mode to surely catch the event in the content
      // area.
      // TODO: Fix disabled mousewheel on the highlight box.
      gBrowser.mPanelContainer.addEventListener('scroll', this, true);

      // Make sure to clean up.
      window.addEventListener('unload', this);
    },

    clear() {
      gBrowser.mPanelContainer.removeEventListener('scroll', this, true);
      window.removeEventListener('unload', this);
    },

    handleEvent(aEvent) {
      switch (aEvent.type) {
        case 'scroll': {
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
      CancelObserver.set();
      ScrollObserver.set();

      this.initialized = true;

      return true;
    },

    uninit() {
      this.initialized = null;

      DurationObserver.clear();
      CancelObserver.clear();
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
    // Don't highlight when the range is out of view.
    if (!isRangeInView()) {
      // Hide existing highlight.
      if (mState.highlightBox.isOpened()) {
        cancel();
      }

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

    function isOpened() {
      return box.state === 'open';
    }

    function update() {
      let {top} = mState.range.getBoundingClientRect();

      let x = box.left;
      let y = ((top + innerScreenY) * fullZoom) - borderWidth;

      if (!isOpened()) {
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
      isOpened,
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
 * @param aCallback {function}
 *   The processing function for one frame.
 *   @param aTime {hash}
 *     start: {DOMHighResTimeStamp}
 *     current: {DOMHighResTimeStamp}
 *   @return {boolean}
 *     Should return |true| in order to request the next frame, |false| to stop
 *     animation.
 * @return {hash}
 *   start: {function}
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
      current: now
    };
  }

  function uninit() {
    mCallback = null;
    mTime = null;
    mRequestID = null;
  }

  function start() {
    mRequestID = window.requestAnimationFrame(onEnterFrame);
  }

  function onEnterFrame(aTimeStamp) {
    mTime.current = aTimeStamp;

    if (mCallback(mTime)) {
      mRequestID = window.requestAnimationFrame(onEnterFrame);
    }
  }

  function cancel() {
    window.cancelAnimationFrame(mRequestID);

    uninit();
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
 * Entry point.
 */
function FindAgainScroller_init() {
  FindBar.register({
    onCreate: FindAgainCommand.init
  });
}

FindAgainScroller_init();


})(this);
