// ==UserScript==
// @name        ListFilter.uc.js
// @description Filter of results of some category in the error console
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
  addEvent,
  setGlobalStyleSheet,
  removeGlobalStyleSheet
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('ListFilter.uc.js', aMsg);
}

/**
 * Identifier
 */
const kID = {
  container: 'ucjs_listFilter_container'
};

/**
 * Selector for filtering
 * @note Each key is set to the label of UI
 */
const kSelector = {
  'CSS': '.console-row[category^="CSS"]',
  'Content': '.console-row[href^="http"]'
};

const kStyle = {
  hidden: {
    'visibility': 'collapse'
  }
};

function makeUI() {
  let toolbar = $ID('ToolbarMode');

  let container = $E('hbox', {
    id: kID.container
  });

  for (let key in kSelector) {
    let element = $E('checkbox', {
      label: key,
      checked: true
    });
    addEvent(element, 'command', onCommand, false);

    container.appendChild(element);
  }

  toolbar.appendChild(container);
}

function uninit(aEvent) {
  let {hidden} = kStyle;

  for (let key in kSelector) {
    toggleCSS(kSelector[key] + hidden, false);
  }
}

function onCommand(aEvent) {
  let {label, checked} = aEvent.target;
  let {hidden} = kStyle;
  let css = '';

  for (let key in hidden) {
    css += key + ':' + hidden[key] + '!important;';
  }

  toggleCSS(kSelector[label] + '{' + css + '}', !checked);
}

function toggleCSS(aCSS, aDoRegister) {
  if (aDoRegister) {
    setGlobalStyleSheet(aCSS, 'USER_SHEET');
  } else {
    removeGlobalStyleSheet(aCSS, 'USER_SHEET');
  }
}

/**
 * Entry point
 */
function ListFilter_init() {
  makeUI();
  addEvent(window, 'unload', uninit, false);
}

ListFilter_init();


})(this);
