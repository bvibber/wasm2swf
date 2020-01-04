package {
    import flash.display.Sprite;
    import flash.external.ExternalInterface;
    import flash.events.Event;
    import flash.utils.ByteArray;
    import flash.utils.Endian;

    public class Demo extends Sprite {
        private var callback:String;
        private var moduleName:String;
        private var loader:ClassLoader;
        private var instance:Object;
        private var exports:Object;
        private var memory:ByteArray;

        private var tempRet0:int;
        private var scratch:ByteArray;
        private var privateUse:Array;
        private var setjmpId:int;

        public function Demo() {
            scratch = new ByteArray();
            scratch.endian = Endian.LITTLE_ENDIAN;
            scratch.length = 8;

            privateUse = [];
            for (var i:int = 0; i < 256; i++) {
                privateUse[i] = String.fromCharCode(0xe000 + i);
            }

            callback = loaderInfo.parameters.callback;
            moduleName = loaderInfo.parameters.module;
            ExternalInterface.addCallback('run', run);
            ExternalInterface.addCallback('getTempRet0', getTempRet0);
            ExternalInterface.addCallback('readBytes', readBytes);
            ExternalInterface.addCallback('writeBytes', writeBytes);
            ExternalInterface.addCallback('readBinary', readBinary);
            ExternalInterface.addCallback('writeBinary', writeBinary);
            ExternalInterface.addCallback('readString', readString);

            try {
                loader = new ClassLoader();
                loader.addEventListener(ClassLoader.LOAD_ERROR, loadErrorHandler);
                loader.addEventListener(ClassLoader.CLASS_LOADED, classLoadedHandler);
                loader.load(moduleName + '?' + Math.random());
            } catch (e:Error) {
                ExternalInterface.call(callback, 'error', ['exception']);
            }
        }

        private function loadErrorHandler(e:Event):void {
            ExternalInterface.call(callback, 'error', ['load error']);
        }

        private function classLoadedHandler(e:Event):void {
            try {
                var Instance:Class = loader.getClass("Instance");
                instance = new Instance({
                    env: {
                        // Demuxer callbacks
                        ogvjs_callback_video_packet: makeCallback('ogvjs_callback_video_packet'),
                        ogvjs_callback_audio_packet: makeCallback('ogvjs_callback_audio_packet'),
                        ogvjs_callback_loaded_metadata: makeCallback('ogvjs_callback_loaded_metadata'),

                        // Video decoder callbacks
                        ogvjs_callback_init_video: makeCallback('ogvjs_callback_init_video'),
                        ogvjs_callback_frame: makeCallback('ogvjs_callback_frame'),
                        ogvjs_callback_async_complete: makeCallback('ogvjs_callback_async_complete'),

                        // emscripten internals
                        emscripten_notify_memory_growth: emscripten_notify_memory_growth,
                        __syscall3: __syscall3,

                        // wasm2js internals
                        getTempRet0: getTempRet0,
                        setTempRet0: setTempRet0,
                        wasm2js_scratch_load_i32: wasm2js_scratch_load_i32,
                        wasm2js_scratch_load_i64: wasm2js_scratch_load_i64,
                        wasm2js_scratch_load_f32: wasm2js_scratch_load_f32,
                        wasm2js_scratch_load_f64: wasm2js_scratch_load_f64,
                        wasm2js_scratch_store_i32: wasm2js_scratch_store_i32,
                        wasm2js_scratch_store_i64: wasm2js_scratch_store_i64,
                        wasm2js_scratch_store_f32: wasm2js_scratch_store_f32,
                        wasm2js_scratch_store_f64: wasm2js_scratch_store_f64,

                        // emscripten exception / longjmp helpers
                        emscripten_longjmp: function(env:int, val:int):void {
                            exports.setThrew(env, val || 1);
                            throw "longjmp";
                        },
                        saveSetjmp: function saveSetjmp(env:int, label:int, table:int, size:int):int {
                            var i:int = 0;
                            setjmpId++;
                            memory.position = env;
                            memory.writeInt(setjmpId);
                            while (i < size) {
                                memory.position = table + (i << 3);
                                if (memory.readInt() == 0) {
                                    memory.position = table + (i << 3);
                                    memory.writeInt(setjmpId);
                                    memory.writeInt(label);
                                    memory.writeInt(0);
                                    setTempRet0(size);
                                    return table;
                                }
                                i++;
                            }
                            size *= 2;
                            table = exports.realloc(table, 8 * (size + 1));
                            table = saveSetjmp(env, label, table, size);
                            setTempRet0(size);
                            return table;
                        },
                        testSetjmp: function testSetjmp(id:int, table:int, size:int):int {
                            var i:int, curr:int;
                            while (i < size) {
                                memory.position = table + (i << 3);
                                curr = memory.readInt();
                                if (curr == 0) break;
                                if (curr == id) {
                                    return memory.readInt();
                                }
                                i++;
                            }
                            return 0;
                        },
                        invoke_vi: function(func:int, arg1:int):void {
                            var stackPtr:int = exports.stackSave();
                            try {
                                exports.dynCall_vi(func, arg1);
                            } catch (e:String) {
                                exports.stackRestore(stackPtr);
                                exports.setThrew(1, 0);
                            } catch (e:Error) {
                                exports.stackRestore(stackPtr);
                                throw e;
                            }
                        },
                        invoke_viiii: function(func:int, arg1:int, arg2:int, arg3:int, arg4:int):void {
                            var stackPtr:int = exports.stackSave();
                            try {
                                exports.dynCall_viiii(func, arg1, arg2, arg3, arg4);
                            } catch (e:String) {
                                exports.stackRestore(stackPtr);
                                exports.setThrew(1, 0);
                            } catch (e:Error) {
                                exports.stackRestore(stackPtr);
                                throw e;
                            }
                        },
                        invoke_iii: function(func:int, arg1:int, arg2:int):int {
                            var stackPtr:int = exports.stackSave();
                            try {
                                return exports.dynCall_iii(func, arg1, arg2);
                            } catch (e:String) {
                                exports.stackRestore(stackPtr);
                                exports.setThrew(1, 0);
                            } catch (e:Error) {
                                exports.stackRestore(stackPtr);
                                throw e;
                            }
                            return 0; // ??
                        },
                        invoke_iiii: function(func:int, arg1:int, arg2:int, arg3:int):int {
                            var stackPtr:int = exports.stackSave();
                            try {
                                return exports.dynCall_iiii(func, arg1, arg2, arg3);
                            } catch (e:String) {
                                exports.stackRestore(stackPtr);
                                exports.setThrew(1, 0);
                            } catch (e:Error) {
                                exports.stackRestore(stackPtr);
                                throw e;
                            }
                            return 0; // ??
                        },
                        invoke_iiiij: function(func:int, arg1:int, arg2:int, arg3:int, arg4lo:int, arg4hi:int):int {
                            var stackPtr:int = exports.stackSave();
                            try {
                                return exports.dynCall_iiiij(func, arg1, arg2, arg3, arg4lo, arg4hi);
                            } catch (e:String) {
                                exports.stackRestore(stackPtr);
                                exports.setThrew(1, 0);
                            } catch (e:Error) {
                                exports.stackRestore(stackPtr);
                                throw e;
                            }
                            return 0; // ??
                        }
                    },
                    wasi_snapshot_preview1: {
                        proc_exit: wasi_proc_exit,
                        fd_write: wasi_fd_write,
                        fd_close: wasi_fd_close
                    }
                });
                exports = instance.exports;
                memory = exports.memory;

                ExternalInterface.call(callback, 'ready', []);
            } catch (e:Error) {
                ExternalInterface.call(callback, 'error', ['instantiation error ' + e.getStackTrace()]);
            }
        }

        private function run(func:String, args:Array):* {
            try {
                trace('mem length: ' + memory.length);
                return exports[func].apply(instance, args);
            } catch (e:Error) {
                return 'error: ' + e + '\n' + e.getStackTrace();
            }
        }

        private function makeCallback(funcName:String):Function {
            return function(...args):* {
                return ExternalInterface.call(callback, funcName, args);
            }
        }

        private function emscripten_notify_memory_growth():void {
            //
        }

        private function wasm2js_scratch_load_i32(i:int):int {
            scratch.position = i << 2;
            return scratch.readInt();
        }

        private function wasm2js_scratch_load_i64():int {
            var low:int, high:int;
            scratch.position = 0;
            low = scratch.readInt();
            high = scratch.readInt();
            setTempRet0(high);
            return low;
        }

        private function wasm2js_scratch_load_f32():Number {
            scratch.position = 0;
            return scratch.readFloat();
        }

        private function wasm2js_scratch_load_f64():Number {
            scratch.position = 0;
            return scratch.readDouble();
        }

        private function wasm2js_scratch_store_i32(i:int, val:int):void {
            scratch.position = i << 2;
            scratch.writeInt(val);
        }

        private function wasm2js_scratch_store_i64(low:int, high:int):void {
            scratch.position = 0;
            scratch.writeInt(low);
            scratch.writeInt(high);
        }

        private function wasm2js_scratch_store_f32(val:Number):void {
            scratch.position = 0;
            scratch.writeFloat(val);
        }

        private function wasm2js_scratch_store_f64(val:Number):void {
            scratch.position = 0;
            scratch.writeDouble(val);
        }

        private function __syscall3(which:int, varargs:int):int {
            return -1;
        }

        private function wasi_proc_exit():int {
            throw new Error("proc_exit");
        }

        private function wasi_fd_write():int {
            return -1;
        }

        private function wasi_fd_close():int {
            return -1;
        }

        private function getTempRet0():int {
            return tempRet0;
        }

        private function setTempRet0(val:int):void {
            tempRet0 = val;
        }

        private function readBytes(offset:int, len:int):Array {
            var arr:Array = new Array(len);
            for (var i:int = 0; i < len; i++) {
                arr[i] = memory[offset + i];
            }
            return arr;
        }

        private function readBinary(offset:int, len:int):String {
            var arr:Array = new Array(len);
            for (var i:int = 0; i < len; i++) {
                arr[i] = privateUse[memory[offset + i]];
            }
            return arr.join('');
        }

        private function writeBytes(offset:int, bytes:Array):void {
            var len:int = bytes.length;
            for (var i:int = 0; i < len; i++) {
                memory[offset + i] = bytes[i];
            }
        }

        private function writeBinary(offset:int, str:String):void {
            var len:int = str.length;
            for (var i:int = 0; i < len; i++) {
                memory[offset + i] = str.charCodeAt(i) & 0xff;
            }
        }

        private function readString(offset:int):String {
            var len:int = 0;
            while (memory[offset + len]) {
                // Find the null terminator
                len++;
            }
            memory.position = offset;
            return memory.readUTFBytes(len);
        }

    }
}
