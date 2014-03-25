// ==UserScript==
// @name        TooltipEx.uc.js
// @description A tooltip of an element with the informations
// @include     main
// ==/UserScript==

// @require Util.uc.js

// @usage opens a tooltip panel with 'Alt + Ctrl + MouseMove' on an element
// with the attribute for description or URL or event including the ancestor
// elements


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getNodeById: $ID,
  addEvent,
} = window.ucjsUtil;

function $E(aTagOrNode, aAttribute) {
  return window.ucjsUtil.createNode(aTagOrNode, aAttribute, handleAttribute);
}

function unescURLForUI(aURL, aBaseURL) {
  const util = window.ucjsUtil;

  return util.unescapeURLForUI(util.resolveURL(aURL, aBaseURL));
}

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('TooltipEx.uc.js', aMsg);
}

/**
 * Max width of tooltip panel
 *
 * @value {integer} [em > 0]
 *   number of characters
 */
const kMaxPanelWidth = 40;

/**
 * CSS of tooltip panel
 *
 * @key base {CSS}
 *   base appearance of the tooltip panel
 * @key tipItem {CSS}
 *   styles for each tip item
 * @key tipAccent {CSS}
 *   accent in a tip item
 *   @note applied to '<tag>', 'description-attribute=' and
 *   'URL-attribute=scheme:'
 * @key tipCrop {CSS}
 *   ellipsis of a cropped long text in a tip item
 *   @note a URL except 'javascript:' and 'data:' is not cropped
 */
const kPanelStyle = {
  base: '-moz-appearance:tooltip;',
  tipItem: 'font:1em/1.2 monospace;',
  tipAccent: 'color:blue;font-weight:bold;',
  tipCrop: 'color:red;font-weight:bold;'
};

/**
 * Format of a tip item
 */
const kTipForm = {
  attribute: '%name%=',
  tag: '<%tag%>',
  ellipsis: '...'
};

/**
 * Scanned attributes for a tip item
 *
 * @key descriptions {string[]}
 * @key URLs {string[]}
 */
const kScanAttribute = {
  descriptions: ['title', 'alt', 'summary'],
  URLs: ['href', 'src', 'usemap', 'action', 'data', 'cite', 'longdesc',
         'background']
};

/**
 * Identifiers
 */
const kID = {
  panel: 'ucjs_tooltipex_panel',
  tipText: 'ucjs_tooltipex_tiptext'
};

/**
 * Target node handler
 *
 * TODO: ensure to uninitialize the handler
 * WORKAROUND: makes many opportunity of uninitializing; when switching the
 * current page for now
 * @see |TooltipPanel::init()|
 *
 * XXX: I don't want to store a reference to the DOM element
 */
const TargetNode = (function() {
  let mTargetNode;
  let mTitleStore;

  function init(aNode) {
    mTargetNode = aNode;
    mTitleStore = new Map();

    // disable the default tooltip
    storeTitles();
  }

  function uninit() {
    // enable the default tooltip
    // WORKAROUND: don't access to objects being unloaded unexpectedly
    if (checkAlive(mTargetNode)) {
      restoreTitles();
    }

    mTargetNode = null;
    mTitleStore = null;
  }

  function equals(aNode) {
    return aNode === mTargetNode;
  }

  function storeTitles() {
    // @note the initial node may be a text node
    let node = mTargetNode;

    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.title) {
          mTitleStore.set(node, node.title);

          node.title = '';
        }
      }

      node = node.parentNode;
    }
  }

  function restoreTitles() {
    for (let [node, title] of mTitleStore) {
      node.title = title;
    }

    mTitleStore.clear();
  }

  /**
   * Checks whether a node is alive or not
   *
   * @param aNode {Node}
   * @return {boolean}
   *
   * TODO: this is a workaround for checking a dead object. consider a
   * legitimate method instead
   */
  function checkAlive(aNode) {
    try {
      return !!(aNode && aNode.parentNode);
    }
    catch (ex) {}

    return false;
  }

  return {
    init: init,
    uninit: uninit,
    equals: equals
  };
})();

/**
 * Tooltip panel handler
 */
const TooltipPanel = {
  // tooltip <panel>
  mPanel: null,

  // container <box> for tip items data
  mBox: null,

  init: function() {
    // hide the tooltip when the current page is switched
    addEvent(gBrowser, 'select', this, false);
    addEvent(gBrowser, 'pagehide', this, false);

    // observe the mouse moving to show the tooltip
    addEvent(gBrowser.mPanelContainer, 'mousemove', this, false);

    // create the tooltip base and observe its closing
    addEvent(this.create(), 'popuphiding', this, false);
  },

  handleEvent: function(aEvent) {
    switch (aEvent.type) {
      // display the tooltip
      case 'mousemove':
        if (aEvent.altKey && aEvent.ctrlKey) {
          if (isHtmlDocument(aEvent.target.ownerDocument)) {
            this.show(aEvent);
          }
        }
        break;

      // cleanup when the current page is switched
      case 'select':
      case 'pagehide':
        this.hide();
        break;

      // cleanup when a tooltip closes
      case 'popuphiding':
        this.clear();
        break;

      // command of the context menu of a tooltip
      case 'command':
        this.copyTipInfo();
        break;
    }
  },

  create: function() {
    let panel = $E('panel', {
      id: kID.panel,
      style: kPanelStyle.base + 'white-space:pre;',
      backdrag: true
    });

    panel.style.maxWidth = kMaxPanelWidth + 'em';

    // context menu
    let copymenu = $E('menuitem', {
      label: 'Copy'
    });

    addEvent(copymenu, 'command', this, false);

    let popup = $E('menupopup', {
      onpopuphiding: 'event.stopPropagation();'
    });

    popup.appendChild(copymenu);

    panel.contextMenu = '_child';
    panel.appendChild(popup);

    this.mBox = panel.appendChild($E('vbox'));
    this.mPanel = $ID('mainPopupSet').appendChild(panel);

    return panel;
  },

  show: function(aEvent) {
    let target = aEvent.target;

    if (this.mPanel.state === 'open') {
      // don't open the tooltip of the same target
      if (TargetNode.equals(target)) {
        return;
      }

      // close a existing tooltip of the different target and open a new one
      this.hide();
    }
    else if (this.mPanel.state !== 'closed') {
      return;
    }

    if (this.build(target)) {
      this.mPanel.
        openPopupAtScreen(aEvent.screenX, aEvent.screenY, false);
    }
  },

  hide: function() {
    if (this.mPanel.state !== 'open') {
      return;
    }

    // |popuphiding| will be dispatched
    this.mPanel.hidePopup();
  },

  build: function(aNode) {
    let tips = [];

    // @note the initial node may be a text node
    let node = aNode;

    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        tips = tips.concat(this.getNodeTip(node));
      }

      node = node.parentNode;
    }

    if (!tips.length) {
      return false;
    }

    // @note use the initial |aNode|
    TargetNode.init(aNode);

    let box = this.mBox;

    tips.forEach((tip) => {
      box.appendChild(this.buildTipItem(tip));
    });

    return true;
  },

  clear: function() {
    let box = this.mBox;

    while (box.firstChild) {
      box.removeChild(box.firstChild);
    }

    TargetNode.uninit();
  },

  getNodeTip: function(aNode) {
    // helper functions
    let make = this.makeTipData;
    let $attr = (name) => kTipForm.attribute.replace('%name%', name);
    let $tag = (name) => kTipForm.tag.replace('%tag%', name);

    let data = [];
    let attributes = {};

    Array.forEach(aNode.attributes, (attribute) => {
      attributes[attribute.localName] = attribute.value;
    });

    kScanAttribute.descriptions.forEach((name) => {
      let value = attributes[name];

      if (value === null || value === undefined) {
        return;
      }

      data.push(make($attr(name), value));
    });

    kScanAttribute.URLs.forEach((name) => {
      let value = attributes[name];

      if (value === null || value === undefined) {
        return;
      }

      if (value) {
        let [scheme, rest] = splitURL(value, aNode.baseURI);

        // URL except 'javascript:' and 'data:' is displayed without cropped
        let cropped = /^javascript:|^data:/.test(scheme);

        data.push(make($attr(name) + scheme, rest, !cropped));
      }
      else {
        data.push(make($attr(name), ''));
      }
    });

    for (let name in attributes) {
      // <event> attribute
      if (/^on/.test(name)) {
        data.push(make($attr(name), attributes[name]));
      }
    }

    if (data.length || isLinkNode(aNode)) {
      let rest = isLinkNode(aNode) ? aNode.textContent : '';

      // add a tag name to the top of array
      data.unshift(make($tag(aNode.localName), rest));
    }

    return data;
  },

  makeTipData: function(aHead, aRest, aUncrop) {
    function process(sourceText) {
      // make new lines of the maxLen characters
      let maxLen = kMaxPanelWidth;
      let text = sourceText, cropped = false;
      let lines = [], last = 0;

      for (let i = 0, l = text.length, count = 0; i < l; i++) {
        // count character width
        count += /[ -~]/.test(text[i]) ? 1 : 2;

        if (count > maxLen) {
          lines.push(text.substring(last, i).trim());
          last = i;
          count = 0;
        }
      }

      if (lines.length) {
        lines.push(text.substring(last).trim());

        // number of lines in the visible portion of the cropped text
        const kVisibleLines = 2;

        cropped = !aUncrop && lines.length > kVisibleLines;
        text = (cropped ? lines.slice(0, kVisibleLines) : lines).join('\n');
      }

      return [text, cropped];
    }

    if (!aRest) {
      return {
        text: aHead,
        head: aHead,
        rest: '',
        cropped: false
      };
    }

    let rawText = (aHead + aRest).trim().replace(/\s+/g, ' ');
    let [cookedText, cropped] = process(rawText);

    return {
      text: rawText,
      head: aHead,
      rest: cookedText.substr(aHead.length),
      cropped: cropped
    };
  },

  buildTipItem: function(aTipData) {
    // the data equals the return value of |makeTipData|
    let {text, head, rest, cropped} = aTipData;

    // helper functions
    // TODO: use some element instead of <label>
    let $span = (attribute) => $E('label', attribute);
    let $text = (text) => window.document.createTextNode(text);

    let item = $span({
      style: kPanelStyle.tipItem,
      'tiptext': text
    });

    let accent = $span({
      style: kPanelStyle.tipAccent + 'margin:0;'
    });

    accent.appendChild($text(head));

    item.appendChild(accent);
    item.appendChild($text(rest));

    if (cropped) {
      let crop = $span({
        style: kPanelStyle.tipCrop + 'margin:0;',
        tooltiptext: text
      });

      crop.appendChild($text(kTipForm.ellipsis));

      item.appendChild(crop);
    }

    return item;
  },

  copyTipInfo: function() {
    let info = [];

    Array.forEach(this.mBox.childNodes, (node) => {
      info.push(node[kID.tipText]);
    });

    copyToClipboard(info.join('\n'));
  }
};

function isHtmlDocument(aDocument) {
  let mime = aDocument.contentType;

  return (
    mime === 'text/html' ||
    mime === 'text/xml' ||
    mime === 'application/xml' ||
    mime === 'application/xhtml+xml'
  );
}

function isLinkNode(aNode) {
  return (
    aNode instanceof HTMLAnchorElement ||
    aNode instanceof HTMLAreaElement ||
    aNode instanceof HTMLLinkElement ||
    aNode.getAttributeNS('http://www.w3.org/1999/xlink', 'type') === 'simple'
  );
}

function splitURL(aURL, aBaseURL) {
  let URL = unescURLForUI(aURL, aBaseURL);
  let colon = URL.indexOf(':') + 1;

  return [URL.substring(0, colon), URL.substring(colon)];
}

function copyToClipboard(aText) {
  Cc['@mozilla.org/widget/clipboardhelper;1'].
    getService(Ci.nsIClipboardHelper).
    copyString(aText);
}

function handleAttribute(aNode, aName, aValue) {
  if (aName === 'tiptext') {
    aNode[kID.tipText] = aValue;
    return true;
  }
  return false;
}

/**
 * Entry point
 */
function TooltipEx_init() {
  TooltipPanel.init();
}

TooltipEx_init();


})(this);
