package {
    trace("Testing wasm2swf...");

    var tempRet0:int = 0;
    var inst:Instance = new Instance({
        env: {
            setTempRet0: function(val:int):void {
                tempRet0 = val;
            },
            getTempRet0: function():int {
                return tempRet0;
            }
        }
    });

    trace('i32: 42 + 3 == ' + inst.exports.sample_add_i32(42, 3));
    trace('i64: 42 + 3 == ' + inst.exports.sample_add_i64(42, 0, 3, 0) + ', ' + tempRet0);
    trace('f32: 42.1 + 3.2 == ' + inst.exports.sample_add_f32(42.1, 3.2));
    trace('f64: 42.1 + 3.2 == ' + inst.exports.sample_add_f64(42.1, 3.2));

    var coords:Array = [
        [0, 0],
        [-2, -2],
        [2, 2],
        [-1.5, -1],
    ];
    for (var i:int = 0; i < coords.length; i++) {
        var cx:Number = coords[i][0];
        var cy:Number = coords[i][1];
        var n:int = inst.exports.mandelbrot(1000, cx, cy);
        trace(cx + ', ' + cy + ' -> ' + n);
    }

    trace('Done!');
}
