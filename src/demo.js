var YUVBuffer = require('yuv-buffer');
var YUVCanvas = require('yuv-canvas');

var canvas = document.getElementById('player');
var frameSink = YUVCanvas.attach(canvas);

var videoSource = document.getElementById('video_source');
var videoSources = {
    'ogg-theora': 'https://media-streaming.wmflabs.org/clean/transcoded/4/43/Eisbach_surfen_v1.ogv/Eisbach_surfen_v1.ogv.240p.ogv',
    'webm-vp8': 'https://media-streaming.wmflabs.org/clean/transcoded/4/43/Eisbach_surfen_v1.ogv/Eisbach_surfen_v1.ogv.240p.webm',
    'webm-vp9': 'https://media-streaming.wmflabs.org/clean/transcoded/4/43/Eisbach_surfen_v1.ogv/Eisbach_surfen_v1.ogv.240p.vp9.webm',
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

var videoPackets = [];
var audioPackets = [];
var videoCodec = null;
var audioCodec = null;

function log(str) {
    var text = document.createTextNode(str);
    var p = document.createElement('p');
    p.appendChild(text);
    document.getElementById('log').appendChild(p);
}

var privateUse = [];
for (var i = 0; i < 256; i++) {
    privateUse[i] = String.fromCharCode(0xe000 + i);
}

function bytes2string(bytes) {
    var len = bytes.length;
    var arr = new Array(len);
    for (var i = 0; i < len; i++) {
        arr[i] = privateUse[bytes[i] & 0xff];
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
            }
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
                if (!videoLoaded) {
                    ok = codecSwf.run('ogv_video_decoder_process_header', [ptr, bytes.length]);
                    //log('ogv_video_decoder_process_header(' + ptr + ', ' + bytes.length + ') -> ' + ok);
                } else {
                    ok = codecSwf.run('ogv_video_decoder_process_frame', [ptr, bytes.length]);
                    //log('ogv_video_decoder_process_frame(' + ptr + ', ' + bytes.length + ') -> ' + ok);
                }
                var delta = performance.now() - start - drawDelta
                log(delta + ' ms to decode');
                console.log(delta + ' ms to decode');

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
    }

    log('loading demuxer...');
    var swf = flashObject('demo.swf', 'readyCallback', demuxers[videoSource.value]);
    document.body.appendChild(swf);
});
