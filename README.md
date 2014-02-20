# Referrer-based SPDY server push for ExpressJS

ExpressJS middleware for SPDY server push based on referrer headers.

## Usage

Install the module:

    $ npm install spdy-referrer-push

Import the module:

    var spdyPush = require('spdy-referrer-push');

Add as middleware to your already SPDY-enabled Express server:

    app.use(spdyPush.referrer());

If using the `express.static` or other resource serving middleware, the `spdy-referrer-push` middleware must appear
_before_ those in the stack.

That's it!

## Examples

Minimal server with SSL/TLS support:

    $ npm install spdy-referrer-push spdy express

```js
var spdyPush = require('spdy-referrer-push')
  , spdy = require('spdy')
  , express = require('express')
  , path = require('path')
  , fs = require('fs');

var app = express();
app.use(spdyPush.referrer());
var options = {
  key: fs.readFileSync(path.join(__dirname, '../test/keys/spdy-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../test/keys/spdy-cert.pem')),
};
var port = 8443;
spdy.createServer(options, app).listen(port);
```

Minimal SPDY server without SSL/TLS support (keep in mind that most browsers don't support SPDY without SSL/TLS by default):

```js
var spdyPush = require('spdy-referrer-push')
  , spdy = require('spdy')
  , express = require('express')
  , fs = require('fs');

var app = express();
app.use(spdyPush.referrer());
var options = {
  plain: true,
  ssl: false
};
var port = 8080;
spdy.createServer(options, app).listen(port);
```

## Motivation

Server push is one of the most interesting features of
[SPDY](http://www.chromium.org/spdy/spdy-protocol/spdy-protocol-draft3-1#TOC-3.3-Server-Push-Transactions) and the
upcoming [HTTP 2.0](http://http2.github.io/http2-spec/index.html#PushResources).

Briefly, it allows a server to send additional resources in response to a client (web browser) request unsolicited
(e.g. CSS, JavaScript, and images). This makes techniques such as inlining and spriting redundant while allowing for
fine-grained control of resource caching.

The excellent [node-spdy](https://github.com/indutny/node-spdy) module provides the plumbing necessary for SPDY support
in NodeJS (and [Connect](https://github.com/senchalabs/connect)/[Express](https://github.com/visionmedia/express),
including server push. However, hardcoding which resources to push in the server implementation isn't ideal as this
must be kept in sync with references in HTML and CSS files.

The [Jetty](http://www.eclipse.org/jetty/) servlet container for Java has a good solution for this problem, called the
[ReferrerPushStrategy](http://www.eclipse.org/jetty/documentation/current/spdy-implementing-push.html), where the
HTTP [Referer](http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14%2E36) request header is used to track what
resource requests (say `/index.html`) trigger subsequent requests for additional resources. This is recorded and used
to determine what additional resources to push the next time someone requests the same main resource (say `/index.html`
again).

This module is a re-implementation of that algorithm in JavaScript as Express middleware.

## Implementation Notes

The middleware retrieves resources to be pushed by creating an "internal" request/response pair and calling Connect's
[`app.handle`](https://github.com/senchalabs/connect/blob/2.12.0/lib/proto.js#L101) function. This function kicks off
request handling using the server's middleware stack.

This approach avoids the overhead of a new socket connection and a TLS handshake (for resources served via https) while
still supporting dynamic behaviour in the handling of resource requests. For instance, if your CSS resources are
transpiled from LESS files on the fly, these CSS resources can still be pushed correctly to the client.

The "internal" request and response objects support the full Express request and response APIs but don't yet support
all the optional arguments of the NodeJS [Stream API](http://nodejs.org/api/stream.html). This is work in progress
(see the To Do section).

## When To Use

This module provides a simple way to test the impact that SPDY with server push can have on improving latency on your
site. Combine it with `tc` (on Unix systems) or Apple's [Network Link Conditioner](https://developer.apple.com/library/ios/documentation/NetworkingInternetWeb/Conceptual/NetworkingOverview/WhyNetworkingIsHard/WhyNetworkingIsHard.html#%2F%2Fapple_ref%2Fdoc%2Fuid%2FTP40010220-CH13-SW12),
to test your site under various latency and bandwidth constraints. You will see the biggest benefit in high latency
situations

For serious large scale use I would recommend serving static resources from a web server like
[Apache httpd](http://httpd.apache.org/) or [nginx](http://nginx.org/en/) instead of serving them from your NodeJS
server. [mod_spdy](https://developers.google.com/speed/spdy/mod_spdy/) is available for Apache httpd 2.2 or later and
[supports server push](https://code.google.com/p/mod-spdy/wiki/OptimizingForSpdy#Using_SPDY_server_push) when running
as a reverse proxy in front of the NodeJS application via the `X-Associated-Content` response header. That will take
you back to the problem of keeping the list of resources in sync between the NodeJS server and your HTML/CSS though.

## To Do

* Setup Travis CI build.
* The "internal" request and response objects should support the full [Stream API](http://nodejs.org/api/stream.html),
  including all optional arguments.
* Compare referrer header based on scheme + hostname + port rather than just hostname + port.
* Support for the `trust proxy` Express [application setting](http://expressjs.com/api.html#app-settings).
* Improved configurability to match the [Jetty API](http://download.eclipse.org/jetty/stable-9/apidocs/org/eclipse/jetty/spdy/server/http/ReferrerPushStrategy.html).
* Allow for use with plain Connect (without Express).
