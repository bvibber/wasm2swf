function log(str) {
    var text = document.createTextNode(str);
    var p = document.createElement('p');
    p.appendChild(text);
    document.getElementById('log').appendChild(p);
}

function readyCallback() {
    log('ready!');
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
