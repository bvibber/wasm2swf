var YUVBuffer = require('yuv-buffer');
var YUVCanvas = require('yuv-canvas');

var canvas = document.getElementById('player');
var frameSink = YUVCanvas.attach(canvas);

var videoSource = document.getElementById('video_source');
var sources = ['ogg-theora', 'webm-vp8', 'webm-vp9', 'webm-av1'];
var hash = document.location.hash;
if (hash.length > 1) {
    hash = hash.substr(1);
}
var index = sources.indexOf(hash);
if (index !== -1) {
    videoSource.selectedIndex = index;
}
videoSource.addEventListener('change', function() {
    document.location.hash = '#' + videoSource.value;
});

var videoSources = {
    'ogg-theora': 'https://media-streaming.wmflabs.org/clean/transcoded/4/43/Eisbach_surfen_v1.ogv/Eisbach_surfen_v1.ogv.240p.ogv',
    'webm-vp8': 'https://media-streaming.wmflabs.org/clean/transcoded/4/43/Eisbach_surfen_v1.ogv/Eisbach_surfen_v1.ogv.240p.webm',
    'webm-vp9': 'https://media-streaming.wmflabs.org/clean/transcoded/4/43/Eisbach_surfen_v1.ogv/Eisbach_surfen_v1.ogv.240p.vp9.webm',

    // this one plays for a while then dies. interesting.
    //'webm-vp9': 'https://media-streaming.wmflabs.org/clean/transcoded/7/7c/Caminandes_-_Gran_Dillama_-_Blender_Foundation%27s_new_Open_Movie.webm/Caminandes_-_Gran_Dillama_-_Blender_Foundation%27s_new_Open_Movie.webm.240p.vp9.webm',

    'webm-av1': 'https://media-streaming.wmflabs.org/clean/av1-2/spring-morning.webm.213x120.av1.webm',
};

var demuxers = {
    'ogg-theora': 'ogv-demuxer-ogg.swf',
    'webm-vp8': 'ogv-demuxer-webm.swf',
    'webm-vp9': 'ogv-demuxer-webm.swf',
    'webm-av1': 'ogv-demuxer-webm.swf',
};

var codecs = {
    'ogg-theora': 'ogv-decoder-video-theora.swf',
    'webm-vp8': 'ogv-decoder-video-vp8.swf',
    'webm-vp9': 'ogv-decoder-video-vp9.swf',
    'webm-av1': 'ogv-decoder-video-av1.swf',
};

function log(str) {
    var text = document.createTextNode(str);
    var p = document.createElement('p');
    p.appendChild(text);
    document.getElementById('log').appendChild(p);
}

var byteChars = [];
for (var i = 0; i < 256; i++) {
    // Avoid problematic escaping
    byteChars[i] = String.fromCharCode(0xf700 + i);
}

function bytes2string(bytes) {
    var len = bytes.length;
    var arr = new Array(len);
    for (var i = 0; i < len; i++) {
        arr[i] = byteChars[bytes[i] & 0xff];
    }
    return arr.join('');
}

function string2bytes(str) {
    var len = str.length;
    var arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        arr[i] = str.charCodeAt(i) & 0xff;
    }
    return arr;
}

function param(name, value) {
    var p = document.createElement('param');
    p.name = name;
    p.value = value;
    return p;
}

function flashObject(url, readyCallback, moduleName) {
    var obj = document.createElement('object');
    obj.appendChild(param('FlashVars', 'callback=' + readyCallback + '&module=' + moduleName));
    obj.appendChild(param('AllowScriptAccess', 'sameDomain'));
    obj.width = 10;
    obj.height = 10;
    obj.type = 'application/x-shockwave-flash';
    obj.data = url + '?' + Math.random();
    return obj;
}

document.getElementById('decode_video').addEventListener('click', function() {
    var videoPackets = [];
    var audioPackets = [];
    var videoCodec = null;
    var audioCodec = null;

    var callbacks = {
        ready: function() {
            log('demuxer ready!');
            setTimeout(startDemuxing(), 0);
        },
        error: function(msg) {
            log('Flash reported error loading module.swf: ' + msg);
        },
        ogvjs_callback_loaded_metadata: function(aVideoCodec, anAudioCodec) {
            videoCodec = swf.readString(aVideoCodec);
            audioCodec = swf.readString(anAudioCodec);
            log('video codec: ' + videoCodec);
            log('audio codec: ' + audioCodec);
        },
        ogvjs_callback_video_packet: function(ptr, len, frameTimestamp, keyframeTimestamp, isKeyframe) {
            var data = swf.readBinary(ptr, len);
            //log('video packet: ' + data.length + ' bytes at timestamp ' + frameTimestamp + (isKeyframe ? ', keyframe' : ''));
            videoPackets.push({
                data: data,
                frameTimestamp: frameTimestamp,
                keyframeTimestamp: keyframeTimestamp,
                isKeyframe: isKeyframe
            });
        },
        ogvjs_callback_audio_packet: function(ptr, len, audioTimestamp, discardPadding) {
            var data = swf.readBinary(ptr, len);
            //log('audio packet: ' + data.length + ' bytes at timestamp ' + audioTimestamp);
            audioPackets.push({
                data: data,
                audioTimestamp: audioTimestamp,
                discardPadding: discardPadding
            });
        }
    };

    function readyCallback(method, args) {
        callbacks[method].apply(null, args);
    }
    window.readyCallback = readyCallback;

    function startDemuxing() {
        var url = videoSources[videoSource.value];
        var xhr = new XMLHttpRequest();
        xhr.addEventListener('load', function() {
            var buffer = xhr.response;
            var bytes = new Uint8Array(buffer);
            log('loaded ' + url + ' -- ' + bytes.length + ' bytes');

            bytes = bytes.subarray(0, 65536 * 2);

            var ptr = swf.run('malloc', [bytes.length]);
            //log('malloc(' + bytes.length + ') -> ' + ptr);

            //swf.writeBytes(ptr, Array.prototype.slice.apply(bytes));
            swf.writeBinary(ptr, bytes2string(bytes));

            swf.run('ogv_demuxer_init', []);
            swf.run('ogv_demuxer_receive_input', [ptr, bytes.length]);

            swf.run('free', [ptr]);
            //log('free(' + ptr + ')');

            setTimeout(function again() {
                var start = performance.now();
                var more = swf.run('ogv_demuxer_process', []);
                var delta = performance.now() - start;
                //log(delta + ' ms to demux');
                //console.log(delta + ' ms to demux');

                //log('ogv_demuxer_process() -> ' + more);

                if (more) {
                    setTimeout(again, 0);
                } else {
                    loadCodec();
                }
            }, 0);
        });
        xhr.open('GET', url);
        xhr.responseType = 'arraybuffer';
        xhr.send();
    }

    function loadCodec() {
        var videoLoaded = !(videoSource.value === 'ogg-theora'); // theora has header packets
        var drawDelta = 0;
        codecCallbacks = {
            ready: function() {
                log('codec ready!');
                setTimeout(startPlayback, 0);
            },

            error: function(err) {
                log('codec failed: ' + err);
            },

            ogvjs_callback_init_video: function(frameWidth, frameHeight,
                                                chromaWidth, chromaHeight,
                                                fps,
                                                picWidth, picHeight,
                                                picX, picY,
                                                displayWidth, displayHeight)
            {
                videoLoaded = true;
                log('video initialized: ' + frameWidth + 'x' + frameHeight +
                    ' (chroma ' + chromaWidth + 'x' + chromaHeight + '), ' + fps + ' fps');
                log('picture size ' + picWidth + 'x' + picHeight + ' with crop ' + picX + ', ' + picY);
                log('display size ' + displayWidth + 'x' + displayHeight);
            },

            ogvjs_callback_frame: function(bufferY, strideY,
                                        bufferCb, strideCb,
                                        bufferCr, strideCr,
                                        frameWidth, frameHeight,
                                        chromaWidth, chromaHeight,
                                        picWidth, picHeight,
                                        picX, picY,
                                        displayWidth, displayHeight)
            {
                var start = performance.now();
                /*
                log('frame callback!')
                log('frame size ' + frameWidth + 'x' + frameHeight +
                    ' (chroma ' + chromaWidth + 'x' + chromaHeight + ')');
                log('picture size ' + picWidth + 'x' + picHeight + ' with crop ' + picX + ', ' + picY);
                log('display size ' + displayWidth + 'x' + displayHeight);

                log('Y buffer ' + bufferY + '; stride ' + strideY);
                log('Cb buffer ' + bufferCb + '; stride ' + strideCb);
                log('Cr buffer ' + bufferCr + '; stride ' + strideCr);
                */

                var format = YUVBuffer.format({
                    width: frameWidth,
                    height: frameHeight,
                    chromaWidth: chromaWidth,
                    chromaHeight: chromaHeight,
                    cropLeft: picX,
                    cropTop: picY,
                    cropWidth: picWidth,
                    cropHeight: picHeight,
                    displayWidth: displayWidth,
                    displayHeight: displayHeight,
                });
                var frame = YUVBuffer.frame(format);
                frame.y.bytes = string2bytes(codecSwf.readBinary(bufferY, strideY * frameHeight));
                frame.y.stride = strideY;
                frame.u.bytes = string2bytes(codecSwf.readBinary(bufferCb, strideCb * chromaHeight));
                frame.u.stride = strideCb;
                frame.v.bytes = string2bytes(codecSwf.readBinary(bufferCr, strideCr * chromaHeight));
                frame.v.stride = strideCr;
                frameSink.drawFrame(frame);
                var delta = performance.now() - start;
                drawDelta = delta;
            },

            ogvjs_callback_async_complete: function(ret, cpuTime) {
                log('async frame complete (should not happen');
            },

            ogvjs_callback_explode: function(error) {
                console.log('explode', error);
            },

            ogvjs_callback_trace: function(val) {
                console.log('trace', val);
            },

        };

        function startPlayback() {
            var init = codecSwf.run('ogv_video_decoder_init', []);
            log('ogv_video_decoder_init() -> ' + init);

            function decodePacket(packet) {
                var bytes = packet.data;
                var ptr = codecSwf.run('malloc', [bytes.length]);
                //log('malloc(' + bytes.length + ') -> ' + ptr);
                codecSwf.writeBinary(ptr, bytes);
                var ok;

                var start = performance.now();
                drawDelta = 0;
                if (!videoLoaded) {
                    ok = codecSwf.run('ogv_video_decoder_process_header', [ptr, bytes.length]);
                    if (ok !== 1) {
                        log('ogv_video_decoder_process_header(' + ptr + ', ' + bytes.length + ') -> ' + ok);
                    }
                } else {
                    ok = codecSwf.run('ogv_video_decoder_process_frame', [ptr, bytes.length]);
                    if (ok !== 1) {
                        log('ogv_video_decoder_process_frame(' + ptr + ', ' + bytes.length + ') -> ' + ok);
                    }
                }
                var delta = performance.now() - start - drawDelta;
                log(delta + ' ms to decode');
                console.log(delta + ' ms to decode; ' + drawDelta + ' to extract/draw');

                if (typeof ok === 'string') {
                    return 0;
                }

                codecSwf.run('free', [ptr]);
                //log('free(' + ptr + ')');

                return ok;
            }

            setTimeout(function again() {
                if (videoPackets.length == 0) {
                    log('no more video packets');
                    return;
                }
                var packet = videoPackets.shift();
                var ok = decodePacket(packet);
                if (!ok) {
                    log('failed to decode packet');
                    return;
                }

                if (videoPackets.length > 0) {
                    setTimeout(again, 0);
                }
            }, 0);
        }

        function codecCallback(method, args) {
            codecCallbacks[method].apply(null, args);
        }
        window.codecCallback = codecCallback;

        log('loading codec...');
        var codecSwf = flashObject('demo.swf', 'codecCallback', codecs[videoSource.value]);
        document.body.appendChild(codecSwf);
        window.codecSwf = codecSwf; // for testing
    }

    log('loading demuxer...');
    var swf = flashObject('demo.swf', 'readyCallback', demuxers[videoSource.value]);
    document.body.appendChild(swf);
});

document.getElementById('decode_video_wasm').addEventListener('click', function() {
    var videoPackets = [];
    var audioPackets = [];
    var videoCodec = null;
    var audioCodec = null;

    var callbacks = {
        ready: function() {
            log('demuxer ready!');
            setTimeout(startDemuxing(), 0);
        },
        error: function(msg) {
            log('Flash reported error loading module.swf: ' + msg);
        },
        ogvjs_callback_loaded_metadata: function(aVideoCodec, anAudioCodec) {
            videoCodec = swf.readString(aVideoCodec);
            audioCodec = swf.readString(anAudioCodec);
            log('video codec: ' + videoCodec);
            log('audio codec: ' + audioCodec);
        },
        ogvjs_callback_video_packet: function(ptr, len, frameTimestamp, keyframeTimestamp, isKeyframe) {
            var data = swf.readBinary(ptr, len);
            //log('video packet: ' + data.length + ' bytes at timestamp ' + frameTimestamp + (isKeyframe ? ', keyframe' : ''));
            videoPackets.push({
                data: data,
                frameTimestamp: frameTimestamp,
                keyframeTimestamp: keyframeTimestamp,
                isKeyframe: isKeyframe
            });
        },
        ogvjs_callback_audio_packet: function(ptr, len, audioTimestamp, discardPadding) {
            var data = swf.readBinary(ptr, len);
            //log('audio packet: ' + data.length + ' bytes at timestamp ' + audioTimestamp);
            audioPackets.push({
                data: data,
                audioTimestamp: audioTimestamp,
                discardPadding: discardPadding
            });
        }
    };

    function readyCallback(method, args) {
        callbacks[method].apply(null, args);
    }
    window.readyCallback = readyCallback;

    function startDemuxing() {
        var url = videoSources[videoSource.value];
        var xhr = new XMLHttpRequest();
        xhr.addEventListener('load', function() {
            var buffer = xhr.response;
            var bytes = new Uint8Array(buffer);
            log('loaded ' + url + ' -- ' + bytes.length + ' bytes');

            bytes = bytes.subarray(0, 65536 * 2);

            var ptr = swf.run('malloc', [bytes.length]);
            //log('malloc(' + bytes.length + ') -> ' + ptr);

            //swf.writeBytes(ptr, Array.prototype.slice.apply(bytes));
            swf.writeBinary(ptr, bytes2string(bytes));

            swf.run('ogv_demuxer_init', []);
            swf.run('ogv_demuxer_receive_input', [ptr, bytes.length]);

            swf.run('free', [ptr]);
            //log('free(' + ptr + ')');

            setTimeout(function again() {
                var start = performance.now();
                var more = swf.run('ogv_demuxer_process', []);
                var delta = performance.now() - start;
                //log(delta + ' ms to demux');
                //console.log(delta + ' ms to demux');

                //log('ogv_demuxer_process() -> ' + more);

                if (more) {
                    setTimeout(again, 0);
                } else {
                    loadCodec();
                }
            }, 0);
        });
        xhr.open('GET', url);
        xhr.responseType = 'arraybuffer';
        xhr.send();
    }

    function loadCodec() {
        var videoLoaded = !(videoSource.value === 'ogg-theora'); // theora has header packets
        var drawDelta = 0;

        function startPlayback() {
            var init = exports.ogv_video_decoder_init();
            log('ogv_video_decoder_init() -> ' + init);

            function decodePacket(packet) {
                var bytes = string2bytes(packet.data);
                var ptr = exports.malloc(bytes.length);
                //log('malloc(' + bytes.length + ') -> ' + ptr);
                HEAPU8.set(bytes, ptr);
                var ok;

                var start = performance.now();
                drawDelta = 0;
                if (!videoLoaded) {
                    ok = exports.ogv_video_decoder_process_header(ptr, bytes.length);
                    if (ok !== 1) {
                        log('ogv_video_decoder_process_header(' + ptr + ', ' + bytes.length + ') -> ' + ok);
                    }
                } else {
                    ok = exports.ogv_video_decoder_process_frame(ptr, bytes.length);
                    if (ok !== 1) {
                        log('ogv_video_decoder_process_frame(' + ptr + ', ' + bytes.length + ') -> ' + ok);
                    }
                }
                var delta = performance.now() - start - drawDelta;
                log(delta + ' ms to decode');
                console.log(delta + ' ms to decode; ' + drawDelta + ' to extract/draw');

                exports.free(ptr);
                //log('free(' + ptr + ')');

                return ok;
            }

            setTimeout(function again() {
                if (videoPackets.length == 0) {
                    log('no more video packets');
                    return;
                }
                var packet = videoPackets.shift();
                var ok = decodePacket(packet);
                if (!ok) {
                    log('failed to decode packet');
                    return;
                }

                if (videoPackets.length > 0) {
                    setTimeout(again, 0);
                }
            }, 0);
        }

        function codecCallback(method, args) {
            codecCallbacks[method].apply(null, args);
        }
        window.codecCallback = codecCallback;

        log('loading codec...');

        var codecWasm;
        var tempRet0 = 0;
        var scratch = new ArrayBuffer(8);
        var scratch_i32 = new Int32Array(scratch);
        var scratch_f32 = new Float32Array(scratch);
        var scratch_f64 = new Float64Array(scratch);
        var exports, memory;
        var HEAP32, HEAPU8;
        var setjmpId = 0;
        var importObject = {
            env: {
                ogvjs_callback_init_video: function(frameWidth, frameHeight,
                    chromaWidth, chromaHeight,
                    fps,
                    picWidth, picHeight,
                    picX, picY,
                    displayWidth, displayHeight)
                {
                    videoLoaded = true;
                    log('video initialized: ' + frameWidth + 'x' + frameHeight +
                    ' (chroma ' + chromaWidth + 'x' + chromaHeight + '), ' + fps + ' fps');
                    log('picture size ' + picWidth + 'x' + picHeight + ' with crop ' + picX + ', ' + picY);
                    log('display size ' + displayWidth + 'x' + displayHeight);
                },
                ogvjs_callback_frame: function(bufferY, strideY,
                    bufferCb, strideCb,
                    bufferCr, strideCr,
                    frameWidth, frameHeight,
                    chromaWidth, chromaHeight,
                    picWidth, picHeight,
                    picX, picY,
                    displayWidth, displayHeight)
                {
                    var start = performance.now();
                    /*
                    log('frame callback!')
                    log('frame size ' + frameWidth + 'x' + frameHeight +
                    ' (chroma ' + chromaWidth + 'x' + chromaHeight + ')');
                    log('picture size ' + picWidth + 'x' + picHeight + ' with crop ' + picX + ', ' + picY);
                    log('display size ' + displayWidth + 'x' + displayHeight);

                    log('Y buffer ' + bufferY + '; stride ' + strideY);
                    log('Cb buffer ' + bufferCb + '; stride ' + strideCb);
                    log('Cr buffer ' + bufferCr + '; stride ' + strideCr);
                    */

                    var format = YUVBuffer.format({
                        width: frameWidth,
                        height: frameHeight,
                        chromaWidth: chromaWidth,
                        chromaHeight: chromaHeight,
                        cropLeft: picX,
                        cropTop: picY,
                        cropWidth: picWidth,
                        cropHeight: picHeight,
                        displayWidth: displayWidth,
                        displayHeight: displayHeight,
                    });
                    var frame = YUVBuffer.frame(format);
                    frame.y.bytes = HEAPU8.subarray(bufferY, bufferY + strideY * frameHeight);
                    frame.y.stride = strideY;
                    frame.u.bytes = HEAPU8.subarray(bufferCb, bufferCb + strideCb * chromaHeight);
                    frame.u.stride = strideCb;
                    frame.v.bytes = HEAPU8.subarray(bufferCr, bufferCr + strideCr * chromaHeight);
                    frame.v.stride = strideCr;
                    frameSink.drawFrame(frame);
                    var delta = performance.now() - start;
                    drawDelta = delta;
                },
                ogvjs_callback_async_complete: function() {},
                ogvjs_callback_explode: function(error) {
                    console.log('explode', error);
                },
                ogvjs_callback_trace: function(val) {
                    console.log('trace', val);
                },
    
                emscripten_notify_memory_growth: function(){},
                setTempRet0: function setTempRet0(val) {
                    tempRet0 = val;
                },
                getTempRet0: function getTempRet0() {
                    return tempRet0;
                },
                // literally none of these scratch funcs are called
                // in the hot paths so far
                wasm2js_scratch_load_i32: function(i) {
                    throw new Error('yo8');
                    return scratch_i32[i];
                },
                wasm2js_scratch_store_i32: function(i, val) {
                    throw new Error('yo7');
                    scratch_i32[i] = val;
                },
                wasm2js_scratch_load_i64: function() {
                    throw new Error('yo6');
                    tempRet0 = scratch_i32[1];
                    return scratch_i32[0];
                },
                wasm2js_scratch_store_i64: function(low, high) {
                    throw new Error('yo5');
                    scratch_i32[0] = low;
                    scratch_i32[1] = high;
                },
                wasm2js_scratch_load_f32: function() {
                    throw new Error('yo4');
                    return scratch_f32[0];
                },
                wasm2js_scratch_store_f32: function(val) {
                    throw new Error('yo3');
                    scratch_f32[0] = val;
                },
                wasm2js_scratch_load_f64: function() {
                    throw new Error('yo2');
                    return scratch_f64[0];
                },
                wasm2js_scratch_store_f64: function(val) {
                    throw new Error('yo1');
                    scratch_f64[0] = val;
                },
                emscripten_longjmp: function(env, val) {
                    throw new Error('not used in hotpath');
                    exports.setThrew(env, val || 1);
                    throw 'longjmp';
                },
                saveSetjmp: function saveSetjmp(env, label, table, size) {
                    // not needed in hotpath, makes no difffff
                    return table;
                    var i = 0;
                    setjmpId++;
                    HEAP32[env >> 2] = setjmpId;
                    while (i < size) {
                        memory.position = table + (i << 3);
                        if (HEAP32[table + (i << 3) >> 2] == 0) {
                            HEAP32[table + (i << 3) >> 2] = setjmpId;
                            HEAP32[table + ((i << 3) + 4) >> 2] = label;
                            HEAP32[table + ((i << 3) + 8) >> 2] = 0;
                            //setTempRet0(size);
                            tempRet0 = size;
                            return table;
                        }
                        i++;
                    }
                    size *= 2;
                    table = exports.realloc(table, 8 * (size + 1));
                    table = saveSetjmp(env, label, table, size);
                    //setTempRet0(size);
                    setTempRet0 = size;
                    return table;
                },
                testSetjmp: function testSetjmp(id, table, size) {
                    throw new Error('explode!');
                    var i = 0;
                    while (i < size) {
                        var curr = HEAP32[table + (i << 3) >> 2];
                        if (curr == 0) break;
                        if (curr == id) {
                            return HEAP32[table + ((i << 3) + 4) >> 2];
                        }
                        i++;
                    }
                    return 0;
                },
                invoke_vi: function(func, arg1) {
                    var sp = exports.stackSave();
                    try {
                        exports.dynCall_vi(func, arg1);
                    } catch (e) {
                        exports.stackRestore(sp);
                        if (e !== "longjmp") throw e;
                        exports.setThrew(1, 0);
                    }
                },
                invoke_viiii: function(func, arg1, arg2, arg3, arg4) {
                    var sp = exports.stackSave();
                    try {
                        exports.dynCall_viiii(func, arg1, arg2, arg3, arg4);
                    } catch (e) {
                        exports.stackRestore(sp);
                        if (e !== "longjmp") throw e;
                        exports.setThrew(1, 0);
                    }
                },
                invoke_viiiiii: function(func, arg1, arg2, arg3, arg4, arg5, arg6) {
                    var sp = exports.stackSave();
                    try {
                        exports.dynCall_viiiiii(func, arg1, arg2, arg3, arg4, arg5, arg6);
                    } catch (e) {
                        exports.stackRestore(sp);
                        if (e !== "longjmp") throw e;
                        exports.setThrew(1, 0);
                    }
                },
                invoke_viiiiiiii: function(func, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
                    var sp = exports.stackSave();
                    try {
                        exports.dynCall_viiiiiiii(func, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8);
                    } catch (e) {
                        exports.stackRestore(sp);
                        if (e !== "longjmp") throw e;
                        exports.setThrew(1, 0);
                    }
                },
                invoke_iii: function(func, arg1, arg2) {
                    var sp = exports.stackSave();
                    try {
                        return exports.dynCall_iii(func, arg1, arg2);
                    } catch (e) {
                        exports.stackRestore(sp);
                        if (e !== "longjmp") throw e;
                        exports.setThrew(1, 0);
                    }
                    return 0; // ??
                },
                invoke_iiii: function(func, arg1, arg2, arg3) {
                    var sp = exports.stackSave();
                    try {
                        return exports.dynCall_iiii(func, arg1, arg2, arg3);
                    } catch (e) {
                        exports.stackRestore(sp);
                        if (e !== "longjmp") throw e;
                        exports.setThrew(1, 0);
                    }
                    return 0; // ??
                },
                invoke_iiiii: function(func, arg1, arg2, arg3, arg4) {
                    var sp = exports.stackSave();
                    try {
                        return exports.dynCall_iiiii(func, arg1, arg2, arg3, arg4);
                    } catch (e) {
                        exports.stackRestore(sp);
                        if (e !== "longjmp") throw e;
                        exports.setThrew(1, 0);
                    }
                    return 0; // ??
                },
                invoke_iiiiii: function(func, arg1, arg2, arg3, arg4, arg5) {
                    var sp = exports.stackSave();
                    try {
                        return exports.dynCall_iiiii(func, arg1, arg2, arg3, arg4, arg5);
                    } catch (e) {
                        exports.stackRestore(sp);
                        if (e !== "longjmp") throw e;
                        exports.setThrew(1, 0);
                    }
                    return 0; // ??
                },
                invoke_iiiij: function(func, arg1, arg2, arg3, arg4lo, arg4hi) {
                    var sp = exports.stackSave();
                    try {
                        return exports.dynCall_iiiij(func, arg1, arg2, arg3, arg4lo, arg4hi);
                    } catch (e) {
                        exports.stackRestore(sp);
                        if (e !== "longjmp") throw e;
                        exports.setThrew(1, 0);
                    }
                    return 0; // ??
                }
            }
        };
    
        WebAssembly.instantiateStreaming(fetch('ogv-decoder-video-vp9.wasm?' + Math.random()), importObject)
        .then(function(obj) {
            codecWasm = obj.instance;
            exports = codecWasm.exports;
            memory = exports.memory.buffer;
            HEAP32 = new Int32Array(memory);
            HEAPU8 = new Uint8Array(memory);
            console.log('codecWasm', codecWasm);
            window.codecWasm = codecWasm; // for testing

            setTimeout(startPlayback, 0);
        });
    }

    log('loading demuxer...');
    var swf = flashObject('demo.swf', 'readyCallback', demuxers[videoSource.value]);
    document.body.appendChild(swf);
});
