package {
    import flash.display.Sprite;
    import flash.external.ExternalInterface;

    import flash.display.Loader;
    import flash.system.ApplicationDomain;

    public class Demo extends Sprite {
        private var callback:String;

        public function Demo() {
            callback = loaderInfo.parameters.callback;
            ExternalInterface.addCallback('run', run);
            ExternalInterface.call(callback + '()');
        }

        private function run(func:String, args:Array):* {
            return func;
        }
    }
}
