// ==UserScript==
// @name        ListFilter.uc.js
// @description Filter of results of some category in the error console.
// @include     chrome://global/content/console.xul
// ==/UserScript==

// @require Util.uc.js


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  createNode: $E,
  getNodeById: $ID,
  setEventListener: addEvent,
  setGlobalStyleSheet,
  removeGlobalStyleSheet
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('ListFilter.uc.js', aMsg);
}

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

function toggleCSS(aCSS, aHidden) {
  if (aHidden) {
    setGlobalStyleSheet(aCSS, 'USER_SHEET');
  } else {
    removeGlobalStyleSheet(aCSS, 'USER_SHEET');
  }
}


//********** Entry point

function ListFilter_init() {
  makeUI();
  addEvent([window, 'unload', uninit, false]);
}

ListFilter_init();


})(this);
