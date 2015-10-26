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
   * - Write comments not to break the syntax for injecting minified code.
   *   @see |MessageManager::minifyJS|
   */

  /**
   * The global scoped utilities in the content frame.
   *
   * @note This is pre-injected for all content scripts.
   * @see |MessageManager.makeInjectionSource|
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
      ${content_fixupListener.toString()}
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
      ${content_getAreaElementFromPoint.toString()}
      ${content_isInPolygon.toString()}
      ${content_resolveURL.toString()}

      return {
        $ID: ${content_getElementById.toString()},
        $S1: ${content_getFirstNodeBySelector.toString()},
        $S: ${content_getLiveNodesBySelector.toString()},
        $SS: ${content_getStaticNodesBySelector.toString()},
        $X1: ${content_getFirstNodeByXPath.toString()},
        $X: ${content_getNodesByXPath.toString()},
        getElementFromPoint: ${content_getElementFromPoint.toString()},
        getLinkHref: ${content_getLinkHref.toString()},
        getImageSrc: ${content_getImageSrc.toString()}
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
   * Text utilities.
   */
  const TextUtils = `
    const TextUtils = {
      getTextInRange: ${content_getTextInRange.toString()}
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

      content_fixupListener(listener)(event);
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

      content_fixupListener(listener)(message);
    };

    addMessageListener(name, onReceive);
  }

  /**
   * Reserves the execution of given listener when the content process is shut
   * down.
   *
   * @note The 'unload' event on the global scope occurs when the frame script
   * environment is shut down, not when the content document unloads.
   * @see https://developer.mozilla.org/en/Firefox/Multiprocess_Firefox/Frame_script_environment#Events
   */
  function content_listenShutdown(listener) {
    addEventListener('unload', function onUnload() {
      removeEventListener('unload', onUnload);

      content_fixupListener(listener)();
    });
  }

  function content_fixupListener(listener) {
    if (typeof listener === 'function') {
      return listener;
    }

    return listener.handleEvent || listener.receiveMessage;
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
   * Find an element from the given coordinates.
   *
   * Additional features:
   * - This method descends through frames.
   *   @see resource:///modules/devtools/shared/layout/utils.js
   * - This method can find an <area> element of the image map on <img> and
   *   <object>.
   */
  function content_getElementFromPoint(x, y, root = content.document) {
    let node = root.elementFromPoint(x, y);

    // Recursively scan through sub frames.
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

    // Find an <area> element in the image map of <img> or <object>.
    // @note A found <area> element isn't present in the given point. An node
    // that has the map image actually exists.
    if (node && node.useMap) {
      let area = content_getAreaElementFromPoint(node, x, y);

      if (area) {
        // Remember the node associated to this map area.
        // TODO: Make a reliable method instead of extending a property.
        area['_ucjs_mapOwnerNode'] = node;

        node = area;
      }
    }

    return node;
  }

  function content_getFrameContentOffset(frame) {
    let style = frame.contentWindow.getComputedStyle(frame, null);

    if (!style) {
      return [0, 0];
    }

    let getInt = (value) => parseInt(style.getPropertyValue(value), 10);

    let paddingTop = getInt('padding-top');
    let paddingLeft = getInt('padding-left');
    let borderTop = getInt('border-top-width');
    let borderLeft = getInt('border-left-width');

    return [borderTop + paddingTop, borderLeft + paddingLeft];
  }

  function content_getAreaElementFromPoint(node, x, y) {
    let useMap = node.useMap;

    if (!useMap) {
      return null;
    }

    let mapName = useMap.replace('#', '');

    if (!mapName) {
      return null;
    }

    let selector = `map[name="${mapName}"], map#${mapName}`;
    let map = DOMUtils.$S1(selector, node.ownerDocument);

    if (!map) {
      return null;
    }

    let areas = map.areas;

    if (!areas || !areas.length) {
      return null;
    }

    // Make the client coordinates of <area> in the image map of the base node.
    let baseRect = node.getBoundingClientRect();

    x -= baseRect.left;
    y -= baseRect.top;

    let defaultArea = null;

    for (let i = 0, l = areas.length; i < l; i++) {
      let area = areas[i];

      if (area.shape === 'default') {
        defaultArea = area;

        continue;
      }

      let coords = area.coords;

      if (!coords) {
        continue;
      }

      coords = coords.split(',').map((value) => parseInt(value, 10));

      if (coords.some(isNaN)) {
        continue;
      }

      switch (area.shape) {
        case 'rect': {
          if (coords.length === 4) {
            let [left, top, right, bottom] = coords;

            if (left <= x && x <= right && top <= y && y <= bottom) {
              return area;
            }
          }

          break;
        }

        case 'circle': {
          if (coords.length === 3) {
            // X/Y coordinates of the circle's center, and radius.
            let [cx, cy, r] = coords;

            if (Math.pow(x - cx, 2) + Math.pow(y - cy, 2) <= r * r) {
              return area;
            }
          }

          break;
        }

        case 'poly': {
          if (content_isInPolygon(coords, x, y)) {
            return area;
          }

          break;
        }
      }
    }

    return defaultArea;
  }

  /**
   * Point inclusion in polygon test.
   *
   * @see http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
   */
  function content_isInPolygon(coords, x, y) {
    if (coords.length < 6 || coords.length % 2 === 1) {
      return false;
    }

    // Number of vertexes in the polygon.
    let nv = coords.length / 2;

    // X and Y coordinates of the polygon's vertexes.
    let vx = [], vy = [];

    coords.forEach((value, i) => {
      if (i % 2 === 0) {
        vx.push(value);
      }
      else {
        vy.push(value);
      }
    });

    let isInside = false;

    for (let i = 0, j = nv - 1; i < nv; j = i++) {
      if ((y < vy[i]) !== (y < vy[j]) &&
          x < (vx[j] - vx[i]) * (y - vy[i]) / (vy[j] - vy[i]) + vx[i]) {
        isInside = !isInside;
      }
    }

    return isInside;
  }

  function content_getLinkHref(node) {
    const XLinkNS = 'http://www.w3.org/1999/xlink';

    if (node.nodeType !== content.Node.ELEMENT_NODE) {
      return null;
    }

    if (node.localName === 'a' ||
        node.localName === 'area' ||
        node.localName === 'link') {
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

  function content_getImageSrc(node) {
    if (node.nodeType !== content.Node.ELEMENT_NODE) {
      return null;
    }

    if (node.localName === 'img' && node.src) {
      return node.src;
    }

    if (node instanceof content.SVGImageElement && node.href) {
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

  /**
   * Gets visible texts in the given range.
   */
  function content_getTextInRange(range) {
    if (!range || !range.toString()) {
      return null;
    }

    let encoder =
      Modules.$I('@mozilla.org/layout/documentEncoder;1?type=text/plain',
      'nsIDocumentEncoder');

    let context = range.startContainer.ownerDocument;
    let flags = encoder.OutputLFLineBreak | encoder.SkipInvisibleContent;

    encoder.init(context, 'text/plain', flags);
    encoder.setRange(range);

    return encoder.encodeToString();
  }

  return {
    GlobalUtils,
    Listeners,
    DOMUtils,
    CSSUtils,
    TextUtils
  };
})();

/**
 * Event manager.
 */
const EventManager = (function() {
  /**
   * Register an event listener that lives until the browser window closed.
   */
  function listenEvent(target, type, listener, capture) {
    if (!target || !type || !listener) {
      throw Error('Missing required parameter.');
    }

    capture = !!capture;

    target.addEventListener(type, listener, capture);

    listenShutdown(() => {
      target.removeEventListener(type, listener, capture);
    });
  }

  /**
   * Register an event listener that lives until once listened.
   */
  function listenEventOnce(target, type, listener, capture) {
    if (!target || !type || !listener) {
      throw Error('Missing required parameter.');
    }

    capture = !!capture;

    let onReceive = (event) => {
      target.removeEventListener(type, onReceive, capture);

      fixupListener(listener)(event);
    };

    target.addEventListener(type, onReceive, capture);
  }

  /**
   * Reserves the execution of given listener when the window is shut down.
   */
  function listenShutdown(listener) {
    let onReceive = (event) => {
      window.removeEventListener('unload', onReceive);

      fixupListener(listener)(event);
    };

    window.addEventListener('unload', onReceive);
  }

  function fixupListener(listener) {
    if (typeof listener === 'function') {
      return listener;
    }

    return listener.handleEvent;
  }

  return {
    listenEvent,
    listenEventOnce,
    listenShutdown
  };
})();

/**
 * Message manager.
 */
const MessageManager = (function() {
  // Available to a browser window only.
  if (!isBrowserWindow()) {
    return null;
  }

  /**
   * Injects a frame script in the content process.
   */
  function loadFrameScript(script) {
    let scriptData = `data:,(${makeInjectionSource(script)})();`;

    // A message manager for all browsers.
    let mm = window.messageManager;

    mm.loadFrameScript(scriptData, true);

    EventManager.listenShutdown(() => {
      mm.removeDelayedFrameScript(scriptData);
    });
  }

  function makeInjectionSource(script) {
    let source = script.toString().trim();

    // Make sure to surround an arrow function's body with curly brackets.
    source = source.replace(
      /^(\([^\)]*\)\s*=>)\s*([^\s\{][\s\S]+)$/m,
      '$1{return $2;}'
    );

    // Pre-inject usual global utilities.
    source = source.replace(
      /^(?:function\s*\*?\s*\([^\)]*\)|\([^\)]*\)\s*=>)[\s\S]*?\{/m,
      `$& ${ContentScripts.GlobalUtils}`
    );

    /** Evaluate the formatted injections of |ContentScripts|.
     *
     * [Format]
     * function() {
     *   '${ContentScripts.XXX}';
     *   '${ContentScripts.YYY}';
     *
     *   and your code...
     * }
     *
     * TODO: Don't use deprecated 'eval'.
     */
    source = source.replace(
      /^\s*["']\$\{([^\}]+)\}["'];\s*$/gm,
      ($0, $1) => eval($1)
    );

    return minifyJS(source);
  }

  /**
   * Minify a JS source code into an one-liner string.
   *
   * @note Don't append a line comment after any code in a line. That line
   * comment cannot be stripped and the generated one-liner code would break
   * syntax.
   * TODO: Strip a line comment anywhere.
   *
   * @note Be aware of the characters combination for block comment('/' + '*')
   * in a string or regexp literal. The comment-ish part would be stripped.
   * TODO: Not change the content of string and regexp literals.
   */
  function minifyJS(script) {
    /**
     * Strip unnecessary parts:
     * - Block comment: /\/\*[^\*]*?\*\//gm
     * - Line comment:  /^\s*\/\/.+$/gm
     * - Leading indentation: /^\s+/gm
     * - Line break: /\n/gm
     */
    const kStripRE = /\/\*[^\*]*?\*\/|^\s*\/\/.+$|^\s+|\n/gm;

    return script.replace(kStripRE, '');
  }

  function promiseMessage(messageName, params = {}, paramsAsCPOW = {}) {
    let requestName, responseName;

    if (typeof messageName === 'string') {
      requestName = responseName = messageName;
    }
    else {
      requestName = messageName.request;
      responseName = messageName.response;
    }

    // A message manager for the current browser.
    let mm = gBrowser.selectedBrowser.messageManager;

    return new Promise((resolve) => {
      // TODO: Make sure the response is associated with this request.
      mm.sendAsyncMessage(requestName, params, paramsAsCPOW);

      let onMessage = (message) => {
        mm.removeMessageListener(responseName, onMessage);

        resolve(message.data);
      };

      mm.addMessageListener(responseName, onMessage);
    });
  }

  /**
   * Register a message listener that observes on all tabs in a browser window
   * and lives until the window closed.
   */
  function listenMessage(name, listener) {
    if (!name || !listener) {
      throw Error('Missing required parameter.');
    }

    // A message manager for all browsers.
    let mm = window.messageManager;

    mm.addMessageListener(name, listener);

    EventManager.listenShutdown(() => {
      mm.removeMessageListener(name, listener);
    });
  }

  /**
   * Register a message listener that observes on all tabs in a browser window
   * and lives until once listened.
   */
  function listenMessageOnce(name, listener) {
    if (!name || !listener) {
      throw Error('Missing required parameter.');
    }

    // A message manager for all browsers.
    let mm = window.messageManager;

    let onReceive = (message) => {
      mm.removeMessageListener(name, onReceive);

      fixupListener(listener)(message);
    };

    mm.addMessageListener(name, onReceive);
  }

  function fixupListener(listener) {
    if (typeof listener === 'function') {
      return listener;
    }

    return listener.receiveMessage;
  }

  return {
    // Script source texts for injection into the frame script.
    ContentScripts,
    loadFrameScript,
    makeInjectionSource,
    promiseMessage,
    listenMessage,
    listenMessageOnce
  };
})();

/**
 * Page event manager.
 */
const PageEvents = (function() {
  // Available to a browser window only.
  if (!isBrowserWindow()) {
    return null;
  }

  /**
   * URL list for the document is loaded without simple notifications like
   * 'load', 'pageshow'.
   *
   * TODO: Make a generic method to determine silent changes of document.
   * @see https://developer.mozilla.org/en/Add-ons/Overlay_Extensions/XUL_School/Intercepting_Page_Loads
   *
   * Used the following case:
   * - Regard the document as being renewed though only the hash changes.
   *   @see |URLChangeObserver::getURLChangeInfo|
   * - Wait until the DOM is absolutely built.
   *   @see |promisePageReady|
   */
  const SpecialURLs = (function() {
    const kSpecialURLs = [
      /^https?:\/\/www\.google\.(?:com|co\.jp)\/.*q=/
    ];

    function test(targetURL) {
      return kSpecialURLs.some((url) => url.test(targetURL));
    }

    return {
      test
    };
  })();

  const URLChangeObserver = (function() {
    const TabProgressListener = {
      onLocationChange(webProgress, request, uri) {
        // Receive location change from top frame only.
        if (!webProgress.isTopLevel) {
          return;
        }

        let urlChangeInfo = getURLChangeInfo();

        vars.listeners.forEach((listener) => {
          listener(urlChangeInfo);
        });
      },

      onStateChange() {},
      onProgressChange() {},
      onSecurityChange() {},
      onStatusChange() {}
    };

    let vars = {
      selectedBrowser: null,
      browsersURI: new WeakMap(),
      listeners: new Set()
    };

    function init() {
      EventManager.listenEvent(gBrowser.tabContainer, 'TabClose', (event) => {
        vars.browsersURI.delete(gBrowser.getBrowserForTab(event.target));
      });

      EventManager.listenShutdown(() => {
        vars.selectedBrowser = null;
        vars.browsersURI = null;
        vars.listeners = null;

        gBrowser.removeProgressListener(TabProgressListener);
      });

      gBrowser.addProgressListener(TabProgressListener);
    }

    function getURLChangeInfo() {
      let browser = gBrowser.selectedBrowser;
      let isSameTab = browser === vars.selectedBrowser;

      let oldURI = vars.browsersURI.get(browser);
      let newURI = browser.currentURI.clone();
      let isSameURL = oldURI && oldURI.spec === newURI.spec;

      vars.selectedBrowser = browser;
      vars.browsersURI.set(browser, newURI);

      let tabSwitched = !isSameTab;
      let newDocumentLoaded;

      if (isSameTab) {
        // The new document is loaded because:
        // - It is reloaded in the same URL.
        // - It is loaded in the new URL.
        // - It is renewed in some special URL though only the hash changes.
        if (isSameURL ||
            !oldURI.equalsExceptRef(newURI) ||
            SpecialURLs.test(newURI.spec)) {
          newDocumentLoaded = true;
        }
        // The URL changes with its hash only so that the document remains
        // still.
        else {
          newDocumentLoaded = false;
        }
      }
      else {
        // The tab is switched and its URL has changed so that the new
        // document is loaded.
        if (!isSameURL) {
          newDocumentLoaded = true;
        }
        // The tab is switched but its URL has been unchanged so that the tab
        // is just selected.
        else {
          newDocumentLoaded = false;
        }
      }

      return {
        oldURI,
        newURI,
        tabSwitched,
        newDocumentLoaded
      };
    }

    function addListener(listener) {
      if (!vars.listeners.has(listener)) {
        vars.listeners.add(listener);
      }
    }

    return {
      init,
      addListener
    };
  })();

  // Initialize.
  init();

  function init() {
    URLChangeObserver.init();
    setContentScript();
  }

  function setContentScript() {
    let content_script = () => {
      '${MessageManager.ContentScripts.Listeners}';

      let doPreventDefaultClick = false;

      let handleEvent = (event) => {
        switch (event.type) {
          case 'pageshow':
          case 'pagehide': {
            // Ignore events from subframes.
            if (event.target !== content.document) {
              return;
            }

            let data = {
              persisted: event.persisted,
              readyState: content.document.readyState
            };

            sendAsyncMessage('ucjs:PageEvent:' + event.type, data);

            break;
          }

          case 'click': {
            if (event.button === 2) {
              return;
            }

            if (doPreventDefaultClick) {
              doPreventDefaultClick = false;

              event.preventDefault();
            }

            break;
          }
        }
      };

      let receiveMessage = (message) => {
        switch (message.name) {
          case 'ucjs:PageEvent:PreventDefaultClick': {
            doPreventDefaultClick = true;

            break;
          }
        }
      };

      [
        'pageshow',
        'pagehide',
        'click'
      ].
      forEach((type) => {
        Listeners.$event(type, handleEvent);
      });

      [
        'ucjs:PageEvent:PreventDefaultClick'
      ].
      forEach((name) => {
        Listeners.$message(name, receiveMessage);
      });
    };

    MessageManager.loadFrameScript(content_script);
  }

  function promisePageReady(browser) {
    return ContentTask.spawn({
      browser,
      task: function*() {
        return new Promise((resolve) => {
          let document = content.document;

          // TODO: Examine whether the document is cached or not with reliable
          // method.
          let onReady = (persisted) => {
            resolve({
              url: document.URL,
              persisted
            });
          };

          if (document.readyState === 'complete') {
            onReady(true);

            return;
          }

          if (document.readyState === 'interactive') {
            onReady(false);

            return;
          }

          let onLoad = (event) => {
            // Abort for sub frames.
            if (event.originalTarget !== document) {
              return;
            }

            document.removeEventListener('DOMContentLoaded', onLoad);

            onReady(false);
          };

          document.addEventListener('DOMContentLoaded', onLoad)
        });
      }
    }).
    then((result) => {
      return new Promise((resolve) => {
        let {url, persisted} = result;

        let onResolve = () => {
          resolve({
            persisted
          });
        };

        // WORKAROUND: Wait until the DOM is absolutely built in some URL.
        if (SpecialURLs.test(url)) {
          setTimeout(onResolve, 1000);
        }
        else {
          onResolve();
        }
      });
    });
  }

  /**
   * Register a page event listener that lives until the browser window closed.
   */
  function listenPageEvent(type, listener) {
    switch (type) {
      case 'pageshow':
      case 'pagehide': {
        // We are interested in the selected browser only.
        Listeners.$message('ucjs:PageEvent:' + type, (message) => {
          if (message.target !== gBrowser.selectedBrowser) {
            return;
          }

          let {persisted, readyState} = message.data;

          // WORKAROUND: 'pageshow' sometimes fires in a document loading
          // (e.g. on a start-up tab).
          if (type === 'pageshow' && readyState !== 'complete') {
            return;
          }

          let pseudoEvent = {
            type,
            persisted
          };

          fixupListener(listener)(pseudoEvent, message);
        });

        break;
      }

      case 'pageselect': {
        // We are interested in the selected browser only.
        Listeners.$event(gBrowser, 'TabSwitchDone', (event) => {
          ContentTask.spawn(function*() {
            return content.document.readyState;
          }).
          then((readyState) => {;
            let pseudoEvent = {
              type,
              readyState
            };

            fixupListener(listener)(pseudoEvent, event);
          }).
          catch(Cu.reportError);
        });

        break;
      }

      case 'pageurlchange': {
        let listenerWrapper = (urlChangeInfo) => {
          let {oldURI, newURI, tabSwitched, newDocumentLoaded} = urlChangeInfo;

          let pseudoEvent = {
            type,
            oldURI,
            newURI,
            tabSwitched,
            newDocumentLoaded
          };

          fixupListener(listener)(pseudoEvent);
        };

        URLChangeObserver.addListener(listenerWrapper);

        break;
      }

      case 'pageready': {
        listenPageEvent('pageurlchange', () => {
          listenPageEventOnce('pageready', listener);
        });

        break;
      }

      default: {
        throw Error('Unknown type:' + type);
      }
    }
  }

  /**
   * Register a page event listener that lives until once listened.
   */
  function listenPageEventOnce(type, listener) {
    switch (type) {
      case 'pageready': {
        let browser;

        if (listener.browser) {
          browser = listener.browser;
        }

        promisePageReady(browser).then((result) => {
          let {persisted} = result;

          let pseudoEvent = {
            type,
            persisted
          };

          fixupListener(listener)(pseudoEvent);
        }).
        catch(Cu.reportError);

        break;
      }

      default: {
        throw Error('Unknown type:' + type);
      }
    }
  }

  function fixupListener(listener) {
    if (typeof listener === 'function') {
      return listener;
    }

    return listener.handleEvent || listener.listener;
  }

  return {
    listenPageEvent,
    listenPageEventOnce
  };
})();

/**
 * Alias names for event/message/page-event listeners.
 */
const Listeners = (function() {
  return {
    $event: EventManager && EventManager.listenEvent,
    $eventOnce: EventManager && EventManager.listenEventOnce,
    $shutdown: EventManager && EventManager.listenShutdown,

    $message: MessageManager && MessageManager.listenMessage,
    $messageOnce: MessageManager && MessageManager.listenMessageOnce,

    $page: PageEvents && PageEvents.listenPageEvent,
    $pageOnce: PageEvents && PageEvents.listenPageEventOnce
  };
})();

/**
 * Content task manager.
 *
 * The original code:
 * @see http://mxr.mozilla.org/mozilla-central/source/testing/mochitest/BrowserTestUtils/ContentTask.jsm
*/
const ContentTask = (function() {
  // Available to a browser window only.
  if (!isBrowserWindow()) {
    return null;
  }

  /**
   * Promise list manager.
   */
  const PromiseList = (function() {
    let messages = new Map();
    let uniqueId = 0;

    function set(browser, deferred, task, params, paramsAsCPOW) {
      let messageId = uniqueId++;

      // Make a listener instance for the message this time.
      let listener = (message) => receiveMessage(message);

      messages.set(messageId, {
        deferred,
        listener
      });

      let data = {
        messageId,
        task: MessageManager.makeInjectionSource(task),
        params: params || {}
      };

      let objects = paramsAsCPOW || {};

      let mm = browser.messageManager;

      mm.addMessageListener('ucjs:ContentTask:response', listener);
      mm.sendAsyncMessage('ucjs:ContentTask:spawn', data, objects);
    }

    function get(browser, messageId) {
      let data = messages.get(messageId);

      // TODO: Fix many redundant messages can be received when a tab moves to
      // the other window.
      if (!data) {
        return null;
      }

      let {deferred, listener} = data;

      messages.delete(messageId);

      let mm = browser.messageManager;

      mm.removeMessageListener('ucjs:ContentTask:response', listener);

      return deferred;
    }

    return {
      set,
      get
    };
  })();

  // Initialize.
  setContentScript();

  function setContentScript() {
    let content_script = () => {
      '${MessageManager.ContentScripts.Listeners}';

      function receiveMessage(message) {
        let messageId = message.data.messageId;
        let task = message.data.task || '()=>{}';
        let params = message.data.params;
        let paramsAsCPOW = message.objects;

        let sendResponse = (data) => {
          data.messageId = messageId;

          if (data.error instanceof Error) {
            data.error = data.error.toString();

            // Log to the console.
            content.console.error(data.error);
          }

          sendAsyncMessage('ucjs:ContentTask:response', data);
        };

        try {
          let runnable = eval(`(()=>{return (${task});})();`);
          let iterator = runnable(params, paramsAsCPOW);

          Task.spawn(iterator).then(
            function resolve(result) {
              sendResponse({
                resolved: true,
                result
              });
            },
            function reject(error) {
              sendResponse({
                rejected: true,
                error
              });
            }
          ).
          catch((error) => {
            sendResponse({
              error
            });
          });
        }
        catch (error) {
          sendResponse({
            error
          });
        }
      }

      Listeners.$message('ucjs:ContentTask:spawn', receiveMessage);
    };

    MessageManager.loadFrameScript(content_script);
  }

  function receiveMessage(message) {
    let {
      messageId,
      resolved,
      result,
      rejected,
      error
    } = message.data;

    let promise = PromiseList.get(message.target, messageId);

    if (!promise) {
      return;
    }

    if (resolved) {
      promise.resolve(result);
    }
    else {
      promise.reject({
        error,
        rejected: !!rejected
      });
    }
  }

  /**
   * Creates a new task in a browser's content.
   *
   * @param data {hash|(function|string)}
   *   @note You can directly pass only task function or function string if
   *   the function does't need any parameters and runs in the selected
   *   browser.
   *   browser: {xul:browser}
   *     A browser that has the target content process.
   *     If omitted, a selected browser works.
   *   params: {hash}
   *     A serializable object that will be passed to the task.
   *   paramsAsCPOW: {hash}
   *     A unserializable object that will be passed to the task as CPOW.
   *   task: {generator|string}
   *     A generator which will be sent to the content process to be executed.
   *     @note A function object will be stringified.
   *     @note You can import utilities of |ContentTask.ContentScripts.XXX|.
   *     @see |MessageManager.makeInjectionSource|
   * @return {Promise}
   *   resolve: {function}
   *     Resolved with the serializable value of the task if it executes
   *     successfully.
   *     @param result {}
   *   reject: {function}
   *     Rejected with the error if execution fails.
   *     @param {hash}
   *       error: {string}
   *       rejected: {boolean}
   *         true if the user reject function is processed.
   */
  function spawn(data = {}) {
    let {browser, params, paramsAsCPOW, task} = data;

    if (typeof data === 'function' || typeof data === 'string') {
      task = data;
    }

    if (!browser) {
      browser = gBrowser.selectedBrowser;
    }

    // WORKAROUND: Bail out for missing browser.
    if (!browser) {
      return Promise.resolve('|browser| is missing');
    }

    const {PromiseUtils} = Modules.require('gre/modules/PromiseUtils.jsm');

    let deferred = PromiseUtils.defer();

    PromiseList.set(browser, deferred, task, params, paramsAsCPOW);

    return deferred.promise;
  }

  return {
    // Script source texts for injection into the content task function.
    ContentScripts,
    spawn
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

  function isTextDocument(browser) {
    if (!browser) {
      browser = gBrowser.selectedBrowser;
    }

    let mime = browser.documentContentType;

    return Modules.BrowserUtils.mimeTypeIsTextBased(mime);
  }

  function isHTMLDocument(browser) {
    if (!browser) {
      browser = gBrowser.selectedBrowser;
    }

    let mime = browser.documentContentType

    return (
      mime === 'text/html' ||
      mime === 'text/xml' ||
      mime === 'application/xml' ||
      mime === 'application/xhtml+xml'
    );
  }

  function getCursorPointInContent(event) {
    let x, y;

    // The main context menu opens.
    // @see chrome://browser/content/nsContextMenu.js
    if (!event && window.gContextMenu) {
      let contextMenuEvent = window.gContextMenuContentData.event;

      x = contextMenuEvent.clientX;
      y = contextMenuEvent.clientY;
    }
    else if (event) {
      x = event.screenX;
      y = event.screenY;

      let {
        screenX: left,
        screenY: top
      } = gBrowser.mPanelContainer.boxObject;

      // Convert the screen coordinates of a cursor to the client ones in the
      // content area.
      x -= left;
      y -= top;
    }

    return {x, y};
  }

  function promiseSelectionTextAtContextMenuCursor() {
    let {x, y} = getCursorPointInContent();

    return promiseSelectionTextAtPoint(x, y);
  }

  /**
   * Promise for a selection text under the cursor.
   *
   * @param x {float}
   * @param y {float}
   * @return {string}
   */
  function promiseSelectionTextAtPoint(x, y) {
    return Task.spawn(function*() {
      if (isNaN(x) || isNaN(y)) {
        return null;
      }

      return ContentTask.spawn({
        params: {x, y},
        task: `function*(params) {
          ${ContentTask.ContentScripts.DOMUtils}
          ${ContentTask.ContentScripts.TextUtils}
          ${content_getSelectionTextAtPoint.toString()}
          ${content_getSelection.toString()}
          ${content_trimText.toString()}

          let {x, y} = params;

          return content_getSelectionTextAtPoint(x, y);
        }`
      });
    });
  }

  /**
   * Gets selection text at the given coordinates.
   *
   * TODO: It seems more reliable to find a focused range by using
   * |caretPositionFromPoint| and |range.isPointInRange|. But the former is
   * unstable for editable elements.
   * @see https://developer.mozilla.org/en/docs/Web/API/Document/caretPositionFromPoint#Browser_compatibility
   * WORKAROUND: Compares the coordinates of cursor and range by using
   * |range.getBoundingClientRect|.
   */
  function content_getSelectionTextAtPoint(x, y) {
    let node = DOMUtils.getElementFromPoint(x, y);
    let selection = content_getSelection(node);

    if (!selection) {
      return null;
    }

    let focusedRange;

    for (let i = 0, l = selection.rangeCount; i < l; i++) {
      let range = selection.getRangeAt(i);
      let rect = range.getBoundingClientRect();

      if (rect.left <= x && x <= rect.right &&
          rect.top <= y && y <= rect.bottom) {
        focusedRange = range;

        break;
      }
    }

    return content_trimText(TextUtils.getTextInRange(focusedRange));
  }

  /**
   * Gets selection controller.
   */
  function content_getSelection(node) {
    if (!node) {
      return null;
    }

    // 1.Scan selection in a text box (excluding password input).
    if ((node.localName === 'input' && node.mozIsTextField(true)) ||
        node.localName === 'textarea') {
      try {
        return node.QueryInterface(Ci.nsIDOMNSEditableElement).
          editor.selection;
      }
      catch (ex) {}

      return null;
    }

    // 2. Get a window selection.
    return node.ownerDocument.defaultView.getSelection();
  }

  /**
   * Retrieves only the first important characters.
   *
   * @see resource://gre/modules/BrowserUtils.jsm::getSelectionDetails
   */
  function content_trimText(text) {
    const kMaxTextLength = 150;

    if (!text) {
      return null;
    }

    if (text.length > kMaxTextLength) {
      let match = RegExp('^(?:\\s*.){0,' + kMaxTextLength + '}').exec(text);

      if (!match) {
        return null;
      }

      text = match[0];
    }

    text = text.trim().replace(/\s+/g, ' ');

    if (text.length > kMaxTextLength) {
      text = text.substr(0, kMaxTextLength);
    }

    return text;
  }

  return {
    restartFx,
    isTextDocument,
    isHTMLDocument,
    getCursorPointInContent,
    promiseSelectionTextAtContextMenuCursor,
    promiseSelectionTextAtPoint
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
 * History utilities.
 */
const HistoryUtils = (function() {
  /**
   * Promise for the session history data of a browser.
   *
   * @param browser {xul:browser}
   *   A browser that has the session history.
   *   If omitted, retrieves the session history of a selected brower.
   * @return {Promise}
   *   resolve: {function}
   *     Resolved with a session histoy data, or null if no data.
   *     @param result {hash}
   *       index: {integer} The index of a selected entry.
   *       count: {integer} The count of entries.
   *       entries: {hash[]}
   *         title: {string}
   *         url: {string}
   *   reject: {function}
   *     Rejected with an error message string.
   *     @param error {string}
   *
   * TODO: Handle cancelling by user.
   */
  function promiseSessionHistory(browser) {
    return ContentTask.spawn({
      browser,
      task: content_task
    });

    function* content_task() {
      let sessionHistory =
        docShell.
        QueryInterface(Ci.nsIWebNavigation).
        sessionHistory;

      let {index, count} = sessionHistory;
      let entries = [];

      for (let i = 0; i < count; i++) {
        let entry = sessionHistory.getEntryAtIndex(i, false);

        entries.push({
          title: entry.title,
          url: entry.URI && entry.URI.spec
        });
      }

      if (!entries.length) {
        return null;
      }

      return {
        index,
        count,
        entries
      };
    }
  }

  return {
    promiseSessionHistory
  };
})();

/**
 * Export
 */
return {
  Modules,
  Console,
  EventManager,
  MessageManager,
  Listeners,
  ContentTask,
  DOMUtils,
  URLUtils,
  TabUtils,
  CSSUtils,
  BrowserUtils,
  PlacesUtils,
  HistoryUtils//,
};


})(this);
