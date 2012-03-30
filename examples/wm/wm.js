var x11 = require('../../lib/x11');
var EventEmitter = require('events').EventEmitter;

var X, root;
var events = x11.eventMask.Button1Motion|x11.eventMask.ButtonPress|x11.eventMask.ButtonRelease|x11.eventMask.SubstructureNotify|x11.eventMask.SubstructureRedirect
var frames = {};
var dragStart = null;

function ManageWindow(wid)
{
	X.GetWindowAttributes({window: wid}, function(attrs) {

		if (attrs[8])
		{
			X.MapWindow({window: wid});
			return;
		}

	var fid = X.AllocID();
	frames[fid] = 1;
	var winX, winY;
	winX = parseInt(Math.random()*300);
	winY = parseInt(Math.random()*300);
	
	X.GetGeometry({drawable: wid}, function(clientGeom) {
		var width = clientGeom.width + 4;
		var height = clientGeom.height + 24;
		X.CreateWindow({wid: fid, parent: root, x:winX, y:winY, width:width, height:height, border_width:1, _class:1, visual:0,
			value_mask: { BackPixel: 0xffffe0, EventMask: events } });

		var ee = new EventEmitter();
		X.event_consumers[fid] = ee;
		ee.on('event', function(ev)
		{
			if (ev.type === 17) // DestroyNotify
			{
			   X.DestroyWindow({window: fid});
			} else if (ev.type == 4) {
				dragStart = { rootx: ev.rootx, rooty: ev.rooty, x: ev.x, y: ev.y, winX: winX, winY: winY };
			} else if (ev.type == 5) {
				dragStart = null;
			} else if (ev.type == 6) {
				winX = dragStart.winX + ev.rootx - dragStart.rootx;
				winY = dragStart.winY + ev.rooty - dragStart.rooty;
				X.ConfigureWindow({window:fid, value_mask: { X:winX, Y:winY}});
			}
		});
		X.ChangeSaveSet({mode: 1, window: wid});
		X.ReparentWindow({window: wid, parent:fid, x:1, y:21});
		X.MapWindow({window:fid});
		X.MapWindow({window:wid});
	});

	});
}

x11.createClient(function(display) {
	X = display.client;
	root = display.screen[0].root;
	console.log('root = ' + root);
	X.ChangeWindowAttributes( {window: root, value_mask: { EventMask: x11.eventMask.SubstructureRedirect }}, function(err) {
	    if (err.error == 10)
	    {
	        console.error('Error: another window manager already running.');
	        process.exit(1);
	    }
	});

	X.QueryTree({window: root}, function(tree) {
		tree.children.forEach(ManageWindow);
	});
}).on('error', function(err) {
	console.error(err);
}).on('event', function(ev) {
	console.log(ev);
	if (ev.type === x11.event.MapRequest)
	{
		if (!frames[ev.wid])
			ManageWindow(ev.wid);
		return;
	} else if (ev.type === x11.event.ConfigureRequest)
	{
		X.ConfigureWindow({window: ev.wid, value_mask: {Width: ev.width, Height: ev.height}});
	}
	console.log(ev);
});
