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
 * - A gesture is only available within the inner frame of the content area,
 *   and the default width of the frame is 16px.
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
  Listeners: {
    $event,
    $shutdown
  },
  DOMUtils: {
    $ID
  },
  getSelectionAtCursor,
  resolveURL,
  openTab,
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
 *   The combination of values of |kGestureSign|.
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
      window.ucjsUtil.loadPage(window.ucjsNaviLink.getPrev());
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
      window.ucjsUtil.loadPage(window.ucjsNaviLink.getNext());
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
      window.ucjsUtil.removeTab(gBrowser.selectedTab, {
        safetyLock: true
      });
    }
  },
  {
    gestures: ['S&DR'],
    name: '強制的にタブを閉じる',
    command() {
      window.ucjsUtil.removeTab(gBrowser.selectedTab);
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
      window.ucjsUtil.removeAllTabsBut(gBrowser.selectedTab);
    }
  },
  {
    gestures: ['S&DURD', 'DURDW+', 'DURDW-'], // shape of 'h'
    name: 'ホームだけにする',
    command() {
      window.ucjsUtil.openHomePages({
        doReplace: true
      });
    }
  },
  {
    gestures: ['DURD'], // Shape of 'h'.
    name: 'ホームを開く',
    command() {
      window.ucjsUtil.openHomePages();
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
      openTab(dragData, {
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
      openTab(dragData, {
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
 */
function MouseGesture() {
  const kState = {
    READY: 0,
    GESTURE: 1,
    DRAG: 2
  };

  let mState = kState.READY;
  let mMouseEvent = MouseEventManager();
  let mGesture = GestureManager();

  /**
   * Register the events to observe that a gesture starts, and it stops.
   *
   * @note Use the capture mode to surely catch the event in the content
   * area.
   *
   * @note The events that are necessary only in progress of a gesture are
   * registered after a gesture starts. And they are unregistered after the
   * gesture stops.
   */
  registerTriggerEvents();

  function registerTriggerEvents() {
    let pc = gBrowser.mPanelContainer;

    $event(pc, 'mousedown', onMouseDown, true);
    $event(pc, 'mouseup', onMouseUp, true);

    $event(pc, 'dragstart', onDragStart, true);
    $event(pc, 'dragend', onDragEnd, true);

    // WORKAROUND: 'contextmenu' event fires after a gesture stops so we can't
    // add it only in gesturing.
    $event(pc, 'contextmenu', onContextMenu, true);

    // WORKAROUND: We assign <Alt+RightClick> to reset the state of a gesture
    // ANYTIME when problems occur.
    $event(pc, 'click', onClick, true);

    // Make sure to clean up when the browser window closes.
    $shutdown(removeEvents);
  }

  function addEvents() {
    let pc = gBrowser.mPanelContainer;

    if (mState === kState.GESTURE) {
      pc.addEventListener('mousemove', onMouseMove, true);
      pc.addEventListener('wheel', onMouseWheel, true);

      pc.addEventListener('keydown', onKeyDown, true);
      pc.addEventListener('keyup', onKeyUp, true);

      // WORKAROUND: Observe a XUL popup in the content area for cancelling the
      // gesture when the right button is released on it.
      window.addEventListener('mouseup', onGlobalMouseUp);
    }
    else if (mState === kState.DRAG) {
      // @note Use 'dragover' (not 'dragenter') to check the coordinate of a
      // cursor.
      pc.addEventListener('dragover', onDragOver, true);
      pc.addEventListener('drop', onDrop, true);

      pc.addEventListener('keydown', onKeyDown, true);
      pc.addEventListener('keyup', onKeyUp, true);
    }
  }

  function removeEvents() {
    let pc = gBrowser.mPanelContainer;

    if (mState === kState.GESTURE) {
      pc.removeEventListener('mousemove', onMouseMove, true);
      pc.removeEventListener('wheel', onMouseWheel, true);
      pc.removeEventListener('keydown', onKeyDown, true);
      pc.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    }
    else if (mState === kState.DRAG) {
      pc.removeEventListener('dragover', onDragOver, true);
      pc.removeEventListener('drop', onDrop, true);
      pc.removeEventListener('keydown', onKeyDown, true);
      pc.removeEventListener('keyup', onKeyUp, true);
    }
  }

  /**
   * Event listeners.
   */
  function onMouseDown(aEvent) {
    let canStart = mMouseEvent.update(aEvent);

    if (canStart) {
      if (mState === kState.READY) {
        if (!inPrintPreviewMode() && inGestureArea(aEvent)) {
          startGesture(aEvent);
        }
      }
      else {
        cancelGesture();
      }
    }
    else {
      if (mState !== kState.READY) {
        cancelGesture();
      }
    }
  }

  function onMouseMove(aEvent) {
    if (mState === kState.GESTURE) {
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
      if (mState === kState.GESTURE) {
        stopGesture(aEvent);
      }
    }
  }

  // WORKAROUND: Cancel the gesture on a XUL popup.
  function onGlobalMouseUp(aEvent) {
    if (mState === kState.GESTURE &&
        isPopupNode(aEvent.target)) {
      cancelGesture();
    }
  }

  function isPopupNode(aNode) {
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
    if (mState === kState.GESTURE) {
      mMouseEvent.update(aEvent);

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
    mMouseEvent.update(aEvent);
  }

  function onClick(aEvent) {
    mMouseEvent.update(aEvent);
  }

  function onDragStart(aEvent) {
    if (mState === kState.READY) {
      if (inGestureArea(aEvent)) {
        startDrag(aEvent);
      }
    }
  }

  function onDragEnd(aEvent) {
    mMouseEvent.update(aEvent);

    // The drag operation is terminated:
    // - Cancelled by pressing the <Esc> key.
    // - Dropped in a disallowed area.
    if (mState === kState.DRAG) {
      cancelGesture();
    }
  }

  function onDragOver(aEvent) {
    if (mState !== kState.DRAG) {
      return;
    }

    // Cancel our gesture drag but the default drag works.
    // @note Both drag operations are cancelled by pressing the <Esc> key.
    let forceCancel = aEvent.shiftKey && aEvent.altKey;

    if (forceCancel) {
      cancelGesture();

      return;
    }

    if (inGestureArea(aEvent)) {
      if (!inEditable(aEvent)) {
        suppressDefault(aEvent);
        progress(aEvent);
      }
    }
    else {
      cancelGesture();
    }
  }

  // TODO: Prevent the drop event when the right or wheel button is pressed
  // down while dragging. The drop event fires for now.
  // @see https://bugzilla.mozilla.org/show_bug.cgi?id=395761
  function onDrop(aEvent) {
    if (mState !== kState.DRAG) {
      return;
    }

    if (inEditable(aEvent)) {
      cancelGesture();
    }
    else {
      suppressDefault(aEvent);
      stopGesture(aEvent);
    }
  }

  function suppressDefault(aEvent) {
    aEvent.preventDefault();
    aEvent.stopPropagation();
  }

  /**
   * Helper functions.
   */
  function startGesture(aEvent) {
    if (start(aEvent)) {
      mState = kState.GESTURE;

      addEvents();
    }
  }

  function startDrag(aEvent) {
    if (start(aEvent)) {
      mState = kState.DRAG;

      addEvents();
    }
  }

  function start(aEvent) {
    return mGesture.init(aEvent);
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

    mState = kState.READY;

    mGesture.clear();
  }
}

/**
 * Mouse event manager.
 *
 * - Determines whether a gesture can start or stop.
 * - Manages enabling and disabling the context menu and the default click
 * action of the left/middle button.
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

  // Whether the context menu is disabled or not.
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

          // Allow a gesture starts.
          return !mOtherDown;
        }
        else {
          mOtherDown = true;

          // Disable the context menu while the left/middle button is down.
          // RightDown -> OtherDown -> RightUp
          if (mSuppressMenu !== mRightDown) {
            mSuppressMenu = mRightDown;
          }

          // Disable the default click action of the left/middle button while
          // the right button is down.
          // RightDown -> OtherClick
          if (mSuppressClick !== mRightDown) {
            mSuppressClick = mRightDown;
          }
        }

        break;
      }

      case 'mouseup': {
        if (button === 2) {
          mRightDown = false;

          // Allow a gesture stops.
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
        // @see chrome://browser/content/browser.js::contentAreaClick()
        // @note The right button has no default click action.
        if (button === 2) {
          // Force to reset the state of a gesture.
          if (aEvent.altKey) {
            clear();
          }
        }
        else {
          if (mSuppressClick) {
            mSuppressClick = false;

            aEvent.preventDefault();
            aEvent.stopPropagation();
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
    setOverLink(false);

    mTracer.init(aEvent);

    if (aEvent.type === 'dragstart') {
      let info = getDragInfo(aEvent);

      if (!info.type || !info.data) {
        return false;
      }

      mDragType = info.type;
      mDragData = info.data;
    }

    return true;
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
   * @note Retrieves only one from a composite data:
   * - A selected text in a link string.
   * - A link href URL of a linked image.
   */
  function getDragInfo(aEvent) {
    let node = aEvent.target;
    let type = '', data = '';

    // 1.A selected text.
    if (!type) {
      let text = getSelectionAtCursor({event: aEvent});

      if (text) {
        type = kGestureSign.text;
        data = text;
      }
    }

    // 2.A link URL.
    if (!type) {
      let link = getLinkURL(node);

      if (link) {
        type = kGestureSign.link;
        data = link;
      }
    }

    // 3.An image URL.
    if (!type) {
      let image = getImageURL(node);

      if (image) {
        type = kGestureSign.image;
        data = image;
      }
    }

    return {
      type,
      data
    };
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

    let has = (aKey) => mKey.indexOf(aKey) > -1;

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
          let isQuickShot = gesture.indexOf(kGestureSign.quickShot) > -1;

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
   * Show the error status even after the gesture state is cleared. Since the
   * status display is also cleared just after |doAction| is called at the end
   * of a gesture.
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
    const kFormat = ['Gesture: %GESTURE%', ' (%NAME%)', ' [%ERROR%!]'];

    let text = kFormat[0].replace('%GESTURE%', buildGesture());

    if (mMatchItem) {
      text += kFormat[1].replace('%NAME%', mMatchItem.name);
    }

    if (mError) {
      text += kFormat[2].replace('%ERROR%', mError);
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
function inPrintPreviewMode() {
  // @see chrome://browser/content/browser.js::gInPrintPreviewMode
  return window.gInPrintPreviewMode;
}

function inGestureArea(aEvent) {
  /**
   * The margin of cancelling a gesture.
   *
   * @value {integer} [pixels > 0]
   * @note Including the width of a scrollbar.
   * @note 16 pixels is the scrollbar width of my Fx.
   */
  const kMargin = 16;

  // Get the coordinates of the event relative to the content area.
  // @note |aEvent.clientX/Y| are not reliable here. Because they return the
  // coordinate within the window or frame, so that we can not retrieve the
  // client coordinates over frames.
  let {screenX: x, screenY: y} = aEvent;
  let {screenX: left, screenY: top, width, height} =
    gBrowser.selectedBrowser.boxObject;

  // Convert the screen coordinates of a cursor to the client ones.
  x -= left;
  y -= top;

  return kMargin < x && x < (width - kMargin) &&
         kMargin < y && y < (height - kMargin);
}

function inEditable(aEvent) {
  let node = aEvent.target;

  return (
    node instanceof HTMLTextAreaElement ||
    node instanceof HTMLInputElement ||
    node.isContentEditable ||
    node.ownerDocument.designMode === 'on'
  );
}

function getLinkURL(aNode) {
  const XLinkNS = 'http://www.w3.org/1999/xlink';

  // @note The initial node may be a text node.
  let node = aNode;

  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node instanceof HTMLAnchorElement ||
          node instanceof HTMLAreaElement ||
          node instanceof HTMLLinkElement ||
          node.getAttributeNS(XLinkNS, 'type') === 'simple' ||
          node instanceof SVGAElement) {
        if (node.href) {
          break;
        }
      }
    }

    node = node.parentNode
  }

  if (node) {
    if (node instanceof SVGAElement) {
      return resolveURL(node.href.baseVal, node.baseURI);
    }

    return node.href;
  }

  return null;
}

function getImageURL(aNode) {
  if (aNode instanceof SVGImageElement && aNode.href) {
    return resolveURL(aNode.href.baseVal, aNode.baseURI);
  }

  if (aNode instanceof HTMLImageElement && aNode.src) {
    return aNode.src;
  }

  return null;
}

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

/**
 * Entry point.
 */
function MouseGesture_init() {
  MouseGesture();
}

MouseGesture_init();


})(this);
