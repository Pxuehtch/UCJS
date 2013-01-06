// ==UserScript==
// @name LinkInfo.uc.js
// @description Add the information of links to the pageinfo window.
// @include chrome://browser/content/pageinfo/pageInfo.xul
// ==/UserScript==

// @require LinkInfo.uc.xul
// @note Some functions are exported. (ucjsLinkInfo.XXX)


var ucjsLinkInfo = (function(window, undefined) {


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


//********** Handlers

var mLinkView = null;
var mLinkInfoBuilt = false;

function init() {
  if (!mLinkView) {
    let tree = window.document.getElementById(kID.linkTree);
    let copyColumnIndex =
      tree.columns.getNamedColumn(kID.addressColumn).index;

    // @see chrome://browser/content/pageinfo/pageInfo.js::
    // pageInfoTreeView()
    mLinkView = new window.pageInfoTreeView(kID.linkTree, copyColumnIndex);
    tree.view = mLinkView;
  }

  build();
}

function build() {
  if (!mLinkInfoBuilt) {
    mLinkInfoBuilt = true;

    try {
      // @see chrome://browser/content/pageinfo/pageInfo.js::
      // goThroughFrames()
      window.goThroughFrames(window.gDocument, window.gWindow);
    } catch (e) {
      // @throw (NS_ERROR_FAILURE) [nsIDOMWindow.length]:
      // gWindow.frames.length is undefined after closing the target page
      // which have frames.
      return;
    }

    LI_processFrames();
  }
}

function LI_processFrames() {
  // @see chrome://browser/content/pageinfo/pageInfo.js::
  // gFrameList
  var {gFrameList} = window;

  if (gFrameList.length) {
    let doc = gFrameList[0];
    let iterator = doc.createTreeWalker(
      doc, NodeFilter.SHOW_ELEMENT, grabLink, true);

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
    let note = (imgs && imgs.length) ? kNote.image : '';
    addLink([
      note + getText(aNode),
      aNode.href,
      kType.a,
      aNode.target,
      aNode.accessKey
    ]);
  }
  else if (aNode instanceof HTMLScriptElement && aNode.src) {
    addLink([
      getText(aNode, kType.script),
      aNode.src,
      kType.script
    ]);
  }
  else if (aNode instanceof HTMLLinkElement && aNode.href) {
    let target = aNode.rel || aNode.rev || '';
    addLink([
      getText(aNode, target),
      aNode.href,
      kType.link,
      target
    ]);
  }
  else if ((aNode instanceof HTMLInputElement ||
            aNode instanceof HTMLButtonElement) && aNode.type) {
    let name, address, target;
    let type = aNode.type.toLowerCase();
    if (type === 'submit' || type === 'image') {
      name = '';
      if (type === 'image') {
        name += kNote.image;
      }
      name += getText(aNode, aNode.alt || aNode.value || kType.submit);
      if (aNode.form) {
        address = aNode.form.action;
        target = aNode.form.target;
      }
    }
    if (name) {
      addLink([
        name,
        address || kNote.error,
        kType.submit,
        target || ''
      ]);
    }
  }
  else if (aNode instanceof HTMLAreaElement && aNode.href) {
    addLink([
      getText(aNode),
      aNode.href,
      kType.area,
      aNode.target
    ]);
  }
  else if ((aNode instanceof HTMLQuoteElement ||
            aNode instanceof HTMLModElement) && aNode.cite) {
    addLink([
      getText(aNode),
      aNode.cite,
      kType[aNode.localName]
    ]);
  }
  else if (aNode.hasAttributeNS(XLinkNS, 'href')) {
    let address;
    let href = aNode.getAttributeNS(XLinkNS, 'href');
    let charset = aNode.ownerDocument.characterSet;
    // @see resource:///modules/Services.jsm
    let io = window.Services.io;
    try {
      address = io.newURI(href, charset,
        io.newURI(aNode.baseURI, charset, null)).spec;
    } catch (e) {
      address = kNote.error;
    }
    addLink([
      getText(aNode),
      address,
      kType.XLink
    ]);
  }
  else {
    return NodeFilter.FILTER_SKIP;
  }
  return NodeFilter.FILTER_ACCEPT;
}

// @see chrome://browser/content/pageinfo/pageInfo.js::getValueText()
function getText(aNode, aDefault) {
  let text = window.getValueText(aNode) || aNode.title || aDefault ||
    kNote.error;
  return text.substr(0, 50);
}

function addLink(aValueArray) {
  mLinkView.addRow([mLinkView.rowCount + 1].concat(aValueArray));
}

/**
 * Opens URL of a clicked row
 */
function openLink(aEvent) {
  if (aEvent.originalTarget.localName != 'treechildren') {
    return;
  }

  var tree = aEvent.target;
  if (!('treeBoxObject' in tree)) {
    tree = tree.parentNode;
  }

  var row = {};
  tree.treeBoxObject.getCellAt(aEvent.clientX, aEvent.clientY, row, {}, {});
  if (row.value == -1) {
    return;
  }

  var column = tree.columns.getNamedColumn(kID.addressColumn);
  var URL = tree.treeBoxObject.view.getCellText(row.value, column);

  var opener = window.opener;
  if (opener && 'gBrowser' in opener) {
    opener.gBrowser.addTab(URL);
  } else {
    window.open(URL, '_blank', 'chrome');
  }
}


//********** Exports

return {
  init: init,
  openLink: openLink
};


})(this);
