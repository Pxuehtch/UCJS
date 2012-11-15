// ==UserScript==
// @name SortList.uc.js
// @description Sorting function of a listview of the Page Info window.
// @include chrome://browser/content/pageinfo/pageInfo.xul
// ==/UserScript==

// @note Disables the default sorting function.


(function() {


"use strict";


const kSORT_DIRECTION_ATTRIBUTE = 'sortDirection';
const kSortDirections = ['ascending', 'descending', 'natural'];


/**
 * Cache of the custom properties of a tree view.
 */
var mSortState = (function() {
  var mMap = new WeakMap();

  function get(aTreeView) {
    if (!mMap.has(aTreeView)) {
      mMap.set(aTreeView, {});
    }
    return mMap.get(aTreeView);
  }

  return {
    get: get,
  };
})();


/**
 * Implements the click handler of a header.
 * @see chrome://browser/content/pageinfo/pageInfo.js
 */
pageInfoTreeView.prototype.cycleHeader = function(aColumn) {
  // Useless of sorting when a single row.
  if (this.rowCount < 2)
    return;

  var element = aColumn.element;
  var direction = element.getAttribute(kSORT_DIRECTION_ATTRIBUTE) || 'natural';
  direction = kSortDirections[(kSortDirections.indexOf(direction) + 1) % 3];
  element.setAttribute(kSORT_DIRECTION_ATTRIBUTE, direction);

  var state = mSortState.get(this);

  if (state.sortColumn !== aColumn) {
    if (state.sortColumn) {
      // Remove the previous sorting mark of a header.
      state.sortColumn.element.removeAttribute(kSORT_DIRECTION_ATTRIBUTE);
    }
    state.sortColumn = aColumn;
  }

  // Only the first time store the natural order.
  if (!state.naturalData) {
    state.naturalData = this.data.concat();
  }

  if (direction === 'natural') {
    this.data = state.naturalData.concat();
  } else {
    sort(this.data, aColumn.index, direction === 'ascending');
  }

  // Give focus on the first row.
  this.selection.clearSelection();
  this.selection.select(0);
  this.invalidate();
  this.tree.ensureRowIsVisible(0);
};

function sort(aData, aColumnIndex, aAscending) {
  var comparator = !isNaN(aData[0][aColumnIndex]) ?
    function(a, b) a - b :
    function(a, b) a.toLowerCase().localeCompare(b.toLowerCase());

  aData.sort(function(a, b) comparator(a[aColumnIndex], b[aColumnIndex]));
  if (!aAscending) {
    aData.reverse();
  }
}


// Disables the default sort functions.
// @modified chrome://browser/content/pageinfo/pageInfo.js::onPageMediaSort
gMetaView.onPageMediaSort = function() {};
gImageView.onPageMediaSort = function() {};


})();
