// ==UserScript==
// @name        WebService.uc.js
// @description Web services handler.
// @include     main
// ==/UserScript==

// @require Util.uc.js
// @usage Access to functions through global functions (ucjsWebService.XXX).


var ucjsWebService = (function() {


"use strict";


// Preferences.

/**
 * Presets of service.
 * @value {hash}
 *   {
 *     type: 'get' - requests values.
 *           'open' - opens tab.
 *     name: 'preset name',
 *     URL: 'URL of service'
 *       When alias %...% is included, aOption.data of get()/open() is required;
 *         %ESC% will be replaced with encoded data for URL.
 *         %RAW% with data itself.
 *     form: {form: <form> XPath, input: <input> XPath}
 *       (OPTIONAL, Only with type 'open')
 *     parse: function(value, status)
 *       (OPTIONAL, Only with type 'get')
 *       Parses response from HTTP request.
 *   }
 */
const kPresets = [
  {
    type: 'get',
    name: 'HatenaBookmarkCount',
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

const kURLAlias = {
  '%ESC%': function(aValue) encodeURIComponent(aValue),
  '%RAW%': function(aValue) aValue
};


/**
 * XMLHttpRequest handler.
 */
var mXHRHandler = (function() {
  const kCooldownInterval = 1000;

  var lastRequestTime = Date.now();

  function request(aURL, aFunc) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', aURL, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        try {
          aFunc(xhr.responseText, xhr.status);
        } catch (e) {
          // nothing.
        } finally {
          xhr.onreadystatechange = null;
          xhr = null;
        }
      }
    };

    setTimeout(function() {
      lastRequestTime = Date.now();
      xhr.send(null);
    }, (Date.now() - lastRequestTime < kCooldownInterval) ? kCooldownInterval : 0);
  }

  return {
    request: request
  };
})();


// Functions.

/**
 * ucjsWebService.open(aOption);
 * @param aOption {hash}
 *   {
 *     name: 'preset name'
 *     data (OPTIONAL): value or [values sequentially replace alias]
 *   }
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
 * ucjsWebService.get(aOption);
 * @param aOption {hash}
 *   {
 *     name: 'preset name'
 *     data (OPTIONAL): value or [values sequentially replace alias]
 *     callback: function(response) Method to get response values.
 *   }
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
    throw 'aOption.name is empty.';

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
    (key in result) || (result[key] = aOption[key]);
  }

  result.URL = buildURL(result.URL, result.data);

  return result;
}

function buildURL(aURL, aData) {
  if (!aURL)
    throw 'aURL is empty.';
  if (!aData)
    return aURL;

  var data = (typeof aData === 'string') ? [aData] : aData;

  var split = aURL.split(RegExp('(' + [key for (key in kURLAlias)].join('|') + ')'));
  if (split.length === 1)
    return aURL;

  for (let i = 1, len = split.length; i < len; i = i + 2) {
    if (!data.length)
      break;
    split[i] = kURLAlias[split[i]](data.shift());
  }

  return split.join('');
}

function inputAndSubmit(aForm, aData) {
  var form = $X1(aForm.form), input = $X1(aForm.input);

  if (form && input) {
    input.value = aData;
    form.submit();
  }
}

function reSubmit(aData, aSubmit, aLess) {
  const kAvoidInput = 'descendant::input[@type="password"]|descendant::textarea',
        kTextInput = 'descendant::input[not(@disabled or @hidden or @readonly) and @type="text"]';

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

  input.value += (aLess ? ' -' : ' ') + '"' + aData.replace(/\s+/g, ' ').trim() + '"';
  if (aSubmit) {
    form.submit();
  } else {
    input.focus();
  }
  return true;
}


// Utilities.

function openTab(aURL)
  ucjsUtil.openTab(aURL, {inBackground: false});

function $X1(aXPath, aContext)
  ucjsUtil.getFirstNodeByXPath(aXPath, aContext);

function $XA(aXPath, aContext)
  ucjsUtil.getNodesByXPath(aXPath, aContext);

function log(aMsg)
  ucjsUtil.logMessage('WebService.uc.js', aMsg);


// Exports.

return {
  open: open,
  get: get,
  reSubmitLess: function(aData, aSubmit) reSubmit(aData, aSubmit, true),
  reSubmitMore: function(aData, aSubmit) reSubmit(aData, aSubmit, false)
};


})();
