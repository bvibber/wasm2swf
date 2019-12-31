package {
    import flash.display.Sprite;
    import flash.external.ExternalInterface;
    import flash.events.Event;

    public class Demo extends Sprite {
        private var callback:String;
        private var loader:ClassLoader;
        private var instance:Object;
        private var tempRet0:int;

        public function Demo() {
            callback = loaderInfo.parameters.callback;
            ExternalInterface.addCallback('run', run);

            try {
                loader = new ClassLoader();
                loader.addEventListener(ClassLoader.LOAD_ERROR, loadErrorHandler);
                loader.addEventListener(ClassLoader.CLASS_LOADED, classLoadedHandler);
                loader.load("module.swf");
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
    }
}
