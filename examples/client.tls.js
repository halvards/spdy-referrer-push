'use strict';

var spdy = require('spdy')
  , http = require('http')
  , deferred = require('deferred');

var agent = spdy.createAgent({
  host: 'localhost',
  port: 8443,
  rejectUnauthorized: false
});

var sendRequest = function (agent, path, headers) {
  if (!headers) headers = {};
  var defer = deferred();
  console.log("Sending request for " + path + ' with referer header ' + headers.referer);
  http.request({
    host: agent.options.host,
    port: agent.options.port,
    path: path,
    method: 'GET',
    agent: agent,
    headers: headers
  }, function(response) {
    defer.resolve();
  }).end();
  return defer.promise;
};

agent.on('push', function (stream) {
  console.log("Received push stream for " + stream.url);
});

var homepage = 'https://' + agent.options.host + ':' + agent.options.port + '/';

sendRequest(agent, '/')
  .then(sendRequest(agent, '/style.css', { 'referer': homepage }))
  .then(sendRequest(agent, '/script.js', { 'referer': homepage }))
  .then(sendRequest(agent, '/black_square.png', { 'referer': homepage }))
  .then(sendRequest(agent, '/blue_square.png', { 'referer': homepage }))
  .then(sendRequest(agent, '/'))
  .then(function () {
    agent.close();
  });
