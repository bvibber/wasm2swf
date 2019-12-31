function log(str) {
    var text = document.createTextNode(str);
    var p = document.createElement('p');
    p.appendChild(text);
    document.getElementById('log').appendChild(p);
}

function readyCallback(ok, msg) {
    if (ok) {
        log('ready!');
    } else {
        log('Flash reported error loading module.swf: ' + msg);
    }
}

function param(name, value) {
    var p = document.createElement('param');
    p.name = name;
    p.value = value;
    return p;
}
function flashObject(url, readyCallback) {
    var obj = document.createElement('object');
    obj.width = 10;
    obj.height = 10;
    obj.type = 'application/x-shockwave-flash';
    obj.data = url;
    obj.appendChild(param('FlashVars', 'callback=' + readyCallback));
    obj.appendChild(param('allowscriptaccess', 'always'));
    return obj;
}

log('loading...');
var swf = flashObject('demo.swf', 'readyCallback');
document.body.appendChild(swf);

function setupDemo(func, argSets, tempRet) {
    document.getElementById(func).addEventListener('click', function() {
        argSets.forEach(function(args) {
            console.log(swf.run, func, args);
            var ret = swf.run(func, args);
            var msg = 'func(' + args.join(', ') + ') -> ' + ret;
            if (tempRet) {
                msg += ', ' + swf.run('getTempRet0');
            }
            log(msg);
        });
    });
}

setupDemo('sample_add_i32', [[42, 3]]);
setupDemo('sample_add_i64', [[42, 0, 3, 0]], true);
setupDemo('sample_add_f32', [[42.1, 3.2]]);
setupDemo('sample_add_f64', [[42.1, 3.2]]);
setupDemo('mandelbrot', [
    [1000, 0, 0],
    [1000, -2, -2],
    [1000, 2, 2],
    [1000, -1.5, -1],
]);


