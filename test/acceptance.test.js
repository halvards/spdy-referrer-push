'use strict';

var spdyPush = require('../lib/referrer-push')
  , express = require('express')
  , fs = require('fs')
  , path = require('path')
  , spdy = require('spdy')
  , http = require('http')
  , https = require('https')
  , should = require('should')
  , streamBuffers = require('stream-buffers')
  , deferred = require('deferred');

var sendRequest = function(agent, path, headers) {
  headers = headers || {};
  var defer = deferred();

  http.request({
    host: agent.options.host,
    port: agent.options.port,
    path: path,
    method: 'GET',
    agent: agent,
    headers: headers
  }, function(response) {
    response.statusCode.should.equal(200);
    defer.resolve();
  }).end();
  return defer.promise;
};

describe('Test page', function() {
  it('should include push streams on second request when not using SSL/TLS', function(done) {
    var options = {
      plain: true,
      ssl: false
    };
    testPushStreams(options, done);
  });

  it('should include push streams on second request with SSL/TLS', function(done) {
    var options = {
      key: fs.readFileSync(path.join(__dirname, './keys/spdy-key.pem')),
      cert: fs.readFileSync(path.join(__dirname, './keys/spdy-cert.pem'))
    };
    testPushStreams(options, done);
  });
});

var testPushStreams = function(options, done) {
  var app = express();
  app.use(spdyPush.referrer());
  app.use(express.static(path.join(__dirname, 'site')));
  var server = spdy.createServer(options, app).listen(0);
  var port = server.address().port;
  var protocol = app instanceof https.Server ? 'https' : 'http';
  var homepage = protocol + '://localhost:' + port + '/';
  var agent = spdy.createAgent({
    host: 'localhost',
    port: port,
    spdy: options,
    rejectUnauthorized: false
  });
  var pushedResources = {
    '/style.css': { complete: deferred(), content: new streamBuffers.WritableStreamBuffer() },
    '/script.js': { complete: deferred(), content: new streamBuffers.WritableStreamBuffer() },
    '/black_square.png': { complete: deferred(), content: new streamBuffers.WritableStreamBuffer() },
    '/blue_square.png': { complete: deferred(), content: new streamBuffers.WritableStreamBuffer() }
  };
  agent.on('push', function (stream) {
    var pushedResource = pushedResources[stream.url];
    pushedResource['content-type'] = stream.headers['content-type'];
    stream.pipe(pushedResource.content);
    stream.on('end', function () {
      pushedResource.complete.resolve();
    });
  });
  sendRequest(agent, '/')
    .then(sendRequest(agent, '/style.css', { 'referer': homepage }))
    .then(sendRequest(agent, '/script.js', { 'referer': homepage }))
    .then(sendRequest(agent, '/black_square.png', { 'referer': homepage }))
    .then(sendRequest(agent, '/blue_square.png', { 'referer': homepage }))
    .then(sendRequest(agent, '/'))
    .then(pushedResources['/style.css'].complete.promise)
    .then(pushedResources['/script.js'].complete.promise)
    .then(pushedResources['/black_square.png'].complete.promise)
    .then(pushedResources['/blue_square.png'].complete.promise)
    .then(function () {
      agent.close();
      pushedResources['/style.css'].content.getContents().should.have.length(53);
      pushedResources['/script.js'].content.getContents().should.have.length(32);
      pushedResources['/black_square.png'].content.getContents().should.have.length(1165);
      pushedResources['/blue_square.png'].content.getContents().should.have.length(1165);
      pushedResources['/style.css']['content-type'].should.equal('text/css');
      pushedResources['/script.js']['content-type'].should.equal('application/javascript');
      pushedResources['/black_square.png']['content-type'].should.equal('image/png');
      pushedResources['/blue_square.png']['content-type'].should.equal('image/png');
      done();
    }).done();
}
