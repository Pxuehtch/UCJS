// ==UserScript==
// @name        FindAgainScroller.uc.js
// @description Customizes the scroll style on "Find again" command
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note some default functions are modified. see @modified


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getNodesByXPath: $X,
  addEvent
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('FindAgainScroller.uc.js', aMsg);
}

/**
 * Preferences
 */
const kPref = {
  // skip a found result that a user can not see (e.g. a text in a folded
  // dropdown menu)
  //
  // @note if a document has only invisible results, they will be selected
  // @note this is a workaround for Fx default behavior
  // @see https://bugzilla.mozilla.org/show_bug.cgi?id=622801
  skipInvisible: true,

  // center a found text horizontally
  //
  // @note the result is scrolled *vertically* centered by Fx default behavior,
  // but not *horizontally*
  // @see https://bugzilla.mozilla.org/show_bug.cgi?id=171237
  // @see https://bugzilla.mozilla.org/show_bug.cgi?id=743103
  horizontalCentered: true,

  // scroll smoothly to a found text
  //
  // @note |SmoothScroll| has the detail setting
  smoothScroll: true,

  // blink a found text
  //
  // @note |FoundBlink| has the detail setting
  foundBlink: true
};

/**
 * Helper of the finder
 *
 * @see resource://gre/modules/Finder.jsm
 */
const TextFinder = {
  get finder() {
    return gBrowser.finder;
  },

  get isResultFound() {
    let {foundEditable, currentWindow} = this.finder._fastFind;

    return foundEditable || currentWindow;
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
  }
};

/**
 * Handler of the interval of times
 *
 * @note used to observe consecutive calls of the find-again command
 * @see |attachFindAgainCommand|
 */
const TimeKeeper = {
  countInterval: function() {
    let currentTime = window.performance.now();
    let interval = currentTime - (this.lastTime || 0);

    this.lastTime = currentTime;

    return interval;
  }
};

function FindAgainScroller_init() {
  // @modified chrome://browser/content/tabbrowser.xml::getFindBar
  const $getFindBar = gBrowser.getFindBar;

  gBrowser.getFindBar =
  function ucjsFindAgainScroller_getFindBar(aTab) {
    let initialized = gBrowser.isFindBarInitialized(aTab);
    let findBar = $getFindBar.apply(this, arguments);

    if (!initialized) {
      attachFindAgainCommand();
    }

    return findBar;
  };
}

function attachFindAgainCommand() {
  let mScrollObserver = ScrollObserver();

  // optional functions
  let mSkipInvisible = kPref.skipInvisible && SkipInvisible();
  let mHCentered = kPref.horizontalCentered && HorizontalCentered();
  let mSmoothScroll = kPref.smoothScroll && SmoothScroll();
  let mFoundBlink = kPref.foundBlink && FoundBlink();

  // @modified chrome://global/content/bindings/findbar.xml::onFindAgainCommand
  const $onFindAgainCommand = gFindBar.onFindAgainCommand;

  gFindBar.onFindAgainCommand =
  function ucjsFindAgainScroller_onFindAgainCommand(aFindPrevious) {
    // terminate the active processing
    if (mSmoothScroll) {
      mSmoothScroll.cancel();
    }

    if (mFoundBlink) {
      mFoundBlink.cancel();
    }

    // perform only the default behavior when a command is called in quick
    // succession (e.g. holding a shortcut key down)
    // because an observation of document and animations are useless when they
    // are reset in a short time
    // TODO: adjust the interval time
    const kMaxIntervalToSkip = 500; // [millisecond]

    if (TimeKeeper.countInterval() < kMaxIntervalToSkip) {
      $onFindAgainCommand.apply(this, arguments);
      return;
    }

    // take a snapshot of the state of scroll before finding
    mScrollObserver.attach();

    do {
      $onFindAgainCommand.apply(this, arguments);
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

      if (mFoundBlink) {
        mFoundBlink.start();
      }
    }

    mScrollObserver.detach();
  };
}

/**
 * Observer of the scrollable elements
 *
 * @return {hash}
 *   attach: {function}
 *   detach: {function}
 *   check: {function}
 */
function ScrollObserver() {
  let mScrollable = Scrollable();

  function Scrollable() {
    let mItems = new Map();
    let mScrollState = null;

    function uninit() {
      mItems.clear();
      mScrollState = null;
    }

    function addItem(aNode) {
      mItems.set(aNode, getScroll(aNode));
    }

    function check() {
      if (!mItems.size) {
        return null;
      }

      updateScrollState();

      return mScrollState;
    }

    function updateScrollState() {
      // update the goal
      // once the scrolled node is found, we simply observe it
      if (mScrollState) {
        let {node, goal} = mScrollState;
        let now = getScroll(node);

        if (now.x !== goal.x || now.y !== goal.y) {
          mScrollState.goal = now;
        }

        return;
      }

      // first updating
      for (let [node, scroll] of mItems) {
        let now = getScroll(node);

        if (now.x !== scroll.x || now.y !== scroll.y) {
          // @note |mScrollState| is used as the parameters of
          // |SmoothScroll::start|, |HorizontalCentered::align|
          mScrollState = {
            node: node,
            start: scroll,
            goal: now
          };

          return;
        }
      }
    }

    return {
      uninit: uninit,
      addItem: addItem,
      check: check
    };
  }

  function attach() {
    scanScrollables(window.content);
  }

  function detach() {
    mScrollable.uninit();
  }

  function scanScrollables(aWindow) {
    if (aWindow.frames) {
      Array.forEach(aWindow.frames, (frame) => {
        // recursively scan for a frame window
        scanScrollables(frame);
      });
    }

    // <frame> window has |contentDocument|
    let doc = aWindow.contentDocument || aWindow.document;
    // |body| returns <body> or <frameset> element
    let root = doc.body || doc.documentElement;

    if (!root) {
      return;
    }

    // register the document that can be scrolled
    if (aWindow.scrollMaxX || aWindow.scrollMaxY) {
      mScrollable.addItem(aWindow);
    }

    // register the elements that can be scrolled

    // WORKAROUND: skip a big document because of performance problems
    // TODO: handle it
    if (doc.getElementsByTagName('*').length > 10000) {
      return;
    }

    // WORKAROUND: find only the typical scrollable element
    // @note <div>|<p>: there may be many elements, so that we grab the deepest
    // one
    // TODO: grab all kind of scrollable elements
    let xpath = [
      './/textarea',
      './/pre',
      './/ul',
      './/ol',
      './/div[not(descendant::div)]',
      './/p[not(descendant::p)]'
    ].join('|');

    let nodes = $X(xpath, root);
    let scrollables = [];

    for (let i = 0, l = nodes.snapshotLength; i < l; i++) {
      let scrollable = testScrollable(scrollables, nodes.snapshotItem(i));

      if (scrollable) {
        scrollables.push(scrollable);
        mScrollable.addItem(scrollable);
      }
    }
  }

  function testScrollable(aRegisteredNodes, aBaseNode) {
    let isRegistered = (aNode) => aRegisteredNodes.indexOf(aNode) > -1;

    let isScrollable = (aNode) =>
      aNode.clientHeight < aNode.scrollHeight ||
      aNode.clientWidth  < aNode.scrollWidth;

    // @note the initial node is an element node
    let node = aBaseNode;

    while (node) {
      // <html> and <body> are handled as the scrollable document
      if (node.nodeType !== Node.ELEMENT_NODE ||
          node instanceof HTMLBodyElement ||
          node instanceof HTMLHtmlElement) {
        return null;
      }

      if (isRegistered(node)) {
        return null;
      }

      if (isScrollable(node)) {
        return node;
      }

      node = node.parentNode;
    }

    return null;
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
      x: x,
      y: y
    };
  }

  /**
   * Expose
   */
  return {
    attach: attach,
    detach: detach,
    check: mScrollable.check
  };
}

/**
 * Handler for skipping a found result that a user can not see
 *
 * @return {hash}
 *   test: {function}
 *
 * @note |test| is called as the loop condition in |onFindAgainCommand|
 */
function SkipInvisible() {
  // WORKAROUND: a fail-safe option to avoid an infinite loop for when a
  // document has only invisible results, in addition, when the comparing
  // check of nodes does not work
  const kMaxTestCount = 50;

  let mTestCount = 0;
  let mFirstInvisible = null;

  function test() {
    // WORKAROUND: force to exit from a loop of testing
    if (++mTestCount > kMaxTestCount) {
      mTestCount = 0;
      mFirstInvisible = null;
      return false;
    }

    let invisible = getInvisibleResult();

    if (invisible) {
      // the first test passed
      if (!mFirstInvisible) {
        mFirstInvisible = invisible;
        return true;
      }

      // got a result that is tested at the first time
      if (mFirstInvisible !== invisible) {
        return true;
      }
    }

    // not found
    // 1.no invisible result is found
    // 2.an invisible result is found but it has been tested ever
    mTestCount = 0;
    mFirstInvisible = null;

    return false;
  }

  function getInvisibleResult() {
    let selectionController = TextFinder.selectionController;

    // no result is found or error something
    if (!selectionController) {
      return null;
    }

    // get the text node that contains the find range object
    let result = selectionController.
      getSelection(Ci.nsISelectionController.SELECTION_NORMAL).
      getRangeAt(0).
      commonAncestorContainer;

    // a visible result is found
    if (isVisible(result)) {
      return null;
    }

    // found an invisible result
    return result;
  }

  function isVisible(aNode) {
    let getComputedStyle = aNode.ownerDocument.defaultView.getComputedStyle;
    let style;

    // the initial node is a text node
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

          // TODO: ensure to detect the position hacks to hide the content
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
    test: test
  };
}

/**
 * Handler for the centering horizontally of a found text
 * @return {hash}
 *   align: {function}
 */
function HorizontalCentered() {
  function align({node}) {
    let selection = getSelection();

    if (selection) {
      scrollSelection(selection, node);
    }
  }

  function getSelection() {
    let selectionController = TextFinder.selectionController;

    return selectionController &&
      selectionController.
        getSelection(Ci.nsISelectionController.SELECTION_NORMAL);
  }

  function scrollSelection(aSelection, aView) {
    let range = aSelection.getRangeAt(0);
    let {left, right, width} = range.getBoundingClientRect();
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
    align: align
  };
}

/**
 * Handler for scrolling an element smoothly
 * @return {hash}
 *   start: {function}
 *   cancel: {function}
 */
function SmoothScroll() {
  const kOption = {
    // pitch of a scroll [integer]
    //
    // far: the goal is away from the current viewport over its width/height
    // near: the goal comes within the w/h of the viewport
    //
    // @note 8 pitches mean approaching to the goal by each remaining distance
    // divided by 8
    // @note the bigger value, the slower moving
    pitch: {
      far: 2,
      near: 6
    }
  };

  const mState = {
    init: function({node, start, goal}) {
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

    uninit: function() {
      this.view = null;
      this.width = null;
      this.height = null;
      this.node = null;
      this.start = null;
      this.goal = null;
      this.frameAnimator = null;
      this.param = null;
      this.initialized = null;
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

    // took too much time. stop stepping and jump to goal
    if (aTime.current - aTime.start > 1000) {
      stop(true);
      return false;
    }

    // reached the goal or went over. stop stepping at here
    if (was.delta.x * now.delta.x <= 0 &&
        was.delta.y * now.delta.y <= 0) {
      stop(false);
      return false;
    }

    // ready for the next frame
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
    // terminate scrolling at the current position
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
        view: view,
        width: width,
        height: height
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
    start: start,
    cancel: cancel
  };
}

/**
 * Blinking a found text between on and off a selection
 *
 * @return {hash}
 *   start: {function}
 *   cancel: {function}
 *
 * @note the blinking color set is the normal selection style (default: white
 * text on blue back)
 * @note the selection becomes harder to see accoding to a page style. so I
 * have set the selection style in <userContent.css>;
 *   ::-moz-selection {
 *     color: white !important;
 *     background: blue !important;
 *   }
 *
 * TODO: use |nsISelectionController::SELECTION_ATTENTION|
 * if the style of a found text selection (default: white text on green back)
 * is overwritten by a page style, I don't know how to fix it because
 * <::-moz-selection> is not applied to it. For now I use |SELECTION_NORMAL| so
 * that the blinking color set can be restyled by <::-moz-selection>
 */
function FoundBlink() {
  const kOption = {
    // duration of time for blinks [millisecond]
    //
    // @note a blinking will be canceled when the duration is expired
    duration: 2000,

    // number of times to blink [even number]
    //
    // @note 6 steps mean on->off->on->off->on->off->on
    steps: 12
  };

  const mState = {
    init:  function() {
      let selectionController = TextFinder.selectionController;

      if (!selectionController) {
        return false;
      }

      this.selectionController = selectionController;

      let {duration, steps} = kOption;

      this.frameAnimator = FrameAnimator(onEnterFrame, {
        interval: parseInt(duration / steps, 10)
      });

      this.param = {
        duration: duration,
        blinks: 0,
        range: getRange()
      };

      this.initialized = true;
      return true;
    },

    uninit:  function() {
      this.selectionController = null;
      this.animator = null;
      this.param = null;
      this.initialized = null;
    }
  };

  // attach a cleaner when the selection is removed by clicking
  addEvent(gBrowser.mPanelContainer, 'mousedown', cancel, false);

  function start() {
    if (!mState.init()) {
      return;
    }

    mState.frameAnimator.request();
  }

  function onEnterFrame(aTime) {
    let {duration, blinks, range} = mState.param;

    // the duration is expired. stop blinking and display the selection
    if (aTime.current - aTime.start > duration) {
      stop(true);
      return false;
    }

    // do not blink until the selection comes into the view
    if (blinks > 0 || isRangeIntoView(range)) {
      // show the selection when |blinks| is odd, not when even(include 0)
      setDisplay(!!(blinks % 2));
      mState.param.blinks++;
    }

    // ready for the next frame
    return true;
  }

  function stop(aForceSelect) {
    if (!mState.initialized) {
      return;
    }

    mState.frameAnimator.cancel();

    if (aForceSelect) {
      setDisplay(true);
    }

    mState.uninit();
  }

  function cancel() {
    // terminate blinking and stay the display state of selection
    stop(false);
  }

  function isRangeIntoView(aRange) {
    let {top, bottom} = aRange.getBoundingClientRect();

    return 0 <= top && bottom <= window.innerHeight;
  }

  function getRange() {
    const {SELECTION_NORMAL} = Ci.nsISelectionController;

    return mState.selectionController.
      getSelection(SELECTION_NORMAL).
      getRangeAt(0);
  }

  function setDisplay(aShow) {
    const {
      SELECTION_NORMAL,
      SELECTION_OFF,
      SELECTION_ON
    } = Ci.nsISelectionController;

    let type = aShow ? SELECTION_ON : SELECTION_OFF;

    try {
      mState.selectionController.setDisplaySelection(type);
      mState.selectionController.repaintSelection(SELECTION_NORMAL);
    }
    catch (ex) {}
  }

  /**
   * Expose
   */
  return {
    start: start,
    cancel: cancel
  };
}

/**
 * Handler of the frame animation
 *
 * @return {hash}
 *   request: {function}
 *   cancel: {function}
 *
 * @note used in |SmoothScroll| and |FoundBlink|
 * TODO: should I make this function as a class for creating multiple
 * instances?
 */
function FrameAnimator(aCallback, aOption) {
  let mCallback;
  let mTime;
  let mRequestID;

  init(aCallback, aOption);

  function init(aCallback, aOption) {
    let {interval} = aOption || {};

    mCallback = aCallback;

    let now = window.performance.now();

    mTime = {
      start: now,
      last: now,
      current: now,
      interval: interval || 0
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

    if (!mTime.interval || aTimeStamp - mTime.last >= mTime.interval) {
      if (!mCallback(mTime)) {
        return;
      }

      mTime.last = aTimeStamp;
    }

    mRequestID = window.requestAnimationFrame(onEnterFrame);
  }

  function cancel() {
    window.cancelAnimationFrame(mRequestID);

    uninit();
  }

  return {
    request: request,
    cancel: cancel
  };
}

/**
 * Entry point
 */
FindAgainScroller_init();


})(this);
