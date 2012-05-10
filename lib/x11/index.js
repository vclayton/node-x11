var core = require('./xcore');
var em = require('./eventmask').eventMask;
var keysyms = require('./keysyms');
var event = require('./event').event;
var cursorfont = require('./cursorfont').cursorfont;

var enums = require('./autogen/enums.js').enums;
for(e in enums) {
	module.exports[e] = enums[e];
}

module.exports.createClient = core.createClient;
module.exports.eventMask = em;
module.exports.event = event;
module.exports.keySyms = keysyms;
module.exports.XC = cursorfont;
