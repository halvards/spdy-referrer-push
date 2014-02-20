var http = require('http')
  , urlParse = require('url').parse
  , debug = require('debug')('spdy-referrer-push')
  , expressRequest = require('express/lib/request')
  , expressResponse = require('express/lib/response');

var pushRegexps = [
  /.*\.css/,
  /.*\.js/,
  /.*\.png/,
  /.*\.jpeg/,
  /.*\.jpg/,
  /.*\.gif/,
  /.*\.ico/,
  /.*\.woff/
];
var pushContentTypes = [
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "image/png",
  "image/x-png",
  "image/jpeg",
  "image/gif",
  "image/x-icon",
  "image/vnd.microsoft.icon"
];
var maxAssociatedResources = 32;
var referrerPushPeriod = 5000; // millis
var mainResources = {};

var isPushResource = function(url) {
  var result = false;
  pushRegexps.forEach(function (pushRegexp) {
    if (pushRegexp.test(url)) {
      result = true;
    }
  });
  return result;
};

var isMainResource = function(url) {
  return !isPushResource(url);
}

var getOrCreateMainResource = function(url) {
  if (!mainResources[url]) {
    var firstPushResourceAdded = -1;
    var pushResources = [];
    mainResources[url] = {
      name: url,
      firstPushResourceAdded: firstPushResourceAdded,
      getPushResources: function() {
        return pushResources.slice(0);
      },
      addPushResource: function(pushResourceUrl, host, referrer) {
        if (firstPushResourceAdded === -1) {
          firstPushResourceAdded = Date.now();
        }
        var delay = Date.now() - firstPushResourceAdded;
        if (urlParse(referrer).host !== host) {
          debug("Skipped store of push metadata " + pushResourceUrl + " for main resource " + url + ": Hostname: " + host + " doesn't match referrer " + referrer);
          return false;
        }
        if (pushResources.length >= maxAssociatedResources) {
          debug("Skipped store of push metadata " + pushResourceUrl + " for main resource " + url + ": Max associated resources (" + maxAssociatedResources + ") reached");
          return false;
        }
        if (delay > referrerPushPeriod) {
          debug("Skipped store of push metadata " + pushResourceUrl + " for main resource " + url + ": Delay " + delay + "ms longer than referrerPushPeriod (" + referrerPushPeriod + "ms)");
          return false;
        }
        debug("Adding: " + pushResourceUrl + " to: " + url + " with delay: " + delay + "ms.");
        pushResources.push(pushResourceUrl);
        debug("Push resources for " + url + " are now " + pushResources);
        return true;
      }
    };
  }
  return mainResources[url];
};

var getContentType = function(url) {
  if (/.*\.css/.test(url)) {
    return 'text/css';
  }
  if (/.*\.js/.test(url)) {
    return 'application/javascript';
  }
  if (/.*\.png/.test(url)) {
    return 'image/png';
  }
  if (/.*\.jpe?g/.test(url)) {
    return 'image/jpeg';
  }
  if (/.*\.gif/.test(url)) {
    return 'image/gif';
  }
  if (/.*\.ico/.test(url)) {
    return 'image/x-icon';
  }
  if (/.*\.html?/.test(url)) {
    return 'text/html';
  }
  if (/.*\.json/.test(url)) {
    return 'application/json';
  }
  if (/.*\.txt/.test(url)) {
    return 'text/plain';
  }
  if (/.*\.woff/.test(url)) {
    return 'application/octet-stream';
  }
  return '';
};

var push = function(req, res, url) {
  debug("Server push " + url);
  var headers = { 'content-type': getContentType(url) };
  var internalRequest = { __proto__: expressRequest, app: req.app };
  internalRequest.socket = { remoteAddress: '127.0.0.1' };  // for logging middleware
  internalRequest.method = 'GET';
  internalRequest.url = url;
  internalRequest.params = {};
  internalRequest.headers = {};
  internalRequest.body = {};
  internalRequest.query = {};
  internalRequest.files = {};
  internalRequest.isInternalRequest = true;
  var internalResponse = { __proto__: expressResponse, app: res.app };
//  var internalResponse = new http.ServerResponse(internalRequest);
//  internalResponse.__proto__ = expressResponse;
//  internalResponse.app = res.app;
  internalResponse.cookies = {};
  var stream = res.push(url, headers);
  internalResponse.write = function(data) {
    stream.write(data);
  };
  internalResponse.end = function(data) {
    stream.end(data);
  };
//  internalResponse.pipe(stream);
  req.app.handle(internalRequest, internalResponse, function(error) {
    debug("Error when pushing resource [" + url + "]: " + error.message);
  });
};

exports.referrer = function() {
  return function(req, res, next) {
    if (req.isInternalRequest) {
      return next();
    }
    if (!res.push && typeof(a) !== 'function') {
      debug("Not handling SPDY server push for URL " + req.url + " because req.push does not exist or is not a function");
      return next();
    }
    if (req.method !== 'GET') {
      debug("Not handling SPDY server push for URL " + req.url + " because the HTTP method is " + req.method);
      return next();
    }
    if (req.headers['if-modified-since']) {
      debug("Not handling SPDY server push for URL " + req.url + " because If-Modified-Since header is present");
      return next();
    }
    debug("Handling server push for " + req.url);
    if (isMainResource(req.url)) {
      debug("URL [" + req.url + "] is a main resource for SPDY server push");
      var mainResource = getOrCreateMainResource(req.url);
      var pushResources = mainResource.getPushResources();
      debug("Pushing resources for URL [" + req.url + "]: " + pushResources);
      pushResources.forEach(function (pushResourceUrl) {
        push(req, res, pushResourceUrl);
      });
    } else if (isPushResource(req.url)) {
      var referrer = req.headers['referer'];
      debug("URL [" + req.url + "] is a push resource for SPDY server push with referrer " + referrer);
      if (referrer) {
        var mainResource = getOrCreateMainResource(urlParse(referrer).path);
        var pushResources = mainResource.getPushResources();
        if (pushResources.indexOf(req.url) === -1) {
          debug("Push resource " + req.url + " not already added for main resource " + referrer);
          mainResource.addPushResource(req.url, req.headers['host'], referrer);
        } else {
          debug("Push resource " + req.url + " already added for main resource " + referrer + ", now pushing push resources for " + req.url);
          getOrCreateMainResource(req.url).getPushResources().forEach(function (pushResourceUrl) {
            push(req, res, pushResourceUrl);
          });
        }
      }
    }

    return next();
  };
};

