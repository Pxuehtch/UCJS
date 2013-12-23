// ==UserScript==
// @name        FindAgainScroller.uc.js
// @description Customizes the scroll style on "Find again" command
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note default functions are modified. see @modified


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  Timer: {
    setInterval,
    clearInterval
  },
  getNodesByXPath: $X,
  setEventListener: addEvent
} = window.ucjsUtil;
// for debug
const log = window.ucjsUtil.logMessage.bind(null, 'FindAgainScroller.uc.js');

/**
 * Configurations
 */
const kConfig = {
  // Skip a found result that a user can not see (e.g. a text in a popup menu
  // that does not popped up)
  // @note If a document has only invisible results, they will be selected.
  // @note WORKAROUND for Fx default behavior.
  // @see https://bugzilla.mozilla.org/show_bug.cgi?id=622801
  skipInvisible: true,

  // Center a found text horizontally
  // @note The result is scrolled *vertically* centered by default. WORKAROUND
  // for horizontally.
  // @see https://bugzilla.mozilla.org/show_bug.cgi?id=171237
  // @see https://bugzilla.mozilla.org/show_bug.cgi?id=743103
  horizontalCentered: true,

  // Scroll smoothly to a found text
  // SmoothScroll() has the detail setting
  smoothScroll: true,

  // Blink a found text
  // FoundBlink() has the detail setting
  foundBlink: true
};

/**
 * Wrapper of gFindBar
 * @see chrome://global/content/bindings/findbar.xml
 */
const TextFinder = {
  get isResultFound() {
    return gFindBar._foundEditable || gFindBar._currentWindow;
  },

  get selectionController() {
    var editable = gFindBar._foundEditable;
    if (editable) {
      try {
        return editable.
          QueryInterface(window.Ci.nsIDOMNSEditableElement).
          editor.
          selectionController;
      } catch (ex) {}
      return null;
    }

    if (gFindBar._currentWindow) {
      return gFindBar._getSelectionController(gFindBar._currentWindow);
    }
    return null;
  }
};

/**
 * Handler of the interval of times
 * @note used to observe consecutive calls of the find-again command
 * @see |attachFindAgainCommand|
 */
const TimeKeeper = {
  lastTime: window.performance.now(),

  countInterval: function() {
    let currentTime = window.performance.now();
    let interval = currentTime - this.lastTime;
    this.lastTime = currentTime;
    return interval;
  }
};

/**
 * Main function
 */
function FindAgainScroller_init() {
  // @modified chrome://browser/content/tabbrowser.xml::getFindBar
  const $getFindBar = gBrowser.getFindBar;
  gBrowser.getFindBar = function(aTab) {
    let initialized = gBrowser.isFindBarInitialized(aTab);
    let findBar = $getFindBar.apply(this, arguments);

    if (!initialized) {
      attachFindAgainCommand();
    }

    return findBar;
  };
}

function attachFindAgainCommand() {
  var mScrollObserver = ScrollObserver();

  // Optional functions
  var mSkipInvisible = kConfig.skipInvisible && SkipInvisible();
  var mHCentered = kConfig.horizontalCentered && HorizontalCentered();
  var mSmoothScroll = kConfig.smoothScroll && SmoothScroll();
  var mFoundBlink = kConfig.foundBlink && FoundBlink();

  // @modified chrome://global/content/bindings/findbar.xml::
  // onFindAgainCommand
  var $onFindAgainCommand = gFindBar.onFindAgainCommand;
  gFindBar.onFindAgainCommand = function(aFindPrevious) {
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
    const kMaxIntervalToSkip = 500; // [ms]
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
      if (mHCentered && mScrollObserver.check()) {
        mHCentered.align(mScrollObserver.scrollState);
      }
      if (mSmoothScroll && mScrollObserver.check()) {
        mSmoothScroll.start(mScrollObserver.scrollState);
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
 * @return {hash}
 *   attach: {function}
 *   detach: {function}
 *   check: {function}
 *   scrollState: {hash}
 */
function ScrollObserver() {
  var mScrollable = Scrollable();


  //********** Functions

  function Scrollable() {
    var mItems = new Map();
    var mScrollState = null;

    function cleanup() {
      mItems.clear();

      if (mScrollState !== null) {
        delete mScrollState.node;
        delete mScrollState.start;
        delete mScrollState.goal;
        mScrollState = null;
      }
    }

    function addItem(aNode) {
      mItems.set(aNode, getScroll(aNode));
    }

    function check() {
      if (!mItems.size) {
        return false;
      }

      updateScrollState();

      return !!mScrollState;
    }

    function updateScrollState() {
      // update the goal
      // once the scrolled node is found, we simply observe it.
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
          // |SmoothScroll::start|, |HorizontalCentered::align|.
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
      cleanup: cleanup,
      addItem: addItem,
      check: check,
      get scrollState() mScrollState
    };
  }

  function attach() {
    scanScrollables(window.content);
  }

  function detach() {
    mScrollable.cleanup();
  }

  function scanScrollables(aWindow) {
    if (aWindow.frames) {
      Array.forEach(aWindow.frames, function(frame) {
        scanScrollables(frame);
      });
    }

    // <frame> window has |contentDocument|
    var doc = aWindow.contentDocument || aWindow.document;
    // |body| returns <body> or <frameset> element
    var root = doc.body || doc.documentElement;
    if (!root) {
      return;
    }

    // register the document that can be scrolled
    if (aWindow.scrollMaxX || aWindow.scrollMaxY) {
      mScrollable.addItem(aWindow);
    }

    // register the typical elements that can be scrolled
    // <div>, <p>: there may be many elements so that we grab the deepest one
    // TODO: handle the big document.
    // TODO: grab all scrollable elements.
    if (doc.getElementsByTagName('*').length < 1000) {
      let xpath = '//textarea|//pre|//ul|//ol' +
        '|//div[not(descendant::div)]|//p[not(descendant::p)]';

      $X(xpath, root).reduce(function(scrollables, node) {
        let scrollable = testScrollable(scrollables, node);
        if (scrollable) {
          scrollables.push(scrollable);
          mScrollable.addItem(scrollable);
        }
        return scrollables;
      }, []);
    }
  }

  function testScrollable(aArray, aNode) {
    function isRegistered(aNode) {
      return aArray.indexOf(aNode) > -1;
    }

    function isScrollable(aNode) {
      return aNode.clientHeight < aNode.scrollHeight ||
             aNode.clientWidth < aNode.scrollWidth;
    }

    while (aNode && !(aNode instanceof HTMLBodyElement)) {
      if (aNode.nodeType === Node.ELEMENT_NODE) {
        if (isRegistered(aNode)) {
          return null;
        }
        if (isScrollable(aNode)) {
          return aNode;
        }
      }
      aNode = aNode.parentNode;
    }
    return null;
  }

  function getScroll(aNode) {
    var x, y;

    if (aNode instanceof Window) {
      x = aNode.scrollX;
      y = aNode.scrollY;
    } else {
      x = aNode.scrollLeft;
      y = aNode.scrollTop;
    }

    return {x: x, y: y};
  }


  //********** Expose

  return {
    attach: attach,
    detach: detach,
    check: mScrollable.check,
    get scrollState() mScrollable.scrollState
  };
}

/**
 * Handler for skipping a found result that a user can not see
 * @return {hash}
 *   test: {function}
 *
 * @note |test| is called as the loop condition in |onFindAgainCommand|.
 */
function SkipInvisible() {
  // WORKAROUND: A fail-safe option to avoiding an infinite loop. This is for
  // when a document has only invisible results and then the comparing check
  // of nodes does not work.
  const kMaxTestingCount = 50;

  var mTestingCount = 0;
  var mFirstInvisible = null;


  //********** Functions

  function test() {
    // WORKAROUND: force to exit from a loop of testing
    if (++mTestingCount > kMaxTestingCount) {
      mTestingCount = 0;
      mFirstInvisible = null;
      return false;
    }

    var invisible = getInvisibleResult();

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
    mTestingCount = 0;
    mFirstInvisible = null;
    return false;
  }

  function getInvisibleResult() {
    var selectionController = TextFinder.selectionController;
    // no result is found or error something
    if (!selectionController) {
      return null;
    }

    // get the text node that contains the find range object
    var result = selectionController.
      getSelection(window.Ci.nsISelectionController.SELECTION_NORMAL).
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

    while (aNode) {
      if (aNode.nodeType === Node.ELEMENT_NODE) {
        if (aNode.hidden || aNode.collapsed) {
          return false;
        }

        style = getComputedStyle(aNode, '');
        if (
          style.visibility !== 'visible' ||
          style.display === 'none' ||
          // TODO: Use a certain detection of the position hacks to hide the
          // content.
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
      aNode = aNode.parentNode;
    }
    return true;
  }


  //********** Expose

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
    const {Ci} = window;

    var selectionController = TextFinder.selectionController;

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
    } else {
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
    } else {
      aView.scrollLeft += aX;
    }
  }


  //********** Expose

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
    // Pitch of the scroll
    // far: The goal is away from the current viewport over its width/height
    // near: The goal comes within the w/h of the viewport
    // * 8 pitches mean approaching to the goal by each remaining distance
    // divided by 8
    // * the bigger value, the slower moving
    pitch: {far: 2, near: 6}
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
      this.node = node;
      this.start = start;
      this.goal = goal;

      return true;
    },

    uninit: function() {
      delete this.view;
      delete this.node;
      delete this.start;
      delete this.goal;
    }
  };

  const mStep = {
    request: function(aCallback, aStep) {
      this.callback = aCallback;

      let startTime = window.performance.now();
      this.param = {
        step: aStep,
        startTime: startTime,
        lastTime: startTime
      };

      this.requestID = window.requestAnimationFrame(this.step.bind(this));
    },

    step: function(aTimeStamp) {
      let nextStep = this.callback(this.param);
      if (nextStep) {
        this.param.step = nextStep;
        this.param.lastTime = aTimeStamp;
        this.requestID = window.requestAnimationFrame(this.step.bind(this));
      }
    },

    cancel: function() {
      if (!this.requestID) {
        return false;
      }

      window.cancelAnimationFrame(this.requestID);

      delete this.callback;
      delete this.param;
      delete this.requestID;

      return true;
    }
  };


  //********** Functions

  function start(aState) {
    if (!mState.init(aState)) {
      return;
    }

    doScrollTo(mState.start);

    mStep.request(doStep, getStep(mState.start));
  }

  function cancel() {
    // terminate the current scrolling at the current position
    stop(false);
  }

  function doStep({step, startTime, lastTime}) {
    let was = getScroll();
    doScrollBy(step);
    let now = getScroll();

    // took too much time. stop stepping and jump to goal
    if (lastTime - startTime > 1000) {
      stop(true);
      return null;
    }

    // reached the goal or went over. stop stepping at here
    if (was.delta.x * now.delta.x <= 0 &&
        was.delta.y * now.delta.y <= 0) {
      stop(false);
      return null;
    }

    // next step
    return getStep(now.position);
  }

  function stop(aForceGoal) {
    if (!mStep.cancel()) {
      return;
    }

    if (aForceGoal) {
      doScrollTo(mState.goal);
    }

    mState.uninit();
  }

  function getStep(aPosition) {
    const {far, near} = kOption.pitch;

    let width, height;
    if (mState.view) {
      width = mState.view.innerWidth;
      height = mState.view.innerHeight;
    } else {
      width = mState.node.clientWidth;
      height = mState.node.clientHeight;
    }

    let dX = mState.goal.x - aPosition.x,
        dY = mState.goal.y - aPosition.y;

    let pitchX = (Math.abs(dX) < width) ? near : far,
        pitchY = (Math.abs(dY) < height) ? near : far;

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
    } else {
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
    } else {
      mState.node.scrollLeft = aPosition.x;
      mState.node.scrollTop  = aPosition.y;
    }
  }

  function doScrollBy(aPosition) {
    if (mState.view) {
      mState.view.scrollBy(aPosition.x, aPosition.y);
    } else {
      mState.node.scrollLeft += aPosition.x;
      mState.node.scrollTop  += aPosition.y;
    }
  }

  function testScrollable(aNode) {
    let view = null;
    let scrollable = false;

    if (aNode instanceof Window ||
        aNode instanceof HTMLHtmlElement ||
        aNode instanceof HTMLBodyElement) {
      view = getWindow(aNode);
      scrollable = view.scrollMaxX || view.scrollMaxY;
    }
    else if (aNode instanceof Element) {
      scrollable =
        aNode.scrollHeight > aNode.clientHeight ||
        aNode.scrollWidth > aNode.clientWidth;
    }

    if (scrollable) {
      return {view: view};
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
    return {x: aX, y: aY};
  }


  //********** Expose

  return {
    start: start,
    cancel: cancel
  };
}

/**
 * Blinking a found text between on and off a selection
 * @return {hash}
 *   start: {function}
 *   cancel: {function}
 *
 * @note The selection becomes harder to see accoding to the page style. So I
 * have set the selection style in <userContent.css>.
 * ::-moz-selection {
 *   color: white !important;
 *   background: blue !important;
 * }
 *
 * TODO: Use nsISelectionController::SELECTION_ATTENTION.
 * If the style of a found text selection (white text on green back) is changed
 * by the page style, I don't know how to fix it because <::-moz-selection> is
 * not applied to it.
 */
function FoundBlink() {
  const kOption = {
    // Duration of blinking (millisecond)
    duration: 2000,
    // The number of times to blink (even number)
    // * 6 steps mean on->off->on->off->on->off->on
    steps: 12
  };

  var mTimerID;
  var mSelectionController;

  // Attach a cleaner when the selection is removed by clicking
  addEvent([gBrowser.mPanelContainer, 'mousedown', uninit, false]);


  //********** Functions

  function init() {
    var selectionController = TextFinder.selectionController;
    if (selectionController) {
      mSelectionController = selectionController;
      return true;
    }
    return false;
  }

  function uninit() {
    if (mTimerID) {
      clearInterval(mTimerID);
      mTimerID = null;
    }

    if (mSelectionController) {
      setDisplay(true);
      mSelectionController = null;
    }
  }

  function start() {
    if (!init()) {
      return;
    }

    var {duration, steps} = kOption;
    var limits = steps, blinks = 0;
    var range = getRange();

    mTimerID = setInterval(function() {
      // do nothing until the selection is into the view
      if (blinks === 0 && limits-- > 0 && !isRangeIntoView(range)) {
        return;
      }

      // break when blinks end or the trial limit is expired
      if (blinks === steps || limits <= 0) {
        uninit();
        return;
      }

      // |blinks| odd: on, even: off
      setDisplay(!!(blinks++ % 2));
    },
    parseInt(duration / steps, 10));
  }

  function cancel() {
    uninit();
  }

  function isRangeIntoView(aRange) {
    var {top, bottom} = aRange.getBoundingClientRect();

    return 0 <= top && bottom <= window.innerHeight;
  }

  function getRange() {
    const {SELECTION_NORMAL} = window.Ci.nsISelectionController;

    return mSelectionController.
      getSelection(SELECTION_NORMAL).
      getRangeAt(0);
  }

  function setDisplay(aShow) {
    const {
      SELECTION_NORMAL,
      SELECTION_OFF,
      SELECTION_ON
    } = window.Ci.nsISelectionController;

    let type = aShow ? SELECTION_ON : SELECTION_OFF;

    try {
      mSelectionController.setDisplaySelection(type);
      mSelectionController.repaintSelection(SELECTION_NORMAL);
    } catch (ex) {}
  }


  //********** Expose

  return {
    start: start,
    cancel: cancel
  };
}


//********** Entry point

FindAgainScroller_init();


})(this);
