// ==UserScript==
// @name        FindAgainScroller.uc.js
// @description Customizes the scroll style on "Find again" command
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @note A default function is modified. see @modified


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  TimerHandler: {
    setTimeout,
    clearTimeout,
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
var TextFinder = (function() {
  // @see chrome://browser/content/browser.js
  const {gFindBar} = window;

  return {
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
})();

/**
 * Main function
 */
function FindAgainScroller_init() {
  var mScrollObserver = ScrollObserver();

  // Optional functions
  var mSkipInvisible = kConfig.skipInvisible && SkipInvisible();
  var mHCentered = kConfig.horizontalCentered && HorizontalCentered();
  var mSmoothScroll = kConfig.smoothScroll && SmoothScroll();
  var mFoundBlink = kConfig.foundBlink && FoundBlink();

  // @modified chrome://global/content/bindings/findbar.xml::
  // onFindAgainCommand
  const {gFindBar} = window;
  var $onFindAgainCommand = gFindBar.onFindAgainCommand;
  gFindBar.onFindAgainCommand = function(aFindPrevious) {
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

    function hasItem(aNode) {
      return mItems.has(aNode);
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
      hasItem: hasItem,
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
    // There may be many <div> so that we grab the deepest <div> and test the
    // scrollability to its ancestor.
    // TODO: slow in the big document. faster finding or skip finding.
    const xpath = '//textarea|//pre|//ul|//ol|//div[not(descendant::div)]';

    $X(xpath, root).forEach(function(node) {
      let testAncestor = node instanceof HTMLDivElement;
      let scrollable = testScrollable(node, testAncestor);
      if (scrollable) {
        mScrollable.addItem(scrollable);
      }
    });
  }

  function testScrollable(aNode, aTestAncestor) {
    function isRegistered(aNode) {
      return mScrollable.hasItem(aNode);
    }

    function isScrollable(aNode) {
      return aNode.scrollHeight > aNode.clientHeight ||
             aNode.scrollWidth > aNode.clientWidth;
    }

    if (aTestAncestor) {
      while (aNode) {
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

    if (!isRegistered(aNode) &&
        isScrollable(aNode)) {
      return aNode;
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
    let rect, style;

    while (aNode) {
      if (aNode.nodeType === Node.ELEMENT_NODE) {
        if (aNode.hidden || aNode.collapsed) {
          return false;
        }

        rect = aNode.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
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
      doCentering(aView, right - center);
    }
    else if (left > center) {
      doCentering(aView, left - center);
    }
  }

  function doCentering(aView, aX) {
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
 */
function SmoothScroll() {
  const kOption = {
    // Pitch of the scroll
    // far: The goal is away from the current viewport over its width/height
    // near: The goal comes within the w/h of the viewport
    // * 8 pitches mean approaching to the goal by each remaining distance
    // divided by 8
    // * the bigger value, the slower moving
    pitch: {far: 8, near: 6}
  };

  var mTimerID;
  var mStartTime;

  var mState = {
    init: function({node, start, goal}) {
      if (!node || !start || !goal) {
        return false;
      }

      var scrollable = testScrollable(node);
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


  //********** Functions

  function startScroll(aState) {
    // terminate the current scrolling
    stopScroll(false);

    if (!mState.init(aState)) {
      return;
    }

    doScrollTo(mState.start);

    mStartTime = Date.now();
    doStep(getStep(mState.start), mStartTime);
  }

  function doStep(aStep, aLastTime) {
    var was = getScroll();
    doScrollBy(aStep);
    var now = getScroll();

    var currentTime = Date.now();
    if (currentTime - mStartTime > 1000 ||
        currentTime - aLastTime > 100) {
      // it takes too much time. stop stepping and jump to goal
      stopScroll(true);
    }
    else if (was.delta.x * now.delta.x <= 0 &&
             was.delta.y * now.delta.y <= 0) {
      // reached the goal or went over. stop stepping at here
      stopScroll(false);
    }
    else {
      mTimerID = setTimeout(doStep, 0, getStep(now.position), currentTime);
    }
  }

  function stopScroll(aForceGoal) {
    if (!mTimerID) {
      return;
    }

    clearTimeout(mTimerID);
    mTimerID = null;
    mStartTime = null;

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
    var x, y;
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
    var view = null;
    var scrollable = false;

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
    start: startScroll
  };
}

/**
 * Blinking a found text between on and off a selection
 * @return {hash}
 *   start: {function}
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
    uninit();

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
    start: start
  };
}


//********** Entry point

FindAgainScroller_init();


})(this);
