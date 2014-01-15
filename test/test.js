var assert = require('better-assert');
var Multiplex = require('../mux.js');
var net = require('net');

var httpTools = require('./httpTools.js');
var getOptions = httpTools.getOptions;

describe('Back and forth', function() {
  var plexerFrom = new Multiplex();
  var plexerTo = new Multiplex(function(stream) {
    stream.on('data', function(data) {
      stream.write(data);
    });
  });
  plexerFrom.pipe(plexerTo).pipe(plexerFrom);

  function createStreamAndWrite(upTo, done) {
    var stream = plexerFrom.createStream();

    var nextData = 0;
    stream.on('data', function(data) {
      assert(data == nextData.toString());
      nextData++;
      if (nextData >= upTo) done();
    });

    for(var i=0; i<upTo; i++) {
      (function(num) { 
        setImmediate(function() {
          stream.write(num.toString());
        }); 
      })(i);
    }
  }

  it('should create one stream write to it and recieve the same data back', function(done) {
    createStreamAndWrite(10000, done);
  });

  it('should create 255 streams write to them and recieve the same data back', function(done) {
    var totalDone = 0;
    function oneDone() {
      totalDone++;
      if (totalDone == 255) done();
    }

    for (var i=0; i<255; i++) {
      setImmediate(function() {
        createStreamAndWrite(100, oneDone);
      });
    } 
  });

  it('should create 256 streams should fail', function(done) {
    var streams = [];
    try {
      for (var i=0; i<256; i++) {
        streams.push(plexerFrom.createStream());
      } 
    }
    catch(e) {
      assert(e.message === 'Max number of streams is 256');
      done();
    }
  });
});

describe('Both ways', function() {
  var plexerFrom = new Multiplex(function(stream) {
    stream.on('data', function(data) {
      stream.write(data);
    });
  });

  var plexerTo = new Multiplex(function(stream) {
    stream.on('data', function(data) {
      stream.write(data);
    });
  });
  plexerFrom.pipe(plexerTo).pipe(plexerFrom);

  function createToStreamAndWrite(upTo, done) {
    var stream = plexerTo.createStream();

    var nextData = upTo;
    stream.on('data', function(data) {
      assert(data == nextData.toString());
      nextData--;
      if (nextData <= 0) done();
    });

    for(var i=upTo; i>0; i--) {
      (function(num) { 
        setImmediate(function() {
          stream.write(num.toString());
        }); 
      })(i);
    }
  }

  function createFromStreamAndWrite(upTo, done) {
    var stream = plexerFrom.createStream();

    var nextData = 0;
    stream.on('data', function(data) {
      assert(data == nextData.toString());
      nextData++;
      if (nextData >= upTo) done();
    });

    for(var i=0; i<upTo; i++) {
      (function(num) { 
        setImmediate(function() {
          stream.write(num.toString());
        }); 
      })(i);
    }
  }

  it('should create one to-stream and one from-stream write to them and recieve the same data back', function(done) {
    var totalDone = 0;
    function oneDone() {
      totalDone++;
      if (totalDone == 2) done();
    }

    createToStreamAndWrite(100, oneDone);
    createFromStreamAndWrite(100, oneDone);
  });

  it('should create 50 to-streams and 50-from streams write to them and recieve the same data back', function(done) {
    var totalDone = 0;
    function oneDone() {
      totalDone++;
      if (totalDone == 100) done();
    }

    for (var i=0; i<50; i++) {
      setImmediate(function() {
        createToStreamAndWrite(100, oneDone);
        createFromStreamAndWrite(100, oneDone);
      });
    } 
  });
});

describe('Http Traffic', function() {
  this.timeout(0);

  function sendRequest(channel, dataToWrite, done, expectedCode, expectedBody) {
    expectedCode = expectedCode || 200;

    var req = httpTools.request(getOptions(channel, '/', expectedCode));

    var expecting = [];

    var body = '';
    req.on('response', function(res) {
      assert(res.statusCode === expectedCode);
      res.on('data', function(data) {
        var expected = expecting.shift();
        if (expectedBody) {
          body += data;
        }
        assert(expected.toString() == data.toString());
        if (!dataToWrite.length && !expecting.length) {
          if (expectedBody) {
              assert(body === expectedBody);
          }
          done();
        }
      });
    });

    while(dataToWrite.length) {
      var data = dataToWrite.shift();
      expecting.push(data);
      req.write(data);
    }

    req.end();
  }

  describe('Single stream', function() {
    var server = httpTools.createServer();

    var plexerFrom = new Multiplex();
    var plexerTo = new Multiplex(function(req) {
     server.handleRequest(req);
    });

    plexerFrom.pipe(plexerTo).pipe(plexerFrom);

    it('should POST one request to the server and return 200 and body of 12345', function(done){
      sendRequest(plexerFrom, ['1', '2', '3', '4', '5'], done);
    });

    it('should POST a second request to the server and return 300 and body of buya!', function(done){
      sendRequest(plexerFrom, ['b', 'u', 'y', 'a', '!'], done, 300, 'buya!');
    });
  });

  describe('Single stream huge buffer', function() {
    var server = httpTools.createServer();

    // create a very small buffer
    var plexerFrom = new Multiplex();
    var plexerTo = new Multiplex(function(req) {
     server.handleRequest(req);
    });

    plexerFrom.pipe(plexerTo).pipe(plexerFrom);

    it('should POST one request to the server and return 200 and body', function(done){
      var b = new Buffer(100 * 1024);
      b.fill('a');
      sendRequest(plexerFrom, [b], done);
    });
  });

  
});