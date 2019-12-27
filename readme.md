# wasm2swf

A highly experimental WebAssembly to ActionScript (AVM2) bytecode compiler.

**`wasm2swf` is a work in progress and doesn't quite produce valid output yet.**

## What?

This aims to be a tool that compiles standalone WebAssembly modules (`.wasm`) into ActionScript bytecode (`.abc`) files implementing a class which can be loaded and used by ActionScript 3 code in a Flash "movie" (`.swf`).

## Why?

Niche interest: for legacy Internet Explorer 11 support, JavaScript cross-compilation with emscripten or wasm2js produces workable code but has relatively poor performance and lacks threading. Since IE 11 comes with Flash (assuming Microsoft or Adobe don't flip a global kill switch) and Flash's ActionScript Virtual Machine (AVM2) is in some ways more advanced, it's worth investigating conversion.

## How?

The old FlasCC/CrossBridge compiler for C/C++ is an existence proof for the possibility of running C-like code in AVM2. The frontend compilers are done for us from whatever produced the WebAssembly, so it has a smaller footprint than an entire compiler set.

### Wasm and AVM2 similaries

Both WebAssembly and AVM2 bytecode are for a stack-based virtual machine, with typed values including 32-bit integers and floating point. AVM2 supports various magic OO and string stuff we won't use much here.

Linear memory maps well to use of a ByteArray linked up to "domain memory", with optimized load and store instructions. However it may be necessary to reestablish the domain memory linkage at the wasm2swf <-> ActionScript call boundary, as it's global state.

Arguments and locals go into a register-like list with compile-time constant indexes on the get/set opcodes, which is very similar. (The indexes must be offset by one, as index 0 holds the ActionScript `this` argument.)

Globals and function imports can live as indexed property slots on the module instance; local function references as indexed methods for direct calls. The dynamic function table for indirect calls can be an array, itself living as a property on the module.

I'm not sure if the indexed properties and methods will be more performant than the emscripten/wasm2js-style use of a scope closure, as long as the names are bound at compile time. Could try it both ways maybe.

### Impedence mismatches

64-bit integer `i64` operations are not supported in the AVM2 virtual machine, but binaryen can lower these to 32-bit operations in an existing transformation pass, which is used here. At the function boundary level, it will be similar to JS legalization in emscripten, with `i64` arguments passed as pairs of (low word, high word) and returned as low word in return value with high word in `getTempRet()`.

`f32` operations are not available either; as with JavaScript it supports 64-bit doubles only. Explicit rounding could be introduced at some performance cost, but for now 32-bit float values are approximated with doubles.

Question: Are unaligned loads and stores supported? Doesn't indicate not, so hope so.

AVM2 has separate `int` and `uint` types for 32-bit values; we use integer primarily and convert when needed to perform unsigned operations.

Branches are emitted with byte offsets in the bytecode stream, so need to be translated from labels on the bytecode emitter. Labels must be emitted too, at least for backwards branches. There may be some improvements left to go in label handling.

## Binaryen details

binaryen.js is used to parse, optimize, and transform the WebAssembly input binary, and then walk the list of functions and instructions so they can be transformed to ActionScript bytecode ops. I stand on the shoulders of giants.

Most of the same passes from binaryen's wasm2js tool are used here. The wasm2js 'scratch' helper functions for reinterpret operations are also added manually as imports, which are not yet filled out.

Some additional transformations are made during the tree walk/translation phase within wasm2swf.

### Optimizations

Patterns to match:
* increment_i, decrement_i opcodes to replace add/subtract by 1/-1
* inc_local / dec_local to replace get-inc-set
* if + condition -> if-not-condition
* ??

## Todo

* write full bytecode for constructor
    * set the application domain memory
    * memory data segments
    * function table segments (needs upstream work in binaryen's C and JS APIs)
* write bytecode for import stubs (or else call imports as lexical lookups?)
* write bytecode for the scratch helper functions
* export the class for the module
* write some kind of test harness in AS3 + JS + HTML
* hope things validate
* bash head against wall
* don't give up!

## Comparisons with FlasCC/CrossBridge

Comparing some old code compiled with CrossBridge, noticed some things there:
* use of locals is similar. they get initialized to 0 at beginning of function.
* stack pointer is in an ESP variable in the target namespace scope chain.
* add/subtract are done with the generic opcodes, then convert_i, rather than using add_i/subtract_i. weird!
* calls are done with findpropstrict+callprop/callpropvoid, by name reference, not method invocation.
* function symbols start with F, eg Fmemcpy
* function args and return values are _not_ mapped directly to function args and return values. what? they appear to be passed through stack memory for args, and variables in a surrounding scope for return values: eax and edx. :D

ESP read:

```
        getlex          com.brionv.ogvlibs:ESP
        convert_i
        setlocal1
```

ESP write:

```
        getlocal3
        findproperty    com.brionv.ogvlibs:ESP
        swap
        setproperty     com.brionv.ogvlibs:ESP
```

Calls:

```
        findpropstrict  com.brionv.ogvlibs:Fmemcpy
        callpropvoid    com.brionv.ogvlibs:Fmemcpy (0)
```

## ActionScript API

The intent is to provide a similar API to WebAssembly's JS API,
but with precompiled modules that can be used to instantiate from rather than taking ArrayBuffers or input streams.

Have not yet decided if it's necessary to mess around with sharing an application domain with a linked app, or if it's best to use Loader to separate stuff.


