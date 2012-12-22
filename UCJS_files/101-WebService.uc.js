// ==UserScript==
// @name        WebService.uc.js
// @description Web services handler.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @usage Access to functions through the global scope, |ucjsWebService.XXX|.


var ucjsWebService = (function() {


"use strict";


//********** Preferences

/**
 * Presets of service
 * @value {hash}
 *   type: {string}
 *     'get': requests data
 *     'open': opens tab
 *   name: {string} preset name
 *   URL: {string} URL of the service
 *     alias %...% is available (e.g. %ESC% or %NoScheme|ESC%)
 *     @see kURLAlias
 *   form: {hash} [optional; only with type 'open']
 *     form: {XPath of <form>}
 *     input: {XPath of <input>}
 *   parse: {function} [optional; only with type 'get'] parses the response
 *   from HTTP request
 *     @param value {string} response text of request
 *     @param status {number} response status of request
 */
const kPresets = [
  {
    type: 'get',
    name: 'HatenaBookmarkCount',
    // @see http://developer.hatena.ne.jp/ja/documents/bookmark/apis/getcount
    URL: 'http://api.b.st-hatena.com/entry.count?url=%ESC%',
    parse: function(value, status) {
      if (status === 200) {
        return value || 0;
      }
      return null;
    }
  },
  {
    type: 'open',
    name: 'GoogleSearch',
    URL: 'https://www.google.co.jp/search?q=%ESC%'
  },
  {
    type: 'open',
    name: 'GoogleTranslation',
    URL: 'http://translate.google.co.jp/#auto|ja|%ESC%'
  },
  {
    type: 'open',
    name: 'Eijiro',
    URL: 'http://eow.alc.co.jp/%ESC%/UTF-8/'
  },
  {
    type: 'open',
    name: 'Weblio',
    URL: 'http://ejje.weblio.jp/content/%ESC%'
  },
  {
    type: 'open',
    name: 'ExciteTranslationEnToJp',
    URL: 'http://www.excite.co.jp/world/english/',
    form: {form: 'id("formTrans")', input: 'id("before")'}
  }
];

/**
 * Alias for URL of kPresets
 * @note applied in this order
 */
const kURLAlias = {
  'NoScheme':
    function(aValue) aValue.replace(/^https?:\/\//, ''),
  'NoParameter':
    function(aValue) aValue.replace(/[?#].*$/, ''),
  'ESC':
    function(aValue) encodeURIComponent(aValue),
  'RAW':
    function(aValue) aValue
};


//********** Functions

/**
 * XMLHttpRequest handler
 */
var mXHRHandler = (function() {
  const kCooldownTime = 1000;

  var lastRequestTime = Date.now();

  function request(aURL, aFunc) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', aURL, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        try {
          aFunc(xhr.responseText, xhr.status);
        } catch (e) {
          // nothing
        } finally {
          xhr.onreadystatechange = null;
          xhr = null;
        }
      }
    };

    var cooldownTime = (Date.now() - lastRequestTime < kCooldownTime) ?
      kCooldownTime : 0;

    setTimeout(function() {
      lastRequestTime = Date.now();
      xhr.send(null);
    }, cooldownTime);
  }

  return {
    request: request
  };
})();

/**
 * @usage ucjsWebService.open(aOption);
 * @param aOption {hash}
 *   name: {string} preset name
 *   data: {string|number|[string|number]} [optional] the passed data
 *     @note Set the replaced values in the order in Array[] when a URL has
 *     multiple aliases.
 */
function open(aOption) {
  var result = getResult(aOption, 'open');
  if (!result)
    return;

  openTab(result.URL);

  if (result.form) {
    setTimeout(inputAndSubmit, 500, result.form, result.data);
  }
}

/**
 * @usage ucjsWebService.get(aOption);
 * @param aOption {hash}
 *   name: {string} preset name
 *   data: {string|number|[string|number]} [optional] the passed data
 *     @note Set the replaced values in the order in Array[] when a URL has
 *     multiple aliases.
 *   callback: {function} method to get a response value
 *     @param response {string} response text of request
 */
function get(aOption) {
  var result = getResult(aOption, 'get');
  if (!result)
    return;

  mXHRHandler.request(
    result.URL,
    function(response, status) {
      if (result.parse) {
        response = result.parse(response, status);
      }
      result.callback(response);
    }
  );
}

function getResult(aOption, aType) {
  if (!aOption.name)
    throw 'aOption.name is empty';

  var result = null;

  kPresets.some(function(preset) {
    if (preset.type === aType && preset.name === aOption.name) {
      result = evaluate(aOption, preset);
      return true;
    }
    return false;
  });

  return result;
}

function evaluate(aOption, aPreset) {
  var result = {};

  for (let key in aPreset) {
    result[key] = aPreset[key];
  }
  for (let key in aOption) {
    if (!(key in result)) {
      result[key] = aOption[key];
    }
  }

  result.URL = buildURL(result.URL, result.data);

  return result;
}

function buildURL(aURL, aData) {
  if (!aURL)
    throw 'aURL is empty';
  if (!aData)
    return aURL;

  var data = !Array.isArray(aData) ? [aData] : aData.concat();

  return aURL.replace(/%([\w|]+)%/g, function($0, $1) {
    if (!data.length)
      return $0;

    var value = data.shift() + '';
    var aliases = $1.split('|');

    for (let alias in kURLAlias) {
      if (aliases.indexOf(alias) > -1) {
        value = kURLAlias[alias](value);
      }
    }

    return value;
  });
}

function inputAndSubmit(aForm, aData) {
  var form = $X1(aForm.form), input = $X1(aForm.input);

  if (form && input) {
    input.value = aData;
    form.submit();
  }
}

function reSubmit(aData, aSubmit, aLess) {
  const kAvoidInput =
    'descendant::input[@type="password"]|descendant::textarea';
  const kTextInput =
    'descendant::input[not(@disabled or @hidden or @readonly) and @type="text"]';

  var form = null, input = null;
  Array.some(content.document.forms, function(f) {
    var inputs = !$X1(kAvoidInput, f) && $XA(kTextInput, f);
    if (inputs && inputs.length === 1) {
      form = f;
      input = inputs[0];
      return true;
    }
    return false
  });

  if (!input || !input.value)
    return false;

  input.value +=
    (aLess ? ' -' : ' ') + '"' + aData.replace(/\s+/g, ' ').trim() + '"';

  if (aSubmit) {
    form.submit();
  } else {
    input.focus();
  }
  return true;
}


//********** Utilities

function openTab(aURL)
  ucjsUtil.openTab(aURL, {inBackground: false});

function $X1(aXPath, aContext)
  ucjsUtil.getFirstNodeByXPath(aXPath, aContext);

function $XA(aXPath, aContext)
  ucjsUtil.getNodesByXPath(aXPath, aContext);

function log(aMsg)
  ucjsUtil.logMessage('WebService.uc.js', aMsg);


//********** Exports

return {
  open: open,
  get: get,
  reSubmitLess:
    function(aData, aSubmit) reSubmit(aData, aSubmit, true),
  reSubmitMore:
    function(aData, aSubmit) reSubmit(aData, aSubmit, false)
};


})();
