// ==UserScript==
// @name WebService.uc.js
// @description Helper handler for using the web services.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @usage Access to functions through the global scope
// (window.ucjsWebService.XXX).


window.ucjsWebService = (function(window) {


"use strict";


/**
 * Imports
 */
const {
  Modules: {
    Timer: {
      setTimeout,
      clearTimeout
    }
  },
  ContentTask,
  Listeners: {
    $shutdown
  },
  TabUtils,
  // Logger to console for debug.
  Console: {
    log
  }
} = window.ucjsUtil;

/**
 * Preset list.
 *
 * @key type {string}
 *   'open': Opens a tab with the service.
 *     @see |open()|
 *   'get': Gets the response by 'GET' HTTP request to the service.
 *     @see |get()|
 * @key name {string}
 *   A preset name.
 * @key url {string}
 *   A URL string of a web service.
 *   @note Set alias strings for the parameter data.
 *   @see |AliasFixup|
 * @key form {hash} [optional only for type 'open']
 *   A input box to be filled with the parameter data.
 *   @key form {XPath of <form>}
 *   @key input {XPath of <input>}
 * @key parse {function} [optional only for type 'get']
 *   A function to parse the response text.
 *   @param aResponseText {string}
 */
const kPresets = [
  {
    type: 'get',
    name: 'HatenaBookmarkCounter',
    // @see http://developer.hatena.ne.jp/ja/documents/bookmark/apis/getcount
    url: 'http://api.b.st-hatena.com/entry.count?url=%enc%',
    parse(aResponseText) {
      return aResponseText || 0;
    }
  },
  {
    type: 'open',
    name: 'GoogleSearch',
    url: 'https://www.google.co.jp/search?q=%enc%'
  },
  {
    type: 'open',
    name: 'GoogleTranslation',
    url: 'http://translate.google.co.jp/#auto|ja|%enc%'
  },
  {
    type: 'open',
    name: 'Eijiro',
    url: 'http://eow.alc.co.jp/%enc%/UTF-8/'
  },
  {
    type: 'open',
    name: 'Weblio',
    url: 'http://ejje.weblio.jp/content/%enc%'
  },
  {
    type: 'open',
    name: 'ExciteTranslationEnToJp',
    url: 'http://www.excite.co.jp/world/english/',
    form: {
      form: 'id("formTrans")',
      input: 'id("before")'
    }
  }
];

/**
 * Handler of fixing up an alias with the data.
 *
 * @return {hash}
 *   @key create {function}
 *
 * [alias]
 * %raw% : The data itself.
 * %enc% : With URI encoded.
 * %schemeless%, %sl% : Without the URL scheme.
 * %paramless%, %pl% : Without the URL parameter.
 *
 * @note Aliases can be combined by '|'.
 * e.g. %schemeless|enc% : A data that is trimmed the scheme and then URI
 * encoded (the multiple aliases is applied in the order of settings).
 */
const AliasFixup = (function() {
  const kAliasSplitter = '|';
  const kAliasPattern = RegExp('%([a-z_' + kAliasSplitter + ']+)%', 'ig');

  function create(aText, aData) {
    let dataArray = !Array.isArray(aData) ? [aData] : aData.slice();

    return aText.replace(kAliasPattern, (match, alias) => {
      if (!dataArray.length) {
        return match;
      }

      let data = dataArray.shift() + '';

      alias.split(kAliasSplitter).forEach((modifier) => {
        data = fixupModifier(data, modifier);
      });

      return data;
    });
  }

  function fixupModifier(aData, aModifier) {
    switch (aModifier) {
      case 'schemeless':
      case 'sl':
        return aData.replace(/^https?:\/\//, '');

      case 'paramless':
      case 'pl':
        return aData.replace(/[?#].*$/, '');

      case 'enc':
        return encodeURIComponent(aData);

      case 'raw':
        return aData;
    }

    return '';
  }

  return {
    create
  };
})();

/**
 * Asynchronous HTTP request handler.
 */
const RequestHandler = (function() {
  /**
   * The minimum time for waiting a request.
   *
   * @value {integer} [milliseconds > 0]
   */
  const kMinCooldownTime = 2000;

  /**
   * The request time for each host.
   */
  const RequestTime = {
    mRequestTimeList: {},

    update(aURL) {
      // TODO: Validation check for URL.
      // WORKAROUND: Set a valid |url| of |kPreset|.
      let host = (/^https?:\/\/([^\/]+)/.exec(aURL))[1];

      let lastRequestTime = this.mRequestTimeList[host] || 0;
      let requestTime = Date.now();
      let remainTime = kMinCooldownTime - (requestTime - lastRequestTime);

      this.mRequestTimeList[host] = requestTime;

      // Returns the cooldown time for the next request.
      return Math.max(remainTime, 0);
    }
  };

  /**
   * List of requests.
   */
  const RequestList = (function() {
    let mPendings = new Set();
    let mSendings = new Set();

    // Clean up when the browser window closes.
    $shutdown(() => {
      for (let timer of mPendings) {
        clearTimeout(timer);
      }

      mPendings.clear();
      mPendings = null;

      for (let xhr of mSendings) {
        if (xhr) {
          xhr.abort();
        }
      }

      mSendings.clear();
      mSendings = null;
    });

    return {
      pendings: mPendings,
      sendings: mSendings
    };
  })();

  function request(aURL, aOption) {
    let cooldownTime = RequestTime.update(aURL);

    let timer = setTimeout(() => {
      RequestList.pendings.delete(timer);

      aOption.timeout = kMinCooldownTime;

      doRequest(aURL, aOption);
    }, cooldownTime);

    RequestList.pendings.add(timer);
  }

  /**
   * XMLHttpRequest wrapper function.
   *
   * @param aURL {string}
   *   A URL string to request data.
   * @param aOption {hash}
   *   timeout: {integer} [milliseconds > 0]
   *     A timeout value while waiting for a response.
   *   onLoad: {function}
   *     A function handle to call when the load is completed.
   *     @param aResponseText {string}
   *   onError: {function} [optional]
   *     A function handle to call when the operation fails.
   *     @param aStatusText {string}
   *     @param aError {Error|null}
   */
  function doRequest(aURL, aOption) {
    // Creates a new request in anonymous mode.
    let xhr = new XMLHttpRequest({mozAnon: true});

    // No error dialogs.
    // @note Must be set before calling open().
    xhr.mozBackgroundRequest = true;

    // Asynchronous GET request.
    xhr.open('GET', aURL, true);

    // Prevents any caching.
    xhr.channel.loadFlags =
      Ci.nsIChannel.LOAD_BYPASS_CACHE |
      Ci.nsIChannel.INHIBIT_CACHING;

    xhr.timeout = aOption.timeout || 0;

    let handleEvent = (aEvent) => {
      RequestList.sendings.delete(xhr);

      switch (aEvent.type) {
        case 'load': {
          try {
            if (xhr.status === 200) {
              reportSuccess(xhr.responseText);
            }
            else {
              reportError(aEvent, xhr.statusText);
            }
          }
          catch (ex) {
            reportError(aEvent, null, ex);
          }

          break;
        }

        case 'error': {
          try {
            let request = xhr;

            try {
              request.status;
            }
            catch (ex) {
              request = xhr.channel.QueryInterface(Ci.nsIRequest);
            }

            reportError(aEvent, request.statusText);
          }
          catch (ex) {
            reportError(aEvent, null, ex);
          }

          break;
        }

        case 'timeout': {
          reportError(aEvent, 'request is timed out');

          break;
        }
      }
    };

    let reportSuccess = (responseText) => {
      uninit();

      if (aOption.onLoad) {
        aOption.onLoad(responseText);
      }
    };

    let reportError = (aEvent, aStatusText, aError) => {
      uninit();

      let eventType = aEvent ? aEvent.type : 'before request';
      let statusText = aStatusText || 'No status';

      let message = `<XHR error>\nURL:${aURL}\n${eventType}:${statusText}`;

      // Log to console.
      log(aError ? [message, aError] : [message]);

      if (aOption.onError) {
        aOption.onError(statusText, aError || null);
      }
    };

    let uninit = () => {
      xhr.onload = null;
      xhr.onerror = null;
      xhr.ontimeout = null;
      xhr = null;
    };

    try {
      xhr.onload = handleEvent;
      xhr.onerror = handleEvent;
      xhr.ontimeout = handleEvent;

      xhr.send(null);

      RequestList.sendings.add(xhr);
    }
    catch (ex) {
      reportError(null, 'send() fails', ex);
    }
  }

  return {
    request
  };
})();

/**
 * Opens a new tab with the service.
 *
 * @param aParams {hash}
 *   name: {string}
 *     A preset name.
 *   data: {string|number|[string|number]} [optional]
 *     A parameter data to fixup the URL of preset.
 *     @note Set the replaced values in the order in Array[] when a URL has
 *     multiple aliases.
 *     @note If the preset has 'form', the data fills the input box.
 *   tabOption: {hash} [optional]
 *     Options for a new tab.
 *     @see |ucjsUtil::TabUtils.openTab|
 *     e.g. |tabOption: {inBackground: true}| opens tab in background.
 *
 * @usage window.ucjsWebService.open(aParams);
 */
function open(aParams) {
  let result = getResult(aParams, 'open');

  if (!result) {
    return;
  }

  let tab = TabUtils.openTab(result.url, result.tabOption);

  // TODO: Observe the document loaded to manage a form.
  // WORKAROUND:
  // - Uses an easy delay for a selected tab.
  // - The URL is just only opened for a background tab.
  // XXX: I'm unwilling to handle an observer for this.
  if (tab.selected && result.form) {
    setTimeout(inputAndSubmit, 500, result.form, result.data);
  }
}

/**
 * Gets the response by 'GET' HTTP request to the service.
 *
 * @param aParams {hash}
 *   name: {string}
 *     A preset name.
 *   data: {string|number|[string|number]} [optional]
 *     A parameter data to fixup the URL of preset.
 *     @note Set the replaced values in the order in Array[] when the URL has
 *     multiple aliases.
 *   onLoad: {function}
 *     A function handle to call when the load is completed.
 *     @param aResponseText {string}
 *   onError: {function} [optional]
 *     A function handle to call when the operation fails.
 *     @param aStatusText {string}
 *     @param aError {Error|null}
 *
 * @usage window.ucjsWebService.get(aParams);
 */
function get(aParams) {
  let result = getResult(aParams, 'get');

  if (!result) {
    return;
  }

  let options = {
    onLoad(aResponseText) {
      if (result.parse) {
        aResponseText = result.parse(aResponseText);
      }

      if (result.onLoad) {
        result.onLoad(aResponseText);
      }
    },
    onError(aStatusText, aError) {
      if (result.onError) {
        result.onError(aStatusText, aError);
      }
    }
  };

  RequestHandler.request(result.url, options);
}

function getResult(aParams, aType) {
  if (!aParams.name) {
    throw Error('aParams.name is empty');
  }

  let result = null;

  kPresets.some((preset) => {
    if (preset.type === aType && preset.name === aParams.name) {
      result = evaluate(aParams, preset);

      return true;
    }

    return false;
  });

  return result;
}

function evaluate(aParams, aPreset) {
  let result = {};

  // Copy the preset.
  for (let key in aPreset) {
    result[key] = aPreset[key];
  }

  // Add the option.
  for (let key in aParams) {
    if (!(key in result)) {
      result[key] = aParams[key];
    }
  }

  // Build a URL.
  if (!result.url) {
    throw Error('aPreset.url is empty');
  }

  if (result.data) {
    result.url = AliasFixup.create(result.url, result.data);
  }

  return result;
}

function inputAndSubmit(formInfo, inputData) {
  ContentTask.spawn({
    params: {formInfo, inputData},
    task: function*(params) {
      '${ContentTask.ContentScripts.DOMUtils}';

      let {formInfo, inputData} = params;

      let formNode = DOMUtils.$X1(formInfo.form),
          inputNode = DOMUtils.$X1(formInfo.input);

      if (formNode && inputNode) {
        inputNode.value = inputData;
        formNode.submit();
      }
    }
  }).
  catch(Cu.reportError);
}

function updateFormInput(inputData, options = {}) {
  ContentTask.spawn({
    params: {inputData, options},
    task: `function*(params) {
      ${ContentTask.ContentScripts.DOMUtils}
      ${content_updateFormInput.toString()}

      let {inputData, options} = params;

      content_updateFormInput(inputData, options);
    }`
  }).
  catch(Cu.reportError);

  function content_updateFormInput(inputData, options = {}) {
    const kTextInputXpath = './/input[not(@disabled or @hidden or @readonly) and (@type="text" or not(@type))]';

    if (!inputData) {
      return;
    }

    let {
      lessData,
      doSubmit
    } = options;

    let formNode, inputNode;

    [...content.document.forms].some((form) => {
      let input = DOMUtils.$X1(kTextInputXpath, form);

      if (input && input.value) {
        formNode = form;
        inputNode = input;

        return true;
      }

      return false;
    });

    if (!inputNode) {
      return;
    }

    inputData = inputData.trim().replace(/\s+/g, ' ');
    inputNode.value += (lessData ? ' -' : ' ') + '"' + inputData + '"';

    if (doSubmit) {
      formNode.submit();
    }
    else {
      inputNode.focus();
    }
  }
}

/**
 * Exports
 */
return {
  open,
  get,
  updateFormInput
};


})(this);
