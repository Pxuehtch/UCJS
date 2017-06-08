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
// @note This download is recorded to the download history if not in private
// mode.
// TODO: Fix the 'Failed' status for a completed download in the history list.


/**
 * Main function.
 *
 * @param Util {hash}
 *   Utility functions.
 * @param window {ChromeWindow}
 *   The global window object.
 */
(function(Util, window) {


"use strict";


/**
 * Import from |Util|.
 */
const {
  checkApp,
  runApp,
  extractFileName,
  $E,
  $X,
  promiseMessage,
  isTextDocument,
  contentAreaContextMenu,
  // Logger to console for debug.
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
    // @note You can use the alias %ProgF% for Program files folder.
    // @see |kSpecialFolderAliases|
    path: '%ProgF%/Internet Explorer/iexplore.exe',

    // [optional] Commandline arguments.
    // @note %url% is replaced with the proper URL of each action.
    // @note If absent or empty array, it equals to <args: ['%url%']>.
    // @note If launched as a stand-alone tool, an argument that contains %url%
    // is ignored.
    args: ['-new', '%url%'],

    // [optional] This item is disabled.
    //disabled: true
  },
  {
    name: 'Edge',
    type: 'browse',
    path: 'C:/Windows/System32/cmd.exe',
    args: ['/c', 'start', 'microsoft-edge:%url%']
  },
  {
    name: 'Chrome',
    type: 'browse',
    path: '%ProgF%/Google/Chrome/Application/chrome.exe'
  },
  {
    name: 'WMP',

    // @note If |type| is 'file', you should also set |extensions| to describe
    // the file extensions of a link URL that is passed to the application.
    type: 'file',
    extensions: ['asx', 'wax', 'wvx'],

    path: '%ProgF%/Windows Media Player/wmplayer.exe',
    args: ['/prefetch:1', '%url%']
  },
  {
    name: 'Foxit',
    type: 'file',
    extensions: ['pdf'],
    path: 'C:/PF/FoxitReader/Foxit Reader.exe'
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
    args: ['-news', '%url%']
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
  // @note Set no values. They will be automatically created with
  // |kAppList.extensions|.
  // @see |FileExtUtil::updateFileExt()|
  file:  [/* SET NO VALUES */],
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
    kLinkExtension['file'] = [...new Set(fileExts)];
  },

  matchExt(aURL, aType) {
    let result = extractFileName(aURL);

    if (!result) {
      return null;
    }

    let ext = result.extension;

    if (ext && kLinkExtension[aType].includes(ext)) {
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
      ['popupshowing', onPopupShowing],
      ['command', (aEvent) => {
        onCommand(aEvent, aAppList);
      }]
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

/**
 * Build the menu items in the context menu.
 *
 * TODO: Make the insertion position of items fixed for useful access.
 * WORKAROUND: Appends to the end of the context menu items at this time.
 */
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

  // XPath for a useless <menuseparator>:
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

  let actions = [];

  let onMedia = false;

  if (gContextMenu.onImage ||
      gContextMenu.onCanvas ||
      gContextMenu.inSyntheticDoc) {
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
    let url = gContextMenu.linkURL;

    let ext = FileExtUtil.matchExt(url, 'file');

    if (ext) {
      actions.push(FileExtUtil.makeFileAction('openFile', ext));
    }

    if (FileExtUtil.matchExt(url, 'text')) {
      actions.push('viewLinkSource');
    }
    else if (FileExtUtil.matchExt(url, 'image')) {
      actions.push('viewLinkImage');
    }
    else if (FileExtUtil.matchExt(url, 'media')) {
      actions.push('openLinkMedia');
    }

    if (/^https?:/.test(url)) {
      actions.push('openLink');
      actions.push('downloadLink');
    }
    else if (/^ftp:/.test(url)) {
      actions.push('openFTP');
    }
    else if (/^mailto:/.test(url)) {
      actions.push('sendMail');
    }
    else if (/^s?news:/.test(url)) {
      actions.push('readNews');
    }
  }
  else if (!onMedia && !gContextMenu.onTextInput) {
    let inText = isTextDocument();

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

function doAction(appInfo, action) {
  // XXX: I don't write 'async function doAction()' because I want catch
  // errors of promise only here.
  (async () => {
    // @see chrome://browser/content/nsContextMenu.js
    const {gContextMenu, gContextMenuContentData} = window;

    let doSave = false;
    let targetURL;
    let docInfo;

    switch (FileExtUtil.getBaseAction(action)) {
      case 'launchTool':
        targetURL = null;
        break;

      case 'openPage':
        targetURL = gBrowser.currentURI.spec;
        break;

      case 'viewPageSource':
        doSave = true;
        targetURL = gBrowser.currentURI.spec;
        docInfo = await promiseDocInfo();
        break;

      case 'openFrame':
        targetURL = gContextMenuContentData.docLocation;
        break;

      case 'viewFrameSource':
        doSave = true;
        targetURL = gContextMenuContentData.docLocation;
        docInfo = await promiseDocInfo();
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
        doSave = true;
        targetURL = gContextMenu.linkURL;
        break;

      case 'openMedia':
        doSave = true;
        targetURL = gContextMenu.mediaURL;
        break;

      case 'viewImage': {
        doSave = true;

        if (gContextMenu.onImage) {
          targetURL = gContextMenu.mediaURL;
        }
        else if (gContextMenu.onCanvas) {
          targetURL = await promiseCanvasBlobURL();
        }
 
        break;
      }

      case 'viewBGImage':
        doSave = true;
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

    runApp(appInfo, targetURL, doSave, docInfo);
  })().
  catch(Cu.reportError);
}

function promiseDocInfo() {
  let messageName = {
    request: 'PageInfo:getData',
    response: 'PageInfo:data'
  };

  let params = {
    strings: {},
    frameOuterWindowID: gContextMenu.frameOuterWindowID
  };

  return promiseMessage(messageName, params).then((data) => {
    let {docInfo} = data;

    return {
      title: docInfo.title,
      contentType: docInfo.contentType
    };
  });
}

function promiseCanvasBlobURL() {
  let messageName = {
    request: 'ContextMenu:Canvas:ToBlobURL',
    response: 'ContextMenu:Canvas:ToBlobURL:Result'
  };

  let paramsAsCPOW = {
    target: gContextMenu.target
  };

  return promiseMessage(messageName, null, paramsAsCPOW).then((data) => {
    // WORKAROUND: Put a tag for canvas image. The tag is referenced by
    // |makeFileName|.
    return data.blobURL + '?canvas';
  });
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
((function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  MessageManager,
  DOMUtils,
  BrowserUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

const {
  ContentArea: {
    contextMenu: contentAreaContextMenu
  }
} = window.ucjsUI;

/**
 * Aliases for local special folders.
 * @see http://dxr.mozilla.org/mozilla-release/source/xpcom/io/nsDirectoryServiceDefs.h
 */
const kSpecialFolderAliases = [
  // Windows "Program files" folder.
  // C:/Program Files/
  '%ProgF%'
];

/**
 * XPCOM instances.
 */
let $I = (CID, IID) => Cc[CID].createInstance(Ci[IID]);

let LocalFile = () =>
  $I('@mozilla.org/file/local;1', 'nsIFile');

let Process = () =>
  $I('@mozilla.org/process/util;1', 'nsIProcess');

function checkApp(appInfo) {
  let path = appInfo.path.replace(/[/]/g, '\\');

  kSpecialFolderAliases.forEach((alias) => {
    if (path.includes(alias)) {
      path = path.replace(
        RegExp(alias, 'g'),
        getSpecialDirectory(alias.replace(/%/g, '')).path
      );
    }
  });

  let appFile = getAppFile(path);

  if (appFile) {
    // @note Overwrites the property value.
    appInfo.path = appFile.path;

    return true;
  }

  return false;
}

function getAppFile(filePath) {
  try {
    let file = makeFile(filePath);

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

function runApp(appInfo, targetURL, doSave, docInfo) {
  if (doSave) {
    saveAndExecute(appInfo, targetURL, docInfo);
  }
  else {
    execute(appInfo, targetURL);
  }
}

function execute(appInfo, targetURL) {
  let {
    path: appPath,
    args: appArgs
  } = appInfo;

  let appFile = getAppFile(appPath);

  if (!appFile) {
    warn({
      title: 'Not executed',
      texts: ['The application is not available now.', appPath]
    });

    return;
  }

  let process = Process();

  process.init(appFile);

  let args = getAppArgs(appArgs, targetURL);

  // @note Use 'wide string' version for Unicode arguments.
  process.runwAsync(args, args.length);
}

function saveAndExecute(appInfo, targetURL, docInfo) {
  let saveFilePath;

  try {
    saveFilePath = getSaveFilePath(makeURI(targetURL), docInfo);
  }
  catch (ex) {
    warn({
      title: 'Not downloaded',
      texts: [ex.message, targetURL]
    });

    return;
  }

  // @see resource://gre/modules/Downloads.jsm
  const {Downloads} = require('gre/modules/Downloads.jsm');
  // @see resource://gre/modules/commonjs/sdk/window/utils.js
  const {isWindowPrivate} = require('sdk/window/utils');

  Downloads.fetch(
    targetURL,
    saveFilePath,
    {
      isPrivate: isWindowPrivate(window)
    }
  ).then(
    function onResolve() {
      execute(appInfo, saveFilePath);
    },
    function onReject(aError) {
      warn({
        title: 'Not downloaded',
        texts: [aError.message, targetURL]
      });
    }
  ).catch(Cu.reportError);
}

function getSaveFilePath(uri, docInfo) {
  const kFileNameForm = 'ucjsAL%num%_%fileName%';

  let fileName = makeFileName(uri, docInfo);

  if (!fileName) {
    throw Error('Invalid URL for download.');
  }

  fileName = kFileNameForm.replace('%fileName%', fileName);

  // @see chrome://global/content/contentAreaUtils.js::validateFileName()
  fileName = window.validateFileName(fileName);

  // Windows temporary folder.
  let dir = getSpecialDirectory('TmpD');

  dir.append(fileName.replace('%num%', ''));

  let uniqueNum = 0;

  while (dir.exists()) {
    dir.leafName = fileName.replace('%num%', ++uniqueNum);
  }

  return dir.path;
}

function makeFileName(uri, docInfo) {
  if (!uri) {
    return null;
  }

  const kDataImageBaseName = 'data_image';
  const kCanvasImageBaseName = 'canvas_image';
  const kMaxBaseNameLen = 32;
  const kEllipsis = '__';

  let trim = (aStr) =>
    aStr.trim().
    replace(/[\s-_]+/g, '_').
    replace(/_\W_/g, '_').
    replace(/^_|_$/g, '');

  let baseName, extension;

  if (/^(?:https?|ftp)$/.test(uri.scheme)) {
    let result = extractFileName(uri, docInfo);

    if (result) {
      baseName = result.baseName;
      extension = result.extension;
    }
  }
  else if (/^data$/.test(uri.scheme)) {
    let match = /^image\/([a-z]+);/.exec(uri.path);

    if (match) {
      baseName = kDataImageBaseName;
      extension = match[1];
    }
  }
  else if (/^blob$/.test(uri.scheme)) {
    // WORKAROUND: Check a tag for canvas image. The tag is attached by
    // |promiseCanvasBlobURL|.
    if (uri.path.endsWith('?canvas')) {
      baseName = kCanvasImageBaseName;
      extension = 'png';
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

function extractFileName(uri, docInfo) {
  if (!(uri instanceof Ci.nsIURI)) {
    uri = makeURI(uri);

    if (!uri) {
      return null;
    }
  }

  // @note |getDefaultFileName| always returns a string not empty.
  // @see chrome://global/content/contentAreaUtils.js::getDefaultFileName()
  let baseName = window.getDefaultFileName('', uri, docInfo);

  // @see chrome://global/content/contentAreaUtils.js::getDefaultExtension()
  let contentType = docInfo ? docInfo.contentType : null;
  let extension = window.getDefaultExtension('', uri, contentType);

  if (extension && baseName.endsWith('.' + extension)) {
    // @see chrome://global/content/contentAreaUtils.js::getFileBaseName()
    baseName = window.getFileBaseName(baseName);
  }

  if (!extension && docInfo && /^https?$/.test(uri.scheme)) {
    extension = 'htm';
  }

  return {
    baseName,
    extension
  };
}

function getAppArgs(args, url) {
  if (url) {
    // Escape the path separator.
    url = url.replace(/\\/g, '\\\\');
  }

  if (!args || !args.length) {
    return url ? [url] : [];
  }

  if (url) {
    return args.map((arg) => arg.replace(/%url%/g, url));
  }

  // Remove arguments with %url% when the application is launched as 'tool'.
  return args.filter((arg) => !arg.includes('%url%'));
}

function getSpecialDirectory(aAlias) {
  return Services.dirsvc.get(aAlias, Ci.nsIFile);
}

function makeURI(url) {
  if (!url) {
    return null;
  }

  try {
    return Modules.BrowserUtils.makeURI(url);
  }
  catch (ex) {}

  return null;
}

function makeFile(filePath) {
  let file = LocalFile();

  file.initWithPath(filePath);

  return file;
}

function warn(params) {
  const kMaxOutputLength = 200;

  let {title, texts} = params

  if (!Array.isArray(texts)) {
    texts = [texts];
  }

  let caller = Components.stack.caller;
  let output = log(['Error: ' + title, texts.join('\n')], caller);

  if (output.length > kMaxOutputLength) {
    output = output.substr(0, kMaxOutputLength);
    output += '\n...(Too long and truncated)';
  }

  output += '\n[Logged in the Browser Console]';

  Services.prompt.alert(null, null, output);
}

function require(resourceURL) {
  return Modules.require(resourceURL);
}

/**
 * Export
 */
return {
  checkApp,
  runApp,
  extractFileName,

  $E: DOMUtils.$E,
  $X: DOMUtils.$X,
  promiseMessage: MessageManager.promiseMessage,
  isTextDocument: BrowserUtils.isTextDocument,
  contentAreaContextMenu,

  log
};


})(this), this);
