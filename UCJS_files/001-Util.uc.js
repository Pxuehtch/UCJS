// ==UserScript==
// @name Util.uc.js
// @description Common utilities
// @include main
// @include chrome://browser/content/devtools/webconsole.xul
// ==/UserScript==

// @include chrome://browser/content/pageinfo/pageInfo.xul
// @include chrome://browser/content/bookmarks/bookmarksPanel.xul
// @include chrome://browser/content/history/history-panel.xul
// @include chrome://global/content/console.xul

// @usage access to functions through the global scope;
// |window.ucjsUtil.XXX|

// @note note the global property only in the main window (e.g. |gBrowser|)
// when including in the other window


const ucjsUtil = (function(window, undefined) {


"use strict";


/**
 * XPCOM handler
 *
 * @note this handler should be defined at the top of this file |Util.uc.js|,
 * because the access to XPCOM modules with the global property is ensured
 * here. this access is often used by the following functions
 * @see |ensureAccessToModules()|
 */
const XPCOM = (function() {
  /**
   * ID List of extra services
   */
  const kServices = {
    'StyleSheetService': {
      CID: '@mozilla.org/content/style-sheet-service;1',
      IID: 'nsIStyleSheetService'
    },
    'TextToSubURI': {
      CID: '@mozilla.org/intl/texttosuburi;1',
      IID: 'nsITextToSubURI'
    }//,
  };

  /**
   * ID List of extra instances
   */
  const kInstances = {
    'DocumentEncoder': {
      CID: '@mozilla.org/layout/documentEncoder;1',
      IID: 'nsIDocumentEncoder'
    },
    'Timer': {
      CID: '@mozilla.org/timer;1',
      IID: 'nsITimer'
    },
    'SupportsString': {
      CID: '@mozilla.org/supports-string;1',
      IID: 'nsISupportsString'
    }//,
  };

  /**
   * References to extra services
   *
   * @note initialized in |getService()|
   */
  let mServices = {};

  XPCOM_init();

  function XPCOM_init() {
    ensureAccessToModules()
  }

  /**
   * Ensures access to the XPCOM module with the global property
   *
   * @note applied to any window that includes this file |Util.uc.js|
   */
  function ensureAccessToModules() {
    // access to the modules of |window.Components|
    [
      ['Cc', 'classes'],
      ['Ci', 'interfaces'],
      ['Cu', 'utils']
    ].forEach(([alias, key]) => {
      if (!window[alias]) {
        window[alias] = window.Components[key];
      }
    });

    // access to |window.Services|
    Cu.import('resource://gre/modules/Services.jsm');
  }

  function getService(aName, aCIDParams) {
    if (Services.hasOwnProperty(aName)) {
      return Services[aName];
    }

    if (!kServices.hasOwnProperty(aName)) {
      throw Error('service is not defined: ' + aName);
    }

    if (!mServices[aName]) {
      mServices[aName] = create(kServices[aName], aCIDParams, 'getService');
    }

    return mServices[aName];
  }

  function getInstance(aName, aCIDParams) {
    if (!kInstances.hasOwnProperty(aName)) {
      throw Error('instance is not defined: ' + aName);
    }

    return create(kInstances[aName], aCIDParams, 'createInstance');
  }

  function getConstructor(aName, aCIDParams) {
    if (!kInstances.hasOwnProperty(aName)) {
      throw Error('instance is not defined: ' + aName);
    }

    let {CID, IID} = kInstances[aName];

    CID = fixupCID(CID, aCIDParams);

    if (Array.isArray(IID)) {
      throw Error('multiple IID is not allowed');
    }

    return window.Components.Constructor(Cc[CID], Ci[IID]);
  }

  function create(aItem, aCIDParams, aMethod) {
    let {CID, IID} = aItem;

    CID = fixupCID(CID, aCIDParams);

    if (!Array.isArray(IID)) {
      IID = [IID];
    }

    try {
      let result = Cc[CID][aMethod]();

      IID.forEach((id) => {
        result.QueryInterface(Ci[id]);
      });

      return result;
    }
    catch (ex) {}

    return null;
  }

  function fixupCID(aCID, aCIDParams) {
    if (aCIDParams) {
      let params = [];

      for (let [name, value] in Iterator(aCIDParams)) {
        params.push(name + '=' + value);
      }

      aCID += '?' + params.join('&');
    }
    return aCID;
  }

  function getModule(aResourceURL) {
    let scope = {};

    Cu.import(aResourceURL, scope);

    return scope;
  }

  return {
    $S: getService,
    $I: getInstance,
    $C: getConstructor,
    getModule: getModule
  };
})();

/**
 * Timer handler
 *
 * @see https://github.com/mozilla/addon-sdk/blob/master/lib/sdk/timers.js
 */
const Timer = (function() {
  const {TYPE_ONE_SHOT, TYPE_REPEATING_SLACK} = Ci.nsITimer;

  // instance constructor
  const createTimer = XPCOM.$C('Timer');

  let lastID = 0;
  let timers = {};
  let immediates = new Map();

  function setTimer(aType, aCallback, aDelay, ...aParams) {
    let id = ++lastID;
    let timer = timers[id] = createTimer();

    timer.initWithCallback({
      notify: function notify() {
        try {
          if (aType === TYPE_ONE_SHOT) {
            // delete the property that is not used anymore
            delete timers[id];
          }

          aCallback.apply(null, aParams);
        }
        catch (ex) {}
      }
    }, aDelay || 0, aType);

    return id;
  }

  function unsetTimer(aID) {
    let timer = timers[aID];

    // delete the property that is not used anymore
    delete timers[aID];

    if (timer) {
      timer.cancel();
    }
  }

  let dispatcher = () => {
    dispatcher.scheduled = false;

    let ids = [id for ([id] of immediates)];
    for (let id of ids) {
      let immediate = immediates.get(id);

      if (immediate) {
        immediates.delete(id);

        try {
          immediate();
        }
        catch (ex) {}
      }
    }
  };

  function setImmediate(aCallback, ...aParams) {
    let id = ++lastID;

    immediates.set(id, () => aCallback.apply(aCallback, aParams));

    if (!dispatcher.scheduled) {
      dispatcher.scheduled = true;

      let currentThread = XPCOM.$S('tm').currentThread;
      currentThread.dispatch(dispatcher, currentThread.DISPATCH_NORMAL);
    }
    return id;
  }

  function clearImmediate(aID) {
    immediates.delete(aID);
  }

  // all timers are cleared out on unload
  addEvent(window, 'unload', () => {
    immediates.clear();
    Object.keys(timers).forEach(unsetTimer);
  }, false);

  return {
    setTimeout: setTimer.bind(null, TYPE_ONE_SHOT),
    clearTimeout: unsetTimer,

    setInterval: setTimer.bind(null, TYPE_REPEATING_SLACK),
    clearInterval: unsetTimer,

    setImmediate: setImmediate,
    clearImmediate: clearImmediate
  };
})();

/**
 * Preferences handler
 *
 * @see https://github.com/mozilla/addon-sdk/blob/master/lib/sdk/preferences/service.js
 */
const Prefs = (function() {
  let getPrefs = () => XPCOM.$S('prefs');

  function get(aKey, aDefaultValue) {
    const prefs = getPrefs();

    try {
      switch (prefs.getPrefType(aKey)) {
        case prefs.PREF_BOOL:
          return prefs.getBoolPref(aKey);
        case prefs.PREF_INT:
          return prefs.getIntPref(aKey);
        case prefs.PREF_STRING:
          return prefs.getComplexValue(aKey, Ci.nsISupportsString).data;
      }
    }
    catch (ex) {}

    return aDefaultValue || null;
  }

  function set(aKey, aValue) {
    const prefs = getPrefs();

    if (aValue === null ||
        aValue === undefined) {
      log('invalid value to set to:\n' + aKey);
      return;
    }

    if (get(aKey) === aValue) {
      return;
    }

    switch (typeof aValue) {
      case 'boolean':
        prefs.setBoolPref(aKey, aValue);
        break;
      case 'number':
        prefs.setIntPref(aKey, aValue);
        break;
      case 'string':
        {
          let string = XPCOM.$I('SupportsString');
          string.data = aValue;
          prefs.setComplexValue(aKey, Ci.nsISupportsString, string);
        }
        break;
    }
  }

  function clear(aKey) {
    const prefs = getPrefs();

    prefs.clearUserPref(aKey);
  }

  return {
    get: get,
    set: set,
    clear: clear
  };
})();

/**
 * Functions for DOM handling
 */
function addEvent(aTarget, aType, aListener, aCapture) {
  if (!aTarget || !aType || !aListener) {
    return;
  }

  aCapture = !!aCapture;

  aTarget.addEventListener(aType, aListener, aCapture);

  window.addEventListener('unload', function remover() {
    aTarget.removeEventListener(aType, aListener, aCapture);
    window.removeEventListener('unload', remover, false);
  }, false);
}

/**
 * Gets a selected text under the cursor
 *
 * @param aOption {hash}
 *   @key event {MouseEvent}
 *   @key charLen {integer}
 * @return {string}
 *
 * TODO: |event.rangeOffset| sometimes returns a wrong value (e.g. it returns
 * the same value as if at the first row when a cursor is on the lines below
 * the first row in a <textarea>)
 * WORKAROUND: rescan ranges with the client coordinates instead of the range
 * offset
 */
function getSelectionAtCursor(aOption) {
  const kMaxCharLen = 150;

  let {
    event,
    charLen
  } = aOption || {};

  let node, rangeParent, rangeOffset;

  if (event) {
    // event mode
    node = event.target;
    rangeParent = event.rangeParent;
    rangeOffset = event.rangeOffset; // TODO: may be wrong
  }
  else if (window.gContextMenu) {
    // contextmenu mode
    // @see chrome://browser/content/nsContextMenu.js
    node = window.document.popupNode;
    rangeParent = window.document.popupRangeParent;
    rangeOffset = window.document.popupRangeOffset;
  }

  let selection = getSelectionController(node);

  if (!selection) {
    return null;
  }

  let text = '';

  // scan ranges with the range offset
  for (let i = 0, l = selection.rangeCount, range; i < l; i++) {
    range = selection.getRangeAt(i);

    if (range.isPointInRange(rangeParent, rangeOffset)) {
      text = getSelectedTextInRange(range);
      break;
    }
  }
  // WORKAROUND: |event.rangeOffset| may be wrong when |text| is empty at the
  // event mode. so, rescan the ranges with the client coordinates
  if (event && !text) {
    let {clientX: x, clientY: y} = event;
    let rect;

    for (let i = 0, l = selection.rangeCount, range; i < l; i++) {
      range = selection.getRangeAt(i);
      rect = range.getBoundingClientRect();

      if (rect.left <= x && x <= rect.right &&
          rect.top <= y && y <= rect.bottom) {
        text = getSelectedTextInRange(range);
        break;
      }
    }
  }

  // only use the first important chars
  text = trimText(text, Math.min(charLen || kMaxCharLen, kMaxCharLen));

  return text;
}

function getSelectionController(aNode) {
  if (!aNode) {
    return null;
  }

  // 1. scan selection in a textbox (exclude password)
  if ((aNode instanceof HTMLInputElement && aNode.mozIsTextField(true)) ||
      aNode instanceof HTMLTextAreaElement) {
    try {
      return aNode.QueryInterface(Ci.nsIDOMNSEditableElement).
        editor.selection;
    }
    catch (ex) {}

    return null;
  }

  // 2. get a window selection
  let win = aNode.ownerDocument.defaultView || getFocusedWindow();

  return win.getSelection();
}

function getSelectedTextInRange(aRange) {
  if (!aRange.toString()) {
    return '';
  }

  let type = 'text/plain';
  let encoder = XPCOM.$I('DocumentEncoder', {type: type});

  encoder.init(
    aRange.startContainer.ownerDocument,
    type,
    encoder.OutputLFLineBreak |
    encoder.SkipInvisibleContent
  );

  encoder.setRange(aRange);

  return encoder.encodeToString();
}

// @see chrome://browser/content/browser.js::getBrowserSelection()
function trimText(aText, aMaxLength) {
  if (!aText) {
    return '';
  }

  if (aText.length > aMaxLength) {
    let match = RegExp('^(?:\\s*.){0,' + aMaxLength + '}').exec(aText);

    if (!match) {
      return '';
    }

    aText = match[0];
  }

  aText = aText.trim().replace(/\s+/g, ' ');

  if (aText.length > aMaxLength) {
    aText = aText.substr(0, aMaxLength);
  }

  return aText;
}

/**
 * Creates an element with the attributes
 *
 * @param aTagOrNode {string|Element}
 *   {string}: set a <tagname>
 *   {Element}: set an <element> for setting the attributes
 * @param aAttribute {hash} [optional]
 *   set list of <attribute name>: <attribute value>
 *   @note an attribute will be ignored if the value is |null| or |undefined|
 * @param aAttributeHandler {function} [optional]
 *   a function for a custom handling of attributes
 * @return {Element}
 *
 * @note use only for XUL element
 *
 * TODO: handle the namespace of a tag/attribute
 */
function createNode(aTagOrNode, aAttribute, aAttributeHandler) {
  let node =
    (typeof aTagOrNode === 'string') ?
    window.document.createElement(aTagOrNode) :
    aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (aAttributeHandler &&
          aAttributeHandler(node, name, value)) {
        continue;
      }

      if (!node.hasAttribute(name) ||
          node.getAttribute(name) !== value + '') {
        node.setAttribute(name, value);
      }
    }
  }

  return node;
}

/**
 * Wrapper of |getElementById|
 *
 * @note use only for XUL element
 */
function getNodeById(aId) {
  return window.document.getElementById(aId);
}

/**
 * Wrapper of |getAnonymousElementByAttribute|
 *
 * @note use only for XUL element
 */
function getNodeByAnonid(aId, aContext) {
  return window.document.
    getAnonymousElementByAttribute(aContext, 'anonid', aId);
}

/**
 * Gets the focused window
 *
 * @return {Window}
 *   if in the main browser window, returns a content window (top or frame)
 */
function getFocusedWindow() {
  let focusedWindow = window.document.commandDispatcher.focusedWindow;

  if (window.document.documentElement.
      getAttribute('windowtype') === 'navigator:browser') {
    if (!focusedWindow || focusedWindow === window) {
      focusedWindow = window.content;
    }
  }
  return focusedWindow || window;
}

function getFocusedDocument() {
  let win = getFocusedWindow();

  return win.contentDocument || win.document;
}

function getFirstNodeBySelector(aSelector, aContext) {
  let node = aContext || getFocusedDocument();

  return node.querySelector(aSelector);
}

function getNodesBySelector(aSelector, aContext) {
  let node = aContext || getFocusedDocument();

  // @return {static NodeList}
  return node.querySelectorAll(aSelector);
}

function getFirstNodeByXPath(aXPath, aContext) {
  let type = XPathResult.FIRST_ORDERED_NODE_TYPE;

  let result = evaluateXPath(aXPath, aContext, type);

  return result ? result.singleNodeValue : null;
}

function getNodesByXPath(aXPath, aContext, aOption) {
  let {
    ordered,
    toArray
  } = aOption || {};

  let type = ordered ?
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE :
    XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE;

  let result = evaluateXPath(aXPath, aContext, type);

  if (!toArray) {
    return result;
  }

  let nodes = Array(result ? result.snapshotLength : 0);

  for (let i = 0, l = nodes.length; i < l; i++) {
    nodes[i] = result.snapshotItem(i);
  }

  return nodes;
}

function evaluateXPath(aXPath, aContext, aType) {
  let doc, base;

  if (aContext instanceof Document) {
    doc  = aContext;
    base = doc.documentElement;
  }
  else {
    doc  = aContext ? aContext.ownerDocument : getFocusedDocument();
    base = aContext || doc.documentElement;
  }

  let resolver;

  let defaultNS = null;
  try {
    defaultNS = base.lookupNamespaceURI(null);
  }
  catch (ex) {}

  if (defaultNS) {
    let tmpPrefix = '__NS__';

    aXPath = fixNamespacePrefixForXPath(aXPath, tmpPrefix);

    resolver = (prefix) =>
      (prefix === tmpPrefix) ?
      defaultNS :
      lookupNamespaceURI(prefix);
  }
  else {
    resolver = (prefix) => lookupNamespaceURI(prefix);
  }

  try {
    return doc.evaluate(aXPath, base, resolver, aType, null);
  }
  catch (ex) {}

  return null;
}

function lookupNamespaceURI(aPrefix) {
  const kNS = {
    xul:   'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
    html:  'http://www.w3.org/1999/xhtml',
    xhtml: 'http://www.w3.org/1999/xhtml',
    xlink: 'http://www.w3.org/1999/xlink'
  };

  return kNS[aPrefix] || null;
}

/**
 * @see http://nanto.asablo.jp/blog/2008/12/11/4003371
 */
function fixNamespacePrefixForXPath(aXPath, aPrefix) {
  const kTokenPattern = /([A-Za-z_\u00c0-\ufffd][\w\-.\u00b7-\ufffd]*|\*)\s*(::?|\()?|(".*?"|'.*?'|\d+(?:\.\d*)?|\.(?:\.|\d+)?|[\)\]])|(\/\/?|!=|[<>]=?|[\(\[|,=+-])|([@$])/g;

  const TERM = 1, OPERATOR = 2, MODIFIER = 3;
  let tokenType = OPERATOR;

  aPrefix += ':';

  function replacer(token, identifier, suffix, term, operator, modifier) {
    if (suffix) {
      tokenType =
        (suffix === ':' || (suffix === '::' &&
         (identifier === 'attribute' || identifier === 'namespace'))) ?
        MODIFIER : OPERATOR;
    }
    else if (identifier) {
      if (tokenType === OPERATOR && identifier !== '*') {
        token = aPrefix + token;
      }
      tokenType = (tokenType === TERM) ? OPERATOR : TERM;
    }
    else {
      tokenType = term ? TERM : (operator ? OPERATOR : MODIFIER);
    }

    return token;
  }

  return aXPath.replace(kTokenPattern, replacer);
}

/**
 * Functions for Tab / Window
 */
function checkSecurity(aURL, aOption) {
  let {
    trustURL,
    allowImageData
  } = aOption || {};

  if (!trustURL && allowImageData) {
    trustURL = /^data:image\/(?:gif|jpg|png);base64,/.test(aURL);
  }

  let flag = trustURL ?
    Ci.nsIScriptSecurityManager.STANDARD :
    Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL;

  // @see chrome://global/content/contentAreaUtils.js::urlSecurityCheck()
  window.urlSecurityCheck(aURL, gBrowser.contentPrincipal, flag);
}

function unescapeURLCharacters(aURL) {
  const kURLChars = {
    "21":"!", "23":"#", "24":"$", "25":"%", "26":"&",
    "27":"'", "28":"(", "29":")", "2a":"*", "2b":"+",
    "2c":",", "2d":"-", "2e":".", "2f":"/", "3a":":",
    "3b":";", "3d":"=", "3f":"?", "40":"@", "5f":"_",
    "7e":"~"
  };

  if (!aURL) {
    return '';
  }

  for (let key in kURLChars) {
    aURL = aURL.replace(RegExp('%(?:25)?' + key, 'ig'), kURLChars[key]);
  }

  return aURL;
}

function unescapeURLForUI(aURL, aCharset) {
  if (!aURL) {
    return '';
  }

  let charset = aCharset || getFocusedDocument().characterSet;

  return XPCOM.$S('TextToSubURI').unEscapeURIForUI(charset, aURL);
}

function resolveURL(aURL, aBaseURL) {
  if (!aURL || !/\S/.test(aURL)) {
    return '';
  }

  if (/^[a-zA-Z]+:/.test(aURL)) {
    return aURL;
  }

  let baseURL = aBaseURL || getFocusedDocument().documentURI;

  // @see chrome://browser/content/utilityOverlay.js::makeURLAbsolute()
  return window.makeURLAbsolute(baseURL, aURL);
}

function openNewWindow(aURL, aOption) {
  let URL = resolveURL(aURL);

  if (!URL) {
    return;
  }

  let {
    inBackground
  } = aOption || {};

  checkSecurity(URL);

  // @see chrome://browser/content/utilityOverlay.js::openNewWindowWith()
  let newWin = window.
    openNewWindowWith(URL, getFocusedDocument(), null, false);

  if (inBackground) {
    setTimeout(window.focus, 0);
  }

  return newWin;
}

function openHomePages(aOption) {
  let {
    doReplace,
    onlyFirstPage
  } = aOption || {};

  // @see chrome://browser/content/browser.js::gHomeButton
  let homePages = window.gHomeButton.getHomePage().split('|');

  if (onlyFirstPage) {
    homePages = homePages[0];
  }

  openTabs(homePages, {
    doReplace: doReplace,
    skipSecurityCheck: true
  });
}

function openTabs(aURLs, aOption) {
  if (typeof aURLs === 'string') {
    aURLs = aURLs.split('|');
  }

  if (!Array.isArray(aURLs) || aURLs.length === 0) {
    return;
  }

  let {
    inBackground,
    doReplace
  } = aOption || {};

  // delete the option that is useless for the following functions
  if (aOption) {
    delete aOption.doReplace;
  }

  let firstTabAdded;

  if (doReplace) {
    // @see chrome://browser/content/browser.js::BrowserOpenTab
    window.BrowserOpenTab();
    removeAllTabsBut(gBrowser.selectedTab);
    firstTabAdded = loadPage(aURLs.shift(), aOption);
  }
  else {
    if (!inBackground) {
      firstTabAdded = openTab(aURLs.shift(), aOption);
    }
  }

  aURLs.forEach((url) => {
    openTab(url, aOption);
  });

  if (firstTabAdded) {
    gBrowser.selectedTab = firstTabAdded;
  }
}

function openURL(aURL, aOption) {
  let {
    inTab
  } = aOption || {};

  // delete the option that is useless for the following functions
  if (aOption) {
    delete aOption.inTab;
  }

  if (inTab) {
    return openTab(aURL, aOption);
  }
  return loadPage(aURL, aOption);
}

function openTab(aURL, aOption) {
  let URL = resolveURL(aURL);

  if (!URL) {
    return;
  }

  let {
    inBackground,
    skipSecurityCheck,
    trustURL,
    allowImageData
  } = aOption || {};

  // delete the option that is useless for the following functions
  if (aOption) {
    delete aOption.skipSecurityCheck;
    delete aOption.trustURL;
    delete aOption.allowImageData;
  }

  if (!skipSecurityCheck) {
    checkSecurity(URL, {
      trustURL: trustURL,
      allowImageData: allowImageData
    });
  }

  // @note set explicit |false| to open in a foreground tab
  // if absent, it will default to the |browser.tabs.loadInBackground|
  // preference in |gBrowser.loadOneTab|
  aOption = aOption || {};
  aOption.inBackground = inBackground === true;

  return gBrowser.loadOneTab(URL, aOption);
}

function loadPage(aURL, aOption) {
  let URL = resolveURL(aURL);

  if (!URL) {
    return;
  }

  let {
    referrerURI,
    charset,
    postData,
    allowThirdPartyFixup,
    fromExternal,
    isUTF8,
    skipSecurityCheck,
    trustURL,
    allowImageData
  } = aOption || {};

  if (!skipSecurityCheck) {
    checkSecurity(URL, {
      trustURL: trustURL,
      allowImageData: allowImageData
    });
  }

  let flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE;

  if (allowThirdPartyFixup) {
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP;
  }

  if (fromExternal) {
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_FROM_EXTERNAL;
  }

  if (isUTF8) {
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_URI_IS_UTF8;
  }

  gBrowser.loadURIWithFlags(URL, flags, referrerURI, charset, postData);

  return gBrowser.selectedTab;
}

/**
 * Alternative |gBrowser.removeTab|
 *
 * @see chrome://browser/content/tabbrowser.xml::removeTab
 */
function removeTab(aTab, aOption) {
  let {
    safeBlock
  } = aOption || {};

  if (safeBlock) {
    // do not close;
    // 1.pinned tab
    // 2.only one unpinned tab
    if (aTab.pinned ||
        gBrowser.visibleTabs.length - gBrowser._numPinnedTabs <= 1) {
      return;
    }
  }

  gBrowser.removeTab(aTab);
}

/**
 * Alternative |gBrowser.removeAllTabsBut|
 *
 * 1.does not warn against closing multiple tabs
 * 2.does not close blocked tabs
 *
 * @see chrome://browser/content/tabbrowser.xml::removeAllTabsBut
 */
function removeAllTabsBut(aTab) {
  if (aTab.pinned) {
    return;
  }

  if (!aTab.hidden && aTab !== gBrowser.selectedTab) {
    gBrowser.selectedTab = aTab;
  }

  let tabs = gBrowser.visibleTabs;

  for (let i = tabs.length - 1, tab; i >= 0; i--) {
    tab = tabs[i];

    if (tab !== aTab && !tab.pinned) {
      removeTab(tab, {safeBlock: true});
    }
  }
}

/**
 * Miscellaneous functions
 */
function getWindowList(aType) {
  if (aType !== null) {
    aType = aType || 'navigator:browser';
  }

  return XPCOM.$S('wm').getEnumerator(aType);
}

function focusWindow(aWindow) {
  let wins = getWindowList(null), win;

  while (wins.hasMoreElements()) {
    win = wins.getNext();

    if (win === aWindow) {
      win.focus();
      return;
    }
  }
}

function focusWindowAtIndex(aIdx) {
  let wins = getWindowList(null), win;
  let idx = 0;

  while (wins.hasMoreElements()) {
    win = wins.getNext();

    if (idx++ === aIdx) {
      win.focus();
      return;
    }
  }
}

function setGlobalStyleSheet(aCSS, aType) {
  return registerGlobalStyleSheet(aCSS, aType);
}

function removeGlobalStyleSheet(aCSS, aType) {
  return registerGlobalStyleSheet(aCSS, aType, {remove: true});
}

function registerGlobalStyleSheet(aCSS, aType, aOption) {
  let {
    remove
  } = aOption || {};

  let css = normalizeCSS(aCSS);

  if (!css) {
    return;
  }

  let URI;
  try {
    URI = XPCOM.$S('io').
      newURI('data:text/css,' + encodeURIComponent(css), null, null);
  }
  catch (ex) {
    return;
  }

  const styleSheetService = XPCOM.$S('StyleSheetService');

  let type;

  switch (aType) {
    case 'AGENT_SHEET':
    case 'USER_SHEET':
    case 'AUTHOR_SHEET':
      type = styleSheetService[aType];
      break;
    default:
      return;
  }

  let registered = styleSheetService.sheetRegistered(URI, type);

  if (!remove && !registered) {
    styleSheetService.loadAndRegisterSheet(URI, type);
  }
  else if (remove && registered) {
    styleSheetService.unregisterSheet(URI, type);
  }
}

function registerChromeStyleSheet(aCSS) {
  let css = normalizeCSS(aCSS);

  if (!css) {
    return;
  }

  let dataURI = 'data:text/css,' + encodeURIComponent(css);

  if (Array.some(
    window.document.styleSheets,
    (styleSheet) => styleSheet.href === dataURI
  )) {
    return;
  }

  let newStyleSheet = window.document.createProcessingInstruction(
    'xml-stylesheet',
    'type="text/css" href="%dataURI%"'.replace('%dataURI%', dataURI)
  );

  return window.document.
    insertBefore(newStyleSheet, window.document.documentElement);
}

function registerContentStyleSheet(aCSS, aOption) {
  let {
    document,
    id
  } = aOption || {};

  let css = normalizeCSS(aCSS);

  if (!css) {
    return;
  }

  let doc = document || getFocusedDocument();

  if (!doc.head) {
    return;
  }

  if (id) {
    let old = doc.getElementById(id);

    if (old) {
      if (old.textContent === css) {
        return;
      }

      old.parentNode.removeChild(old);
    }
  }

  let style = doc.createElement('style');

  style.type = 'text/css';
  if (id) {
    style.id = id;
  }
  style.textContent = css;

  return doc.head.appendChild(style);
}

function normalizeCSS(aCSS) {
  // @note you should put a 'half-width space' for the separator of;
  // 1.the descendant selector (e.g. h1 em{...})
  // 2.the shorthand properties (e.g. margin:1px 2px;)

  return aCSS.trim().
    // put half-width spaces into one (maybe a necessary separator)
    replace(/ +/g, ' ').
    // remove consecutive white spaces
    replace(/\s{2,}/g, '').
    // remove comment
    replace(/\s*\/\*.*?\*\/\s*/g, '');
}

/**
 * Query the Places database
 *
 * @param aParam {hash}
 *   expression: {string} a SQL expression
 *   params: {hash} [optional] the binding parameters
 *   columns: {array} the column names
 * @return {hash[]|null}
 *   hash[]: array of {column name: value, ...}
 *   null: no result
 */
function scanPlacesDB(aParam) {
  const {
    expression,
    params,
    columns
  } = aParam || {};

  const {PlacesUtils} =
    XPCOM.getModule('resource://gre/modules/PlacesUtils.jsm');

  let statement =
    PlacesUtils.history.
    QueryInterface(Ci.nsPIPlacesDatabase).
    DBConnection.
    createStatement(expression);

  let rows = [];

  try {
    for (let key in statement.params) {
      if (!(key in params)) {
        throw Error('parameter is not defined: ' + key);
      }

      statement.params[key] = params[key];
    }

    while (statement.executeStep()) {
      let result = {};

      columns.forEach((name) => {
        result[name] = statement.row[name];
      });

      rows.push(result);
    }
  }
  finally {
    statement.finalize();
  }

  if (rows.length) {
    return rows;
  }
  return null;
}

/**
 * Query the Places database asynchronously
 *
 * @param aParam {hash}
 *   expression: {string} a SQL expression
 *   params: {hash} [optional] the binding parameters
 *   columns: {array} the column names
 *   onSuccess: {function} functions to be called when done successfully
 *     @param aRows {hash[]|null}
 *       hash[]: array of {column name: value, ...}
 *       null: no result
 *   onError: {function} [optional]
 *   onCancel: {function} [optional]
 * @return {mozIStoragePendingStatement}
 *   a object with a .cancel() method allowing to cancel the request
 *
 * TODO: use |createAsyncStatement|
 * I'm not sure why it doesn't work well
 *
 * TODO: handlings on error and cancel
 */
function asyncScanPlacesDB(aParam) {
  const {
    expression,
    params,
    columns,
    onSuccess,
    onError,
    onCancel
  } = aParam || {};

  const {PlacesUtils} =
    XPCOM.getModule('resource://gre/modules/PlacesUtils.jsm');

  let statement =
    PlacesUtils.history.
    QueryInterface(Ci.nsPIPlacesDatabase).
    DBConnection.
    createStatement(expression);

  try {
    for (let key in statement.params) {
      if (!(key in params)) {
        throw Error('parameter is not defined: ' + key);
      }

      statement.params[key] = params[key];
    }

    return statement.executeAsync({
      rows: [],

      handleResult: function(aResultSet) {
        let row;

        while ((row = aResultSet.getNextRow())) {
          let result = {};

          columns.forEach((name) => {
            result[name] = row.getResultByName(name);
          });

          this.rows.push(result);
        }
      },

      handleError: function(aError) {
      },

      handleCompletion: function(aReason) {
        switch (aReason) {
          case Ci.mozIStorageStatementCallback.REASON_FINISHED:
            onSuccess(this.rows.length ? this.rows : null);
            break;
          case Ci.mozIStorageStatementCallback.REASON_ERROR:
            break;
          case Ci.mozIStorageStatementCallback.REASON_CANCELED:
            break;
        }
      }
    });
  }
  finally {
    statement.finalize();
  }
}

/**
 * Log function
 */
function logMessage(aTarget, aMessage) {
  if (Array.isArray(aMessage)) {
    aMessage = aMessage.join('\n');
  }

  const kMessageFormat = '[%target%]\n%message%';
  let formatMessage = kMessageFormat.
    replace('%target%', aTarget).
    replace('%message%', aMessage);

  // output to the browser console
  // @note no outputs to the web console
  XPCOM.$S('console').logStringMessage(formatMessage);

  return formatMessage;
}

function log(aMessage) {
  return logMessage('Util.uc.js', aMessage);
}

/**
 * Export
 */
return {
  XPCOM: XPCOM,
  Timer: Timer,
  Prefs: Prefs,

  addEvent: addEvent,
  getSelectionAtCursor: getSelectionAtCursor,
  createNode: createNode,
  getNodeById: getNodeById,
  getNodeByAnonid: getNodeByAnonid,
  getFirstNodeBySelector: getFirstNodeBySelector,
  getNodesBySelector: getNodesBySelector,
  getFirstNodeByXPath: getFirstNodeByXPath,
  getNodesByXPath: getNodesByXPath,

  unescapeURLCharacters: unescapeURLCharacters,
  unescapeURLForUI: unescapeURLForUI,
  resolveURL: resolveURL,
  openWindow: openNewWindow,
  openHomePages: openHomePages,
  openTabs: openTabs,
  openURL: openURL,
  openTab: openTab,
  loadPage: loadPage,
  removeTab: removeTab,
  removeAllTabsBut: removeAllTabsBut,

  focusWindow: focusWindow,
  focusWindowAtIndex: focusWindowAtIndex,
  setGlobalStyleSheet: setGlobalStyleSheet,
  removeGlobalStyleSheet: removeGlobalStyleSheet,
  setChromeStyleSheet: registerChromeStyleSheet,
  setContentStyleSheet: registerContentStyleSheet,
  scanPlacesDB: scanPlacesDB,
  asyncScanPlacesDB: asyncScanPlacesDB,

  logMessage: logMessage
}


})(this);
