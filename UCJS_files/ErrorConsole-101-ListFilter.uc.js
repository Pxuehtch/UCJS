// ==UserScript==
// @name        ListFilter.uc.js
// @description Filter of results of some category in the error console.
// @include     chrome://global/content/console.xul
// ==/UserScript==

// @require Util.uc.js


(function() {


"use strict";


// Preferences.

/**
 * Selector for the HIDDEN category in list view.
 * @note Each key is set to a label of UI.
 */
const kDeselector = {
  // Not item of CSS.
  'CSS': '.console-row[category^="CSS"]',

  // Not item in content.
  'Content': '.console-row:not([category]):not([href^="chrome://"]):not([type="error"]):not([type="message"]),.console-row[category]:not([category~="chrome"]):not([category~="component"]):not([href^="chrome://"])'
};

const kStyle = {
  hidden: '{visibility:collapse;-moz-user-focus:ignore;}'
};


// Functions.

function makeUI() {
  var toolbar = document.getElementById('ToolbarMode');

  var container = document.createElement('hbox');
  container.id = 'ucjs_listFilter_container';

  for (let key in kDeselector) {
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

  for each (let selector in kDeselector) {
    toggleCSS(selector + hidden, false);
  }
}

function toggle(aEvent) {
  var {label, checked} = aEvent.target;

  toggleCSS(kDeselector[label] + kStyle.hidden, !checked);
}

function toggleCSS(aCSS, aHidden) {
  if (aHidden) {
    registerCSS(aCSS);
  } else {
    unregisterCSS(aCSS);
  }
}


// Utilities.

function addEvent(aData)
  ucjsUtil.setEventListener(aData);

function registerCSS(aCSS)
  ucjsUtil.setGlobalStyleSheet(aCSS);

function unregisterCSS(aCSS)
  ucjsUtil.removeGlobalStyleSheet(aCSS);

function log(aMsg)
  ucjsUtil.logMessage('ListFilter.uc.js', aMsg);


// Entry point.

makeUI();
addEvent([window, 'unload', uninit, false]);


})();
