class Builder {
    constructor() {
        this.stream = [];
    }

    log(...args) {
        console.log.apply(console, args);
    }

    toBytes() {
        return new Uint8Array(this.stream);
    }

    out(val) {
        this.stream.push(val & 255);
    }

    offset() {
        return this.stream.length;
    }
}

class Bitstream extends Builder {
    constructor() {
        super();
        this.accumulator = 0;
        this.nbits = 0;
    }

    toBytes() {
        this.flush();
        return super.toBytes();
    }

    flush() {
        if (this.nbits > 0) {
            this.out(this.accumulator);
            this.nbits = 0;
            this.accumulator = 0;
        }
    }

    bit(val) {
        let bit = val & 1;
        this.accumulator |= bit << (7 - this.nbits);
        if (++this.nbits == 8) {
            this.flush();
        }
    }

    bits(val, nbits) {
        for (let i = 0; i < nbits; i++) {
            this.bit((val >> (nbits - 1 - i)) & 1);
        }
    }

    ub(val, nbits) {
        this.bits(val, nbits);
    }

    sb(val, nbits) {
        this.bits(val, nbits);
    }

    fb(val, nbits) {
        this.sb(Math.round(val * 65536), nbits);
    }
}

module.exports = {
    Builder,
    Bitstream,
};
