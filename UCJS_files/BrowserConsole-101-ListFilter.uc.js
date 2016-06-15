// ==UserScript==
// @name ListFilter.uc.js
// @description Filters messages by category in the Browser Console window.
// @include chrome://devtools/content/webconsole/webconsole.xul
// ==/UserScript==

// @require Util.uc.js

// @usage The toggle buttons are appended on the toolbar.

// @see resource://devtools/client/webconsole/webconsole.js


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  Listeners: {
    $event,
    $shutdown
  },
  DOMUtils: {
    $E,
    $ID,
    $X,
    $X1,
    $S1
  },
  CSSUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

/**
 * List of items.
 *
 * @param category {string}
 *   A category name.
 *   @note Set a unique string to distinguish from the other items for internal
 *   using.
 *   @note Used as the label of a button.
 * @param description {string}
 *   @note Used as the tooltip of a button.
 * @param condition {string}
 *   XPath condition for filtering.
 *   @note Applied to items of listview |div.message|.
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
    // @note The class name for styling a button.
    id: 'ucjs_ListFilter_button'
  }
};

/**
 * Key name for storing data.
 */
const kDataKey = {
  // Extended attribute name of an element.
  // @note The class name prefix of a listview item being filtered by category.
  filteredBy: 'ucjs_ListFilter_filteredBy'
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
  // The class names of items being filtered by category.
  let filteredBy =
    kItemList.map(({category}) => '.' + kDataKey.filteredBy + category).
    join(',');

  // Set the style of our 'checkbox' type button to the same style of the
  // native 'menu-button' type button.
  // @note This is adjusted to the light theme.
  // @see https://developer.mozilla.org/en/docs/Tools/DevToolsColors
  CSSUtils.setChromeStyleSheet(`
    ${filteredBy} {
      display: none;
    }
    .${kUI.button.id} {
      margin: 2px 0 2px 2px !important;
      padding: 1px 1px 1px 0 !important;
    }
    .${kUI.button.id}:not(:hover) {
      background-color: transparent !important;
    }
    .theme-light .${kUI.button.id}[checked] {
      background-color: rgba(76, 158, 217, .2) !important;
    }
    .theme-light .${kUI.button.id}[checked]:hover {
      background-color: rgba(76, 158, 217, .4) !important;
    }
  `);
}

function makeUI() {
  // Append our buttons after the native filter buttons in the buttons
  // container.
  let lastFilterButton =
    $S1('.devtools-toolbarbutton-group > toolbarbutton:last-child');
  let filterButtonContainer = lastFilterButton.parentNode;

  // Make tab indexes of our buttons follow after the native buttons.
  let tabIndex = lastFilterButton.tabIndex;

  kItemList.forEach(({category, description}, i) => {
    let toolbarButton = $E('toolbarbutton', {
      id: kUI.button.id + i,
      label: category,
      tooltiptext: description,
      accesskey: i + 1,
      class: ['devtools-toolbarbutton', kUI.button.id].join(' '),
      type: 'checkbox',
      checked: true,
      tabindex: ++tabIndex
    });

    $event(toolbarButton, 'command', onCommand);

    filterButtonContainer.appendChild(toolbarButton);
  });

  // Re-index the tab index of the clear button.
  // @note The clear button is the only element that has a large tab index than
  // the last native filter button's on Fx47.
  // @see chrome://devtools/content/webconsole/webconsole.xul::tabindex
  $S1('.webconsole-clear-console-button').tabIndex = ++tabIndex;
}

function setObserver() {
  function observeMessageAdded(aBrowserConsole) {
    aBrowserConsole.ui.on('new-messages', onMessageAdded);

    // Clean up when the console window closes.
    $shutdown(() => {
      aBrowserConsole.ui.off('new-messages', onMessageAdded);
    });
  }

  // @see resource://devtools/client/webconsole/hudservice.js
  const HUDService = Modules.require('devtools/client/webconsole/hudservice');

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
  let nodes = $X(xpath, $ID('output-container'));

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
function onMessageAdded(aEvent, aNewMessages) {
  if (!aNewMessages) {
    return;
  }

  kItemList.forEach(({category, condition}) => {
    if (FilteredCategory[category]) {
      for (let message of aNewMessages) {
        let node = message.node;

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
  // Put a mark to our logging string to prevent a recursive output.
  // TODO: Ensure a unique id.
  const kLogMark = '(log in onMessageAdded)';

  if (aMessageNode.textContent.includes(kLogMark)) {
    return;
  }

  // Log to console.
  log([aOutput, kLogMark]);
}

/**
 * Entry point.
 */
ListFilter_init();


})(this);
