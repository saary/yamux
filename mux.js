var assert = require('assert');
var Transform = require('stream').Transform;
var logger = require('./logger.js')('log');
var info = true;

//
// A packet header is of the following form 
var HEADER = {
  prefix    : 1, // sizeof(uint8)
  streamId  : 1, // sizeof(uint8)
  eventType : 1, // sizeof(uint8)
  length    : 4, // sizeof(uint32)
}

HEADER.LENGTH = (function() {
  var totalLength = 0;
  var parts = Object.keys(HEADER);
  for (var i=0; i<parts.length; i++)  {
    totalLength+= HEADER[parts[i]];
  }
  return totalLength;
})();

HEADER.parse = function(buffer) {
  var header = {};
  var offset = 0;

  Object.keys(HEADER).forEach(function(part) {
    var size = HEADER[part];
    if (size === 1) {
      header[part] = buffer.readUInt8(offset);
    }
    else if (size === 4) {
      header[part] = buffer.readUInt32LE(offset);
    }

    offset += size;
  });

  return header;
};

HEADER.prepare = function(prefix, id, eventType, length) {
  var header = new Buffer(HEADER.LENGTH);

  header.writeUInt8(prefix, 0);
  header.writeUInt8(id, 1); 
  header.writeUInt8(eventType, 2);
  header.writeUInt32LE(length, 3);
  return header;
};

var EVENTS = {
  connection: 0,
  data: 1,
  end: 2,
  error: 3,
  system: 0x10,
  none: -1
};

var PREFIX = {
  local: 0xAA,
  remote: 0xBB,
  system: 0xCC
};

var eventTypes = Object.keys(EVENTS);

function Multiplex(onStream) {
  if (!(this instanceof Multiplex)) return new Multiplex(onStream);

  var self = this;
  
  var idx = [];
  var remoteStreams = {};
  var localStreams = {};

  for (var i=0x0; i <= 0xFF; i++) {
    idx.push(i);
  }
  
  var plexer = Transform();
  var packet = new Buffer(0);
  var expectedLength = 0;
  var currentHeader;
  var closed = false;

  Object.defineProperty(this, "closed", {get : function(){ return closed; },
                               enumerable : true,
                               configurable : true});

  plexer._transform = function(chunk, encoding, cb) {
    logger.debug('C %d ',chunk.length, chunk.toString('hex'));
    logger.debug('B %d ',packet.length, packet.toString('hex'));

    packet = Buffer.concat([packet, chunk]);
    logger.log('M %d ',packet.length, packet.toString('hex'));
    
    if (expectedLength === 0) {
      if (packet.length >= HEADER.LENGTH) {
        logger.log('H ', packet.toString('hex'));

        currentHeader = HEADER.parse(packet);
        expectedLength = currentHeader.length;

        packet = packet.slice(HEADER.LENGTH);
        if (currentHeader.eventType !== EVENTS.data) {
          logger.log('[%d] %d %d %s',
            currentHeader.streamId,
            currentHeader.eventType,
            expectedLength,
            eventTypes[currentHeader.eventType]);
        }
      }
      else {
        // header info is incomplete wait for more data
        return;
      }
    }

    // we have enough data to handle the packet
    if (packet.length >= expectedLength) {
      logger.debug('P ', packet.toString('hex'));
      var rest = packet.slice(expectedLength);
      var fullPacket = packet.slice(0, expectedLength);
      
      handlePacket(currentHeader, fullPacket);
      
      assert(expectedLength === fullPacket.length);
      assert(packet.length === (rest.length + fullPacket.length));

      expectedLength = 0;
      packet = new Buffer(0);
      currentHeader = null;

      if (rest.length > 0) {
        logger.debug('REST: %d', rest.length);
        return plexer._transform(rest, encoding, cb);
      }
    }

    // done processing for now
    return cb();
  };

  function handlePacket(header, packet) {
    var id = header.streamId;
    var eventType = header.eventType;
    var stream;

    logger.log('[%d] %d %s', id, eventType, eventTypes[eventType]);

    if (eventType === EVENTS.system && header.prefix === PREFIX.system) {
      return plexer.emit('systemMessage', packet);
    }

    if (header.prefix === PREFIX.local) {
      stream = localStreams[id];
    }
    else if (header.prefix === PREFIX.remote) {
      stream = remoteStreams[id];
    }

    if (eventType === EVENTS.connection) {
      if (stream) {
        stream.end();
        stream = null;
      }
      stream = remoteStreams[id] = createStream(id);
      if (onStream) {
        onStream(stream);
      }
    }
    else if (eventType === EVENTS.end || eventType === EVENTS.error) {
      if (!stream) {
        return;
      }

      return stream.end();
    }
    else if (eventType > EVENTS.error) {
      return logger.error('ILLEGAL PACKET TYPE: %d', eventType);
    }

    if (!stream) {
      return logger.error('STREAM NOT FOUND id: %d, eventType: %d', id, eventType);
    }

    return stream.push(packet);
  }
    
  function createStream(id) {
    var isLocal = false;
    var firstPacket = true;
    var encoder = Transform();

    if (id === undefined) {
      if (idx.length === 0) {
        throw new Error('Max number of streams is 256');
      }
      id = idx.shift();
      isLocal = true;
      localStreams[id] = encoder;
    }

    encoder.id = id;
    encoder.isLocal = isLocal;

    encoder._transform = function(chunk, encoding, cb) {
      var eventType = EVENTS.data;
      if (firstPacket && isLocal) {
        eventType = EVENTS.connection;
        firstPacket = false;
      }

      logger.log('[%d] %d %d %s', id, eventType, chunk.length, eventTypes[eventType]);

      var prefix = isLocal ? PREFIX.remote : PREFIX.local;

      var header = HEADER.prepare(prefix, id, eventType, chunk.length);
      var packetToSend = Buffer.concat([header, chunk]);
      logger.debug('P ', packetToSend.toString('hex'));
      if (!plexer.ended && !closed) plexer.push(packetToSend);

      return cb();
    };

    encoder.on('end', function() {
      logger.log('[%d] ended', id);

      var prefix = isLocal ? PREFIX.remote : PREFIX.local;

      var header = HEADER.prepare(prefix, id, EVENTS.end, 0);
      if (!plexer.ended && !closed) plexer.push(header);
      if (isLocal) {
        idx.push(id);
        delete localStreams[id];
      }
      else {
        delete remoteStreams[id]; 
      }
    });

    encoder.on('error', function(err) {
      logger.error('[%d] error', err);

      var prefix = isLocal ? PREFIX.remote : PREFIX.local;

      var header = HEADER.prepare(prefix, id, EVENTS.error, 0);
      if (!plexer.ended && !closed) plexer.push(header);
      if (isLocal) {
        idx.push(id);
        delete localStreams[id];
      }
      else {
        delete remoteStreams[id]; 
      }
    });

    return encoder;
  }
  
  plexer.createStream = createStream;

  plexer.sendSystemMessage = function(data) {
    if (!plexer.ended && !closed) {
      logger.info('Sending system message');
      var header = HEADER.prepare(PREFIX.system, 0, EVENTS.system, data.length);
      var packetToSend = Buffer.concat([header, data]);
      logger.debug('P ', packetToSend.toString('hex'));

      plexer.push(packetToSend);
    }
  }

  function close() {
    closed = true;
    function closeAll(streams) {
      var stream;
      for (var id in streams) {
        stream = streams[id];
        if (stream) {
          stream.end();
        }
        delete streams[id];
      }
    }

    closeAll(localStreams);
    closeAll(remoteStreams);
  }

  var _end = plexer.end;
  plexer.end = function() {
    close();
    _end.apply(plexer);
  }

  plexer.on('end', function() {
    close();
  });

  return plexer;
}

module.exports = Multiplex;
