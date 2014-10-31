// ==UserScript==
// @name TooltipEx.uc.js
// @description A tooltip of an element with the informations.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @usage Opens a tooltip panel with <Ctrl+Alt+MouseMove> on an element
// with the attribute for description or URL or event-handler including the
// ancestor elements.
// @note You can move the panel with dragging the margin of the content.
// @note You can select and copy texts. And also can copy the whole data by the
// 'Copy All' menu item of the context menu.


(function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getModule,
  getNodeById: $ID,
  addEvent,
  unescapeURLForUI,
  resolveURL
} = window.ucjsUtil;

function $E(aTagOrNode, aAttribute) {
  return window.ucjsUtil.createNode(aTagOrNode, aAttribute, handleAttribute);
}

// For debugging.
function log(aMsg) {
  return window.ucjsUtil.logMessage('TooltipEx.uc.js', aMsg);
}

/**
 * Preference
 */
const kPref = {
  /**
   * Max number of characters in a line.
   *
   * @value {integer} [>0]
   *
   * @note 'max-width' of a text container is set to this value by 'em'.
   */
  maxWidth: 40,

  /**
   * Number of lines in the visible portion of a long text being cropped.
   *
   * @value {integer} [>0]
   *
   * @note Applied to a long URL with 'javascript:' or 'data:' scheme.
   */
  maxNumWrapLinesWhenCropped: 2,

  /**
   * Max number of wrap lines of a long text in a sub tooltip.
   *
   * @value {integer} [>0]
   */
  maxNumWrapLinesOfSubTooltip: 20
};

/**
 * Attribute names for the informations of an element.
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
 * UI setting.
 */
const kUI = {
  panel: {
    id: 'ucjs_TooltipEx_panel'
  },
  subTooltip: {
    // @note The id prefix of a sub tooltip.
    id: 'ucjs_TooltipEx_subTooltip'
  },
  copy: {
    id: 'ucjs_TooltipEx_copy',
    label: 'Copy'
  },
  copyAll: {
    id: 'ucjs_TooltipEx_copyAll',
    label: 'Copy All'
  },

  /**
   * CSS styles of tooltip texts.
   *
   * @key text {CSS}
   *   The base style of tooltip texts.
   * @key accent {CSS}
   *   For accent portions of a text.
   *   @note Applied to;
   *   - '<tag>'
   *   - 'description-attribute='
   *   - 'URL-attribute=scheme:'
   * @key ellipsis {CSS}
   *   For the ellipsis mark of a cropped text.
   */
  style: {
    text: 'font:1em/1.2 monospace;letter-spacing:.1em;',
    accent: 'color:blue;',
    ellipsis: 'color:red;font-weight:bold;'
  },

  /**
   * Template for accent portions of a tooltip text.
   */
  accent: {
    tag: '<%tag%>',
    attribute: '%name%='
  },

  /**
   * The ellipsis mark.
   */
  get ellipsis() {
    const {PlacesUIUtils} = getModule('app/modules/PlacesUIUtils.jsm');

    // Lazy definition.
    delete this.ellipsis

    return this.ellipsis = PlacesUIUtils.ellipsis;
  }
};

/**
 * Key names for storing data.
 *
 * @note Extended property name of a menuitem.
 */
const kDataKey = {
  textData: 'ucjs_TooltipEx_textData'
};

/**
 * Tooltip panel handler.
 */
const TooltipPanel = (function() {
  /**
   * Tooltip <panel>.
   */
  let mPanel;

  /**
   * Container <box> for rows of tooltip texts.
   */
  let mBox;

  /**
   * Target node in the content area.
   *
   * TODO: Make sure to release the reference.
   * WORKAROUND: Cleans up whenever the document is switched.
   */
  let mTarget;

  function init() {
    // Create the tooltip panel.
    createPanel();

    // Observe the mouse moving to show the tooltip.
    // @note Use the capture mode to surely catch the event in the content
    // area.
    addEvent(gBrowser.mPanelContainer, 'mousemove', handleEvent, true);

    // Close the tooltip when the document is switched.
    addEvent(gBrowser, 'select', handleEvent, false);
    addEvent(gBrowser, 'pagehide', handleEvent, false);
  }

  function handleEvent(aEvent) {
    switch (aEvent.type) {
      // Show the tooltip of a target node in the content area.
      case 'mousemove': {
        if (aEvent.altKey && aEvent.ctrlKey) {
          if (isHtmlDocument(aEvent.target.ownerDocument)) {
            show(aEvent);
          }
        }

        break;
      }

      // Close the tooltip when the document is switched.
      case 'select':
      case 'pagehide': {
        hide();

        break;
      }

      // Command of the context menu of a tooltip.
      case 'command': {
        switch (aEvent.target.id) {
          case kUI.copyAll.id: {
            copyAllData();

            break;
          }
        }

        break;
      }
    }
  }

  function createPanel() {
    let panelStyle =
      '-moz-appearance:tooltip;' +
      // @note The inner container |mBox| has 'max-width'.
      'max-width:none;' +
      // The margin for dragging the panel.
      'padding:.3em;' +
      // Tight text wrapping.
      'word-break:break-all;word-wrap:break-word;';

    let panel = $E('panel', {
      id: kUI.panel.id,
      style: panelStyle,
      backdrag: true
    });

    // Make the context menu.
    let popup = $E('menupopup', {
      // @see chrome://global/content/globalOverlay.js::goUpdateCommand
      onpopupshowing: 'goUpdateCommand("cmd_copy");'
    });

    addEvent(popup, 'command', handleEvent, false);

    popup.appendChild($E('menuitem', {
      id: kUI.copy.id,
      label: kUI.copy.label,
      command: 'cmd_copy'
    }));

    popup.appendChild($E('menuitem', {
      id: kUI.copyAll.id,
      label: kUI.copyAll.label
    }));

    panel.contextMenu = '_child';
    panel.appendChild(popup);

    mBox = panel.appendChild($E('vbox', {
      style: 'max-width:' + kPref.maxWidth + 'em;'
    }));

    mPanel = $ID('mainPopupSet').appendChild(panel);
  }

  function show(aEvent) {
    let target = aEvent.target;

    if (mPanel.state === 'showing' || mPanel.state === 'hiding') {
      return;
    }

    if (target === mTarget) {
      // Bail out if this known target has no information.
      if (!mBox.firstChild) {
        return;
      }

      // Leave the showing tooltip of the known target.
      // @note Reopen the tooltip of the known target if it closed.
      if (mPanel.state === 'open') {
        return;
      }
    }
    else {
      // Close the tooltip of the old target.
      if (mPanel.state === 'open') {
        hide();
      }

      mTarget = target;

      // Build the new tooltip.
      if (!build()) {
        return;
      }
    }

    mPanel.openPopupAtScreen(aEvent.screenX, aEvent.screenY, false);
  }

  function hide() {
    mPanel.hidePopup();

    mTarget = null;
  }

  function build() {
    // Clear existing items.
    while (mBox.firstChild) {
      mBox.removeChild(mBox.firstChild);
    }

    let tips = [];

    // @note The initial node may be a text node.
    let node = mTarget;

    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        tips = tips.concat(collectTipData(node));
      }

      node = node.parentNode;
    }

    if (!tips.length) {
      return false;
    }

    let fragment = window.document.createDocumentFragment();

    tips.forEach((tip) => {
      fragment.appendChild(createTipItem(tip));
    });

    mBox.appendChild(fragment);

    return true;
  }

  function collectTipData(aNode) {
    // Helper functions.
    let $tag = (name) => kUI.accent.tag.replace('%tag%', name);
    let $attr = (name) => kUI.accent.attribute.replace('%name%', name);

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

        // Truncate only a long URL with 'javascript:' or 'data:' scheme.
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
   * Make a data for creating an element of a tooltip text.
   *
   * @param aHead {string}
   * @param aRest {string}
   * @param aDoCrop {boolean}
   * @return {hash}
   *   @note The value is passed to |createTipItem|.
   */
  function makeTipData(aHead, aRest, aDoCrop) {
    if (!aRest) {
      return {
        text: aHead,
        head: aHead
      };
    }

    let text = (aHead + aRest).trim().replace(/\s+/g, ' ');

    let croppedText;

    if (aDoCrop) {
      let maxLength = kPref.maxWidth * kPref.maxNumWrapLinesWhenCropped;

      if (text.length > maxLength) {
        croppedText = text.substr(0, maxLength);
      }
    }

    return {
      text,
      head: aHead,
      rest: (croppedText || text).substr(aHead.length),
      cropped: !!croppedText
    };
  }

  /**
   * Create an element of a tooltip text.
   *
   * @param aTipData {hash}
   *   @note The value is created by |makeTipData|.
   * @return {Element}
   */
  function createTipItem(aTipData) {
    let {text, head, rest, cropped} = aTipData;

    // A block element for a tooltip text.
    let $item = (aAttribute) => {
      if (aAttribute) {
        // Make the content text selectable by user.
        aAttribute.style += '-moz-user-focus:normal;-moz-user-select:text;';
      }

      return $E('html:div', aAttribute);
    };

    // An inline element for styling of a text.
    let $span = (aAttribute) => $E('html:span', aAttribute);

    let $text = (aText) => window.document.createTextNode(aText);

    let item = $item({
      style: kUI.style.text,
      'textData': text
    });

    let accent = $span({
      style: kUI.style.accent
    });

    item.appendChild(accent).appendChild($text(head));

    if (rest) {
      item.appendChild($text(rest));
    }

    if (cropped) {
      let subTooltipStyle =
        'max-width:' + kPref.maxWidth + 'em;' +
        'word-break:break-all;word-wrap:break-word;' +
        kUI.style.text;

      let subTooltip = $E('tooltip', {
        // TODO: Make a smart unique id.
        id: kUI.subTooltip.id + mBox.childNodes.length,
        style: subTooltipStyle
      });

      let maxLength = kPref.maxWidth * kPref.maxNumWrapLinesOfSubTooltip;

      if (text.length > maxLength) {
        text = text.substr(0, maxLength) + kUI.ellipsis;
      }

      item.appendChild(subTooltip).
        appendChild($item()).
        appendChild($text(text));

      item.appendChild($E('label', {
        value: kUI.ellipsis,
        style: kUI.style.ellipsis,
        class: 'plain',
        tooltip: subTooltip.id
      }));
    }

    return item;
  }

  function copyAllData() {
    let data = [];

    Array.forEach(mBox.childNodes, (node) => {
      let textData = node[kDataKey.textData];

      if (textData) {
        data.push(textData);
      }
    });

    copyToClipboard(data.join('\n'));
  }

  return {
    init
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
  if (aName === 'textData') {
    if (aValue) {
      aNode[kDataKey.textData] = aValue;
    }

    return true;
  }

  return false;
}

/**
 * Entry point.
 */
function TooltipEx_init() {
  TooltipPanel.init();
}

TooltipEx_init();


})(this);
