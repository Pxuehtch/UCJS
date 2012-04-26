// ==UserScript==
// @name LinkInfo.uc.js
// @description Link information for a pageinfo dialogue.
// @include chrome://browser/content/pageinfo/pageInfo.xul
// ==/UserScript==

// @note Some functions are exported. (ucjsLinkInfo.XXX)


var ucjsLinkInfo = (function() {


"use strict";


const kID = {
  linkTree: 'linktree',
  addressColumn: 'linktree-address'
};

const kType = {
  a: '<A>',
  area: '<AREA>',
  submit: 'Submit',
  script: '<SCRIPT>',
  link: '<LINK>',
  XLink: 'XLink',
  q: '<Q>',
  blockquote: '<BLOCKQUOTE>',
  ins: '<INS>',
  del: '<DEL>'
};

const kNote = {
  error: '[N/A]',
  image: '[IMG]'
};


var gLinkView = null;
var isListBuilt = false;

function init() {
  if (!gLinkView) {
    let tree = document.getElementById(kID.linkTree);
    let copyColumnIndex = tree.columns.getNamedColumn(kID.addressColumn).index;

    gLinkView = new pageInfoTreeView(copyColumnIndex);
    tree.view = gLinkView;
  }
  build();
}

function build() {
  if (!isListBuilt) {
    isListBuilt = true;

    goThroughFrames(gDocument, gWindow);
    LI_processFrames();
  }
}

function LI_processFrames() {
  if (gFrameList.length) {
    let doc = gFrameList[0];
    let iterator = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT, grabLink, true);

    gFrameList.shift();

    setTimeout(LI_doGrab, 10, iterator);
  }
}

function LI_doGrab(aIterator) {
  for (let i = 0; i < 500; ++i) {
    if (!aIterator.nextNode()) {
      LI_processFrames();
      return;
    }
  }

  setTimeout(LI_doGrab, 10, aIterator);
}

function grabLink(aNode) {
  if (aNode instanceof HTMLAnchorElement && aNode.href) {
    let imgs = aNode.getElementsByTagName('img');
    let name = ((imgs && imgs.length) ? kNote.image : '') + getText(aNode);
    addLink([name, aNode.href, kType.a, aNode.target, aNode.accessKey]);
  } else if (aNode instanceof HTMLScriptElement && aNode.src) {
    addLink([getText(aNode, kType.script), aNode.src, kType.script]);
  } else if (aNode instanceof HTMLLinkElement && aNode.href) {
    let target = aNode.rel || aNode.rev || '';
    addLink([getText(aNode, target), aNode.href, kType.link, target]);
  } else if ((aNode instanceof HTMLInputElement || aNode instanceof HTMLButtonElement) && aNode.type) {
    let name = '', address = '', target = '';
    switch (aNode.type.toLowerCase()) {
      case 'image':
        name = kNote.image;
        // Fall through.
      case 'submit':
        name += getText(aNode, aNode.alt || aNode.value || kType.submit);
        if ('form' in aNode && aNode.form) {
          address = aNode.form.action;
          target = aNode.form.target;
        }
        addLink([name, address || kNote.error, kType.submit, target || '']);
        break;
    }
  } else if (aNode instanceof HTMLAreaElement && aNode.href) {
    addLink([getText(aNode), aNode.href, kType.area, aNode.target]);
  } else if ((aNode instanceof HTMLQuoteElement || aNode instanceof HTMLModElement) && aNode.cite) {
    addLink([getText(aNode), aNode.cite, kType[aNode.localName]]);
  } else if (aNode.hasAttributeNS(XLinkNS, 'href')) {
    let address = '',
        href = aNode.getAttributeNS(XLinkNS, 'href'),
        charset = aNode.ownerDocument.characterSet;
    try {
      let baseURI = Services.io.newURI(aNode.baseURI, charset, null);
      address = Services.io.newURI(href, charset, baseURI).spec;
    } catch (e) {
      address = kNote.error;
    }
    addLink([getText(aNode), address, kType.XLink]);
  } else {
    return NodeFilter.FILTER_SKIP;
  }
  return NodeFilter.FILTER_ACCEPT;
}

function getText(aNode, aDefault) {
  return (getValueText(aNode) || aNode.title || aDefault || kNote.error).substr(0, 50);
}

function addLink(aValueArray) {
  gLinkView.addRow([gLinkView.rowCount + 1].concat(aValueArray));
}

function openLink(aEvent) {
  if (aEvent.originalTarget.localName != 'treechildren')
    return;

  var tree = aEvent.target;
  if (!('treeBoxObject' in tree)) {
    tree = tree.parentNode;
  }

  var row = {};
  tree.treeBoxObject.getCellAt(aEvent.clientX, aEvent.clientY, row, {}, {});
  if (row.value == -1)
    return;

  var column = tree.columns.getNamedColumn(kID.addressColumn);
  var URL = tree.treeBoxObject.view.getCellText(row.value, column);

  var opener = window.opener;
  if (opener && 'gBrowser' in opener) {
    opener.gBrowser.addTab(URL);
  } else {
    window.open(URL, '_blank', 'chrome');
  }
}


// Exports.

return {
  openLink: openLink,
  init: init,
  build: build
};


})();
