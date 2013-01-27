// ==UserScript==
// @name        TooltipEx.uc.js
// @description A tooltip of elements which have the descriptions or URL.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @usage Opens a tooltip panel with 'Alt+Ctrl+MouseMove'.


(function(window, undefined) {


"use strict";


/**
 * Max width of tooltip panel
 * @value {integer} [em] number of characters > 0
 */
const kMaxPanelWidth = 40;

/**
 * CSS of tooltip panel
 * @key BASE {CSS} base appearance of the tooltip panel
 * @key TIP_ITEM {CSS} styles for each tip item
 * @key TIP_ACCENT {CSS} accent in a tip item
 *      specifically, '<tag>', 'title-attribute=' and 'URL-attribute=scheme:'
 * @key TIP_CROP {CSS} ellipsis of a cropped long text in a tip item
 *      URL except 'javascript:' and 'data:' is not cropped
 */
const kPanelStyle = {
  BASE: '-moz-appearance:tooltip;',
  TIP_ITEM: 'font:1em/1.2 monospace;',
  TIP_ACCENT: 'color:blue;font-weight:bold;',
  TIP_CROP: 'color:red;font-weight:bold;'
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
 * Attributes that is scanned for a tip item
 * @key titles {string[]}
 * @key URLs {string[]}
 */
const kScanAttribute = {
  titles: ['title', 'alt', 'summary'],
  URLs: ['href', 'src', 'usemap', 'action', 'data', 'cite', 'longdesc',
         'background']
};

/**
 * Identifiers
 */
const kID = {
  PANEL: 'ucjs_tooltipex_panel',
  TIP_TEXT: 'ucjs_tooltipex_tiptext'
};

/**
 * Tooltip handler
 */
var TooltipHandler = {

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
    } else {
      // enable the default tooltip
      this.restoreTitles();

      this._mTarget.ownerDocument.defaultView.
      removeEventListener('unload', this, false);

      delete this._mTarget;
    }
  },

  storeTitles: function(aNode) {
    this._mTitleStore = new Map();

    for (let node = aNode; node; node = node.parentNode) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.title) {
          this._mTitleStore.set(node, node.title);
          node.title = '';
        }
      }
    }
  },

  restoreTitles: function() {
    for (let [node, title] of this._mTitleStore) {
      if (node && !node.title) {
        node.title = title;
      }
      this._mTitleStore.delete(node);
    }

    delete this._mTitleStore;
  },

  init: function() {
    addEvent([gBrowser.mPanelContainer, 'mousemove', this, false]);
    addEvent([this.create(), 'popuphiding', this, false]);
  },

  handleEvent: function(aEvent) {
    switch (aEvent.type) {
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
      case 'popuphiding':
        this.clean();
        break;
      case 'command':
        this.copyTipInfo();
        break;
    }
  },

  create: function() {
    var panel = $E('panel', {
      id: kID.PANEL,
      style: kPanelStyle.BASE + 'white-space:pre;',
      backdrag: true
    });
    panel.style.maxWidth = kMaxPanelWidth + 'em';

    // context menu
    var copymenu = $E('menuitem', {
      label: 'Copy'
    });
    addEvent([copymenu, 'command', this, false]);

    var popup = $E('menupopup', {
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
    var target = aEvent.target;

    if (this.mPanel.state === 'open' &&
        this.mTarget !== target) {
      this.hide();
    } else if (this.mPanel.state !== 'closed') {
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

    this.mPanel.hidePopup();
  },

  build: function(aNode) {
    var tips = [];

    for (let node = aNode; node; node = node.parentNode) {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        break;
      }

      tips = tips.concat(this.getNodeTip(node));
    }

    if (!tips.length) {
      return false;
    }

    this.mTarget = aNode;

    var box = this.mBox;
    tips.forEach(function(tip) {
      box.appendChild(this.buildTipItem(tip));
    }, this);

    return true;
  },

  clean: function() {
    var box = this.mBox;
    while (box.firstChild) {
      box.removeChild(box.firstChild);
    }

    this.mTarget = null;
  },

  getNodeTip: function(aNode) {
    // helper functions
    var make = this.makeTipData;
    var $attr = function(name) {
      return kTipForm.attribute.replace('%name%', name);
    };
    var $tag = function(name) {
      return kTipForm.tag.replace('%tag%', name);
    };

    var data = [];
    var attributes = {};

    Array.forEach(aNode.attributes, function(attribute) {
      attributes[attribute.localName] = attribute.value;
    });

    kScanAttribute.titles.forEach(function(name) {
      let value = attributes[name];
      if (value === null || value === undefined) {
        return;
      }

      data.push(make($attr(name), value));
    });

    kScanAttribute.URLs.forEach(function(name) {
      let value = attributes[name];
      if (value === null || value === undefined) {
        return;
      }

      if (value) {
        let [scheme, rest] = splitURL(value, aNode.baseURI);
        // URL except 'javascript:' and 'data:' is displayed without cropped
        let cropped = /^javascript:|^data:/.test(scheme);
        data.push(make($attr(name) + scheme, rest, !cropped));
      } else {
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
      // add a tag name to the top of array
      data.unshift(make($tag(aNode.localName),
        isLinkNode(aNode) ? aNode.textContent : ''));
    }

    return data;
  },

  makeTipData: function(aHead, aRest, aUncrop) {
    function process(sourceText) {
      // make new lines of the maxLen characters
      var maxLen = kMaxPanelWidth;
      var text = sourceText, cropped = false;
      var lines = [], last = 0;

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
        let visibleLines = 2;
        cropped = !aUncrop && lines.length > visibleLines;
        text = (cropped ? lines.slice(0, visibleLines) : lines).join('\n');
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

    var rawText = (aHead + aRest).trim().replace(/\s+/g, ' ');
    var [cookedText, cropped] = process(rawText);

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
      style: kPanelStyle.TIP_ITEM,
      'tiptext': text
    });

    let accent = $E('label', {
      style: kPanelStyle.TIP_ACCENT + 'margin:0;'
    });
    accent.appendChild($T(head));

    item.appendChild(accent);
    item.appendChild($T(rest));

    if (cropped) {
      let crop = $E('label', {
        style: kPanelStyle.TIP_CROP + 'margin:0;',
        tooltiptext: text
      });
      crop.appendChild($T(kTipForm.ellipsis));

      item.appendChild(crop);
    }

    return item;
  },

  copyTipInfo: function(aEvent) {
    var info = [];

    Array.forEach(this.mBox.childNodes, function(node) {
      info.push(node[kID.TIP_TEXT]);
    });

    copyToClipboard(info.join('\n'));
  }

};


//********** Utilities

function isHtmlDocument(aDocument) {
  var mime = aDocument.contentType;

  return (
    mime === 'text/html' ||
    mime === 'text/xml' ||
    mime === 'application/xml' ||
    mime === 'application/xhtml+xml'
  );
}

function isLinkNode(aNode) {
  return (
    aNode.nodeType === Node.ELEMENT_NODE &&
    (aNode instanceof HTMLAnchorElement ||
     aNode instanceof HTMLAreaElement ||
     aNode instanceof HTMLLinkElement ||
     aNode.getAttributeNS('http://www.w3.org/1999/xlink', 'type') ===
     'simple')
  );
}

function splitURL(aURL, aBaseURL) {
  let URL = unescURLForUI(aURL, aBaseURL);
  let colon = URL.indexOf(':') + 1;

  return [URL.substring(0, colon), URL.substring(colon)];
}

function copyToClipboard(aText) {
  const {Cc, Ci} = window;

  Cc['@mozilla.org/widget/clipboardhelper;1'].
  getService(Ci.nsIClipboardHelper).
  copyString(aText);
}

function $E(aTagOrNode, aAttribute) {
  let node = (typeof aTagOrNode === 'string') ?
    window.document.createElement(aTagOrNode) : aTagOrNode;

  if (!!aAttribute) {
    for (let [name, value] in Iterator(aAttribute)) {
      if (value !== null && value !== undefined) {
        if (name === 'tiptext') {
          node[kID.TIP_TEXT] = value;
        } else {
          node.setAttribute(name, value);
        }
      }
    }
  }

  return node;
}

function $ID(aId) {
  return window.document.getElementById(aId);
}

function $T(aText) {
  return window.document.createTextNode(aText);
}


//********** Imports

function addEvent(aData) {
  window.ucjsUtil.setEventListener(aData);
}

function unescURLForUI(aURL, aBaseURL) {
  return window.ucjsUtil.unescapeURLForUI(
    window.ucjsUtil.resolveURL(aURL, aBaseURL));
}

function log(aMsg) {
  return window.ucjsUtil.logMessage('TooltipEx.uc.js', aMsg);
}


//********** Entry point

function TooltipEx_init() {
  TooltipHandler.init();
}

TooltipEx_init();


})(this);
