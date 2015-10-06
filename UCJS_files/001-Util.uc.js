// ==UserScript==
// @name Util.uc.js
// @description The common utility functions for user scripts.
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
 * Browser window checker.
 *
 * @note Used for filtering functions that are available to a browser window
 * only.
 */
function isBrowserWindow() {
  return window.location.href === 'chrome://browser/content/browser.xul';
}

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
    if (/^(?:gre)?\/modules\/.+\.jsm$|^services\-.+\.js$/.test(moduleURL)) {
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
 * Script source texts for importing into the content frame script.
 */
const ContentScripts = (function() {
  // Available to a browser window only.
  if (!isBrowserWindow()) {
    return null;
  }

  /**
   * @note Attentions to the content frame script:
   * - Don't repeat the injection names of modules.
   * - Can't use the chrome code.
   */

  /**
   * The global scoped utilities in the content frame.
   */
  const GlobalUtils = `
    const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

    const Modules = {
      require: (url) => Cu.import('resource://' + url, {}),
      $S: (CID, IID) => Cc[CID].getService(Ci[IID]),
      $I: (CID, IID) => Cc[CID].createInstance(Ci[IID])
    };

    Cu.import('resource://gre/modules/Services.jsm');
    Cu.import('resource://gre/modules/XPCOMUtils.jsm');
  `;

  /**
   * Alias names for event/message listeners.
   */
  const Listeners = `
    const Listeners = (function() {
      ${content_listenShutdown.toString()}

      return {
        $event: ${content_listenEvent.toString()},
        $eventOnce: ${content_listenEventOnce.toString()},
        $message: ${content_listenMessage.toString()},
        $messageOnce: ${content_listenMessageOnce.toString()}
      };
    })();
  `;

  /**
   * DOM utilities.
   */
  const DOMUtils = `
    const DOMUtils = (function() {
      ${content_querySelector.toString()}
      ${content_evaluateXPath.toString()}
      ${content_getFrameContentOffset.toString()}
      ${content_resolveURL.toString()}

      return {
        $ID: ${content_getElementById.toString()},
        $S1: ${content_getFirstNodeBySelector.toString()},
        $S: ${content_getLiveNodesBySelector.toString()},
        $SS: ${content_getStaticNodesBySelector.toString()},
        $X1: ${content_getFirstNodeByXPath.toString()},
        $X: ${content_getNodesByXPath.toString()},
        getElementFromPoint: ${content_getElementFromPoint.toString()},
        getLinkHref: ${content_getLinkHref.toString()}
      };
    })();
  `;

  /**
   * CSS utilities.
   */
  const CSSUtils = `
    const CSSUtils = {
      injectStyleSheet: ${content_injectStyleSheet.toString()}
    };
  `;

  /**
   * Register an event listener that observes on the global scope and lives
   * until the content process is shut down.
   */
  function content_listenEvent(type, listener, capture) {
    capture = !!capture;

    addEventListener(type, listener, capture);

    content_listenShutdown(() => {
      removeEventListener(type, listener, capture);
    });
  }

  /**
   * Register an event listener that observes on the global scope and lives
   * until once listened.
   */
  function content_listenEventOnce(type, listener, capture) {
    capture = !!capture;

    let onReceive = (event) => {
      removeEventListener(type, onReceive, capture);
      listener(event);
    };

    addEventListener(type, onReceive, capture);
  }

  /**
   * Register a message listener that observes on the global scope and lives
   * until the content process is shut down.
   */
  function content_listenMessage(name, listener) {
    addMessageListener(name, listener);

    content_listenShutdown(() => {
      removeMessageListener(name, listener);
    });
  }

  /**
   * Register a message listener that observes on the global scope and lives
   * until once listened.
   */
  function content_listenMessageOnce(name, listener) {
    let onReceive = (message) => {
      removeMessageListener(name, onReceive);
      listener(message);
    };

    addMessageListener(name, onReceive);
  }

  /**
   * Reserves the execution of given handler when the content process is shut
   * down.
   *
   * @note The 'unload' event on the global scope occurs when the frame script
   * environment is shut down, not when the content document unloads.
   * @see https://developer.mozilla.org/en/Firefox/Multiprocess_Firefox/Frame_script_environment#Events
   */
  function content_listenShutdown(handler) {
    addEventListener('unload', function onUnload() {
      removeEventListener('unload', onUnload);

      handler();
    });
  }

  function content_getElementById(id) {
    return content.document.getElementById(id);
  }

  function content_getFirstNodeBySelector(selector, context) {
    if (!context) {
      context = content.document;
    }

    return content_querySelector(selector, context);
  }

  function content_getStaticNodesBySelector(selector, context) {
    if (!context) {
      context = content.document;
    }

    // @return {static NodeList}
    return context.querySelectorAll(selector);
  }

  function content_getLiveNodesBySelector(selector, context) {
    if (!context) {
      context = content.document;
    }

    // Converts a static NodeList to a live NodeList.
    return [...context.querySelectorAll(selector)];
  }

  function content_getFirstNodeByXPath(xpath, context) {
    let type = content.XPathResult.FIRST_ORDERED_NODE_TYPE;

    let result = content_evaluateXPath(xpath, context, type);

    return result ? result.singleNodeValue : null;
  }

  function content_getNodesByXPath(xpath, context, options = {}) {
    let {
      ordered,
      toArray
    } = options;

    let type = ordered ?
      content.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE :
      content.XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE;

    let result = evaluateXPath(xpath, context, type);

    if (!toArray) {
      return result;
    }

    let nodes = Array(result ? result.snapshotLength : 0);

    for (let i = 0, l = nodes.length; i < l; i++) {
      nodes[i] = result.snapshotItem(i);
    }

    return nodes;
  }

  /**
   * Like document.querySelector but can go into frames too.
   *
   * ".container iframe |> .sub-container div" will first try to find the node
   * matched by ".container iframe" in the root document, then try to get the
   * content document inside it, and then try to match ".sub-container div" in
   * side this document.
   *
   * The original code:
   * @see resource:///modules/devtools/shared/frame-script-utils.js
   */
  function content_querySelector(selector, root = content.document) {
   const kSeparator = '|>';

   let frameIndex = selector.indexOf(kSeparator);

   if (frameIndex === -1) {
     return root.querySelector(selector);
   }
   else {
     let rootSelector = selector.substr(0, frameIndex);
     let childSelector = selector.substr(frameIndex + kSeparator.length);

     root = root.querySelector(rootSelector);

     if (!root || !root.contentWindow) {
       return null;
     }

     return content_querySelector(childSelector, root.contentWindow.document);
   }
  }

  function content_evaluateXPath(xpath, context, type) {
    function lookupNamespaceURI(prefix) {
      const kNS = {
        xul: 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
        html: 'http://www.w3.org/1999/xhtml',
        xhtml: 'http://www.w3.org/1999/xhtml',
        xlink: 'http://www.w3.org/1999/xlink'
      };

      return kNS[prefix] || null;
    }

    let doc, root;

    if (context instanceof content.Document) {
      doc = context;
      root = doc.documentElement;
    }
    else {
      doc = context ? context.ownerDocument : content.document;
      root = context || doc.documentElement;
    }

    try {
      return doc.evaluate(xpath, root, lookupNamespaceURI, type, null);
    }
    catch (ex) {}

    return null;
  }

  /**
   * Find an element from the given coordinates. This method descends through
   * frames.
   *
   * The original code:
   * @see resource:///modules/devtools/shared/layout/utils.js
   */
  function content_getElementFromPoint(x, y, root = content.document) {
    let node = root.elementFromPoint(x, y);

    if (node && node.contentDocument) {
      let rect = node.getBoundingClientRect();

      let [offsetTop, offsetLeft] = content_getFrameContentOffset(node);

      x -= rect.left + offsetLeft;
      y -= rect.top + offsetTop;

      if (x < 0 || y < 0) {
        return node;
      }

      let subnode = content_getElementFromPoint(x, y, node.contentDocument);

      if (subnode) {
        node = subnode;
      }
    }

    return node;
  }

  function content_getFrameContentOffset(frame) {
    let style = frame.contentWindow.getComputedStyle(frame, null);

    if (!style) {
      return [0, 0];
    }

    let parseInteger = (value) => parseInt(style.getPropertyValue(value), 10);

    let paddingTop = parseInteger('padding-top');
    let paddingLeft = parseInteger('padding-left');
    let borderTop = parseInteger('border-top-width');
    let borderLeft = parseInteger('border-left-width');

    return [borderTop + paddingTop, borderLeft + paddingLeft];
  }

  function content_getLinkHref(node) {
    const XLinkNS = 'http://www.w3.org/1999/xlink';

    if (node.nodeType !== content.Node.ELEMENT_NODE) {
      return null;
    }

    if (node instanceof Ci.nsIDOMHTMLAnchorElement ||
        node instanceof Ci.nsIDOMHTMLAreaElement ||
        node instanceof Ci.nsIDOMHTMLLinkElement) {
      return node.href;
    }

    if (node.getAttributeNS(XLinkNS, 'type') === 'simple') {
      let href = node.getAttributeNS(XLinkNS, 'href');

      return content_resolveURL(href, node.baseURI);
    }

    if (node instanceof content.SVGAElement && node.href) {
      return content_resolveURL(node.href.baseVal, node.baseURI);
    }

    return null;
  }

  function content_resolveURL(url, baseURL) {
    const {BrowserUtils} = Modules.require('gre/modules/BrowserUtils.jsm');
    const {makeURI} = BrowserUtils;

    if (!url || !/\S/.test(url)) {
      return null;
    }

    try {
      return makeURI(url, null, makeURI(baseURL)).spec;
    }
    catch (ex) {}

    return null;
  }

  function content_injectStyleSheet(css, options = {}) {
    let {id} = options;

    // @see |CSSUtils.minifyCSS|
    css = css.trim().
      replace(/\/\*[^\*]*?\*\//gm, '').
      replace(/ +/g, ' ').
      replace(/\s{2,}/g, '');

    if (!css) {
      return;
    }

    let document = content.document;

    if (!document.head) {
      return;
    }

    if (id) {
      let old = document.getElementById(id);

      if (old) {
        if (old.textContent !== css) {
          old.textContent = css;
        }

        return;
      }
    }

    let style = document.createElement('style');

    style.type = 'text/css';

    if (id) {
      style.id = id;
    }

    style.textContent = css;

    return document.head.appendChild(style);
  }

  return {
    GlobalUtils,
    Listeners,
    DOMUtils,
    CSSUtils
  };
})();

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
 * DOM utilities.
 */
const DOMUtils = (function() {
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
   * Creates an element with the attributes.
   *
   * @param tagOrNode {string|Element}
   *   {string}: An element tag name.
   *   {Element}: An existing <element> for handling its attributes.
   * @param attributes {hash} [optional]
   *   The list of '<attribute-name>: <attribute-value>'
   *   @note About falsy value:
   *   - An attribute cannot be set if the value is |undefined|, |null| or
   *     an empty string.
   *   - An existing attribute will be removed if the value is |null|.
   * @param attributeHandler {function} [optional]
   *   A function for custom processing of attributes.
   *   @see |initCreateElement|.
   *   @param node {Element}
   *     An element node that is referenced.
   *   @param name {string}
   *   @param value {string}
   *     @note Can handle all values including falsy values such as |undefined|
   *     and |null|.
   *   @return {boolean}
   *     true if an attribute is processed, false otherwise.
   * @return {Element}
   *   The element that is created or processed with its attributes.
   *
   * TODO: Manage the namespace of attribute.
   */
  function createElement(tagOrNode, attributes, attributeHandler) {
    let node;

    if (typeof tagOrNode === 'string') {
      let [ns, tag] = tagOrNode.split(':');

      if (ns && tag) {
        let nsURI = lookupNamespaceURI(ns);

        if (!nsURI) {
          throw Error('Invalid namespace prefix: ' + ns);
        }

        node = window.document.createElementNS(nsURI, tag);
      }
      else {
        node = window.document.createElement(tagOrNode);
      }
    }
    else {
      node = tagOrNode;
    }

    if (!!attributes) {
      for (let name in attributes) {
        let value = attributes[name];

        if (attributeHandler &&
            attributeHandler(node, name, value)) {
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
   * Make a |createElement| with the given attribute handler.
   */
  function initCreateElement(attributeHandler) {
    return (tagOrNode, attributes) =>
      createElement(tagOrNode, attributes, attributeHandler);
  }

  function getNodeById(id) {
    return window.document.getElementById(id);
  }

  function getNodeByAnonid(anonid, context) {
    return window.document.
      getAnonymousElementByAttribute(context, 'anonid', anonid);
  }

  function getFirstNodeBySelector(selector, context) {
    if (!context) {
      context = window.document;
    }

    return context.querySelector(selector);
  }

  function getStaticNodesBySelector(selector, context) {
    if (!context) {
      context = window.document;
    }

    // @return {static NodeList}
    return context.querySelectorAll(selector);
  }

  function getLiveNodesBySelector(selector, context) {
    if (!context) {
      context = window.document;
    }

    // Converts a static NodeList to a live NodeList.
    return [...context.querySelectorAll(selector)];
  }

  function getFirstNodeByXPath(xpath, context) {
    let type = XPathResult.FIRST_ORDERED_NODE_TYPE;

    let result = evaluateXPath(xpath, context, type);

    return result ? result.singleNodeValue : null;
  }

  function getNodesByXPath(xpath, context, options = {}) {
    let {
      ordered,
      toArray
    } = options;

    let type = ordered ?
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE :
      XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE;

    let result = evaluateXPath(xpath, context, type);

    if (!toArray) {
      return result;
    }

    let nodes = Array(result ? result.snapshotLength : 0);

    for (let i = 0, l = nodes.length; i < l; i++) {
      nodes[i] = result.snapshotItem(i);
    }

    return nodes;
  }

  function evaluateXPath(xpath, context, type) {
    let doc, base;

    if (context instanceof Document) {
      doc  = context;
      base = doc.documentElement;
    }
    else {
      doc  = context ? context.ownerDocument : window.document;
      base = context || doc.documentElement;
    }

    let resolver;
    let defaultNS;

    try {
      defaultNS = base.lookupNamespaceURI(null);
    }
    catch (ex) {}

    if (defaultNS) {
      let tmpPrefix = '__NS__';

      xpath = fixNamespacePrefixForXPath(xpath, tmpPrefix);

      resolver = (prefix) => (prefix === tmpPrefix) ? defaultNS :
        lookupNamespaceURI(prefix);
    }
    else {
      resolver = (prefix) => lookupNamespaceURI(prefix);
    }

    try {
      return doc.evaluate(xpath, base, resolver, type, null);
    }
    catch (ex) {}

    return null;
  }

  /**
   * @see http://nanto.asablo.jp/blog/2008/12/11/4003371
   */
  function fixNamespacePrefixForXPath(xpath, prefix) {
    const kTokenPattern = /([A-Za-z_\u00c0-\ufffd][\w\-.\u00b7-\ufffd]*|\*)\s*(::?|\()?|(".*?"|'.*?'|\d+(?:\.\d*)?|\.(?:\.|\d+)?|[\)\]])|(\/\/?|!=|[<>]=?|[\(\[|,=+-])|([@$])/g;

    const TERM = 1, OPERATOR = 2, MODIFIER = 3;
    let tokenType = OPERATOR;

    prefix += ':';

    function replacer(token, identifier, suffix, term, operator, modifier) {
      if (suffix) {
        tokenType =
          (suffix === ':' || (suffix === '::' &&
           (identifier === 'attribute' || identifier === 'namespace'))) ?
          MODIFIER : OPERATOR;
      }
      else if (identifier) {
        if (tokenType === OPERATOR && identifier !== '*') {
          token = prefix + token;
        }
        tokenType = (tokenType === TERM) ? OPERATOR : TERM;
      }
      else {
        tokenType = term ? TERM : (operator ? OPERATOR : MODIFIER);
      }

      return token;
    }

    return xpath.replace(kTokenPattern, replacer);
  }

  return {
    $E: createElement,
    init$E: initCreateElement,
    $ID: getNodeById,
    $ANONID: getNodeByAnonid,
    $S1: getFirstNodeBySelector,
    $S: getLiveNodesBySelector,
    $SS: getStaticNodesBySelector,
    $X1: getFirstNodeByXPath,
    $X: getNodesByXPath,
  };
})();

/**
 * URL utilities.
 */
const URLUtils = (function() {
  // Available to a browser window only.
  if (!isBrowserWindow()) {
    return null;
  }

  function unescapeURLCharacters(url) {
    // Special characters for URL.
    // @see http://tools.ietf.org/html/rfc3986#section-2
    const kURLChars = {
      "21":"!", "23":"#", "24":"$", "25":"%", "26":"&",
      "27":"'", "28":"(", "29":")", "2a":"*", "2b":"+",
      "2c":",", "2d":"-", "2e":".", "2f":"/", "3a":":",
      "3b":";", "3d":"=", "3f":"?", "40":"@", "5b":"[",
      "5d":"]", "5f":"_", "7e":"~"
    };

    if (!url) {
      return '';
    }

    for (let key in kURLChars) {
      url = url.replace(RegExp('%(?:25)?' + key, 'ig'), kURLChars[key]);
    }

    return url;
  }

  function unescapeURLForUI(url, characterSet) {
    if (!url) {
      return '';
    }

    if (!characterSet) {
      characterSet = gBrowser.selectedBrowser.characterSet || 'UTF-8';
    }

    return Modules.TextToSubURI.unEscapeURIForUI(characterSet, url);
  }

  function resolveURL(url, baseURL) {
    if (!url || !/\S/.test(url)) {
      return null;
    }

    if (/^(?:https?|ftp):/.test(url)) {
      return url;
    }

    if (!baseURL) {
      baseURL = gBrowser.currentURI.spec;
    }

    try {
      const {makeURI} = Modules.BrowserUtils;

      return makeURI(url, null, makeURI(baseURL)).spec
    }
    catch (ex) {}

    return null;
  }

  return {
    unescapeURLCharacters,
    unescapeURLForUI,
    resolveURL
  };
})();

/**
 * Tabs utilities.
 */
const TabUtils = (function() {
  // Available to a browser window only.
  if (!isBrowserWindow()) {
    return null;
  }

  function checkSecurity(url, options = {}) {
    let {
      trustURL,
      allowImageData
    } = options;

    let principal = gBrowser.contentPrincipal;

    if (!trustURL && allowImageData) {
      trustURL = /^data:image\/(?:gif|jpg|png);base64,/.test(url);
    }

    let flag = trustURL ?
      Ci.nsIScriptSecurityManager.STANDARD :
      Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL;

    Modules.BrowserUtils.urlSecurityCheck(url, principal, flag);
  }

  function openHomePages(options = {}) {
    let {
      doReplace,
      onlyFirstPage
    } = options;

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

  function openTabs(urls, options = {}) {
    if (typeof urls === 'string') {
      urls = urls.split('|');
    }

    if (!Array.isArray(urls) || urls.length === 0) {
      return;
    }

    let {
      inBackground,
      doReplace
    } = options;

    let firstTabAdded;

    if (doReplace) {
      // @see chrome://browser/content/browser.js::BrowserOpenTab
      window.BrowserOpenTab();

      removeAllTabsBut(gBrowser.selectedTab);

      firstTabAdded = loadPage(urls.shift(), options);
    }
    else {
      if (!inBackground) {
        firstTabAdded = openTab(urls.shift(), options);
      }
    }

    urls.forEach((url) => {
      openTab(url, options);
    });

    if (firstTabAdded) {
      gBrowser.selectedTab = firstTabAdded;
    }
  }

  function openURL(url, options = {}) {
    let {
      inTab
    } = options;

    if (inTab) {
      return openTab(url, options);
    }

    return loadPage(url, options);
  }

  function openTab(url, options = {}) {
    url = URLUtils.resolveURL(url);

    if (!url) {
      return;
    }

    let {
      inBackground,
      skipSecurityCheck,
      trustURL,
      allowImageData
    } = options;

    if (!skipSecurityCheck) {
      checkSecurity(url, {
        trustURL,
        allowImageData
      });
    }

    // @note Set |inBackground| to explicit |false| to open in a foreground
    // tab because if |undefined| it will default to the
    // |browser.tabs.loadInBackground| preference in |gBrowser.loadOneTab|.
    options.inBackground = inBackground === true;

    return gBrowser.loadOneTab(url, options);
  }

  function loadPage(url, options = {}) {
    url = URLUtils.resolveURL(url);

    if (!url) {
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
    } = options;

    if (!skipSecurityCheck) {
      checkSecurity(url, {
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

    gBrowser.loadURIWithFlags(url, flags, referrerURI, charset, postData);

    return gBrowser.selectedTab;
  }

  /**
   * Alternative |gBrowser.removeTab|.
   *
   * Additional features:
   * - Does not close a pinned tab.
   * - Does not close an unpinned tab when no other unpinned tabs.
   *
   * @see chrome://browser/content/tabbrowser.xml::removeTab
   */
  function removeTab(tab, options = {}) {
    let {
      safetyLock
    } = options;

    if (safetyLock) {
      let pinned = tab.pinned;
      let lastUnpinned =
        gBrowser.visibleTabs.length - gBrowser._numPinnedTabs <= 1

      if (pinned || lastUnpinned) {
        return;
      }
    }

    gBrowser.removeTab(tab);
  }

  /**
   * Alternative |gBrowser.removeAllTabsBut|.
   *
   * Additional features:
   * - Does not warn against closing multiple tabs.
   * - Does not close 'safety locked' tabs.
   *   @see |TabUtils.removeTab|
   *
   * @see chrome://browser/content/tabbrowser.xml::removeAllTabsBut
   */
  function removeAllTabsBut(tabToRemain) {
    if (tabToRemain.pinned) {
      return;
    }

    if (!tabToRemain.hidden && tabToRemain !== gBrowser.selectedTab) {
      gBrowser.selectedTab = tabToRemain;
    }

    let tabs = gBrowser.visibleTabs;

    for (let i = tabs.length - 1, tab; i >= 0; i--) {
      tab = tabs[i];

      if (tab !== tabToRemain && !tab.pinned) {
        removeTab(tab, {safetyLock: true});
      }
    }
  }

  return {
    openHomePages,
    openTabs,
    openURL,
    openTab,
    loadPage,
    removeTab,
    removeAllTabsBut
  };
})();

/**
 * CSS utilities.
 */
const CSSUtils = (function() {
  function setGlobalStyleSheet(css, type) {
    return registerGlobalStyleSheet(css, type);
  }

  function removeGlobalStyleSheet(css, type) {
    return registerGlobalStyleSheet(css, type, {
      doUnregister: true
    });
  }

  function registerGlobalStyleSheet(css, type, options = {}) {
    let {
      doUnregister
    } = options;

    css = minifyCSS(css);

    if (!css) {
      return;
    }

    let uri;

    try {
      let dataURL = 'data:text/css,' + encodeURIComponent(css);

      uri = Modules.BrowserUtils.makeURI(dataURL);
    }
    catch (ex) {
      return;
    }

    const styleSheetService = Modules.StyleSheetService;

    let typeValue;

    switch (type) {
      case 'AGENT_SHEET':
      case 'USER_SHEET':
      case 'AUTHOR_SHEET':
        typeValue = styleSheetService[type];
        break;

      default:
        throw Error('Unknown type: ' + type);
    }

    let registered = styleSheetService.sheetRegistered(uri, typeValue);

    if (!doUnregister && !registered) {
      styleSheetService.loadAndRegisterSheet(uri, typeValue);
    }
    else if (doUnregister && registered) {
      styleSheetService.unregisterSheet(uri, typeValue);
    }
  }

  function setChromeStyleSheet(css) {
    css = minifyCSS(css);

    if (!css) {
      return;
    }

    let doc = window.document;

    let dataURL = 'data:text/css,' + encodeURIComponent(css);

    if ([...doc.styleSheets].some((sheet) => sheet.href === dataURL)) {
      return;
    }

    let newStyleSheet = doc.createProcessingInstruction('xml-stylesheet',
      `type="text/css" href="${dataURL}"`);

    return doc.insertBefore(newStyleSheet, doc.documentElement);
  }

  function minifyCSS(css) {
    // @note You should put a 'half-width space' for the separator of:
    // - The descendant selector (e.g. h1 em{...}).
    // - The shorthand properties (e.g. margin:1px 2px;).

    return css.trim().
      // Remove comments.
      replace(/\/\*[^\*]*?\*\//gm, '').
      // Put half-width spaces into one (maybe a necessary separator).
      replace(/ +/g, ' ').
      // Remove consecutive white spaces.
      replace(/\s{2,}/g, '');
  }

  return {
    setGlobalStyleSheet,
    removeGlobalStyleSheet,
    setChromeStyleSheet
  };
})();

/**
 * Browser utilities.
 */
const BrowserUtils = (function() {
  // Available to a browser window only.
  if (!isBrowserWindow()) {
    return null;
  }

  function restartFx(options = {}) {
    let {
      purgeCaches
    } = options;

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
    let win = aNode.ownerDocument.defaultView;

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

  return {
    restartFx,
    getSelectionAtCursor,
    getTextInRange
  };
})();

/**
 * Places utilities.
 */
const PlacesUtils = (function() {
  /**
   * Promise for querying the Places database asynchronously.
   *
   * @param parameters {hash}
   *   sql: {string}
   *     A SQL statement to execute.
   *     @see https://wiki.mozilla.org/Places:Design_Overview#Models
   *   params: {hash} [optional]
   *     The binding parameters.
   *   columns: {array}
   *     The column names.
   * @return {Promise}
   *   resolve: {function}
   *     Resolved with an array of name-value hashes whose names are associated
   *     with |columns|, or null if no result.
   *     @param result {hash[]|null}
   *   reject: {function}
   *     Rejected with an error object.
   *     @param error {Error}
   *
   * TODO: Handle cancelling by user.
   */
  function promisePlacesDBResult(params = {}) {
    const {
      sql,
      parameters,
      columns
    } = params;

    return Task.spawn(function*() {
      // Get a readonly connection to the Places database.
      let dbConnection = yield Modules.PlacesUtils.promiseDBConnection();

      let rows = yield dbConnection.executeCached(sql, parameters);

      let result = [];

      for (let row of rows) {
        let values = {};

        columns.forEach((name) => {
          values[name] = row.getResultByName(name);
        });

        result.push(values);
      }

      if (!result.length) {
        return null;
      }

      return result;
    });
  }

  return {
    promisePlacesDBResult
  };
})();

/**
 * Export
 */
return {
  Modules,
  Console,
  EventManager,
  Listeners,
  DOMUtils,
  URLUtils,
  TabUtils,
  CSSUtils,
  BrowserUtils,
  PlacesUtils//,
};


})(this);
