// ==UserScript==
// @name        WebService.uc.js
// @description Web services handler.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @usage Access to functions through the global scope,
// |window.ucjsWebService.XXX|.


var ucjsWebService = (function(window, undefined) {


"use strict";


/**
 * Imports
 */
const {
  getFirstNodeByXPath: $X1,
  getNodesByXPath: $XA,
  openTab
} = window.ucjsUtil;

// for debug
function log(aMsg) {
  return window.ucjsUtil.logMessage('WebService.uc.js', aMsg);
}

/**
 * Preset list
 * @value {hash[]}
 *   type: {string}
 *     'get': requests data
 *     'open': opens tab
 *   name: {string} a preset name
 *   URL: {string} URL that opens
 *     pass the data by alias. see |AliasFixup|
 *   form: {hash} [optional; only with type 'open']
 *     form: {XPath of <form>}
 *     input: {XPath of <input>}
 *   parse: {function} [optional; only with type 'get'] parses the response
 *   from HTTP request
 *     @param aValue {string} a response text of request
 *     @param aStatus {number} a response status of request
 */
const kPresets = [
  {
    type: 'get',
    name: 'HatenaBookmarkCount',
    // @see http://developer.hatena.ne.jp/ja/documents/bookmark/apis/getcount
    URL: 'http://api.b.st-hatena.com/entry.count?url=%ENC%',
    parse: function(aValue, aStatus) {
      if (aStatus === 200) {
        return aValue || 0;
      }
      return null;
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
    form: {form: 'id("formTrans")', input: 'id("before")'}
  }
];

/**
 * Handler of fixing up a alias with the data
 * @return {hash}
 *   @member create {function}
 *
 * [Aliases]
 * %RAW% : data itself
 * %ENC% : with URI encoded
 * %SCHEMELESS%, %sl% : without the URL scheme
 * %PARAMLESS%, %pl% : without the URL parameter
 *
 * The aliases can be combined by '|'
 * e.g. %SCHEMELESS|ENC% : a data that is trimmed the scheme and then URI
 * encoded. (the multiple aliases is applied in the order of settings)
 */
var AliasFixup = (function() {
  const kAliasSplitter = '|';
  const kAliasPattern = RegExp('%([a-z_' + kAliasSplitter + ']+)%', 'ig');

  function create(aText, aData) {
    let data = !Array.isArray(aData) ? [aData] : aData.concat();

    return aText.replace(kAliasPattern, function(match, alias) {
      if (!data.length) {
        return match;
      }

      let rv = String(data.shift());
      alias.split(kAliasSplitter).forEach(function(modifier) {
        rv = fixupModifier(rv, modifier);
      });
      return rv;
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
  // @value {integer} milliseconds > 0
  const kMinCooldownTime = 2000;

  // the request time for each host
  const RequestTime = {
    mRequestTimeList: {},

    update: function(aURL) {
      // @note Supposing that |URL| of a item of kPreset is valid.
      let host = (/^https?:\/\/([^\/]+)/.exec(aURL))[1];

      let lastRequestTime = this.mRequestTimeList[host] || 0;
      let requestTime = Date.now();
      let remainTime = kMinCooldownTime - (requestTime - lastRequestTime);

      this.mRequestTimeList[host] = requestTime;

      // returns the cooldown time for the next request
      return Math.max(remainTime, 0)
    }
  };

  function request(aURL, aFunc) {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', aURL, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        try {
          aFunc(xhr.responseText, xhr.status);
        } catch (ex) {
          // do nothing
        } finally {
          xhr.onreadystatechange = null;
          xhr = null;
        }
      }
    };

    let cooldownTime = RequestTime.update(aURL);

    setTimeout(function() {
      xhr.send(null);
    }, cooldownTime);
  }

  return {
    request: request
  };
})();


//********** Functions

/**
 * Opens a new tab with the service
 * @usage window.ucjsWebService.open(aParams);
 * @param aParams {hash}
 *   name: {string} a preset name
 *   data: {string|number|[string|number]} [optional] the passed data
 *     @note Set the replaced values in the order in Array[] when a URL has
 *     multiple aliases.
 *   tabOption: {hash} [optional] the option for a new tab
 *     @see |ucjsUtil::openTab|
 *     e.g. |tabOption: {inBackground: true}| opens tab in background
 */
function open(aParams) {
  var result = getResult(aParams, 'open');
  if (!result) {
    return;
  }

  let tab = openTab(result.URL, result.tabOption);

  // TODO: Observe the document loaded to manage a form.
  // WORKAROUND: Uses an easy delay for a selected tab. URL is only opened for
  // a background tab.
  // XXX: I'm unwilling to handle an observer for this.
  if (tab.selected && result.form) {
    setTimeout(inputAndSubmit, 500, result.form, result.data);
  }
}

/**
 * Gets the response of request to the service
 * @usage window.ucjsWebService.get(aParams);
 * @param aParams {hash}
 *   name: {string} a preset name
 *   data: {string|number|[string|number]} [optional] the passed data
 *     @note Set the replaced values in the order in Array[] when a URL has
 *     multiple aliases.
 *   callback: {function} a method to handle a response value
 *     @param response {string} a response text of request
 */
function get(aParams) {
  var result = getResult(aParams, 'get');
  if (!result) {
    return;
  }

  RequestHandler.request(
    result.URL,
    function(response, status) {
      if (result.parse) {
        response = result.parse(response, status);
      }
      result.callback(response);
    }
  );
}

function getResult(aParams, aType) {
  if (!aParams.name) {
    throw Error('aParams.name is empty');
  }

  var result = null;

  kPresets.some(function(preset) {
    if (preset.type === aType && preset.name === aParams.name) {
      result = evaluate(aParams, preset);
      return true;
    }
    return false;
  });

  return result;
}

function evaluate(aParams, aPreset) {
  var result = {};

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
  var form = $X1(aForm.form), input = $X1(aForm.input);

  if (form && input) {
    input.value = aData;
    form.submit();
  }
}

function updateFormInput(aData, aOption) {
  const kInputType = {
    exclude: 'descendant::input[@type="password"]|descendant::textarea',
    include: 'descendant::input[not(@disabled or @hidden or @readonly) and @type="text"]'
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
    let inputs =
      !$X1(kInputType.exclude, form) &&
      $XA(kInputType.include, form);

    if (inputs && inputs.length === 1) {
      textForm = form;
      textInput = inputs[0];
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


//********** Exports

return {
  open: open,
  get: get,
  updateFormInput: updateFormInput
};


})(this);
