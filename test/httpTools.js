var http = require('http');
var net = require('net');
var Duplex = require('stream').Duplex;

function createServer() {
  var server = new http.Server(function(req, res) {
    var statusCode = +req.headers['x-status'] || 200;
    res.writeHeader(statusCode, { 'content-type': 'text/plain'});
    req.pipe(res);
  });

  server.handleRequest = function(stream) {
    if (!stream.setTimeout) {
      stream.setTimeout = net.Socket.prototype.setTimeout;
    }
    if (!stream.destroy) {
      stream.destroy = function () { };
    }

    server.emit('connection', stream);

    if (!stream.destroySoon) {
      stream.destroySoon = function () { stream.writable = false; };
      stream.on('data', function (data) {
        stream.ondata(data, 0, data.length);
      });

      stream.once('end', function () { if (stream.onend) stream.onend(); });
    }

    stream.read(0);

    return stream;
  };

  return server;
}

function getOptions(channel, path, statusCode) {
  var options = { method: 'POST', path: path || '/', socketPath: 'MOCK' };

  if (statusCode) {
    options.headers = { 'x-status': +statusCode };
  }

  options.createConnection = function (deviceName) {
    var stream = channel.createStream();

    if (!stream.setTimeout) {
      stream.setTimeout = net.Socket.prototype.setTimeout;
    }
    stream.destroy = function () { };
    stream.destroySoon = function () { stream.writable = false; };

    stream.on('data', function (data) {
      stream.ondata(data, 0, data.length);
    });

    stream.once('end', function () { if (stream.onend) stream.onend(); });
    
    return stream;
  }

  return options;
}

exports.createServer = createServer;
exports.request = http.request;
exports.getOptions = getOptions;
