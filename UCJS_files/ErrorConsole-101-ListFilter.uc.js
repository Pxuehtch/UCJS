// ==UserScript==
// @name        ListFilter.uc.js
// @description Filter of results of some category in the error console.
// @include     chrome://global/content/console.xul
// ==/UserScript==

// @require Util.uc.js


(function(window, undefined) {


"use strict";


/**
 * Selector for filtering
 * @note Each key is set to the label of UI
 */
const kSelector = {
  'CSS': '.console-row[category^="CSS"]',
  'Content': '.console-row[href^="http"]'
};

const kStyle = {
  hidden: '{display:none;}'
};


//********** Functions

function makeUI() {
  var toolbar = $ID('ToolbarMode');

  var container = $E('hbox');
  container.id = 'ucjs_listFilter_container';

  for (let key in kSelector) {
    let element = $E('checkbox');
    element.setAttribute('label', key);
    element.setAttribute('checked', true);
    addEvent([element, 'command', toggle, false]);

    container.appendChild(element);
  }

  toolbar.appendChild(container);
}

function uninit(aEvent) {
  var {hidden} = kStyle;

  for (let key in kSelector) {
    toggleCSS(kSelector[key] + hidden, false);
  }
}

function toggle(aEvent) {
  var {label, checked} = aEvent.target;
  var {hidden} = kStyle;

  toggleCSS(kSelector[label] + hidden, !checked);
}


//********** Utilities

function $ID(aID) {
  return window.document.getElementById(aID);
}


//********** Imports

function $E(aTag) {
  return window.ucjsUtil.createNode(aTag);
}

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function toggleCSS(aCSS, aHidden) {
  if (aHidden) {
    window.ucjsUtil.setGlobalStyleSheet(aCSS, 'USER_SHEET');
  } else {
    window.ucjsUtil.removeGlobalStyleSheet(aCSS, 'USER_SHEET');
  }
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('ListFilter.uc.js', aMsg);
}


//********** Entry point

function ListFilter_init() {
  makeUI();
  addEvent([window, 'unload', uninit, false]);
}

ListFilter_init();


})(this);
