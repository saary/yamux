var Mocha = require('mocha'),
    fs = require('fs'),
    path = require('path');

// First, you need to instantiate a Mocha instance.
var mocha = new Mocha;

mocha.addFile(__dirname + '/test.js');

// Now, you can run the tests.
mocha.run(function(failures){
  process.on('exit', function () {
    process.exit(failures);
  });
});