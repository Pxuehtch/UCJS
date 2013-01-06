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
 * @value {integer} number of 1byte characters > 0
 */
const kMaxPanelWidth = 40;

/**
 * Ellipsis of a cropped text
 * @value {string}
 */
const kEllipsis = '...';

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
  TIP_DATA: 'ucjs_tooltipex_tipdata',
  TITLE_BACKUP: 'ucjs_tooltipex_titlebackup'
};

/**
 * Tooltip handler
 */
var gTooltip = {

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
      this._mTarget = aNode;

      // disable the default tooltip
      storeTitles();
    } else {
      // enable the default tooltip
      restoreTitles();

      delete this._mTarget;
    }

    function storeTitles() {
      swap('title', kID.TITLE_BACKUP);
    }

    function restoreTitles() {
      swap(kID.TITLE_BACKUP, 'title');
    }

    function swap(aSrc, aDst) {
      for (let node = gTooltip.mTarget; node; node = node.parentNode) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          break;
        }

        if (node.hasAttribute(aSrc)) {
          node.setAttribute(aDst, node.getAttribute(aSrc));
          node.removeAttribute(aSrc);
        }
      }
    }
  },

  init: function() {
    addEvent([gBrowser.mPanelContainer, 'mousemove', gTooltip, false]);
    addEvent([gTooltip.create(), 'popuphiding', gTooltip, false]);
  },

  handleEvent: function(aEvent) {
    switch (aEvent.type) {
      case 'mousemove':
        if (aEvent.altKey && aEvent.ctrlKey) {
          if (isHtmlDocument(aEvent.target.ownerDocument)) {
            gTooltip.show(aEvent);
          }
        }
        break;
      case 'popuphiding':
        gTooltip.clean();
        break;
    }
  },

  create: function() {
    var panel = $E('panel');
    panel.id = kID.PANEL;
    panel.setAttribute('style', kPanelStyle.BASE + 'white-space:pre;');
    panel.style.maxWidth = kMaxPanelWidth + 'em';
    panel.setAttribute('backdrag', true);

    // context menu
    var copymenu = $E('menuitem');
    copymenu.setAttribute('label', 'Copy');
    addEvent([copymenu, 'command', gTooltip.copyTipInfo, false]);

    var popup = $E('menupopup');
    popup.setAttribute('onpopuphiding', 'event.stopPropagation();');
    popup.appendChild(copymenu);

    panel.contextMenu = '_child';
    panel.appendChild(popup);

    gTooltip.mBox = panel.appendChild($E('vbox'));
    gTooltip.mPanel = $ID('mainPopupSet').appendChild(panel);

    return panel;
  },

  show: function(aEvent) {
    var target = aEvent.target;

    if (gTooltip.mPanel.state === 'open' &&
        gTooltip.mTarget !== target) {
      gTooltip.hide();
    } else if (gTooltip.mPanel.state !== 'closed') {
      return;
    }

    if (gTooltip.build(target)) {
      gTooltip.mPanel.
      openPopupAtScreen(aEvent.screenX, aEvent.screenY, false);
    }
  },

  hide: function() {
    if (gTooltip.mPanel.state !== 'open') {
      return;
    }

    gTooltip.mPanel.hidePopup();
  },

  build: function(aNode) {
    var tips = [];

    for (let node = aNode; node; node = node.parentNode) {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        break;
      }

      tips = tips.concat(gTooltip.getNodeTip(node));
    }

    if (!tips.length) {
      return false;
    }

    gTooltip.mTarget = aNode;

    var box = gTooltip.mBox;
    tips.forEach(function(tip) {
      box.appendChild(gTooltip.buildTipItem(tip));
    });

    return true;
  },

  clean: function() {
    var box = gTooltip.mBox;
    while (box.firstChild) {
      box.removeChild(box.firstChild);
    }

    gTooltip.mTarget = null;
  },

  getNodeTip: function(aNode) {
    var make = gTooltip.makeTipData;
    var data = [];
    var attrs = {};

    Array.forEach(aNode.attributes, function(attr) {
      attrs[attr.localName] = attr.value;
    });

    kScanAttribute.titles.forEach(function(name) {
      let value = attrs[name];
      if (value === null || value === undefined) {
        return;
      }

      data.push(make(name + '=', attrs[name]));
    });

    kScanAttribute.URLs.forEach(function(name) {
      let value = attrs[name];
      if (value === null || value === undefined) {
        return;
      }

      if (value) {
        let [scheme, rest] = splitURL(value, aNode.baseURI);
        // URL except 'javascript:' and 'data:' is displayed without cropped
        data.push(make(name + '=' + scheme, rest,
          !/^javascript:|^data:/.test(scheme)));
      } else {
        data.push(make(name + '=', ''));
      }
    });

    for (let name in attrs) {
      // <event> attribute
      if (/^on/.test(name)) {
        data.push(make(name + '=', attrs[name]));
      }
    }

    if (data.length || isLinkNode(aNode)) {
      // Add a tag name to the top of array
      data.unshift(make('<' + aNode.localName + '>',
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
        // count bytes
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
      return [aHead, aHead, '', false];
    }

    var raw = (aHead + aRest).trim().replace(/\s+/g, ' ');
    var [text, cropped] = process(raw);

    return [raw, aHead, text.substr(aHead.length), cropped];
  },

  buildTipItem: function(aTipData) {
    // the data equals the return value of |makeTipData|
    var [raw, head, rest, cropped] = aTipData;

    var item = $E('label');
    item.setAttribute('style', kPanelStyle.TIP_ITEM);
    item.setAttribute(kID.TIP_DATA, raw);

    var accent = $E('label');
    accent.setAttribute('style', kPanelStyle.TIP_ACCENT + 'margin:0;');
    accent.appendChild($T(head));

    item.appendChild(accent);
    item.appendChild($T(rest));

    if (cropped) {
      let crop = $E('label');
      crop.setAttribute('style', kPanelStyle.TIP_CROP + 'margin:0;');
      crop.setAttribute('tooltiptext', raw);
      crop.appendChild($T(kEllipsis));

      item.appendChild(crop);
    }

    return item;
  },

  copyTipInfo: function(aEvent) {
    var info = [];

    Array.forEach(gTooltip.mBox.childNodes, function(node) {
      info.push(node.getAttribute(kID.TIP_DATA));
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

function $ID(aId) {
  return window.document.getElementById(aId);
}

function $E(aTag) {
  return window.document.createElement(aTag);
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
  gTooltip.init();
}

TooltipEx_init();


})(this);
