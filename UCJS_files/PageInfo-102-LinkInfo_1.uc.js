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

  function addLink(aValueArray) {
    mView.addRow([mView.rowCount + 1].concat(aValueArray));
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
    init: init,
    addLink: addLink,
    openLink: openLink
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
  let {addLink} = LinkInfoView;

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

    Components.utils.import('resource://gre/modules/Services.jsm');
    const io = Services.io;

    try {
      address = io.newURI(href, charset,
        io.newURI(aNode.baseURI, charset, null)).spec;
    }
    catch (ex) {
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
  let text =
    window.getValueText(aNode) ||
    aNode.title ||
    aDefault ||
    kNote.error;

  return text.substr(0, 50);
}

/**
 * Exports
 */
return {
  init: LinkInfoView.init,
  openLink: LinkInfoView.openLink
};


})(this);
