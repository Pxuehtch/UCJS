// ==UserScript==
// @name LinkInfo.uc.js
// @description Adds the information of links to the Page Info window.
// @include chrome://browser/content/pageinfo/pageInfo.xul
// ==/UserScript==

// @require LinkInfo.uc.xul

// @note Some functions are exported (window.ucjsLinkInfo.XXX).


const ucjsLinkInfo = (function(window, undefined) {


"use strict";


/**
 * UI setting.
 */
const kUI = {
  tree: {
    id: 'ucjs_LinkInfo_tree'
  },

  /**
   * Columns of the tree view.
   *
   * @note Define items in the column's order in |LinkInfo.uc.xul|.
   */
  column: {
    index:  {
      id: 'ucjs_LinkInfo_indexColumn'
    },
    name:  {
      id: 'ucjs_LinkInfo_nameColumn'
    },
    address:  {
      id: 'ucjs_LinkInfo_addressColumn'
    },
    type:  {
      id: 'ucjs_LinkInfo_typeColumn'
    },
    target: {
      id: 'ucjs_LinkInfo_targetColumn'
    },
    accesskey: {
      id: 'ucjs_LinkInfo_accesskeyColumn'
    }
  },

  /**
   * Elements with the attribute about URL.
   */
  type: {
    a: '<A>',
    area: '<AREA>',
    submit: 'Submit', // <INPUT>, <BUTTON>
    script: '<SCRIPT>',
    link: '<LINK>',
    XLink: 'XLink',
    q: '<Q>',
    blockquote: '<BLOCKQUOTE>',
    ins: '<INS>',
    del: '<DEL>'
  },

  /**
   * Note to a column text.
   */
  note: {
    error: '[N/A]',
    image: '[IMG]'
  }
};

/**
 * Link view handler.
 */
const LinkInfoView = (function() {
  const UI = {
    get tree() {
      return window.document.getElementById(kUI.tree.id);
    },

    get addressColumn() {
      return this.tree.columns.getNamedColumn(kUI.column.address.id);
    }
  };

  let mView = null;
  let mIsBuilt = false;

  function init() {
    if (!mView) {
      // @see chrome://browser/content/pageinfo/pageInfo.js::pageInfoTreeView()
      mView = new window.pageInfoTreeView(kUI.tree.id, UI.addressColumn.index);

      UI.tree.view = mView;

      // Clean up when the Page Info window is closed.
      // @see chrome://browser/content/pageinfo/pageInfo.js::onUnloadRegistry
      window.onUnloadRegistry.push(() => {
        mView = null;
        mIsBuilt = null;
      });
    }

    build();
  }

  function build() {
    if (!mIsBuilt) {
      mIsBuilt = true;
  
      try {
        // @see chrome://browser/content/pageinfo/pageInfo.js::goThroughFrames()
        window.goThroughFrames(window.gDocument, window.gWindow);
      }
      catch (ex) {
        // @throw |NS_ERROR_FAILURE| [nsIDOMWindow.length]
        // |gWindow.frames.length| is undefined after closing the target page
        // which has frames.
        return;
      }
  
      LI_processFrames();
    }
  }

  function addItem(aItem) {
    aItem.index = mView.rowCount + 1;

    let row = [];

    // Set data in the column's order of the tree view.
    // @note No test for the falsy value {number} 0 since it isn't given for
    // now.
    for (let key of Object.keys(kUI.column)) {
      if (aItem[key]) {
        row.push(aItem[key]);
      }
      else {
        row.push(kUI.note.error);
      }
    }

    mView.addRow(row);
  }

  /**
   * Opens URL of a row being double-clicked.
   */
  function openLink(aEvent) {
    if (aEvent.button !== 0) {
      return;
    }

    if (aEvent.originalTarget.localName !== 'treechildren') {
      return;
    }

    // @see chrome://browser/content/pageinfo/pageInfo.js::getSelectedRow()
    let row = window.getSelectedRow(UI.tree);

    if (row === -1) {
      return;
    }

    let URL = mView.data[row][UI.addressColumn.index];

    let opener = window.opener;

    if (opener && 'gBrowser' in opener) {
      opener.gBrowser.addTab(URL);
    }
    else {
      window.open(URL, '_blank', 'chrome');
    }
  }

  return {
    init,
    addItem,
    openLink
  };
})();

function LI_processFrames() {
  // @see chrome://browser/content/pageinfo/pageInfo.js::gFrameList
  let {gFrameList} = window;

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
  let {addItem} = LinkInfoView;

  if (aNode instanceof HTMLAnchorElement && aNode.href) {
    let imgs = aNode.getElementsByTagName('img');
    let note = (imgs && imgs.length) ? kUI.note.image : '';

    addItem({
      name: note + getText(aNode),
      address: aNode.href,
      type: kUI.type.a,
      target: aNode.target,
      accesskey: aNode.accessKey
    });
  }
  else if (aNode instanceof HTMLScriptElement && aNode.src) {
    addItem({
      name: getText(aNode, kUI.type.script),
      address: aNode.src,
      type: kUI.type.script
    });
  }
  else if (aNode instanceof HTMLLinkElement && aNode.href) {
    let target = aNode.rel || aNode.rev;

    addItem({
      name: getText(aNode, target),
      address: aNode.href,
      type: kUI.type.link,
      target
    });
  }
  else if ((aNode instanceof HTMLInputElement ||
            aNode instanceof HTMLButtonElement) && aNode.type) {
    let name, address, target;
    let type = aNode.type.toLowerCase();

    if (type === 'submit' || type === 'image') {
      name = '';

      if (type === 'image') {
        name += kUI.note.image;
      }

      name += getText(aNode, aNode.value || kUI.type.submit);

      if (aNode.form) {
        address = aNode.form.action;
        target = aNode.form.target;
      }
    }

    if (address) {
      addItem({
        name,
        address,
        type: kUI.type.submit,
        target
      });
    }
  }
  else if (aNode instanceof HTMLAreaElement && aNode.href) {
    addItem({
      name: getText(aNode),
      address: aNode.href,
      type: kUI.type.area,
      target: aNode.target
    });
  }
  else if ((aNode instanceof HTMLQuoteElement ||
            aNode instanceof HTMLModElement) && aNode.cite) {
    addItem({
      name: getText(aNode),
      address: aNode.cite,
      type: kUI.type[aNode.localName]
    });
  }
  // @see chrome://browser/content/pageinfo/pageInfo.js::XLinkNS
  else if (aNode.hasAttributeNS(window.XLinkNS, 'href')) {
    let address;
    let href = aNode.getAttributeNS(window.XLinkNS, 'href');
    let charset = aNode.ownerDocument.characterSet;

    try {
      // @see chrome://global/content/contentAreaUtils.js::makeURI
      address = window.makeURI(href, charset,
        window.makeURI(aNode.baseURI, charset)).spec;
    }
    catch (ex) {}

    if (address) {
      addItem({
        name: getText(aNode),
        address,
        type: kUI.type.XLink
      });
    }
  }
  else {
    return NodeFilter.FILTER_SKIP;
  }

  return NodeFilter.FILTER_ACCEPT;
}

function getText(aNode, aDefault) {
  const kMaxTextLength = 40;

  // @see chrome://browser/content/pageinfo/pageInfo.js::getValueText()
  let text = window.getValueText(aNode) ||
    aNode.title || aNode.alt || aDefault || '';

  if (text.length > kMaxTextLength) {
    return text.substr(0, kMaxTextLength);
  }

  return text;
}

/**
 * Exports
 */
return {
  init: LinkInfoView.init,
  openLink: LinkInfoView.openLink
};


})(this);
