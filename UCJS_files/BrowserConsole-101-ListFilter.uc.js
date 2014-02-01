// ==UserScript==
// @name        ListFilter.uc.js
// @description Filters messages by category in the Browser Console window
// @include     chrome://browser/content/devtools/webconsole.xul
// ==/UserScript==

// @require Util.uc.js
// @usage adds toggle buttons on the toolbar

// @see resource://app/modules/devtools/webconsole/webconsole.js


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  createNode: $E,
  getNodeById: $ID,
  getNodesByXPath: $X,
  getFirstNodeByXPath: $X1,
  getFirstNodeBySelector: $S1,
  addEvent,
  setChromeStyleSheet: setCSS
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('ListFilter.uc.js', aMsg);
}

/**
 * List of items
 *
 * @param category {string}
 *   @note set a unique string to distinguish from other items for internal
 *   using
 *   @note used as the label of a menu item
 * @param description {string}
 *   @note used as the tooltip of a button
 * @param condition {string}
 *   XPath condition for filtering
 *   @note applied to an item of listview; |div.message|
 */
const kItemList = [
  {
    category: 'Content',
    description: 'Log messages on the content window',
    condition: '[.//a[starts-with(@href, "http")]]'
  }
];

/**
 * Identifier
 */
const kID = {
  item: 'ucjs_ListFilter_item',
  filteredBy: 'ucjs_ListFilter_filteredBy'
};

/**
 * Fx native UI elements
 */
const UI = {
  get outputContainer() {
    return $ID('output-container');
  },

  get clearButton() {
    return $S1('.webconsole-clear-console-button');
  }
};

/**
 * List of the filtered categories
 *
 * @note being initialized in |onCommand()|
 */
const FilteredCategory = {};

function ListFilter_init() {
  setStyleSheet();
  makeUI();
  setObserver();
}

function setStyleSheet() {
  // CSS for hiding of rows for each category
  let css =
    kItemList.map(({category}) => '.' + kID.filteredBy + category).
    join(',') + '{display:none;}';

  setCSS(css);
}

function makeUI() {
  let clearButton = UI.clearButton;

  // insert tab indexes of our button before the clear button
  // TODO: the clear button has the last index in the console window on the
  // current version of Fx. so, if a new index has been appended after the
  // clear button in the future, we would need to re-index it
  let lastTabIndex = clearButton.tabIndex;

  kItemList.forEach(({category, description}, i) => {
    let toolbarButton = $E('toolbarbutton', {
      id: kID.item + i,
      label: category,
      tooltiptext: description,
      accesskey: i + 1,
      class: 'devtools-toolbarbutton',
      type: 'checkbox',
      checked: true,
      tabindex: lastTabIndex++
    });

    addEvent(toolbarButton, 'command', onCommand, false);

    clearButton.parentNode.insertBefore(toolbarButton, clearButton);
  });

  clearButton.tabIndex = lastTabIndex;
}

function setObserver() {
  const {Services} = window.Cu.import('resource://gre/modules/Services.jsm');

  Services.obs.
  addObserver(onMessageAdded, 'web-console-message-created', false);

  addEvent(window, 'unload', () => {
    Services.obs.
    removeObserver(onMessageAdded, 'web-console-message-created');
  }, false);
}

/**
 * Event listener of a button command
 */
function onCommand(aEvent) {
  aEvent.stopPropagation();

  let target = aEvent.target;

  let buttonID = target.id;
  let doFilter = !target.checked;

  let index = +buttonID.replace(kID.item, '');
  let {category, condition} = kItemList[index];
  let filterKey = kID.filteredBy + category;

  FilteredCategory[category] = doFilter;

  let xpath = './/*[contains(@class, "message")]' + condition;
  let nodes = $X(xpath, UI.outputContainer);

  if (nodes) {
    for (let i = 0, l = nodes.snapshotLength; i < l; i++) {
      let node = nodes.snapshotItem(i);

      if (doFilter) {
        node.classList.add(filterKey);
      }
      else {
        node.classList.remove(filterKey);
      }
    }
  }
}

/**
 * Observer of new message added
 *
 * !!! WARNING !!!
 * take care of logging for debug in this observer. the output of message to
 * the console is created recursively
 * !!! WARNING !!!
 */
function onMessageAdded(aSubject, aTopic, aData) {
  let nodeID = aData;

  if (!nodeID) {
    return;
  }

  kItemList.forEach(({category, condition}) => {
    if (FilteredCategory[category]) {
      let xpath = 'id("' + nodeID + '")' + condition;
      let node = $X1(xpath, UI.outputContainer);

      if (node) {
        let filterKey = kID.filteredBy + category;
        node.classList.add(filterKey);
      }
    }
  });
}

/**
 * Entry point
 */
ListFilter_init();


})(this);