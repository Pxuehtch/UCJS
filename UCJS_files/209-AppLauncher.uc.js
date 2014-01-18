// ==UserScript==
// @name        AppLauncher.uc.js
// @description Application launcher
// @include     main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage access to items in the main context menu
// @note available menu items will vary depending on where the menu opens
// @see |getAvailableActions()|

// @note a resource file that is passed to an application will be saved in
// your temporary folder if download needed
// @see |doAction()|, |Util::getSaveFilePath()|


/**
 * Main function
 * @param Util {hash} utility functions
 * @param window {hash} the global |Window| object
 * @param undefined {undefined} the |undefined| constant
 */
(function(Util, window, undefined) {


"use strict";


/**
 * Import from |Util|
 */
const {
  checkApp,
  runApp,
  makeURIURL,
  getContextMenu,
  addEvent,
  getNodesByXPath: $X,
  // for debug
  log
} = Util;

/**
 * Application list
 *
 * @note don't add a property 'index' that is reserved for internal use
 * @see |initAppList()|
 */
const kAppList = [
  {
    // display name
    name: 'IE',

    // type for available actions
    // @see |kTypeAction|
    type: 'browse',

    // executable file path
    // @note some alias of the special folder is available
    // @see |kSpecialFolderAliases|
    //   %ProgF%: program files folder
    //   %LocalAppData%: local application data folder
    path: '%ProgF%/Internet Explorer/iexplore.exe',

    // [optional] commandline arguments
    // @note %URL% is replaced with the proper URL of each action
    // @note if absent or empty array, it equals to <args: ['%URL%']>
    // @note if launched as tool, an argument that contains %URL% is ignored
    args: ['-new', '%URL%'],

    // [optional] this item is disabled
    disabled: true
  },
  {
    name: 'WMP',

    // @note if <type> is 'file', you should set <extensions> to describe the
    // file extensions of a link URL that is passed to the application
    type: 'file',
    extensions: ['asx', 'wax', 'wvx'],

    path: '%ProgF%/Windows Media Player/wmplayer.exe',
    args: ['/prefetch:1', '%URL%']
  },
  {
    name: 'Foxit',
    type: 'file',
    extensions: ['pdf'],
    path: 'C:/PF/FoxitReader/Foxit Reader.exe'
  },
  {
    name: 'Opera',
    type: 'browse',
    path: '%ProgF%/Opera/opera.exe'
  },
  {
    name: 'Chrome',
    type: 'browse',
    path: '%LocalAppData%/Google/Chrome/Application/chrome.exe'
  },
  {
    name: 'unDonut',
    type: 'browse',
    path: 'C:/PF/unDonut/unDonut.exe'
  },
  {
    name: 'TB',
    type: 'mail',
    path: '%ProgF%/Mozilla Thunderbird/thunderbird.exe'
  },
  {
    name: 'TB',
    type: 'news',
    path: '%ProgF%/Mozilla Thunderbird/thunderbird.exe',
    args: ['-news', '%URL%']
  },
  {
    name: 'MassiGra',
    type: 'image',
    path: 'C:/PF/MassiGra/MassiGra.exe'
  },
  {
    name: 'MPC',
    type: 'media',
    path: 'C:/PF/MPC-HC/mpc-hc.exe'
  },
  {
    name: 'Irvine',
    type: 'download',
    path: 'C:/PF/Irvine/irvine.exe'
  },
  {
    name: '',
    type: 'ftp',
    path: ''
  },
  {
    name: 'VxEditor',
    type: 'text',
    path: 'C:/PF/VxEditor/VxEditor.exe'
  },
  {
    name: 'KeePass2',
    type: 'tool',
    path: 'C:/PF/KeePass2/KeePass.exe'
  }
];

/**
 * Actions for each types
 *
 * @note displayed in the declared order
 */
const kTypeAction = [
  {
    type: 'tool',
    actions: [
      'launchTool'
    ]
  },
  {
    type: 'file',
    actions: [
      'openFile'
    ]
  },
  {
    type: 'browse',
    actions: [
      'openPage',
      'openFrame',
      'openLink'
    ]
  },
  {
    type: 'text',
    actions: [
      'viewPageSource',
      'viewFrameSource',
      'viewLinkSource'
    ]
  },
  {
    type: 'mail',
    actions: [
      'sendMail'
    ]
  },
  {
    type: 'news',
    actions: [
      'readNews'
    ]
  },
  {
    type: 'media',
    actions: [
      'openLinkMedia',
      'openMedia'
    ]
  },
  {
    type: 'image',
    actions: [
      'viewLinkImage',
      'viewImage',
      'viewBGImage'
    ]
  },
  {
    type: 'download',
    actions: [
      'downloadLink',
      'downloadMedia',
      'downloadImage',
      'downloadBGImage'
    ]
  },
  {
    type: 'ftp',
    actions: [
      'openFTP'
    ]
  },
];

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
    viewPageSource:  'View Page Source with %1',
    viewFrameSource: 'View Frame Source with %1',
    viewLinkSource:  'View Link Source with %1',
    sendMail:        'Send Email with %1',
    readNews:        'Read News with %1',
    openLinkMedia:   'Open Linked Media in %1',
    viewLinkImage:   'View Linked Image with %1',
    openMedia:       'Open Media in %1',
    viewImage:       'View Image with %1',
    viewBGImage:     'View BG-Image with %1',
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
  // @note *SET NO VALUES* they will be automatically created with
  // |kAppList.extensions|. see |FileExtUtil::updateFileExt()|
  file:  [],
  // for <viewLinkSource>
  text:  ['css', 'js', 'txt', 'xml'],
  // for <viewLinkImage>
  image: ['bmp', 'gif', 'jpg', 'png'],
  // for <openLinkMedia>
  media: ['asf', 'asx', 'avi', 'flv', 'mid',
          'mov', 'mp3', 'mp4', 'mpg', 'ogg',
          'ogv', 'pls', 'ra', 'ram', 'rm',
          'wav', 'wax', 'webm', 'wma', 'wmv',
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
  appIndexKey: 'ucjs_applauncher_appIndex',
  actionKey: 'ucjs_applauncher_action',
  startSeparator: 'ucjs_applauncher_startsep',
  endSeparator: 'ucjs_applauncher_endsep'
};

/**
 * Utility for the file extensions
 */
const FileExtUtil = {
  makeFileAction: function(aAction, aExt) {
    return aAction + '_' + aExt;
  },

  getBaseAction: function(aAction) {
    return aAction.replace(/_.+$/, '');
  },

  updateFileExt: function(aExtArray) {
    // add new extensions
    let fileExts = kLinkExtension['file'].concat(aExtArray);

    // update array with the unique extensions
    kLinkExtension['file'] =
    fileExts.filter((ext, i, array) => array.indexOf(ext) === i);
  },

  matchExt: function(aURL, aType) {
    let URL = aURL && makeURIURL(aURL);
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
  let appList = initAppList();

  if (appList) {
    makeMainMenu(appList);
  }
}

function initAppList() {
  // filter valid list items
  let apps = kAppList.filter((app) => {
    let {name, type, extensions, path, disabled} = app;

    // 1.required properties
    if (!disabled && name && type && path) {
      // 2.valid action type
      if (kTypeAction.some((item) => item.type === type)) {
        // 3.required 'extentions' property if type is 'file'
        if (type !== 'file' || (extensions && extensions.length)) {
          // 4.valid application
          if (checkApp(app)) {
            if (type === 'file') {
              FileExtUtil.updateFileExt(extensions);
            }
            return true;
          }
        }
      }
    }
    return false;
  });

  if (!apps.length) {
    return null;
  }

  // sort items in type actions order and then alphabetical order
  let order = kTypeAction.map(({type}) => type);
  apps.sort((a, b) =>
    order.indexOf(a.type) - order.indexOf(b.type) ||
    a.name.localeCompare(b.name)
  );

  // set the array index inside each item
  // TODO: avoid adding a new property that could cause an unexpected conflict
  // in a constant |kAppList|
  apps.forEach((app, i) => app.index = i);

  return apps;
}

function makeMainMenu(aAppList) {
  let menu = $E('menu', {
    id: kID.mainMenu,
    label: kUI.mainMenuLabel,
    accesskey: kUI.mainMenuAccesskey
  });

  let popup = $E('menupopup');

  addEvent([popup, 'popupshowing', (aEvent) => {
    aEvent.stopPropagation();

    let target = aEvent.target;
    if (target.parentElement.id !== kID.mainMenu) {
      return;
    }

    doBrowse(target);
  }, false]);

  addEvent([popup, 'command', (aEvent) => {
    aEvent.stopPropagation();

    let target = aEvent.target;
    if (!target.hasAttribute(kID.appIndexKey)) {
      return;
    }

    let appIndex = +(target.getAttribute(kID.appIndexKey));
    if (appIndex < 0) {
      return;
    }

    doAction(aAppList[appIndex], target.getAttribute(kID.actionKey));
  }, false]);

  makeAppMenu(popup, aAppList);
  makeActionItems(popup, aAppList);

  menu.appendChild(popup);

  // @note ucjsUI_manageContextMenuSeparators() manages the visibility of
  // separators.
  let context = getContextMenu();
  addSeparator(context, kID.startSeparator);
  context.appendChild(menu);
  addSeparator(context, kID.endSeparator);
}

function makeAppMenu(aPopup, aAppList) {
  let appMenu = $E('menu', {
    label: kUI.appMenuLabel
  });

  let appMenuPopup = $E('menupopup');

  aAppList.forEach((app) => {
    addMenuItem(appMenuPopup, {
      action: 'launchTool',
      app: app,
      inAppMenu: true
    });
  });

  appMenu.appendChild(appMenuPopup);
  aPopup.appendChild(appMenu);
}

function makeActionItems(aPopup, aAppList) {
  let lastType;

  aAppList.forEach((app) => {
    let type = app.type;

    if (type !== lastType) {
      addSeparator(aPopup);
      lastType = type;
    }

    let actions;
    kTypeAction.some((item) => {
      if (item.type === type) {
        actions = item.actions;
        return true;
      }
      return false;
    });

    if (type === 'file') {
      // make actions with extensions
      actions = actions.reduce((a, b) => {
        return a.concat(app.extensions.map((ext) => {
          return FileExtUtil.makeFileAction(b, ext);
        }));
      }, []);
    }

    actions.forEach((action) => {
      addMenuItem(aPopup, {
        action: action,
        app: app
      });
    });
  });

  addSeparator(aPopup);
  addMenuItem(aPopup, {
    action: 'noActions',
    app: null
  });
}

function addMenuItem(aPopup, aParam) {
  let {action, app, inAppMenu} = aParam;

  let appIndex = app ? app.index : -1;

  let item = $E('menuitem', {
    label: makeMenuItemLabel(aParam),
    disabled: appIndex < 0 || null,
    user: [
      {
        key: kID.appIndexKey,
        value: appIndex
      },
      {
        key: kID.actionKey,
        value: action
      }
    ]
  });

  aPopup.appendChild(item);
}

function makeMenuItemLabel({app, action, inAppMenu}) {
  let label;

  if (inAppMenu) {
    let type = kString.type[app.type];
    if (app.type === 'file') {
      type = type.replace('%1', app.extensions.join(','));
    }
    label = kString.appMenuItem.
      replace('%type%', type).
      replace('%name%', app.name);
  }
  else {
    label = kString.action[FileExtUtil.getBaseAction(action)];
    if (app) {
      label = label.replace('%1', app.name);
    }
  }

  return label;
}

function doBrowse(aPopup) {
  // XPath for a <menuitem> with avalable actions
  let availableItem = (actions) => {
    let key = '@' + kID.actionKey + '="';
    return 'xul:menuitem[' + key + actions.join('" or ' + key) + '"]';
  };

  // XPath for a useless <menuseparator>;
  // 1.it is the first visible item in the menu
  // 2.it is the last visible item in the menu
  // 3.the next visible item is a menu separator
  let uselessSeparator = 'xul:menuseparator[not(preceding-sibling::*[not(@hidden)]) or not(following-sibling::*[not(@hidden)]) or local-name(following-sibling::*[not(@hidden)])="menuseparator"]';

  // hide all menu items and show the others
  Array.forEach(aPopup.childNodes, (node) => {
    let hidden = node.localName === 'menuitem';
    if (node.hidden !== hidden) {
      node.hidden = hidden;
    }
  });

  // show the menu items with available actions
  $X(availableItem(getAvailableActions()), aPopup).
  forEach((node) => {
    node.hidden = false;
  });

  // hide the useless menu separators
  $X(uselessSeparator, aPopup).
  forEach((node) => {
    node.hidden = true;
  });
}

function getAvailableActions() {
  // @see chrome://browser/content/nsContextMenu.js
  const {gContextMenu} = window;

  let actions = [];

  let onMedia = false;
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

    let ext = FileExtUtil.matchExt(URL, 'file');
    if (ext) {
      actions.push(FileExtUtil.makeFileAction('openFile', ext));
    }

    if (FileExtUtil.matchExt(URL, 'text')) {
      actions.push('viewLinkSource');
    } else if (FileExtUtil.matchExt(URL, 'image')) {
      actions.push('viewLinkImage');
    } else if (FileExtUtil.matchExt(URL, 'media')) {
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

  switch (FileExtUtil.getBaseAction(aAction)) {
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
  return aPopup.appendChild($E('menuseparator', {
    id: aID
  }));
}

function $E(aTagOrNode, aAttribute) {
  let node = (typeof aTagOrNode === 'string') ?
    window.document.createElement(aTagOrNode) :
    aTagOrNode;

  let setAttribute = (aKey, aValue) => {
    if (aValue !== null && aValue !== undefined) {
      node.setAttribute(aKey, aValue);
    }
  };

  if (!!aAttribute) {
    for (let [key, value] in Iterator(aAttribute)) {
      switch (key) {
      case 'user':
        value.forEach(({key, value}) => {
          setAttribute(key, value);
        });
        break;
      default:
        setAttribute(key, value);
      }
    }
  }

  return node;
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

// @see resource://gre/modules/Services.jsm
const {Cc, Ci, Services} = window;

function $I(aCID, aIID) {
  return Cc[aCID].createInstance(Ci[aIID]);
}

function LocalFile() {
  return $I('@mozilla.org/file/local;1', 'nsIFile');
}

function Process() {
  return $I('@mozilla.org/process/util;1', 'nsIProcess');
}

function WebBrowserPersist() {
  return $I('@mozilla.org/embedding/browser/nsWebBrowserPersist;1',
    'nsIWebBrowserPersist');
}


//********** Functions

function checkApp(aApp) {
  let path = aApp.path.replace(/[/]/g, '\\');

  kSpecialFolderAliases.forEach((alias) => {
    if (path.contains(alias)) {
      path = path.replace(
        RegExp(alias, 'g'),
        getSpecialDirectory(alias.replace(/%/g, '')).path
      );
    }
  });

  let appFile = getAppFile(path);
  if (appFile) {
    // @note overwrites the property value
    aApp.path = appFile.path;
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
  let appFile = getAppFile(aApp.path);
  if (!appFile) {
    warn('Not executed', ['The application is not available now', aApp.path]);
    return;
  }

  let args = getAppArgs(aApp.args, aTargetURL);
  let process = Process();
  process.init(appFile);
  // @note use 'wide string' version for Unicode arguments
  process.runwAsync(args, args.length);
}

function saveAndExecute(aApp, aTargetURL, aSaveInfo) {
  let {sourceDocument, targetDocument} = aSaveInfo;
  let sourceURI, saveFilePath, saveFile, privacyContext;
  let persist;

  try {
    sourceURI = makeURI(aTargetURL);
    saveFilePath = getSaveFilePath(sourceURI, targetDocument);
    saveFile = makeFile(saveFilePath);
  } catch (ex) {
    warn('Not downloaded', [ex.message, aTargetURL]);
    return;
  }

  privacyContext = getPrivacyContextFor(sourceDocument);

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
            // |requestSucceeded| throws when an invalid URL is requested
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
    throw Error('Unexpected URL for download');
  }

  fileName = kFileNameForm.replace('%FILENAME%', fileName);

  // @see chrome://global/content/contentAreaUtils.js::
  // validateFileName()
  fileName = window.validateFileName(fileName);

  let dir = getSpecialDirectory('TmpD');
  dir.append(fileName.replace('%NUM%', ''));

  let uniqueNum = 0;
  while (dir.exists()) {
    dir.leafName = fileName.replace('%NUM%', ++uniqueNum);
  }

  return dir.path;
}

function makeFileName(aURI, aDocument) {
  const kMaxFileNameLen = 32;
  const kEllipsis = '__';
  const kDataImageFileName = 'data_image';

  let trim = (aStr) =>
    aStr.trim().
    replace(/[\s-_]+/g, '_').
    replace(/_\W_/g, '_').
    replace(/^_|_$/g, '');

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
      // @see chrome://global/content/contentAreaUtils.js::
      // getFileBaseName()
      fileName = window.getFileBaseName(fileName);
    }
    if (!extension && aDocument && /^https?$/.test(aURI.scheme)) {
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

  if (!fileName) {
    return null;
  }

  if (fileName.length > kMaxFileNameLen) {
    let half = Math.floor(kMaxFileNameLen / 2);
    fileName =
      [fileName.substr(0, half), fileName.substr(-half)].
      map(trim).join(kEllipsis);
  } else {
    fileName = trim(fileName);
  }

  if (extension) {
    fileName += '.' + extension;
  }

  return fileName;
}

function getAppArgs(aArgs, aURL) {
  if (aURL) {
    // escape the path separator
    aURL = aURL.replace(/\\/g, '\\\\');
  }

  if (!aArgs || !aArgs.length) {
    return aURL ? [aURL] : [];
  }

  if (aURL) {
    return aArgs.map((arg) => arg.replace(/%URL%/g, aURL));
  }

  // remove arguments with %URL% when the application is launched as 'tool'
  return aArgs.filter((arg) => !arg.contains('%URL%'));
}

function getSpecialDirectory(aAlias) {
  return Services.dirsvc.get(aAlias, Ci.nsIFile);
}

function makeURI(aURL, aDocument) {
  let characterSet = aDocument ? aDocument.characterSet : null;
  return Services.io.newURI(aURL, characterSet, null);
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
  const kMaxLen = 200;

  if (!Array.isArray(aMsg)) {
    aMsg = [aMsg];
  }

  let msg = log('Error: ' + aTitle + '\n' + aMsg.join('\n'));

  if (msg.length > kMaxLen) {
    msg = msg.substr(0, kMaxLen) + '\n...(see console log)';
  }

  Services.prompt.alert(null, null, msg);
}


//********** Import

function getContextMenu() {
  return window.ucjsUI.ContentArea.contextMenu;
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
  addEvent: addEvent,
  getNodesByXPath: getNodesByXPath,
  log: log
};


})(this), this);
