const fs = require('fs');

let wasm = fs.readFileSync('sample.wasm');
let mod = new WebAssembly.Module(wasm);
let imports = {};
let inst = new WebAssembly.Instance(mod, imports);

console.log('i32: 42 + 3 == ' + inst.exports.sample_add_i32(42, 3));
//console.log('i64: 42 + 3 == ' + inst.exports.sample_add_i64(42u, 3u)); // cannot run yet
console.log('f32: 42 + 3 == ' + inst.exports.sample_add_f32(42, 3));
console.log('f64: 42 + 3 == ' + inst.exports.sample_add_f64(42, 3));

let coords = [
    [0, 0],
    [-2, -2],
    [2, 2],
    [-1.5, -1],
];
for (let [cx, cy] of coords) {
    let n = inst.exports.mandelbrot(1000, cx, cy);
    console.log([cx, cy], '->', n);
}
