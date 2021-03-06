if (process.platform == 'darwin') {
	// some strage dns related errors in core node libs on OSX (node v0.6.5)
	// skip them at the moment
	process.on('uncaughtException', function (err) {
		console.log(err);
		console.log('Caught exception: ' + err);
	});
}

var util = require('util'); // util.inherits
var net = require('net');

var handshake = require('./handshake');
//var xevents = require('./xevents');

var EventEmitter = require('events').EventEmitter;
var PackStream = require('./unpackstream');
var coreRequestsTemplate = require('./corereqs');
var hexy = require('./hexy').hexy;

var Buffer = require('buffer').Buffer;
// add 'unpack' method for buffer
require('./unpackbuffer').addUnpack(Buffer);

var os = require('os');

var xevent = require('./autogen/events').event;
var xerrors = require('./xerrors');
var coreRequests = require('./autogen/requests');
var stdatoms = require('./stdatoms');

function XClient(stream, displayNum, screenNum)
{
	EventEmitter.call(this);
	this.stream = stream;

	this.core_requests = {};
	this.ext_requests = {};

	this.displayNum = displayNum;
	this.screenNum = screenNum;
	this.authHost = os.hostname();

	pack_stream = new PackStream();

	// data received from stream is dispached to
	// read requests set by calls to .unpack and .unpackTo
	//stream.pipe(pack_stream);

	 // pack_stream write requests are buffered and
	// flushed to stream as result of call to .flush
	// TODO: listen for drain event and flush automatically 
	//pack_stream.pipe(stream);
	
	pack_stream.on('data', function( data ) {
		//console.error(hexy(data, {prefix: 'from packer '}));
		//for (var i=0; i < data.length; ++i)
		//   console.log('<<< ' + data[i]);
		stream.write(data);
	});
	stream.on('data', function( data ) {
		//console.error(hexy(data, {prefix: 'to unpacker '}));
		//for (var i=0; i < data.length; ++i)
		//   console.log('>>> ' + data[i]);
		pack_stream.write(data);
	});

	this.pack_stream = pack_stream;

	this.rsrc_id = 0; // generated for each new resource
	this.seq_num = 0; // incremented in each request. (even if we don't expect reply)
	this.seq2stack = {}; // debug: map seq_num to stack at the moment request was issued   
 
	// in/out packets indexed by sequence ID
	this.replies = {};
	this.atoms = stdatoms;
	this.event_consumers = {}; // maps window id to eventemitter TODO: bad name
   
	this.importRequestsFromTemplates(this, coreRequests);
	
	this.startHandshake();
}
util.inherits(XClient, EventEmitter);

// TODO: close() = set 'closing' flag, watch it in replies and writeQueue, terminate if empty
XClient.prototype.terminate = function()
{
	this.stream.end();
}

XClient.prototype.importRequestsFromTemplates = function(target, reqs)
{
	var client = this;
	for (r in reqs)
	{
		// r is request name
		target[r] = (function(reqName) { 
			
			var reqFunc = function req_proxy() {
			client.seq_num++; // TODO: handle overflow (seq should be last 15 (?)  bits of the number

			var err = new Error;
			err.name = reqName;
			Error.captureStackTrace(err, arguments.callee);
			client.seq2stack[client.seq_num] = err.stack;

			// is it fast?
			var args = Array.prototype.slice.call(req_proxy.arguments);

			var callback = args.length > 0 ? args[args.length - 1] : null;
			if (callback && callback.constructor.name != 'Function')
				callback = null;

			// TODO: see how much we can calculate in advance (not in each request)
			var reqReplTemplate = reqs[reqName];
			var reqTemplate  = reqReplTemplate[0];
			var templateType = typeof reqTemplate;

			if (templateType == 'object')
				templateType = reqTemplate.constructor.name;

			if (templateType == 'function')
			{
				 // call template with input arguments (not including callback which is last argument TODO currently with callback. won't hurt)
				 //reqPack = reqTemplate.call(args);
				 var reqPack = reqTemplate.apply(this, req_proxy.arguments); 
				 var format = reqPack[0];
				 var requestArguments = reqPack[1];

				 if (callback)
					 this.replies[this.seq_num] = [reqReplTemplate[1], callback];
				 
				 client.pack_stream.pack(format, requestArguments);
				 var b = client.pack_stream.write_queue[0];
				 client.pack_stream.flush();
				 
			} else if (templateType == 'Array'){
				 var format = reqTemplate[0];
				 var requestArguments = [];

				 for (a = 0; a < reqTemplate[1].length; ++a)
					 requestArguments.push(reqTemplate[1][a]);                 
				 for (a in args)
					 requestArguments.push(args[a]);

				 if (callback)
					 this.replies[this.seq_num] = [reqReplTemplate[1], callback];

				 client.pack_stream.pack(format, requestArguments);
				 client.pack_stream.flush();
			} else {
				 throw 'unknown request format - ' + templateType;
			}
		}
		return reqFunc;
		})(r);
	}
}

XClient.prototype.AllocID = function()
{
	// TODO: handle overflow (XCMiscGetXIDRange from XC_MISC ext)
	// TODO: unused id buffer
	this.display.rsrc_id++;
	return (this.display.rsrc_id << this.display.rsrc_shift) + this.display.resource_base;
}


// packetBuf is an optional Buffer
function XEvent(packetBuf)
{
	this.name = '';
	if (packetBuf.unpackTo) {
		this.unpack(packetBuf);
	}
}
XEvent.prototype.unpack = function(raw)
{
	this.type = raw[0];
	this.name = xevent.names[this.type];
	try {
		raw.unpackTo(this, xevent.template[this.name], 1);
	} catch (e) {
		console.log("Caught exception while trying to unpack event:", this, e, raw, xevent.template[this.name]);
	}
}

XClient.prototype.receiveError = function(packetBuf) {
	var client = this;
	var error = new XEvent(packetBuf)

	error.message = xerrors.errorText[error.code];
	error.stack = client.seq2stack[error.seq];

	var handler = client.replies[error.seq];
	if (handler) {
		var callback = handler[1];
		var handled = callback(error);
		if (!handled)
			client.emit('error', error);
		// TODO: should we delete seq2stack and reply even if there is no handler?
		delete client.seq2stack[seq_num];
		delete client.replies[error.seq];
	} else {
		client.emit('error', error);
	}
}
			  
XClient.prototype.receiveEvent = function(packetBuf) {
	var client = this;
	var ev = new XEvent(packetBuf);
//	console.log("Unpacked Event: ", ev);
	client.emit('event', ev);
	var targetWindow = ev.event == undefined ? ev.window : ev.event;
	var ee = client.event_consumers[targetWindow];
	if (ee) {
	   ee.emit('event', ev);
	}
}

XClient.prototype.listenForEvent = function()
{
	// TODO: BigReq!!!!
	var client = this;
	client.pack_stream.get(32, function(packetBuf) {
		var res = packetBuf.unpack('CCSL');
		var type = res[0];
			var opt_data = res[1];
		var seq_num = res[2];
		var replyLength = res[3];

		if (type == 0) {
			client.receiveError(packetBuf);
		} else if (type > 1) {
			client.receiveEvent(packetBuf);
		} else { // Response
			var extralength = replyLength*4; // replyLength includes 32-bytes we've already got
			client.pack_stream.getAppend(extralength, packetBuf, function(data) {
				
				var handler = client.replies[seq_num];
				if (handler) {
					var unpack = handler[0];
					var result = unpack(data.slice(8), opt_data);
					var callback = handler[1];
					callback(result);
					// TODO: add multiple replies flag and delete handler only after last reply (eg ListFontsWithInfo)
					delete client.replies[seq_num];
				}
			});
		}
				// wait for new packet from server
		client.listenForEvent();
	});
}

XClient.prototype.startHandshake = function()
{
	var client = this;

	handshake.writeClientHello(this.pack_stream, this.displayNum, this.authHost);
	handshake.readServerHello(this.pack_stream, function(display) 
	{
		// TODO: readServerHello can set error state in display
		// emit error in that case
		client.listenForEvent();
		client.display = display;
		display.client = client;
		client.emit('connect', display);
	});   
}

XClient.prototype.require = function(extName, callback)
{
   var ext = require('./ext/' + extName);
   ext.requireExt(this.display, callback);
}

module.exports.createClient = function(initCb, display)
{
	if (!display)
	   display = process.env.DISPLAY;
	if (!display)
		display = ':0';

	var displayMatch = display.match(/^(?:[^:]*?\/)?(.*):(\d+)(?:.(\d+))?$/);
	var host = displayMatch[1];
	if (!host)
		host = '127.0.0.1';

	var displayNum = displayMatch[2];
	if (!displayNum)
		displayNum = 0;
	var screenNum = displayMatch[3];
	if (!screenNum)
		screenNum = 0;
	
	// open stream
	var stream;
	var socketPath;

	// try local socket on non-windows platforms
	if ( ['cygwin', 'win32', 'win64'].indexOf(process.platform) < 0 )
	{
		if (process.platform == 'darwin' || process.platform == 'mac')
		{
			// socket path on OSX is /tmp/launch-(some id)/org.x:0
			if (display[0] == '/') 
			{
				socketPath = display;
			}           
		} else if(host == '127.0.0.1') //TODO check if it's consistent with xlib (DISPLAY=127.0.0.1:0 -> local unix socket or port 6000?)
			socketPath = '/tmp/.X11-unix/X' + displayNum;
	} 
	if(socketPath)
	{
		stream = net.createConnection(socketPath);
	}
	else
	{
		stream = net.createConnection(6000 + parseInt(displayNum), host);
	}
	var client = new XClient(stream, displayNum, screenNum);
	if (initCb)
	{
		client.on('connect', function(display) {
			initCb(display);
		});
	} 
	return client;     
}
