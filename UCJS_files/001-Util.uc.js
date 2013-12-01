// ==UserScript==
// @name Util.uc.js
// @description Common utilities.
// @include main
// @include chrome://global/content/console.xul
// ==/UserScript==

// @include chrome://browser/content/pageinfo/pageInfo.xul
// @include chrome://browser/content/bookmarks/bookmarksPanel.xul
// @include chrome://browser/content/history/history-panel.xul

// @usage Access to functions through the global scope,
// |window.ucjsUtil.XXX|

// @note Note the definitions only in the main window (e.g. gBrowser) when
// including in the other window.


var ucjsUtil = (function(window, undefined) {


"use strict";


/**
 * XPCOM handler
 */
const XPCOM = (function() {
  const kServices = {
    'BrowserGlue': {
      CID: '@mozilla.org/browser/browserglue;1',
      IID: 'nsIBrowserGlue'
    },
    'StyleSheetService': {
      CID: '@mozilla.org/content/style-sheet-service;1',
      IID: 'nsIStyleSheetService'
    },
    'TextToSubURI': {
      CID: '@mozilla.org/intl/texttosuburi;1',
      IID: 'nsITextToSubURI'
    }//,
  };

  const kInstances = {
    'DocumentEncoder': {
      CID: '@mozilla.org/layout/documentEncoder;1',
      IID: 'nsIDocumentEncoder'
    },
    'ScriptableUnicodeConverter': {
      // @note no version number needed
      CID: '@mozilla.org/intl/scriptableunicodeconverter',
      IID: 'nsIScriptableUnicodeConverter'
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

  function getService(aName, aCIDParams) {
    // @see resource://gre/modules/Services.jsm
    if (window.Services.hasOwnProperty(aName)) {
      return window.Services[aName];
    }

    if (!kServices.hasOwnProperty(aName)) {
      throw Error('service is not defined: ' + aName);
    }

    if (!(kServices[aName] instanceof window.Ci.nsISupports)) {
      let service = create(kServices[aName], aCIDParams, 'getService');
      delete kServices[aName];
      kServices[aName] = service
    }
    return kServices[aName];
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

    return window.Components.Constructor(window.Cc[CID], window.Ci[IID]);
  }

  function create(aItem, aCIDParams, aMethod) {
    let {CID, IID} = aItem;

    CID = fixupCID(CID, aCIDParams);

    if (!Array.isArray(IID)) {
      IID = [IID];
    }

    try {
      let res = window.Cc[CID][aMethod]();
      IID.forEach(function(id) {
        res.QueryInterface(window.Ci[id]);
      });
      return res;
    } catch (ex) {}
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

  return {
    $S: getService,
    $I: getInstance,
    $C: getConstructor
  };
})();

/**
 * Timer handler
 * @see https://github.com/mozilla/addon-sdk/blob/master/lib/sdk/timers.js
 */
const Timer = (function() {
  const {TYPE_ONE_SHOT, TYPE_REPEATING_SLACK} = window.Ci.nsITimer;

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
            delete timers[id];
          }
          aCallback.apply(null, aParams);
        } catch (ex) {}
      }
    }, aDelay || 0, aType);

    return id;
  }

  function unsetTimer(aID) {
    let timer = timers[aID];
    delete timers[aID];
    if (timer) {
      timer.cancel();
    }
  }

  let dispatcher = _ => {
    dispatcher.scheduled = false;

    let ids = [id for ([id] of immediates)];
    for (let id of ids) {
      let immediate = immediates.get(id);
      if (immediate) {
        immediates.delete(id);
        try {
          immediate();
        } catch (ex) {}
      }
    }
  }

  function setImmediate(aCallback, ...aParams) {
    let id = ++lastID;

    immediates.set(id, _ => aCallback.apply(aCallback, aParams));

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
  setEventListener([window, 'unload', function() {
    immediates.clear();
    Object.keys(timers).forEach(unsetTimer);
  }, false]);

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
 * @see https://github.com/mozilla/addon-sdk/blob/master/lib/sdk/preferences/service.js
 */
const Prefs = (function() {
  function getPrefs() {
    return XPCOM.$S('prefs');
  }

  function get(aKey, aDefaultValue) {
    const prefs = getPrefs();

    try {
      switch (prefs.getPrefType(aKey)) {
        case prefs.PREF_BOOL:
          return prefs.getBoolPref(aKey);
        case prefs.PREF_INT:
          return prefs.getIntPref(aKey);
        case prefs.PREF_STRING:
          return prefs.getComplexValue(aKey, window.Ci.nsISupportsString).data;
      }
    } catch (ex) {}
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
          prefs.setComplexValue(aKey, window.Ci.nsISupportsString, string);
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


//********** DOM functions

function setEventListener(aData) {
  var [target, type, listener, capture] = aData;
  if (!target || !type || !listener) {
    return;
  }

  capture = !!capture;

  target.addEventListener(type, listener, capture);
  window.addEventListener('unload', function removeEvent() {
    target.removeEventListener(type, listener, capture);
    window.removeEventListener('unload', removeEvent, false);
  }, false);
}

/**
 * Gets a selected text under the cursor
 * @param aOption {hash}
 *   @key event {MouseEvent}
 *   @key charLen {integer}
 * @return {string}
 *
 * TODO: |event.rangeOffset| sometimes returns wrong value.
 * e.g. When a cursor is below the first row in <textarea>, it returns the same
 * value that is as if at the first row.
 * WORKAROUND: rescan ranges with the client coordinates instead of the range
 * offset.
 */
function getSelectionAtCursor(aOption) {
  const kMaxCharLen = 150;
  var {event, charLen} = aOption || {};

  var node, rangeParent, rangeOffset;
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

  var selection = getSelectionController(node);
  if (!selection) {
    return null;
  }

  var text = '';

  // scan ranges with the range offset
  for (let i = 0, l = selection.rangeCount, range; i < l; i++) {
    range = selection.getRangeAt(i);
    if (range.isPointInRange(rangeParent, rangeOffset)) {
      text = getSelectedTextInRange(range);
      break;
    }
  }
  // WORKAROUND: |event.rangeOffset| may be wrong when |text| is empty at the
  // event mode. So rescan the ranges with the client coordinates.
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
      return aNode.QueryInterface(window.Ci.nsIDOMNSEditableElement).
        editor.selection;
    } catch (ex) {}
    return null;
  }
  // 2. get a window selection
  var win = aNode.ownerDocument.defaultView || getFocusedWindow();
  return win.getSelection();
}

function getSelectedTextInRange(aRange) {
  if (!aRange.toString()) {
    return '';
  }

  var type = 'text/plain';
  var encoder = XPCOM.$I('DocumentEncoder', {type: type});

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
 * @param aTagOrNode {string|Element}
 *   {string}: set a <tagname>
 *   {Element}: set a <element> only for setting the attributes
 * @param aAttribute {hash}
 *   set list of <attribute name>: <attribute value>
 *   an attribute will be ignored if the value is |null| or |undefined|
 * @return {Element}
 *
 * @note Only for XUL element.
 * TODO: Handle the namespace of a tag/attribute.
 */
function createNode(aTagOrNode, aAttribute) {
  let node = (typeof aTagOrNode === 'string') ?
    window.document.createElement(aTagOrNode) : aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value !== null &&
          value !== undefined) {
        if (!node.hasAttribute(name) ||
            value + '' !== node.getAttribute(name)) {
          node.setAttribute(name, value);
        }
      }
    }
  }

  return node;
}

// @note Only for XUL element.
function getNodeByAnonid(aId, aContext) {
  return window.document.
    getAnonymousElementByAttribute(aContext, 'anonid', aId);
}

/**
 * Gets the focused window
 * @return {Window}
 *   if in the main browser window, returns a content window (top or frame)
 */
function getFocusedWindow() {
  var focusedWindow = window.document.commandDispatcher.focusedWindow;

  if (window.document.documentElement.
      getAttribute('windowtype') === 'navigator:browser') {
    if (!focusedWindow || focusedWindow === window) {
      focusedWindow = window.content;
    }
  }
  return focusedWindow || window;
}

function getFocusedDocument() {
  var win = getFocusedWindow();

  return win.contentDocument || win.document;
}

function getNodesByAttribute(aAttribute, aContext) {
  var {name, value, tag} = aAttribute;
  if (!name) {
    throw Error('attribute name is required');
  }

  var xpath = 'descendant::' + (tag || '*') +
    (value ?
    '[contains(concat(" ",@' + name + '," ")," ' + value + ' ")]' :
    '[@' + name + ']');

  return getNodesByXPath(xpath, aContext);
}

function getFirstNodeBySelector(aSelector, aContext) {
  var node = aContext || getFocusedDocument();

  return node.querySelector(aSelector);
}

function getNodesBySelector(aSelector, aContext) {
  var node = aContext || getFocusedDocument();

  // @return {static NodeList}
  return node.querySelectorAll(aSelector);
}

function getFirstNodeByXPath(aXPath, aContext) {
  var result = evaluateXPath(
    aXPath,
    aContext,
    XPathResult.FIRST_ORDERED_NODE_TYPE
  );

  return result ? result.singleNodeValue : null;
}

function getNodesByXPath(aXPath, aContext) {
  var result = evaluateXPath(
    aXPath,
    aContext,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE
  );

  var nodes = new Array(result ? result.snapshotLength : 0);

  for (let i = 0, len = nodes.length; i < len; i++) {
    nodes[i] = result.snapshotItem(i);
  }

  return nodes;
}

function evaluateXPath(aXPath, aContext, aType) {
  var doc, base;

  if (aContext instanceof Document) {
    doc  = aContext;
    base = doc.documentElement;
  } else {
    doc  = aContext ? aContext.ownerDocument : getFocusedDocument();
    base = aContext || doc.documentElement;
  }

  var resolver;

  var defaultNS = null;
  try {
    defaultNS = base.lookupNamespaceURI(null);
  } catch (ex) {}

  if (defaultNS) {
    let tmpPrefix = '__NS__';
    aXPath = fixNamespacePrefixForXPath(aXPath, tmpPrefix);
    resolver = function(prefix) {
      return (prefix === tmpPrefix) ?
        defaultNS : lookupNamespaceURI(prefix);
    };
  } else {
    resolver = function(prefix) {
      return lookupNamespaceURI(prefix);
    };
  }

  var result = null;
  try {
    result = doc.evaluate(aXPath, base, resolver, aType, null);
  } catch (ex) {}
  return result;
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


//********** Page/Tab/Window function

function checkSecurity(aURL) {
  // @see chrome://global/content/contentAreaUtils.js::urlSecurityCheck()
  window.urlSecurityCheck(
    aURL,
    gBrowser.contentPrincipal,
    window.Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL
  );
}

function unescapeURLCharacters(aURL) {
  const kURLChars = {
    "21":"!", "23":"#", "24":"$", "25":"%", "26":"&", "27":"'", "28":"(",
    "29":")",
    "2a":"*", "2b":"+", "2c":",", "2d":"-", "2e":".", "2f":"/",
    "3a":":", "3b":";", "3d":"=", "3f":"?", "40":"@", "5f":"_", "7e":"~"
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

  var charset = aCharset || getFocusedDocument().characterSet;

  return XPCOM.$S('TextToSubURI').unEscapeURIForUI(charset, aURL);
}

function resolveURL(aURL, aBaseURL) {
  if (!aURL || !/\S/.test(aURL)) {
    return '';
  }

  if (/^[a-zA-Z]+:/.test(aURL)) {
    return aURL;
  }

  var baseURL = aBaseURL || getFocusedDocument().documentURI;

  // @see chrome://browser/content/utilityOverlay.js::makeURLAbsolute()
  return window.makeURLAbsolute(baseURL, aURL);
}

function openNewWindow(aURL, aOption) {
  var URL = resolveURL(aURL);
  if (!URL) {
    return;
  }

  aOption = aOption || {};
  var {inBackground} = aOption;

  checkSecurity(URL);

  // @see chrome://browser/content/utilityOverlay.js::openNewWindowWith()
  var newWin = window.
    openNewWindowWith(URL, getFocusedDocument(), null, false);

  if (inBackground) {
    setTimeout(window.focus, 0);
  }

  return newWin;
}

function openHomePages(aOption) {
  aOption = aOption || {};
  var {doReplace, onlyFirstPage} = aOption;

  // @see chrome://browser/content/browser.js::gHomeButton
  var homePages = window.gHomeButton.getHomePage().split('|');
  if (onlyFirstPage) {
    homePages = homePages[0];
  }

  openTabs(homePages, {ucjsReplace: doReplace, ucjsTrustURL: true});
}

function openTabs(aURLs, aOption) {
  if (typeof aURLs === 'string') {
    aURLs = aURLs.split('|');
  }
  if (!Array.isArray(aURLs) || aURLs.length === 0) {
    return;
  }

  aOption = aOption || {};
  var {inBackground} = aOption;
  var {ucjsReplace} = aOption;
  delete aOption.ucjsReplace;

  var firstTabAdded;

  if (ucjsReplace) {
    // @see chrome://browser/content/browser.js::BrowserOpenTab
    window.BrowserOpenTab();
    removeAllTabsBut(gBrowser.selectedTab);
    firstTabAdded = loadPage(aURLs.shift(), aOption);
  } else {
    if (!inBackground) {
      firstTabAdded = openTab(aURLs.shift(), aOption);
    }
  }

  aURLs.forEach(function(url) {
    openTab(url, aOption);
  });

  if (firstTabAdded) {
    gBrowser.selectedTab = firstTabAdded;
  }
}

function openURLIn(aURL, aInTab, aOption) {
  if (aInTab) {
    return openTab(aURL, aOption);
  }
  return loadPage(aURL, aOption);
}

function openTab(aURL, aOption) {
  var URL = resolveURL(aURL);
  if (!URL) {
    return;
  }

  aOption = aOption || {};
  var {inBackground} = aOption;
  var {ucjsTrustURL} = aOption;
  delete aOption.ucjsTrustURL;

  if (!ucjsTrustURL) {
    checkSecurity(URL);
  }

  aOption.inBackground = inBackground === true;

  return gBrowser.loadOneTab(URL, aOption);
}

function loadPage(aURL, aOption) {
  var URL = resolveURL(aURL);
  if (!URL) {
    return;
  }

  aOption = aOption || {};
  var {
    referrerURI, charset, postData,
    allowThirdPartyFixup, fromExternal, isUTF8
  } = aOption;
  var {ucjsTrustURL} = aOption;
  delete aOption.ucjsTrustURL;

  if (!ucjsTrustURL) {
    checkSecurity(URL);
  }

  const {Ci} = window;
  var flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE;
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
 * @see chrome://browser/content/tabbrowser.xml::removeTab
 */
function removeTab(aTab, aOption) {
  aOption = aOption || {};
  var {safeBlock} = aOption;

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

  var tabs = gBrowser.visibleTabs;

  for (let i = tabs.length - 1, tab; i >= 0; i--) {
    tab = tabs[i];
    if (tab !== aTab && !tab.pinned) {
      removeTab(tab, {safeBlock: true});
    }
  }
}


//********** Miscellaneous function

function convertFromUTF16(aStr, aCharset) {
  if (!aCharset) {
    return null;
  }

  var converter = XPCOM.$I('ScriptableUnicodeConverter');

  converter.charset = aCharset;

  try {
    return converter.ConvertFromUnicode(aStr);
  } catch (ex) {}
  return aStr;
}

function convertToUTF16(aStr, aCharset) {
  var converter = XPCOM.$I('ScriptableUnicodeConverter');

  converter.charset = aCharset || 'UTF-8';

  try {
    return converter.ConvertToUnicode(aStr);
  } catch (ex) {}
  return aStr;
}

/**
 * Converts UTF-8 characters that are emmbeded in a user script into UTF-16 so
 * that they can be displayed properly for UI
 * @param aData {string|hash}
 * @return {}
 *
 * @note If |aData| is hash, it allows the nested array or hash but the end
 * value should be a string.
 */
function toStringForUI(aData) {
  if (!aData) {
    return aData;
  }

  if (typeof aData === 'string') {
    return convertToUTF16(aData, 'UTF-8');
  }

  if (Array.isArray(aData)) {
    return aData.map(function(value) toStringForUI(value));
  }

  if (/^{.+}$/.test(JSON.stringify(aData))) {
    for (let key in aData) {
      aData[key] = toStringForUI(aData[key]);
    }
    return aData;
  }

  return aData;
}

function getWindowList(aType) {
  if (aType !== null) {
    aType = aType || 'navigator:browser';
  }

  return XPCOM.$S('wm').getEnumerator(aType);
}

function focusWindow(aWindow) {
  var wins = getWindowList(null), win;

  while (wins.hasMoreElements()) {
    win = wins.getNext();
    if (win === aWindow) {
      win.focus();
      return;
    }
  }
}

function focusWindowAtIndex(aIdx) {
  var wins = getWindowList(null), win;
  var idx = 0;

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
  let {remove} = aOption || {};

  let css = normalizeCSS(aCSS);
  if (!css) {
    return;
  }

  let URI;
  try {
    URI = XPCOM.$S('io').
      newURI('data:text/css,' + encodeURIComponent(css), null, null);
  } catch (ex) {
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

  let styleSheets = window.document.styleSheets;
  let exists = Array.some(styleSheets, function(styleSheet) {
    return styleSheet.href === dataURI;
  });
  if (exists) {
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
  let {document, id} = aOption || {};

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
  // @note You should put a 'half-width space' for the separator of;
  // the descendant selector (e.g. h1 em{...})
  // the shorthand properties (e.g. margin:1px 2px;)

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
 * @param aParam {hash}
 *   expression: {string} a SQL expression
 *   params: {hash} [optional] the binding parameters
 *   columns: {array} the column names
 * @return {hash[]|null}
 *   hash[]: array of {column name: value, ...}
 *   null: no result
 */
function scanPlacesDB(aParam) {
  const {expression, params, columns} = aParam || {};

  // @see resource://gre/modules/PlacesUtils.jsm
  const {PlacesUtils, Ci} = window;
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
      let res = {};
      columns.forEach(function(name) {
        res[name] = statement.row[name];
      });
      rows.push(res);
    }
  } finally {
    statement.finalize();
  }

  if (rows.length) {
    return rows;
  }
  return null;
}

/**
 * Query the Places database asynchronously
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
 * I'm not sure why it doesn't work well.
 *
 * TODO: handlings on error and cancel
 */
function asyncScanPlacesDB(aParam) {
  const {
    expression, params, columns,
    onSuccess, onError, onCancel
  } = aParam || {};

  // @see resource://gre/modules/PlacesUtils.jsm
  const {PlacesUtils, Ci} = window;
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
          let res = {};
          columns.forEach(function(name) {
            res[name] = row.getResultByName(name);
          });
          this.rows.push(res);
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
  } finally {
    statement.finalize();
  }
}


//********** Log function

function logMessage(aTarget, aMessage) {
  function U(value) {
    return toStringForUI(value);
  }

  if (Array.isArray(aMessage)) {
    aMessage = aMessage.join('\n');
  }

  const kMessageFormat = '[%target%]\n%message%';
  let formatMessage = U(kMessageFormat.
    replace('%target%', aTarget).
    replace('%message%', aMessage));
  let formatDate = U(getFormatDate());

  // for the error console
  XPCOM.$S('console').logStringMessage(
    [formatDate, formatMessage].join('\n'));

  // for the web console
  var win = XPCOM.$S('BrowserGlue').getMostRecentBrowserWindow();
  if (win) {
    win.content.console.log(formatMessage);
  }

  return formatMessage;
}

function getFormatDate(aOption) {
  const kStandardFormat = '%04Y/%02M/%02D %02h:%02m:%02s.%03ms';

  let {format, time} = aOption || {};
  format = format || kStandardFormat;

  let date = time ? new Date(time) : new Date();
  let map = {
    'Y': date.getFullYear(),
    'M': date.getMonth() + 1,
    'D': date.getDate(),
    'h': date.getHours(),
    'm': date.getMinutes(),
    's': date.getSeconds(),
    'ms': date.getMilliseconds()
  };

  return format.replace(/%(0)?(\d+)?(ms|[YMDhms])/g,
    function(match, pad, width, type) {
      let value = String(map[type]);
      width = width && parseInt(width);
      if (0 < width && value.length !== width) {
        if (value.length < width) {
          value = Array(width).join(!!pad ? '0' : ' ') + value;
        }
        return value.substr(-width);
      }
      return value;
    }
  );
}

function log(aMessage) {
  return logMessage('Util.uc.js', aMessage);
}


//********** Export

return {
  Timer: Timer,
  Prefs: Prefs,

  setEventListener: setEventListener,
  getSelectionAtCursor: getSelectionAtCursor,
  getFocusedWindow: getFocusedWindow,
  getFocusedDocument: getFocusedDocument,
  createNode: createNode,
  getNodeByAnonid: getNodeByAnonid,
  getNodesByAttribute: getNodesByAttribute,
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
  openURLIn: openURLIn,
  openTab: openTab,
  loadPage: loadPage,
  removeTab: removeTab,
  removeAllTabsBut: removeAllTabsBut,

  toStringForUI: toStringForUI,
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
