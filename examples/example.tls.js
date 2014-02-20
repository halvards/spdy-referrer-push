'use strict';

var spdyPush = require('..')
  , spdy = require('spdy')
  , express = require('express')
  , path = require('path')
  , fs = require('fs');

var app = express();
app.use(spdyPush.referrer());
app.use(express.static(path.join(__dirname, '../test/site')));
var options = {
  key: fs.readFileSync(path.join(__dirname, '../test/keys/spdy-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../test/keys/spdy-cert.pem'))
};
options = {
  key: fs.readFileSync(process.env.HOME + '/.ssh/localhost.key'),
  cert: fs.readFileSync(process.env.HOME + '/.ssh/localhost.crt'),
  ca: fs.readFileSync(process.env.HOME + '/.ca/cacert.pem')
};
var port = 8443;
spdy.createServer(options, app).listen(port);
