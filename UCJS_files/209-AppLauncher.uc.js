// ==UserScript==
// @name        AppLauncher.uc.js
// @description Application launcher.
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js
// @usage Access to items in the main context menu.

// @note A resource file that is passed to the application will be saved in your temporary folder.
//   see doAction() and Util::getSavePath().


/**
 * Main function.
 * @param Util {hash} Utility functions.
 */
(function(Util) {


"use strict";


// Preferences.

/**
 * List of user applications.
 */
const kAppList = [
  {
    // Displayed name.
    name: 'IE',

    // @see keys in kTypeAction.
    type: 'browse',

    // Alias of the special folder is avalable.
    // @see kSpecialFolderAliases.
    // %ProgF%: program folder.
    // %LocalAppData%: local application data folder.
    path: '%ProgF%\\Internet Explorer\\iexplore.exe',

    // [OPTIONAL] Commandline arguments.
    // %URL% is replaced with suitable URL for each action.
    // When omitted or empty, equal to args:'%URL%'.
    args: '-new %URL%',

    // [OPTIONAL] This item is disabled.
    disabled: true
  },
  {
    name: 'WMP',
    // Open a link of the specific file extension.
    type: 'file=asx|wax|wvx',
    path: '%ProgF%\\Windows Media Player\\wmplayer.exe',
    args: '/prefetch:1 %URL%'
  },
  {
    name: 'Foxit',
    type: 'file=pdf',
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
 * Actions for each types.
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
  download: ['downloadLink', 'downloadMedia', 'downloadImage', 'downloadBGImage'],
  ftp:      ['openFTP']
};

/**
 * File extensions for each actions.
 */
const kLinkExt = {
  file:  '', // [RESERVED] Put a empty string.
  text:  'css|js|txt|xml',
  media: 'asf|asx|avi|flv|mid|mov|mp3|mp4|mpg|ogg|ogv|pls|ra|ram|rm|wav|wax|webm|wma|wmv|wvx',
  image: 'bmp|gif|jpg|png'
};

/**
 * Bundle strings for UI.
 */
const kBundle = {
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
  },

  UI: {
    mainMenuLabel: 'AppLauncher',
    mainMenuAccesskey: 'L',
    appMenuLabel: 'Applications'
  },

  ID: {
    mainMenu:       'ucjs_applauncher_menu',
    actionKey:      'ucjs_applauncher_action',
    startSeparator: 'ucjs_applauncher_start_sep',
    endSeparator:   'ucjs_applauncher_end_sep'
  }
};


// Functions.

function AppLauncher_init() {
  var appInfo = initAppInfo();

  if (appInfo) {
    makeMainMenu(appInfo);
  }
}

function initAppInfo() {
  var apps = [];

  apps = kAppList.filter(function(app) {
    var {name, type, path, disabled} = app;

    if (!disabled && name) {
      if (type in kTypeAction) {
        return checkPath(path);
      }
      let match = /^file=(.+)$/.exec(type);
      if (match) {
        app.type = 'file';
        app.extensions = match[1];
        return checkPath(path);
      }
    }
    return false;
  });

  var order = [i for (i in kTypeAction)];
  apps.sort(function(a, b) {
    return order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name);
  });

  return apps.length ? apps : null;
}

function makeMainMenu(aAppInfo) {
  var {UI, ID} = kBundle;

  var menu = $E('menu');
  menu.id = ID.mainMenu;
  setLabel(menu, UI.mainMenuLabel);
  menu.setAttribute('accesskey', UI.mainMenuAccesskey);

  var popup = $E('menupopup');
  addEvent([popup, 'popupshowing', doBrowse, false]);

  makeAppMenu(popup, aAppInfo);
  makeActionItems(popup, aAppInfo);

  menu.appendChild(popup);

  var context = getContextMenu();
  addSeparator(context).id = ID.startSeparator;
  context.appendChild(menu);
  addSeparator(context).id = ID.endSeparator;
  // @note ucjsUI_manageContextMenuSeparators() manages the visibility of separators.
}

function makeAppMenu(aPopup, aAppInfo) {
  var menu = $E('menu');
  setLabel(menu, kBundle.UI.appMenuLabel);

  var popup = $E('menupopup');
  popup.setAttribute('onpopupshowing', 'event.stopPropagation();');
  popup.setAttribute('onpopuphiding', 'event.stopPropagation();');

  aAppInfo.forEach(function(app) addMenuItem(popup, 'launchTool', app, true));

  menu.appendChild(popup);
  aPopup.appendChild(menu);
}

function makeActionItems(aPopup, aAppInfo) {
  var type, lastType = '';
  var actions, exts;

  aAppInfo.forEach(function(app) {
    type = app.type;

    if (type !== lastType) {
      addSeparator(aPopup);
      lastType = type;
    }

    actions = kTypeAction[type];

    if (type === 'file') {
      exts = gFileType.getExtArray(app.extensions);

      gFileType.setFileExt(exts);

      actions = actions.reduce(function(a, b) {
        return a.concat(exts.map(function(ext) gFileType.makeFileAction(b, ext)));
      }, []);
    }

    actions.forEach(function(action) addMenuItem(aPopup, action, app));
  });

  addSeparator(aPopup);
  addMenuItem(aPopup, 'noActions');
}

function addMenuItem(aPopup, aAction, aApp, aInAppMenu) {
  var item = $E('menuitem');

  var label;
  if (aInAppMenu) {
    label = kBundle.type[aApp.type];
    if (aApp.type === 'file') {
      label = label.replace('%1', gFileType.getExtArray(aApp.extensions).join(','));
    }
    label += ': ' + aApp.name;
  } else {
    label = kBundle.action[gFileType.getBaseAction(aAction)];
    if (aApp) {
      label = label.replace('%1', aApp.name);
    }
  }
  setLabel(item, label);

  item.setAttribute(kBundle.ID.actionKey, aAction);

  if (aApp) {
    addEvent([item, 'command', function() doAction(aApp, aAction), false]);
  } else {
    item.setAttribute('disabled', true);
  }

  aPopup.appendChild(item);
}

function doBrowse(aEvent) {
  // XPath for useless separator that has no visible siblings or visible separator neighbor.
  const uselessSeparator = 'xul:menuseparator[not(preceding-sibling::*[not(@hidden)]) or not(following-sibling::*[not(@hidden)]) or local-name(following-sibling::*[not(@hidden)])="menuseparator"]';

  function availableItem(actions) {
    var actionKey = '@' + kBundle.ID.actionKey + '="';
    return 'xul:menuitem[' + actionKey + actions.join('" or ' + actionKey) + '"]';
  }

  aEvent.stopPropagation();
  var popup = aEvent.target;

  // Hide all menu items and show the others.
  Array.forEach(popup.childNodes, function(node) {
    var hidden = node.localName === 'menuitem';
    node.hidden !== hidden && (node.hidden = hidden);
  });

  // Show menu items with available actions.
  $X(availableItem(getAvailableActions()), popup).forEach(function(node) {
    node.hidden = false;
  });

  // Hide useless separators.
  $X(uselessSeparator, popup).forEach(function(node) {
    node.hidden = true;
  });
}

function getAvailableActions() {
  var actions = [];

  var onMedia = false;

  if (gContextMenu.onImage || gContextMenu.onCanvas || inImagePage()) {
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

    let ext = gFileType.matchExt(URL, 'file');
    if (ext) {
      actions.push(gFileType.makeFileAction('openFile', ext));
    }

    if (gFileType.matchExt(URL, 'text')) {
      actions.push('viewLinkSource');
    } else if (gFileType.matchExt(URL, 'image')) {
      actions.push('viewLinkImage');
    } else if (gFileType.matchExt(URL, 'media')) {
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
    let inText = inTextPage();

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
  var URL = '';
  var save = false;

  switch (gFileType.getBaseAction(aAction)) {
    case 'launchTool':
      break;
    case 'openPage':
      URL = content.location.href;
      break;
    case 'viewPageSource':
      URL = content.location.href;
      save = true;
      break;
    case 'openFrame':
      URL = gContextMenu.target.ownerDocument.location.href;
      break;
    case 'viewFrameSource':
      URL = gContextMenu.target.ownerDocument.location.href;
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
        URL = gContextMenu.target.ownerDocument.location.href;
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

  runApp(aApp, URL, save);
}


// Utilities.

/**
 * Handler for file extensions.
 * @see kLinkExt
 */
var gFileType = {
  makeFileAction: function(aAction, aExt) {
    return aAction + '_' + aExt;
  },

  getBaseAction: function(aAction) {
    return aAction.replace(/_.+$/, '');
  },

  getExtArray: function(aExt) {
    return aExt.split('|');
  },

  setFileExt: function(aExtArray) {
    var fileExts = this.getExtArray(kLinkExt['file']);

    aExtArray.forEach(function(ext) {
      if (fileExts.indexOf(ext) === -1) {
        fileExts.push(ext);
      }
    });

    kLinkExt['file'] = fileExts.join('|');
  },

  matchExt: function(aURL, aType) {
    var ext = this.getExt(aURL);

    if (ext && this.getExtArray(kLinkExt[aType]).indexOf(ext) > -1) {
        return ext;
    }
    return '';
  },

  getExt: function(aURL) {
    if (aURL) {
      try {
        let URI = makeURI(aURL, null, null);

        return URI ? URI.QueryInterface(Ci.nsIURL).fileExtension : '';
      } catch (e) {}
    }
    return '';
  }
};


function inImagePage()
  (gContextMenu.target.ownerDocument instanceof ImageDocument);

function inTextPage()
  /^(?:text|application)\//.test(gContextMenu.target.ownerDocument.contentType);

function $(aId)
  document.getElementById(aId);

function $E(aTag)
  document.createElement(aTag);

function addSeparator(aPopup)
  aPopup.appendChild($E('menuseparator'));

function setLabel(aNode, aStr)
  aNode.setAttribute('label', Util.str4ui(aStr));


function getContextMenu()
  Util.getContextMenu();

function checkPath(aPath)
  Util.isExecutable(aPath);

function runApp(aApp, aURL, aSave)
  Util.runApp(aApp, aURL, aSave);

function $X(aXPath, aNode)
  Util.getNodesByXPath(aXPath, aNode);

function addEvent(aData)
  Util.addEvent(aData);

function log(aMsg)
  Util.log(aMsg);


// Entry Point.

AppLauncher_init();


})


/**
 * Arguments of main function.
 * @return Util {hash} Utility functions.
 */
((function() {


"use strict";


// Preferences.

/**
 * Aliases for local special folders.
 * @note cf. http://mxr.mozilla.org/mozilla-central/source/xpcom/io/nsDirectoryServiceDefs.h
 */
const kSpecialFolderAliases = [
  // Program files.
  // Usually "C:\Program Files".
  '%ProgF%',

  // Local application data.
  // Usually "C:\Documents and Settings\(USERNAME)\Local Settings\Application Data".
  '%LocalAppData%'
];


// Settings for XPCOM.

const {classes: Cc, interfaces: Ci} = Components;
function $S(aCID, aIID) Cc[aCID].getService(Ci[aIID]);
function $I(aCID, aIID) Cc[aCID].createInstance(Ci[aIID]);

// Services.
const DirectoryService =
  $S('@mozilla.org/file/directory_service;1', 'nsIProperties');
const IOService =
  $S('@mozilla.org/network/io-service;1', 'nsIIOService');

// Instances.
function LocalFile()
  $I('@mozilla.org/file/local;1', 'nsILocalFile');
function Process()
  $I('@mozilla.org/process/util;1', 'nsIProcess');
function WebBrowserPersist()
  $I('@mozilla.org/embedding/browser/nsWebBrowserPersist;1', 'nsIWebBrowserPersist');


// Functions.

function runApp(aApp, aURL, aSave) {
  if (aSave) {
    saveAndExecute(aApp, aURL);
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
        getSpecialDirectory(alias.replace(/%/g, '')).path.replace(/\\/g, '\\\\')
      );
    }
  });

  var file = LocalFile();

  try {
    file.initWithPath(str4ui(aPath));
  } catch (e) {
    return null;
  }

  return (file && file.exists() && file.isFile() && file.isExecutable()) ? file : null;
}

function execute(aApp, aURL) {
  var exe = getExecutable(aApp.path);
  if (!exe) {
    warn('Not executed', ['Registered application is not available now', aApp.path]);
    return;
  }

  var args = getAppArgs(aApp.args, aURL);

  var process = Process();

  process.init(exe);
  process.run(false, args, args.length);
}

function saveAndExecute(aApp, aURL) {
  try {
    var savePath = getSavePath(aURL);
    var source = IOService.newURI(aURL, null, null);
    var target = LocalFile();

    target.initWithPath(savePath);
  } catch (e) {
    warn('Not downloaded', [aURL, e.message]);
    return;
  }

  var persist = WebBrowserPersist();

  persist.persistFlags =
    Ci.nsIWebBrowserPersist.PERSIST_FLAGS_CLEANUP_ON_FAILURE |
    Ci.nsIWebBrowserPersist.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;

  persist.progressListener = {
    onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
      if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        let responseStatus = null;
        try {
          responseStatus = aRequest.QueryInterface(Ci.nsIHttpChannel).responseStatus;
        } catch (e) {
          // @throws NS_NOINTERFACE 'data:image' is requested.
        }
        if (responseStatus && responseStatus !== 200) {
          warn('Not downloaded', ['HTTP status ' + responseStatus, aRequest.name]);
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

  persist.saveURI(source, null, null, null, null, target);
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
  dir.append(validateFileName(leafName.replace('%NUM%', '')));

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

  return args.map(function(arg) arg.replace(/%SPC%/g, ' ').replace(/%URL%/g, aURL));
}

function getSpecialDirectory(aAlias)
  DirectoryService.get(aAlias, Ci.nsIFile);

function str4ui(aStr)
  ucjsUtil.convertForSystem(aStr);

function warn(aTitle, aMsg) {
  if (!Array.isArray(aMsg)) {
    aMsg = [aMsg];
  }

  var msg = log('Error: ' + aTitle + '\n' + aMsg.join('\n'));

  if (msg.length > 200) {
    msg = msg.substr(0, 200) + ' ...\n(see console log)';
  }
  alert(msg);
}

function log(aMsg)
  ucjsUtil.logMessage('AppLauncher.uc.js', aMsg);


// Export.

return {
  getContextMenu: function() ucjsUI.ContentArea.contextMenu,
  isExecutable: function(aPath) !!getExecutable(aPath),
  runApp: runApp,
  getNodesByXPath: ucjsUtil.getNodesByXPath,
  addEvent: ucjsUtil.setEventListener,
  str4ui: str4ui,
  log: log
};


})());
