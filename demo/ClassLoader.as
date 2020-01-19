package {
    // From AS3 sample code
    // https://help.adobe.com/en_US/FlashPlatform/reference/actionscript/3/flash/system/ApplicationDomain.html

    import flash.display.Loader;
    import flash.errors.IllegalOperationError;
    import flash.events.Event;
    import flash.events.EventDispatcher;
    import flash.events.IOErrorEvent;
    import flash.events.SecurityErrorEvent;
    import flash.net.URLRequest;
    import flash.system.ApplicationDomain;
    import flash.system.LoaderContext;

    public class ClassLoader extends EventDispatcher {
        public static var CLASS_LOADED:String = "classLoaded";
        public static var LOAD_ERROR:String = "loadError";
        private var loader:Loader;
        private var swfLib:String;
        private var request:URLRequest;
        private var loadedClass:Class;

        public function ClassLoader() {
            loader = new Loader();
            loader.contentLoaderInfo.addEventListener(Event.COMPLETE,completeHandler);
            loader.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR,ioErrorHandler);
            loader.contentLoaderInfo.addEventListener(SecurityErrorEvent.SECURITY_ERROR,securityErrorHandler);
        }

        public function load(lib:String):void {
            swfLib = lib;
            request = new URLRequest(swfLib);
            var context:LoaderContext = new LoaderContext();
            // context.applicationDomain = ApplicationDomain.currentDomain;
            context.applicationDomain = new ApplicationDomain();
            loader.load(request,context);
        }

        public function getClass(className:String):Class {
            try {
                return loader.contentLoaderInfo.applicationDomain.getDefinition(className)  as  Class;
            } catch (e:Error) {
                throw new IllegalOperationError(className + " definition not found in " + swfLib);
            }
            return null;
        }

        private function completeHandler(e:Event):void {
            dispatchEvent(new Event(ClassLoader.CLASS_LOADED));
        }

        private function ioErrorHandler(e:Event):void {
            dispatchEvent(new Event(ClassLoader.LOAD_ERROR));
        }

        private function securityErrorHandler(e:Event):void {
            dispatchEvent(new Event(ClassLoader.LOAD_ERROR));
        }
    }
}