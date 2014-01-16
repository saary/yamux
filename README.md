yamux
=====

Yet another stream multiplexer. Requires node v0.10.x

#### Why
An implementation that can handle partial packets.

#### Basic concept

*Client side*

1. Create a multiplex stream and pipe it into a common channel.
2. Create virtual streams off the multiplex stream and use them to interleave data over the common channel

```javascript
var Multiplex = require('yamux');
var plexer = new Multiplex();
plexer.pipe(commonXXXChannel);

var virtualStream1 = plexer.createStream();
var virtualStream2 = plexer.createStream();
virtualStream1.write('Yamuuuuuuuuxxxx!!!');
virtualStream2.write('Lamux!');
```
 
*Server side*

1. Create a multiplex stream and register an "onStream" handler with it.
2. The onStream handler will get triggered when a new virtual stream is available.
3. Pipe the common channel into the multiplex stream.

```javascript
var Multiplex = require('yamux');
var plexer = new Multiplex(function(virtualStream) {
  virtualStream.pipe(process.stdout);
});

commonXXXChannel.pipe(plexer);
```

*Now, go Enjoy your lunch.*

#### Example
```javascript

// on the client side
var net = require('net');
var fs = rquire('fs');
var Multiplex = require('yamux');

var plexer = new Multiplex();
var client = net.connect({ host: 'someehost.no.where', port: 1337});

plexer.pipe(client).pipe(plexer);

// pipe three files over the tcp connection
var file1 = fs.createReadStream(__dirname + '/file1');
var file2 = fs.createReadStream(__dirname + '/file2');
var file3 = fs.createReadStream(__dirname + '/file3');

file1.pipe(plexer.createStream());
file2.pipe(plexer.createStream());
file3.pipe(plexer.createStream());

//////////////////
// on the server side
var net = require('net');
var fs = rquire('fs');
var Multiplex = require('yamux');
var fileIndex = 1;

var plexer = new Multiplex(function(stream) {
  var file = fs.createWriteStream(__dirname + '/file' + fileIndex++);
  stream.pipe(file);
});

var server = net.createServer(function(c) {
  c.pipe(plexer).pipe(c);
});

server.listen(1337);
```

#### License
MIT
