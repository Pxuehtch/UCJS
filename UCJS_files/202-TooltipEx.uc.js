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
 * Tooltip handler
 */
const TooltipPanel = {
  /**
   * Tooltip <panel>
   */
  mPanel: null,

  /**
   * Container <box> for tip items data
   */
  mBox: null,

  /**
   * Target node which has tips
   */
  get mTarget() {
    return this._mTarget;
  },

  set mTarget(aNode) {
    if (aNode !== null) {
      // disable the default tooltip
      this.storeTitles(aNode);

      this._mTarget = aNode;

      // cleanup when the document with a opened tooltip is unloaded
      this._mTarget.ownerDocument.defaultView.
      addEventListener('unload', this, false);
    }
    else {
      // enable the default tooltip
      this.restoreTitles();

      this._mTarget.ownerDocument.defaultView.
      removeEventListener('unload', this, false);

      this._mTarget = null;
    }
  },

  storeTitles: function(aNode) {
    this._mTitleStore = new Map();

    // @note the initial node may be a text node
    let node = aNode;

    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.title) {
          this._mTitleStore.set(node, node.title);

          node.title = '';
        }
      }

      node = node.parentNode;
    }
  },

  restoreTitles: function() {
    for (let [node, title] of this._mTitleStore) {
      if (node && !node.title) {
        node.title = title;
      }
    }

    this._mTitleStore.clear();

    this._mTitleStore = null;
  },

  init: function() {
    addEvent(gBrowser.mPanelContainer, 'mousemove', this, false);
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

      // cleanup when the document with a opened tooltip is unloaded
      case 'unload':
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
      if (this.mTarget === target) {
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

    this.mTarget = aNode;

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

    this.mTarget = null;
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

    let item = $E('label', {
      style: kPanelStyle.tipItem,
      'tiptext': text
    });

    let accent = $E('label', {
      style: kPanelStyle.tipAccent + 'margin:0;'
    });

    accent.appendChild($T(head));

    item.appendChild(accent);
    item.appendChild($T(rest));

    if (cropped) {
      let crop = $E('label', {
        style: kPanelStyle.tipCrop + 'margin:0;',
        tooltiptext: text
      });

      crop.appendChild($T(kTipForm.ellipsis));

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

function $T(aText) {
  return window.document.createTextNode(aText);
}

/**
 * Entry point
 */
function TooltipEx_init() {
  TooltipPanel.init();
}

TooltipEx_init();


})(this);
