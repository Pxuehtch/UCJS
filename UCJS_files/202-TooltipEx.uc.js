// ==UserScript==
// @name TooltipEx.uc.js
// @description A tooltip of an element with the informations.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @usage Opens a tooltip panel with 'Alt + Ctrl + MouseMove' on an element
// with the attribute for description or URL or event-handler including the
// ancestor elements.


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getNodeById: $ID,
  addEvent,
  unescapeURLForUI,
  resolveURL
} = window.ucjsUtil;

function $E(aTagOrNode, aAttribute) {
  return window.ucjsUtil.createNode(aTagOrNode, aAttribute, handleAttribute);
}

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('TooltipEx.uc.js', aMsg);
}

/**
 * Preference
 */
const kPref = {
  /**
   * Max numbers of characters in a line.
   *
   * @value {integer} [>0]
   *
   * @note 'max-width' of a text container is set by 'em'.
   */
  maxLineLength: 40,

  /**
   * Number of lines in the visible portion of a long text being cropped.
   *
   * @value {integer} [>0]
   */
  visibleLinesWhenCropped: 2
};

/**
 * Style setting
 *
 * @key item {CSS}
 *   Styles for tip items.
 * @key accent {CSS}
 *   Styles for accent portions.
 *   @note Applied to;
 *     '<tag>'
 *     'description-attribute='
 *     'URL-attribute=scheme:'
 * @key crop {CSS}
 *   Styles for ellipsis mark of a cropped text.
 *   @note Only a long URL with 'javascript:' or 'data:' scheme will be
 *   cropped.
 */
const kStyle = {
  item: 'font:1em/1.2 monospace;letter-spacing:.1em;',
  accent: 'color:blue;',
  crop: 'color:red;font-weight:bold;'
};

/**
 * Format in tip items
 */
const kTipFormat = {
  tag: '<%tag%>',
  attribute: '%name%=',
  ellipsis: '...'
};

/**
 * Attribute names for the informations of an element
 *
 * @key descriptions {string[]}
 * @key URLs {string[]}
 */
const kInfoAttribute = {
  descriptions: [
    'title', 'alt', 'summary'
  ],
  URLs: [
    'href', 'src', 'usemap', 'action', 'data',
    'cite', 'longdesc', 'background'
  ]
};

/**
 * Identifiers
 */
const kID = {
  panel: 'ucjs_TooltipEx_panel',
  tipText: 'ucjs_TooltipEx_tipText',
  subTooltip: 'ucjs_TooltipEx_subTooltip'
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
   * TODO: this is a workaround for checking a dead object. consider a reliable
   * method instead
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
const TooltipPanel = (function() {
  // tooltip <panel>
  let mPanel;

  // container <box> for tip items data
  let mBox;

  function init() {
    // create the tooltip base and observe its closing
    addEvent(create(), 'popuphiding', handleEvent, false);

    // observe the mouse moving to show the tooltip
    addEvent(gBrowser.mPanelContainer, 'mousemove', handleEvent, false);

    // hide the tooltip when the current page is switched
    addEvent(gBrowser, 'select', handleEvent, false);
    addEvent(gBrowser, 'pagehide', handleEvent, false);
  }

  function handleEvent(aEvent) {
    switch (aEvent.type) {
      // display the tooltip
      case 'mousemove':
        if (aEvent.altKey && aEvent.ctrlKey) {
          if (isHtmlDocument(aEvent.target.ownerDocument)) {
            show(aEvent);
          }
        }
        break;

      // cleanup when the current page is switched
      case 'select':
      case 'pagehide':
        hide();
        break;

      // cleanup when a tooltip closes
      case 'popuphiding':
        clear();
        break;

      // command of the context menu of a tooltip
      case 'command':
        copyTipInfo();
        break;
    }
  }

  function create() {
    // @note set 'white-space:pre;' that suppresses text wrapping for our own
    // control of it
    let panel = $E('panel', {
      id: kID.panel,
      style: '-moz-appearance:tooltip;white-space:pre;',
      backdrag: true
    });

    panel.style.maxWidth = kPref.maxLineLength + 'em';

    // context menu
    let copymenu = $E('menuitem', {
      label: 'Copy'
    });

    addEvent(copymenu, 'command', handleEvent, false);

    let popup = $E('menupopup', {
      onpopuphiding: 'event.stopPropagation();'
    });

    popup.appendChild(copymenu);

    panel.contextMenu = '_child';
    panel.appendChild(popup);

    mBox = panel.appendChild($E('vbox'));
    mPanel = $ID('mainPopupSet').appendChild(panel);

    return panel;
  }

  function show(aEvent) {
    let target = aEvent.target;

    if (mPanel.state === 'open') {
      // leave the tooltip of the same target
      if (TargetNode.equals(target)) {
        return;
      }

      // close an existing tooltip of the different target and open a new one
      hide();
    }
    else if (mPanel.state !== 'closed') {
      return;
    }

    if (build(target)) {
      mPanel.openPopupAtScreen(aEvent.screenX, aEvent.screenY, false);
    }
  }

  function hide() {
    if (mPanel.state !== 'open') {
      return;
    }

    // |popuphiding| will be dispatched
    mPanel.hidePopup();
  }

  function build(aNode) {
    let tips = [];

    // @note the initial node may be a text node
    let node = aNode;

    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        tips = tips.concat(collectTipData(node));
      }

      node = node.parentNode;
    }

    if (!tips.length) {
      return false;
    }

    // @note use the initial |aNode|
    TargetNode.init(aNode);

    tips.forEach((tip) => {
      mBox.appendChild(createTipItem(tip));
    });

    return true;
  }

  function clear() {
    while (mBox.firstChild) {
      mBox.removeChild(mBox.firstChild);
    }

    TargetNode.uninit();
  }

  function collectTipData(aNode) {
    // Helper functions.
    let $tag = (name) => kTipFormat.tag.replace('%tag%', name);
    let $attr = (name) => kTipFormat.attribute.replace('%name%', name);

    let data = [];
    let attributes = {};

    Array.forEach(aNode.attributes, (attribute) => {
      attributes[attribute.localName] = attribute.value;
    });

    kInfoAttribute.descriptions.forEach((name) => {
      let value = attributes[name];

      if (value === null || value === undefined) {
        return;
      }

      data.push(makeTipData($attr(name), value, true));
    });

    kInfoAttribute.URLs.forEach((name) => {
      let value = attributes[name];

      if (value === null || value === undefined) {
        return;
      }

      if (value) {
        let URL = unescapeURLForUI(resolveURL(value, aNode.baseURI));
        let [scheme, rest] = splitURL(URL);

        // Only a long URL with 'javascript:' or 'data:' scheme will be
        // cropped.
        let doCrop = /^(?:javascript|data):/.test(scheme);

        data.push(makeTipData($attr(name) + scheme, rest, doCrop));
      }
      else {
        data.push(makeTipData($attr(name), '', true));
      }
    });

    for (let name in attributes) {
      // <event> attributes.
      if (/^on/.test(name)) {
        data.push(makeTipData($attr(name), attributes[name], true));
      }
    }

    if (data.length || isLinkNode(aNode)) {
      let rest = isLinkNode(aNode) ? aNode.textContent : '';

      // Add a tag name to the top of array.
      data.unshift(makeTipData($tag(aNode.localName), rest, true));
    }

    return data;
  }

  /**
   * Make a formatted data for creating an element of tip info
   *
   * @param aHead {string}
   * @param aRest {string}
   * @param aDoCrop {boolean}
   * @return {hash}
   *   @note the value is passed to |createTipItem|
   */
  function makeTipData(aHead, aRest, aDoCrop) {
    if (!aRest) {
      return {
        text: aHead,
        head: aHead
      };
    }

    let text = (aHead + aRest).trim().replace(/\s+/g, ' ');

    let {wrappedText, croppedText} = wrapLines(text, aDoCrop);

    return {
      text: text,
      head: aHead,
      rest: (croppedText || wrappedText).substr(aHead.length),
      uncroppedText: croppedText && wrappedText
    };
  }

  function wrapLines(aText, aDoCrop) {
    const {maxLineLength, visibleLinesWhenCropped} = kPref;

    let lines = [];
    let count = 0, last = 0;

    for (let i = 0, l = aText.length; i < l; i++) {
      // count characters based on width
      // WORKAROUND: regards only printable ASCII character as one letter
      count += /[ -~]/.test(aText[i]) ? 1 : 2;

      if (count > maxLineLength) {
        lines.push(aText.substring(last, i).trim());
        last = i;
        count = 1;
      }
    }

    if (!lines.length) {
      return {
        wrappedText: aText
      };
    }

    // add the last fragment of text
    lines.push(aText.substring(last).trim());

    let wrappedText = lines.join('\n');
    let croppedText;

    if (aDoCrop && lines.length > visibleLinesWhenCropped) {
      croppedText = lines.slice(0, visibleLinesWhenCropped).join('\n');
    }

    return {
      wrappedText: wrappedText,
      croppedText: croppedText
    };
  }

  /**
   * Create an element of tip info
   *
   * @param aTipData {hash}
   *   @note The value is created by |makeTipData|.
   * @return {Element}
   */
  function createTipItem(aTipData) {
    let {text, head, rest, uncroppedText} = aTipData;

    let $label = (attribute) => $E('label', attribute);

    // An inline element for styling of a text.
    // TODO: Use a reliable element instead of <label>.
    let $span = (attribute) => {
      attribute.style += 'margin:0;';

      return $E('label', attribute);
    };

    let $text = (text) => window.document.createTextNode(text);

    let item = $label({
      style: kStyle.item,
      'tipText': text
    });

    let accent = $span({
      style: kStyle.accent
    });

    item.appendChild(accent).appendChild($text(head));

    if (rest) {
      item.appendChild($text(rest));
    }

    if (uncroppedText) {
      let subTooltip = $E('tooltip', {
        // TODO: Make a smart unique id.
        id: kID.subTooltip + mBox.childNodes.length,
        style: kStyle.item,
        onpopuphiding: 'event.stopPropagation();'
      });

      let tooLong = kPref.maxLineLength * 20;

      if (uncroppedText.length > tooLong) {
        uncroppedText = uncroppedText.substr(0, tooLong) + kTipFormat.ellipsis;
      }

      item.appendChild(subTooltip).
        appendChild($label()).
        appendChild($text(uncroppedText));

      let crop = $span({
        style: kStyle.crop,
        tooltip: subTooltip.id
      });

      item.appendChild(crop).appendChild($text(kTipFormat.ellipsis));
    }

    return item;
  }

  function copyTipInfo() {
    let info = [];

    Array.forEach(mBox.childNodes, (node) => {
      if (node[kID.tipText]) {
        info.push(node[kID.tipText]);
      }
    });

    copyToClipboard(info.join('\n'));
  }

  return {
    init: init
  };
})();

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

function splitURL(aURL) {
  let colon = aURL.indexOf(':') + 1;

  return [aURL.substring(0, colon), aURL.substring(colon)];
}

function copyToClipboard(aText) {
  Cc['@mozilla.org/widget/clipboardhelper;1'].
    getService(Ci.nsIClipboardHelper).
    copyString(aText);
}

function handleAttribute(aNode, aName, aValue) {
  if (aName === 'tipText') {
    if (aValue) {
      aNode[kID.tipText] = aValue;
    }

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
