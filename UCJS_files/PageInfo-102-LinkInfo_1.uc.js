// ==UserScript==
// @name LinkInfo.uc.js
// @description Adds the information of links to the Page Info window.
// @include chrome://browser/content/pageinfo/pageInfo.xul
// ==/UserScript==

// @require LinkInfo.uc.xul
// @require Util.uc.js
// @note The page info window has to be opened from the browser window which
// has |window.ucjsUtil|.

// @note Some functions are exported (window.ucjsLinkInfo.XXX).


const ucjsLinkInfo = (function(window) {


"use strict";


/**
 * Imports
 */
const {
  ContentTask,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.opener.ucjsUtil;

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
    index: {
      id: 'ucjs_LinkInfo_indexColumn'
    },
    name: {
      id: 'ucjs_LinkInfo_nameColumn'
    },
    address: {
      id: 'ucjs_LinkInfo_addressColumn'
    },
    type: {
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
    a: '<a>',
    area: '<area>',
    submit: 'submit', // for <input> or <button> of <form>.
    script: '<script>',
    link: '<link>',
    xlink: 'XLink',
    q: '<q>',
    blockquote: '<blockquote>',
    ins: '<ins>',
    del: '<del>'
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
 * Link tree view handler.
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

  let vars = {
    treeView: null,
    isListBuilt: false
  };

  function init() {
    if (vars.treeView) {
      return;
    }

    // @see chrome://browser/content/pageinfo/pageInfo.js::pageInfoTreeView()
    vars.treeView =
      new window.pageInfoTreeView(kUI.tree.id, UI.addressColumn.index);

    UI.tree.view = vars.treeView;

    buildList();

    // Renew the data for the page info window that opens.
    // @see chrome://browser/content/pageinfo/pageInfo.js::onResetRegistry
    // @see chrome://browser/content/browser.js::BrowserPageInfo
    window.onResetRegistry.push(() => {
      vars.treeView.clear();
      vars.isListBuilt = false;
      buildList();
    });

    // Clean up when the page info window is closed.
    // @see chrome://browser/content/pageinfo/pageInfo.js::onUnloadRegistry
    window.onUnloadRegistry.push(() => {
      vars.treeView = null;
      vars.isListBuilt = null;
    });
  }

  function buildList() {
    if (vars.isListBuilt) {
      return;
    }

    vars.isListBuilt = true;

    let mm = window.opener.gBrowser.selectedBrowser.messageManager;

    mm.addMessageListener('ucjs:PageInfo:LinkInfo',
      function onMessage(message) {
        let {linkInfo, isComplete} = message.data;

        // Terminates the message when:
        // - The page info window was closed.
        // - The link info fetching has been completed.
        if (window.closed || isComplete) {
          mm.removeMessageListener('ucjs:PageInfo:LinkInfo', onMessage);

          return;
        }

        addListItem(linkInfo);
      }
    );

    LinkInfoCollector.collect();
  }

  function addListItem(listItem) {
    listItem.index = vars.treeView.rowCount + 1;

    let row = [];

    // Set data in the column's order of the tree view.
    for (let key of Object.keys(kUI.column)) {
      if (key in listItem) {
        row.push(listItem[key]);
      }
      else {
        row.push(kUI.note.error);
      }
    }

    vars.treeView.addRow(row);
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

    let url = vars.treeView.data[row][UI.addressColumn.index];

    let opener = window.opener;

    if (opener && 'gBrowser' in opener) {
      opener.gBrowser.addTab(url);
    }
    else {
      window.open(url, '_blank', 'chrome');
    }
  }

  return {
    init,
    openLink
  };
})();


/**
 * Link info collector.
 *
 * @see chrome://browser/content/content.js::PageInfoListener
 */
const LinkInfoCollector = (function() {
  function collect() {
    ContentTask.spawn({
      params: {
        strings: {
          type: kUI.type,
          note: kUI.note
        }
      },
      task: `function*(params) {
        ${goThroughFrames.toString()}
        ${processFrames.toString()}
        ${getLinkInfo.toString()}
        ${resolveURL.toString()}
        ${getText.toString()}
        ${getValueText.toString()}
        ${getAltText.toString()}

        let {strings} = params;

        let frameList = goThroughFrames();

        // Periodically repeats the link info fetching to avoid blocking the
        // content process.
        Task.spawn(() => processFrames(frameList, strings));
      }`
    }).
    catch(Cu.reportError);
  }

  function goThroughFrames(view = content.window) {
    if (!view) {
      return null;
    }

    let frameList = [view];

    // Recurse through the sub frames.
    if (view.frames && view.frames.length) {
      for (let i = 0, l = view.frames.length; i < l; i++) {
        let subFrameList = goThroughFrames(view.frames[i]);

        if (subFrameList) {
          frameList.concat(subFrameList);
        }
      }
    }

    return frameList;
  }

  /**
   * Generator for periodically fetching of link info through all frames.
   */
  function* processFrames(frameList, strings) {
    const kNodeNumsInOneGo = 500;
    let nodeCount = 0;

    for (let view of frameList) {
      let d = view.document;
      let iterator = d.createTreeWalker(d, content.NodeFilter.SHOW_ELEMENT);

      while (iterator.nextNode()) {
        let linkInfo = getLinkInfo(iterator.currentNode, strings);

        if (linkInfo) {
          sendAsyncMessage('ucjs:PageInfo:LinkInfo', {
            linkInfo
          });
        }

        if (++nodeCount % kNodeNumsInOneGo === 0) {
          // Breath regularly so we don't keep blocking the content process.
          yield new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    }

    // Send that link info fetching has finished.
    sendAsyncMessage('ucjs:PageInfo:LinkInfo', {
      isComplete: true
    });
  }

  function getLinkInfo(node, strings) {
    const XLinkNS = 'http://www.w3.org/1999/xlink';

    let linkInfo;

    let setInfo = (info) => {
      for (let key in info) {
        // Sanitize a falsy value except {number} 0.
        if (info[key] === 0) {
          info[key] = '0';
        }
        else if (key in info && !info[key]) {
          delete info[key];
        }
      }

      linkInfo = info;
    };

    if (node.localName === 'script' && node.src) {
      setInfo({
        name: getText(node, strings.type.script),
        address: node.src,
        type: strings.type.script
      });
    }
    else if (node.localName === 'link' && node.href) {
      let target = node.rel || node.rev;

      setInfo({
        name: getText(node, target),
        address: node.href,
        type: strings.type.link,
        target
      });
    }
    else if ((node.localName === 'input' || node.localName === 'button') &&
             node.type) {
      let name, address, target;
      let type = node.type.toLowerCase();

      if (type === 'submit' || type === 'image') {
        name = '';

        if (type === 'image') {
          name += strings.note.image;
        }

        name += getText(node, node.value || node.alt || strings.type.submit);

        if (node.form) {
          address = node.form.action;
          target = node.form.target;
        }
      }

      if (address) {
        setInfo({
          name,
          address,
          type: strings.type.submit,
          target
        });
      }
    }
    else if (node.localName === 'area' && node.href) {
      setInfo({
        name: getText(node),
        address: node.href,
        type: strings.type.area,
        target: node.target
      });
    }
    else if ((node.localName === 'q' || node.localName === 'blockquote' ||
              node.localName === 'ins' || node.localName === 'del') &&
              node.cite) {
      setInfo({
        name: getText(node),
        address: node.cite,
        type: strings.type[node.localName]
      });
    }
    else if (node.hasAttributeNS(XLinkNS, 'href')) {
      let href = node.getAttributeNS(XLinkNS, 'href');
      let address = resolveURL(href, node.baseURI);

      if (address) {
        // TODO: get |target| and |accesskey|.
        setInfo({
          name: getText(node),
          address,
          type: strings.type.xlink
        });
      }
    }
    else if (node.localName === 'a' && node.href) {
      let imgs = node.getElementsByTagName('img');
      let note = (imgs && imgs.length) ? strings.note.image : '';

      setInfo({
        name: note + getText(node),
        address: node.href,
        type: strings.type.a,
        target: node.target,
        accesskey: node.accessKey
      });
    }

    return linkInfo;
  }

  function resolveURL(url, baseURL) {
    if (!url || !/\S/.test(url)) {
      return null;
    }

    const {BrowserUtils} = Modules.require('gre/modules/BrowserUtils.jsm');
    const {makeURI} = BrowserUtils;

    try {
      return makeURI(url, null, makeURI(baseURL)).spec;
    }
    catch (ex) {}

    return null;
  }

  function getText(node, defaultValue) {
    const kMaxTextLength = 40;

    let trim = (str) => str.trim().replace(/\s+/g, ' ');

    let text = trim(getValueText(node)) || defaultValue || '';

    if (text.length > kMaxTextLength) {
      return text.substr(0, kMaxTextLength);
    }

    return text;
  }

  function getValueText(node) {
    if (node.title) {
      return node.title;
    }

    let valueTexts = [];

    for (let i = 0, l = node.childNodes.length; i < l; i++) {
      let childNode = node.childNodes[i];
      let nodeType = childNode.nodeType;

      if (nodeType === content.Node.TEXT_NODE) {
        valueTexts.push(childNode.nodeValue);
      }
      else if (nodeType === content.Node.ELEMENT_NODE) {
        // Capture the alt text of image element.
        if (childNode.localName === 'img' || childNode.localName === 'area') {
          valueTexts.push(getAltText(childNode));
        }
        else {
          valueTexts.push(getValueText(childNode));
        }
      }
    }

    return (valueTexts.length) ? valueTexts.join(' ') : '';
  }

  function getAltText(node) {
    if (node.alt) {
      return node.alt;
    }

    let altText;

    for (let i = 0, l = node.childNodes.length; i < l; i++) {
      altText = getAltText(node.childNodes[i]);

      if (altText) {
        return altText;
      }
    }

    return '';
  }

  return {
    collect
  };
})();

/**
 * Exports
 */
return {
  init: LinkInfoView.init,
  openLink: LinkInfoView.openLink
};


})(this);
