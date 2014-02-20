'use strict';

var spdyPush = require('..')
  , spdy = require('spdy')
  , express = require('express')
  , path = require('path');

var app = express();
app.use(spdyPush.referrer());
app.use(express.static(path.join(__dirname, '../test/site')));
var options = {
  plain: true,
  ssl: false
};
var port = 8080;
spdy.createServer(options, app).listen(port);
