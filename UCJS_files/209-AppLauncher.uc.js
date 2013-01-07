// ==UserScript==
// @name        AppLauncher.uc.js
// @description Application launcher
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the main context menu.

// @note A resource file that is passed to the application will be saved in
// your temporary folder. See doAction(), Util::getSavePath()


/**
 * Main function
 * @param Util {hash} utility functions
 */
(function(Util, window, undefined) {


"use strict";


//********** Preferences

/**
 * List of user applications
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
    // %URL% is replaced with suitable URL for each action.
    // When omitted or empty, equal to args:'%URL%'.
    args: '-new %URL%',

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
    args: '/prefetch:1 %URL%'
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
    args: '-news %URL%',
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
    name: 'CintaNotes',
    type: 'tool',
    path: 'C:\\PF\\CintaNotes\\CintaNotes.exe'
  },
  {
    name: 'KeePass',
    type: 'tool',
    path: 'C:\\PF\\KeePass\\KeePass.exe'
  },
  {
    name: 'VideoCacheView',
    type: 'tool',
    path: 'C:\\PF\\videocacheview\\VideoCacheView.exe'
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

    let ext;
    try {
      // @see chrome://global/content/contentAreaUtils.js::
      // makeURI
      let URI = window.makeURI(aURL, null, null);
      if (URI) {
        ext = URI.QueryInterface(window.Ci.nsIURL).fileExtension;
      }
    } catch (e) {}

    if (ext && kLinkExtension[aType].indexOf(ext) > -1) {
      return ext;
    }
    return null;
  }
};


//********** Functions

function AppLauncher_init() {
  var appInfo = initAppInfo();

  if (appInfo) {
    makeMainMenu(appInfo);
  }
}

function initAppInfo() {
  var apps = [];

  apps = kAppList.filter(function(app) {
    var {name, type, extensions, path, disabled} = app;

    if (!disabled && name) {
      if (type in kTypeAction) {
        if (type !== 'file' || (extensions && extensions.length)) {
          let check = checkPath(path);
          if (check && type === 'file') {
            FileUtil.updateFileExt(extensions);
          }
          return check;
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

function makeMainMenu(aAppInfo) {
  var menu = $E('menu', {
    id: kID.mainMenu,
    label: U(kUI.mainMenuLabel),
    accesskey: kUI.mainMenuAccesskey
  });

  var popup = $E('menupopup');
  addEvent([popup, 'popupshowing', doBrowse, false]);

  makeAppMenu(popup, aAppInfo);
  makeActionItems(popup, aAppInfo);

  menu.appendChild(popup);

  // @note ucjsUI_manageContextMenuSeparators() manages the visibility of
  // separators.
  var context = getContextMenu();
  addSeparator(context, kID.startSeparator);
  context.appendChild(menu);
  addSeparator(context, kID.endSeparator);
}

function makeAppMenu(aPopup, aAppInfo) {
  var menu = $E('menu', {
    label: U(kUI.appMenuLabel)
  });

  var popup = $E('menupopup');

  aAppInfo.forEach(function(app) {
    addMenuItem(popup, 'launchTool', app, true);
  });

  menu.appendChild(popup);
  aPopup.appendChild(menu);
}

function makeActionItems(aPopup, aAppInfo) {
  var type, lastType = '';
  var actions;

  aAppInfo.forEach(function(app) {
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
  // XPath for useless separator that has no visible siblings or visible
  // separator neighbor.
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

  // Show menu items with available actions
  $X(availableItem(getAvailableActions()), popup).
  forEach(function(node) {
    node.hidden = false;
  });

  // Hide useless separators
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

  var URL = '';
  var save = false;
  var sourceWindow = gContextMenu.target.ownerDocument.defaultView;

  switch (FileUtil.getBaseAction(aAction)) {
    case 'launchTool':
      break;
    case 'openPage':
      URL = window.content.location.href;
      break;
    case 'viewPageSource':
      URL = window.content.location.href;
      save = true;
      break;
    case 'openFrame':
      URL = sourceWindow.location.href;
      break;
    case 'viewFrameSource':
      URL = sourceWindow.location.href;
      save = true;
      break;
    case 'openLink':
    case 'sendMail':
    case 'readNews':
    case 'downloadLink':
    case 'openFTP':
      URL = gContextMenu.linkURL;
      break;
    case 'openFile':
    case 'viewLinkSource':
    case 'openLinkMedia':
    case 'viewLinkImage':
      URL = gContextMenu.linkURL;
      save = true;
      break;
    case 'openMedia':
      URL = gContextMenu.mediaURL;
      save = true;
      break;
    case 'viewImage':
      if (gContextMenu.onImage) {
        URL = gContextMenu.imageURL;
      } else if (gContextMenu.onCanvas) {
        URL = gContextMenu.target.toDataURL();
      } else {
        URL = sourceWindow.location.href;
      }
      save = true;
      break;
    case 'viewBGImage':
      URL = gContextMenu.bgImageURL;
      save = true;
      break;
    case 'downloadMedia':
      URL = gContextMenu.mediaURL;
      break;
    case 'downloadImage':
      URL = gContextMenu.imageURL;
      break;
    case 'downloadBGImage':
      URL = gContextMenu.bgImageURL;
      break;
  }

  runApp(aApp, URL, save ? sourceWindow : null);
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
function getContextMenu()
  Util.getContextMenu();

function checkPath(aPath)
  Util.isExecutable(aPath);

function runApp(aApp, aURL, aSourceWindow)
  Util.runApp(aApp, aURL, aSourceWindow);

function U(aStr)
  Util.toStringForUI(aStr);

function $X(aXPath, aNode)
  Util.getNodesByXPath(aXPath, aNode);

function addEvent(aData)
  Util.addEvent(aData);

function log(aMsg)
  Util.log(aMsg);


//********** Entry Point

AppLauncher_init();


})


/**
 * Arguments of the main function
 * @return Util {hash} utility functions
 */
((function(window, undefined) {


"use strict";


//********** Preferences

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


//********** XPCOM settings

const {classes: Cc, interfaces: Ci} = window.Components;
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

function runApp(aApp, aURL, aSourceWindow) {
  if (aSourceWindow) {
    saveAndExecute(aApp, aURL, aSourceWindow);
  } else {
    execute(aApp, aURL);
  }
}

function getExecutable(aPath) {
  if (!aPath)
    return null;

  kSpecialFolderAliases.forEach(function(alias) {
    if (aPath.indexOf(alias) > -1) {
      aPath = aPath.replace(
        RegExp(alias, 'g'),
        getSpecialDirectory(alias.replace(/%/g, '')).
        path.replace(/\\/g, '\\\\')
      );
    }
  });

  try {
    var file = LocalFile();
    // @note |toStringForUI| converts 2bytes characters of |kAppList::path|
    // into unicode ones so that |initWithPath| can accept them.
    file.initWithPath(toStringForUI(aPath));
    if (file && file.exists() && file.isFile() && file.isExecutable())
      return file;
  } catch (e) {}
  return null;
}

function isExecutable(aPath) {
  return !!getExecutable(aPath);
}

function checkFile(aFilePath) {
  try {
    var file = LocalFile();
    file.initWithPath(aFilePath);
    return file && file.exists();
  } catch (e) {}
  return false;
}

function execute(aApp, aURL) {
  var exe = getExecutable(aApp.path);
  if (!exe) {
    warn('Not executed',
      ['Registered application is not available now', aApp.path]);
    return;
  }

  var args = getAppArgs(aApp.args, aURL);

  var process = Process();

  process.init(exe);
  process.run(false, args, args.length);
}

function saveAndExecute(aApp, aURL, aSourceWindow) {
  try {
    var savePath = getSavePath(aURL);
    var source = IOService.newURI(aURL, null, null);
    var target = LocalFile();

    target.initWithPath(savePath);
  } catch (e) {
    warn('Not downloaded', [e.message, aURL]);
    return;
  }

  var privacyContext =
    aSourceWindow.top.
    QueryInterface(Ci.nsIInterfaceRequestor).
    getInterface(Ci.nsIWebNavigation).
    QueryInterface(Ci.nsILoadContext);

  var persist = WebBrowserPersist();

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
          } catch (e) {
            // @throws NS_ERROR_NOT_AVAILABLE;
            // |requestSucceeded| throws when an invalid URL is requested.
          }

          if (!requestSucceeded) {
            warn('Not downloaded',
              ['HTTP status ' + responseStatus, aRequest.name]);
            return;
          }
        }

        if (!checkFile(savePath)) {
          warn('Not downloaded', ['Something wrong', aRequest.name]);
          return;
        }

        execute(aApp, savePath);
      }
    },

    onProgressChange: function() {},
    onLocationChange: function() {},
    onStatusChange: function() {},
    onSecurityChange: function() {}
  };

  persist.saveURI(sourceURI, null, null, null, null, targetFile,
    privacyContext);
}

function getSavePath(aURL) {
  const kFileNameForm = 'ucjsAL%NUM%_%LEAF%';

  var leafName = '';
  var match;
  if (/^(?:https?|ftp):/.test(aURL)) {
    let path = aURL.replace(/[?#].*$/, '');
    leafName = path.substr(path.lastIndexOf('/') + 1).substr(-32) || 'index';
    if (leafName.indexOf('.') === -1) {
      leafName += '.htm';
    }
  } else if ((match = /^data:image\/(png|jpeg|gif)/.exec(aURL))) {
    leafName = 'data.' + match[1];
  } else {
    throw new Error('Unexpected scheme for download');
  }

  leafName = kFileNameForm.replace('%LEAF%', leafName);

  var dir = getSpecialDirectory('TmpD');
  // @see chrome://global/content/contentAreaUtils.js::
  // validateFileName()
  dir.append(window.validateFileName(leafName.replace('%NUM%', '')));

  var uniqueNum = 0;
  while (dir.exists()) {
    dir.leafName = leafName.replace('%NUM%', ++uniqueNum);
  }

  return dir.path;
}

function getAppArgs(aArgs, aURL) {
  if (!aArgs)
    return [aURL];

  var args = aArgs.
    trim().replace(/\s+/g, ' ').
    replace(/".+?"/g, function($0) $0.replace(/ /g, '%SPC%')).
    split(' ');

  return args.map(function(arg) {
    return arg.replace(/%SPC%/g, ' ').replace(/%URL%/g, aURL);
  });
}

function getSpecialDirectory(aAlias)
  DirectoryService.get(aAlias, Ci.nsIFile);

function warn(aTitle, aMsg) {
  if (!Array.isArray(aMsg)) {
    aMsg = [aMsg];
  }

  var msg = log('Error: ' + aTitle + '\n' + aMsg.join('\n'));

  if (msg.length > 200) {
    msg = msg.substr(0, 200) + ' ...\n(see console log)';
  }

  PromptService.alert(null, null, msg);
}


//********** Import

function getContextMenu()
  window.ucjsUI.ContentArea.contextMenu;

function getNodesByXPath(aXPath, aNode)
  window.ucjsUtil.getNodesByXPath(aXPath, aNode);

function addEvent(aData)
  window.ucjsUtil.setEventListener(aData);

function toStringForUI(aStr)
  window.ucjsUtil.toStringForUI(aStr);

function log(aMsg)
  window.ucjsUtil.logMessage('AppLauncher.uc.js', aMsg);


//********** Export

return {
  getContextMenu: getContextMenu,
  isExecutable: isExecutable,
  runApp: runApp,
  getNodesByXPath: getNodesByXPath,
  addEvent: addEvent,
  toStringForUI: toStringForUI,
  log: log
};


})(this), this);
