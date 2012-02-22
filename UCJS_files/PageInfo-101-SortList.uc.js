// ==UserScript==
// @name SortList.uc.js
// @description Sorting function of listview in a page info window.
// @include chrome://browser/content/pageinfo/pageInfo.xul
// ==/UserScript==


(function(){


"use strict";


var naturalData = null;
var sortState = {index: 0, order: 0};

pageInfoTreeView.prototype.cycleHeader = function(aColumn) {
  const SORT_DIR_ATTR = 'sortDirection';

  var dir = aColumn.element.getAttribute(SORT_DIR_ATTR);
  switch (dir) {
    case 'ascending' :
      dir = 'descending';
      break;
    case 'descending':
      dir = 'natural';
      break;
    default:
      dir = 'ascending';
      break;
  }

  aColumn.element.setAttribute(SORT_DIR_ATTR, dir);

  if (!naturalData) {
    naturalData = this.data.concat();
  }

  switch (dir) {
    case 'natural':
      this.data = naturalData.concat();
      break;
    default:
      sortState.index = this.tree.columns.getColumnFor(aColumn.element).index;
      sortState.order = (dir === 'ascending') ? 1 : -1;
      this.data.sort(sorter);
      break;
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
