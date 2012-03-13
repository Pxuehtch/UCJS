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
var sortState = {index: 0, order: 0};

pageInfoTreeView.prototype.cycleHeader = function(aColumn) {
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
    sortState.index = aColumn.index;
    sortState.order = (direction === 'ascending') ? 1 : -1;
    this.data.sort(sorter);
  }
};

function sorter(aRowA, aRowB) {
  var a = getData(aRowA), b = getData(aRowB);
  return a === b ? 0 : (a < b ? -1 : 1) * sortState.order;
}

function getData(aRow) {
  var data = aRow[sortState.index];
  return (typeof data === 'string') ? data.toLowerCase() : data;
}


})();
