// ==UserScript==
// @name userChrome.js
// @description User-script loader for userChromeJS extention
// ==/UserScript==

// @note exposes new property in the global scope;
// |window[kSystem.loaderName]|

// @see http://userchromejs.mozdev.org/
// @see https://github.com/alice0775/userChrome.js/blob/master/userChrome.js


(function(window, undefined) {


"use strict";


/**
 * User preferences
 */
const kPref = {
  // Script subfolders under your chrome folder
  // @note required to register at least one subfolder
  // @note adding '/' at the end, scripts are scanned in the descendant
  // directories
  scriptFolders: ['UCJS_files', 'UCJS_tmp/'],

  // File extensions to select which of java-script or xul-overlay a script
  // runs as
  // @note tests exact match from the first dot(.) of a file name
  jscriptExts: ['.uc.js'],
  overlayExts: ['.uc.xul', '.xul'],

  // URL list of chrome XUL files which is blocked to load scripts
  // @note wildcard '*' is available
  blockXULs: [
    'chrome://global/content/commonDialog.xul',
    'chrome://browser/content/preferences/*',
    'chrome://inspector/*',
    'chrome://adblockplus/*',
    'chrome://noscript/*',
    'chrome://securelogin/*'
  ]
};

/**
 * System preferences
 */
const kSystem = {
  // Log the activity of this script to the error console
  logging: false,

  // Exposed property name in the global scope |window|
  loaderName: 'ucjsScriptLoader',

  // ID of <overlay> for overlayed scripts
  overlayContainerID: 'userChrome_js_overlay',

  // Check the cache of a script whenever the script runs on sub-windows
  // set true for debug, and a script that had been modified would be applied
  // on sub-windows without restart
  // @note this loader checks the cache when the startup browser window opens,
  // and usually the cached script runs on sub-windows thereafter
  checkCacheAtRun: false
};

/**
 * Common utilities
 */
let Util = Util();
// console logger
let Log = Log(kSystem.logging);

/**
 * Main function
 */
ucjsScriptLoader_init();

function ucjsScriptLoader_init() {
  let scriptLoader = ScriptLoader();

  if (scriptLoader.init()) {
    let scriptList = scriptLoader.getScriptList();

    if (scriptList) {
      // exposes new property in |window|
      window[kSystem.loaderName] = {scriptList: scriptList};
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
 * ScriptLoader handler
 * @return {hash}
 *   @member init {function}
 *   @member uninit {function}
 *   @member getScriptList {function}
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

    if (isBlockURL(document)) {
      Log.list('Not init window', {
        'Blocked URL': document.location.href
      });
      return false;
    }

    Log.list('Init window', {
      'URL': document.location.href,
      'Title': (window.content || window).document.title
    });

    mScriptList = ScriptList();
    mScriptList.init();
    mScriptList.run(document);

    if (inBrowserWindow()) {
      watchSidebar();
    }
    return true;
  }

  function watchSidebar() {
    const {document} = window;

    document.addEventListener('load', initSidebar, true);
    window.addEventListener('unload', function onUnload() {
      document.removeEventListener('load', initSidebar, true);
      window.removeEventListener('unload', onUnload, false);
    }, false);

    function initSidebar(aEvent) {
      let target = aEvent.originalTarget;

      if (!(target instanceof XULDocument)) {
        /* noisy, comment out
        Log.list('Not init sidebar', {
          'Loaded node': target.nodeName
        });
        */
        return;
      }

      if (isBlockURL(target)) {
        Log.list('Not init sidebar', {
          'Blocked URL': target.location.href
        });
        return;
      }

      Log.list('Init sidebar', {
        'URL': target.location.href,
        'Title': document.getElementById('sidebar-title').value
      });

      mScriptList.run(target);
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

  function isBlockURL({location}) {
    const {testURL} = Util;

    let URL = location.href;

    return !/^chrome:.+\.xul$/i.test(URL) ||
           kPref.blockXULs.some((xul) => testURL(xul, URL));
  }

  /**
   * exports
   */
  return {
    init: init,
    uninit: uninit,
    getScriptList: getScriptList
  };
}

/**
 * ScriptList handler
 * @return {hash}
 *   @member init {function}
 *   @member uninit {function}
 *   @member get {function}
 *   @member run {function}
 */
function ScriptList() {
  let mJscripts, mOverlays;

  function uninit() {
    let uninitData = (aData) => {
      aData.forEach((item) => item.uninit());
    };

    if (mJscripts) {
      uninitData(mJscripts);
      mJscripts = null;
    }

    if (mOverlays) {
      uninitData(mOverlays);
      mOverlays = null;
    }
  }

  function init() {
    const {getTopBrowserWindow} = Util;

    let win = getTopBrowserWindow();
    let loader = win ? win[kSystem.loaderName] : null;

    if (loader) {
      copyData(loader.scriptList);

      Log.list('Copy script data from', {
        'URL': win.location.href,
        'Title': (win.content || win).document.title
      });
    }
    else {
      scanData();
    }
  }

  function getData() {
    return {
      jscripts: mJscripts,
      overlays: mOverlays
    };
  }

  function copyData(aData) {
    // reference copy
    mJscripts = aData.jscripts;
    mOverlays = aData.overlays;
  }

  function scanData() {
    const log = Log.counter('Scan');
    const {getChromeDirectory, getEntryList, getNextEntry} = Util;

    mJscripts = [];
    mOverlays = [];

    let chrome = getChromeDirectory();

    kPref.scriptFolders.forEach((folder) => {
      let match, deeper, directory, exists;

      // 'dir1/dir2' -> match[1]='dir1/dir2', match[2]=''
      // 'dir1/dir2/' -> match[1]='dir1/dir2', match[2]='/'
      match = /^(.+?)(\/?)$/.exec(folder);
      if (!match) {
        return;
      }

      deeper = !!match[2];
      directory = chrome.clone();

      exists = match[1].split('/').every((segment) => {
        if (segment) {
          try {
            directory.append(segment);
            return directory.exists() &&
                   directory.isDirectory() &&
                   !directory.isHidden();
          } catch (ex) {}
        }
        return false;
      });

      if (exists) {
        scanDirectory(directory, deeper);
      }
    });

    function scanDirectory(aDirectory, aDeeper) {
      let list = getEntryList(aDirectory), entry;
      let ext, script;

      while ((entry = getNextEntry(list))) {
        if (entry.isHidden()) {
          continue;
        }

        if (aDeeper && entry.isDirectory()) {
          // recursively
          scanDirectory(entry, aDeeper);
        }
        else if (entry.isFile()) {
          ext = checkExt(entry);

          if (ext) {
            script = UserScript(entry);

            if (ext === 'js') {
              mJscripts.push(script);
            }
            else {
              mOverlays.push(script);
            }

            log(script.getURL('IN_CHROME'));
          }
        }
      }
    }

    function checkExt(aFile) {
      let dot = aFile.leafName.indexOf('.');

      if (dot > -1) {
        let ext = aFile.leafName.substr(dot);

        if (kPref.jscriptExts.indexOf(ext) > -1) {
          return 'js';
        }
        if (kPref.overlayExts.indexOf(ext) > -1) {
          return 'xul';
        }
      }
      return '';
    }
  }

  function runData(aDocument) {
    // ensure that scripts will run at the end of loader
    setTimeout((doc) => {
      setTimeout(runJscripts, 0, doc);
      setTimeout(runOverlays, 0, doc);
    }, 0, aDocument);
  }

  function runJscripts(aDocument) {
    const log = Log.counter('Run JS');
    const {loadJscript} = Util;

    let URL = aDocument.location.href;

    mJscripts.forEach((script) => {
      if (script.testTarget(URL)) {
        log(script.getURL('IN_CHROME'));

        loadJscript(script.getURL('RUN'), aDocument);
      }
    });
  }

  function runOverlays(aDocument) {
    const log = Log.counter('Run XUL');
    const {loadOverlay} = Util;

    const XUL = '<?xul-overlay href="%URL%"?>';
    const DATA = [
      'data:application/vnd.mozilla.xul+xml;charset=utf-8,',
      '<?xml version="1.0"?>',
      '%XULS%',
      '<overlay id="%ID%"',
      ' xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"',
      ' xmlns:html="http://www.w3.org/1999/xhtml">',
      '</overlay>'
    ].join('').replace('%ID%', kSystem.overlayContainerID);

    let URL = aDocument.location.href;
    let xuls = '';

    mOverlays.forEach((script) => {
      if (script.testTarget(URL)) {
        log(script.getURL('IN_CHROME'));

        xuls += XUL.replace('%URL%', script.getURL('RUN'));
      }
    });

    if (xuls) {
      loadOverlay(DATA.replace('%XULS%', xuls), aDocument);
    }
  }

  /**
   * exports
   */
  return {
    init: init,
    uninit: uninit,
    get: getData,
    run: runData
  };
}

/**
 * UserScript constructor
 * @return {hash}
 *   @member uninit {function}
 *   @member getURL {function}
 *   @member testTarget {function}
 *   @member getMetaList {function}
 *
 * @note this creates multiple instances so some functions are cached outside
 * for performance
 * TODO: I prefer this module pattern to the prototype one. but the prototypal
 * may be better for a constructor
 */
function UserScript(aFile) {
  let mFile = aFile;
  let mMetaData = UserScript_getMetaData(aFile);

  function uninit() {
    if (mFile) {
      mFile = null;
    }

    if (mMetaData) {
      mMetaData = null;
    }
  }

  return {
    uninit: uninit,
    getURL: UserScript_getURL.bind(null, mFile),
    testTarget: UserScript_testTarget.bind(null, mMetaData),
    getMetaList: UserScript_getMetaList.bind(null, mMetaData)
  };
}

function UserScript_getMetaData(aFile) {
  const {readFile} = Util;

  const META_DATA_RE =
    /^\s*\/\/\s*==UserScript==\s*\n(?:.*\n)*?\s*\/\/\s*==\/UserScript==\s*\n/m;
  const META_ENTRY_RE =
    /^\s*\/\/\s*@([\w-]+)\s+(.+?)\s*$/gm;

  let data = {
    'name': [],
    'description': [],
    'include': [],
    'exclude': []
  };

  let meta = (readFile(aFile).match(META_DATA_RE) || [''])[0];
  let matches, key, value;

  while ((matches = META_ENTRY_RE.exec(meta))) {
    [, key, value] = matches;

    if (key in data) {
      data[key].push(value);
    }
  }

  return data;
}

function UserScript_getURL(aFile, aType) {
  const {getURLSpecFromFile, getChromeDirectory, getLastModifiedTime} = Util;
  const D = window.decodeURIComponent;

  let path = () => getURLSpecFromFile(aFile);
  let chrome = () => getURLSpecFromFile(getChromeDirectory());

  switch (aType) {
    // a file name
    case 'FILENAME':
      return aFile.leafName;
    // a path of folders under the chrome folder
    case 'FOLDER':
      return D(path()).slice(D(chrome()).length, -(aFile.leafName.length));
    // a path under the chrome folder
    case 'IN_CHROME':
      return D(path().slice(chrome().length));
    // a full path with the modified time to run a script
    // @note requesting a filename with the unique identifier can update the
    // script cache
    case 'RUN':
      return path() + '?' +
        (kSystem.checkCacheAtRun ?
         getLastModifiedTime(aFile) :
         aFile.lastModifiedTime);
  }
  // a full path
  return D(path());
}

function UserScript_testTarget(aMetaData, aURL) {
  const {getBrowserURL, testURL} = Util;

  let browserURL = getBrowserURL();

  let test = function(str) {
    return testURL(str.replace(/^main$/i, browserURL), aURL);
  }

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

function UserScript_getMetaList(aMetaData) {
  const kForm = '@%key%: %value%';
  const kNoMetaData = '[No meta data]';

  let list = [];

  for (let [key, values] in Iterator(aMetaData)) {
    list = list.concat(values.map((value) =>
      kForm.
      replace('%key%', key).
      replace('%value%', value)
    ));
  }

  return list.length ? list.join('\n') : kNoMetaData;
}

/**
 * Common utility function
 * @return {hash}
 */
function Util() {
  const {classes: Cc, interfaces: Ci} = window.Components;

  let $S = (aCID, aIID) => Cc[aCID].getService(Ci[aIID]);
  let $I = (aCID, aIID) => Cc[aCID].createInstance(Ci[aIID]);
  let QI = (aNode, aIID) => aNode.QueryInterface(Ci[aIID]);

  function getLastModifiedTime(aFile) {
    let localFile = $I('@mozilla.org/file/local;1', 'nsIFile');

    try {
      localFile.initWithPath(aFile.path);
      return localFile.lastModifiedTime;
    } catch (ex) {}
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
    } finally {
      convIS.close();
      fileIS.close();
    }

    // set line-breaks in LF
    return data.value.replace(/\r\n?/g, '\n');
  }

  // your chrome directory
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
    return $S('@mozilla.org/browser/browserglue;1', 'nsIBrowserGlue').
      getMostRecentBrowserWindow();
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
    // 1.escape the special character so that it is treated literally
    // 2.convert the wildcard character '*' to '.*' that matches any string
    let pattern =
      '^' +
      aSource.trim().
      replace(/[{}()\[\]\\^$.?+|]/g, '\\$&').
      replace(/\*+/g, '.*') +
      '$';

    return RegExp(pattern).test(aURL);
  }

  function log(aMessage) {
    const kLogFormat = '%date%\n[%loaderName%]\n%message%';

    let str = kLogFormat.
      replace('%loaderName%', kSystem.loaderName).
      replace('%date%', getFormatDate()).
      replace('%message%', aMessage);

    $S('@mozilla.org/consoleservice;1', 'nsIConsoleService').
    logStringMessage(str);
  }

  function getFormatDate() {
    const kDateFormat = '%04Y/%02M/%02D %02h:%02m:%02s.%03ms';

    let date = new Date();
    let map = {
      'Y': date.getFullYear(),
      'M': date.getMonth() + 1,
      'D': date.getDate(),
      'h': date.getHours(),
      'm': date.getMinutes(),
      's': date.getSeconds(),
      'ms': date.getMilliseconds()
    };

    return kDateFormat.replace(/%(0)?(\d+)?(ms|[YMDhms])/g,
      (match, pad, width, type) => {
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

  /**
   * exports
   */
  return {
    getLastModifiedTime: getLastModifiedTime,
    readFile: readFile,
    getChromeDirectory: getChromeDirectory,
    getEntryList: getEntryList,
    getNextEntry: getNextEntry,
    getTopBrowserWindow: getTopBrowserWindow,
    getURLSpecFromFile: getURLSpecFromFile,
    loadJscript: loadJscript,
    loadOverlay: loadOverlay,
    getBrowserURL: getBrowserURL,
    testURL: testURL,
    log: log
  };
}

/**
 * Logger to the error console
 * @param aEnabled {boolean} whether output or not
 * @return {hash}
 */
function Log(aEnabled) {
  function noop() {
    return function(){};
  }

  // @note define valid members of the same name
  let exports = {
    list: noop,
    counter: noop
  };

  if (!aEnabled) {
    return exports;
  }

  let output = (aValue) => {
    const {log} = Util;

    log(Array.isArray(aValue) ? aValue.join('\n') : aValue);
  };

  let format = (aForm, aAttribute) => {
    for (let [name, value] in Iterator(aAttribute)) {
      aForm = aForm.replace('%' + name + '%', String(value));
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
        // TODO: format
        data = aValue.toSource();
        break;
      case (aValue.constructor === Object):
        // TODO: handle nested objects
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
   * exports
   */
  exports.list = (aCaption, ...aValues) => {
    aValues.unshift(format('%caption% ----------', {
      'caption': aCaption
    }));

    output(aValues.map((value, i) => addIndent(value, i)));
  };

  exports.counter = (aHeader) => {
    let form = format('%header%: %count%. %value%', {
      'header': aHeader
    });

    let count = 0;

    return (aValue) => {
      output(format(form, {
        'count': ++count,
        'value': aValue
      }));
    };
  };

  return exports;
}


})(this);
