var x11 = require('../lib/x11');

var xclient = x11.createClient();
var PointerMotion = x11.eventMask.PointerMotion;
var mapped = true;

xclient.on('connect', function(display) {
    var X = this;
    var root = display.screen[0].root;
    var white = display.screen[0].white_pixel;
    var black = display.screen[0].black_pixel;

    var wid = X.AllocID();
    X.CreateWindow({ depth: 0, wid: wid, parent: root, x: 10, y: 10, width: 400, height: 300, border_width: 1, _class: 1, visual: 0, 
                   value_mask: { BackPixel: white, EventMask: PointerMotion } });
    var cid = X.AllocID();
    X.CreateGC({ cid: cid, drawable: wid });
});
