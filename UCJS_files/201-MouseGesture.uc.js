// ==UserScript==
// @name        MouseGesture.uc.js
// @description Mouse gesture functions.
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @require [for commands] Util.uc.js, NaviLink.uc.js, TabEx.uc.js,
// WebService.uc.js, UI.uc.js

/**
 * @usage;
 *  *Normal mode: gestures or wheel rotations holding down the right mouse
 *   button.
 *  *Drag&Drop mode: gestures dragging a selected text or a link or an image.
 *  *Shift and Ctrl keys are supported.
 *
 * @note;
 *  *The gestures is only available within the inner frame of the content
 *   area. The default width of the frame is 16px. see inGestureArea()
 *  *The max number of signs(directions and wheel rotations) per gesture is 10.
 *   see GestureManager()
 *  *'Alt + RightClick' makes status reset in trouble.
 */


(function() {


"use strict";


/**
 * Gesture signs for kGestureSet.
 */
const kGestureSign = {
  // Modifier keys.
  shift: 'S&', ctrl: 'C&',
  // Directions.
  left: 'L', right: 'R', up: 'U', down: 'D',
  // Mouse wheel for the normal mode.
  wheelUp: 'W+', wheelDown: 'W-',
  // Target types for the D&D mode.
  text: 'TEXT#', link: 'LINK#', image: 'IMAGE#',
  // Do action immediately without mouseup when gesture matches.
  quickShot: '!'
};


/**
 * Gestures setting.
 * @key gestures {string[]} combination of kGestureSign
 * @key name {string}
 * @key command {function}
 *   @param aParam {hash}
 *     @key gesture {string} built gesture signs
 *     @key data {string} drag data on D&D mode
 * @key disabled {boolean} [optional]
 */
const kGestureSet = [
  {
    disabled: true,
    gestures: ['RL', 'S&RL', 'C&RL', '!RLRL', 'TEXT#RL', 'LINK#RL', 'IMAGE#RL'],
    name: 'テスト',
    command: function(aParam) {
      log('@param:'+aParam.toSource());
    }
  },


  //***** Navigations.

  {
    gestures: ['L'],
    name: '戻る',
    command: function() {
      doCmd('Browser:Back');
    }
  },
  {
    gestures: ['S&L'],
    name: '前のページへ',
    command: function() {
      loadPage(ucjsNaviLink.getPrev());
    }
  },
  {
    gestures: ['R'],
    name: '進む',
    command: function() {
      doCmd('Browser:Forward');
    }
  },
  {
    gestures: ['S&R'],
    name: '次のページへ',
    command: function() {
      loadPage(ucjsNaviLink.getNext());
    }
  },
  {
    gestures: ['U'],
    name: 'ページ先頭へ',
    command: function() {
      doCmd('cmd_scrollTop');
    }
  },
  {
    gestures: ['D'],
    name: 'ページ末尾へ',
    command: function() {
      doCmd('cmd_scrollBottom');
    }
  },
  {
    gestures: ['UD'],
    name: '更新/中止',
    command: function() {
      doCmd(XULBrowserWindow.isBusy ? 'Browser:Stop' : 'Browser:Reload');
    }
  },
  {
    gestures: ['UDU'],
    name: 'キャッシュも更新',
    command: function() {
      doCmd('Browser:ReloadSkipCache');
    }
  },


  //***** Tabs.

  {
    gestures: ['DL'],
    name: 'タブを複製',
    command: function() {
      // @see chrome://browser/content/browser.js::duplicateTabIn
      window.duplicateTabIn(gBrowser.mCurrentTab, 'tab');
    }
  },
  {
    gestures: ['LU'],
    name: '閉じたタブを復元',
    command: function() {
      doCmd('History:UndoCloseTab');
    }
  },
  {
    gestures: ['DR'],
    name: 'タブを閉じる',
    command: function() {
      gBrowser.removeCurrentTab();
    }
  },
  {
    gestures: ['DRDR'],
    name: '強制的にタブを閉じる',
    command: function() {
      gBrowser.removeCurrentTab({ucjsForceClose: true});
    }
  },
  {
    gestures: ['S&DRL'],
    name: '既読のタブを閉じる',
    command: function() {
      ucjsTabEx.closeReadTabs();
    }
  },
  {
    gestures: ['S&DRU'],
    name: '他のタブを閉じる',
    command: function() {
      gBrowser.removeAllTabsBut(gBrowser.mCurrentTab);
    }
  },
  {
    gestures: ['S&DRUL'],
    name: 'ホームだけにする',
    command: function() {
      openHomePages(true);
    }
  },
  {
    gestures: ['DURD'], // shape of 'h'.
    name: 'ホームを開く',
    command: function() {
      openHomePages(false);
    }
  },


  //***** UI.

  {
    gestures: ['RD'],
    name: '履歴を開閉',
    command: function() {
      // @see chrome://browser/content/browser.js::toggleSidebar
      window.toggleSidebar('viewHistorySidebar');
    }
  },
  {
    gestures: ['LD'],
    name: 'ブックマークを開閉',
    command: function() {
      // @see chrome://browser/content/browser.js::toggleSidebar
      window.toggleSidebar('viewBookmarksSidebar');
    }
  },
  {
    gestures: ['!W+'],
    name: '前のタブへ',
    command: function() {
      doCmd('Browser:PrevTab');
    }
  },
  {
    gestures: ['!W-'],
    name: '次のタブへ',
    command: function() {
      doCmd('Browser:NextTab');
    }
  },


  //***** D&D mode.

  {
    gestures: ['TEXT#L'],
    name: 'Weblio',
    command: function(aParam) {
      ucjsWebService.open({name: 'Weblio', data: aParam.data});
    }
  },
  {
    gestures: ['S&TEXT#L'],
    name: 'Google翻訳',
    command: function(aParam) {
      ucjsWebService.open({name: 'GoogleTranslation', data: aParam.data});
    }
  },
  {
    gestures: ['TEXT#R'],
    name: 'Google検索',
    command: function(aParam) {
      ucjsWebService.open({name: 'GoogleSearch', data: aParam.data});
    }
  },
  {
    gestures: ['S&TEXT#R'],
    name: 'Google検索 site:',
    command: function(aParam) {
      var data = aParam.data + ' site:' + gBrowser.currentURI.spec;
      ucjsWebService.open({name: 'GoogleSearch', data: data});
    }
  },
  {
    gestures: ['TEXT#D'],
    name: 'ページ内検索',
    command: function(aParam) {
      ucjsUI.FindBar.findWith(aParam.data, true);
    }
  },
  {
    gestures: ['TEXT#UR'],
    name: '加えて再検索 (Focus)',
    command: function(aParam) {
      ucjsWebService.reSubmitMore(aParam.data);
    }
  },
  {
    gestures: ['S&TEXT#UR'],
    name: '加えて再検索 (Submit)',
    command: function(aParam) {
      ucjsWebService.reSubmitMore(aParam.data, true);
    }
  },
  {
    gestures: ['TEXT#DR'],
    name: '除いて再検索 (Focus)',
    command: function(aParam) {
      ucjsWebService.reSubmitLess(aParam.data);
    }
  },
  {
    gestures: ['S&TEXT#DR'],
    name: '除いて再検索 (Submit)',
    command: function(aParam) {
      ucjsWebService.reSubmitLess(aParam.data, true);
    }
  },
  {
    gestures: ['LINK#U', 'IMAGE#U'],
    name: '新タブに開く',
    command: function(aParam) {
      openTab(aParam.data, false);
    }
  },
  {
    gestures: ['LINK#D', 'IMAGE#D'],
    name: '裏タブで開く',
    command: function(aParam) {
      openTab(aParam.data, true);
    }
  }
];


//***** Handlers.
// TODO: Cancel the gesture when enters into a window(always on top) that is
// overwrapped on the gesture area.

/**
 * Main handler.
 */
function MouseGesture() {
  const kState = {READY: 0, GESTURE: 1, DRAG: 2};
  var mState = kState.READY;

  var mMouse = MouseManager();
  var mGesture = GestureManager();

  registerEvents();

  function registerEvents() {
    var pc = gBrowser.mPanelContainer;

    addEvent([pc, 'mousedown', onMouseDown, false]);
    addEvent([pc, 'mousemove', onMouseMove, false]);
    addEvent([pc, 'mouseup', onMouseUp, false]);
    addEvent([pc, 'DOMMouseScroll', onMouseScroll, false]);
    addEvent([pc, 'keydown', onKeyDown, false]);
    addEvent([pc, 'keyup', onKeyUp, false]);
    addEvent([pc, 'contextmenu', onContextMenu, false]);
    addEvent([pc, 'click', onClick, false]);

    // Use not 'dragenter' but 'dragover' to check the coordinate.
    addEvent([pc, 'dragstart', onDragStart, false]);
    addEvent([pc, 'dragend', onDragEnd, false]);
    addEvent([pc, 'dragover', onDragOver, false]);
    addEvent([pc, 'drop', onDrop, false]);
  }


  //***** Events.

  function onMouseDown(aEvent) {
    var canStart = mMouse.update(aEvent);
    if (canStart) {
      if (mState === kState.READY) {
        if (inGestureArea(aEvent)) {
          startGesture(aEvent);
        }
      } else {
        cancelGesture();
      }
    } else {
      if (mState !== kState.READY) {
        cancelGesture();
      }
    }
  }

  function onMouseMove(aEvent) {
    mMouse.update(aEvent);

    if (mState === kState.GESTURE) {
      if (inGestureArea(aEvent)) {
        progress(aEvent);
      } else {
        cancelGesture();
      }
    }
  }

  function onMouseUp(aEvent) {
    var canStop = mMouse.update(aEvent);
    if (canStop) {
      if (mState === kState.GESTURE) {
        stopGesture();
      }
    }
  }

  function onMouseScroll(aEvent) {
    mMouse.update(aEvent);

    if (mState === kState.GESTURE) {
      suppressDefault(aEvent);
      progress(aEvent);
    }
  }

  function onKeyDown(aEvent) {
    if (mState !== kState.READY) {
      progress(aEvent);
    }
  }

  function onKeyUp(aEvent) {
    if (mState !== kState.READY) {
      progress(aEvent);
    }
  }

  function onContextMenu(aEvent) {
    mMouse.update(aEvent);
  }

  function onClick(aEvent) {
    mMouse.update(aEvent);
  }

  function onDragStart(aEvent) {
    if (mState === kState.READY) {
      if (inGestureArea(aEvent)) {
        startDrag(aEvent);
      }
    }
  }

  function onDragEnd(aEvent) {
    mMouse.update(aEvent);

    // the drag operation is terminated;
    // 1.cancelled by pressing ESC
    // 2.dropped in a disallowed area
    if (mState === kState.DRAG) {
      cancelGesture();
    }
  }

  function onDragOver(aEvent) {
    if (mState !== kState.DRAG)
      return;

    // cancel the gesture drag and the default drag works
    // @note the default drag is also cancelled by pressing ESC
    var forceCancel = aEvent.shiftKey && aEvent.altKey;
    if (forceCancel) {
      cancelGesture();
      return;
    }

    if (inGestureArea(aEvent)) {
      if (!inEditable(aEvent)) {
        suppressDefault(aEvent);
        progress(aEvent);
      }
    } else {
      cancelGesture();
    }
  }

  // TODO: Prevent the drop event when a right mouse button is pressed down
  // while dragging. At present the drop event fires.
  function onDrop(aEvent) {
    if (mState !== kState.DRAG)
      return;

    if (inEditable(aEvent)) {
      cancelGesture();
    } else {
      suppressDefault(aEvent);
      stopGesture();
    }
  }

  function suppressDefault(aEvent) {
    aEvent.preventDefault();
    aEvent.stopPropagation();
  }


  //***** Helpers.

  function startGesture(aEvent) {
    mState = kState.GESTURE;
    start(aEvent);
  }

  function startDrag(aEvent) {
    if (start(aEvent)) {
      mState = kState.DRAG;
    }
  }

  function start(aEvent) {
    return mGesture.init(aEvent);
  }

  function progress(aEvent) {
    mGesture.update(aEvent);
  }

  function stopGesture() {
    mGesture.evaluate();
    clear();
  }

  function cancelGesture() {
    clear();
  }

  function clear() {
    mState = kState.READY;
    mGesture.clear();
  }
}

/**
 * Observes the mouse events.
 * Manages to suppress the contextmenu popup and the click event.
 * @return {hash}
 *   @member update {function}
 *
 * TODO: Prevent contextmenu popups when a right mouse button is clicked while
 * dragging.
 */
function MouseManager() {
  var mRightDown, mElseDown;
  var mSuppressMenu, mSuppressClick;

  clear();

  function clear() {
    mRightDown = false;
    mElseDown = false;
    mSuppressMenu = false;
    mSuppressClick = false;
  }

  function update(aEvent) {
    const {type, button} = aEvent;
    var rv;

    switch (type) {
      case 'mousedown':
        if (button === 2) {
          // allow the gesture starts
          rv = !mElseDown;

          // ready the contextmenu
          enableContextMenu(true);
          mSuppressMenu = false;

          mRightDown = true;
          if (mElseDown) {
            mSuppressMenu = true;
          }
        } else {
          // ready the default click event
          mSuppressClick = false;

          mElseDown = true;
          if (mRightDown) {
            mSuppressMenu = true;
            mSuppressClick = true;
          }
        }
        break;
      case 'mouseup':
        if (button === 2) {
          // allow the gesture stops
          rv = !mElseDown;

          mRightDown = false;
        } else {
          mElseDown = false;
        }
        break;
      case 'dragend':
        // @note always button===0
        mElseDown = false;
        break;
      case 'mousemove':
      case 'DOMMouseScroll':
        // a gesture is in progress
        if (mRightDown) {
          mSuppressMenu = true;
        }
        break;
      case 'contextmenu':
        enableContextMenu(!mSuppressMenu);
        if (mSuppressMenu) {
          mSuppressMenu = false;
        }
        break;
      case 'click':
        if (button === 2) {
          // force reset in trouble
          if (aEvent.altKey) {
            clear();
          }
        } else {
          // @see chrome://browser/content/browser.js::contentAreaClick()
          if (mSuppressClick) {
            aEvent.preventDefault();
            mSuppressClick = false;
          }
        }
        break;
    }

    return rv;
  }

  return {
    update: update
  };
}

/**
 * Builds the mouse gestures and performs its command.
 * @return {hash}
 *   @member clear {function}
 *   @member init {function}
 *   @member update {function}
 *   @member evaluate {function}
 *
 * TODO: show clearly to the user that a quickshot has fired.
 */
function GestureManager() {
  /**
   * Max length of the chain of a gesture.
   * The chain consists of directions and wheel rotations.
   * @value {integer}
   */
  const kMaxChainLength = 10;

  var mTracer = GestureTracer();
  var mKey, mType, mChain, mData;
  var mMatchItem, mQuickShot;
  var mError;

  clear();

  function clear() {
    clearStatusText();
    clearGesture();
    mTracer.clear();
    setOverLink(true);
  }

  function clearGesture() {
    mKey = '';
    mType = '';
    mChain = '';
    mData = '';
    mMatchItem = null;
    mQuickShot = false;
    mError = null;
  }

  function init(aEvent) {
    setOverLink(false);
    mTracer.init(aEvent);

    if (aEvent.type === 'dragstart') {
      let info = getDragInfo(aEvent);
      if (!info.type || !info.data)
        return false;

      mType = info.type;
      mData = info.data;
    }
    return true;
  }

  function getDragInfo(aEvent) {
    var node = aEvent.target;
    var type = '', data = '';

    // 1.selected text
    if (!type) {
      let text = getSelectionAtCursor({event: aEvent});
      if (text) {
        type = kGestureSign.text;
        data = text;
      }
    }
    // 2.link
    if (!type) {
      let link = getLinkURL(node);
      if (link) {
        type = kGestureSign.link;
        data = link;
      }
    }
    // 3.image
    if (!type) {
      let image = getImageURL(node);
      if (image) {
        type = kGestureSign.image;
        data = image;
      }
    }

    return {type: type, data: data};
  }

  function update(aEvent) {
    if (mError)
      return;

    if (mQuickShot) {
      clearGesture();
    }

    if (updateChain(aEvent) || updateKey(aEvent)) {
      [mMatchItem, mQuickShot] = matchGestureSet();

      showStatusText();

      if (mQuickShot) {
        doAction();
      }
    }
  }

  function updateChain(aEvent) {
    const {type, detail} = aEvent;

    var sign = '';

    if (type === 'mousemove' || type === 'dragover') {
      let {x, y} = mTracer.update(aEvent);
      if (x !== 0) {
        sign = (x < 0) ? 'left' : 'right';
      } else if (y !== 0) {
        sign = (y < 0) ? 'up' : 'down';
      }
    } else if (type === 'DOMMouseScroll') {
      sign = (detail < 0) ? 'wheelUp' : 'wheelDown';
    }

    if (sign) {
      // add a new link of chain when the last gesture is not this one
      let gesture = kGestureSign[sign];
      let index = mChain.length - gesture.length;
      if (index < 0 || mChain.indexOf(gesture, index) === -1) {
        mChain += gesture;
        if (mChain.length > kMaxChainLength) {
          mError = 'Too long';
        }
        return true;
      }
    }
    return false;
  }

  function updateKey(aEvent) {
    const {shift, ctrl} = kGestureSign;
    const {
      type,
      keyCode,
      shiftKey, ctrlKey,
      DOM_VK_SHIFT, DOM_VK_CONTROL
    } = aEvent;

    function has(aKey) mKey.indexOf(aKey) > -1;

    var key = '';
    var pressed = false;

    if (type === 'keydown') {
      if (keyCode === DOM_VK_SHIFT && !has(shift)) {
        key = shift;
        pressed = true;
      } else if (keyCode === DOM_VK_CONTROL && !has(ctrl)) {
        key = ctrl;
        pressed = true;
      }
    } else if (type === 'keyup') {
      if (keyCode === DOM_VK_SHIFT && has(shift)) {
        key = shift;
        pressed = false;
      } else if (keyCode === DOM_VK_CONTROL && has(ctrl)) {
        key = ctrl;
        pressed = false;
      }
    } else if (type === 'dragover') {
      if (shiftKey !== has(shift)) {
        key = shift;
        pressed = shiftKey;
      } else if (ctrlKey !== has(ctrl)) {
        key = ctrl;
        pressed = ctrlKey;
      }
    }

    if (key) {
      if (pressed) {
        mKey += key;
      } else {
        mKey = mKey.replace(key, '');
      }
      return true;
    }
    return false;
  }

  function matchGestureSet() {
    var matchItem = null;
    var quickShot = false;

    var target = mChain && buildGesture();
    if (target) {
      kGestureSet.some(function(item) {
        if (item.disabled)
          return false;

        return item.gestures.some(function(gesture) {
          var isQuickShot = gesture.indexOf(kGestureSign.quickShot) > -1;
          if (isQuickShot) {
            gesture = gesture.replace(kGestureSign.quickShot, '');
          }

          if (target === gesture) {
            matchItem = item;
            quickShot = isQuickShot;
            return true;
          }
          return false;
        });
      });
    }

    return [matchItem, quickShot];
  }

  function evaluate() {
    if (!mQuickShot && mChain) {
      doAction();
    }
  }

  function doAction() {
    if (mMatchItem) {
      try {
        mMatchItem.command({gesture: buildGesture(), data: mData});
      } catch (e) {
        mError = 'Command error';
        log(showStatusText() + '\n' + e);
      }
    }
  }

  function buildGesture() {
    var gesture = mKey + mType + mChain;

    if (mQuickShot) {
      gesture = kGestureSign.quickShot + gesture;
    }

    return gesture;
  }

  function showStatusText() {
    var str = toString();

    if (mError) {
      // HACK: display the status after its values have been cleared
      setTimeout(function(s) updateStatusbarText(s), 0, str);
    } else {
      updateStatusbarText(str);
    }

    return str;
  }

  function clearStatusText() {
    updateStatusbarText('');
  }

  function toString() {
    const kFormat = ['Gesture: %GESTURE%', ' (%NAME%)', ' [%ERROR%!]'];

    var str = kFormat[0].replace('%GESTURE%', buildGesture());

    if (mMatchItem) {
      str += kFormat[1].replace('%NAME%', U(mMatchItem.name));
    }
    if (mError) {
      str += kFormat[2].replace('%ERROR%', U(mError));
    }

    return str;
  }

  return {
    clear: clear,
    init: init,
    update: update,
    evaluate: evaluate
  };
}

/**
 * Traces the coordinates of a mouse pointer.
 * @return {hash}
 *   @member clear {function}
 *   @member init {function}
 *   @member update {function}
 */
function GestureTracer() {
  // The minimum distance of movement for the gesture is detected.
  // @value Pixels > 0
  const kTolerance = 10;

  var mLastX, mLastY;

  clear();

  function clear() {
    mLastX = -1;
    mLastY = -1;
  }

  function init(aEvent) {
    mLastX = aEvent.screenX;
    mLastY = aEvent.screenY;
  }

  function update(aEvent) {
    var [x, y] = [aEvent.screenX, aEvent.screenY];
    var [dx, dy] = [Math.abs(x - mLastX), Math.abs(y - mLastY)];

    var toward = {x: 0, y: 0};

    if (kTolerance < dx || kTolerance < dy) {
      if (dy < dx) {
        toward.x = (x < mLastX) ? -1 : 1;
      } else {
        toward.y = (y < mLastY) ? -1 : 1;
      }

      mLastX = x;
      mLastY = y;
    }

    return toward;
  }

  return {
    clear: clear,
    init: init,
    update: update
  };
}


//***** Utilities.

function inGestureArea(aEvent) {
  // Margin of cancelling a gesture.
  // @value Pixels of the width of scrollbar.
  const kMargin = 16;

  var {clientX: x, clientY: y} = aEvent;
  var {width, height} = gBrowser.mPanelContainer.boxObject;

  return kMargin < x && x < (width - kMargin) &&
         kMargin < y && y < (height - kMargin);
}

function inEditable(aEvent) {
  var node = aEvent.target;

  return (
    node instanceof HTMLTextAreaElement ||
    node instanceof HTMLInputElement ||
    node.isContentEditable ||
    node.contentEditable === 'true' ||
    node.ownerDocument.designMode === 'on'
  );
}

function getLinkURL(aNode) {
  var node = aNode;
  for (/* */; node; node = node.parentNode) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node instanceof HTMLAnchorElement ||
          node instanceof HTMLAreaElement ||
          node instanceof HTMLLinkElement ||
          node instanceof SVGAElement) {
        break;
      }
    }
  }

  if (node) {
    if (node instanceof SVGAElement) {
      try {
        // @see chrome://browser/content/utilityOverlay.js::makeURLAbsolute()
        return window.makeURLAbsolute(node.baseURI, node.href.baseVal);
      } catch (e) {}
    } else {
      return node.href;
    }
  }
  return null;
}

function getImageURL(aNode) {
  if (aNode instanceof SVGImageElement) {
    try {
      // @see chrome://browser/content/utilityOverlay.js::makeURLAbsolute()
      return window.makeURLAbsolute(aNode.baseURI, aNode.href.baseVal);
    } catch (e) {}
  } else if (aNode instanceof HTMLImageElement) {
    return aNode.src;
  }
  return null;
}

function doCmd(aCommand) {
  var command = $(aCommand);
  if (command) {
    command.doCommand();
  } else {
    // @see chrome://global/content/globalOverlay.js::goDoCommand
    window.goDoCommand(aCommand);
  }
}

function $(aId)
  document.getElementById(aId);


//***** Imports.

function enableContextMenu(aEnable) {
  ucjsUI.ContentArea.contextMenu.hidden = !aEnable;
}

function setOverLink(aEnabled) {
  ucjsUI.StatusField.setOverLink(aEnabled);
}

function updateStatusbarText(aText) {
  ucjsUI.StatusField.update(aText);
}

function U(aStr)
  ucjsUtil.convertForSystem(aStr);

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function getSelectionAtCursor(aOption)
  ucjsUtil.getSelectionAtCursor(aOption);

function loadPage(aURL) {
  ucjsUtil.loadPage(aURL);
}

function openTab(aURL, aBG) {
  ucjsUtil.openTab(aURL, {
    inBackground: aBG,
    relatedToCurrent: true,
    ucjsTrustURL: /^data:image\/(?:gif|jpg|png);base64,/.test(aURL)
  });
}

function openHomePages(aReplace) {
  ucjsUtil.openHomePages(aReplace);
}

function log(aMsg)
  ucjsUtil.logMessage('MouseGesture.uc.js', aMsg);


//***** Entry point.

function MouseGesture_init() {
  MouseGesture();
}

MouseGesture_init();


})();
