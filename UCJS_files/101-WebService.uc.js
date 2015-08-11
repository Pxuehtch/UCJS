// ==UserScript==
// @name WebService.uc.js
// @description Helper handler for using the web services.
// @include main
// ==/UserScript==

// @require Util.uc.js

// @usage Access to functions through the global scope
// (window.ucjsWebService.XXX).


const ucjsWebService = (function(window) {


"use strict";


/**
 * Imports
 */
const {
  Timer: {
    setTimeout,
    clearTimeout
  },
  getModule,
  getFirstNodeByXPath: $X1,
  openTab,
  // Log to console for debug.
  logMessage: log
} = window.ucjsUtil;

/**
 * Preset list.
 *
 * @key type {string}
 *   'get': Requests data.
 *   'open': Opens a tab.
 * @key name {string}
 *   A preset name.
 * @key URL {string}
 *   A URL string of a web service.
 *   @note Pass the data with alias.
 *   @see |AliasFixup|
 * @key form {hash} [optional for only 'open' type]
 *   @key form {XPath of <form>}
 *   @key input {XPath of <input>}
 * @key parse {function} [optional; only with type 'get']
 *   A function to parse the response text when the load is completed.
 *   @param aResponseText {string}
 */
const kPresets = [
  {
    type: 'get',
    name: 'HatenaBookmarkCounter',
    // @see http://developer.hatena.ne.jp/ja/documents/bookmark/apis/getcount
    URL: 'http://api.b.st-hatena.com/entry.count?url=%ENC%',
    parse(aResponseText) {
      return aResponseText || 0;
    }
  },
  {
    type: 'open',
    name: 'GoogleSearch',
    URL: 'https://www.google.co.jp/search?q=%ENC%'
  },
  {
    type: 'open',
    name: 'GoogleTranslation',
    URL: 'http://translate.google.co.jp/#auto|ja|%ENC%'
  },
  {
    type: 'open',
    name: 'Eijiro',
    URL: 'http://eow.alc.co.jp/%ENC%/UTF-8/'
  },
  {
    type: 'open',
    name: 'Weblio',
    URL: 'http://ejje.weblio.jp/content/%ENC%'
  },
  {
    type: 'open',
    name: 'ExciteTranslationEnToJp',
    URL: 'http://www.excite.co.jp/world/english/',
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
 * [aliases]
 * %RAW% : The data itself.
 * %ENC% : With URI encoded.
 * %SCHEMELESS%, %sl% : Without the URL scheme.
 * %PARAMLESS%, %pl% : Without the URL parameter.
 *
 * @note Aliases can be combined by '|';
 * e.g. %SCHEMELESS|ENC% : A data that is trimmed the scheme and then URI
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
      case 'SCHEMELESS':
      case 'sl':
        return aData.replace(/^https?:\/\//, '');

      case 'PARAMLESS':
      case 'pl':
        return aData.replace(/[?#].*$/, '');

      case 'ENC':
        return encodeURIComponent(aData);

      case 'RAW':
        return aData;
    }

    return '';
  }

  return {
    create
  };
})();

/**
 * XMLHttpRequest handler.
 */
const RequestHandler = (function() {
  // The minimum time for waiting a request.
  //
  // @value {integer} [milliseconds > 0]
  const kMinCooldownTime = 2000;

  // The request time for each host.
  const RequestTime = {
    mRequestTimeList: {},

    update(aURL) {
      // TODO: Validation check for URL.
      // WORKAROUND: Set a valid |URL| of |kPreset|.
      let host = (/^https?:\/\/([^\/]+)/.exec(aURL))[1];

      let lastRequestTime = this.mRequestTimeList[host] || 0;
      let requestTime = Date.now();
      let remainTime = kMinCooldownTime - (requestTime - lastRequestTime);

      this.mRequestTimeList[host] = requestTime;

      // Returns the cooldown time for the next request.
      return Math.max(remainTime, 0)
    }
  };

  function request(aURL, aOption) {
    let cooldownTime = RequestTime.update(aURL);

    // TODO: Implement a canceller.
    setTimeout(() => {
      aOption.timeout = kMinCooldownTime;

      doRequest(aURL, aOption);
    }, cooldownTime);
  }

  /**
   * XMLHttpRequest wrapper function.
   *
   * @param aURL {string}
   *   A URL string to request data.
   * @param aParams {hash}
   *   timeout: {integer} [milliseconds > 0]
   *     A timeout value while waiting for a response.
   *   onLoad: {function}
   *     A function handle to call when the request is completed.
   *     @param aResponseText {string}
   *   onError: {function} [optional]
   *     A function handle to call when the operation fails.
   *     @param aError {Error}
   */
  function doRequest(aURL, aOption) {
    let xhr = new XMLHttpRequest();

    // No error dialogs.
    xhr.mozBackgroundRequest = true;

    // Asynchronous request.
    xhr.open('GET', aURL, true);

    // Doesn't send cookies and prevents any cache.
    xhr.channel.loadFlags =
      Ci.nsIChannel.LOAD_ANONYMOUS |
      Ci.nsIChannel.LOAD_BYPASS_CACHE |
      Ci.nsIChannel.INHIBIT_CACHING;

    xhr.timeout = aOption.timeout;

    xhr.ontimeout = () => {
      if (aOption.onError) {
        aOption.onError(Error('Timeout'));
      }
    };

    xhr.onerror = () => {
      if (aOption.onError) {
        aOption.onError(Error(xhr.statusText));
      }
    };

    xhr.onload = () => {
      try {
        if (xhr.status === 200) {
          if (aOption.onLoad) {
            aOption.onLoad(xhr.responseText);
          }

          return;
        }
      }
      catch (ex) {}

      if (aOption.onError) {
        aOption.onError(Error(xhr.statusText));
      }
    };

    xhr.send(null);
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
 *     Data to complete the URL of the preset.
 *     @note Set the replaced values in the order in Array[] when a URL has
 *     multiple aliases.
 *   tabOption: {hash} [optional]
 *     Options for a new tab.
 *     @see |ucjsUtil::openTab|
 *     e.g. |tabOption: {inBackground: true}| opens tab in background.
 *
 * @usage window.ucjsWebService.open(aParams);
 */
function open(aParams) {
  let result = getResult(aParams, 'open');

  if (!result) {
    return;
  }

  let tab = openTab(result.URL, result.tabOption);

  // TODO: Observe the document loaded to manage a form.
  // WORKAROUND:
  // 1.Uses an easy delay for a selected tab.
  // 2.The URL is just only opened for a background tab.
  // XXX: I'm unwilling to handle an observer for this.
  if (tab.selected && result.form) {
    setTimeout(inputAndSubmit, 500, result.form, result.data);
  }
}

/**
 * Gets the response of request to the service.
 *
 * @param aParams {hash}
 *   name: {string}
 *     A preset name.
 *   data: {string|number|[string|number]} [optional]
 *     Data to complete the URL of the preset.
 *     @note Set the replaced values in the order in Array[] when the URL has
 *     multiple aliases.
 *   onLoad: {function}
 *     A function handle to call when the load is completed.
 *     @param aResponseText {string}
 *   onError: {function} [optional]
 *     A function handle to call when the operation fails.
 *     @param aError {Error}
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
    onError(aError) {
      if (result.onError) {
        result.onError(aError);
      }
    }
  };

  RequestHandler.request(result.URL, options);
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
  if (!result.URL) {
    throw Error('aPreset.URL is empty');
  }

  if (result.data) {
    result.URL = AliasFixup.create(result.URL, result.data);
  }

  return result;
}

function inputAndSubmit(aForm, aData) {
  let form = $X1(aForm.form),
      input = $X1(aForm.input);

  if (form && input) {
    input.value = aData;
    form.submit();
  }
}

function updateFormInput(aData, aOption = {}) {
  const kInputType = {
    exclude: './/input[@type="password"]|.//textarea',
    include: './/input[not(@disabled or @hidden or @readonly) and @type="text"]'
  };

  if (!aData) {
    return;
  }

  let {
    lessData,
    doSubmit
  } = aOption;

  let textForm = null,
      textInput = null;

  [...gBrowser.contentDocument.forms].some((form) => {
    let input =
      !$X1(kInputType.exclude, form) &&
      $X1(kInputType.include, form);

    if (input) {
      textForm = form;
      textInput = input;

      return true;
    }

    return false;
  });

  if (!textInput || !textInput.value) {
    return;
  }

  textInput.value +=
    (lessData ? ' -' : ' ') + '"' + aData.trim().replace(/\s+/g, ' ') + '"';

  if (doSubmit) {
    textForm.submit();
  }
  else {
    textInput.focus();
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
