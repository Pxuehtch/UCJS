// ==UserScript==
// @name ScriptList.uc.js
// @description List viewer of the user scripts for userChromeJS extension.
// @include main
// ==/UserScript==

// @require userChrome.js with |ucjsScriptLoader|
// @require Util.uc.js
// @usage Creates a menuitem in 'tools' of the main menu.


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  createNode: $E,
  getNodeById: $ID,
  setEventListener: addEvent
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('ScriptList.uc.js', aMsg);
}

/**
 * UI bundle
 */
const kUIBundle = {
  menu: {
    id: 'ucjs_scriptList_menu',
    label: 'userChrome.js [登録: %COUNT%]',
    accesskey: 'u',
    disabledTip: 'スクリプトの読込なし',
    selectLabel: 'Open scripts list...',
    selectAccesskey: 'l',
    selectTip:   'スクリプトリストを開く'
  },

  panel: {
    id: 'ucjs_scriptList_panel',
    title: '<userChrome.js> Script List',
    scriptDataListID: 'ucjs_scriptList_scriptDataList',
    scriptInfoCaptionID: 'ucjs_scriptList_scriptInfoCaption',
    scriptInfoCaption: 'Information: [#%SELECTED% / %COUNT%]',
    scriptInfoBoxID: 'ucjs_scriptList_scriptInfoBox',
    closeButton: '閉じる'
  }
};


//********** Functions

/**
 * Main function
 */
function ScriptList_init() {
  if (window.ucjsScriptLoader) {
    createMenu(getScripts(window.ucjsScriptLoader));
  }
}

/**
 * Scripts list handler
 * @param aScriptLoader {hash}
 * @return {hash}
 *   @member count {number}
 *   @member data {function}
 */
function getScripts(aScriptLoader) {
  const {jscripts, overlays} = aScriptLoader.scriptList;
  var data = jscripts.concat(overlays);

  return {
    count: data.length,
    data: function(aIndex) {
      return aIndex >= 0 ? data[aIndex] : data
    }
  };
}

/**
 * Creates a menu in the menu-bar
 * @param aScripts {hash} scripts data handler
 */
function createMenu(aScripts) {
  const {menu: kMenuUI} = kUIBundle;

  var menu = $ID('menu_ToolsPopup').appendChild($E('menu', {
    id: kMenuUI.id,
    label: F(kMenuUI.label, {'COUNT': aScripts.count}),
    accesskey: kMenuUI.accesskey
  }));

  if (aScripts.count) {
    let panel = ScriptListPanel(aScripts);
    let menuitem = menu.appendChild($E('menupopup')).
    appendChild($E('menuitem', {
      label: kMenuUI.selectLabel,
      accesskey: kMenuUI.selectAccesskey,
      tooltiptext: kMenuUI.selectTip
    }));
    addEvent([menuitem, 'command', panel.open, false]);
  } else {
    $E(menu, {
      tooltiptext: kMenuUI.disabledTip,
      disabled: true
    });
  }
}

/**
 * Handler of a panel of the scripts list
 * @param aScripts {hash} scripts data handler
 * @return {hash}
 *   @member open {function}
 */
function ScriptListPanel(aScripts) {
  const {panel: kPanelUI} = kUIBundle;

  makePanel();

  function getPanel()
    $ID(kPanelUI.id);

  function getScriptDataList()
    $ID(kPanelUI.scriptDataListID);

  function getScriptInfoCaption()
    $ID(kPanelUI.scriptInfoCaptionID);

  function getScriptInfoBox()
    $ID(kPanelUI.scriptInfoBoxID);

  function makePanel() {
    var panel = $ID('mainPopupSet').appendChild($E('panel', {
      id: kPanelUI.id,
      noautohide: true,
      backdrag: true,
      style: 'min-width:40em;'
    }));

    // Title
    panel.appendChild($E('hbox', {pack: 'center'})).
    appendChild($E('label', {
      value: kPanelUI.title,
      class: 'header'
    }));

    // Script list view
    var treeView = panel.appendChild($E('hbox', {flex: 1})).
    appendChild($E('tree', {
      id: kPanelUI.scriptDataListID,
      flex: 1,
      seltype: 'single',
      hidecolumnpicker: true,
      style: 'width:auto;',
      rows: 20
    }));
    addEvent([treeView, 'select', onSelectListItem, false]);

    var treeCols = treeView.appendChild($E('treecols'));
    treeCols.appendChild($E('treecol', {
      label: '#',
      fixed: true,
      style: 'width:auto;text-align:right;'
    }));
    treeCols.appendChild($E('splitter', {
      class: 'tree-splitter',
      hidden: true
    }));
    treeCols.appendChild($E('treecol', {
      label: 'File',
      flex: 1,
      style: 'min-width:15em;'
    }));
    treeCols.appendChild($E('splitter', {
      class: 'tree-splitter'
    }));
    treeCols.appendChild($E('treecol', {
      label: 'Ext.',
      fixed: true,
      style: 'width:auto;'
    }));
    treeCols.appendChild($E('splitter', {
      class: 'tree-splitter',
      hidden: true
    }));
    treeCols.appendChild($E('treecol', {
      label: 'Folder',
      flex: 1,
      style: 'min-width:15em;'
    }));

    var treeChildren = treeView.appendChild($E('treechildren'));
    aScripts.data().
    forEach(function(script, i) {
      var treeRow = treeChildren.appendChild($E('treeitem')).
      appendChild($E('treerow'));
      treeRow.appendChild($E('treecell', {
        label: i + 1
      }));
      treeRow.appendChild($E('treecell', {
        label: script.getURL('FILENAME')
      }));
      treeRow.appendChild($E('treecell', {
        label: script.getURL('FILENAME').
        replace(/^.+\.([a-z]+)$/i, '$1').toUpperCase()
      }));
      treeRow.appendChild($E('treecell', {
        label: script.getURL('FOLDER')
      }));
    });

    // Script information
    var infoGroupBox = panel.appendChild($E('groupbox'));
    infoGroupBox.appendChild($E('caption', {
      id: kPanelUI.scriptInfoCaptionID
    }));
    infoGroupBox.appendChild($E('textbox', {
      id: kPanelUI.scriptInfoBoxID,
      readonly: true,
      multiline: true,
      class: 'plain',
      rows: 5
    }));

    // Action buttons
    var buttonsBox = panel.appendChild($E('hbox'));
    buttonsBox.appendChild($E('spacer', {flex: 1}));
    var closeButton = buttonsBox.
    appendChild($E('button', {
      label: kPanelUI.closeButton
    }));
    addEvent([closeButton, 'command', close, false]);

    // Resizer
    var resizerBox = panel.appendChild($E('hbox'));
    resizerBox.appendChild($E('spacer', {flex: 1}));
    resizerBox.appendChild($E('resizer', {dir: 'bottomend'}));
  }

  function onSelectListItem(aEvent) {
    var index = aEvent.target.currentIndex;

    getScriptInfoCaption().label = F(kPanelUI.scriptInfoCaption, {
      'SELECTED': index + 1,
      'COUNT': aScripts.count
    });
    getScriptInfoBox().value = aScripts.data(index).getMetaList();
  }

  function open() {
    var panel = getPanel();
    panel.openPopupAtScreen(0, 0, false);

    var [x, y] = getCenteringPosition(panel);
    panel.moveTo(x, y);

    getScriptDataList().focus();
    getScriptDataList().treeBoxObject.view.selection.select(0);
  }

  function close() {
    getPanel().hidePopup();
  }

  return {
    open: open
  };
}


//********** Utilities

function getCenteringPosition(aElement) {
  var {outerWidth, outerHeight, screen} = window;
  var {clientWidth: w, clientHeight: h} = aElement;
  var x = 0, y = 0;

  if (outerWidth > w) {
    x = outerWidth - w;
  } else if (screen.availWidth > w) {
    x = screen.availWidth - w;
  }
  if (outerHeight > h) {
    y = outerHeight - h;
  } else if (screen.availHeight > h) {
    y = screen.availHeight - h;
  }

  return [x / 2, y / 2];
}

/**
 * String formatter
 * @param aForm {string}
 * @param aAttribute {hash}
 */
function F(aForm, aAttribute) {
  for (let [name, value] in Iterator(aAttribute)) {
    aForm = aForm.replace('%' + name + '%', String(value));
  }
  return aForm;
}


//********** Entry point

ScriptList_init();


})(this);
