module.exports = function(level) {
  var logger = {
    error: console.error,
    warn: console.warn,
    info: console.info,
    log: console.log,
    trace: console.trace,
    debug: console.trace
  };

  var nop = function() {};

  var ignore = false;

  for (var i in logger) {
    if (i === level) {
      ignore = true;
    }
    if (!ignore) continue;

    logger[i] = nop;
  }

  return logger;
};