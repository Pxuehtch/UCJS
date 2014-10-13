// ==UserScript==
// @name ListFilter.uc.js
// @description Filters messages by category in the Browser Console window.
// @include chrome://browser/content/devtools/webconsole.xul
// ==/UserScript==

// @require Util.uc.js

// @usage Adds toggle buttons on the toolbar.

// @see resource://app/modules/devtools/webconsole/webconsole.js


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  XPCOM: {
    getModule
  },
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
 * List of items.
 *
 * @param category {string}
 *   A category name.
 *   @note Set a unique string to distinguish from other items for internal
 *   using.
 *   @note Used as the label of a button.
 * @param description {string}
 *   @note Used as the tooltip of a button.
 * @param condition {string}
 *   XPath condition for filtering.
 *   @note applied to items of listview |div.message|.
 */
const kItemList = [
  {
    category: 'Content',
    description: 'Log messages on the content window',
    condition: '[.//a[starts-with(@href, "http") and not(contains(@class, "learn-more-link"))]]'
  }
];

/**
 * UI setting.
 */
const kUI = {
  button: {
    // @note The id prefix of a button.
    id: 'ucjs_ListFilter_button'
  }
};

/**
 * Key name for storing data.
 *
 * @note Extended attribute name of a filtered item.
 */
const kDataKey = {
  // @note The class name prefix of a listview item being filtered by category.
  filteredBy: 'ucjs_ListFilter_filteredBy'
};

/**
 * Fx native UI elements.
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
 * List of the categories being filtered.
 *
 * @note Initialized in |onCommand()|.
 */
let FilteredCategory = {};

function ListFilter_init() {
  setStyleSheet();
  makeUI();
  setObserver();
}

function setStyleSheet() {
  // Register CSS for hiding of rows for each category.
  let classNames =
    kItemList.map(({category}) => '.' + kDataKey.filteredBy + category);

  setCSS(classNames.join(',') + '{display:none;}');
}

function makeUI() {
  let clearButton = UI.clearButton;

  // Insert tab indexes of our buttons before the clear button.
  // TODO: The clear button has the last index in the console window on the
  // current version of Fx. So if a new index has been appended after the
  // clear button in the future, we would need to re-index it.
  // @see chrome://browser/content/devtools/webconsole.xul::tabindex
  let lastTabIndex = clearButton.tabIndex;

  kItemList.forEach(({category, description}, i) => {
    let toolbarButton = $E('toolbarbutton', {
      id: kUI.button.id + i,
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
  function observeMessageAdded(aBrowserConsole) {
    aBrowserConsole.ui.on('messages-added', onMessageAdded);

    addEvent(window, 'unload', () => {
      aBrowserConsole.ui.off('messages-added', onMessageAdded);
    }, false);
  }

  // @see resource://app/modules/devtools/webconsole/hudservice.js
  const HUDService = getModule('devtools/webconsole/hudservice');

  let browserConsole = HUDService.getBrowserConsole();

  if (browserConsole) {
    observeMessageAdded(browserConsole);
    return;
  }

  Services.obs.addObserver(function observer(aSubject, aTopic) {
    Services.obs.removeObserver(observer, aTopic);

    observeMessageAdded(HUDService.getBrowserConsole());
  }, 'web-console-created', false);
}

/**
 * Event listener of a button command.
 */
function onCommand(aEvent) {
  let button = aEvent.target;

  let id = button.id;

  if (!id.startsWith(kUI.button.id)) {
    return;
  }

  let {category, condition} = kItemList[+id.replace(kUI.button.id, '')];
  let filterKey = kDataKey.filteredBy + category;
  let doFilter = !button.checked;

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
 * Observer of new messages added.
 *
 * !!! WARNING !!!
 * Use |logOnMessageAdded| to log in this observer for avoiding recursive
 * outputs.
 * !!! WARNING !!!
 */
function onMessageAdded(aEvent, aMessageNodes) {
  if (!aMessageNodes) {
    return;
  }

  kItemList.forEach(({category, condition}) => {
    if (FilteredCategory[category]) {
      for (let node of aMessageNodes) {
        /* logOnMessageAdded(node, 'message added'); */

        if ($X1('.' + condition, node)) {
          let filterKey = kDataKey.filteredBy + category;

          node.classList.add(filterKey);
        }
      }
    }
  });
}

function logOnMessageAdded(aMessageNode, aOutput) {
  // TODO: Ensure making a unique id.
  const kLogMark = '(log in onMessageAdded)';

  // Prevent recursion with the browser console.
  if (aMessageNode.textContent.contains(kLogMark)) {
    return;
  }

  log([aOutput, kLogMark]);
}

/**
 * Entry point.
 */
ListFilter_init();


})(this);
