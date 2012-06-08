// ==UserScript==
// @name Util.uc.js
// @description Common utilities.
// @include main
// @include chrome://global/content/console.xul
// ==/UserScript==

// @include chrome://browser/content/pageinfo/pageInfo.xul
// @include chrome://browser/content/bookmarks/bookmarksPanel.xul
// @include chrome://browser/content/history/history-panel.xul

// @usage Access to items through global functions (ucjsUtil.XXX).


var ucjsUtil = (function(window, undefined) {


"use strict";


// Generic variables.

var {document, gBrowser} = window;
var {classes: Cc, interfaces: Ci} = Components;


// Handler for XPCOM.

var mXPCOM = (function() {

  function $S(aCID, aIID) Cc[aCID].getService(Ci[aIID]);
  function $I(aCID, aIID) Cc[aCID].createInstance(Ci[aIID]);

  return {
    // Services.

    get WindowMediator() {
      delete this.WindowMediator;
      return this.WindowMediator =
        $S('@mozilla.org/appshell/window-mediator;1', 'nsIWindowMediator');
    },

    get BrowserGlue() {
      delete this.BrowserGlue;
      return this.BrowserGlue =
        $S('@mozilla.org/browser/browserglue;1', 'nsIBrowserGlue');
    },

    get ConsoleService() {
      delete this.ConsoleService;
      return this.ConsoleService =
        $S('@mozilla.org/consoleservice;1', 'nsIConsoleService');
    },

    get StyleSheetService() {
      delete this.StyleSheetService;
      return this.StyleSheetService =
        $S('@mozilla.org/content/style-sheet-service;1', 'nsIStyleSheetService');
    },

    get TextToSubURI() {
      delete this.TextToSubURI;
      return this.TextToSubURI =
        $S('@mozilla.org/intl/texttosuburi;1', 'nsITextToSubURI');
    },

    get IOService() {
      delete this.IOService;
      return this.IOService =
        $S('@mozilla.org/network/io-service;1', 'nsIIOService');
    },

    get ObserverService() {
      delete this.ObserverService;
      return this.ObserverService =
        $S('@mozilla.org/observer-service;1', 'nsIObserverService');
    },

    get PrefBranch() {
      delete this.PrefBranch;
      return this.PrefBranch =
        $S('@mozilla.org/preferences;1', 'nsIPrefBranch');
    },

    get AppStartup() {
      delete this.AppStartup;
      return this.AppStartup =
        $S('@mozilla.org/toolkit/app-startup;1', 'nsIAppStartup');
    },

    get XULRuntime() {
      delete this.XULRuntime;
      return this.XULRuntime =
        $S('@mozilla.org/xre/app-info;1', 'nsIXULRuntime');
    },

    // Instances.

    DocumentEncoder: function(aType) {
      return $I('@mozilla.org/layout/documentEncoder;1?type=' + aType, 'nsIDocumentEncoder');
    },

    ScriptableUnicodeConverter: function() {
      return $I('@mozilla.org/intl/scriptableunicodeconverter', 'nsIScriptableUnicodeConverter');
    },

    SupportsPRBool: function() {
      return $I('@mozilla.org/supports-PRBool;1', 'nsISupportsPRBool');
    }
  }

})();


// Functions for DOM.

function setEventListener(aData) {
  var [target, type, listener, capture] = aData;
  if (!target || !type || !listener)
    return;

  capture = !!capture;

  target.addEventListener(type, listener, capture);
  window.addEventListener('unload', function removeEvent() {
    target.removeEventListener(type, listener, capture);
    window.removeEventListener('unload', removeEvent, false);
  }, false);
}

function getSelectionAtCursor(aOption) {
  var {event} = aOption || {};

  var targetWindow, rangeParent, rangeOffset;
  if (event) {
    targetWindow = event.target.ownerDocument.defaultView;
    rangeParent = event.rangeParent;
    rangeOffset = event.rangeOffset;
  } else if (gContextMenu) {
    targetWindow = document.popupNode.ownerDocument.defaultView;
    rangeParent = document.popupRangeParent;
    rangeOffset = document.popupRangeOffset;
  }

  if (!targetWindow)
    return '';

  var selection = getSelectionController(targetWindow);
  if (!selection || !selection.toString())
    return '';

  var text = '';
  for (let i = 0, l = selection.rangeCount, range; i < l; i++) {
    range = selection.getRangeAt(i);
    if (range.isPointInRange(rangeParent, rangeOffset)) {
      text = getSelectedTextInRange(range);
      break;
    }
  }
  if (!text)
    return '';

  // Only uses the first important line. 
  // @see chrome://browser/content/browser.js::getBrowserSelection()
  const kMaxCharLen = 150;
  if (text.length > kMaxCharLen) {
    let match = RegExp('^(?:\\s*.){0,' + kMaxCharLen + '}').exec(text);
    text = match ? match[0] : '';
  }
  text.split(/\n/).some(function(s) !!(text = s.replace(/\s+/g, ' ').trim()));

  return text;
}

function getSelectionController(aWindow) {
  var selection = (aWindow || getFocusedWindow()).getSelection();
  if (selection === null)
    return null;

  if (!selection.toString()) {
    let node = document.commandDispatcher.focusedElement;
    if (node &&
        (('mozIsTextField' in node && node.mozIsTextField(true)) ||
         /^(?:search|text|textarea)$/.test(node.type))) {
      try {
        selection =
          node.
          QueryInterface(Ci.nsIDOMNSEditableElement).
          editor.
          selection;
      } catch (e) {
        selection = null;
      }
    }
  }

  return selection;
}

function getSelectedTextInRange(aRange) {
  if (!aRange.toString())
    return '';

  var type = 'text/plain';
  var encoder = mXPCOM.DocumentEncoder(type);

  encoder.init(
    aRange.startContainer.ownerDocument,
    type,
    encoder.OutputSelectionOnly |
    encoder.OutputBodyOnly |
    encoder.OutputLFLineBreak |
    encoder.SkipInvisibleContent
  );

  encoder.setRange(aRange);

  return encoder.encodeToString();
}

function lookupNamespace(aPrefix) {
  const kNamespace = {
    xul:   'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
    html:  'http://www.w3.org/1999/xhtml',
    xhtml: 'http://www.w3.org/1999/xhtml',
    xlink: 'http://www.w3.org/1999/xlink'
  };

  return kNamespace[aPrefix] || null;
}

// for XUL element.
function createNode(aTagOrNode, aAttribute) {
  function getNamespaceOf(s) {
    var match = /^(.+?):/.exec(s);
    return match ? lookupNamespace(match[1]) : '';
  }

  var element = null;
  if (typeof aTagOrNode === 'string') {
    let elementNS = getNamespaceOf(aTagOrNode);
    element = elementNS ?
      document.createElementNS(elementNS, aTagOrNode) : document.createElement(aTagOrNode);
  } else if (aTagOrNode instanceof Element) {
    element = aTagOrNode;
  }
  if (!element)
    throw 'aTagOrNode should be tagname or element. aTagOrNode:' + aTagOrNode;

  if (!!aAttribute) {
    let attributeNS;
    for (let [name, value] in Iterator(aAttribute)) {
      if (name && value !== null && typeof value !== 'undefined') {
        attributeNS = getNamespaceOf(name);
        if (attributeNS) {
          element.setAttributeNS(attributeNS, name, value);
        } else {
          element.setAttribute(name, value);
        }
      }
    }
  }

  return element;
}

// for XUL element.
function getNodeByAnonid(aId, aContext) {
  return document.getAnonymousElementByAttribute(aContext, 'anonid', aId);
}

function getFocusedWindow() {
  var focusedWindow = document.commandDispatcher.focusedWindow;

  return (!focusedWindow || focusedWindow === window) ? gBrowser.contentWindow : focusedWindow;
}

function getFocusedDocument() {
  var win = getFocusedWindow();

  return win.contentDocument || win.document;
}

function getNodesByAttribute(aAttributeName, aAttributeValue, aTagName, aContext) {
  var tag = 'descendant::' + (aTagName || '*');

  var predicate = aAttributeValue ?
    '[contains(concat(" ",@' + aAttributeName + '," ")," ' + aAttributeValue + ' ")]' :
    '[@' + aAttributeName + ']';

  return getNodesByXPath(tag + predicate, aContext);
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

  if (aContext === gBrowser.contentDocument) {
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
  } catch (e) {}

  if (defaultNS) {
    let tmpPrefix = '__NS__';
    aXPath = fixNamespacePrefixForXPath(aXPath, tmpPrefix);
    resolver = function(prefix) (prefix === tmpPrefix) ? defaultNS : lookupNamespace(prefix);
  } else {
    resolver = function(prefix) lookupNamespace(prefix);
  }

  var result = null;
  try {
    result = doc.evaluate(aXPath, base, resolver, aType, null);
  } catch (e) {}
  return result;
}

// @note cf. http://nanto.asablo.jp/blog/2008/12/11/4003371
function fixNamespacePrefixForXPath(aXPath, aPrefix) {
  /**
   * identifier  ([A-Za-z_\u00c0-\ufffd][\w\-.\u00b7-\ufffd]*|\*)
   *               \s*
   * suffix        (::?|\()?
   *             |
   * operator    (\/\/?|!=|[<>]=?|[\(\[|,=+-])
   *             |
   *             ".*?"|
   *             '.*?'|
   *             \.?\d+(?:\.\d*)?|
   *             \.\.?|
   *             [\)\]@$]
   */
  const kToken = /([A-Za-z_\u00c0-\ufffd][\w\-.\u00b7-\ufffd]*|\*)\s*(::?|\()?|(\/\/?|!=|[<>]=?|[\(\[|,=+-])|".*?"|'.*?'|\.?\d+(?:\.\d*)?|\.\.?|[\)\]@$]/g;

  var prefix = aPrefix + ':', ready = true;

  function replacer(token, identifier, suffix, operator) {
    if (suffix) {
      ready = (suffix === '::' && identifier !== 'attribute' && identifier !== 'namespace') ||
              suffix === '(';
    } else if (identifier) {
      if (ready && identifier !== '*') {
        token = prefix + token;
      }
      // Consecutive identifiers are alternately ready or not.
      ready = (ready === null) ? true : null;
    } else {
      ready = !!operator;
    }

    return token;
  }

  return aXPath.replace(kToken, replacer);
}


// Functions for URI.

function checkSecurity(aURL) {
  urlSecurityCheck(
    aURL,
    gBrowser.contentPrincipal,
    Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL
  );
}

function unescapeURLCharacters(aURL) {
  const kURLChars = {
    "21":"!", "23":"#", "24":"$", "25":"%", "26":"&", "27":"'", "28":"(", "29":")",
    "2a":"*", "2b":"+", "2c":",", "2d":"-", "2e":".", "2f":"/",
    "3a":":", "3b":";", "3d":"=", "3f":"?", "40":"@", "5f":"_", "7e":"~"
  };

  for (let key in kURLChars) {
    aURL = aURL.replace(RegExp('%(?:25)?' + key, 'ig'), kURLChars[key]);
  }

  return aURL;
}

function unescapeURLForUI(aURL, aCharset) {
  if (!aURL)
    return null;

  var charset = aCharset || getFocusedDocument().characterSet;

  return mXPCOM.TextToSubURI.unEscapeURIForUI(charset, aURL);
}

function resolveURL(aURL, aBaseURL) {
  if (!aURL || !/\S/.test(aURL))
    return null;
  if (/^[a-zA-Z]+:/.test(aURL))
    return aURL;

  var baseURL = aBaseURL || getFocusedDocument().documentURI;

  return makeURLAbsolute(baseURL, aURL);
}

function openNewWindow(aURL, aOption) {
  var URL = resolveURL(aURL);
  if (!URL)
    return;

  aOption = aOption || {};
  var {inBackground} = aOption;

  checkSecurity(URL);

  var doc = getFocusedDocument();
  var newWin = openNewWindowWith(URL, doc, null, false);

  if (inBackground) {
    setTimeout(focus, 0);
  }

  return newWin;
}

function openHomePages(aReplace, aFirstPage) {
  var homePages = gHomeButton.getHomePage().split('|');
  if (aFirstPage) {
    homePages = homePages[0];
  }

  openTabs(homePages, {ucjsReplace: aReplace, ucjsTrustURL: true});
}

function openTabs(aURLs, aOption) {
  if (typeof aURLs === 'string') {
    aURLs = aURLs.split('|');
  }
  if (!Array.isArray(aURLs) || aURLs.length === 0)
    return;

  aOption = aOption || {};
  var {ucjsReplace} = aOption;

  if (ucjsReplace) {
    BrowserOpenTab();
    gBrowser.removeAllTabsBut(gBrowser.mCurrentTab);
    loadPage(aURLs.shift(), aOption);
  }

  aURLs.forEach(function(url) {
    openTab(url, aOption);
  });
}

function openURLIn(aURL, aInTab, aOption) {
  if (aInTab) {
    return openTab(aURL, aOption);
  }
  return loadPage(aURL, aOption);
}

function openTab(aURL, aOption) {
  var URL = resolveURL(aURL);
  if (!URL)
    return;

  aOption = aOption || {};
  var {ucjsTrustURL, inBackground} = aOption;

  if (!ucjsTrustURL) {
    checkSecurity(URL);
  }

  aOption.inBackground = inBackground === true;

  return gBrowser.loadOneTab(URL, aOption);
}

function loadPage(aURL, aOption) {
  var URL = resolveURL(aURL);
  if (!URL)
    return;

  var {
    ucjsTrustURL,
    referrerURI, charset, postData,
    allowThirdPartyFixup, fromExternal, isUTF8
  } = aOption || {};

  if (!ucjsTrustURL) {
    checkSecurity(URL);
  }

  var flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE;
  if (allowThirdPartyFixup)
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP;
  if (fromExternal)
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_FROM_EXTERNAL;
  if (isUTF8)
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_URI_IS_UTF8;

  return gBrowser.loadURIWithFlags(URL, flags, referrerURI, charset, postData);
}


// Misc. functions.

function convertFromUTF16(aStr, aCharset) {
  if (!aCharset)
    return null;

  var suc = mXPCOM.ScriptableUnicodeConverter();

  suc.charset = aCharset;

  try {
    return suc.ConvertFromUnicode(aStr);
  } catch (e) {
  }
  return aStr;
}

function convertToUTF16(aStr, aCharset) {
  var suc = mXPCOM.ScriptableUnicodeConverter();

  suc.charset = aCharset || 'UTF-8';

  try {
    return suc.ConvertToUnicode(aStr);
  } catch (e) {}
  return aStr;
}

function getWindowList(aType) {
  if (aType !== null) {
    aType = aType || 'navigator:browser';
  }

  return mXPCOM.WindowMediator.getEnumerator(aType);
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

function restartApp(aPurgeCaches) {
  if (!canQuitApp())
    return;

  if (aPurgeCaches) {
    mXPCOM.XULRuntime.invalidateCachesOnRestart();
  }

  const as = mXPCOM.AppStartup;
  as.quit(as.eRestart | as.eAttemptQuit);
}

function canQuitApp() {
  const os = mXPCOM.ObserverService;

  var cancel = mXPCOM.SupportsPRBool();
  os.notifyObservers(cancel, 'quit-application-requested', null);
  if (cancel.data)
    return false;

  os.notifyObservers(null, 'quit-application-granted', null);

  var wins = getWindowList(null), win;
  while (wins.hasMoreElements()) {
    win = wins.getNext();
    if (('tryToClose' in win) && !win.tryToClose())
      return false;
  }
  return true;
}

function registerGlobalStyleSheet(aCSS, aAgent, aRegister) {
  try {
    var css = normalizeCSS(aCSS);
    if (!css)
      return;

    var URI = mXPCOM.IOService.newURI('data:text/css,' + encodeURIComponent(css), null, null);
  } catch (e) {
    return;
  }

  const sss = mXPCOM.StyleSheetService;
  var type = aAgent ? sss.AGENT_SHEET : sss.USER_SHEET;
  var registered = sss.sheetRegistered(URI, type);

  if (aRegister && !registered) {
    sss.loadAndRegisterSheet(URI, type);
  } else if (!aRegister && registered) {
    sss.unregisterSheet(URI, type);
  }
}

function registerChromeStyleSheet(aCSS) {
  var css = normalizeCSS(aCSS);
  if (!css)
    return;

  var stylesheet = document.createProcessingInstruction(
    'xml-stylesheet',
    'type="text/css" href="data:text/css,%DATA%"'.replace('%DATA%', encodeURIComponent(css))
  );

  stylesheet.getAttribute = function(key) document.documentElement.getAttribute(key);

  return document.insertBefore(stylesheet, document.documentElement);
}

function registerContentStyleSheet(aCSS, aOption) {
  var {doc, id, replace} = aOption || {};

  var d = doc || getFocusedDocument();

  var head = (d.getElementsByTagName('head') || [])[0];
  if (!head)
    return;

  var old = id && d.getElementById(id);
  if (old) {
    if (!replace)
      return;
    head.removeChild(old);
  }

  var css = normalizeCSS(aCSS);
  if (!css)
    return;

  var style = d.createElement('style');
  if (id) {
    style.id = id;
  }
  style.appendChild(d.createTextNode(css));

  return head.appendChild(style);
}

function normalizeCSS(aCSS) {
  if (typeof aCSS === 'xml') {
    aCSS = aCSS.toString();
  }

  return aCSS.
    // remove consecutive white spaces
    // @note the delimiter of shorthand properties should be a SINGLE white space (margin:1px 2px;)
    replace(/\s{2,}/g, '').trim().
    // remove comment
    replace(/\s*\/\*.*?\*\/\s*/g, '');
}

function loadOverlay(aOverlay) {
  if (typeof aOverlay === 'xml') {
    aOverlay = aOverlay.toXMLString();
  }

  var overlay = 'data:application/vnd.mozilla.xul+xml;charset=utf-8,' + encodeURIComponent(aOverlay);

  document.loadOverlay(overlay, null);
}

function getPref(aKey, aDef) {
  const pb = mXPCOM.PrefBranch;

  try {
    switch (pb.getPrefType(aKey)) {
      case pb.PREF_BOOL:   return pb.getBoolPref(aKey);
      case pb.PREF_INT:    return pb.getIntPref(aKey);
      case pb.PREF_STRING: return pb.getCharPref(aKey);
    }
  } catch (e) {}
  return aDef || null;
}

function setPref(aKey, aVal) {
  const pb = mXPCOM.PrefBranch;

  try {
    if (aVal === null) {
      pb.clearUserPref(aKey);
      return;
    }

    if (getPref(aKey) !== aVal) {
      switch (typeof aVal) {
        case 'boolean': pb.setBoolPref(aKey, aVal);
        case 'number':  pb.setIntPref(aKey, aVal);
        case 'string':  pb.setCharPref(aKey, aVal);
      };
    }
  } catch (e) {}
}


// Functions for Debug.

function logMessage(aTarget, aMsg) {
  var msg = convertToUTF16('[' + aTarget + ']\n' + aMsg, 'UTF-8');

  // Error Console.
  mXPCOM.ConsoleService.logStringMessage(msg);

  // Web Console.
  var win = mXPCOM.BrowserGlue.getMostRecentBrowserWindow();
  if (win) {
    win.content.console.log(msg);
  }

  return msg;
}

function log(aMsg)
  logMessage('Util.uc.js', aMsg);


// Export to global.

return {
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

  convertForSystem: function(aStr) convertToUTF16(aStr, 'UTF-8'),
  getWindowList: getWindowList,
  focusWindow: focusWindow,
  focusWindowAtIndex: focusWindowAtIndex,
  restartApp: restartApp,

  setGlobalStyleSheet: function(aCSS, aAgent) registerGlobalStyleSheet(aCSS, aAgent, true),
  removeGlobalStyleSheet: function(aCSS, aAgent) registerGlobalStyleSheet(aCSS, aAgent, false),
  setChromeStyleSheet: registerChromeStyleSheet,
  setContentStyleSheet: registerContentStyleSheet,

  loadOverlay: loadOverlay,
  getPref: getPref,
  setPref: setPref,

  logMessage: logMessage
}


})(this);
