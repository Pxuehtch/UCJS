// ==UserScript==
// @name SortList.uc.js
// @description Customizes sorting of a listview of the Page Info window.
// @include chrome://browser/content/pageinfo/pageInfo.xul
// ==/UserScript==


(function(window) {


"use strict";


const kSORT_DIRECTION_ATTRIBUTE = 'sortDirection';
const kSortDirections = ['ascending', 'descending', 'natural'];

/**
 * Cache of the custom properties of a tree view.
 */
const SortState = (function() {
  let mState = new WeakMap();

  function clear() {
    mState = null;
  }

  function get(aTreeView) {
    if (!mState.has(aTreeView)) {
      mState.set(aTreeView, {});
    }

    return mState.get(aTreeView);
  }

  return {
    get,
    clear
  };
})();

/**
 * Implements the click handler of a header.
 *
 * @see chrome://browser/content/pageinfo/pageInfo.js
 */
window.pageInfoTreeView.prototype.cycleHeader =
  function ucjsSortList_cycleHeader(aColumn) {
  // Don't sort a single row.
  if (this.rowCount < 2) {
    return;
  }

  let element = aColumn.element;
  let direction = element.getAttribute(kSORT_DIRECTION_ATTRIBUTE) || 'natural';

  direction = kSortDirections[(kSortDirections.indexOf(direction) + 1) % 3];
  element.setAttribute(kSORT_DIRECTION_ATTRIBUTE, direction);

  let state = SortState.get(this);

  if (state.sortColumn !== aColumn) {
    if (state.sortColumn) {
      // Remove the previous sorting mark of a header.
      state.sortColumn.element.removeAttribute(kSORT_DIRECTION_ATTRIBUTE);
    }

    state.sortColumn = aColumn;
  }

  // Store the natural order at the first time.
  if (!state.naturalData) {
    state.naturalData = this.data.slice();
  }

  if (direction === 'natural') {
    this.data = state.naturalData.slice();
  }
  else {
    sort(this.data, aColumn.index, direction === 'ascending');
  }

  // Give focus on the first row.
  this.selection.clearSelection();
  this.selection.select(0);
  this.invalidate();
  this.tree.ensureRowIsVisible(0);
};

function sort(aData, aColumnIndex, aAscending) {
  let comparator;

  if (aData.some((row) => typeof row[aColumnIndex] === 'string')) {
    comparator = (a, b) => {
      let toString = (value) => {
        if (value === undefined || value === null) {
          return '';
        }

        return (value + '').toLowerCase();
      };

      return toString(a).localeCompare(toString(b));
    };
  }
  else {
    comparator = (a, b) => a - b;
  }

  aData.sort((a, b) => comparator(a[aColumnIndex], b[aColumnIndex]));

  if (!aAscending) {
    aData.reverse();
  }
}

/**
 * Disables the default sort functions.
 *
 * @modified chrome://browser/content/pageinfo/pageInfo.js::onPageMediaSort
 */
window.gMetaView.onPageMediaSort =
  function ucjsSortList_MetaView_onPageMediaSort() {};

window.gImageView.onPageMediaSort =
  function ucjsSortList_ImageView_onPageMediaSort() {};

/**
 * Clean up when the Page Info window is closed.
 *
 * @see chrome://browser/content/pageinfo/pageInfo.js::onUnloadRegistry
 */
window.onUnloadRegistry.push(() => {
  SortState.clear();
});


})(this);
