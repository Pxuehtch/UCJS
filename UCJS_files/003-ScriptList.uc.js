// ==UserScript==
// @name ScriptList.uc.js
// @description userChrome.js_extension user script list viewer.
// @include main
// ==/UserScript==

// @require userChrome.js with ucjsScriptLoader.
// @note Some properties is exported in global window. (ucjsScriptList.XXX)


(function() {


"use strict";


/**
 * UI bundle.
 * @note U() for UI display.
 */
const kUIBundle = {
  menu: U({
    id: 'ucjs_scriptList_menu',
    label: 'userChrome.js [登録: %COUNT%]',
    accesskey: 'u',
    disabledTip: 'スクリプトの読込なし',
    selectLabel: 'Open scripts list...',
    selectAccesskey: 'l',
    selectTip:   'スクリプトリストを開く'
  }),

  panel: U({
    id: 'ucjs_scriptList_panel',
    title: 'userChrome.js Script List',
    scriptDataListID: 'ucjs_scriptList_scriptDataList',
    scriptInfoCaptionID: 'ucjs_scriptList_scriptInfoCaption',
    scriptInfoCaption: 'Information: [#%SELECTED% / %COUNT%]',
    scriptInfoBoxID: 'ucjs_scriptList_scriptInfoBox',
    closeButton: '閉じる'
  })
};


// Main.

var gScriptLoader = window.ucjsScriptLoader;
if (gScriptLoader) {
  createMenu();
  // Exports in global scope.
  window.ucjsScriptList = ScriptListPanel();
}


// Modules.

function getScriptData(aIndex) {
  const {jscripts, overlays} = gScriptLoader.scriptList;
  var data = jscripts.concat(overlays);
  return aIndex >= 0 ? data[aIndex] : data;
}

function getScriptCount() {
  const {jscripts, overlays} = gScriptLoader.scriptList;
  return jscripts.concat(overlays).length;
}

/**
 * Create menu in menu-bar.
 */
function createMenu() {
  const {menu: kMenuUI} = kUIBundle;

  var menu = $ID('menu_ToolsPopup').appendChild($E('menu', {
    id: kMenuUI.id,
    label: F(kMenuUI.label, {'COUNT': getScriptCount()}),
    accesskey: kMenuUI.accesskey
  }));

  if (getScriptCount()) {
    menu.appendChild($E('menupopup')).appendChild($E('menuitem', {
      label: kMenuUI.selectLabel,
      accesskey: kMenuUI.selectAccesskey,
      tooltiptext: kMenuUI.selectTip,
      oncommand: 'ucjsScriptList.open();'
    }));
  } else {
    $E(menu, {
      tooltiptext: kMenuUI.disabledTip,
      disabled: true
    });
  }
}

/**
 * ScriptListPanel handler.
 * @return {hash}
 *   @member open {function}
 *   @member close {function}
 */
function ScriptListPanel() {
  const {panel: kPanelUI} = kUIBundle;

  makePanel();

  function getPanel() $ID(kPanelUI.id);
  function getScriptDataList() $ID(kPanelUI.scriptDataListID);
  function getScriptInfoCaption() $ID(kPanelUI.scriptInfoCaptionID);
  function getScriptInfoBox() $ID(kPanelUI.scriptInfoBoxID);

  function makePanel() {
    var panel = $ID('mainPopupSet').appendChild($E('panel', {
      id: kPanelUI.id,
      noautohide: true,
      backdrag: true,
      style: 'min-width:40em;'
    }));

    // Title.
    panel.appendChild($E('hbox', {pack: 'center'})).appendChild($E('label', {
      value: kPanelUI.title,
      class: 'header'
    }));

    // Script list view.
    var treeView = panel.appendChild($E('hbox', {flex: 1})).appendChild($E('tree', {
      id: kPanelUI.scriptDataListID,
      flex: 1,
      seltype: 'single',
      hidecolumnpicker: true,
      style: 'width:auto;',
      rows: 20
    }));
    addEvent([treeView, 'select', onSelectListItem, false]);

    var treeCols = treeView.appendChild($E('treecols'));
    treeCols.appendChild($E('treecol', {label: '#', fixed: true, style: 'width:auto;text-align:right;'}));
    treeCols.appendChild($E('splitter', {class: 'tree-splitter', hidden: true}));
    treeCols.appendChild($E('treecol', {label: 'File', flex: 1, style: 'min-width:15em;'}));
    treeCols.appendChild($E('splitter', {class: 'tree-splitter'}));
    treeCols.appendChild($E('treecol', {label: 'Ext.', fixed: true, style: 'width:auto;'}));
    treeCols.appendChild($E('splitter', {class: 'tree-splitter', hidden: true}));
    treeCols.appendChild($E('treecol', {label: 'Folder', flex: 1, style: 'min-width:15em;'}));

    var treeChildren = treeView.appendChild($E('treechildren'));
    getScriptData().forEach(function(script, i) {
      var treeRow = treeChildren.appendChild($E('treeitem')).appendChild($E('treerow'));
      treeRow.appendChild($E('treecell', {
        label: i + 1
      }));
      treeRow.appendChild($E('treecell', {
        label: script.getURL('FILENAME')
      }));
      treeRow.appendChild($E('treecell', {
        label: script.getURL('FILENAME').replace(/^.+\.([a-z]+)$/i, '$1').toUpperCase()
      }));
      treeRow.appendChild($E('treecell', {
        label: script.getURL('FOLDER')
      }));
    });

    // Script information.
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

    // Action buttons.
    var buttonsBox = panel.appendChild($E('hbox'));
    buttonsBox.appendChild($E('spacer', {flex: 1}));
    buttonsBox.appendChild($E('button', {
      label: kPanelUI.closeButton,
      oncommand: 'ucjsScriptList.close();'
    }));

    // Resizer.
    var resizerBox = panel.appendChild($E('hbox'));
    resizerBox.appendChild($E('spacer', {flex: 1}));
    resizerBox.appendChild($E('resizer', {dir: 'bottomend'}));
  }

  function onSelectListItem(aEvent) {
    var index = aEvent.target.currentIndex;

    getScriptInfoCaption().label = F(kPanelUI.scriptInfoCaption, {
      'SELECTED': index + 1,
      'COUNT': getScriptCount()
    });
    getScriptInfoBox().value = getScriptData(index).getMetaList();
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
    open: open,
    close: close
  };
}


// Utilities.

function getCenteringPosition(aElement) {
  var {clientWidth: w, clientHeight: h} = aElement;
  var x = 0, y = 0;

  if (window.outerWidth > w) {
    x = window.outerWidth - w;
  } else if (window.screen.availWidth > w) {
    x = window.screen.availWidth - w;
  }
  if (window.outerHeight > h) {
    y = window.outerHeight - h;
  } else if (window.screen.availHeight > h) {
    y = window.screen.availHeight - h;
  }

  return [x / 2, y / 2];
}

function $ID(aID) document.getElementById(aID);

function $E(aTagOrNode, aAttribute) {
  var element = (typeof aTagOrNode === 'string') ? document.createElement(aTagOrNode) : aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value !== null && typeof value !== 'undefined') {
        element.setAttribute(name, value);
      }
    }
  }

  return element;
}

function F(aForm, aAttribute) {
  for (let [name, value] in Iterator(aAttribute)) {
    aForm = aForm.replace('%' + name + '%', String(value));
  }
  return aForm;
}

/**
 * Converts 2-byte characters into UTF-16 in order to properly display UI.
 * @param aData {string}|{hash}
 */
function U(aData) {
  if (typeof aData === 'string') {
    return str4ui(aData);
  }

  for (let i in aData) {
    aData[i] = str4ui(aData[i]);
  }
  return aData;
}


// Imports.

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function str4ui(aStr)
  ucjsUtil.convertForSystem(aStr);

function log(aMsg)
  ucjsUtil.logMessage('ScriptList.uc.js', aMsg);


})();
