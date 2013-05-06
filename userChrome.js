// ==UserScript==
// @name userChrome.js
// @description User-script loader for userChromeJS extention
// ==/UserScript==

// @note Exposes a property in the global scope. |window[kSystem.loaderName]|
// @note cf. http://userchromejs.mozdev.org/
// @note cf. https://github.com/alice0775/userChrome.js/blob/master/userChrome.js


(function(window, undefined) {


"use strict";


/**
 * User configurations
 */
const kConfig = {
  // Script subfolders under your chrome folder
  // Required to register at least one subfolder
  // Adding '/' at the end, scripts are scanned in the descendant directories
  scriptFolders: ['UCJS_files', 'UCJS_tmp/'],

  // File extensions to select which of java-script or xul-overlay
  // the script runs as
  // Tests exact match from the first dot(.) of a file name
  jscriptExts: ['.uc.js'],
  overlayExts: ['.uc.xul', '.xul'],

  // URL list of chrome XUL files which is blocked to load scripts
  // Wildcard '*' is available
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
 * System configs
 */
const kSystem = {
  // Log the activity of this script to the error console
  logging: false,

  // Exposed property name in the global scope |window|
  loaderName: 'ucjsScriptLoader',

  // ID of <overlay> for overlayed scripts
  overlayContainerID: 'userChrome_js_overlay',

  // Timing to validate the modified time of a script
  // in order to update the startup cache of Firefox
  // @value {boolean}
  //   true: always when the script runs
  //   false: only when the script is first scanned
  validateScriptAtRun: false
};


//********** Entry point

// initialize the common utility and the console logger
var Util = Util(),
    Log = Log(kSystem.logging);

ucjsScriptLoader_init();


//********** Modules

function ucjsScriptLoader_init() {
  var scriptLoader = ScriptLoader();

  if (scriptLoader.init()) {
    // expose a property in |window|
    let scriptList = scriptLoader.getScriptList();
    if (scriptList) {
      window[kSystem.loaderName] = {scriptList: scriptList};
    }

    window.addEventListener('unload', function onUnload() {
      window.removeEventListener('unload', onUnload, false);
      scriptLoader.uninit();
    }, false);
  } else {
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
  var mScriptList = ScriptList();

  function uninit() {
    mScriptList.uninit();
    mScriptList = null;
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
      var target = aEvent.originalTarget;
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

    var URL = location.href;
    return !/^chrome:.+\.xul$/i.test(URL) ||
      kConfig.blockXULs.some(function(xul) testURL(xul, URL));
  }

  //********** expose
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
  var mJscripts, mOverlays;

  function uninit() {
    mJscripts = null;
    mOverlays = null;
  }

  function init() {
    const {getTopBrowserWindow} = Util;

    var win = getTopBrowserWindow();
    var loader = win ? win[kSystem.loaderName] : null;
    if (loader) {
      copyData(loader.scriptList);
      Log.list('Copy script data from', {
        'URL': win.location.href,
        'Title': (win.content || win).document.title
      });
    } else {
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

    var chrome = getChromeDirectory();
    kConfig.scriptFolders.forEach(function(folder) {
      var match, deeper, directory, exists;

      // 'dir1/dir2' -> match[1]='dir1/dir2', match[2]=''
      // 'dir1/dir2/' -> match[1]='dir1/dir2', match[2]='/'
      match = /^(.+?)(\/?)$/.exec(folder);
      if (!match) {
        return;
      }

      deeper = !!match[2];
      directory = chrome.clone();
      exists = match[1].split('/').every(function(segment) {
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
      var list = getEntryList(aDirectory), entry;
      var ext, script;
      while ((entry = getNextEntry(list))) {
        if (entry.isHidden()) {
          continue;
        }

        if (aDeeper && entry.isDirectory()) {
          // recursively
          scanDirectory(entry, aDeeper);
        } else if (entry.isFile()) {
          ext = checkExt(entry);
          if (ext) {
            // do not forget 'new'
            script = new UserScript(entry);
            if (ext === 'js') {
              mJscripts.push(script);
            } else {
              mOverlays.push(script);
            }
            log(script.getURL('IN_CHROME'));
          }
        }
      }
    }

    function checkExt(aFile) {
      var dot = aFile.leafName.indexOf('.');
      if (dot > -1) {
        let ext = aFile.leafName.substr(dot);
        if (kConfig.jscriptExts.indexOf(ext) > -1) {
          return 'js';
        }
        if (kConfig.overlayExts.indexOf(ext) > -1) {
          return 'xul';
        }
      }
      return '';
    }
  }

  function runData(aDocument) {
    // ensure that scripts will run at the end of loader
    setTimeout(function(doc) {
      setTimeout(runJscripts, 0, doc);
      setTimeout(runOverlays, 0, doc);
    }, 0, aDocument);
  }

  function runJscripts(aDocument) {
    const log = Log.counter('Run JS');
    const {loadJscript} = Util;

    var URL = aDocument.location.href;
    mJscripts.forEach(function(script) {
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

    var URL = aDocument.location.href;
    var xuls = '';
    mOverlays.forEach(function(script) {
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
   * UserScript class
   */
  function UserScript() {
    this.init.apply(this, arguments);
  }

  UserScript.prototype.file = null;
  UserScript.prototype.meta = null;

  UserScript.prototype.init = function UserScript_init(aFile) {
    this.file = aFile;
    this.meta = scanMetaData(aFile);
  };

  UserScript.prototype.uninit = function UserScript_uninit() {
    delete this.file;
    delete this.meta;
  };

  UserScript.prototype.getURL = function UserScript_getURL(aType) {
    const {getURLSpecFromFile, getChromeDirectory, getLastModifiedTime} = Util;
    const D = window.decodeURIComponent;

    var file = this.file;
    function path() getURLSpecFromFile(file);
    function chrome() getURLSpecFromFile(getChromeDirectory());

    switch (aType) {
      case 'FILENAME':
        return file.leafName;
      case 'FOLDER':
        return D(path()).slice(D(chrome()).length, -(file.leafName.length));
      case 'IN_CHROME':
        return D(path().slice(chrome().length));
      case 'RUN':
        return path() + '?' + (kSystem.validateScriptAtRun ?
          getLastModifiedTime(file) : file.lastModifiedTime);
    }
    return D(path());
  };

  UserScript.prototype.testTarget = function UserScript_testTarget(aURL) {
    return MetaData_isIncludedURL(this.meta, aURL);
  };

  UserScript.prototype.getMetaList = function UserScript_getMetaList() {
    return MetaData_getList(this.meta);
  };

  /**
   * MetaData handlers
   */
  function scanMetaData(aFile) {
    const {readFile} = Util;

    const META_DATA_RE = /^\s*\/\/\s*==UserScript==\s*\n(?:.*\n)*?\s*\/\/\s*==\/UserScript==\s*\n/m;
    const META_ENTRY_RE = /^\s*\/\/\s*@([\w-]+)\s+(.+?)\s*$/gm;

    var data = {
      'name': [],
      'description': [],
      'include': [],
      'exclude': []
    };

    var meta = (readFile(aFile).match(META_DATA_RE) || [''])[0];
    var matches, key, value;
    while ((matches = META_ENTRY_RE.exec(meta))) {
      [, key, value] = matches;
      if (key in data) {
        data[key].push(value);
      }
    }

    return data;
  }

  function MetaData_isIncludedURL(aMetaData, aURL) {
    const {getBrowserURL, testURL} = Util;

    var browserURL = getBrowserURL();

    var test = function(str) {
      return testURL(str.replace(/^main$/i, browserURL), aURL);
    }

    var exclude = aMetaData.exclude;
    if (exclude.length && exclude.some(test)) {
      return false;
    }

    var include = aMetaData.include;
    if (!include.length) {
      include[0] = browserURL;
    }
    return include.some(test);
  }

  function MetaData_getList(aMetaData) {
    const kForm = '@%key%: %value%',
          kNoMetaData = '[No meta data]';

    var list = [];
    for (let [key, values] in Iterator(aMetaData)) {
      list = list.concat(values.map(function(value) {
        return kForm.replace('%key%', key).replace('%value%', value);
      }));
    }
    return list.length ? list.join('\n') : kNoMetaData;
  }


  //********** expose
  return {
    init: init,
    uninit: uninit,
    get: getData,
    run: runData
  };
}

/**
 * Common utility function
 * @return {hash}
 */
function Util() {
  const {classes: Cc, interfaces: Ci} = window.Components;

  function $S(aCID, aIID) {
    return Cc[aCID].getService(Ci[aIID]);
  }

  function $I(aCID, aIID) {
    return Cc[aCID].createInstance(Ci[aIID]);
  }

  function QI(aNode, aIID) {
    return aNode.QueryInterface(Ci[aIID]);
  }

  function getLastModifiedTime(aFile) {
    var lf = $I('@mozilla.org/file/local;1', 'nsIFile');

    try {
      lf.initWithPath(aFile.path);
      return lf.lastModifiedTime;
    } catch (ex) {}
    return '';
  }

  function readFile(aFile) {
    var fis = $I('@mozilla.org/network/file-input-stream;1',
      'nsIFileInputStream');
    var cis = $I('@mozilla.org/intl/converter-input-stream;1',
      'nsIConverterInputStream');
    var data = {}, size;

    try {
      fis.init(aFile, 0x01, 0, 0);
      size = fis.available();
      cis.init(fis, 'UTF-8', size, cis.DEFAULT_REPLACEMENT_CHARACTER);
      cis.readString(size, data);
    } finally {
      cis.close();
      fis.close();
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
    loadSubScript(aPath, aDocument.defaultView);
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

  //********** expose
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

  var exports = {
    list: noop,
    counter: noop
  };

  if (!aEnabled) {
    return exports;
  }

  var format = function(aForm, aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      aForm = aForm.replace('%' + name + '%', String(value));
    }
    return aForm;
  };

  var output = function(aValue, aDepth) {
    const {log} = Util;

    var indent = aDepth ? Array(aDepth + 1).join('  ') + '+- ' : '';
    var data;

    if (typeof aValue === 'string') {
      data = aValue;
    } else if (aValue === undefined) {
      data = '<undefined>';
    } else if (aValue === null) {
      data = '<null>';
    } else {
      let json;
      try {
        json = JSON.stringify(aValue);
      } catch (ex) {
        data = '<JSON error>';
      }
      // iterates over the properties of an object
      // TODO: Nested objects handling.
      if (/^{.+}$/.test(json)) {
        let obj = JSON.parse(json);
        data = [];
        for (let key in obj) {
          data.push(key + ': ' + obj[key]);
        }
      }
    }
    if (!data) {
      data = '<something>';
    }

    if (Array.isArray(data)) {
      log(data.map(function(item) indent + item).join('\n'));
    } else {
      log(indent + data);
    }
  };

  exports.list = function(aCaption, ...aValues) {
    output(format('%caption% ----------', {'caption': aCaption}));

    for (let i = 0, l = aValues.length; i < l; i++) {
      output(aValues[i], i + 1);
    }
  };

  exports.counter = function(aHeader) {
    var form = format('%header%: %count%. %value%', {'header': aHeader});
    var count = 0;

    return function(aValue) {
      output(format(form, {'count': ++count, 'value': aValue}));
    }
  };

  return exports;
}


})(this);
