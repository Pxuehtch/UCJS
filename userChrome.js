// ==UserScript==
// @name userChrome.js
// @description User-script loader for userChromeJS.
// ==/UserScript==

// @note A new property is exposed in the global scope
// (window[kSystem.loaderName]).

// @note For chrome windows that open in the main browser:
// - in sidebar:
//   - Good for bookmark panel and history panel.
//   - TODO: Test the other case.
// - in devtools pane:
//   - Only toolbox panel can be detected but blocked for now.
//   - TODO: Detect each tool.
// - in tab:
//   - Any chrome window can be detected but blocked for now.
//   - TODO: Fix errors when access to an in-content chrome window.
// - others:
//   - Bookmark edit panel(Star UI) can not be detected.
//   - TODO: Test the other case.

// @see http://userchromejs.mozdev.org/
// @see https://github.com/alice0775/userChrome.js/blob/master/userChrome.js


(function(window) {


"use strict";


/**
 * User preferences.
 */
const kPref = {
  /**
   * Script subfolders under your chrome folder.
   *
   * @note Required to register at least one subfolder.
   * @note Scripts are scanned in the descendant directories by adding '/' at
   * the end.
   */
  scriptFolders: ['UCJS_files', 'UCJS_tmp/'],

  /**
   * File extensions to determine that a script should be run as either
   * JavaScript or XUL-overlay.
   *
   * @note Tests exact match from the first dot(.) of a file name.
   */
  jscriptExts: ['.uc.js'],
  overlayExts: ['.uc.xul', '.xul'],

  /**
   * URL list of chrome XUL windows which are blocked to run scripts.
   *
   * @note Wildcard '*' is available.
   */
  blockXULs: [
    // A common dialog window.
    'chrome://global/content/commonDialog.xul',
    // Add-on: DOM Inspector window.
    'chrome://inspector/*'
  ]
};

/**
 * System preferences.
 */
const kSystem = {
  /**
   * Log the activity of this script to the browser console.
   */
  logging: false,

  /**
   * Exposed property name in the global scope |window|.
   */
  loaderName: 'ucjsScriptLoader',

  /**
   * ID of <overlay> for XUL overlayed scripts.
   */
  overlayContainerId: 'userChrome_js_overlay',

  /**
   * Check the cache of a script whenever the script runs on sub-windows.
   *
   * Set true and a script that is modified will be applied on the new opened
   * sub-windows without restart. This is useful for debug, but performance is
   * poor.
   *
   * false[default]: This loader checks the script cache only when the startup
   * browser window opens, and the cached scripts run on sub-windows
   * thereafter.
   */
  checkCacheAtRun: false
};

/**
 * Common utilities.
 */
const Util = UtilManager();

/**
 * Console logger.
 */
const Log = LogManager(kSystem.logging);

/**
 * Main function.
 */
ucjsScriptLoader_init();

function ucjsScriptLoader_init() {
  let scriptLoader = ScriptLoader();

  if (scriptLoader.init()) {
    let scriptList = scriptLoader.getScriptList();

    if (scriptList) {
      // Exposes new property in |window|.
      window[kSystem.loaderName] = {
        scriptList
      };
    }

    window.addEventListener('unload', function onUnload() {
      window.removeEventListener('unload', onUnload, false);
      scriptLoader.uninit();
    }, false);
  }
  else {
    scriptLoader.uninit();
  }
}

/**
 * ScriptLoader handler.
 *
 * @return {hash}
 *   @key init {function}
 *   @key uninit {function}
 *   @key getScriptList {function}
 */
function ScriptLoader() {
  let mScriptList;

  function uninit() {
    if (mScriptList) {
      mScriptList.uninit();
      mScriptList = null;
    }
  }

  function init() {
    const {document} = window;

    let url = document.location.href;
    let title = document.title || '[N/A]';

    if (isBlockURL(url)) {
      Log.list('Not init window', {
        'Blocked URL': url,
        'Title': title
      });

      return false;
    }

    Log.list('Init window', {
      'URL': url,
      'Title': title
    });

    mScriptList = ScriptList();
    mScriptList.init();
    mScriptList.run(document);

    if (inBrowserWindow()) {
      watchInnerWindow();
    }

    return true;
  }

  function watchInnerWindow() {
    const {document} = window;

    document.addEventListener('load', initInnerWindow, true);
    window.addEventListener('unload', function onUnload() {
      document.removeEventListener('load', initInnerWindow, true);
      window.removeEventListener('unload', onUnload, false);
    }, false);

    function initInnerWindow(aEvent) {
      let target = aEvent.originalTarget;

      if (!(target instanceof XULDocument)) {
        // WORKAROUND: Comment out too noisy logs.
        /*
        Log.list('Not init inner window', {
          'Loaded node': target.nodeName
        });
        */

        return;
      }

      let url = target.location.href;
      let container = getContainerType(target);

      if (container !== 'sidebar' || isBlockURL(url)) {
        Log.list('Not init inner window', {
          'Blocked URL': url,
          'Container': container
        });

        return;
      }

      Log.list('Init inner window', {
        'URL': url,
        'Container': container
      });

      mScriptList.run(target);
    }

    function getContainerType(aDocument) {
      const {importModule} = Util;

      const ContainerTester = {
        'sidebar': (aDocument) => {
          let container = window.SidebarUI.browser;

          return container && container.contentDocument === aDocument;
        },

        'devtool': (aDocument) => {
          // @see resource://gre/modules/commonjs/dev/utils.js
          const {getToolbox} = importModule('dev/utils');

          let toolbox = getToolbox();
          let container = toolbox && toolbox.frame;

          return container && container.contentDocument === aDocument;
        },

        'tab': (aDocument) => {
          return gBrowser.getBrowserForDocument(aDocument);
        }
      };

      for (let type in ContainerTester) {
        let inContainer = ContainerTester[type](aDocument);

        if (inContainer) {
          return type;
        }
      }

      return 'Unknown';
    }
  }

  function getScriptList() {
    if (inBrowserWindow()) {
      return mScriptList.get();
    }

    return null;
  }

  function inBrowserWindow() {
    const {getBrowserURL} = Util;

    return window.location.href === getBrowserURL();
  }

  function isBlockURL(url) {
    const {testURL} = Util;

    return !/^chrome:.+\.xul$/i.test(url) ||
           kPref.blockXULs.some((xul) => testURL(xul, url));
  }

  /**
   * Exports
   */
  return {
    init,
    uninit,
    getScriptList
  };
}

/**
 * ScriptList handler.
 *
 * @return {hash}
 *   @key init {function}
 *   @key uninit {function}
 *   @key get {function}
 *   @key run {function}
 */
function ScriptList() {
  let dataLists = {
    jscripts: new Set(),
    overlays: new Set()
  };

  function uninit() {
    let uninitDataList = (list) => {
      list.forEach((data) => data.uninit());
    };

    if (dataLists.jscripts) {
      uninitDataList(dataLists.jscripts);
      dataLists.jscripts = null;
    }

    if (dataLists.overlays) {
      uninitDataList(dataLists.overlays);
      dataLists.overlays = null;
    }
  }

  function init() {
    const {getTopBrowserWindow} = Util;

    let win = getTopBrowserWindow();
    let loader = win && win[kSystem.loaderName];

    if (loader) {
      copyDataList(loader.scriptList);

      Log.list('Copy script data from', {
        'URL': win.location.href,
        'Title': win.document.title
      });
    }
    else {
      buildDataList();
    }
  }

  function getDataList() {
    return {
      jscripts: dataLists.jscripts,
      overlays: dataLists.overlays
    };
  }

  function copyDataList(sourceDataLists) {
    // @note Reference copy.
    dataLists.jscripts = sourceDataLists.jscripts;
    dataLists.overlays = sourceDataLists.overlays;
  }

  function buildDataList() {
    const log = Log.counter('Scan');
    const {getChromeDirectory, getEntryList, getNextEntry} = Util;

    let chrome = getChromeDirectory();

    kPref.scriptFolders.forEach((folder) => {
      // 'dir1/dir2' -> match[1]='dir1/dir2', match[2]=''
      // 'dir1/dir2/' -> match[1]='dir1/dir2', match[2]='/'
      let match = /^(.+?)(\/?)$/.exec(folder);

      if (!match) {
        return;
      }

      let doScanDeeper = !!match[2];

      let directory = chrome.clone();

      let exists = match[1].split('/').every((segment) => {
        if (segment) {
          try {
            directory.append(segment);

            return directory.exists() &&
                   directory.isDirectory() &&
                   !directory.isHidden();
          }
          catch (ex) {}
        }

        return false;
      });

      if (exists) {
        scanDirectory(directory, doScanDeeper);
      }
    });

    function scanDirectory(directory, doScanDeeper) {
      let list = getEntryList(directory);
      let entry;

      while ((entry = getNextEntry(list))) {
        if (entry.isHidden()) {
          continue;
        }

        if (doScanDeeper && entry.isDirectory()) {
          // Recursively check into the descendant directory.
          scanDirectory(entry, doScanDeeper);
        }
        else if (entry.isFile()) {
          checkScriptFile(entry);
        }
      }
    }

    function checkScriptFile(file) {
      let dot = file.leafName.indexOf('.');

      if (dot > -1) {
        let ext = file.leafName.substr(dot);
        let list;

        if (kPref.jscriptExts.includes(ext)) {
          list = dataLists.jscripts;
        }
        else if (kPref.overlayExts.includes(ext)) {
          list = dataLists.overlays;
        }

        if (list) {
          let script = UserScript(file);

          list.add(script);

          log(script.getURL('IN_CHROME'));
        }
      }
    }
  }

  function runDataList(document) {
    // TODO: I want to ensure that scripts run at the end of this loader.
    setTimeout((doc) => {
      setTimeout(runJscripts, 0, doc);
      setTimeout(runOverlays, 0, doc);
    }, 0, document);
  }

  function runJscripts(document) {
    const log = Log.counter('Run JS');
    const {loadJscript} = Util;

    let url = document.location.href;

    for (let script of dataLists.jscripts) {
      if (script.testTarget(url)) {
        log(script.getURL('IN_CHROME'));

        loadJscript(script.getURL('RUN'), document);
      }
    }
  }

  function runOverlays(document) {
    const log = Log.counter('Run XUL');
    const {loadOverlay} = Util;

    const kXUL = '<?xul-overlay href="%url%"?>';
    const kDATA = [
      'data:application/vnd.mozilla.xul+xml;charset=utf-8,',
      '<?xml version="1.0"?>',
      '%xuls%',
      '<overlay id="%id%"',
      ' xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"',
      ' xmlns:html="http://www.w3.org/1999/xhtml">',
      '</overlay>'
    ].join('').replace('%id%', kSystem.overlayContainerId);

    let url = document.location.href;
    let xuls = '';

    for (let script of dataLists.overlays) {
      if (script.testTarget(url)) {
        log(script.getURL('IN_CHROME'));

        xuls += kXUL.replace('%url%', script.getURL('RUN'));
      }
    }

    if (xuls) {
      loadOverlay(kDATA.replace('%xuls%', xuls), document);
    }
  }

  /**
   * Exports
   */
  return {
    init,
    uninit,
    get: getDataList,
    run: runDataList
  };
}

/**
 * UserScript constructor.
 *
 * @return {hash}
 *   @key uninit {function}
 *   @key getMetaData {function}
 *   @key formatMetaData {function}
 *   @key testTarget {function}
 *   @key getURL {function}
 *
 * @note This creates multiple instances so some functions are cached outside
 * for performance.
 * TODO: I prefer this module pattern to the prototype one. But the prototypal
 * may be better for a constructor.
 */
function UserScript(aFile) {
  let mFile = aFile;
  let mMetaData = UserScript_scanMetaData(aFile);

  function uninit() {
    if (mFile) {
      mFile = null;
    }

    if (mMetaData) {
      mMetaData = null;
    }
  }

  return {
    uninit,
    getMetaData: UserScript_getMetaData.bind(null, mMetaData),
    formatMetaData: UserScript_formatMetaData.bind(null, mMetaData),
    testTarget: UserScript_testTarget.bind(null, mMetaData),
    getURL: UserScript_getURL.bind(null, mFile)
  };
}

function UserScript_scanMetaData(aFile) {
  const {readFile} = Util;

  // The meta data block.
  const kMetaDataBlockRE =
    /^\s*\/\/\s*==UserScript==\s*\n(?:.*\n)*?\s*\/\/\s*==\/UserScript==\s*\n/m;

  // Each meta data.
  // @note Must specify the global flag 'g'.
  const kMetaDataRE =
    /^\s*\/\/\s*@([\w-]+)\s+(.+?)\s*$/gm;

  /**
   * Supported meta data:
   * {string}: Only the first line is retrieved.
   * {array}: All lines are retrieved.
   */
  let data = {
    'name': '',
    'description': '',
    'include': [],
    'exclude': []
  };

  let meta = (readFile(aFile).match(kMetaDataBlockRE) || [''])[0];
  let matches, key, value;

  while ((matches = kMetaDataRE.exec(meta))) {
    [, key, value] = matches;

    if (key in data) {
      if (data[key] === '') {
        data[key] = value;
      }
      else if (Array.isArray(data[key])) {
        data[key].push(value);
      }
    }
  }

  return data;
}

function UserScript_getMetaData(aMetaData, aKey) {
  return aKey ? aMetaData[aKey] : aMetaData;
}

function UserScript_formatMetaData(aMetaData) {
  const kForm = '@%key%: %value%';
  const kNoMetaData = '[No meta data]';

  let list = [];

  for (let key in aMetaData) {
    let value = aMetaData[key];

    if (!Array.isArray(value)) {
      value = [value];
    }

    list = list.concat(value.map((value) =>
      kForm.replace('%key%', key).replace('%value%', value)
    ));
  }

  return list.length ? list.join('\n') : kNoMetaData;
};

function UserScript_testTarget(aMetaData, aURL) {
  const {getBrowserURL, testURL} = Util;

  let browserURL = getBrowserURL();

  let test = (str) => testURL(str.replace(/^main$/i, browserURL), aURL);

  let exclude = aMetaData.exclude;

  if (exclude.length && exclude.some(test)) {
    return false;
  }

  let include = aMetaData.include;

  if (!include.length) {
    include[0] = browserURL;
  }

  return include.some(test);
}

function UserScript_getURL(aFile, aType) {
  const {getURLSpecFromFile, getChromeDirectory, getLastModifiedTime} = Util;
  const D = window.decodeURIComponent;

  let path = () => getURLSpecFromFile(aFile);
  let chrome = () => getURLSpecFromFile(getChromeDirectory());

  switch (aType) {
    // A file name.
    case 'FILENAME':
      return aFile.leafName;

    // A path of folders under the chrome folder.
    case 'FOLDER':
      return D(path()).slice(D(chrome()).length, -(aFile.leafName.length));

    // A path under the chrome folder.
    case 'IN_CHROME':
      return D(path().slice(chrome().length));

    // A full path with the modified time to run a script.
    // @note Requesting a filename with the unique identifier can update the
    // script cache.
    case 'RUN':
      return path() + '?' +
        (kSystem.checkCacheAtRun ? getLastModifiedTime(aFile) :
         aFile.lastModifiedTime);
  }

  // A full path.
  return D(path());
}

/**
 * Common utility function.
 *
 * @return {hash}
 */
function UtilManager() {
  const {classes: Cc, interfaces: Ci, utils: Cu} = window.Components;

  let $S = (aCID, aIID) => Cc[aCID].getService(Ci[aIID]);
  let $I = (aCID, aIID) => Cc[aCID].createInstance(Ci[aIID]);
  let QI = (aNode, aIID) => aNode.QueryInterface(Ci[aIID]);

  function importModule(moduleURL) {
    /**
     * Loads JS module.
     *
     * Shortcut path for some typical module locations:
     * - /modules/*.jsm?
     * - gre/modules/*.jsm?
     * - devtools/*.jsm?
     */
    if (/^(?:\/modules|gre\/modules|devtools)\/.+\.jsm?$/.test(moduleURL)) {
      return Cu.import('resource://' + moduleURL, {});
    }

    /**
     * Loads SDK module.
     *
     * Special path for SDK.
     * @see https://developer.mozilla.org/en/Add-ons/SDK/Guides/Module_structure_of_the_SDK#SDK_Modules
     */
    let loader = Cu.import('resource://devtools/shared/Loader.jsm', {});

    return loader.require(moduleURL);
  }

  function getLastModifiedTime(aFile) {
    let localFile = $I('@mozilla.org/file/local;1', 'nsIFile');

    try {
      localFile.initWithPath(aFile.path);
      return localFile.lastModifiedTime;
    }
    catch (ex) {}

    return '';
  }

  function readFile(aFile) {
    let fileIS = $I('@mozilla.org/network/file-input-stream;1',
      'nsIFileInputStream');
    let convIS = $I('@mozilla.org/intl/converter-input-stream;1',
      'nsIConverterInputStream');

    let data = {}, size;

    try {
      fileIS.init(aFile, 0x01, 0, 0);
      size = fileIS.available();
      convIS.init(fileIS, 'UTF-8', size, convIS.DEFAULT_REPLACEMENT_CHARACTER);
      convIS.readString(size, data);
    }
    finally {
      convIS.close();
      fileIS.close();
    }

    // Set line-breaks in LF.
    return data.value.replace(/\r\n?/g, '\n');
  }

  // Your chrome directory.
  function getChromeDirectory() {
    return $S('@mozilla.org/file/directory_service;1', 'nsIProperties').
      get('UChrm', Ci['nsIFile']);
  }

  function getEntryList(aDirectory) {
    return QI(aDirectory.directoryEntries, 'nsISimpleEnumerator');
  }

  function getNextEntry(aList) {
    return aList.hasMoreElements() && QI(aList.getNext(), 'nsIFile');
  }

  function getTopBrowserWindow() {
    return $S('@mozilla.org/appshell/window-mediator;1', 'nsIWindowMediator').
      getMostRecentWindow('navigator:browser');
  }

  function getURLSpecFromFile(aFile) {
    const ios = $S('@mozilla.org/network/io-service;1', 'nsIIOService');

    return QI(ios.getProtocolHandler('file'), 'nsIFileProtocolHandler').
      getURLSpecFromFile(aFile);
  }

  function loadJscript(aPath, aDocument) {
    $S('@mozilla.org/moz/jssubscript-loader;1', 'mozIJSSubScriptLoader').
      loadSubScript(aPath, aDocument.defaultView, 'UTF-8');
  }

  function loadOverlay(aData, aDocument) {
    aDocument.loadOverlay(aData, null);
  }

  function getBrowserURL() {
    return 'chrome://browser/content/browser.xul';
  }

  function testURL(aSource, aURL) {
    // 1.Escape the special character so that it is treated literally.
    // 2.Convert the wildcard character '*' to '.*' that matches any string.
    let pattern =
      '^' +
      aSource.trim().
      replace(/[{}()\[\]\\^$.?+|]/g, '\\$&').
      replace(/\*+/g, '.*') +
      '$';

    return RegExp(pattern).test(aURL);
  }

  function log(aMessage, aCaller) {
    if (!aCaller) {
      aCaller = Components.stack.caller;
    }

    if (!Array.isArray(aMessage)) {
      aMessage = [aMessage];
    }

    // @note This will always return 'userChrome.js' for logs called in this
    // file. I make this function to prevent hardcoding of the file name.
    let getFileName = (aURL) =>
      aURL.
      replace(/[?#].*$/, '').
      replace(/^.+?([^\/.]+(?:\.\w+)+)$/, '$1');

    let output = '[%file%] ::%function%\n%message%'.
      replace('%file%', getFileName(aCaller.filename)).
      replace('%function%', aCaller.name || '[anonymous function]').
      replace('%message%', aMessage.join('\n'));

    // |console.error| shows stack trace list.
    window.console.error(output);
  }

  /**
   * Exports
   */
  return {
    importModule,
    getLastModifiedTime,
    readFile,
    getChromeDirectory,
    getEntryList,
    getNextEntry,
    getTopBrowserWindow,
    getURLSpecFromFile,
    loadJscript,
    loadOverlay,
    getBrowserURL,
    testURL,
    log
  };
}

/**
 * Logger to the error console.
 *
 * @param aEnabled {boolean} Whether output or not.
 * @return {hash}
 */
function LogManager(aEnabled) {
  let noop = () => function(){};

  // @note Overwrite with the same name functions in the 'Exports' section
  // below if the logger enables.
  let exports = {
    list: noop,
    counter: noop
  };

  if (!aEnabled) {
    return exports;
  }

  let output = (aValue, aCaller) => {
    const {log} = Util;

    log(aValue, aCaller);
  };

  let format = (aForm, aAttribute) => {
    for (let name in aAttribute) {
      aForm = aForm.replace('%' + name + '%', aAttribute[name] + '');
    }

    return aForm;
  };

  let addIndent = (aValue, aDepth) => {
    let indent = aDepth ? Array(aDepth + 1).join('  ') + '+- ' : '';
    let data;

    switch (true) {
      case (typeof aValue === 'string'):
        data = aValue;
        break;

      case (aValue === undefined):
        data = '<undefined>';
        break;

      case (aValue === null):
        data = '<null>';
        break;

      case (Array.isArray(aValue)):
        // TODO: Make a readable string.
        data = aValue.toSource();
        break;

      case (aValue.constructor === Object):
        // TODO: Handle nested objects.
        data = Object.keys(aValue).map((key) => key + ': ' + aValue[key]);
        break;

      default:
        data = '<unknown>: ' + aValue.toString();
    }

    if (Array.isArray(data)) {
      return data.map((item) => indent + item).join('\n');
    }

    return indent + data;
  };

  /**
   * Exports
   *
   * @note Overwrite the functions that are defined in |exports| above.
   */
  exports.list = (aCaption, ...aValues) => {
    aValues.unshift(format('%caption% ----------', {
      'caption': aCaption
    }));

    let message = aValues.map((value, i) => addIndent(value, i));

    output(message, Components.stack.caller);
  };

  exports.counter = (aHeader) => {
    let form = format('%header%: %count%. %value%', {
      'header': aHeader
    });

    let count = 0;

    return (aValue) => {
      let message = format(form, {
        'count': ++count,
        'value': aValue
      });

      output(message, Components.stack.caller);
    };
  };

  return exports;
}


})(this);
