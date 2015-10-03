// ==UserScript==
// @name Util.uc.js
// @description Common utilities.
// @include main
// @include chrome://browser/content/devtools/webconsole.xul
// ==/UserScript==

// Chrome window examples:
// @include chrome://browser/content/pageinfo/pageInfo.xul
// @include chrome://browser/content/bookmarks/bookmarksPanel.xul
// @include chrome://browser/content/history/history-panel.xul

// @usage Access to functions through the global scope (window.ucjsUtil.XXX).

// @note This file should be loaded earlier than other scripts.
// @see |Modules|.


const ucjsUtil = (function(window) {


"use strict";


/**
 * Native module handler.
 *
 * @note Must put this handler at the top of this file |Util.uc.js|, which has
 * the common utilities and should be loaded earlier than other scripts, so
 * that it ensures the access to the modules by later functions.
 */
const Modules = (function() {
  /**
   * The modules data.
   *
   * [Method]
   * name: {string}
   *   The custom name for access to.
   * method: {function}
   *   The function to be executed.
   *
   * [XPCOM service]
   * name: {string}
   *   The custom name for access to.
   * CID: {string}
   *   Contract ID.
   * IID: {string}
   *   Interface ID.
   *
   * [JS module]
   * name: {string}
   *   The custom name for access to.
   *   [JSM] Usually the native module name.
   *     @note Must set |moduleName| to the native module name when you want to
   *     access this module by |name| different from the native name.
   *   [SDK] Your favorite name.
   * moduleURL: {string}
   *   The module resource URL.
   *   [JSM] A full path, but can drop the prefix 'resource://'.
   *     @see |require|
   *   [SDK] A special path.
   *     @see https://developer.mozilla.org/en/Add-ons/SDK/Guides/Module_structure_of_the_SDK#SDK_Modules
   * moduleName: {string} [optional for JSM]
   *   The native module name.
   *
   * XXX: My setting guide:
   * - [Method] Some useful functions.
   * - [XPCOM services] I want to gather all used modules here.
   * - [JS modules] I only register frequently used modules.
   */
  const kModulesData = [
    {
      name: 'require',
      method: require
    },
    {
      name: '$S',
      method: (CID, IID) => Cc[CID].getService(Ci[IID])
    },
    {
      name: '$I',
      method: (CID, IID) => Cc[CID].createInstance(Ci[IID])
    },
    {
      name: 'ClipboardHelper',
      CID: '@mozilla.org/widget/clipboardhelper;1',
      IID: 'nsIClipboardHelper'
    },
    {
      name: 'SessionStartup',
      CID: '@mozilla.org/browser/sessionstartup;1',
      IID: 'nsISessionStartup'
    },
    {
      name: 'SessionStore',
      CID: '@mozilla.org/browser/sessionstore;1',
      IID: 'nsISessionStore'
    },
    {
      name: 'StyleSheetService',
      CID: '@mozilla.org/content/style-sheet-service;1',
      IID: 'nsIStyleSheetService'
    },
    {
      name: 'TextToSubURI',
      CID: '@mozilla.org/intl/texttosuburi;1',
      IID: 'nsITextToSubURI'
    },
    {
      // @see resource://gre/modules/BrowserUtils.jsm
      name: 'BrowserUtils',
      moduleURL: 'gre/modules/BrowserUtils.jsm'
    },
    {
      // @see resource://gre/modules/PlacesUtils.jsm
      name: 'PlacesUtils',
      moduleURL: 'gre/modules/PlacesUtils.jsm'
    },
    {
      // @see resource:///modules/PlacesUIUtils.jsm
      name: 'PlacesUIUtils',
      moduleURL: '/modules/PlacesUIUtils.jsm'
    },
    {
      // @see resource://gre/modules/Preferences.jsm
      name: 'Prefs',
      moduleURL: 'gre/modules/Preferences.jsm',
      moduleName: 'Preferences'
    },
    {
      // @see resource://gre/modules/commonjs/sdk/timers.js
      name: 'Timer',
      moduleURL: 'sdk/timers'
    }//,
  ];

  let modules = {};

  // Initialize.
  setupGlobalAccess();
  setupModules();

  function setupGlobalAccess() {
    // Enable access to usual short names for |window.Components| items.
    [
      ['Cc', 'classes'],
      ['Ci', 'interfaces'],
      ['Cu', 'utils']
    ].
    forEach(([alias, key]) => {
      if (!window[alias]) {
        window[alias] = window.Components[key];
      }
    });

    // Enable access to |window.Services| and |window.XPCOMUtils|.
    Cu.import('resource://gre/modules/Services.jsm');
    Cu.import('resource://gre/modules/XPCOMUtils.jsm');
  }

  function setupModules() {
    kModulesData.forEach((params) => {
      let {name, method, CID, IID, moduleURL, moduleName} = params;

      if (method) {
        XPCOMUtils.defineLazyGetter(modules, name, () => {
          return method;
        });
      }
      else if (CID && IID) {
        XPCOMUtils.defineLazyServiceGetter(modules, name, CID, IID);
      }
      else if (moduleURL) {
        XPCOMUtils.defineLazyGetter(modules, name, () => {
          return require(moduleURL, {
            moduleName: moduleName || name
          });
        });
      }
    });
  }

  /**
   * JS module loader.
   *
   * TODO: Make a lazy getter option.
   */
  function require(moduleURL, options = {}) {
    let {
      moduleName
    } = options;

    // Loads JSM.
    if (/^(?:gre)?\/modules\/.+\.jsm$/.test(moduleURL)) {
      let scope = {};

      Cu.import('resource://' + moduleURL, scope);

      return moduleName ? scope[moduleName] : scope;
    }

    // Loads JS.
    if (/^chrome:.+\.js$/.test(moduleURL)) {
      let scope = {};

      Services.scriptLoader.loadSubScript(moduleURL, scope);

      return scope;
    }

    // Loads SDK.
    let loader = Cu.import('resource://gre/modules/devtools/Loader.jsm', {});

    return loader.devtools.require(moduleURL);
  }

  return modules;
})();

/**
 * Log function.
 */
const Console = (function() {
  function logMessage(logData, stackCaller) {
    if (!stackCaller) {
      stackCaller = Components.stack.caller;
    }

    if (!Array.isArray(logData)) {
      logData = [logData];
    }

    // @see resource://gre/modules/Log.jsm
    const {Log} = Modules.require('gre/modules/Log.jsm');

    let formatter = new Log.ParameterFormatter();
    let messages = logData.map((data) => {
      // TODO: Add other exceptions if error occurs in ParameterFormatter.
      if (data instanceof Element ||
          data instanceof Document ||
          data instanceof Window) {
        return data.toString();
      }

      return data;
    }).
    map(formatter.format);

    let getFileName = (url) =>
      url.
      replace(/[?#].*$/, '').
      replace(/^.+?([^\/.]+(?:\.\w+)+)$/, '$1');

    let output =
      '[%file%]\n::%function%\n%message%'.
      replace('%file%', getFileName(stackCaller.filename || '[N/A]')).
      replace('%function%', stackCaller.name || '[anonymous function]').
      replace('%message%', messages.join('\n'));

    let scriptError =
      Modules.$I('@mozilla.org/scripterror;1', 'nsIScriptError');

    scriptError.init(
      output,
      stackCaller.filename,
      stackCaller.sourceLine,
      stackCaller.lineNumber,
      // Column number
      null,
      // Flags: Just a log message.
      scriptError.infoFlag,
      // Category
      // @note The browser console displays, but the web console does not.
      'chrome javascript'
    );

    Services.console.logMessage(scriptError);

    return output;
  }

  return {
    log: logMessage
  };
})();

// Log to console for debug just in this script.
function log(logData) {
  return Console.log(logData, Components.stack.caller);
}

/**
 * Event manager.
 */
const EventManager = (function() {
  /**
   * Register an event listener that lives until the browser window closed.
   */
  function listenEvent(target, type, listener, options = {}) {
    if (!target || !type || !listener) {
      throw Error('Missing required parameter.');
    }

    let {capture} = options;

    capture = !!capture;

    target.addEventListener(type, listener, capture);

    listenShutdown(() => {
      target.removeEventListener(type, listener, capture);
    });
  }

  /**
   * Register an event listener that lives until once listened.
   */
  function listenEventOnce(target, type, listener, options = {}) {
    if (!target || !type || !listener) {
      throw Error('Missing required parameter.');
    }

    let {capture} = options;

    capture = !!capture;

    let onReceive = (event) => {
      target.removeEventListener(type, onReceive, capture);
      listener(event);
    };

    target.addEventListener(type, onReceive, capture);
  }

  /**
   * Reserves the execution of given handler when the window is shut down.
   */
  function listenShutdown(handler) {
    window.addEventListener('unload', function onUnload() {
      window.removeEventListener('unload', onUnload);

      handler();
    });
  }

  return {
    listenEvent,
    listenEventOnce,
    listenShutdown
  };
})();

/**
 * Alias names for event listeners.
 */
const Listeners = (function() {
  return {
    $event: EventManager.listenEvent,
    $eventOnce: EventManager.listenEventOnce,
    $shutdown: EventManager.listenShutdown
  };
})();

/**
 * Functions for DOM handling.
 */
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
 * Gets a selected text under the cursor.
 *
 * @param aOption {hash}
 *   @key event {MouseEvent}
 *   @key charLen {integer}
 * @return {string}
 *
 * TODO: |event.rangeOffset| sometimes returns a wrong value (e.g. it returns
 * the same value as if at the first row when a cursor is on the lines below
 * the first row in a <textarea>).
 * WORKAROUND: Rescan ranges with the client coordinates instead of the range
 * offset.
 */
function getSelectionAtCursor(aOption = {}) {
  const kMaxCharLen = 150;

  let {
    event,
    charLen
  } = aOption;

  let node, rangeParent, rangeOffset;

  if (event) {
    // Event mode.
    node = event.target;
    rangeParent = event.rangeParent;
    rangeOffset = event.rangeOffset; // TODO: May be wrong value.
  }
  else if (window.gContextMenu) {
    // Contextmenu mode.
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

  // Scan ranges with the range offset.
  for (let i = 0, l = selection.rangeCount, range; i < l; i++) {
    range = selection.getRangeAt(i);

    if (range.isPointInRange(rangeParent, rangeOffset)) {
      text = getTextInRange(range);
      break;
    }
  }
  // WORKAROUND: |event.rangeOffset| may be wrong when |text| is empty in the
  // event mode. So, rescan the ranges with the client coordinates.
  if (event && !text) {
    let {clientX: x, clientY: y} = event;
    let rect;

    for (let i = 0, l = selection.rangeCount, range; i < l; i++) {
      range = selection.getRangeAt(i);
      rect = range.getBoundingClientRect();

      if (rect.left <= x && x <= rect.right &&
          rect.top <= y && y <= rect.bottom) {
        text = getTextInRange(range);
        break;
      }
    }
  }

  // Use only the first important chars.
  text = trimText(text, Math.min(charLen || kMaxCharLen, kMaxCharLen));

  return text;
}

function getSelectionController(aNode) {
  if (!aNode) {
    return null;
  }

  // 1. Scan selection in a textbox (excluding password).
  if ((aNode instanceof HTMLInputElement && aNode.mozIsTextField(true)) ||
      aNode instanceof HTMLTextAreaElement) {
    try {
      return aNode.QueryInterface(Ci.nsIDOMNSEditableElement).
        editor.selection;
    }
    catch (ex) {}

    return null;
  }

  // 2. Get a window selection.
  let win = aNode.ownerDocument.defaultView || getFocusedWindow();

  return win.getSelection();
}

function getTextInRange(aRange) {
  if (!aRange.toString()) {
    return '';
  }

  let encoder =
    Modules.$I('@mozilla.org/layout/documentEncoder;1?type=text/plain',
    'nsIDocumentEncoder');

  encoder.init(
    aRange.startContainer.ownerDocument,
    'text/plain',
    encoder.OutputLFLineBreak | encoder.SkipInvisibleContent
  );

  encoder.setRange(aRange);

  return encoder.encodeToString();
}

function trimText(aText, aMaxLength) {
  if (!aText) {
    return '';
  }

  if (aText.length > aMaxLength) {
    // Only use the first charlen important chars.
    // @see https://bugzilla.mozilla.org/show_bug.cgi?id=221361
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
 * Creates an element with the attributes.
 *
 * @param aTagOrNode {string|Element}
 *   {string}: Set a <tagname>.
 *   {Element}: Set an existing <element> for handling its attributes.
 * @param aAttribute {hash} [optional]
 *   Set list of '<attribute-name>: <attribute-value>'
 *   @note An attribute isn't set if the value is |undefined| or |null| or an
 *   empty string. In adding an existing attribute will be removed if the value
 *   is |null|.
 * @param aAttributeHandler {function} [optional]
 *   A function for a custom handling of attributes.
 *   @note Can handle all values including such as |undefined| and |null|.
 *   @param aNode {Element}
 *   @param aName {string}
 *   @param aValue {string}
 *   @return {boolean}
 *     true if an attribute is processed, false otherwise.
 * @return {Element}
 *   An created or processed element.
 *
 * @note Use only for XUL element.
 *
 * TODO: Manage the namespace of attribute.
 */
function createNode(aTagOrNode, aAttribute, aAttributeHandler) {
  let node;

  if (typeof aTagOrNode === 'string') {
    let [ns, tag] = aTagOrNode.split(':');

    if (ns && tag) {
      let nsURI = lookupNamespaceURI(ns);

      if (!nsURI) {
        throw Error('Invalid namespace prefix: ' + ns);
      }

      node = window.document.createElementNS(nsURI, tag);
    }
    else {
      node = window.document.createElement(aTagOrNode);
    }
  }
  else {
    node = aTagOrNode;
  }

  if (!!aAttribute) {
    for (let name in aAttribute) {
      let value = aAttribute[name];

      if (aAttributeHandler &&
          aAttributeHandler(node, name, value)) {
        continue;
      }

      if (value === undefined || value === '') {
        continue;
      }

      if (value === null) {
        if (node.hasAttribute(name)) {
          node.removeAttribute(name, value);
        }
      }
      else {
        if (!node.hasAttribute(name) ||
            node.getAttribute(name) !== value + '') {
          node.setAttribute(name, value);
        }
      }
    }
  }

  return node;
}

/**
 * Wrapper of |getElementById|.
 *
 * @note Use only for XUL element.
 */
function getNodeById(aId) {
  return window.document.getElementById(aId);
}

/**
 * Wrapper of |getAnonymousElementByAttribute|.
 *
 * @note Use only for XUL element.
 */
function getNodeByAnonid(aId, aContext) {
  return window.document.
    getAnonymousElementByAttribute(aContext, 'anonid', aId);
}

/**
 * Gets the focused window.
 *
 * @return {Window}
 *
 * @note Returns a (top or frame) content window when the current window is the
 * browser window.
 */
function getFocusedWindow() {
  let {focusedWindow} = Services.focus;

  if (window.document.documentElement.getAttribute('windowtype') ===
      'navigator:browser') {
    if (!focusedWindow || focusedWindow === window) {
      return window.content;
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

function getNodesByXPath(aXPath, aContext, aOption = {}) {
  let {
    ordered,
    toArray
  } = aOption;

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
 * Functions for Tab / Window.
 */
function checkSecurity(aURL, aOption = {}) {
  let {
    trustURL,
    allowImageData
  } = aOption;

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
  // Special characters for URL.
  // @see http://tools.ietf.org/html/rfc3986#section-2
  const kURLChars = {
    "21":"!", "23":"#", "24":"$", "25":"%", "26":"&",
    "27":"'", "28":"(", "29":")", "2a":"*", "2b":"+",
    "2c":",", "2d":"-", "2e":".", "2f":"/", "3a":":",
    "3b":";", "3d":"=", "3f":"?", "40":"@", "5b":"[",
    "5d":"]", "5f":"_", "7e":"~"
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

  return Modules.TextToSubURI.unEscapeURIForUI(charset, aURL);
}

function resolveURL(aURL, aBaseURL) {
  if (!aURL || !/\S/.test(aURL)) {
    return null;
  }

  if (/^(?:https?|ftp):/.test(aURL)) {
    return aURL;
  }

  let baseURL = aBaseURL || getFocusedDocument().documentURI;

  try {
    const {makeURI} = Modules.BrowserUtils;

    return makeURI(url, null, makeURI(baseURL)).spec
  }
  catch (ex) {}

  return null;
}

function openHomePages(aOption = {}) {
  let {
    doReplace,
    onlyFirstPage
  } = aOption;

  // @see chrome://browser/content/browser.js::gHomeButton
  let homePages = window.gHomeButton.getHomePage().split('|');

  if (onlyFirstPage) {
    homePages = homePages[0];
  }

  openTabs(homePages, {
    doReplace,
    skipSecurityCheck: true
  });
}

function openTabs(aURLs, aOption = {}) {
  if (typeof aURLs === 'string') {
    aURLs = aURLs.split('|');
  }

  if (!Array.isArray(aURLs) || aURLs.length === 0) {
    return;
  }

  let {
    inBackground,
    doReplace
  } = aOption;

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

function openURL(aURL, aOption = {}) {
  let {
    inTab
  } = aOption;

  if (inTab) {
    return openTab(aURL, aOption);
  }

  return loadPage(aURL, aOption);
}

function openTab(aURL, aOption = {}) {
  let URL = resolveURL(aURL);

  if (!URL) {
    return;
  }

  let {
    inBackground,
    skipSecurityCheck,
    trustURL,
    allowImageData
  } = aOption;

  if (!skipSecurityCheck) {
    checkSecurity(URL, {
      trustURL,
      allowImageData
    });
  }

  // @note Set |inBackground| to explicit |false| to open in a foreground tab.
  // Since it will default to the |browser.tabs.loadInBackground| preference in
  // |gBrowser.loadOneTab| if |undefined|.
  aOption.inBackground = inBackground === true;

  return gBrowser.loadOneTab(URL, aOption);
}

function loadPage(aURL, aOption = {}) {
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
    allowMixedContent,
    skipSecurityCheck,
    trustURL,
    allowImageData
  } = aOption;

  if (!skipSecurityCheck) {
    checkSecurity(URL, {
      trustURL,
      allowImageData
    });
  }

  let flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE;

  if (allowThirdPartyFixup) {
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP;
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_FIXUP_SCHEME_TYPOS;
  }

  if (fromExternal) {
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_FROM_EXTERNAL;
  }

  if (allowMixedContent) {
    flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_MIXED_CONTENT;
  }

  gBrowser.loadURIWithFlags(URL, flags, referrerURI, charset, postData);

  return gBrowser.selectedTab;
}

/**
 * Alternative |gBrowser.removeTab|.
 *
 * @see chrome://browser/content/tabbrowser.xml::removeTab
 */
function removeTab(aTab, aOption = {}) {
  let {
    safeClose
  } = aOption;

  if (safeClose) {
    // Do not close:
    // - Pinned tab.
    // - Only one unpinned tab.
    if (aTab.pinned ||
        gBrowser.visibleTabs.length - gBrowser._numPinnedTabs <= 1) {
      return;
    }
  }

  gBrowser.removeTab(aTab);
}

/**
 * Alternative |gBrowser.removeAllTabsBut|.
 *
 * - Does not warn against closing multiple tabs.
 * - Does not close blocked tabs.
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
      removeTab(tab, {safeClose: true});
    }
  }
}

/**
 * Miscellaneous functions.
 */
function restartFx(aOption = {}) {
  let {
    purgeCaches
  } = aOption;

  // @see chrome://global/content/globalOverlay.js::canQuitApplication
  if (!window.canQuitApplication('restart')) {
    return;
  }

  if (purgeCaches) {
    Services.appinfo.invalidateCachesOnRestart();
  }

  // WORKAROUND: In Fx30, the browser cannot often restart on resume startup,
  // so set the preference to force to restore the session.
  Modules.Prefs.set('browser.sessionstore.resume_session_once', true);

  Modules.BrowserUtils.restartApplication();
}

function setGlobalStyleSheet(aCSS, aType) {
  return registerGlobalStyleSheet(aCSS, aType);
}

function removeGlobalStyleSheet(aCSS, aType) {
  return registerGlobalStyleSheet(aCSS, aType, {remove: true});
}

function registerGlobalStyleSheet(aCSS, aType, aOption = {}) {
  let {
    remove
  } = aOption;

  let css = normalizeCSS(aCSS);

  if (!css) {
    return;
  }

  let URI;

  try {
    let dataURL = 'data:text/css,' + encodeURIComponent(css);

    URI = Modules.BrowserUtils.makeURI(dataURL);
  }
  catch (ex) {
    return;
  }

  const styleSheetService = Modules.StyleSheetService;

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

function setChromeStyleSheet(aCSS) {
  let css = normalizeCSS(aCSS);

  if (!css) {
    return;
  }

  let doc = window.document;

  let dataURI = 'data:text/css,' + encodeURIComponent(css);

  if ([...doc.styleSheets].some((sheet) => sheet.href === dataURI)) {
    return;
  }

  let newStyleSheet = doc.createProcessingInstruction(
    'xml-stylesheet',
    `type="text/css" href="${dataURI}"`
  );

  return doc.insertBefore(newStyleSheet, doc.documentElement);
}

function setContentStyleSheet(aCSS, aOption = {}) {
  let {
    document,
    id
  } = aOption;

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
  // @note You should put a 'half-width space' for the separator of:
  // - The descendant selector (e.g. h1 em{...}).
  // - The shorthand properties (e.g. margin:1px 2px;).

  return aCSS.trim().
    // Put half-width spaces into one (maybe a necessary separator).
    replace(/ +/g, ' ').
    // Remove consecutive white spaces.
    replace(/\s{2,}/g, '').
    // Remove comments.
    replace(/\s*\/\*.*?\*\/\s*/g, '');
}

/**
 * Query the Places database asynchronously.
 *
 * @param aParam {hash}
 *   sql: {string}
 *     A SQL statement to execute.
 *   params: {hash} [optional]
 *     The binding parameters.
 *   columns: {array}
 *     The column names.
 * @return {Promise}
 *   onResolve: {hash[]|null}
 *     Resolved with an array of name-value hashes whose names are associated
 *     with |columns|, or null if no result.
 *   onReject: {Error}
 *     Rejected with an error object.
 *
 * TODO: Handle cancelling by user.
 */
function promisePlacesDBResult(aParam = {}) {
  const {
    sql,
    params,
    columns
  } = aParam;

  return Task.spawn(function*() {
    // Get a readonly connection to the Places database.
    let dbConnection = yield Modules.PlacesUtils.promiseDBConnection();

    let rows = yield dbConnection.executeCached(sql, params);

    let result = [];

    for (let row of rows) {
      let values = {};

      columns.forEach((aName) => {
        values[aName] = row.getResultByName(aName);
      });

      result.push(values);
    }

    if (!result.length) {
      return null;
    }

    return result;
  });
}

/**
 * Export
 */
return {
  Modules,
  Console,
  EventManager,
  Listeners,

  getSelectionAtCursor,
  getTextInRange,
  createNode,
  getNodeById,
  getNodeByAnonid,
  getFirstNodeBySelector,
  getNodesBySelector,
  getFirstNodeByXPath,
  getNodesByXPath,

  unescapeURLCharacters,
  unescapeURLForUI,
  resolveURL,
  openHomePages,
  openTabs,
  openURL,
  openTab,
  loadPage,
  removeTab,
  removeAllTabsBut,

  restartFx,
  setGlobalStyleSheet,
  removeGlobalStyleSheet,
  setChromeStyleSheet,
  setContentStyleSheet,
  promisePlacesDBResult
}


})(this);
