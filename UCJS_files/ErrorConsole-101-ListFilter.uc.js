// ==UserScript==
// @name        ListFilter.uc.js
// @description Filter of results of some category in the error console.
// @include     chrome://global/content/console.xul
// ==/UserScript==

// @require Util.uc.js


(function() {


"use strict";


//********** Preferences

/**
 * Selector for filtering
 * @note Each key is set to a label of UI
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
  var toolbar = document.getElementById('ToolbarMode');

  var container = document.createElement('hbox');
  container.id = 'ucjs_listFilter_container';

  for (let key in kSelector) {
    let element = document.createElement('checkbox');
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

function addEvent(aData) {
  ucjsUtil.setEventListener(aData);
}

function toggleCSS(aCSS, aHidden) {
  if (aHidden) {
    ucjsUtil.setGlobalStyleSheet(aCSS);
  } else {
    ucjsUtil.removeGlobalStyleSheet(aCSS);
  }
}

function log(aMsg)
  ucjsUtil.logMessage('ListFilter.uc.js', aMsg);


//********** Entry point

function ListFilter_init() {
  makeUI();
  addEvent([window, 'unload', uninit, false]);
}

ListFilter_init();


})();
