.PHONY : all clean

all : sample.wat

clean :
	rm -f sample.wat sample.wasm

sample.wat : sample.wasm
	wasm-dis sample.wasm > sample.wat

sample.wasm : sample.c
	emcc -o sample.wasm -O2 --profiling -s STANDALONE_WASM=1 -s EXPORTED_FUNCTIONS='["_sample_add_i32","_sample_add_i64","_sample_add_f32","_sample_add_f64","_mandelbrot","_filter_line","_palette_16color","_func_fetch","_func_invoke"]' sample.c
