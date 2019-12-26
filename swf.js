const {
    Builder,
    Bitstream,
} = require('./utils');

const utf8 = new TextEncoder();

class SWFBuilder extends Builder {
    ui8(val) {
        this.out(val & 255);
    }

    ui16(val) {
        this.out(val & 255);
        this.out((val >>> 8) & 255);
    }

    ui32(val) {
        this.out(val & 255);
        this.out((val >>> 8) & 255);
        this.out((val >>> 16) & 255);
        this.out((val >>> 24) & 255);
    }

    bytes(bytes) {
        for (let byte of bytes) {
            this.out(byte);
        }
    }

    string(str) {
        let bytes = utf8.encode(str);
        this.bytes(bytes);
        this.out(0);
    }

    rect(rect) {
        let {x, y, width, height} = rect;
        let xmax = x + width;
        let ymax = y + height;
        let coords = [x, y, xmax, ymax];
        let nbits = 1 + 32 - Math.min.apply(null,
            coords.map(Math.abs).map(Math.clz32));

        let bits = new Bitstream();
        bits.ub(nbits, 5);
        bits.sb(x, nbits);
        bits.sb(width, nbits);
        bits.sb(y, nbits);
        bits.sb(height, nbits);
        this.bytes(bits.toBytes());
    }

    tag(tag, bytes) {
        let length = bytes.length;
        let coded = (tag << 6) | Math.min(length, 63);
        this.ui16(coded);
        if (length >= 63) {
            this.ui32(length);
        }
        this.bytes(bytes);
    }
}

class SWFFileBuilder extends SWFBuilder {
    constructor() {
        super();
        this.lengthOffset = 0;
        this.frameCountOffset = 0;
        this.frameCount = 0;
    }

    toBytes() {
        this.applyFixups();
        return super.toBytes();
    }

    applyFixups() {
        let len = this.stream.length;
        this.stream[this.lengthOffset] = len & 255;
        this.stream[this.lengthOffset + 1] = (len >>> 8) & 255;
        this.stream[this.lengthOffset + 2] = (len >>> 16) & 255;
        this.stream[this.lengthOffset + 3] = (len >>> 24) & 255;

        this.stream[this.frameCountOffset] = this.frameCount & 255;
        this.stream[this.frameCountOffset + 1] = (this.frameCount >>> 8) & 255;
    }

    header(header) {
        // Uncompressed magic
        this.out('F'.charCodeAt(0));
        this.out('W'.charCodeAt(0));
        this.out('S'.charCodeAt(0));

        this.out(38); // ????

        // placeholder for file length
        this.lengthOffset = this.offset();
        this.ui32(0);

        this.rect({
            x: 0,
            y: 0,
            width: header.width,
            height: header.height
        });

        this.ui16(Math.round(header.framerate * 256));

        // placeholder for frames count
        this.frameCountOffset = this.offset();
        this.ui16(0);
    }

    fileAttributes(attr) {
        let tag = new Bitstream();
        tag.bits(0, 3);
        tag.bit(attr.hasMetadata ? 1 : 0);
        tag.bit(attr.actionScript3 ? 1 : 0);
        tag.bit(attr.suppressCrossDomainCaching ? 1 : 0);
        tag.bit(0);
        tag.bit(attr.useNetwork ? 1 : 0);
        tag.bits(0, 24); // reserved?

        this.tag(69, tag.toBytes());
    }

    frameLabel(name, anchor=false) {
        let tag = new SWFBuilder();
        tag.string(name);
        if (anchor) {
            tag.bit(1);
        }

        this.tag(43, tag.toBytes());
    }

    showFrame() {
        this.tag(1, []);
        this.frameCount++;
    }

    doABC(name, bytecode, flags=0) {
        let tag = new SWFBuilder();
        tag.ui32(flags);
        tag.string(name);
        tag.bytes(bytecode);

        this.tag(82, tag.toBytes());
    }

    symbolClass(symbols, tags={}) {
        let tag = new SWFBuilder();
        tag.ui16(symbols.length);
        for (let name of symbols) {
            let id = tags[name] || 0;
            tag.ui16(id);
            tag.string(name);
        }

        this.tag(76, tag.toBytes());
    }

    static kDoAbcLazyInitializeFlag = 1;
}

module.exports = {
    SWFFileBuilder
};
