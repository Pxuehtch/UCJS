// ==UserScript==
// @name SortList.uc.js
// @description Sorting function of listview in a page info window.
// @include chrome://browser/content/pageinfo/pageInfo.xul
// ==/UserScript==


(function(){


"use strict";


const kSORT_DIRECTION_ATTRIBUTE = 'sortDirection';
const kSortDirections = ['ascending', 'descending', 'natural'];

var naturalData = null;

pageInfoTreeView.prototype.cycleHeader = function(aColumn) {
  if (this.rowCount < 2)
    return;

  var element = aColumn.element;
  var direction = element.getAttribute(kSORT_DIRECTION_ATTRIBUTE) || 'natural';
  direction = kSortDirections[(kSortDirections.indexOf(direction) + 1) % 3];
  element.setAttribute(kSORT_DIRECTION_ATTRIBUTE, direction);

  if (!naturalData) {
    naturalData = this.data.concat();
  }

  if (direction === 'natural') {
    this.data = naturalData.concat();
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
