// ==UserScript==
// @name        AppLauncher.uc.js
// @description Application launcher
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the main context menu.

// @note A resource file that is passed to the application will be saved in
// your temporary folder. See |doAction()|, |Util::getSaveFilePath()|


/**
 * Main function
 * @param Util {hash} utility functions
 * @param window {hash} the global |Window| object
 * @param undefined {undefined} the |undefined| constant
 */
(function(Util, window, undefined) {


"use strict";


/**
 * Application list
 */
const kAppList = [
  {
    // Displayed name
    name: 'IE',

    // @see keys in kTypeAction
    type: 'browse',

    // Alias of the special folder is available
    // @see kSpecialFolderAliases
    // %ProgF%: program files folder
    // %LocalAppData%: local application data folder
    path: '%ProgF%\\Internet Explorer\\iexplore.exe',

    // [optional] Commandline arguments
    // %URL% is replaced with the proper URL of each action.
    // If omitted or empty, it equals to <args: '%URL%'>.
    // If launched as tool, arguments that have %URL% are removed.
    args: ['-new', '%URL%'],

    // [optional] This item is disabled
    disabled: true
  },
  {
    name: 'WMP',
    // If <type> is 'file', and also set <extensions> to describe the file
    // extensions of a link URL that is passed to the application.
    type: 'file',
    extensions: ['asx', 'wax', 'wvx'],
    path: '%ProgF%\\Windows Media Player\\wmplayer.exe',
    args: ['/prefetch:1', '%URL%']
  },
  {
    name: 'Foxit',
    type: 'file',
    extensions: ['pdf'],
    path: 'C:\\PF\\FoxitReader\\Foxit Reader.exe'
  },
  {
    name: 'Opera',
    type: 'browse',
    path: '%ProgF%\\Opera\\opera.exe'
  },
  {
    name: 'Chrome',
    type: 'browse',
    path: '%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe'
  },
  {
    name: 'unDonut',
    type: 'browse',
    path: 'C:\\PF\\unDonut\\unDonut.exe'
  },
  {
    name: 'TB',
    type: 'mail',
    path: '%ProgF%\\Mozilla Thunderbird\\thunderbird.exe'
  },
  {
    name: 'TB',
    type: 'news',
    path: '%ProgF%\\Mozilla Thunderbird\\thunderbird.exe',
    args: ['-news', '%URL%']
  },
  {
    name: 'MassiGra',
    type: 'image',
    path: 'C:\\PF\\MassiGra\\MassiGra.exe'
  },
  {
    name: 'MPC',
    type: 'media',
    path: 'C:\\PF\\MPC-HC\\mpc-hc.exe'
  },
  {
    name: 'Irvine',
    type: 'download',
    path: 'C:\\PF\\Irvine\\irvine.exe'
  },
  {
    name: '',
    type: 'ftp',
    path: ''
  },
  {
    name: 'VxEditor',
    type: 'text',
    path: 'C:\\PF\\VxEditor\\VxEditor.exe'
  },
  {
    name: 'KeePass2',
    type: 'tool',
    path: 'C:\\PF\\KeePass2\\KeePass.exe'
  }
];

/**
 * Actions for each types
 */
const kTypeAction = {
  tool:     ['launchTool'],
  file:     ['openFile'],
  browse:   ['openPage', 'openFrame', 'openLink'],
  text:     ['viewPageSource', 'viewFrameSource', 'viewLinkSource'],
  mail:     ['sendMail'],
  news:     ['readNews'],
  media:    ['openLinkMedia', 'openMedia'],
  image:    ['viewLinkImage', 'viewImage', 'viewBGImage'],
  download: ['downloadLink', 'downloadMedia', 'downloadImage',
             'downloadBGImage'],
  ftp:      ['openFTP']
};

/**
 * String bundle
 */
const kString = {
  appMenuItem: '%type%: %name%',

  type: {
    tool:     'Tool',
    file:     'File(%1)',
    browse:   'Browser',
    text:     'Text Editor',
    mail:     'Mail Client',
    news:     'News Client',
    media:    'Media Player',
    image:    'Image Viewer',
    download: 'Downloader',
    ftp:      'FTP Client'
  },

  action: {
    launchTool:      'Launch %1',
    openFile:        'Open File in %1',
    openPage:        'Open Page in %1',
    openFrame:       'Open Frame in %1',
    openLink:        'Open Link in %1',
    viewPageSource:  'View Page Source in %1',
    viewFrameSource: 'View Frame Source in %1',
    viewLinkSource:  'View Link Source in %1',
    sendMail:        'Send Email in %1',
    readNews:        'Read News in %1',
    openLinkMedia:   'Open Linked Media in %1',
    viewLinkImage:   'View Linked Image in %1',
    openMedia:       'Open Media in %1',
    viewImage:       'View Image in %1',
    viewBGImage:     'View BG-Image in %1',
    downloadLink:    'Download Link with %1',
    downloadMedia:   'Download Media with %1',
    downloadImage:   'Download Image with %1',
    downloadBGImage: 'Download BG-Image with %1',
    openFTP:         'Open FTP in %1',
    noActions:       'No actions'
  }
};

/**
 * File extensions for the action on a link
 */
const kLinkExtension = {
  // for <openFile>
  // @note Stay empty. This is created with |FileUtil::updateFileExt()|.
  file:  [],
  // for <viewLinkSource>
  text:  ['css', 'js', 'txt', 'xml'],
  // for <viewLinkImage>
  image: ['bmp', 'gif', 'jpg', 'png'],
  // for <openLinkMedia>
  media: ['asf', 'asx', 'avi', 'flv', 'mid', 'mov', 'mp3', 'mp4', 'mpg','ogg',
          'ogv', 'pls', 'ra', 'ram', 'rm', 'wav', 'wax', 'webm', 'wma', 'wmv',
          'wvx']
};

/**
 * UI
 */
const kUI = {
  mainMenuLabel: 'AppLauncher',
  mainMenuAccesskey: 'L',
  appMenuLabel: 'Applications'
};

/**
 * Identifier
 */
const kID = {
  mainMenu: 'ucjs_applauncher_menu',
  actionKey: 'ucjs_applauncher_action',
  startSeparator: 'ucjs_applauncher_startsep',
  endSeparator: 'ucjs_applauncher_endsep'
};

/**
 * Utility for the file extensions
 */
var FileUtil = {
  makeFileAction: function(aAction, aExt) {
    return aAction + '_' + aExt;
  },

  getBaseAction: function(aAction) {
    return aAction.replace(/_.+$/, '');
  },

  updateFileExt: function(aExtArray) {
    let fileExts = kLinkExtension['file'].concat(aExtArray);

    kLinkExtension['file'] =
    fileExts.filter(function(element, index, array) {
      return array.indexOf(element) === index;
    });
  },

  matchExt: function(aURL, aType) {
    if (!aURL) {
      return null;
    }

    let URL = makeURIURL(aURL);
    if (URL) {
      let ext = URL.fileExtension;
      if (ext && kLinkExtension[aType].indexOf(ext) > -1) {
        return ext;
      }
    }
    return null;
  }
};


//********** Functions

function AppLauncher_init() {
  var appList = initAppList();

  if (appList) {
    makeMainMenu(appList);
  }
}

function initAppList() {
  let apps =
  kAppList.filter(function(app) {
    let {name, type, extensions, path, disabled} = app;

    if (!disabled && name && type && path) {
      if (type in kTypeAction) {
        if (type !== 'file' || (extensions && extensions.length)) {
          let isValid = checkApp(app);
          if (isValid && type === 'file') {
            FileUtil.updateFileExt(extensions);
          }
          return isValid;
        }
      }
    }
    return false;
  });

  var order = [i for (i in kTypeAction)];
  apps.sort(function(a, b) {
    return order.indexOf(a.type) - order.indexOf(b.type) ||
           a.name.localeCompare(b.name);
  });

  return apps.length ? apps : null;
}

function makeMainMenu(aAppList) {
  var menu = $E('menu', {
    id: kID.mainMenu,
    label: U(kUI.mainMenuLabel),
    accesskey: kUI.mainMenuAccesskey
  });

  var popup = $E('menupopup');
  addEvent([popup, 'popupshowing', doBrowse, false]);

  makeAppMenu(popup, aAppList);
  makeActionItems(popup, aAppList);

  menu.appendChild(popup);

  // @note ucjsUI_manageContextMenuSeparators() manages the visibility of
  // separators.
  var context = getContextMenu();
  addSeparator(context, kID.startSeparator);
  context.appendChild(menu);
  addSeparator(context, kID.endSeparator);
}

function makeAppMenu(aPopup, aAppList) {
  var menu = $E('menu', {
    label: U(kUI.appMenuLabel)
  });

  var popup = $E('menupopup');

  aAppList.forEach(function(app) {
    addMenuItem(popup, 'launchTool', app, true);
  });

  menu.appendChild(popup);
  aPopup.appendChild(menu);
}

function makeActionItems(aPopup, aAppList) {
  var type, lastType = '';
  var actions;

  aAppList.forEach(function(app) {
    type = app.type;

    if (type !== lastType) {
      addSeparator(aPopup);
      lastType = type;
    }

    actions = kTypeAction[type];

    if (type === 'file') {
      actions = actions.reduce(function(a, b) {
        return a.concat(app.extensions.map(function(ext) {
          return FileUtil.makeFileAction(b, ext);
        }));
      }, []);
    }

    actions.forEach(function(action) {
      addMenuItem(aPopup, action, app);
    });
  });

  addSeparator(aPopup);
  addMenuItem(aPopup, 'noActions');
}

function addMenuItem(aPopup, aAction, aApp, aInAppMenu) {
  var label;
  if (aInAppMenu) {
    let type = kString.type[aApp.type];
    if (aApp.type === 'file') {
      type = type.replace('%1', aApp.extensions.join(','));
    }
    label = kString.appMenuItem.
      replace('%type%', type).replace('%name%', aApp.name);
  } else {
    label = kString.action[FileUtil.getBaseAction(aAction)];
    if (aApp) {
      label = label.replace('%1', aApp.name);
    }
  }

  var item = $E('menuitem', {
    label: U(label),
    user: [kID.actionKey, aAction]
  });

  if (aApp) {
    addEvent([item, 'command', function() {
      doAction(aApp, aAction);
    }, false]);
  } else {
    $E(item, {disabled: true});
  }

  aPopup.appendChild(item);
}

function doBrowse(aEvent) {
  // XPath for the useless menu-separator
  // 1.it is the first visible item in the menu
  // 2.it is the last visible item in the menu
  // 3.the next visible item is a menu-separator
  const uselessSeparator = 'xul:menuseparator[not(preceding-sibling::*[not(@hidden)]) or not(following-sibling::*[not(@hidden)]) or local-name(following-sibling::*[not(@hidden)])="menuseparator"]';

  function availableItem(actions) {
    var actionKey = '@' + kID.actionKey + '="';
    return 'xul:menuitem[' +
      actionKey + actions.join('" or ' + actionKey) + '"]';
  }

  aEvent.stopPropagation();
  var popup = aEvent.target;
  if (popup.parentElement.id !== kID.mainMenu) {
    return;
  }

  // Hide all menu items and show the others
  Array.forEach(popup.childNodes, function(node) {
    var hidden = node.localName === 'menuitem';
    if (node.hidden !== hidden) {
      node.hidden = hidden;
    }
  });

  // Show the menu items with available actions
  $X(availableItem(getAvailableActions()), popup).
  forEach(function(node) {
    node.hidden = false;
  });

  // Hide the useless separators
  $X(uselessSeparator, popup).
  forEach(function(node) {
    node.hidden = true;
  });
}

function getAvailableActions() {
  // @see chrome://browser/content/nsContextMenu.js
  const {gContextMenu} = window;

  var actions = [];

  var onMedia = false;
  if (gContextMenu.onImage ||
      gContextMenu.onCanvas ||
      isImageDocument(gContextMenu.target.ownerDocument)) {
    onMedia = true;

    actions.push('viewImage');
    if (/^(?:https?|ftp):/.test(gContextMenu.imageURL)) {
      actions.push('downloadImage');
    }
  } else if (gContextMenu.onVideo || gContextMenu.onAudio) {
    onMedia = true;

    actions.push('openMedia');
    actions.push('downloadMedia');
  }

  if (gContextMenu.onLink) {
    let URL = gContextMenu.linkURL;

    let ext = FileUtil.matchExt(URL, 'file');
    if (ext) {
      actions.push(FileUtil.makeFileAction('openFile', ext));
    }

    if (FileUtil.matchExt(URL, 'text')) {
      actions.push('viewLinkSource');
    } else if (FileUtil.matchExt(URL, 'image')) {
      actions.push('viewLinkImage');
    } else if (FileUtil.matchExt(URL, 'media')) {
      actions.push('openLinkMedia');
    }

    if (/^https?:/.test(URL)) {
      actions.push('openLink');
      actions.push('downloadLink');
    } else if (/^ftp:/.test(URL)) {
      actions.push('openFTP');
    } else if (/^mailto:/.test(URL)) {
      actions.push('sendMail');
    } else if (/^s?news:/.test(URL)) {
      actions.push('readNews');
    }
  } else if (!onMedia && !gContextMenu.onTextInput) {
    let inText = isTextDocument(gContextMenu.target.ownerDocument);

    actions.push('openPage');
    if (inText) {
      actions.push('viewPageSource');
    }

    if (gContextMenu.inFrame) {
      actions.push('openFrame');
      if (inText) {
        actions.push('viewFrameSource');
      }
    }

    if (gContextMenu.hasBGImage) {
      actions.push('viewBGImage');
      actions.push('downloadBGImage');
    }
  }

  actions.push('launchTool');

  if (actions.length === 1) {
    actions.push('noActions');
  }

  return actions;
}

function doAction(aApp, aAction) {
  // @see chrome://browser/content/nsContextMenu.js
  const {gContextMenu} = window;

  let save = false;
  let sourceDocument = gContextMenu.target.ownerDocument;
  let targetDocument;
  let targetURL;

  switch (FileUtil.getBaseAction(aAction)) {
    case 'launchTool':
      break;
    case 'openPage':
      targetURL = window.content.document.location.href;
      break;
    case 'viewPageSource':
      save = true;
      targetDocument = window.content.document;
      targetURL = targetDocument.location.href;
      break;
    case 'openFrame':
      targetURL = sourceDocument.location.href;
      break;
    case 'viewFrameSource':
      save = true;
      targetDocument = sourceDocument;
      targetURL = targetDocument.location.href;
      break;
    case 'openLink':
    case 'sendMail':
    case 'readNews':
    case 'downloadLink':
    case 'openFTP':
      targetURL = gContextMenu.linkURL;
      break;
    case 'openFile':
    case 'viewLinkSource':
    case 'openLinkMedia':
    case 'viewLinkImage':
      save = true;
      targetURL = gContextMenu.linkURL;
      break;
    case 'openMedia':
      save = true;
      targetURL = gContextMenu.mediaURL;
      break;
    case 'viewImage':
      save = true;
      if (gContextMenu.onImage) {
        targetURL = gContextMenu.imageURL;
      } else if (gContextMenu.onCanvas) {
        targetURL = gContextMenu.target.toDataURL();
      } else {
        targetURL = sourceDocument.location.href;
      }
      break;
    case 'viewBGImage':
      save = true;
      targetURL = gContextMenu.bgImageURL;
      break;
    case 'downloadMedia':
      targetURL = gContextMenu.mediaURL;
      break;
    case 'downloadImage':
      targetURL = gContextMenu.imageURL;
      break;
    case 'downloadBGImage':
      targetURL = gContextMenu.bgImageURL;
      break;
  }

  let saveInfo = null;
  if (save) {
    saveInfo = {
      sourceDocument: sourceDocument,
      targetDocument: targetDocument
    };
  }
  runApp(aApp, targetURL, saveInfo);
}


//********** Utilities

function isImageDocument(aDocument) {
  return aDocument instanceof ImageDocument;
}

function isTextDocument(aDocument) {
  // @see chrome://browser/content/browser.js::
  // mimeTypeIsTextBased
  return window.mimeTypeIsTextBased(aDocument.contentType);
}

function addSeparator(aPopup, aID) {
  return aPopup.appendChild($E('menuseparator', {id: aID}));
}

function $E(aTagOrNode, aAttribute) {
  let node = (typeof aTagOrNode === 'string') ?
    window.document.createElement(aTagOrNode) : aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (name === 'user') {
        [name, value] = value;
      }
      if (value !== null && value !== undefined) {
        node.setAttribute(name, value);
      }
    }
  }

  return node;
}


/**
 * Import from |Util| parameter
 */

function checkApp(aApp) {
  return Util.checkApp(aApp);
}

function runApp(aApp, aTargetURL, aSaveInfo) {
  Util.runApp(aApp, aTargetURL, aSaveInfo);
}

function makeURIURL(aURL) {
  return Util.makeURIURL(aURL);
}

function getContextMenu() {
  return Util.getContextMenu();
}

// |U()| converts embedded chars in the code for displaying properly.
function U(aStr) {
  return Util.toStringForUI(aStr);
}

function addEvent(aData) {
  Util.addEvent(aData);
}

function $X(aXPath, aNode) {
  return Util.getNodesByXPath(aXPath, aNode);
}

function log(aMsg) {
  return Util.log(aMsg);
}


//********** Entry Point

AppLauncher_init();


})


/**
 * Argument of the main function
 * @return Util {hash} utility functions
 */
((function(window, undefined) {


"use strict";


/**
 * Aliases for local special folders
 * @see http://mxr.mozilla.org/mozilla-central/source/xpcom/io/nsDirectoryServiceDefs.h
 */
const kSpecialFolderAliases = [
  // Windows "Program files" folder
  // C:/Program Files/
  '%ProgF%',

  // Windows "Local application data" folder
  // C:/Documents and Settings/{username}/Local Settings/Application Data/
  // C:/Users/{username}/AppData/Local/
  '%LocalAppData%'
];


//********** XPCOM handler

const {Cc, Ci} = window;
function $S(aCID, aIID) Cc[aCID].getService(Ci[aIID]);
function $I(aCID, aIID) Cc[aCID].createInstance(Ci[aIID]);

/**
 * Services
 */
const DirectoryService =
  $S('@mozilla.org/file/directory_service;1', 'nsIProperties');
const IOService =
  $S('@mozilla.org/network/io-service;1', 'nsIIOService');
const PromptService =
  $S('@mozilla.org/embedcomp/prompt-service;1', 'nsIPromptService');

/**
 * Instances
 */
function LocalFile()
  $I('@mozilla.org/file/local;1', 'nsIFile');
function Process()
  $I('@mozilla.org/process/util;1', 'nsIProcess');
function WebBrowserPersist()
  $I('@mozilla.org/embedding/browser/nsWebBrowserPersist;1',
    'nsIWebBrowserPersist');


//********** Functions

function checkApp(aApp) {
  // @note |toStringForUI| converts embedded characters of |kAppList::path|
  // for system internal using
  let path = toStringForUI(aApp.path);
  kSpecialFolderAliases.forEach(function(alias) {
    if (path.indexOf(alias) > -1) {
      path = path.replace(
        RegExp(alias, 'g'),
        getSpecialDirectory(alias.replace(/%/g, '')).
        path.replace(/\\/g, '\\\\')
      );
    }
  });

  let appFile = getAppFile(path);
  if (appFile) {
    aApp.path = path;
    return true;
  }
  return false;
}

function getAppFile(aFilePath) {
  try {
    let file = makeFile(aFilePath);
    if (file &&
        file.exists() &&
        file.isFile() &&
        file.isExecutable()) {
      return file;
    }
  } catch (ex) {}
  return null;
}

function runApp(aApp, aTargetURL, aSaveInfo) {
  if (aSaveInfo) {
    saveAndExecute(aApp, aTargetURL, aSaveInfo);
  } else {
    execute(aApp, aTargetURL);
  }
}

function execute(aApp, aTargetURL) {
  var appFile = getAppFile(aApp.path);
  if (!appFile) {
    warn('Not executed', ['The application is not available now', aApp.path]);
    return;
  }

  // @note |toStringForUI| converts embedded characters of |kAppList::args|
  // for system internal using
  var args = getAppArgs(toStringForUI(aApp.args), aTargetURL);
  var process = Process();
  process.init(appFile);
  // @note Use 'wide string' version for Unicode arguments.
  process.runwAsync(args, args.length);
}

function saveAndExecute(aApp, aTargetURL, aSaveInfo) {
  let sourceURI, saveFilePath, saveFile, privacyContext;
  let persist;

  try {
    sourceURI = makeURI(aTargetURL);
    saveFilePath = getSaveFilePath(sourceURI, aSaveInfo.targetDocument);
    saveFile = makeFile(saveFilePath);
  } catch (ex) {
    warn('Not downloaded', [ex.message, aTargetURL]);
    return;
  }

  privacyContext = getPrivacyContextFor(aSaveInfo.sourceDocument);

  persist = WebBrowserPersist();

  persist.persistFlags =
    Ci.nsIWebBrowserPersist.PERSIST_FLAGS_CLEANUP_ON_FAILURE |
    Ci.nsIWebBrowserPersist.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;

  persist.progressListener = {
    onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
      if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        if (/^(?:https?|ftp):/.test(aRequest.name)) {
          let httpChannel, requestSucceeded, responseStatus;
          try {
            httpChannel = aRequest.QueryInterface(Ci.nsIHttpChannel);
            requestSucceeded = httpChannel.requestSucceeded;
            responseStatus = httpChannel.responseStatus;
          } catch (ex) {
            // @throws NS_ERROR_NOT_AVAILABLE;
            // |requestSucceeded| throws when an invalid URL is requested.
          }

          if (!requestSucceeded) {
            warn('Not downloaded',
              ['HTTP status ' + responseStatus, aRequest.name]);
            return;
          }
        }

        if (!saveFile || !saveFile.exists()) {
          warn('Not downloaded', ['Something wrong', aRequest.name]);
          return;
        }

        execute(aApp, saveFilePath);
      }
    },

    onProgressChange: function() {},
    onLocationChange: function() {},
    onStatusChange: function() {},
    onSecurityChange: function() {}
  };

  persist.saveURI(sourceURI, null, null, null, null, saveFile,
    privacyContext);
}

function getSaveFilePath(aURI, aDocument) {
  const kFileNameForm = 'ucjsAL%NUM%_%FILENAME%';

  let fileName = makeFileName(aURI, aDocument);
  if (!fileName) {
    throw new Error('Unexpected URL for download');
  }

  fileName = kFileNameForm.replace('%FILENAME%', fileName);

  let dir = getSpecialDirectory('TmpD');
  // @see chrome://global/content/contentAreaUtils.js::
  // validateFileName()
  dir.append(window.validateFileName(fileName.replace('%NUM%', '')));

  let uniqueNum = 0;
  while (dir.exists()) {
    dir.leafName = fileName.replace('%NUM%', ++uniqueNum);
  }

  return dir.path;
}

function makeFileName(aURI, aDocument) {
  const kMaxFileNameLen = 32;
  const kDataImageFileName = 'data_image';

  let fileName, extension;
  if (/^(?:https?|ftp)$/.test(aURI.scheme)) {
    // @see chrome://global/content/contentAreaUtils.js::
    // getDefaultFileName()
    fileName = window.getDefaultFileName('', aURI, aDocument);

    // @see chrome://global/content/contentAreaUtils.js::
    // getDefaultExtension()
    let contentType = aDocument ? aDocument.contentType : null;
    extension = window.getDefaultExtension('', aURI, contentType);

    if (extension && fileName.endsWith('.' + extension)) {
      fileName = fileName.slice(0, fileName.lastIndexOf('.'));
    }
    if (!extension && aDocument && /^https?:/.test(aURI.scheme)) {
      extension = 'htm';
    }
  }
  else if (/^data$/.test(aURI.scheme)) {
    let match = /image\/([a-z]+);/.exec(aURI.path);
    if (match) {
      fileName = kDataImageFileName;
      extension = match[1];
    }
  }

  if (fileName) {
    fileName = crop(fileName, kMaxFileNameLen);
    if (extension) {
      fileName += '.' + extension;
    }
    return fileName;
  }
  return null;
}

function crop(aStr, aLen) {
  function trim(str) {
    return str.trim().replace(/[\s-_]+/g, '_');
  }

  if (aStr.length > aLen) {
    let half = Math.floor(aLen / 2);
    return trim(aStr.substr(0, half) + '_' + aStr.substr(-half));
  }
  return aStr;
}

function getAppArgs(aArgs, aURL) {
  if (!aArgs) {
    return aURL ? [aURL] : [];
  }

  return aArgs.map(function(arg) {
    if (aURL) {
      return arg.replace(/%URL%/g, aURL);
    }
    // remove argument that has %URL% when the application is launched as tool
    if (arg.indexOf('%URL%') > -1) {
      return undefined;
    }
    return arg;
  }).filter(function(arg) {
    return arg !== undefined;
  });
}

function getSpecialDirectory(aAlias) {
  return DirectoryService.get(aAlias, Ci.nsIFile);
}

function makeURI(aURL, aDocument) {
  let characterSet = aDocument ? aDocument.characterSet : null;
  return IOService.newURI(aURL, characterSet, null);
}

function makeURIURL(aURL) {
  try {
    return makeURI(aURL).QueryInterface(Ci.nsIURL);
  } catch (ex) {}
  return null;
}

function makeFile(aFilePath) {
  let file = LocalFile();
  file.initWithPath(aFilePath);
  return file;
}

function getPrivacyContextFor(aDocument) {
  try {
    return aDocument.defaultView.
      QueryInterface(Ci.nsIInterfaceRequestor).
      getInterface(Ci.nsIWebNavigation).
      QueryInterface(Ci.nsILoadContext);
  } catch (ex) {}
  return null;
}

function warn(aTitle, aMsg) {
  if (!Array.isArray(aMsg)) {
    aMsg = [aMsg];
  }

  var msg = log('Error: ' + aTitle + '\n' + aMsg.join('\n'));

  if (msg.length > 200) {
    msg = msg.substr(0, 200) + '\n...(see console log)';
  }

  PromptService.alert(null, null, msg);
}


//********** Import

function getContextMenu() {
  return window.ucjsUI.ContentArea.contextMenu;
}

function toStringForUI(aStr) {
  return window.ucjsUtil.toStringForUI(aStr);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function getNodesByXPath(aXPath, aNode) {
  return window.ucjsUtil.getNodesByXPath(aXPath, aNode);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('AppLauncher.uc.js', aMsg);
}


//********** Export

return {
  checkApp: checkApp,
  runApp: runApp,
  makeURIURL: makeURIURL,
  getContextMenu: getContextMenu,
  toStringForUI: toStringForUI,
  addEvent: addEvent,
  getNodesByXPath: getNodesByXPath,
  log: log
};


})(this), this);
