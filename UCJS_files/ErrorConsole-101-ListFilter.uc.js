// ==UserScript==
// @name        ListFilter.uc.js
// @description Filter of results of some category in the error console.
// @include     chrome://global/content/console.xul
// ==/UserScript==

// @require Util.uc.js


(function() {


"use strict";


// Preferences

/**
 * Selector for filtering
 * @note Each key is set to a label of UI
 */
const kSelector = {
  'CSS': '.console-row[category^="CSS"]',
  'Content': '.console-row[href^="http"]'
};


// Functions

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

function toggle(aEvent) {
  var {label, checked} = aEvent.target;
  var hidden = !checked;

  Array.forEach($S(kSelector[label], gConsole.mConsoleRowBox), function(a) {
    a.hidden = hidden;
  });
}


// Utilities

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function $S(aSelector, aContext)
  ucjsUtil.getNodesBySelector(aSelector, aContext);

function log(aMsg)
  ucjsUtil.logMessage('ListFilter.uc.js', aMsg);


// Entry point

function ListFilter_init() {
  makeUI();
}

ListFilter_init();


})();
