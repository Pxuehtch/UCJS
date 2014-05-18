// ==UserScript==
// @name        WebService.uc.js
// @description Helper handler for using the web services
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @usage access to functions through the global scope;
// |window.ucjsWebService.XXX|


const ucjsWebService = (function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  XPCOM: {
    getModule
  },
  getFirstNodeByXPath: $X1,
  openTab
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('WebService.uc.js', aMsg);
}

/**
 * Preset list
 *
 * @value {hash[]}
 *   type: {string}
 *     'get' - requests data
 *     'open' - opens tab
 *   name: {string}
 *     a preset name
 *   URL: {string}
 *     URL that opens
 *     @note pass the data by alias
 *     @see |AliasFixup|
 *   form: {hash} [optional; only with type 'open']
 *     form: {XPath of <form>}
 *     input: {XPath of <input>}
 *   parse: {function} [optional; only with type 'get']
 *     a function to parse the response text when the load is complete
 *     @param aResponseText {string}
 *     @param aXHR {nsIXMLHttpRequest}
 */
const kPresets = [
  {
    type: 'get',
    name: 'HatenaBookmarkCounter',
    // @see http://developer.hatena.ne.jp/ja/documents/bookmark/apis/getcount
    URL: 'http://api.b.st-hatena.com/entry.count?url=%ENC%',
    parse: function(aResponseText) {
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
 * Handler of fixing up an alias with the data
 *
 * @return {hash}
 *   @member create {function}
 *
 * [aliases]
 * %RAW% : data itself
 * %ENC% : with URI encoded
 * %SCHEMELESS%, %sl% : without the URL scheme
 * %PARAMLESS%, %pl% : without the URL parameter
 *
 * @note aliases can be combined by '|';
 * e.g. %SCHEMELESS|ENC% : a data that is trimmed the scheme and then URI
 * encoded (the multiple aliases is applied in the order of settings)
 */
const AliasFixup = (function() {
  const kAliasSplitter = '|';
  const kAliasPattern = RegExp('%([a-z_' + kAliasSplitter + ']+)%', 'ig');

  function create(aText, aData) {
    let dataArray = !Array.isArray(aData) ? [aData] : aData.concat();

    return aText.replace(kAliasPattern, (match, alias) => {
      if (!dataArray.length) {
        return match;
      }

      let data = String(dataArray.shift());

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
    create: create
  };
})();

/**
 * XMLHttpRequest handler
 */
const RequestHandler = (function() {
  // The minimum time for waiting a request
  //
  // @value {integer} [milliseconds > 0]
  const kMinCooldownTime = 2000;

  // the request time for each host
  const RequestTime = {
    mRequestTimeList: {},

    update: function(aURL) {
      // @note no error checks due to supposing that |URL| of an item of
      // |kPreset| is valid
      let host = (/^https?:\/\/([^\/]+)/.exec(aURL))[1];

      let lastRequestTime = this.mRequestTimeList[host] || 0;
      let requestTime = Date.now();
      let remainTime = kMinCooldownTime - (requestTime - lastRequestTime);

      this.mRequestTimeList[host] = requestTime;

      // returns the cooldown time for the next request
      return Math.max(remainTime, 0)
    }
  };

  function request(aURL, aOption) {
    let cooldownTime = RequestTime.update(aURL);

    // TODO: implement a canceller
    setTimeout(() => {
      let {httpRequest} = getModule('resource://gre/modules/Http.jsm');

      httpRequest(aURL, aOption);
    }, cooldownTime);
  }

  return {
    request: request
  };
})();

/**
 * Opens a new tab with the service
 *
 * @param aParams {hash}
 *   name: {string}
 *     a preset name
 *   data: {string|number|[string|number]} [optional]
 *     data to complete the URL of the preset
 *     @note set the replaced values in the order in Array[] when a URL has
 *     multiple aliases
 *   tabOption: {hash} [optional]
 *     options for a new tab
 *     @see |ucjsUtil::openTab|
 *     e.g. |tabOption: {inBackground: true}| opens tab in background
 *
 * @usage window.ucjsWebService.open(aParams);
 */
function open(aParams) {
  let result = getResult(aParams, 'open');

  if (!result) {
    return;
  }

  let tab = openTab(result.URL, result.tabOption);

  // TODO: observe the document loaded to manage a form
  // WORKAROUND:
  // 1.uses an easy delay for a selected tab
  // 2.the URL is only opened for a background tab
  // XXX: I'm unwilling to handle an observer for this
  if (tab.selected && result.form) {
    setTimeout(inputAndSubmit, 500, result.form, result.data);
  }
}

/**
 * Gets the response of request to the service
 *
 * @param aParams {hash}
 *   name: {string}
 *     a preset name
 *   data: {string|number|[string|number]} [optional]
 *     data to complete the URL of the preset
 *     @note set the replaced values in the order in Array[] when the URL has
 *     multiple aliases
 *   onLoad: {function}
 *     a function handle to call when the load is complete
 *     @param aResponseText {string}
 *     @param aXHR {nsIXMLHttpRequest}
 *   onError: {function} [optional]
 *     a function handle to call when an error occcurs
 *     @param aErrorText {string}
 *     @param aResponseText {string}
 *     @param aXHR {nsIXMLHttpRequest}
 *
 * @usage window.ucjsWebService.get(aParams);
 */
function get(aParams) {
  let result = getResult(aParams, 'get');

  if (!result) {
    return;
  }

  let options = {
    onLoad: function(aResponseText, aXHR) {
      if (result.parse) {
        aResponseText = result.parse(aResponseText, aXHR);
      }

      if (result.onLoad) {
        result.onLoad(aResponseText, aXHR);
      }
    },
    onError: function(aErrorText, aResponseText, aXHR) {
      if (result.onError) {
        result.onError(aErrorText, aResponseText, aXHR);
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

  // copy the preset
  for (let key in aPreset) {
    result[key] = aPreset[key];
  }

  // add the option
  for (let key in aParams) {
    if (!(key in result)) {
      result[key] = aParams[key];
    }
  }

  // build a URL
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

function updateFormInput(aData, aOption) {
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
  } = aOption || {};

  let textForm = null,
      textInput = null;

  Array.some(window.content.document.forms, (form) => {
    let input =
      !$X1(kInputType.exclude, form) &&
      $X1(kInputType.include, form);

    if (input) {
      textForm = form;
      textInput = input;
      return true;
    }
    return false
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
  open: open,
  get: get,
  updateFormInput: updateFormInput
};


})(this);
