// ==UserScript==
// @name        MouseGesture.uc.js
// @description Mouse gesture functions.
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @require [for gesture command] Util.uc.js, NaviLink.uc.js, TabEx.uc.js, WebService.uc.js, UI.uc.js


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
 * @key gesture {array of string} Combination of kGestureSign.
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
      duplicateTabIn(gBrowser.mCurrentTab, 'tab');
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
      toggleSidebar('viewHistorySidebar');
    }
  },
  {
    gestures: ['LD'],
    name: 'ブックマークを開閉',
    command: function() {
      toggleSidebar('viewBookmarksSidebar');
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
 * Handler of tab info.
 * @note This is a workaround function.
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
    return this.tab === this.currentTab && this.URL !== this.currentURL;
  },

  get currentTab() gBrowser.mCurrentTab,

  get currentURL() gBrowser.currentURI.spec
};


// Handlers.

/**
 * Handler of MouseGesture.
 */
function MouseGesture() {
  const kState = {READY: 0, GESTURE: 1, DRAG: 2};

  var mState = kState.READY;
  var mCancelDrag = false;
  var mMouse = MouseManager();
  var mGesture = GestureManager();

  init();

  function init() {
    var pc = gBrowser.mPanelContainer;

    // Set mousedown into capture mode to enable to suppress default wheel click.
    // Set mouseup into capture mode to ensure to catch the event on gesture makes tab change.
    addEvent([pc, 'mousedown', onMouseDown, true]);
    addEvent([pc, 'mousemove', onMouseMove, false]);
    addEvent([pc, 'mouseup', onMouseUp, true]);
    addEvent([pc, 'DOMMouseScroll', onMouseScroll, false]);
    addEvent([pc, 'keydown', onKeyDown, false]);
    addEvent([pc, 'keyup', onKeyUp, false]);
    addEvent([pc, 'click', onClick, false]);
    addEvent([pc, 'contextmenu', onContextMenu, true]);

    // Observe D&D event on window to detect tooltip XUL element.
    // Set event into capture mode to suppress default behavior.
    addEvent([window, 'dragover', onDragOver, true]);
    addEvent([window, 'drop', onDrop, true]);
  }

  // @WORKAROUND After loading a new URL in the same tab while holding mouse button down,
  // any events of mouse can not be caught as long as holding it.
  // We must cancel all state when the URL changes in the current tab.
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

  function onClick(aEvent) {
    if (aEvent.button === 0 && inLink(aEvent)) {
      if (mState !== kState.READY) {
        suppressDefault(aEvent);
      }
    }
  }

  function onContextMenu(aEvent) {
    mMouse.update(aEvent);
  }

  // @note startDrag() is fired here to get dragging data in textbox.
  function onDragOver(aEvent) {
    if (mCancelDrag)
      return;

    if (mState !== kState.DRAG) {
      mMouse.update(aEvent);
      if (inDragArea(aEvent)) {
        startDrag(aEvent);
      }
      return;
    }

    if (inTooltip(aEvent) || (inGestureArea(aEvent) && !inEditable(aEvent))) {
      suppressDefault(aEvent);
      progress(aEvent);
    } else if (!inGestureArea(aEvent)) {
      cancel();
    }
  }

  // @TODO: prevent drop event when right mouse button is pressed down.
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
    return mGesture.init(aEvent);
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
    } else if (type === 'dragover') {
      isElseDown = false;
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
  var mKey, mType, mChain, mData, mMatchItem, mQuickShot;
  var mQuickShotTimer = null;

  clear();

  function clear() {
    mTracer.clear();
    clearGesture();
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
      mQuickShotTimer = null;
    }

    showStatus(false);
  }

  function buildGesture() {
    var quickShot = mQuickShot ? kGestureSign.quickShot : '';

    return quickShot + mKey + mType + mChain;
  }

  function init(aEvent) {
    mTracer.init(aEvent);

    if (aEvent.type === 'dragover') {
      let info = getDragInfo(aEvent);
      if (!info.type || !info.data)
        return false;

      mType = info.type;
      mData = info.data;
    }
    return true;
  }

  function getDragInfo(aEvent) {
    var type = '', data = '';

    var text = getSelectionAtCursor({event: aEvent});
    if (text) {
      type = kGestureSign.text;
      data = text;
    } else {
      let link = '', image = '';

      let dt = aEvent.dataTransfer;
      if (dt.types.contains('text/x-moz-url')) {
        link = dt.getData('text/x-moz-url-data');
        if (link) {
          type = kGestureSign.link;
        }
      }
      if (dt.types.contains('application/x-moz-nativeimage')) {
        image = dt.getData('application/x-moz-file-promise-url');
        if (!link || link === image) {
          type = kGestureSign.image;
        }
      }

      data = (link && image) ? link : (link || image || '');
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
    const {type, keyCode, shiftKey, ctrlKey} = aEvent;

    function has(aKey) mKey.indexOf(aKey) > -1;

    var key = '';
    var pressed = false;

    if (type === 'keydown') {
      if (keyCode === 16 && !has(shift)) {
        key = shift;
        pressed = true;
      } else if (keyCode === 17 && !has(ctrl)) {
        key = ctrl;
        pressed = true;
      }
    } else if (type === 'keyup') {
      if (keyCode === 16 && has(shift)) {
        key = shift;
        pressed = false;
      } else if (keyCode === 17 && has(ctrl)) {
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
  var doc = aEvent.target.ownerDocument;

  if (!(doc instanceof HTMLDocument))
    return false;
  if (doc.URL === 'about:blank')
    return true;

  var {innerWidth, innerHeight} = doc.defaultView;
  var {clientX, clientY} = aEvent;

  // Cancelling margin of gesture.
  // @value Pixels of the width of scrollbar.
  var margin = 16;

  return margin < clientX && clientX < (innerWidth - margin) &&
         margin < clientY && clientY < (innerHeight - margin);
}

function inDragArea(aEvent) {
  var src =
    Cc['@mozilla.org/widget/dragservice;1'].
    getService(Ci.nsIDragService).
    getCurrentSession().
    sourceDocument;
  var dst = aEvent.target.ownerDocument;

  return src && dst && src === dst && inGestureArea(aEvent);
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

function inLink(aEvent) {
  for (let node = aEvent.target; node; node = node.parentNode) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node instanceof HTMLAnchorElement ||
          node instanceof HTMLAreaElement ||
          node instanceof HTMLLinkElement ||
          node.getAttributeNS('http://www.w3.org/1999/xlink', 'type') === 'simple') {
        return true;
      }
    }
  }
  return false;
}

function doCmd(aCommand) {
  var command = $(aCommand);
  if (command) {
    command.doCommand();
  } else {
    goDoCommand(aCommand);
  }
}

function $(aId)
  document.getElementById(aId);


// Imports.

function enableContextMenu(aEnable) {
  ucjsUI.ContentArea.contextMenu.hidden = !aEnable;
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

function loadPage(aURL)
  ucjsUtil.loadPage(aURL);

function openTab(aURL, aBG)
  ucjsUtil.openTab(aURL, {inBackground: aBG, relatedToCurrent: true});

function openHomePages(aReplace)
  ucjsUtil.openHomePages(aReplace);

function log(aMsg)
  ucjsUtil.logMessage('MouseGesture.uc.js', aMsg);


// Entry point.

MouseGesture();


})();
