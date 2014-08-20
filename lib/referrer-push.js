var http = require('http')
  , urlParse = require('url').parse
  , debug = require('debug')('spdy-referrer-push')
  , expressRequest = require('express/lib/request')
  , expressResponse = require('express/lib/response');

var contentTypes = [
  {regex: /\.css$/, type: 'text/css'},
  {regex: /\.js$/, type: 'application/javascript'},
  {regex: /\.png$/, type: 'image/png'},
  {regex: /\.jpe?g$/, type: 'image/jpeg'},
  {regex: /\.gif$/, type: 'image/gif'},
  {regex: /\.ico$/, type: 'image/x-icon'},
  {regex: /\.woff$/, type: 'application/octet-stream'}
];

function ReferrerPush(options) {
  var self = this;

  this.mainResources = {};
  this.maxAssociatedResources = 32;
  this.referrerPushPeriod = 5000; // ms
}

ReferrerPush.prototype.isPushResource = function(url) {
  return contentTypes.reduce(function(previousValue, contentType) {
    return contentType.regex.test(url) || previousValue;
  }, false);
};

ReferrerPush.prototype.getContentType = function(url) {
  return contentTypes.reduce(function(previousValue, contentType) {
    if (contentType.regex.test(url)) {
      return contentType.type;
    }
    return previousValue;
  }, '');
};

ReferrerPush.prototype.middleware = function(req, res, next) {
  if (this.shouldHandleRequest(req, res)) {
    debug('Handling server push for ' + req.url);
    var method = this.isPushResource(req.url) ? 'Push' : 'Main';
    this['handle' + method + 'ResourceType'](req, res);
  }

  return next();
};

ReferrerPush.prototype.handleMainResourceType = function (req, res) {
  var self = this;
  debug("URL [" + req.url + "] is a main resource for SPDY server push");
  var mainResource = this.getOrCreateMainResource(req.url);
  var pushResources = mainResource.getPushResources();
  debug("Pushing resources for URL [" + req.url + "]: " + pushResources);
  pushResources.forEach(function (pushResourceUrl) {
    self.push(req, res, pushResourceUrl);
  });
};

ReferrerPush.prototype.getOrCreateMainResource = function(url) {
  if (this.mainResources[url]) {
    return this.mainResources[url];
  }

  var firstPushResourceAdded = -1;
  var pushResources = [];
  var self = this;

  return this.mainResources[url] = {
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
      if (pushResources.length >= this.maxAssociatedResources) {
        debug("Skipped store of push metadata " + pushResourceUrl + " for main resource " + url + ": Max associated resources (" + this.maxAssociatedResources + ") reached");
        return false;
      }
      if (delay > this.referrerPushPeriod) {
        debug("Skipped store of push metadata " + pushResourceUrl + " for main resource " + url + ": Delay " + delay + "ms longer than referrerPushPeriod (" + this.referrerPushPeriod + "ms)");
        return false;
      }
      debug("Adding: " + pushResourceUrl + " to: " + url + " with delay: " + delay + "ms.");
      pushResources.push(pushResourceUrl);
      debug("Push resources for " + url + " are now " + pushResources);
      return true;
    }
  };
};


ReferrerPush.prototype.push = function(req, res, url) {
  debug("Server push " + url);
  var internalRequest = {
    __proto__: expressRequest,
    app: req.app,
    socket: { remoteAddress: '127.0.0.1' },  // for logging middleware
    method: 'GET',
    url: url,
    params: {},
    headers: {},
    body: {},
    query: {},
    files: {},
    isInternalRequest: true
  };
  var internalResponse = {
    __proto__: expressResponse,
    app: res.app,
    cookies: {}
  };
  var stream = res.push(url, { 'content-type': this.getContentType(url) });
  internalResponse.write = function(data) {
    stream.write(data);
  };
  internalResponse.end = function(data) {
    stream.end(data);
  };
  req.app.handle(internalRequest, internalResponse, function(error) {
    debug("Error when pushing resource [" + url + "]: " + error.message);
  });
};

ReferrerPush.prototype.handlePushResourceType = function (req, res) {
  var referrer = req.headers['referer'];
  var self = this;
  debug("URL [" + req.url + "] is a push resource for SPDY server push with referrer " + referrer);

  if (!referrer) {
    return;
  }

  var mainResource = this.getOrCreateMainResource(urlParse(referrer).path);
  var pushResources = mainResource.getPushResources();

  if (pushResources.indexOf(req.url) === -1) {
    debug("Push resource " + req.url + " not already added for main resource " + referrer);
    mainResource.addPushResource(req.url, req.headers['host'], referrer);
    return;
  }

  debug("Push resource " + req.url + " already added for main resource " + referrer + ", now pushing push resources for " + req.url);
  this.getOrCreateMainResource(req.url).getPushResources().forEach(function (pushResourceUrl) {
    self.push(req, res, pushResourceUrl);
  });
};

ReferrerPush.prototype.shouldHandleRequest = function(req, res) {
  if (req.isInternalRequest) {
    return false;
  }
  if (!res.push && typeof(a) !== 'function') {
    debug("Not handling SPDY server push for URL " + req.url + " because req.push does not exist or is not a function");
    return false;
  }
  if (req.method !== 'GET') {
    debug("Not handling SPDY server push for URL " + req.url + " because the HTTP method is " + req.method);
    return false;
  }
  if (req.headers['if-modified-since']) {
    debug("Not handling SPDY server push for URL " + req.url + " because If-Modified-Since header is present");
    return false;
  }
  return true;
};

module.exports.referrer = function(options) {
  var referrerPush = new ReferrerPush(options);
  return referrerPush.middleware.bind(referrerPush);
};