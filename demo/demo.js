function log(str) {
    var text = document.createTextNode(str);
    var p = document.createElement('p');
    p.appendChild(text);
    document.getElementById('log').appendChild(p);
}

var byteChars = [];
for (var i = 0; i < 256; i++) {
    // Avoid problematic escaping
    byteChars[i] = String.fromCharCode(0xf700 + i);
}

function bytes2string(bytes) {
    var len = bytes.length;
    var arr = new Array(len);
    for (var i = 0; i < len; i++) {
        arr[i] = byteChars[bytes[i] & 0xff];
    }
    return arr.join('');
}

function string2bytes(str) {
    var len = str.length;
    var arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        arr[i] = str.charCodeAt(i) & 0xff;
    }
    return arr;
}

function param(name, value) {
    var p = document.createElement('param');
    p.name = name;
    p.value = value;
    return p;
}

function flashObject(url, readyCallback) {
    var obj = document.createElement('object');
    obj.appendChild(param('FlashVars', 'callback=' + readyCallback + '&module=module.swf'));
    obj.appendChild(param('AllowScriptAccess', 'sameDomain'));
    obj.width = 10;
    obj.height = 10;
    obj.type = 'application/x-shockwave-flash';
    obj.data = url + '?' + Math.random();
    return obj;
}

var callbacks = {
    ready: function() {
        log('ready!');
    },
    error: function(msg) {
        log('Flash reported error loading module.swf: ' + msg);
    },
};

window.readyCallback = function(method, args) {
    callbacks[method].apply(null, args);
};
 
log('loading...');
var swf = flashObject('demo.swf', 'readyCallback');
document.body.appendChild(swf);

function setupDemo(func, argSets, tempRet) {
    document.getElementById(func).addEventListener('click', function() {
        argSets.forEach(function(args) {
            try {
                var ret = swf.run(func, args);
                var msg = func + '(' + args.join(', ') + ') -> ' + ret;
                if (tempRet) {
                    msg += ', ' + swf.getTempRet0();
                }
                log(msg);
            } catch (e) {
                log('error: ' + e);
            }
        });
    });
}

setupDemo('sample_add_i32', [
    [42, 3],
    [-10, 89],
    [0x7fffffff, 1]
]);
setupDemo('sample_add_i64', [[42, 0, 3, 0]], true);
setupDemo('sample_add_f32', [[42.1, 3.2]]);
setupDemo('sample_add_f64', [[42.1, 3.2]]);
setupDemo('mandelbrot', [
    [1000, 0, 0],
    [1000, -2, -2],
    [1000, 2, 2],
    [1000, -1.5, -1],
]);
document.getElementById('filter_line').addEventListener('click', function() {
    var len = 16;
    var dest = swf.run('malloc', [len]);
    log('malloc(' + len + ') -> ' + dest);
    var src = swf.run('malloc', [len]);
    log('malloc(' + len + ') -> ' + src);
    swf.writeBytes(src, [20, 30, 39, 47,  53, 58, 62, 65,  67, 68, 68, 67,  65, 62, 58, 53]);
    log(swf.readBytes(src, len));
    log('filter_line(' + [dest, src, len].join(', ') + ')');
    swf.run('filter_line', [dest, src, len]);
    log(swf.readBytes(dest, len));
    swf.run('free', [src]);
    log('free(' + src + ')');
    swf.run('free', [dest]);
    log('free(' + dest + ')');
});
setupDemo('palette_16color', [
    [0],
    [1],
    [2],
    [15],
    [16],
]);
document.getElementById('func_invoke').addEventListener('click', function() {
    let a = 30;
    let b = 77;
    let add = swf.run('func_fetch', [0]);
    log('func_fetch(0) -> ' + add);
    let sum = swf.run('func_invoke', [add, a, b]);
    log('func_invoke(' + [add, a, b] + ') -> ' + sum);
    let mul = swf.run('func_fetch', [1]);
    log('func_fetch(1) -> ' + mul);
    let product = swf.run('func_invoke', [mul, a, b]);
    log('func_invoke(' + [mul, a, b] + ') -> ' + product);
});
