// ==UserScript==
// @name AppLauncher.uc.js
// @description Application launcher.
// @include main
// ==/UserScript==

// @require Util.uc.js, UI.uc.js

// @usage Creates a menu in the main context menu.
// @note Available menu items will vary depending on where the menu opens.
// @see |getAvailableActions()|

// @note A resource file that is passed to an application will be saved in
// your temporary folder if download needed.
// @see |doAction()|, |Util::getSaveFilePath()|


/**
 * Main function.
 *
 * @param Util {hash}
 *   Utility functions.
 * @param window {ChromeWindow}
 *   The global window object.
 * @param undefined {undefined}
 *   The |undefined| constant.
 */
(function(Util, window, undefined) {


"use strict";


/**
 * Import from |Util|.
 */
const {
  checkApp,
  runApp,
  extractFileName,
  createNode: $E,
  getNodesByXPath: $X,
  contentAreaContextMenu,
  // For debugging.
  log
} = Util;

/**
 * Application list.
 *
 * @note Don't add a key '_index' that is reserved for internal use.
 * @see |initAppList()|
 */
const kAppList = [
  {
    // A display name.
    name: 'IE',

    // A type for available actions.
    // @see |kTypeAction|
    type: 'browse',

    // An executable file path.
    // @note Some alias of the special folder is available.
    // @see |kSpecialFolderAliases|
    //   %ProgF%: Program files folder.
    //   %LocalAppData%: Local application data folder.
    path: '%ProgF%/Internet Explorer/iexplore.exe',

    // [optional] Commandline arguments.
    // @note %URL% is replaced with the proper URL of each action.
    // @note If absent or empty array, it equals to <args: ['%URL%']>.
    // @note If launched as a stand-alone tool, an argument that contains %URL%
    // is ignored.
    args: ['-new', '%URL%'],

    // [optional] This item is disabled.
    //disabled: true
  },
  {
    name: 'WMP',

    // @note If |type| is 'file', you should also set |extensions| to describe
    // the file extensions of a link URL that is passed to the application.
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
    name: 'Chrome',
    type: 'browse',
    path: '%LocalAppData%/Google/Chrome/Application/chrome.exe'
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
 * Actions for each types.
 *
 * @note Displayed in the declared order.
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
  }
];

/**
 * File extensions for the action on a link.
 */
const kLinkExtension = {
  // For <openFile>.
  // @note *SET NO VALUES* they will be automatically created with
  // |kAppList.extensions|.
  // @see |FileExtUtil::updateFileExt()|
  file:  [],
  // For <viewLinkSource>.
  text:  ['css', 'js', 'txt', 'xml'],
  // For <viewLinkImage>.
  image: ['bmp', 'gif', 'jpg', 'png'],
  // For <openLinkMedia>.
  media: ['asf', 'asx', 'avi', 'flv', 'mid',
          'mov', 'mp3', 'mp4', 'mpg', 'ogg',
          'ogv', 'pls', 'ra', 'ram', 'rm',
          'wav', 'wax', 'webm', 'wma', 'wmv',
          'wvx']
};

/**
 * UI settings.
 */
const kUI = {
  mainMenu: {
    id: 'ucjs_AppLauncher_menu',
    label: 'AppLauncher',
    accesskey: 'L'
  },

  appMenu: {
    label: 'Applications'
  },

  appMenuItem: {
    label: '%type%: %name%'
  },

  item: {
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
  },

  startSeparator: {
    id: 'ucjs_AppLauncher_startSeparator'
  },

  endSeparator: {
    id: 'ucjs_AppLauncher_endSeparator'
  }
};

/**
 * Key names for storing data.
 */
const kDataKey = {
  // Extended attribute name of a menuitem.
  appIndex: 'ucjs_AppLauncher_appIndex',
  action: 'ucjs_AppLauncher_action'
};

/**
 * Utility for the file extensions.
 */
const FileExtUtil = {
  makeFileAction(aAction, aExt) {
    return aAction + '_' + aExt;
  },

  getBaseAction(aAction) {
    return aAction.replace(/_.+$/, '');
  },

  updateFileExt(aExtArray) {
    // Add new extensions to the array of file extentions.
    let fileExts = kLinkExtension['file'].concat(aExtArray);

    // Filter the array with unique extensions.
    kLinkExtension['file'] =
      fileExts.filter((ext, i, array) => array.indexOf(ext) === i);
  },

  matchExt(aURL, aType) {
    let result = extractFileName(aURL);

    if (!result) {
      return null;
    }

    let ext = result.extension;

    if (ext && kLinkExtension[aType].indexOf(ext) > -1) {
      return ext;
    }

    return null;
  }
};

function AppLauncher_init() {
  let appList = initAppList();

  if (appList) {
    initMenu(appList);
  }
}

function initAppList() {
  // Filter valid list items.
  let apps = kAppList.filter((app) => {
    let {name, type, extensions, path, disabled} = app;

    // 1.Required properties.
    if (!disabled && name && type && path) {
      // 2.Valid action type.
      if (kTypeAction.some((item) => item.type === type)) {
        // 3.Required 'extensions' property if type is 'file'.
        if (type !== 'file' || (extensions && extensions.length)) {
          // 4.Valid application.
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

  // Sort items in type actions order and then alphabetical order.
  let order = kTypeAction.map(({type}) => type);

  apps.sort((a, b) =>
    order.indexOf(a.type) - order.indexOf(b.type) ||
    a.name.localeCompare(b.name)
  );

  // Set the array index inside each item.
  // TODO: Avoid adding a hidden key that could cause an unexpected conflict
  // in a constant |kAppList|.
  apps.forEach((app, i) => app._index = i);

  return apps;
}

function initMenu(aAppList) {
  contentAreaContextMenu.register({
    events: [
      ['popupshowing', onPopupShowing, false],
      ['command', (aEvent) => {
        onCommand(aEvent, aAppList);
      }, false]
    ],

    onCreate: (aContextMenu) => {
      makeMainMenu(aContextMenu, aAppList);
    }
  });
}

function onPopupShowing(aEvent) {
  let menupopup = aEvent.target;

  if (menupopup.parentElement.id === kUI.mainMenu.id) {
    doBrowse(menupopup);
  }
}

function onCommand(aEvent, aAppList) {
  let element = aEvent.target;

  if (!element.hasAttribute(kDataKey.appIndex)) {
    return;
  }

  let appIndex = +(element.getAttribute(kDataKey.appIndex));

  if (appIndex < 0) {
    return;
  }

  doAction(aAppList[appIndex], element.getAttribute(kDataKey.action));
}

function makeMainMenu(aContextMenu, aAppList) {
  let menu = $E('menu', {
    id: kUI.mainMenu.id,
    label: kUI.mainMenu.label,
    accesskey: kUI.mainMenu.accesskey
  });

  let popup = $E('menupopup');

  makeAppMenu(popup, aAppList);
  makeActionItems(popup, aAppList);

  menu.appendChild(popup);

  addSeparator(aContextMenu, kUI.startSeparator.id);
  aContextMenu.appendChild(menu);
  addSeparator(aContextMenu, kUI.endSeparator.id);
}

function makeAppMenu(aPopup, aAppList) {
  let appMenu = $E('menu', {
    label: kUI.appMenu.label
  });

  let appMenuPopup = $E('menupopup');

  aAppList.forEach((app) => {
    addMenuItem(appMenuPopup, {
      action: 'launchTool',
      app,
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
      // Make actions with extensions.
      actions = actions.reduce((a, b) => {
        return a.concat(app.extensions.map((ext) => {
          return FileExtUtil.makeFileAction(b, ext);
        }));
      }, []);
    }

    actions.forEach((action) => {
      addMenuItem(aPopup, {
        action,
        app
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

  let appIndex = app ? app._index : -1;

  let item = $E('menuitem', {
    label: makeMenuItemLabel(aParam),
    disabled: appIndex < 0 || null,
    [kDataKey.appIndex]: appIndex,
    [kDataKey.action]: action
  });

  aPopup.appendChild(item);
}

function makeMenuItemLabel({app, action, inAppMenu}) {
  let label;

  if (inAppMenu) {
    let type = kUI.item.type[app.type];

    if (app.type === 'file') {
      type = type.replace('%1', app.extensions.join(','));
    }

    label = kUI.appMenuItem.label.
      replace('%type%', type).
      replace('%name%', app.name);
  }
  else {
    label = kUI.item.action[FileExtUtil.getBaseAction(action)];

    if (app) {
      label = label.replace('%1', app.name);
    }
  }

  return label;
}

function addSeparator(aPopup, aID) {
  return aPopup.appendChild($E('menuseparator', {
    id: aID
  }));
}

function doBrowse(aPopup) {
  // XPath for a <menuitem> with avalable actions.
  let availableItem = (actions) => {
    let key = '@' + kDataKey.action + '="';

    return 'xul:menuitem[' + key + actions.join('" or ' + key) + '"]';
  };

  // XPath for a useless <menuseparator>;
  // 1.It is the first visible item in the menu.
  // 2.It is the last visible item in the menu.
  // 3.The next visible item is a menu separator.
  let uselessSeparator = 'xul:menuseparator[not(preceding-sibling::*[not(@hidden)]) or not(following-sibling::*[not(@hidden)]) or local-name(following-sibling::*[not(@hidden)])="menuseparator"]';

  // Hide all menu items and show the others.
  [...aPopup.childNodes].forEach((node) => {
    let hidden = node.localName === 'menuitem';

    if (node.hidden !== hidden) {
      node.hidden = hidden;
    }
  });

  // Show the menu items with available actions.
  $X(availableItem(getAvailableActions()), aPopup, {
    toArray: true
  }).
  forEach((node) => {
    node.hidden = false;
  });

  // Hide the useless menu separators.
  $X(uselessSeparator, aPopup, {
    toArray: true
  }).
  forEach((node) => {
    node.hidden = true;
  });
}

function getAvailableActions() {
  // @see chrome://browser/content/nsContextMenu.js
  const {gContextMenu} = window;

  let isImageDocument = (aDocument) =>
    aDocument instanceof ImageDocument;

  // @see chrome://browser/content/browser.js::mimeTypeIsTextBased
  let isTextDocument = (aDocument) =>
    window.mimeTypeIsTextBased(aDocument.contentType);

  let actions = [];

  let onMedia = false;

  if (gContextMenu.onImage ||
      gContextMenu.onCanvas ||
      isImageDocument(gContextMenu.target.ownerDocument)) {
    onMedia = true;

    actions.push('viewImage');

    if (/^(?:https?|ftp):/.test(gContextMenu.mediaURL)) {
      actions.push('downloadImage');
    }
  }
  else if (gContextMenu.onVideo || gContextMenu.onAudio) {
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
    }
    else if (FileExtUtil.matchExt(URL, 'image')) {
      actions.push('viewLinkImage');
    }
    else if (FileExtUtil.matchExt(URL, 'media')) {
      actions.push('openLinkMedia');
    }

    if (/^https?:/.test(URL)) {
      actions.push('openLink');
      actions.push('downloadLink');
    }
    else if (/^ftp:/.test(URL)) {
      actions.push('openFTP');
    }
    else if (/^mailto:/.test(URL)) {
      actions.push('sendMail');
    }
    else if (/^s?news:/.test(URL)) {
      actions.push('readNews');
    }
  }
  else if (!onMedia && !gContextMenu.onTextInput) {
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

  if (!actions.length) {
    actions.push('noActions');
  }

  // Always enable the action to launch stand-alone tools.
  actions.push('launchTool');

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
      targetURL = null;
      break;

    case 'openPage':
      targetURL = gBrowser.contentDocument.documentURI;
      break;

    case 'viewPageSource':
      save = true;
      targetDocument = gBrowser.contentDocument;
      targetURL = targetDocument.documentURI;
      break;

    case 'openFrame':
      targetURL = sourceDocument.documentURI;
      break;

    case 'viewFrameSource':
      save = true;
      targetDocument = sourceDocument;
      targetURL = targetDocument.documentURI;
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
        targetURL = gContextMenu.mediaURL;
      }
      else if (gContextMenu.onCanvas) {
        targetURL = gContextMenu.target.toDataURL();
      }
      else {
        targetURL = sourceDocument.documentURI;
      }
      break;

    case 'viewBGImage':
      save = true;
      targetURL = gContextMenu.bgImageURL;
      break;

    case 'downloadMedia':
    case 'downloadImage':
      targetURL = gContextMenu.mediaURL;
      break;

    case 'downloadBGImage':
      targetURL = gContextMenu.bgImageURL;
      break;
  }

  let saveInfo = null;

  if (save) {
    saveInfo = {
      sourceDocument,
      targetDocument
    };
  }

  runApp(aApp, targetURL, saveInfo);
}

/**
 * Entry Point.
 */
AppLauncher_init();


})


/**
 * Argument of the main function.
 *
 * @return Util {hash}
 *   Utility functions.
 */
((function(window, undefined) {


"use strict";


/**
 * Aliases for local special folders.
 * @see http://mxr.mozilla.org/mozilla-central/source/xpcom/io/nsDirectoryServiceDefs.h
 */
const kSpecialFolderAliases = [
  // Windows "Program files" folder.
  // C:/Program Files/
  '%ProgF%',

  // Windows "Local application data" folder.
  // C:/Documents and Settings/{username}/Local Settings/Application Data/
  // C:/Users/{username}/AppData/Local/
  '%LocalAppData%'
];

/**
 * XPCOM instances.
 */
let $I = (aCID, aIID) => Cc[aCID].createInstance(Ci[aIID]);

let LocalFile = () =>
  $I('@mozilla.org/file/local;1', 'nsIFile');

let Process = () =>
  $I('@mozilla.org/process/util;1', 'nsIProcess');

let WebBrowserPersist = () =>
  $I('@mozilla.org/embedding/browser/nsWebBrowserPersist;1',
     'nsIWebBrowserPersist');

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
    // @note Overwrites the property value.
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
  }
  catch (ex) {}

  return null;
}

function runApp(aApp, aTargetURL, aSaveInfo) {
  if (aSaveInfo) {
    saveAndExecute(aApp, aTargetURL, aSaveInfo);
  }
  else {
    execute(aApp, aTargetURL);
  }
}

function execute(aApp, aTargetURL) {
  let appFile = getAppFile(aApp.path);

  if (!appFile) {
    warn('Not executed', ['The application is not available now.', aApp.path]);

    return;
  }

  let args = getAppArgs(aApp.args, aTargetURL);
  let process = Process();

  process.init(appFile);

  // @note Use 'wide string' version for Unicode arguments.
  process.runwAsync(args, args.length);
}

function saveAndExecute(aApp, aTargetURL, aSaveInfo) {
  let {sourceDocument, targetDocument} = aSaveInfo;
  let targetURI, saveFilePath, saveFile, privacyContext;
  let persist;

  try {
    targetURI = makeURI(aTargetURL);
    saveFilePath = getSaveFilePath(targetURI, targetDocument);
    saveFile = makeFile(saveFilePath);
  }
  catch (ex) {
    warn('Not downloaded', [ex.message, aTargetURL]);

    return;
  }

  privacyContext = getPrivacyContextFor(sourceDocument);

  persist = WebBrowserPersist();

  persist.persistFlags =
    Ci.nsIWebBrowserPersist.PERSIST_FLAGS_CLEANUP_ON_FAILURE |
    Ci.nsIWebBrowserPersist.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;

  persist.progressListener = {
    onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
      if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        if (/^(?:https?|ftp):/.test(aRequest.name)) {
          let httpChannel, requestSucceeded, responseStatus;

          try {
            httpChannel = aRequest.QueryInterface(Ci.nsIHttpChannel);
            requestSucceeded = httpChannel.requestSucceeded;
            responseStatus = httpChannel.responseStatus;
          }
          catch (ex) {
            // Nothing to do.
            //
            // @throw |NS_ERROR_NOT_AVAILABLE|
            //   |requestSucceeded| throws when an invalid URL is requested.
          }

          if (!requestSucceeded) {
            warn('Not downloaded',
              ['HTTP status = ' + responseStatus, aRequest.name]);

            return;
          }
        }

        if (!saveFile || !saveFile.exists()) {
          warn('Not downloaded', ['Unknown error occured.', aRequest.name]);

          return;
        }

        execute(aApp, saveFilePath);
      }
    },

    onProgressChange() {},
    onLocationChange() {},
    onStatusChange() {},
    onSecurityChange() {}
  };

  persist.saveURI(targetURI, null, null, null, null, saveFile,
    privacyContext);
}

function getSaveFilePath(aURI, aDocument) {
  const kFileNameForm = 'ucjsAL%NUM%_%FILENAME%';

  let fileName = makeFileName(aURI, aDocument);

  if (!fileName) {
    throw Error('Invalid URL for download.');
  }

  fileName = kFileNameForm.replace('%FILENAME%', fileName);

  // @see chrome://global/content/contentAreaUtils.js::validateFileName()
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
  if (!aURI) {
    return null;
  }

  const kDataImageBaseName = 'data_image';
  const kMaxBaseNameLen = 32;
  const kEllipsis = '__';

  let trim = (aStr) =>
    aStr.trim().
    replace(/[\s-_]+/g, '_').
    replace(/_\W_/g, '_').
    replace(/^_|_$/g, '');

  let baseName, extension;

  if (/^(?:https?|ftp)$/.test(aURI.scheme)) {
    let result = extractFileName(aURI, aDocument);

    if (result) {
      baseName = result.baseName;
      extension = result.extension;
    }
  }
  else if (/^data$/.test(aURI.scheme)) {
    let match = /^image\/([a-z]+);/.exec(aURI.path);

    if (match) {
      baseName = kDataImageBaseName;
      extension = match[1];
    }
  }

  if (!baseName) {
    return null;
  }

  if (baseName.length > kMaxBaseNameLen) {
    let half = Math.floor(kMaxBaseNameLen / 2);

    baseName = [baseName.substr(0, half), baseName.substr(-half)].
      map(trim).join(kEllipsis);
  }
  else {
    baseName = trim(baseName);
  }

  if (extension) {
    return baseName + '.' + extension;
  }

  return baseName;
}

function extractFileName(aURI, aDocument) {
  if (!(aURI instanceof Ci.nsIURI)) {
    aURI = makeURI(aURI);

    if (!aURI) {
      return null;
    }
  }

  // @see chrome://global/content/contentAreaUtils.js::getDefaultFileName()
  let baseName = window.getDefaultFileName('', aURI, aDocument) || null;

  let contentType = aDocument ? aDocument.contentType : null;

  // @see chrome://global/content/contentAreaUtils.js::getDefaultExtension()
  let extension = window.getDefaultExtension('', aURI, contentType) || null;

  if (extension && baseName.endsWith('.' + extension)) {
    // @see chrome://global/content/contentAreaUtils.js::getFileBaseName()
    baseName = window.getFileBaseName(baseName);
  }

  if (!baseName) {
    return null;
  }

  if (!extension && aDocument && /^https?$/.test(aURI.scheme)) {
    extension = 'htm';
  }

  return {
    baseName,
    extension
  };
}

function getAppArgs(aArgs, aURL) {
  if (aURL) {
    // Escape the path separator.
    aURL = aURL.replace(/\\/g, '\\\\');
  }

  if (!aArgs || !aArgs.length) {
    return aURL ? [aURL] : [];
  }

  if (aURL) {
    return aArgs.map((arg) => arg.replace(/%URL%/g, aURL));
  }

  // Remove arguments with %URL% when the application is launched as 'tool'.
  return aArgs.filter((arg) => !arg.contains('%URL%'));
}

function getSpecialDirectory(aAlias) {
  return Services.dirsvc.get(aAlias, Ci.nsIFile);
}

function makeURI(aURL) {
  if (!aURL) {
    return null;
  }

  try {
    // @see chrome://global/content/contentAreaUtils.js::makeURI
    return window.makeURI(aURL);
  }
  catch (ex) {}

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
  }
  catch (ex) {}

  return null;
}

function warn(aTitle, aMsg) {
  const kMaxMessageLength = 200;

  if (!Array.isArray(aMsg)) {
    aMsg = [aMsg];
  }

  let msg = log(['Error: ' + aTitle, aMsg.join('\n')]);

  if (msg.length > kMaxMessageLength) {
    msg = msg.substr(0, kMaxMessageLength);
    msg += '\n...(too long and truncated)';
  }

  msg += '\n[logged in the Browser Console]';

  Services.prompt.alert(null, null, msg);
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('AppLauncher.uc.js', aMsg);
}

/**
 * Export
 */
return {
  checkApp,
  runApp,
  extractFileName,

  createNode: window.ucjsUtil.createNode,
  getNodesByXPath: window.ucjsUtil.getNodesByXPath,
  contentAreaContextMenu: window.ucjsUI.ContentArea.contextMenu,

  log
};


})(this), this);
