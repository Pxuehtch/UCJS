// ==UserScript==
// @name        WebService.uc.js
// @description Web services handler.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @usage Access to functions through the global scope, |ucjsWebService.XXX|.


var ucjsWebService = (function(window, undefined) {


"use strict";


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
var mRequestHandler = (function() {
  // The minimum time for waiting a request
  // @value {integer} milliseconds > 0
  const kMinCooldownTime = 2000;

  var lastRequestTime = Date.now();

  function request(aURL, aFunc) {
    var xhr = new XMLHttpRequest();
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

    var remainTime = kMinCooldownTime - (Date.now() - lastRequestTime);
    var cooldownTime = Math.max(remainTime, 0)

    setTimeout(function() {
      lastRequestTime = Date.now();
      xhr.send(null);
    }, cooldownTime);
  }

  return {
    request: request
  };
})();


//********** Functions

/**
 * @usage ucjsWebService.open(aOption);
 * @param aOption {hash}
 *   name: {string} a preset name
 *   data: {string|number|[string|number]} [optional] the passed data
 *     @note Set the replaced values in the order in Array[] when a URL has
 *     multiple aliases.
 */
function open(aOption) {
  var result = getResult(aOption, 'open');
  if (!result) {
    return;
  }

  openTab(result.URL);

  if (result.form) {
    setTimeout(inputAndSubmit, 500, result.form, result.data);
  }
}

/**
 * @usage ucjsWebService.get(aOption);
 * @param aOption {hash}
 *   name: {string} a preset name
 *   data: {string|number|[string|number]} [optional] the passed data
 *     @note Set the replaced values in the order in Array[] when a URL has
 *     multiple aliases.
 *   callback: {function} a method to get a response value
 *     @param response {string} a response text of request
 */
function get(aOption) {
  var result = getResult(aOption, 'get');
  if (!result) {
    return;
  }

  mRequestHandler.request(
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
  if (!aOption.name) {
    throw 'aOption.name is empty';
  }

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

  // copy the preset
  for (let key in aPreset) {
    result[key] = aPreset[key];
  }

  // add or overwrite the option
  for (let key in aOption) {
    if (!(key in result)) {
      result[key] = aOption[key];
    }
  }

  result.URL = buildURL(result.URL, result.data);

  return result;
}

function buildURL(aURL, aData) {
  if (!aURL) {
    throw 'aURL is empty';
  }
  if (!aData) {
    return aURL;
  }

  return AliasFixup.create(aURL, aData);
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

  var textForm = null, textInput = null;
  Array.some(window.content.document.forms, function(form) {
    var inputs = !$X1(kAvoidInput, form) && $XA(kTextInput, form);
    if (inputs && inputs.length === 1) {
      textForm = form;
      textInput = inputs[0];
      return true;
    }
    return false
  });

  if (!textInput || !textInput.value) {
    return false;
  }

  textInput.value +=
    (aLess ? ' -' : ' ') + '"' + aData.trim().replace(/\s+/g, ' ') + '"';

  if (aSubmit) {
    textForm.submit();
  } else {
    textInput.focus();
  }
  return true;
}


//********** Imports

function openTab(aURL)
  window.ucjsUtil.openTab(aURL, {inBackground: false});

function $X1(aXPath, aContext)
  window.ucjsUtil.getFirstNodeByXPath(aXPath, aContext);

function $XA(aXPath, aContext)
  window.ucjsUtil.getNodesByXPath(aXPath, aContext);

function log(aMsg)
  window.ucjsUtil.logMessage('WebService.uc.js', aMsg);


//********** Exports

return {
  open: open,
  get: get,
  reSubmitLess:
    function(aData, aSubmit) reSubmit(aData, aSubmit, true),
  reSubmitMore:
    function(aData, aSubmit) reSubmit(aData, aSubmit, false)
};


})(this);
