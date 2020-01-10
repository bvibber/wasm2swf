# wasm2swf

A highly experimental WebAssembly to ActionScript (AVM2) bytecode compiler.

**`wasm2swf` is a work in progress; it produces working output but needs API improvements.**

## What?

This aims to be a tool that compiles standalone WebAssembly modules (`.wasm`) into ActionScript bytecode (`.abc`) implementing a class which can be loaded and used by ActionScript 3 code in a Flash "movie" (`.swf`).

## Why?

Niche interest: for legacy Internet Explorer 11 support, JavaScript cross-compilation with emscripten or wasm2js produces workable code but has relatively poor performance and lacks threading. Since IE 11 comes with Flash (assuming Microsoft or Adobe don't flip a global kill switch) and Flash's ActionScript Virtual Machine (AVM2) is in some ways more advanced, it's worth investigating conversion.

In testing with Theora, VP8, and VP9 video codecs performance is roughly 2x faster than `wasm2js`'s output in IE 11, but 2-3x slower than native WebAssembly in current browsers.

However if that kill switch arrives at the end of 2020 as planned, updated Windows machines will stop being able to run it in IE 11. So this is a bit of an academic exercise. There may be some use for folks integrating new code into legacy Air desktop applications.

## How?

The old Alchemy/FlasCC/CrossBridge compiler for C/C++ is an existence proof for the possibility of running C-like code in AVM2. In contrast, here the frontend compilers are done for us from whatever produced the WebAssembly, so `wasm2swf` has a smaller footprint than an entire compiler set.

### Wasm and AVM2 similaries

Both WebAssembly and AVM2 bytecode are for a stack-based virtual machine, with typed values including 32-bit integers and floating point. AVM2 supports various magic OO and string stuff we won't use much here.

Linear memory maps well to use of a ByteArray linked up to "domain memory", with optimized load and store instructions. However it may be necessary to reestablish the domain memory linkage at the wasm2swf <-> ActionScript call boundary, as it's global state.

Arguments and locals go into a register-like list with compile-time constant indexes on the get/set opcodes, which is very similar. (The indexes must be offset by one, as index 0 holds the ActionScript `this` argument.)

Globals and function imports can live as property slots on the module instance; local function references as methods for direct calls. The dynamic function table for indirect calls can be an array, itself living as a property on the module.

I'm not sure if the properties and methods will be more performant than the emscripten/wasm2js-style use of a scope closure, as long as the names are bound at compile time. Could try it both ways maybe.

### Impedence mismatches

64-bit integer `i64` operations are not supported in the AVM2 virtual machine, but binaryen can lower these to 32-bit operations in an existing transformation pass, which is used here. At the function boundary level, it will be similar to JS legalization in emscripten, with `i64` arguments passed as pairs of (low word, high word) and returned as low word in return value with high word in `getTempRet()`.

`f32` operations are not available either; as with JavaScript it supports 64-bit doubles only. Explicit rounding could be introduced at some performance cost, but for now 32-bit float values are approximated with doubles.

Unaligned loads and stores are supported, so alignment lowering is not required as in wasm2js.

AVM2 has separate `int` and `uint` types for 32-bit values; we use integer primarily and convert when needed to perform unsigned operations.

Branches are emitted with byte offsets in the bytecode stream, so need to be translated from labels on the bytecode emitter. Labels must be emitted too, at least for backwards branches. There may be some improvements left to go in label handling.

A couple operations use different stack argument order between the two, like memory stores and indirect calls. These are reordered to match when they have no side effects, or use temporary local variables to preserve execution order.

## Translation details

binaryen.js is used to parse, optimize, and transform the WebAssembly input binary, and then walk the list of functions and instructions so they can be transformed to ActionScript bytecode ops. I stand on the shoulders of giants.

Most of the same passes from binaryen's wasm2js tool are used here. The wasm2js 'scratch' helper functions for reinterpret operations are also added manually as imports, which are not yet filled out.

Some additional transformations are made during the tree walk/translation phase within wasm2swf.

### Internals

The `WebAssembly.Instance` class analogue holds the internals of a compiled module in private namespace properties and methods:
* the memory `ByteArray` lives on a property named `wasm$memory`
* the function table `Array` lives on a property named `wasm$table`
* imports live in properties named `import$modulename$basename`
* functions live in methods named `func$symbolname`; for imported functions a wrapper here with proper type annotations calls the imported symbol
* global vars live in properties named `global$symbolname`
* exports are attached to props on a public `Object` property named `exports`

Currently, `wasm2swf`/`wasm2js`-specific imports need to be manually set up on the imports object passed to the constructor. These will be set up internally in a bit.

Static constructors are not yet initialized automatically, so some modules may require a manual call to the start function.

### Optimizations

Patterns matched:
* `increment_i`, `decrement_i` opcodes to replace add/subtract by 1/-1
* `inc_local` / `dec_local` to replace get-inc-set
* `br_if` + condition -> if-condition
* `select` + condition -> if-condition
* `if` + condition -> if-not-condition

## Todo

* finish the constructor
    * init function table segments (works but uses a patched binaryen)
    * call the start function
* write bytecode for the scratch helper functions
* clean up special wasm2js-related imports (`setTempRet0`, `getTempRet0`, scratch helpers)
* compress with lzma
* proper namespacing/classes for the API
* test bigger codebases like vpx, dav1d
* `.swc` output for static linking

## Comparisons with Alchemy/FlasCC/CrossBridge

Comparing some old code compiled with CrossBridge, noticed some things there:
* use of locals is similar. they get initialized to 0 at beginning of function.
* stack pointer is in an `ESP` var, similar to our use of a wasm global
* integer `add`/`subtract` are done with the generic opcodes, then `convert_i`, rather than using `add_i`/`subtract_i`. weird!
* function symbols start with `F`, eg `Fmemcpy`
* function args and return values are _not_ mapped directly to function args and return values. what? they appear to be passed through stack memory for args, and `eax` and `edx` vars similar to our use of a `tempRet0` for 64-bit high words, but for both words

## ActionScript API

The intent is to provide a similar API to WebAssembly's JS API, but with precompiled modules that can be used to instantiate from rather than taking buffers or input streams.

Currently namespacing is off, it'll be cleaned up soon.

An `Instance` is instantiated with the two-level imports object. Currently this must include an `env` property with `setTempRet0` and `getTempRet0` functions for managing the 64-bit return value high word, and may need some other bits to work. These will be hidden away as internal implementation details later.

```
var tempRet0:int = 0;
var instance:Object instance = new Instance({
    env: {
        getTempRet0:function():int {
            return tempRet0;
        },
        setTempRet0:function(val:int):void {
            tempRet0 = val;
        }
    }
});
```

Exported functions, memory and function tables are available through the `exports` object property:

```
var result:int = instance.exports.sample_add_i32(1920, 100);
```

### Runtime module loading

The current demo has a frontend `demo.swf` file compiled from ActionScript 3, which loads the `wasm2swf` output `module.swf` at runtime and instantiates it. The `module.swf` provides a `Sprite` subclass for the loader to instantiate, then you can fetch the `Instance` class manually from the loader.

This has a couple advantages over static linking: you can run different modules at runtime as needed, and it establishes a separate `ApplicationDomain` for each module, meaning its use of domain memory won't interfere with the parent script and vice versa.

### Non-browser usage

To efficiently use linear memory, domain memory opcodes are used for loads and stores. But configuring the `ByteArray` to use for domain memory requires use of `flash.system.ApplicationDomain` which isn't available in `avmshell`.

In theory it could work with the `redtamarin` shell, customized to use its alternate `shell.Domain` API, but it crashes when I test it.
