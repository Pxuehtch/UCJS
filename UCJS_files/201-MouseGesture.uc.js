// ==UserScript==
// @name MouseGesture.uc.js
// @description Mouse gesture functions.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @require [optional for commands] Util.uc.js, UI.uc.js, NaviLink.uc.js,
// TabEx.uc.js, WebService.uc.js

/**
 * @usage
 * - Normal mode: Mouse gesture or wheel rotation by holding down the right
 *   mouse button.
 * - Drag&Drop mode: Mouse gesture by dragging a selected text or a link or an
 *   image.
 *
 * - <Shift> and <Ctrl> modifier keys are supported in both modes.
 *   @note The keys are detected after a gesture starts.
 *
 * - You can reset the state of a gesture by <Alt+RightClick> for problems.
 *
 * @note
 * - A gesture is available within the inner frame of the content area only.
 *   The default width of the frame is 16px.
 *   @see |inGestureArea()|
 * - The max number of signs(directions and wheel rotations) per gesture is 10.
 *   @see |GestureManager()|
 */


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  ContentTask,
  Listeners: {
    $event,
    $shutdown,
    throttleEvent
  },
  DOMUtils: {
    $ID
  },
  BrowserUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

const {
  ContentArea: {
    contextMenu: contentAreaContextMenu
  },
  StatusField: {
    setOverLink,
    showMessage: updateStatusText
  }
} = window.ucjsUI;

/**
 * Gesture signs for |kGestureSet|.
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
  // Do command immediately without mouseup when gesture matches.
  quickShot: '!'
};

/**
 * Gesture setting.
 *
 * @key gestures {string[]}
 *   The array of a combination of values of |kGestureSign|.
 *   @note You can assign different gestures to one command.
 * @key name {string}
 * @key command {function}
 *   @param {hash}
 *     @key event {MouseEvent}
 *       The mouse event at when the gesture ends.
 *     @key gesture {string}
 *       The built gesture signs.
 *     @key dragData {string}
 *       The drag data on the D&D mode.
 * @key disabled {boolean} [optional]
 */
const kGestureSet = [
  /**
   * For the page navigation.
   */
  {
    gestures: ['L'],
    name: '戻る',
    command() {
      doCommand('Browser:Back');
    }
  },
  {
    gestures: ['S&L'],
    name: '前のページへ',
    command() {
      window.ucjsNaviLink.promisePrevPageURL().then((url) => {
        window.ucjsUtil.TabUtils.loadPage(url);
      });
    }
  },
  {
    gestures: ['R'],
    name: '進む',
    command() {
      doCommand('Browser:Forward');
    }
  },
  {
    gestures: ['S&R'],
    name: '次のページへ',
    command() {
      window.ucjsNaviLink.promiseNextPageURL().then((url) => {
        window.ucjsUtil.TabUtils.loadPage(url);
      });
    }
  },
  {
    gestures: ['!LW-', '!RW-'],
    name: 'ページの履歴',
    command({event}) {
      let {screenX: x, screenY: y} = event;

      // Offset the popup panel from the cursor to prevent gesture events
      // from being blocked on the panel.
      x += 5;
      y += 5;

      $ID('backForwardMenu').openPopupAtScreen(x, y, false);
    }
  },
  {
    gestures: ['U'],
    name: 'ページ先頭へ',
    command() {
      doCommand('cmd_scrollTop');
    }
  },
  {
    gestures: ['D'],
    name: 'ページ末尾へ',
    command() {
      doCommand('cmd_scrollBottom');
    }
  },
  {
    gestures: ['UD'],
    name: '更新/中止',
    command() {
      // @see chrome://browser/content/browser.js::XULBrowserWindow
      let isBusy = window.XULBrowserWindow.isBusy;

      doCommand(isBusy ? 'Browser:Stop' : 'Browser:Reload');
    }
  },
  {
    gestures: ['S&UD'],
    name: 'キャッシュも更新',
    command() {
      doCommand('Browser:ReloadSkipCache');
    }
  },

  /**
   * For tabs.
   */
  {
    gestures: ['DL'],
    name: 'タブを複製',
    command() {
      // @see chrome://browser/content/browser.js::duplicateTabIn
      window.duplicateTabIn(gBrowser.selectedTab, 'tab');
    }
  },
  {
    gestures: ['LU'],
    name: '閉じたタブを復元',
    command() {
      doCommand('History:UndoCloseTab');
    }
  },
  {
    gestures: ['DR'],
    name: 'タブを閉じる',
    command() {
      window.ucjsUtil.TabUtils.removeTab(gBrowser.selectedTab, {
        safetyLock: true
      });
    }
  },
  {
    gestures: ['S&DR'],
    name: '強制的にタブを閉じる',
    command() {
      window.ucjsUtil.TabUtils.removeTab(gBrowser.selectedTab);
    }
  },
  {
    gestures: ['S&DRL', 'DRLW+', 'DRLW-'],
    name: '既読のタブを閉じる',
    command() {
      window.ucjsTabEx.closeReadTabs();
    }
  },
  {
    gestures: ['S&DRDL', 'DRDLW+', 'DRDLW-'],
    name: '左側のタブを閉じる',
    command() {
      window.ucjsTabEx.closeLeftTabs();
    }
  },
  {
    gestures: ['S&DRDR', 'DRDRW+', 'DRDRW-'],
    name: '右側のタブを閉じる',
    command() {
      window.ucjsTabEx.closeRightTabs();
    }
  },
  {
    gestures: ['S&DRU', 'DRUW+', 'DRUW-'],
    name: '他のタブを閉じる',
    command() {
      window.ucjsUtil.TabUtils.removeAllTabsBut(gBrowser.selectedTab);
    }
  },
  {
    gestures: ['S&DURD', 'DURDW+', 'DURDW-'], // shape of 'h'
    name: 'ホームだけにする',
    command() {
      window.ucjsUtil.TabUtils.openHomePages({
        doReplace: true
      });
    }
  },
  {
    gestures: ['DURD'], // Shape of 'h'.
    name: 'ホームを開く',
    command() {
      window.ucjsUtil.TabUtils.openHomePages();
    }
  },

  /**
   * For the chrome UI.
   */
  {
    gestures: ['RD'],
    name: '履歴を開閉',
    command() {
      // @see chrome://browser/content/browser.js::SidebarUI
      window.SidebarUI.toggle('viewHistorySidebar');
    }
  },
  {
    gestures: ['LD'],
    name: 'ブックマークを開閉',
    command() {
      // @see chrome://browser/content/browser.js::SidebarUI
      window.SidebarUI.toggle('viewBookmarksSidebar');
    }
  },
  {
    gestures: ['!W+'],
    name: '前のタブへ',
    command() {
      doCommand('Browser:PrevTab');
    }
  },
  {
    gestures: ['!W-'],
    name: '次のタブへ',
    command() {
      doCommand('Browser:NextTab');
    }
  },

  /**
   * For the D&D mode.
   */
  {
    gestures: ['TEXT#L'],
    name: 'Weblio',
    command({dragData}) {
      window.ucjsWebService.open({
        name: 'Weblio',
        data: dragData
      });
    }
  },
  {
    gestures: ['S&TEXT#L'],
    name: 'Google翻訳',
    command({dragData}) {
      window.ucjsWebService.open({
        name: 'GoogleTranslation',
        data: dragData
      });
    }
  },
  {
    gestures: ['TEXT#R'],
    name: 'Google検索',
    command({dragData}) {
      window.ucjsWebService.open({
        name: 'GoogleSearch',
        data: dragData
      });
    }
  },
  {
    gestures: ['S&TEXT#R'],
    name: 'Google検索 site:',
    command({dragData}) {
      dragData += ' site:' + gBrowser.currentURI.spec;

      window.ucjsWebService.open({
        name: 'GoogleSearch',
        data: dragData
      });
    }
  },
  {
    gestures: ['TEXT#D'],
    name: 'ページ内検索',
    command({dragData}) {
      window.ucjsUI.FindBar.find(dragData, {
        doHighlight: true
      });
    }
  },
  {
    gestures: ['TEXT#UR'],
    name: '加えて再検索 (Focus)',
    command({dragData}) {
      window.ucjsWebService.updateFormInput(dragData, {
        moreData: true,
        doFocus: true
      });
    }
  },
  {
    gestures: ['S&TEXT#UR'],
    name: '加えて再検索 (Submit)',
    command({dragData}) {
      window.ucjsWebService.updateFormInput(dragData, {
        moreData: true,
        doSubmit: true
      });
    }
  },
  {
    gestures: ['TEXT#DR'],
    name: '除いて再検索 (Focus)',
    command({dragData}) {
      window.ucjsWebService.updateFormInput(dragData, {
        lessData: true,
        doFocus: true
      });
    }
  },
  {
    gestures: ['S&TEXT#DR'],
    name: '除いて再検索 (Submit)',
    command({dragData}) {
      window.ucjsWebService.updateFormInput(dragData, {
        lessData: true,
        doSubmit: true
      });
    }
  },
  {
    gestures: ['LINK#U', 'IMAGE#U'],
    name: '新タブに開く',
    command({dragData}) {
      window.ucjsUtil.TabUtils.openTab(dragData, {
        inBackground: false,
        relatedToCurrent: true,
        allowImageData: true
      });
    }
  },
  {
    gestures: ['LINK#D', 'IMAGE#D'],
    name: '裏タブで開く',
    command({dragData}) {
      window.ucjsUtil.TabUtils.openTab(dragData, {
        inBackground: true,
        relatedToCurrent: true,
        allowImageData: true
      });
    }
  }
];

/**
 * Mouse gesture main handler.
 *
 * TODO: Cancel the gesture when enters into an always-on-top window that
 * overlays on the gesture area.
 *
 * TODO: Prevent the drop event when the right or wheel button is pressed
 * down while dragging. The drop event fires for now.
 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=395761
 */
function MouseGesture() {
  const kState = {
    Ready: 0,
    Pending: 1,
    Gesturing: 2,
    Dragging: 3
  };

  let mState = kState.Ready;
  let mMouseEvent = MouseEventManager();
  let mGesture = GestureManager();

  /**
   * Limit the execution rate of an event that is dispatched more often than
   * we need to process.
   */
  let onMouseMoveThrottled = throttleEvent(onMouseMove);
  let onDragOverThrottled = throttleEvent(onDragOver);

  /**
   * Register the events to observe that a gesture starts and stops.
   *
   * @note The events that are necessary only in progress of a gesture are
   * registered after the gesture starts. And they are unregistered after the
   * gesture stops.
   */
  registerTriggerEvents();

  function registerTriggerEvents() {
    let pc = gBrowser.mPanelContainer;

    // Observe a gesturing operation.
    $event(pc, 'mousedown', onMouseDown);
    $event(pc, 'mouseup', onMouseUp);

    // Observe a dragging operation.
    $event(pc, 'dragstart', onDragStart);
    $event(pc, 'dragend', onDragEnd);

    // WORKAROUND: 'contextmenu' event fires after a gesture stops so we can't
    // add it only in gesturing.
    $event(pc, 'contextmenu', onContextMenu);

    // WORKAROUND: We assign <Alt+RightClick> to reset the state of a gesture
    // ANYTIME when problems occur.
    $event(pc, 'click', onClick);

    // Make sure to clean up when the browser window closes.
    $shutdown(removeEvents);
  }

  function addEvents() {
    let pc = gBrowser.mPanelContainer;

    if (mState === kState.Gesturing) {
      pc.addEventListener('mousemove', onMouseMoveThrottled);
      pc.addEventListener('wheel', onMouseWheel);
      pc.addEventListener('keydown', onKeyDown);
      pc.addEventListener('keyup', onKeyUp);

      // WORKAROUND: Observe a XUL popup element in the content area for
      // cancelling the gesture when the right button is released on it.
      window.addEventListener('mouseup', onGlobalMouseUp);
    }
    else if (mState === kState.Dragging) {
      pc.addEventListener('dragover', onDragOverThrottled);
      pc.addEventListener('keydown', onKeyDown);
      pc.addEventListener('keyup', onKeyUp);
    }
  }

  function removeEvents() {
    let pc = gBrowser.mPanelContainer;

    if (mState === kState.Gesturing) {
      pc.removeEventListener('mousemove', onMouseMoveThrottled);
      pc.removeEventListener('wheel', onMouseWheel);
      pc.removeEventListener('keydown', onKeyDown);
      pc.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    }
    else if (mState === kState.Dragging) {
      pc.removeEventListener('dragover', onDragOverThrottled);
      pc.removeEventListener('keydown', onKeyDown);
      pc.removeEventListener('keyup', onKeyUp);
    }
  }

  /**
   * Event listeners.
   */
  function onMouseDown(aEvent) {
    let canStart = mMouseEvent.update(aEvent);

    if (canStart) {
      if (mState === kState.Ready) {
        if (!inPrintPreviewMode() && inGestureArea(aEvent)) {
          startGesture(aEvent);
        }
      }
      else {
        cancelGesture();
      }
    }
    else {
      if (mState !== kState.Ready) {
        cancelGesture();
      }
    }
  }

  function onMouseMove(aEvent) {
    if (mState === kState.Gesturing) {
      mMouseEvent.update(aEvent);

      if (inGestureArea(aEvent)) {
        progress(aEvent);
      }
      else {
        cancelGesture();
      }
    }
  }

  function onMouseUp(aEvent) {
    let canStop = mMouseEvent.update(aEvent);

    if (canStop) {
      if (mState === kState.Gesturing) {
        stopGesture(aEvent);
      }
    }
  }

  // WORKAROUND: Cancel the gesture on a XUL popup element.
  function onGlobalMouseUp(aEvent) {
    if (mState === kState.Gesturing &&
        isXulPopup(aEvent.target)) {
      cancelGesture();
    }
  }

  function isXulPopup(aNode) {
    if (aNode instanceof XULElement) {
      while (aNode) {
        if (aNode.popupBoxObject &&
            aNode.popupBoxObject.popupState === 'open') {
          return true;
        }

        aNode = aNode.parentNode;
      }
    }

    return false;
  }

  function onMouseWheel(aEvent) {
    if (mState === kState.Gesturing) {
      mMouseEvent.update(aEvent);

      suppressDefault(aEvent);
      progress(aEvent);
    }
  }

  function onKeyDown(aEvent) {
    if (mState !== kState.Ready && mState !== kState.Pending) {
      progress(aEvent);
    }
  }

  function onKeyUp(aEvent) {
    if (mState !== kState.Ready && mState !== kState.Pending) {
      progress(aEvent);
    }
  }

  function onContextMenu(aEvent) {
    mMouseEvent.update(aEvent);
  }

  function onClick(aEvent) {
    mMouseEvent.update(aEvent);
  }

  function onDragStart(aEvent) {
    if (mState === kState.Ready) {
      if (inGestureArea(aEvent)) {
        startDrag(aEvent);
      }
    }
  }

  function onDragOver(aEvent) {
    if (mState !== kState.Dragging) {
      return;
    }

    // Cancel our gesture dragging but the native dragging still works.
    // @note Both drag operations are cancelled by pressing <Esc> key.
    let forceCancel = aEvent.shiftKey && aEvent.altKey;

    if (forceCancel) {
      cancelGesture();

      return;
    }

    if (!inGestureArea(aEvent)) {
      cancelGesture();

      return;
    }

    inEditableNode(aEvent).then((inEditable) => {
      if (!inEditable) {
        progress(aEvent);
      }
    }).
    catch(Cu.reportError);
  }

  function onDragEnd(aEvent) {
    mMouseEvent.update(aEvent);

    if (mState !== kState.Dragging) {
      return;
    }

    // The drag operation is cancelled by pressing <Esc> key.
    if (aEvent.dataTransfer.mozUserCancelled) {
      cancelGesture();

      return;
    }

    inEditableNode(aEvent).then((inEditable) => {
      if (inEditable) {
        cancelGesture();
      }
      else {
        stopGesture(aEvent);
      }
    }).
    catch(Cu.reportError);
  }

  function suppressDefault(aEvent) {
    aEvent.preventDefault();
    aEvent.stopPropagation();
  }

  /**
   * Helper functions.
   */
  function startGesture(aEvent) {
    mState = kState.Pending;

    mGesture.init(aEvent).then((started) => {
      if (started) {
        if (mState === kState.Pending) {
          mState = kState.Gesturing;

          addEvents();
        }
      }
    }).
    catch(Cu.reportError);
  }

  function startDrag(aEvent) {
    mState = kState.Pending;

    mGesture.init(aEvent).then((started) => {
      if (started) {
        if (mState === kState.Pending) {
          mState = kState.Dragging;

          addEvents();
        }
      }
    }).
    catch(Cu.reportError);
  }

  function progress(aEvent) {
    mGesture.update(aEvent);
  }

  function stopGesture(aEvent) {
    mGesture.evaluate(aEvent);

    clear();
  }

  function cancelGesture() {
    clear();
  }

  function clear() {
    removeEvents();

    mState = kState.Ready;

    mGesture.clear();
  }
}

/**
 * Mouse event manager.
 *
 * - Checks whether a gesture can start or stop.
 * - Manages enabling and disabling the context menu and the default click
 *   action of the left/middle button.
 *
 * @return {hash}
 *   @key update {function}
 *
 * TODO: Prevent the context menu popup when the right mouse button is clicked
 * while dragging.
 */
function MouseEventManager() {
  // Whether the right button is pressed down or not.
  let mRightDown;

  // Whether the left/middle(wheel) button is pressed down or not.
  let mOtherDown;

  // Whether the context menu is suppressed or not.
  let mSuppressMenu;

  // Whether the default click action of the left/middle(wheel) button is
  // suppressed or not.
  let mSuppressClick;

  // Initialize the state.
  clear();

  function clear() {
    mRightDown = false;
    mOtherDown = false;
    mSuppressMenu = false;
    mSuppressClick = false;
  }

  /**
   * Updates the state.
   *
   * @param aEvent {MouseEvent}
   * @return {boolean|undefined}
   *   For 'mousedown' {boolean}
   *     Whether a normal mode gesture can start or not.
   *   For 'mouseup' {boolean}
   *     Whether a normal mode gesture can stop or not.
   *   For other cases {undefined}
   *     TODO: We don't return an explicit value since we don't handle the
   *     return value for now.
   */
  function update(aEvent) {
    const {type, button} = aEvent;

    switch (type) {
      case 'mousedown': {
        if (button === 2) {
          mRightDown = true;

          // Disable the context menu while other button is down.
          // OtherDown -> RightDown -> RightUp
          if (mSuppressMenu !== mOtherDown) {
            mSuppressMenu = mOtherDown;
          }

          // A normal gesture can start or not.
          return !mOtherDown;
        }
        else {
          mOtherDown = true;

          // Disable the context menu while the left/middle button is down.
          // RightDown -> OtherDown -> RightUp
          mSuppressMenu = mRightDown;

          // Disable the default click action of the left/middle button while
          // the right button is down.
          // RightDown -> OtherClick
          mSuppressClick = mRightDown;

          // Ready to suppress the default click in the content process.
          // @note The 'click' event here, it is too late to cancel the system
          // click action in the content process. So, in this 'mousedown'
          // event before click, send a ready message to cancel it and the
          // content process will prevent the default click.
          if (mSuppressClick) {
            let mm = gBrowser.selectedBrowser.messageManager;

            mm.sendAsyncMessage('ucjs:PageEvent:PreventDefaultClick');
          }
        }

        break;
      }

      case 'mouseup': {
        if (button === 2) {
          mRightDown = false;

          // A normal gesture can stop or not.
          return !mOtherDown;
        }
        else {
          mOtherDown = false;
        }

        break;
      }

      case 'dragend': {
        // @note Always 'button === 0'.
        mOtherDown = false;

        break;
      }

      // @note 'mousemove' and 'wheel' events work only when a gesture is in
      // progress.
      // @see |MouseGesture::addEvents|
      case 'mousemove':
      case 'wheel': {
        if (!mSuppressMenu) {
          mSuppressMenu = true;
        }

        break;
      }

      case 'contextmenu': {
        let menu = contentAreaContextMenu.get();

        if (menu.hidden !== mSuppressMenu) {
          menu.hidden = mSuppressMenu;
        }

        break;
      }

      case 'click': {
        if (button === 2) {
          // Force to reset the state of a gesture.
          if (aEvent.altKey) {
            clear();
          }
        }

        break;
      }
    }
  }

  return {
    update
  };
}

/**
 * Gesture manager.
 *
 * Builds the mouse gesture and performs its command.
 *
 * @return {hash}
 *   @key clear {function}
 *   @key init {function}
 *   @key update {function}
 *   @key evaluate {function}
 *
 * TODO: Show some clear sign to the user that a quickshot has fired.
 */
function GestureManager() {
  /**
   * Max length of the chain of a gesture.
   *
   * @value {integer}
   *
   * @note The chain consists of directions and wheel rotations.
   */
  const kMaxChainLength = 10;

  let mTracer = GestureTracer();
  let mKey, mChain;
  let mDragType, mDragData;
  let mMatchItem, mQuickShot;
  let mError;

  // Initialize the state.
  clear();

  function clear() {
    clearStatusText();
    clearGesture();

    mTracer.clear();

    setOverLink(true);
  }

  function clearGesture() {
    mKey = [];
    mChain = [];
    mDragType = '';
    mDragData = '';
    mMatchItem = null;
    mQuickShot = false;
    mError = null;
  }

  function init(aEvent) {
    return Task.spawn(function*() {
      setOverLink(false);

      mTracer.init(aEvent);

      if (aEvent.type === 'dragstart') {
        let info = yield getDragInfo(aEvent);

        if (!info.type || !info.data) {
          return false;
        }

        mDragType = info.type;
        mDragData = info.data;
      }

      return true;
    });
  }

  /**
   * Gets information of the dragging data.
   *
   * @param aEvent {DragEvent}
   * @return {hash}
   *   type: {string}
   *     'text' or 'link' or 'image' of |kGestureSign|.
   *   data: {string}
   *     A selected text or a link <href> URL or an image <src> URL.
   *
   * @note Retrieves only one data from a composite data:
   * - A selected text in a link string.
   * - A link href URL of a linked image.
   */
  function getDragInfo(event) {
    return Task.spawn(function*() {
      let type, data;
      let {x, y} = BrowserUtils.getCursorPointInContent(event);

      // 1.A selected text.
      if (!type) {
        let text = yield BrowserUtils.promiseSelectionTextAtPoint(x, y);

        if (text) {
          type = kGestureSign.text;
          data = text;
        }
      }

      // 2.A link URL.
      if (!type) {
        let link = yield promiseLinkURLAtPoint(x, y);

        if (link) {
          type = kGestureSign.link;
          data = link;
        }
      }

      // 3.An image URL.
      if (!type) {
        let image = yield promiseImageURLAtPoint(x, y);

        if (image) {
          type = kGestureSign.image;
          data = image;
        }
      }

      return {
        type,
        data
      };
    });
  }

  function update(aEvent) {
    if (mError) {
      return;
    }

    if (mQuickShot) {
      clearGesture();
    }

    if (updateChain(aEvent) || updateKey(aEvent)) {
      [mMatchItem, mQuickShot] = matchGestureSet();

      showStatusText();

      if (mQuickShot) {
        doAction(aEvent);
      }
    }
  }

  function updateChain(aEvent) {
    let sign = '';

    switch (aEvent.type) {
      case 'mousemove':
      case 'dragover': {
        let {x, y} = mTracer.update(aEvent);

        if (x !== 0) {
          sign = (x < 0) ? 'left' : 'right';
        }
        else if (y !== 0) {
          sign = (y < 0) ? 'up' : 'down';
        }

        break;
      }

      case 'wheel': {
        sign = (aEvent.deltaY < 0) ? 'wheelUp' : 'wheelDown';

        break;
      }
    }

    if (sign) {
      // Add a new link of chain when the last gesture is not this one.
      let gesture = kGestureSign[sign];
      let length = mChain.length;

      if (!length || mChain[length - 1] !== gesture) {
        mChain.push(gesture);

        if (length + 1 > kMaxChainLength) {
          mError = 'Too long';
        }

        return true;
      }
    }

    return false;
  }

  function updateKey(aEvent) {
    const {shift, ctrl} = kGestureSign;

    let has = (aKey) => mKey.includes(aKey);

    let key = '';
    let pressed = false;

    switch (aEvent.type) {
      case 'keydown': {
        if (aEvent.key === 'Shift' && !has(shift)) {
          key = shift;
          pressed = true;
        }
        else if (aEvent.key === 'Control' && !has(ctrl)) {
          key = ctrl;
          pressed = true;
        }

        break;
      }

      case 'keyup': {
        if (aEvent.key === 'Shift' && has(shift)) {
          key = shift;
          pressed = false;
        }
        else if (aEvent.key === 'Control' && has(ctrl)) {
          key = ctrl;
          pressed = false;
        }

        break;
      }

      case 'dragover': {
        let {shiftKey, ctrlKey} = aEvent;

        if (shiftKey !== has(shift)) {
          key = shift;
          pressed = shiftKey;
        }
        else if (ctrlKey !== has(ctrl)) {
          key = ctrl;
          pressed = ctrlKey;
        }

        break;
      }
    }

    if (key) {
      if (pressed) {
        mKey.push(key);
      }
      else {
        mKey.splice(mKey.indexOf(key), 1);
      }

      return true;
    }

    return false;
  }

  function matchGestureSet() {
    let matchItem = null;
    let quickShot = false;

    let currentGesture = mChain.length && buildGesture();

    if (currentGesture) {
      kGestureSet.some((item) => {
        if (item.disabled) {
          return false;
        }

        return item.gestures.some((gesture) => {
          let isQuickShot = gesture.includes(kGestureSign.quickShot);

          if (isQuickShot) {
            gesture = gesture.replace(kGestureSign.quickShot, '');
          }

          if (currentGesture === gesture) {
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

  function evaluate(aEvent) {
    if (!mQuickShot && mChain.length) {
      doAction(aEvent);
    }
  }

  function doAction(aEvent) {
    if (mMatchItem) {
      try {
        mMatchItem.command({
          event: aEvent,
          gesture: buildGesture(),
          dragData: mDragData
        });
      }
      catch (ex) {
        mError = 'Command error';

        // Log to console.
        log([delayedShowStatusText(), ex]);
      }
    }
  }

  function buildGesture() {
    let gesture = mKey.join('') + mDragType + mChain.join('');

    if (mQuickShot) {
      gesture = kGestureSign.quickShot + gesture;
    }

    return gesture;
  }

  /**
   * Delayed show the status text.
   *
   * @note This is a workaround for a command error in |doAction|.
   * We have to show the error status even after the gesture state is cleared
   * since the status display will be cleared just after |doAction| is called
   * at the end of a gesture.
   * @see |MouseGesture.stopGesture()|
   */
  function delayedShowStatusText() {
    let text = makeStatusText();

    setTimeout((aText) => updateStatusText(aText), 0, text);

    return text;
  }

  function showStatusText() {
    let text = makeStatusText();

    updateStatusText(text);

    return text;
  }

  function clearStatusText() {
    updateStatusText('');
  }

  function makeStatusText() {
    const kFormat = ['Gesture: %gesture%', ' (%name%)', ' [%error%!]'];

    let text = kFormat[0].replace('%gesture%', buildGesture());

    if (mMatchItem) {
      text += kFormat[1].replace('%name%', mMatchItem.name);
    }

    if (mError) {
      text += kFormat[2].replace('%error%', mError);
    }

    return text;
  }

  return {
    clear,
    init,
    update,
    evaluate
  };
}

/**
 * Gesture position tracer.
 *
 * Traces the coordinates of a mouse cursor.
 *
 * @return {hash}
 *   @key clear {function}
 *   @key init {function}
 *   @key update {function}
 */
function GestureTracer() {
  /**
   * The minimum distance of movement for the gesture is detected.
   *
   * @value {integer} [pixels > 0]
   */
  const kTolerance = 10;

  let mLastX, mLastY;

  // Initialize the state.
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
    let [x, y] = [aEvent.screenX, aEvent.screenY];
    let [dx, dy] = [Math.abs(x - mLastX), Math.abs(y - mLastY)];

    let toward = {x: 0, y: 0};

    if (kTolerance < dx || kTolerance < dy) {
      if (dy < dx) {
        toward.x = (x < mLastX) ? -1 : 1;
      }
      else {
        toward.y = (y < mLastY) ? -1 : 1;
      }

      mLastX = x;
      mLastY = y;
    }

    return toward;
  }

  return {
    clear,
    init,
    update
  };
}

/**
 * Helper functions.
 */
function doCommand(aCommand) {
  let command = $ID(aCommand);

  if (command) {
    command.doCommand();
  }
  else {
    // @see chrome://global/content/globalOverlay.js::goDoCommand
    window.goDoCommand(aCommand);
  }
}

function inPrintPreviewMode() {
  // @see chrome://browser/content/browser.js::gInPrintPreviewMode
  return window.gInPrintPreviewMode;
}

function inGestureArea(event) {
  /**
   * The margin width of cancelling a gesture.
   *
   * @value {integer} [pixels > 0]
   * @note Including the width of a scrollbar in the content area.
   * @note 16 pixels is the scrollbar width of my Fx.
   */
  const kMarginWidth = 16;

  let {x, y} = BrowserUtils.getCursorPointInContent(event);
  let {width, height} = gBrowser.mPanelContainer.boxObject;

  return kMarginWidth < x && x < (width - kMarginWidth) &&
         kMarginWidth < y && y < (height - kMarginWidth);
}

/**
 * Content process tasks.
 */
function inEditableNode(event) {
  let {x, y} = BrowserUtils.getCursorPointInContent(event);

  return ContentTask.spawn({
    params: {x, y},
    task: function*(params) {
      '${ContentTask.ContentScripts.DOMUtils}';

      let {x, y} = params;

      let node = DOMUtils.getElementFromPoint(x, y);

      return (
        node instanceof Ci.nsIDOMNSEditableElement ||
        node.isContentEditable ||
        node.ownerDocument.designMode === 'on'
      );
    }
  });
}

function promiseLinkURLAtPoint(x, y) {
  return ContentTask.spawn({
    params: {x, y},
    task: function*(params) {
      '${ContentTask.ContentScripts.DOMUtils}';

      let {x, y} = params;

      let node = DOMUtils.getElementFromPoint(x, y);

      while (node) {
        let href = DOMUtils.getLinkHref(node);

        if (href) {
          return href;
        }

        node = node.parentNode;
      }

      return null;
    }
  });
}

function promiseImageURLAtPoint(x, y) {
  return ContentTask.spawn({
    params: {x, y},
    task: function*(params) {
      '${ContentTask.ContentScripts.DOMUtils}';

      let {x, y} = params;

      let node = DOMUtils.getElementFromPoint(x, y);

      return DOMUtils.getImageSrc(node);
    }
  });
}

/**
 * Entry point.
 */
function MouseGesture_init() {
  MouseGesture();
}

MouseGesture_init();


})(this);
