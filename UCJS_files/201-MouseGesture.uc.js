// ==UserScript==
// @name        MouseGesture.uc.js
// @description Mouse gesture functions.
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @require [for gesture command] Util.uc.js, NaviLink.uc.js, TabEx.uc.js,
//   WebService.uc.js, UI.uc.js


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
  // Mouse wheel for Right-down mode.
  wheelUp: 'W+', wheelDown: 'W-',
  // Target types for D&D mode.
  text: 'TEXT#', link: 'LINK#', image: 'IMAGE#',
  // Do action immediately without mouseup when gesture matches.
  quickShot: '!'
};


/**
 * Gestures setting.
 * @key gesture {string[]} Combination of kGestureSign.
 * @key name {string}
 * @key command {function}
 *   @param aParam {hash}
 *     @key gesture {string}
 *     @key data {string} Drag data in D&D mode.
 * @key disabled {boolean} [Optional]
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
      gBrowser.goBack();
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
      gBrowser.goForward();
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


  //***** Reloading.

  {
    gestures: ['UD'],
    name: '更新/中止',
    command: function() {
      doCmd($('stop-button').disabled ? 'Browser:Reload' : 'Browser:Stop');
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
      gBrowser.tabContainer.advanceSelectedTab(-1, true);
    }
  },
  {
    gestures: ['!W-'],
    name: '次のタブへ',
    command: function() {
      gBrowser.tabContainer.advanceSelectedTab(+1, true);
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


/**
 * Handler of information of a tab
 * @see checkTab()
 */
var mTabInfo = {
  init: function() {
    this.tab = this.currentTab;
    this.URL = this.currentURL;
  },

  clear: function() {
    delete this.tab;
    delete this.URL;
  },

  isTabChanged: function() {
    return this.tab !== this.currentTab;
  },

  isSameTabButDifferentURL: function() {
    return this.tab === this.currentTab &&
           this.URL !== this.currentURL;
  },

  get currentTab()
    gBrowser.mCurrentTab,

  get currentURL()
    gBrowser.currentURI.spec
};


// Handlers.

/**
 * Handler of MouseGesture.
 */
function MouseGesture() {
  const kState = {READY: 0, GESTURE: 1, DRAG: 2};

  var mState = kState.READY;
  var mCancelDrag = false;
  var mCustomDragData = null;
  var mMouse = MouseManager();
  var mGesture = GestureManager();

  registerEvents();

  function registerEvents() {
    var pc = gBrowser.mPanelContainer;

    // Set mousedown into capture mode to enable to suppress default wheel
    // click.
    // Set mouseup into capture mode to ensure to catch the event on gesture
    // makes tab change.
    addEvent([pc, 'mousedown', onMouseDown, true]);
    addEvent([pc, 'mousemove', onMouseMove, false]);
    addEvent([pc, 'mouseup', onMouseUp, true]);
    addEvent([pc, 'DOMMouseScroll', onMouseScroll, false]);
    addEvent([pc, 'keydown', onKeyDown, false]);
    addEvent([pc, 'keyup', onKeyUp, false]);
    addEvent([pc, 'contextmenu', onContextMenu, true]);

    // Observe D&D event on window to detect tooltip XUL element.
    // Set event into capture mode to suppress default behavior.
    addEvent([window, 'dragstart', onDragStart, false]);
    addEvent([window, 'dragend', onDragEnd, false]);
    addEvent([window, 'dragover', onDragOver, true]);
    addEvent([window, 'drop', onDrop, true]);
  }

  // WORKAROUND: Cancel all state when the URL changes in the current tab.
  // After loading a new URL in the same tab while holding mouse button down,
  // any mouse events can not be caught as long as holding it.
  // TODO: Maybe this problem was fixed, but I can not find the information.
  // So wait and see.
  function checkTab() {
    if (mState !== kState.READY) {
      if (mTabInfo.isSameTabButDifferentURL()) {
        mMouse.clear();
        cancel();
      }
    }
  }


  // Event handlers.

  function onMouseDown(aEvent) {
    checkTab();

    mMouse.update(aEvent);

    if (aEvent.button === 0) {
      if (mCancelDrag) {
        mCancelDrag = false;
      }

      // scan a custom drag element
      let target = aEvent.target;
      let element, data;
      if (target instanceof HTMLCanvasElement) {
        element = target;
        data = {type: kGestureSign.image, data: element.toDataURL()};
      }
      if (element && !element.draggable) {
        element.draggable = true;
        mCustomDragData = data;
      }
    } else if (aEvent.button === 1) {
      if (mState !== kState.READY) {
        suppressDefault(aEvent);
      }
    } else if (aEvent.button === 2) {
      startGesture(aEvent);
    }
  }

  function onMouseMove(aEvent) {
    checkTab();

    mMouse.update(aEvent);

    if (mState === kState.GESTURE) {
      if (inGestureArea(aEvent)) {
        progress(aEvent);
      } else {
        cancel();
      }
    }
  }

  function onMouseUp(aEvent) {
    mMouse.update(aEvent);

    if (aEvent.button === 2) {
      if (mState === kState.GESTURE) {
        stop();
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

  function onDragStart(aEvent) {
    if (inGestureArea(aEvent)) {
      startDrag(aEvent);
    }
  }

  function onDragEnd(aEvent) {
    if (mCustomDragData) {
      aEvent.target.draggable = false;
      mCustomDragData = null;
    }
  }

  // @note Use not 'dragenter' but 'dragover' in order to check the screen
  // coordinate.
  function onDragOver(aEvent) {
    if (mState !== kState.DRAG || mCancelDrag)
      return;

    if (inTooltip(aEvent) || (inGestureArea(aEvent) && !inEditable(aEvent))) {
      suppressDefault(aEvent);
      progress(aEvent);
    } else if (!inGestureArea(aEvent)) {
      cancel();
    }
  }

  // TODO: Prevent the drop event when a right mouse button is pressed down
  // while dragging. At present the drop event fires.
  function onDrop(aEvent) {
    if (mState !== kState.DRAG)
      return;

    if (inTooltip(aEvent) || (inGestureArea(aEvent) && !inEditable(aEvent))) {
      suppressDefault(aEvent);
      stop();
    } else if (inEditable(aEvent)) {
      cancel();
    }
  }

  function suppressDefault(aEvent) {
    aEvent.preventDefault();
    aEvent.stopPropagation();
  }


  // Helper functions.

  function startGesture(aEvent) {
    mState = kState.GESTURE;
    start(aEvent);
  }

  function startDrag(aEvent) {
    if (start(aEvent)) {
      mState = kState.DRAG;
      mCancelDrag = false;
    } else {
      mCancelDrag = true;
    }
  }

  function start(aEvent) {
    mTabInfo.init();
    return mGesture.init(aEvent, mCustomDragData);
  }

  function clear() {
    mState = kState.READY;
    mGesture.clear();
    mTabInfo.clear();
  }

  function progress(aEvent) {
    mGesture.update(aEvent);
  }

  function stop(aCancel) {
    if (mState === kState.DRAG) {
      mCancelDrag = !!aCancel;
    }

    if (!aCancel) {
      mGesture.evaluate();
    }

    clear();
  }

  function cancel() {
    stop(true);
  }
}

/**
 * Handler of MouseManager.
 * @return {hash}
 */
function MouseManager() {
  var isRightDown, isElseDown, cancelContext;

  clear();

  function clear() {
    isRightDown = false;
    isElseDown = false;
    cancelContext = false;
  }

  function update(aEvent) {
    const {type, button} = aEvent;

    if (type === 'mousedown') {
      if (button === 2) {
        enableContextMenu(true);
        cancelContext = false;
        isRightDown = true;

        if (isElseDown) {
          cancelContext = true;
        }
      } else {
        isElseDown = true;

        if (isRightDown) {
          cancelContext = true;
        }
      }
    } else if (type === 'mouseup') {
      if (button === 2) {
        isRightDown = false;
      } else {
        isElseDown = false;
      }
    } else if (type === 'contextmenu') {
      enableContextMenu(!cancelContext);
      cancelContext = false;
    } else if (isRightDown) {
      cancelContext = true;
    }
  }

  return {
    clear: clear,
    update: update
  };
}

/**
 * Handler of GestureManager.
 * @return {hash}
 */
function GestureManager() {
  var mTracer = GestureTracer();
  var mKey, mType, mChain, mData;
  var mMatchItem, mQuickShot, mQuickShotTimer;

  clear();

  function clear() {
    mTracer.clear();
    clearGesture();
    setOverLink(true);
  }

  function clearGesture() {
    mKey = '';
    mType = '';
    mChain = '';
    mData = '';
    mMatchItem = null;
    mQuickShot = false;

    if (mQuickShotTimer) {
      clearTimeout(mQuickShotTimer);
    }
    mQuickShotTimer = null;

    showStatus(false);
  }

  function buildGesture() {
    var quickShot = mQuickShot ? kGestureSign.quickShot : '';

    return quickShot + mKey + mType + mChain;
  }

  function init(aEvent, aCustomDragData) {
    setOverLink(false);
    mTracer.init(aEvent);

    if (aEvent.type === 'dragstart') {
      let info = getDragInfo(aEvent, aCustomDragData);
      if (!info.type || !info.data)
        return false;

      mType = info.type;
      mData = info.data;
    }
    return true;
  }

  function getDragInfo(aEvent, aCustomDragData) {
    var type = '', data = '';
    var node = aEvent.target;

    // 1. custom drag
    if (aCustomDragData) {
      type = aCustomDragData.type;
      data = aCustomDragData.data;
      // set the drag data and a custom dragging is ready
      aEvent.dataTransfer.setData('text/plain', data);
    }
    // 2. selected text
    if (!type) {
      let text = getSelectionAtCursor({event: aEvent});
      if (text || node instanceof Text) {
        type = kGestureSign.text;
        data = text || aEvent.dataTransfer.getData('text/plain');
      }
    }
    // 3. link
    if (!type) {
      let link = getLinkURL(lookupLink(node));
      if (link) {
        type = kGestureSign.link;
        data = /^(?:https?|ftp):/.test(link) && link;
      }
    }
    // 4. image
    if (!type) {
      if (node instanceof HTMLImageElement ||
          node instanceof SVGImageElement) {
        type = kGestureSign.image;
        data = getImageURL(node);
      }
    }

    return {type: type, data: data};
  }

  function update(aEvent) {
    if (updateChain(aEvent) || updateKey(aEvent)) {
      let [matchItem, quickShot] = matchGestureSet();

      if (mQuickShotTimer) {
        if (!quickShot)
          return;
        clearGesture();
      }

      mMatchItem = matchItem;
      mQuickShot = quickShot;

      showStatus(true);

      if (mQuickShot) {
        doAction();
        mQuickShotTimer = setTimeout(clearGesture, 500);
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
      let gesture = kGestureSign[sign];
      let index = mChain.length - gesture.length;
      if (index < 0 || mChain.substr(index) !== gesture) {
        mChain += gesture;
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
          var isQuickShot = (gesture.indexOf(kGestureSign.quickShot) > -1);
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

  function doAction() {
    if (mMatchItem) {
      try {
        mMatchItem.command({gesture: buildGesture(), data: mData});
      } catch (e) {
        setTimeout(function() displayStatus('Gesture: Command error!'), 0);
        log('Command error: ' + toString() + '\n' + e);
      }
    }
  }

  function evaluate() {
    if (!mQuickShot && mChain) {
      doAction();
    }
  }

  function toString() {
    const kGestureDisplay = ['Gesture: %GESTURE%', ' (%NAME%)'];

    var name = mMatchItem ? U(mMatchItem.name) : '';
    var format = kGestureDisplay[0] + (name ? kGestureDisplay[1] : '');

    return format.replace('%GESTURE%', buildGesture()).replace('%NAME%', name);
  }

  function showStatus(aShouldShow) {
    displayStatus(aShouldShow ? toString() : '');
  }

  return {
    clear: clear,
    init: init,
    update: update,
    evaluate: evaluate
  };
}

/**
 * Handler of GestureTracer.
 * @return {hash}
 */
function GestureTracer() {
  // The minimum distance of movement for the gesture is detected.
  // @value Pixels > 0
  const kTolerance = 10;

  var lastX, lastY;

  clear();

  function clear() {
    lastX = -1;
    lastY = -1;
  }

  function init(aEvent) {
    lastX = aEvent.screenX;
    lastY = aEvent.screenY;
  }

  function update(aEvent) {
    var [x, y] = [aEvent.screenX, aEvent.screenY];
    var [dx, dy] = [Math.abs(x - lastX), Math.abs(y - lastY)];

    var toward = {x: 0, y: 0};

    if (kTolerance < dx || kTolerance < dy) {
      if (dy < dx) {
        toward.x = (x < lastX) ? -1 : 1;
      } else {
        toward.y = (y < lastY) ? -1 : 1;
      }

      lastX = x;
      lastY = y;
    }

    return toward;
  }

  return {
    clear: clear,
    init: init,
    update: update
  };
}


// Utilities.

function inGestureArea(aEvent) {
  var {width, height, screenX: left, screenY: top} =
    gBrowser.mPanelContainer.boxObject;
  var {screenX: x, screenY: y} = aEvent;
  // Convert the screen coordinates of cursor to the client coordinates.
  x -= left;
  y -= top;

  // Margin of cancelling a gesture.
  // @value Pixels of the width of scrollbar.
  var margin = 16;

  return margin < x && x < (width - margin) &&
         margin < y && y < (height - margin);
}

function inTooltip(aEvent) {
  var node = aEvent.target;

  return node instanceof XULElement && node.id === 'aHTMLTooltip';
}

function inEditable(aEvent) {
  var node = aEvent.target;

  return (
    node instanceof HTMLTextAreaElement ||
    ('mozIsTextField' in node && node.mozIsTextField(false)) ||
    /^(?:password|search|text|textarea)$/.test(node.type) ||
    ('isContentEditable' in node && node.isContentEditable) ||
    node.ownerDocument.designMode.toLowerCase() === 'on' ||
    node.hasAttribute('dropzone')
  );
}

function lookupLink(aNode) {
  for (let node = aNode; node; node = node.parentNode) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node instanceof HTMLAnchorElement ||
          node instanceof HTMLAreaElement ||
          node instanceof HTMLLinkElement ||
          node instanceof SVGAElement) {
        return node;
      }
    }
  }
  return null;
}

function getLinkURL(aNode) {
  var URL;

  if (!aNode)
    return URL;

  if (aNode instanceof SVGAElement) {
    try {
      URL = makeURLAbsolute(aNode.baseURI, aNode.href.baseVal);
    } catch (e) {}
  }

  return URL || aNode.href;
}

function getImageURL(aNode) {
  var URL;

  if (!aNode)
    return URL;

  if (aNode instanceof SVGImageElement) {
    try {
      URL = makeURLAbsolute(aNode.baseURI, aNode.href.baseVal);
    } catch (e) {}
  }

  return URL || aNode.src;
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


// Imports.

function enableContextMenu(aEnable) {
  ucjsUI.ContentArea.contextMenu.hidden = !aEnable;
}

function setOverLink(aEnabled) {
  ucjsUI.StatusField.setOverLink(aEnabled);
}

function displayStatus(aText) {
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
    ucjsTrustURL: /^data:image\/png;base64,/.test(aURL)
  });
}

function openHomePages(aReplace) {
  ucjsUtil.openHomePages(aReplace);
}

function log(aMsg)
  ucjsUtil.logMessage('MouseGesture.uc.js', aMsg);


// Entry point.

function MouseGesture_init() {
  MouseGesture();
}

MouseGesture_init();


})();
