// ==UserScript==
// @name SortList.uc.js
// @description Sorting listview of a page info window.
// @include chrome://browser/content/pageinfo/pageInfo.xul
// ==/UserScript==


(function() {


"use strict";


const kSORT_DIRECTION_ATTRIBUTE = 'sortDirection';
const kSortDirections = ['ascending', 'descending', 'natural'];


// @see chrome://browser/content/pageinfo/pageInfo.js
pageInfoTreeView.prototype.cycleHeader = function(aColumn) {
  if (this.rowCount < 2)
    return;

  var element = aColumn.element;
  var direction = element.getAttribute(kSORT_DIRECTION_ATTRIBUTE) || 'natural';
  direction = kSortDirections[(kSortDirections.indexOf(direction) + 1) % 3];
  element.setAttribute(kSORT_DIRECTION_ATTRIBUTE, direction);

  // Uses a reserved property 'sortcol'.
  if (this.sortcol !== aColumn) {
    if (this.sortcol) {
      this.sortcol.element.removeAttribute(kSORT_DIRECTION_ATTRIBUTE);
    }
    this.sortcol = aColumn;
  }

  // Extends a custom property.
  if (!this._naturalData) {
    this._naturalData = this.data.concat();
  }

  if (direction === 'natural') {
    this.data = this._naturalData.concat();
  } else {
    sort(this.data, aColumn.index, direction === 'ascending');
  }

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


})();
