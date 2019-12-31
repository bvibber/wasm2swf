package {
    import flash.display.Sprite;
    import flash.external.ExternalInterface;
    import flash.events.Event;
    import flash.utils.ByteArray;

    public class Demo extends Sprite {
        private var callback:String;
        private var loader:ClassLoader;
        private var instance:Object;
        private var tempRet0:int;

        public function Demo() {
            callback = loaderInfo.parameters.callback;
            ExternalInterface.addCallback('run', run);
            ExternalInterface.addCallback('getTempRet0', getTempRet0);
            ExternalInterface.addCallback('readBytes', readBytes);
            ExternalInterface.addCallback('writeBytes', writeBytes);

            try {
                loader = new ClassLoader();
                loader.addEventListener(ClassLoader.LOAD_ERROR, loadErrorHandler);
                loader.addEventListener(ClassLoader.CLASS_LOADED, classLoadedHandler);
                loader.load("module.swf" + '?' + Math.random());
            } catch (e:Error) {
                ExternalInterface.call(callback, false, 'exception');
            }
            //ExternalInterface.call(callback, true);
        }

        private function loadErrorHandler(e:Event):void {
            ExternalInterface.call(callback, false, 'load error');
        }

        private function classLoadedHandler(e:Event):void {
            try {
                var Instance:Class = loader.getClass("Instance");
                instance = new Instance({
                    env: {
                        getTempRet0:function():int {
                            return tempRet0;
                        },
                        setTempRet0:function(val:int):void {
                            tempRet0 = val;
                        }
                    }
                });

                ExternalInterface.call(callback, true);
            } catch (e:Error) {
                ExternalInterface.call(callback, false, 'instantiation error');
            }
        }

        private function run(func:String, args:Array):* {
            try {
                return instance.exports[func].apply(instance, args);
            } catch (e:Error) {
                return 'error: ' + e;
            }
        }

        private function getTempRet0():int {
            return tempRet0;
        }

        private function readBytes(offset:int, len:int):Array {
            var memory:ByteArray = instance.exports.memory;
            var arr:Array = new Array(len);
            for (var i:int = 0; i < len; i++) {
                arr[i] = memory[offset + i];
            }
            return arr;
        }

        private function writeBytes(offset:int, bytes:Array):void {
            var memory:ByteArray = instance.exports.memory;
            var len:int = bytes.length;
            for (var i:int = 0; i < len; i++) {
                memory[offset + i] = bytes[i];
            }
        }
    }
}
