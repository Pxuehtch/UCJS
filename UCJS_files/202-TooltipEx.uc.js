// ==UserScript==
// @name TooltipEx.uc.js
// @description The tooltip of element with the informations.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @usage A tooltip panel opens with <Ctrl+Alt+MouseMove> on an element, with
// the various informations including the ancestor elements'.
// @note You can move the panel with dragging the frame margin of the content.
// @note You can select and copy texts and also can copy the whole data by the
// 'Copy All' menu item of the context menu.


(function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules,
  ContentTask,
  Listeners: {
    $event,
    $page
  },
  DOMUtils: {
    init$E,
    $ID
  },
  URLUtils,
  BrowserUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

// Makes $E with the attributes handler.
const $E = init$E(handleAttribute);

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
 * @key urls {string[]}
 */
const kInfoAttribute = {
  descriptions: [
    'title', 'alt', 'summary'
  ],
  urls: [
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
   *   The accent portions of a text:
   *   - '<tag>'
   *   - 'description-attribute='
   *   - 'URL-attribute=scheme:'
   * @key ellipsis {CSS} ('...' in my case)
   *   The ellipsis mark of a cropped text.
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
    // Lazy definition.
    delete this.ellipsis

    return this.ellipsis = Modules.PlacesUIUtils.ellipsis;
  }
};

/**
 * Key names for storing data.
 */
const kDataKey = {
  // Extended property name of a menuitem.
  textData: 'ucjs_TooltipEx_textData'
};

/**
 * Tooltip handler.
 */
const Tooltip = (function() {
  /**
   * Panel manager.
   */
  const Panel = (function() {
    let vars = {
      // The <panel> element.
      panel: null,
      // The <box> element of tooltip texts container.
      box: null
    };

    function create() {
      let panelStyle =
        '-moz-appearance:tooltip;' +
        // @note |vars.box| has 'max-width'.
        'max-width:none;' +
        // The margin for dragging the panel.
        'padding:.3em;' +
        // Tight text wrapping.
        'word-break:break-all;word-wrap:break-word;';

      let boxStyle = `max-width:${kPref.maxWidth}em;`;

      let panel = $E('panel', {
        id: kUI.panel.id,
        style: panelStyle,
        backdrag: true,
        // Close the context menu too.
        // @note The context menu must be the first child of the panel.
        onpopuphiding: 'if(event.target===this){this.firstChild.hidePopup();}'
      });

      // Make the context menu.
      let popup = $E('menupopup', {
        // @see chrome://global/content/globalOverlay.js::goUpdateCommand
        onpopupshowing: 'goUpdateCommand("cmd_copy");'
      });

      $event(popup, 'command', handleEvent);

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
      // Append the context panel as the first child of the panel.
      panel.appendChild(popup);

      vars.box = panel.appendChild($E('vbox', {
        style: boxStyle
      }));

      vars.panel = $ID('mainPopupSet').appendChild(panel);
    }

    function appendItems(items) {
      vars.box.appendChild(items);
    }

    function clearItems() {
      let box = vars.box;

      while (box.firstChild) {
        box.removeChild(box.firstChild);
      }
    }

    function getItems() {
      return [...vars.box.childNodes];
    }

    function isEmpty() {
      return getItems().length === 0;
    }

    function isOpen() {
      // WORKAROUND: This tests whether the panel is alive or not.
      return vars.panel && vars.panel.state === 'open';
    }

    function open(event) {
      const kMargin = {
        x: 10,
        y: 10
      };

      let {screenX: x, screenY: y} = event;

      vars.panel.openPopupAtScreen(x + kMargin.x, y + kMargin.y, false);
    }

    function hide() {
      if (isOpen()) {
        vars.panel.hidePopup();
      }
    }

    return {
      create,
      appendItems,
      clearItems,
      getItems,
      isEmpty,
      isOpen,
      open,
      hide
    };
  })();

  /**
   * Information manager of a target node.
   */
  const NodeInfo = (function() {
    let vars = {
      selector: '',
      nodeTree: [],
      doUpdate: false
    };

    function clear() {
      vars.selector = '';
      vars.nodeTree = [];
      vars.doUpdate = false;
    }

    function update(event) {
      vars.doUpdate = true;

      return Task.spawn(function*() {
        vars.doUpdate = false;

        let point = BrowserUtils.getCursorPointInContent(event);
        let newInfo = yield getNodeInfo(point, vars.selector);

        // The new task is requested so that this task should be abandoned.
        if (vars.doUpdate) {
          return Promise.reject();
        }

        // Update the cache with the new information.
        if (newInfo) {
          vars.selector = newInfo.selector;
          vars.nodeTree = newInfo.nodeTree;

          return vars.nodeTree;
        }

        return null;
      });
    }

    function getNodeInfo(point, selector) {
      return ContentTask.spawn({
        params: {point, selector},
        task: `function* content_task(params) {
          ${ContentTask.ContentScripts.DOMUtils}
          ${content_collectInfo.toString()}

          let {point, selector} = params;

          let details = DOMUtils.getElementFromPoint(point.x, point.y, {
            requestDetails: true
          });

          if (!details) {
            return null;
          }

          let node = details.area || details.node;

          // The information of this node has been cached.
          if (selector && node === DOMUtils.$S1(selector)) {
            return null;
          }

          // An <area> element that |DOMUtils.getElementFromPoint| returns
          // isn't present in the given point. An <img> or <object> that has
          // the image map actually exists.
          if (details.area) {
            let areaInfo = content_collectInfo(details.area);
            let ownerInfo = content_collectInfo(details.node);

            // Make a node tree as if <area> is a child of the map owner node.
            ownerInfo.nodeTree.unshift(areaInfo.nodeTree[0]);

            return {
              selector: areaInfo.selector,
              nodeTree: ownerInfo.nodeTree
            };
          }

          return content_collectInfo(node);
        }`
      });
    }

    function content_collectInfo(node) {
      let selectors = [];
      let nodeTree = [];

      let selectorCompleted = false;

      let add = (selector, node) => {
        if (selector && !selectorCompleted) {
          if (selectors.length && /^i?frame$/.test(node.localName)) {
            selector += '|';
          }

          selectors.unshift(selector);
        }

        let attributes = {};

        [...node.attributes].forEach((attribute) => {
          attributes[attribute.localName] = attribute.value;
        });

        let linkText;

        if (DOMUtils.getLinkHref(node) && node.textContent) {
          linkText = node.textContent;
        }

        nodeTree.push({
          baseURI: node.baseURI,
          tagName: node.localName,
          attributes,
          linkText
        });
      };

      while (node) {
        if (node.localName === 'body' || node.localName === 'html') {
          add(node.localName, node);

          let view = node.ownerDocument.defaultView;

          // Enter the parent document.
          if (view.frameElement) {
            node = view.frameElement;
            selectorCompleted = false;

            continue;
          }

          break;
        }

        if (node.id) {
          add('#' + node.id, node);
          selectorCompleted = true;
        }
        else {
          let selector;

          if (node.previousElementSibling || node.nextElementSibling) {
            let count = 0;
            let sibling = node;

            while (sibling) {
              count++;
              sibling = sibling.previousElementSibling;
            }

            selector = `${node.localName}:nth-child(${count})`;
          }
          else {
            selector = node.localName;
          }

          add(selector, node);
        }

        node = node.parentElement;
      }

      return {
        selector: selectors.join('>'),
        nodeTree
      };
    }

    return {
      clear,
      update
    };
  })();

  function init() {
    // Create the tooltip panel.
    Panel.create();

    // Clear the tooltip content when a document closes.
    $page('pageselect', handleEvent);
    $page('pagehide', handleEvent);

    // Observe mouse moving to show the tooltip only while trigger keys are
    // pressed down in an HTML document.
    let isObserving = false;

    $event(window, 'keydown', (event) => {
      let triggerKey = event.ctrlKey && event.altKey;

      if (!isObserving && triggerKey && BrowserUtils.isHTMLDocument()) {
        isObserving = true;

        let pc = gBrowser.mPanelContainer;

        let stopObserving = () => {
          isObserving = false;

          pc.removeEventListener('mousemove', handleEvent);
          window.removeEventListener('keyup', stopObserving);
          window.removeEventListener('unload', stopObserving);
        };

        pc.addEventListener('mousemove', handleEvent);

        // Stop observing when any key is released.
        window.addEventListener('keyup', stopObserving);

        // Clean up all when shutdown.
        window.addEventListener('unload', stopObserving);
      }
    });
  }

  function handleEvent(event) {
    switch (event.type) {
      // Show the tooltip of a target node in the content area.
      case 'mousemove': {
        show(event);

        break;
      }

      // Close the tooltip when the document is switched.
      case 'pageselect':
      case 'pagehide': {
        clear();

        break;
      }

      // Command of the context menu of a tooltip.
      case 'command': {
        switch (event.target.id) {
          case kUI.copyAll.id: {
            copyAllData();

            break;
          }
        }

        break;
      }
    }
  }

  function show(event) {
    NodeInfo.update(event).then(
      function resolve(nodeTree) {
        // Show the tooltip of the new node.
        if (nodeTree) {
          // Close the tooltip of the old node.
          if (Panel.isOpen()) {
            hide();
          }

          // Try to build the new tooltip.
          if (!build(nodeTree)) {
            return;
          }
        }
        else {
          // The same node has had no information.
          if (Panel.isEmpty()) {
            return;
          }

          // Leave the showing tooltip of the same node.
          if (Panel.isOpen()) {
            return;
          }
        }

        Panel.open(event);
      },
      function reject() {
        // This showing process is cancelled.
        hide();
      }
    ).
    catch(Cu.reportError);
  }

  function hide() {
    Panel.hide();
  }

  function clear() {
    hide();
    NodeInfo.clear();
  }

  function build(nodeTree) {
    // Clear existing items.
    Panel.clearItems();

    let tips = [];

    nodeTree.forEach((node, i) => {
      tips = tips.concat(collectTipData(node, {
        isBaseNode: i === 0
      }));
    });

    if (!tips.length) {
      return false;
    }

    let fragment = window.document.createDocumentFragment();

    tips.forEach((tip) => {
      fragment.appendChild(createTipItem(tip));
    });

    Panel.appendItems(fragment);

    return true;
  }

  function collectTipData(node, options = {}) {
    // Template replacer.
    let $tag = (name) => kUI.accent.tag.replace('%tag%', name);
    let $attr = (name) => kUI.accent.attribute.replace('%name%', name);

    let {tagName, attributes, linkText} = node;
    let {isBaseNode} = options;

    let data = [];

    kInfoAttribute.descriptions.forEach((name) => {
      let value = attributes[name];

      if (value) {
        data.push(makeTipData($attr(name), value, true));
      }
    });

    kInfoAttribute.urls.forEach((name) => {
      let value = attributes[name];

      if (value) {
        let [scheme, rest] = splitURL(value, node.baseURI);

        // Truncate only a long URL with 'javascript:' or 'data:' scheme.
        let doCrop = /^(?:javascript|data):/.test(scheme);

        data.push(makeTipData($attr(name) + scheme, rest, doCrop));
      }
      else if (name in attributes) {
        data.push(makeTipData($attr(name), '[N/A]', true));
      }
    });

    for (let name in attributes) {
      // The attribute for event.
      if (/^on/.test(name)) {
        data.push(makeTipData($attr(name), attributes[name], true));
      }
    }

    // Show the base node, an ancestor node that has the information and a link
    // node with text.
    if (isBaseNode || data.length || linkText) {
      // Add a tag name to the top of array.
      data.unshift(makeTipData($tag(tagName), linkText, true));
    }

    return data;
  }

  /**
   * Make a data for creating an element of a tooltip text.
   *
   * @param head {string}
   * @param rest {string}
   * @param doCrop {boolean}
   * @return {hash}
   *   @note The value is passed to |createTipItem|.
   */
  function makeTipData(head, rest, doCrop) {
    if (!rest) {
      return {
        text: head,
        head
      };
    }

    let text = (head + rest).trim().replace(/\s+/g, ' ');

    let croppedText;

    if (doCrop) {
      let maxLength = kPref.maxWidth * kPref.maxNumWrapLinesWhenCropped;

      if (text.length > maxLength) {
        croppedText = text.substr(0, maxLength);
      }
    }

    return {
      text,
      head,
      rest: (croppedText || text).substr(head.length),
      cropped: !!croppedText
    };
  }

  /**
   * Create an element of a tooltip text.
   *
   * @param tipData {hash}
   *   @note The value is created by |makeTipData|.
   * @return {Element}
   */
  function createTipItem(tipData) {
    let {text, head, rest, cropped} = tipData;

    // A block element for a tooltip text.
    let $item = (attribute) => {
      if (attribute) {
        // Make the content text selectable by user.
        attribute.style += '-moz-user-focus:normal;-moz-user-select:text;';
      }

      return $E('html:div', attribute);
    };

    // An inline element for styling of a text.
    let $span = (attribute) => $E('html:span', attribute);

    let $text = (text) => window.document.createTextNode(text);

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
        // Make a unique id.
        id: kUI.subTooltip.id + Panel.getItems().length,
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

    Panel.getItems().forEach((node) => {
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

/**
 * Utility functions.
 */
function splitURL(url, baseURI) {
  url = URLUtils.unescapeURLForUI(URLUtils.resolveURL(url, baseURI));

  let colon = url.indexOf(':') + 1;

  return [url.slice(0, colon), url.slice(colon)];
}

function copyToClipboard(str) {
  Modules.ClipboardHelper.copyString(str);
}

/**
 * Attribute handler for |ucjsUtil.DOMUtils.$E|.
 */
function handleAttribute(node, name, value) {
  if (name === 'textData') {
    if (value) {
      node[kDataKey.textData] = value;
    }

    return true;
  }

  return false;
}

/**
 * Entry point.
 */
function TooltipEx_init() {
  Tooltip.init();
}

TooltipEx_init();


})(this);
