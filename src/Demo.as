package {
    import flash.display.Sprite;
    import flash.external.ExternalInterface;
    import flash.events.Event;
    import flash.utils.ByteArray;
    import flash.utils.Endian;

    public class Demo extends Sprite {
        private var callback:String;
        private var loader:ClassLoader;
        private var instance:Object;
        private var tempRet0:int;
        private var scratch:ByteArray;
        private var privateUse:Array;

        public function Demo() {
            scratch = new ByteArray();
            scratch.endian = Endian.LITTLE_ENDIAN;
            scratch.length = 8;

            privateUse = [];
            for (var i:int = 0; i < 256; i++) {
                privateUse[i] = String.fromCharCode(0xe000 + i);
            }

            callback = loaderInfo.parameters.callback;
            ExternalInterface.addCallback('run', run);
            ExternalInterface.addCallback('getTempRet0', getTempRet0);
            ExternalInterface.addCallback('readBytes', readBytes);
            ExternalInterface.addCallback('writeBytes', writeBytes);
            ExternalInterface.addCallback('readBytesStr', readBytesStr);
            ExternalInterface.addCallback('writeBytesStr', writeBytesStr);
            ExternalInterface.addCallback('readString', readString);

            try {
                loader = new ClassLoader();
                loader.addEventListener(ClassLoader.LOAD_ERROR, loadErrorHandler);
                loader.addEventListener(ClassLoader.CLASS_LOADED, classLoadedHandler);
                loader.load("ogv-demuxer-ogg.swf" + '?' + Math.random());
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
                        ogvjs_callback_video_packet: ogvjs_callback_video_packet,
                        ogvjs_callback_audio_packet: ogvjs_callback_audio_packet,
                        ogvjs_callback_loaded_metadata: ogvjs_callback_loaded_metadata,
                        emscripten_notify_memory_growth: emscripten_notify_memory_growth,
                        __syscall3: __syscall3,
                        getTempRet0: getTempRet0,
                        setTempRet0: setTempRet0,
                        wasm2js_scratch_load_i32: wasm2js_scratch_load_i32,
                        wasm2js_scratch_load_i64: wasm2js_scratch_load_i64,
                        wasm2js_scratch_load_f32: wasm2js_scratch_load_f32,
                        wasm2js_scratch_load_f64: wasm2js_scratch_load_f64,
                        wasm2js_scratch_store_i32: wasm2js_scratch_store_i32,
                        wasm2js_scratch_store_i64: wasm2js_scratch_store_i64,
                        wasm2js_scratch_store_f32: wasm2js_scratch_store_f32,
                        wasm2js_scratch_store_f64: wasm2js_scratch_store_f64
                    }
                });

                ExternalInterface.call(callback, 'ready', []);
            } catch (e:Error) {
                ExternalInterface.call(callback, 'error', ['instantiation error']);
            }
        }

        private function run(func:String, args:Array):* {
            try {
                return instance.exports[func].apply(instance, args);
            } catch (e:Error) {
                return 'error: ' + e + '\n' + e.getStackTrace();
            }
        }

        private function ogvjs_callback_video_packet(buffer:int, len:int, frameTimestamp:Number, keyframeTimestamp:Number, isKeyframe:Boolean):void {
            //ExternalInterface.call(callback, 'ogvjs_callback_video_packet', [readBytesStr(buffer, len), frameTimestamp, keyframeTimestamp, isKeyframe]);
        }

        private function ogvjs_callback_audio_packet(buffer:int, len:int, audioTimestamp:Number, discardPadding:Number):void {
            //ExternalInterface.call(callback, 'ogvjs_callback_audio_packet', [readBytesStr(buffer, len), audioTimestamp, discardPadding]);
        }

        private function ogvjs_callback_loaded_metadata(videoCodec:int, audioCodec:int):void {
            //ExternalInterface.call(callback, 'ogvjs_callback_loaded_metadata', [readString(videoCodec), readString(audioCodec)]);
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

        private function getTempRet0():int {
            return tempRet0;
        }

        private function setTempRet0(val:int):void {
            tempRet0 = val;
        }

        private function readBytes(offset:int, len:int):Array {
            var memory:ByteArray = instance.exports.memory;
            var arr:Array = new Array(len);
            for (var i:int = 0; i < len; i++) {
                arr[i] = memory[offset + i];
            }
            return arr;
        }

        private function readBytesStr(offset:int, len:int):String {
            var memory:ByteArray = instance.exports.memory;
            var arr:Array = new Array(len);
            for (var i:int = 0; i < len; i++) {
                arr[i] = privateUse[memory[offset + i]];
            }
            return arr.join('');
        }

        private function writeBytes(offset:int, bytes:Array):void {
            var memory:ByteArray = instance.exports.memory;
            var len:int = bytes.length;
            for (var i:int = 0; i < len; i++) {
                memory[offset + i] = bytes[i];
            }
        }

        private function writeBytesStr(offset:int, str:String):void {
            var memory:ByteArray = instance.exports.memory;
            var len:int = str.length;
            for (var i:int = 0; i < len; i++) {
                memory[offset + i] = str.charCodeAt(i) & 0xff;
            }
        }

        private function readString(offset:int):String {
            var memory:ByteArray = instance.exports.memory;
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
