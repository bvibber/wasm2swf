/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/demo.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./src/demo.js":
/*!*********************!*\
  !*** ./src/demo.js ***!
  \*********************/
/*! no static exports found */
/***/ (function(module, exports) {

eval("function log(str) {\n    var text = document.createTextNode(str);\n    var p = document.createElement('p');\n    p.appendChild(text);\n    document.getElementById('log').appendChild(p);\n}\n\nvar privateUse = [];\nfor (var i = 0; i < 256; i++) {\n    privateUse[i] = String.fromCharCode(0xe000 + i);\n}\n\nfunction bytes2string(bytes) {\n    var len = bytes.length;\n    var arr = new Array(len);\n    for (var i = 0; i < len; i++) {\n        arr[i] = privateUse[bytes[i] & 0xff];\n    }\n    return arr.join('');\n}\n\nfunction string2bytes(str) {\n    var len = str.length;\n    var arr = new Uint8Array(len);\n    for (var i = 0; i < len; i++) {\n        arr[i] = str.charCodeAt(i) & 0xff;\n    }\n    return arr;\n}\n\nvar videoPackets = [];\nvar audioPackets = [];\nvar videoCodec = null;\nvar audioCodec = null;\n\nvar callbacks = {\n    ready: function() {\n        log('ready!');\n    },\n    error: function(msg) {\n        log('Flash reported error loading module.swf: ' + msg);\n    },\n    ogvjs_callback_loaded_metadata: function(aVideoCodec, anAudioCodec) {\n        videoCodec = swf.readString(aVideoCodec);\n        audioCodec = swf.readString(anAudioCodec);\n        log('video codec: ' + videoCodec);\n        log('audio codec: ' + audioCodec);\n    },\n    ogvjs_callback_video_packet: function(ptr, len, frameTimestamp, keyframeTimestamp, isKeyframe) {\n        var data = swf.readBinary(ptr, len);\n        log('video packet: ' + data.length + ' bytes at timestamp ' + frameTimestamp + (isKeyframe ? ', keyframe' : ''));\n        videoPackets.push({\n            data: data,\n            frameTimestamp: frameTimestamp,\n            keyframeTimestamp: keyframeTimestamp,\n            isKeyframe: isKeyframe\n        });\n    },\n    ogvjs_callback_audio_packet: function(ptr, len, audioTimestamp, discardPadding) {\n        var data = swf.readBinary(ptr, len);\n        log('audio packet: ' + data.length + ' bytes at timestamp ' + audioTimestamp);\n        audioPackets.push({\n            data: data,\n            audioTimestamp: audioTimestamp,\n            discardPadding: discardPadding\n        });\n    }\n};\n\nfunction readyCallback(method, args) {\n    callbacks[method].apply(null, args);\n}\nwindow.readyCallback = readyCallback;\n\nfunction param(name, value) {\n    var p = document.createElement('param');\n    p.name = name;\n    p.value = value;\n    return p;\n}\nfunction flashObject(url, readyCallback, moduleName) {\n    var obj = document.createElement('object');\n    obj.appendChild(param('FlashVars', 'callback=' + readyCallback + '&module=' + moduleName));\n    obj.appendChild(param('AllowScriptAccess', 'sameDomain'));\n    obj.width = 10;\n    obj.height = 10;\n    obj.type = 'application/x-shockwave-flash';\n    obj.data = url + '?' + Math.random();\n    return obj;\n}\n\nlog('loading ogg...');\nvar swf = flashObject('demo.swf', 'readyCallback', 'ogv-demuxer-ogg.swf');\ndocument.body.appendChild(swf);\n\nvar videoLoaded = false;\ncodecCallbacks = {\n    ready: function() {\n        log('codec ready!');\n    },\n\n    error: function(err) {\n        log('codec failed: ' + err);\n    },\n\n    ogvjs_callback_init_video: function(frameWidth, frameHeight,\n                                        chromaWidth, chromaHeight,\n                                        fps,\n                                        picWidth, picHeight,\n                                        picX, picY,\n                                        displayWidth, displayHeight)\n    {\n        videoLoaded = true;\n        log('video initialized: ' + frameWidth + 'x' + frameHeight +\n            ' (chroma ' + chromaWidth + 'x' + chromaHeight + '), ' + fps + ' fps');\n        log('picture size ' + picWidth + 'x' + picHeight + ' with crop ' + picX + ', ' + picY);\n        log('display size ' + displayWidth + 'x' + displayHeight);\n    },\n\n    ogvjs_callback_frame: function(bufferY, strideY,\n                                   bufferCb, strideCb,\n                                   bufferCr, strideCr,\n                                   frameWidth, frameHeight,\n                                   chromaWidth, chromaHeight,\n                                   picWidth, picHeight,\n                                   picX, picY,\n                                   displayWidth, displayHeight)\n    {\n        log('frame callback!')\n        log('frame size ' + frameWidth + 'x' + frameHeight +\n            ' (chroma ' + chromaWidth + 'x' + chromaHeight + ')');\n        log('picture size ' + picWidth + 'x' + picHeight + ' with crop ' + picX + ', ' + picY);\n        log('display size ' + displayWidth + 'x' + displayHeight);\n\n        log('Y buffer ' + bufferY + '; stride ' + strideY);\n        log('Cb buffer ' + bufferCb + '; stride ' + strideCb);\n        log('Cr buffer ' + bufferCr + '; stride ' + strideCr);\n        log('Cb buffer ' + bufferCb + '; stride ' + strideCb);\n    },\n\n    ogvjs_callback_async_complete: function(ret, cpuTime) {\n        log('async frame complete (should not happen');\n    }\n};\n\nfunction codecCallback(method, args) {\n    codecCallbacks[method].apply(null, args);\n}\nwindow.codecCallback = codecCallback;\n\nlog('loading theora...');\nvar codecSwf = flashObject('demo.swf', 'codecCallback', 'ogv-decoder-video-theora.swf');\ndocument.body.appendChild(codecSwf);\n\n\nfunction setupDemo(func, argSets, tempRet) {\n    document.getElementById(func).addEventListener('click', function() {\n        argSets.forEach(function(args) {\n            try {\n                var ret = swf.run(func, args);\n                var msg = func + '(' + args.join(', ') + ') -> ' + ret;\n                if (tempRet) {\n                    msg += ', ' + swf.getTempRet0();\n                }\n                log(msg);\n            } catch (e) {\n                log('error: ' + e);\n            }\n        });\n    });\n}\n/*\n\nsetupDemo('sample_add_i32', [\n    [42, 3],\n    [-10, 89],\n    [0x7fffffff, 1]\n]);\nsetupDemo('sample_add_i64', [[42, 0, 3, 0]], true);\nsetupDemo('sample_add_f32', [[42.1, 3.2]]);\nsetupDemo('sample_add_f64', [[42.1, 3.2]]);\nsetupDemo('mandelbrot', [\n    [1000, 0, 0],\n    [1000, -2, -2],\n    [1000, 2, 2],\n    [1000, -1.5, -1],\n]);\n\n\ndocument.getElementById('filter_line').addEventListener('click', function() {\n    var len = 16;\n    var dest = swf.run('malloc', [len]);\n    log('malloc(' + len + ') -> ' + dest);\n    var src = swf.run('malloc', [len]);\n    log('malloc(' + len + ') -> ' + src);\n\n    swf.writeBytes(src, [20, 30, 39, 47,  53, 58, 62, 65,  67, 68, 68, 67,  65, 62, 58, 53]);\n    log(swf.readBytes(src, len));\n\n    log('filter_line(' + [dest, src, len].join(', ') + ')');\n    swf.run('filter_line', [dest, src, len]);\n\n    log(swf.readBytes(dest, len));\n\n    swf.run('free', [src]);\n    log('free(' + src + ')');\n    swf.run('free', [dest]);\n    log('free(' + dest + ')');\n});\n\nsetupDemo('palette_16color', [\n    [0],\n    [1],\n    [2],\n    [15],\n    [16],\n]);\n\ndocument.getElementById('func_invoke').addEventListener('click', function() {\n    let a = 30;\n    let b = 77;\n\n    let add = swf.run('func_fetch', [0]);\n    log('func_fetch(0) -> ' + add);\n    let sum = swf.run('func_invoke', [add, a, b]);\n    log('func_invoke(' + [add, a, b] + ') -> ' + sum);\n\n    let mul = swf.run('func_fetch', [1]);\n    log('func_fetch(1) -> ' + mul);\n    let product = swf.run('func_invoke', [mul, a, b]);\n    log('func_invoke(' + [mul, a, b] + ') -> ' + product);\n});\n*/\n\ndocument.getElementById('ogg_demux').addEventListener('click', function() {\n    var url = 'https://media-streaming.wmflabs.org/clean/transcoded/4/43/Eisbach_surfen_v1.ogv/Eisbach_surfen_v1.ogv.240p.ogv';\n    var xhr = new XMLHttpRequest();\n    xhr.addEventListener('load', function() {\n        var buffer = xhr.response;\n        var bytes = new Uint8Array(buffer);\n        log('loaded ' + url + ' -- ' + bytes.length + ' bytes');\n\n        bytes = bytes.subarray(0, 65536 * 2);\n\n        var ptr = swf.run('malloc', [bytes.length]);\n        log('malloc(' + bytes.length + ') -> ' + ptr);\n\n        //swf.writeBytes(ptr, Array.prototype.slice.apply(bytes));\n        swf.writeBinary(ptr, bytes2string(bytes));\n\n        swf.run('ogv_demuxer_init', []);\n        swf.run('ogv_demuxer_receive_input', [ptr, bytes.length]);\n\n        swf.run('free', [ptr]);\n        log('free(' + ptr + ')');\n\n        setTimeout(function again() {\n            var start = performance.now();\n            var more = swf.run('ogv_demuxer_process', []);\n            var delta = performance.now() - start;\n            log(delta + ' ms to demux');\n            console.log(delta + ' ms to decode');\n\n            console.log(more);\n            log('ogv_demuxer_process() -> ' + more);\n\n            if (more) {\n                setTimeout(again, 0);\n            }\n        }, 0);\n    });\n    xhr.open('GET', url);\n    xhr.responseType = 'arraybuffer';\n    xhr.send();\n});\n\ndocument.getElementById('theora_decode').addEventListener('click', function() {\n    var init = codecSwf.run('ogv_video_decoder_init', []);\n    log('ogv_video_decoder_init() -> ' + init);\n\n    function decodePacket(packet) {\n        var bytes = packet.data;\n        var ptr = codecSwf.run('malloc', [bytes.length]);\n        log('malloc(' + bytes.length + ') -> ' + ptr);\n        codecSwf.writeBinary(ptr, bytes);\n        var ok;\n\n        var start = performance.now();\n        if (!videoLoaded) {\n            ok = codecSwf.run('ogv_video_decoder_process_header', [ptr, bytes.length]);\n            log('ogv_video_decoder_process_header(' + ptr + ', ' + bytes.length + ') -> ' + ok);\n        } else {\n            ok = codecSwf.run('ogv_video_decoder_process_frame', [ptr, bytes.length]);\n            log('ogv_video_decoder_process_frame(' + ptr + ', ' + bytes.length + ') -> ' + ok);\n        }\n        var delta = performance.now() - start;\n        log(delta + ' ms to decode');\n        console.log(delta + ' ms to decode');\n\n        if (typeof ok === 'string') {\n            return 0;\n        }\n\n        codecSwf.run('free', [ptr]);\n        log('free(' + ptr + ')');\n\n        return ok;\n    }\n\n    setTimeout(function again() {\n        if (videoPackets.length == 0) {\n            log('no more video packets');\n            return;\n        }\n        var packet = videoPackets.shift();\n        var ok = decodePacket(packet);\n        if (!ok) {\n            return;\n        }\n\n        if (videoPackets.length > 0) {\n            setTimeout(again, 0);\n        }\n    }, 0);\n});\n\n\n//# sourceURL=webpack:///./src/demo.js?");

/***/ })

/******/ });