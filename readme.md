# wasm2abc

A highly experimental WebAssembly to ActionScript 3 bytecode compiler.

## Implementation details

### Wasm and AVM2 similaries

Both WebAssembly and AVM2 bytecode are for a stack-based virtual machine, with typed values. AVM2 supports various magic OO and string stuff we won't use much, but doesn't support some arithmetic types we could use.

Linear memory maps well to use of a ByteArray linked up to "domain memory", with optimized load and store instructions.

Arguments and locals go into a register-like list of locals with compile-time constant indexes on the get/set opcodes, which is very similar.

Globals can live in an array; function imports and local function references can live in the closure. The dynamic function table can be an array.

### Impedence mismatches

64-bit integer `i64` operations are not supported in the AVM2 virtual machine, but binaryen can lower these to 32-bit operations in an existing transformation pass, which will be used here. At the function boundary level, it will be similar to JS legalization in emscripten, with `i64` arguments passed as pairs of (low word, high word) and returned as low word in return value with high word in `getTempRet()`.

`f32` operations are not available either, as with JavaScript it supports 64-bit doubles only. Explicit rounding could be introduced, or it could be approximated.

Question: Are unaligned loads and stores supported?

AVM2 has separate `integer` and `uinteger` types for 32-bit values; we'll use integer primarily and convert when needed?

Branches are emitted with byte offsets in the bytecode stream, so need to be translated from labels on the emitter. Labels must be emitted too? At least for backwards branches.

### Possible optimizations

Patterns to match:
* increment, decrement opcodes to replace add/subtract by 1/-1
* inc_local / dec_local to replace get-inc-set
* if (a condition-op b) -> if-condition (a, b)


