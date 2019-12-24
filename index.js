const fs = require('fs');
const binaryen = require('binaryen');
const abc = require('./abc');

let infile, outfile;

let args = process.argv.slice(2);
while (args.length > 0) {
    let arg = args.shift();
    switch (arg) {
        case '-o':
        case '--output':
            outfile = args.shift();
            break;
        case '--help':
            console.log(`wasm2swf -o outfile.swf infile.wasm\n`);
            process.exit(0);
            break;
        default:
            infile = arg;
    }
}

if (!infile) {
    console.error(`Must provide an input .wasm file!\n`);
    process.exit(1);
}

// Can we get this list from binaryen?
let ids = [
    'Invalid',
    'Block',
    'If',
    'Loop',
    'Break',
    'Switch',
    'Call',
    'CallIndirect',
    'LocalGet',
    'LocalSet',
    'GlobalGet',
    'GlobalSet',
    'Load',
    'Store',
    'Const',
    'Unary',
    'Binary',
    'Select',
    'Drop',
    'Return',
    'Host',
    'Nop',
    'Unreachable',
    'AtomicCmpxchg',
    'AtomicRMW',
    'AtomicWait',
    'AtomicNotify',
    'AtomicFence',
    'SIMDExtract',
    'SIMDReplace',
    'SIMDShuffle',
    'SIMDTernary',
    'SIMDShift',
    'SIMDLoad',
    'MemoryInit',
    'DataDrop',
    'MemoryCopy',
    'MemoryFill',
    'Try',
    'Throw',
    'Rethrow',
    'BrOnExn',
    'Push',
    'Pop',
];
let expressionTypes = [];
for (let name of ids) {
    expressionTypes[binaryen[name + 'Id']] = name;
}

const U30_MAX = 2 ** 30 - 1;

function avmType(t) {
    switch (t) {
        case binaryen.none: return 'void';
        case binaryen.i32: return 'int';
        case binaryen.f32: return 'Number';
        case binaryen.f64: return 'Number';
        default: throw new Error('unexpected type ' + t);
    }
}

const slots = [
    {
        name: '__wasm2swf_reserved',
        type: 'undefined',
    },
    {
        name: '__wasm2swf_memory',
        type: 'ByteArray',
    },
    {
        name: '__wasm2swf_table',
        type: 'Array',
    }
];
const memorySlot = 1;
const tableSlot = 2;
const globalSlots = {};

const methods = ['__wasm2swf_reserved'];
const methodIndexes = {};

function slotForGlobal(name, type) {
    if (globalSlots[name] === undefined) {
        globalSlots[name] = slots.push({
            name,
            type: avmType(type)
        }) - 1;
    }
    return globalSlots[name];
}

function addMethod(name) {
    methodIndexes[name] = (methods.push(name) - 1);
}

function methodIndex(name) {
    if (methodIndexes[name]) {
        return methodIndexes[name];
    } else {
        throw new Error('Unknown function ' + name);
    }
}

addMethod('__wasm2swf_memory_size');
addMethod('__wasm2swf_memory_grow');

addMethod('__wasm2swf_clz32');

addMethod('__wasm2swf_abs');
addMethod('__wasm2swf_ceil');
addMethod('__wasm2swf_floor');
addMethod('__wasm2swf_sqrt');

addMethod('__wasm2swf_min');
addMethod('__wasm2swf_max');

function walkExpression(expr, callbacks) {
    let info = binaryen.getExpressionInfo(expr);
    let cb = 'visit' + expressionTypes[info.id];
    if (callbacks[cb]) {
        let ret = callbacks[cb](info, expr);
        if (ret === null) {
            // Do not keep traversing.
            return;
        }
    } else {
        throw new Error(`Unhandled node of type ${id}`);
    }
}

function convertFunction(func, file) {
    const builder = file.methodBuilder();
    let labelIndex = 0;
    let labelStack = [];

    function labelByName(name) {
        let label = labelStack.find((label) => label.name == name);
        if (!label) {
            throw new Error('cannot find label ' + name);
        }
        return label;
    }

    const callbacks = {
        visitBlock: (info) => {
            let name = info.name || 'block' + labelIndex++;
            let label = new abc.Label(name);
            labelStack.push(label);
            info.children.forEach(traverse);
            builder.label(label);
            labelStack.pop();
        },

        visitIf: (info) => {
            let cond = binaryen.getExpressionInfo(info.condition);
            let ifend = new abc.Label();
            if (cond.id == binaryen.BinaryId) {
                switch(cond.op) {
                    case binaryen.EqInt32:
                    case binaryen.EqFloat32:
                    case binaryen.EqFloat64:
                        traverse(cond.left);
                        traverse(cond.right);
                        builder.ifstrictne(ifend);
                        break;
                    case binaryen.NeInt32:
                    case binaryen.NeFloat32:
                    case binaryen.NeFloat64:
                        traverse(cond.left);
                        traverse(cond.right);
                        builder.ifstricteq(ifend);
                        break;
                    case binaryen.LtSInt32:
                    case binaryen.LtFloat32:
                    case binaryen.LtFloat64:
                        traverse(cond.left);
                        traverse(cond.right);
                        builder.ifnlt(ifend);
                        break;
                    case binaryen.LtUInt32:
                        traverse(cond.left);
                        builder.convert_u();
                        traverse(cond.right);
                        builder.convert_u();
                        builder.ifnlt(ifend);
                        break;
                    case binaryen.LeSInt32:
                    case binaryen.LeFloat32:
                    case binaryen.LeFloat64:
                        traverse(cond.left);
                        traverse(cond.right);
                        builder.ifnle(ifend);
                        break;
                    case binaryen.LeUInt32:
                        traverse(cond.left);
                        builder.convert_u();
                        traverse(cond.right);
                        builder.convert_u();
                        builder.ifnle(ifend);
                        break;
                    case binaryen.GtSInt32:
                    case binaryen.GtFloat32:
                    case binaryen.GtFloat64:
                        traverse(cond.left);
                        traverse(cond.right);
                        builder.ifngt(ifend);
                        break;
                    case binaryen.GtUInt32:
                        traverse(cond.left);
                        builder.convert_u();
                        traverse(cond.right);
                        builder.convert_u();
                        builder.ifngt(ifend);
                        break;
                    case binaryen.GeSInt32:
                    case binaryen.GeFloat32:
                    case binaryen.GeFloat64:
                        traverse(cond.left);
                        traverse(cond.right);
                        builder.ifnge(ifend);
                        break;
                    case binaryen.GeUInt32:
                        traverse(cond.left);
                        builder.convert_u();
                        traverse(cond.right);
                        builder.convert_u();
                        builder.ifnge(ifend);
                        break;
                    default:
                        traverse(info.condition);
                        builder.iffalse(ifend);
                }
            } else if (cond.id == binaryen.UnaryId) {
                switch(cond.op) {
                    case binaryen.EqZInt32:
                        traverse(cond.value);
                        builder.pushbyte(0);
                        builder.ifstrictne(ifend);
                        break;
                    default:
                        traverse(info.condition);
                        builder.iffalse(ifend);
                }
            } else {
                traverse(info.condition);
                builder.iffalse(ifend);
            }

            traverse(info.ifTrue);
            builder.label(ifend);
            if (info.ifFalse) {
                let elseend = new abc.Label();
                builder.jump(elseend);
                traverse(info.ifFalse);
                builder.label(elseend);
            }
        },
    
        visitLoop: (info) => {
            let start = new abc.Label(info.name);
            labelStack.push(start);
            builder.label(start);
            traverse(info.body);
            builder.jump(start);
            labelStack.pop();
        },
    
        visitBreak: (info) => {
            let label = labelByName(info.name);
            if (info.value) {
                traverse(info.value);
            }
            if (info.condition) {
                // @fixme optimize these conditions
                traverse(info.condition);
                builder.iftrue(label);
            } else {
                builder.jump(label);
            }
        },

        visitSwitch: (info, expr) => {
            if (info.value) {
                throw new Error('not sure what to do with info.value?')
                traverse(info.value);
            }
            traverse(info.condition);
            let default_label = labelByName(info.defaultName);

            // currently broken upstream
            let names = info.names;
            // so we'll rebuild them. stronger. faster. better.
            let n = binaryen._BinaryenSwitchGetNumNames(expr);
            for (let i = 0; i < n; i++) {
                let p = binaryen._BinaryenSwitchGetName(expr, i);
                let h = binaryen.HEAPU8;
                let s = '';
                for (let i = p; h[i] != 0; i++) {
                    s += String.fromCharCode(h[i]);
                }
                names[i] = s;
            }

            let case_labels = names.map(labelByName);
            builder.lookupswitch(default_label, case_labels);
        },

        visitCall: (info) => {
            builder.getlocal_0(); // this argument
            info.operands.forEach(traverse);
            let index = methodIndex(info.target);
            builder.callmethod(index, info.operands.length);
            switch (info.type) {
                case binaryen.none:
                    builder.pop();
                    break;
                case binaryen.i32:
                    builder.convert_i();
                    break;
                case binaryen.f32:
                case binaryen.f64:
                    builder.convert_d();
                    break;
                default:
                    throw new Error('unexpected type in call ' + info.type);
            }
        },

        visitCallIndirect: (info) => {
            builder.getlocal_0(); // this argument
            builder.getslot(tableSlot);
            traverse(info.target);
            info.operands.forEach(traverse);
            //let runtime = new abc.RuntimeMultiname(); // @FIXME call indirect is broken for now
            let runtime = 1;
            builder.callproperty(runtime, info.operands.length);
            switch (info.type) {
                case binaryen.none:
                    builder.pop();
                    break;
                case binaryen.i32:
                    builder.convert_i();
                    break;
                case binaryen.f32:
                case binaryen.f64:
                    builder.convert_d();
                    break;
                default:
                    throw new Error('unexpected type in indirect call ' + info.type);
            }
        },

        visitLocalGet: (info) => {
            // AVM locals are shifted over by one versus WebAssembly,
            // because the 0 index is used for the 'this' parameter.
            let i = info.index + 1;
            builder.getlocal(i);
        },

        visitLocalSet: (info) => {
            // AVM locals are shifted over by one versus WebAssembly,
            // because the 0 index is used for the 'this' parameter.
            let i = info.index + 1;

            let value = binaryen.getExpressionInfo(info.value);
            if (value.id == binaryen.BinaryId && value.op == binaryen.AddInt32) {
                let left = binaryen.getExpressionInfo(value.left);
                let right = binaryen.getExpressionInfo(value.right);
                if (left.id == binaryen.LocalGetId &&
                    left.index == i &&
                    right.id == binaryen.ConstId
                ) {
                    if (right.value === 1) {
                        builder.inclocal_i(i);
                        if (info.isTee) {
                            if (i )
                            builder.getlocal(i);
                        }
                        return;
                    } else if (right.value === -1) {
                        builder.declocal_i(i);
                        if (info.isTee) {
                            builder.getlocal(i);
                        }
                        return;
                    }
                }
            }

            traverse(info.value);
            if (info.isTee) {
                builder.dup();
            }
            builder.setlocal(i);
        },

        visitGlobalGet: (info) => {
            builder.getlocal_0(); // 'this' param
            let index = slotForGlobal(info.name, info.type);
            builder.getslot(index);
        },

        visitGlobalSet: (info) => {
            builder.getlocal_0(); // 'this' param
            traverse(info.value);
            let index = slotForGlobal(info.name, info.type);
            builder.setslot(index);
        },

        visitLoad: (info) => {
            // todo: can be isAtomic
            // todo: need to worry about alignment hints or no?

            traverse(info.ptr);

            if (info.offset > 0) {
                if (info.offset <= 255) {
                    builder.pushbyte(info.offset);
                } else if (info.offset <= U30_MAX) {
                    builder.pushshort(info.offset);
                } else {
                    builder.pushint(info.offset);
                }
                builder.add_i();
            }
            switch (info.type) {
                case binaryen.i32:
                    switch (info.bytes) {
                        case 1:
                            builder.li8();
                            if (info.isSigned) {
                                builder.sxi8();
                            }
                            break;
                        case 2:
                            builder.li16();
                            if (info.isSigned) {
                                builder.sxi16();
                            }
                            break;
                        case 4:
                            builder.li32();
                            break;
                    }
                    break;
                case binaryen.f32:
                    builder.lf32();
                    break;
                case binaryen.f64:
                    builder.lf64();
                    break;
                default:
                    throw new Error('unexpected load type ' + info.type);
            }
        },

        visitStore: (info) => {
            // todo: can be isAtomic
            // todo: need to worry about alignment hints or no?

            traverse(info.ptr);
            if (info.offset > 0) {
                if (info.offset <= 255) {
                    builder.pushbyte(info.offset);
                } else if (info.offset <= U30_MAX) {
                    builder.pushshort(info.offset);
                } else {
                    builder.pushint(info.offset);
                }
                builder.add_i();
            }

            traverse(info.value);

            // Flash's si32/si16/si8/sf32/sf64 instructions take
            // value then pointer, but Wasm stores take pointer
            // then value. For now do a stack swap but it might
            // be better to reorder the items when we can confirm
            // there's no side effects.
            builder.swap();

            let value = binaryen.getExpressionInfo(info.value);
            switch (value.type) {
                case binaryen.i32:
                    switch (info.bytes) {
                        case 1: builder.si8(); break;
                        case 2: builder.si16(); break;
                        case 4: builder.si32(); break;
                        default:
                            throw new Error('unexpected store size ' + info.bytes);
                    }
                    break;
                case binaryen.f32:
                    builder.sf32();
                    break;
                case binaryen.f64:
                    builder.sf64();
                    break;
                default:
                    throw new Error('unexpected store type ' + info.type);
            }
        },

        visitConst: (info) => {
            switch (info.type) {
                case binaryen.i32:
                    if (info.value >= 0 && info.value <= 255) {
                        builder.pushbyte(info.value);
                    } else if (info.value >= 0 && info.value <= U30_MAX) {
                        builder.pushshort(info.value);
                    } else {
                        builder.pushint(info.value);
                    }
                    break;
                case binaryen.f32:
                case binaryen.f64:
                    if (isNaN(info.value)) {
                        builder.pushnan();
                    } else {
                        builder.pushdouble(info.value);
                    }
                    break;
                default:
                    throw new Error('unexpected const type ' + info.type);
            }
        },

        visitUnary: (info) => {
            let index;
            switch (info.op) {
                // int
                case binaryen.ClzInt32:
                    builder.getlocal_0(); // 'this'
                    index = methodIndex('__wasm2swf_clz32');
                    traverse(info.value);
                    builder.callmethod(index, 1);
                    builder.convert_i();
                    break;
                case binaryen.CtzInt32:
                case binaryen.PopcntInt32:
                    throw new Error('i32 unary should be removed');
                    break;

                // float
                case binaryen.NegFloat32:
                case binaryen.NegFloat64:
                    traverse(info.value);
                    builder.negate();
                    break;
                case binaryen.AbsFloat32:
                case binaryen.AbsFloat64:
                    builder.getlocal_0(); // 'this'
                    index = methodIndex('__wasm2swf_abs');
                    traverse(info.value);
                    builder.callmethod(index, 1);
                    break;
                case binaryen.CeilFloat32:
                case binaryen.CeilFloat64:
                    builder.getlocal_0(); // 'this'
                    index = methodIndex('__wasm2swf_ceil');
                    traverse(info.value);
                    builder.callmethod(index, 1);
                    break;
                case binaryen.FloorFloat32:
                case binaryen.FloorFloat64:
                    builder.getlocal_0(); // 'this'
                    index = methodIndex('__wasm2swf_floor');
                    traverse(info.value);
                    builder.callmethod(index, 1);
                    break;
                case binaryen.TruncFloat32:
                case binaryen.TruncFloat64:
                    throw new Error('trunc should be removed');
                    break;
                case binaryen.NearestFloat32:
                case binaryen.NearestFloat64:
                    throw new Error('nearest should be removed');
                    break;
                case binaryen.SqrtFloat32:
                case binaryen.SqrtFloat64:
                    builder.getlocal_0(); // 'this'
                    index = methodIndex('__wasm2swf_sqrt');
                    traverse(info.value);
                    builder.callmethod(index, 1);
                    break;


                // relational
                case binaryen.EqZInt32:
                    traverse(info.value);
                    builder.pushbyte(0);
                    builder.strictequals();
                    builder.convert_i();
                    break;

                // float to int
                case binaryen.TruncSFloat32ToInt32:
                case binaryen.TruncSFloat64ToInt32:
                    traverse(info.value);
                    builder.convert_i(); // ??? check rounding
                    break;
                case binaryen.TruncUFloat32ToInt32:
                case binaryen.TruncUFloat64ToInt32:
                    traverse(info.value);
                    builder.convert_u(); // ??? check rounding
                    break;
                case binaryen.ReinterpretFloat32:
                    index = methodIndex('wasm2js_scratch_store_f32');
                    builder.getlocal_0(); // 'this'
                    traverse(info.value);
                    builder.callmethod(index, 1);
                    builder.pop();

                    index = methodIndex('wasm2js_scratch_load_i32');
                    builder.getlocal_0(); // 'this'
                    builder.callmethod(index, 0);
                    builder.convert_i();

                    break;
                case binaryen.ReinterpretFloat64:
                    throw new Error('reinterpret f64 should be removed already');
                    break;
                case binaryen.ConvertSInt32ToFloat32:
                case binaryen.ConvertSInt32ToFloat64:
                    traverse(info.value);
                    builder.convert_d();
                    break;
                case binaryen.ConvertUInt32ToFloat32:
                case binaryen.ConvertUInt32ToFloat64:
                    traverse(info.value);
                    builder.convert_u();
                    builder.convert_d();
                    break;
                case binaryen.PromoteFloat32:
                case binaryen.DemoteFloat64:
                    // nop for now
                    traverse(info.value);
                    break;
                case binaryen.ReinterpretInt32:
                    index = methodIndex('wasm2js_scratch_store_i32');
                    builder.getlocal_0(); // 'this'
                    traverse(info.value);
                    builder.callmethod(index, 1);
                    builder.pop();

                    index = methodIndex('wasm2js_scratch_load_f32');
                    builder.getlocal_0(); // 'this'
                    builder.callmethod(index, 0);
                    builder.convert_d();

                    break;
                case binaryen.ReinterpretInt64:
                    throw new Error('reinterpret int should be removed already');
                    break;
                
                default:
                    throw new Error('unhandled unary op ' + info.op);
            }
        },

        visitBinary: (info) => {
            let right;
            switch (info.op) {
                // int or float
                case binaryen.AddInt32:
                    traverse(info.left);
                    right = binaryen.getExpressionInfo(info.right);
                    if (right.id == binaryen.ConstId && right.value == 1) {
                        builder.increment_i();
                    } else if (right.id == binaryen.ConstId && right.value == -1) {
                        builder.decrement_i();
                    } else {
                        traverse(info.right);
                        builder.add_i();
                    }
                    break;
                case binaryen.SubInt32:
                    traverse(info.left);
                    right = binaryen.getExpressionInfo(info.right);
                    if (right.id == binaryen.ConstId && right.value == 1) {
                        builder.decrement_i();
                    } else if (right.id == binaryen.ConstId && right.value == -1) {
                        builder.increment_i();
                    } else {
                        traverse(info.right);
                        builder.subtract_i();
                    }
                    break;
                case binaryen.MulInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.multiply_i();
                    break;

                // int
                case binaryen.DivSInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.divide();
                    builder.convert_i();
                    break;
                case binaryen.DivUInt32:
                    traverse(info.left);
                    builder.convert_u();
                    traverse(info.right);
                    builder.convert_u();
                    builder.divide();
                    builder.convert_u();
                    break;
                case binaryen.RemSInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.modulo();
                    builder.convert_i();
                    break;
                case binaryen.RemUInt32:
                    traverse(info.left);
                    builder.convert_u();
                    traverse(info.right);
                    builder.convert_u();
                    builder.modulo();
                    builder.convert_u();
                    break;

                case binaryen.AndInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.bitand();
                    break;
                case binaryen.OrInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.bitor();
                    break;
                case binaryen.XorInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.bitxor();
                    break;
                case binaryen.ShlInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.lshift();
                    break;
                case binaryen.ShrUInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.urshift();
                    builder.convert_i();
                    break;
                case binaryen.ShrSInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.rshift();
                    break;
                case binaryen.RotLInt32:
                    throw new Error('rotate should be removed already');
                    break;
                case binaryen.RotRInt32:
                    throw new Error('rotate should be removed already');
                    break;

                // relational ops
                // int or float
                case binaryen.EqInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.strictequals();
                    builder.convert_i();
                    break;
                case binaryen.NeInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.strictequals();
                    builder.not();
                    builder.convert_i();
                    break;
                // int
                case binaryen.LtSInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.lessthan();
                    builder.convert_i();
                    break;
                case binaryen.LtUInt32:
                    traverse(info.left);
                    builder.convert_u();
                    traverse(info.right);
                    builder.convert_u();
                    builder.lessthan();
                    builder.convert_i();
                    break;
                case binaryen.LeSInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.lessequals();
                    builder.convert_i();
                    break;
                case binaryen.LeUInt32:
                    traverse(info.left);
                    builder.convert_u();
                    traverse(info.right);
                    builder.convert_u();
                    builder.lessequals();
                    builder.convert_i();
                    break;
                case binaryen.GtSInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.greaterthan();
                    builder.convert_i();
                    break;
                case binaryen.GtUInt32:
                    traverse(info.left);
                    builder.convert_u();
                    traverse(info.right);
                    builder.convert_u();
                    builder.greaterthan();
                    builder.convert_i();
                    break;
                case binaryen.GeSInt32:
                    traverse(info.left);
                    traverse(info.right);
                    builder.greaterequals();
                    builder.convert_i();
                    break;
                case binaryen.GeUInt32:
                    traverse(info.left);
                    builder.convert_u();
                    traverse(info.right);
                    builder.convert_u();
                    builder.greaterequals();
                    builder.convert_i();
                    break;

                // int or float
                case binaryen.AddFloat32:
                case binaryen.AddFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    builder.add();
                    break;
                case binaryen.SubFloat32:
                case binaryen.SubFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    builder.subtract();
                    break;
                case binaryen.MulFloat32:
                case binaryen.MulFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    builder.multiply();
                    break;

                // float
                case binaryen.DivFloat32:
                case binaryen.DivFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    builder.divide();
                    break;
                case binaryen.CopySignFloat32:
                case binaryen.CopySignFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    throw new Error('copy sign should be removed already');
                    break;
                case binaryen.MinFloat32:
                case binaryen.MinFloat64:
                    builder.getlocal_0(); // 'this'
                    index = methodIndex('__wasm2swf_min');
                    traverse(info.left);
                    traverse(info.right);
                    builder.callmethod(index, 2);
                    break;
                case binaryen.MaxFloat32:
                case binaryen.MaxFloat64:
                    builder.getlocal_0(); // 'this'
                    index = methodIndex('__wasm2swf_max');
                    traverse(info.left);
                    traverse(info.right);
                    builder.callmethod(index, 2);
                    break;

                // relational ops
                // int or float
                case binaryen.EqFloat32:
                case binaryen.EqFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    builder.strictequals();
                    builder.convert_i();
                    break;
                case binaryen.NeFloat32:
                case binaryen.NeFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    builder.strictequals();
                    builder.not();
                    builder.convert_i();
                    break;
                case binaryen.LtFloat32:
                case binaryen.LtFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    builder.lessthan();
                    builder.convert_i();
                    break;
                case binaryen.LeFloat32:
                case binaryen.LeFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    builder.lessequals();
                    builder.convert_i();
                    break;
                case binaryen.GtFloat32:
                case binaryen.GtFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    builder.greaterthan();
                    builder.convert_i();
                    break;
                case binaryen.GeFloat32:
                case binaryen.GeFloat64:
                    traverse(info.left);
                    traverse(info.right);
                    builder.greaterequals();
                    builder.convert_i();
                    break;
                
                default:
                    throw new Error('unexpected binary op' + info);
            }
        },

        visitSelect: (info) => {
            traverse(info.ifTrue);
            traverse(info.ifFalse);
            traverse(info.condition);
            let label = new abc.Label();
            builder.iftrue(label);
            builder.swap();
            builder.label(label);
            builder.pop();
        },

        visitDrop: (info) => {
            builder.pop();
        },

        visitReturn: (info) => {
            if (info.value) {
                traverse(info.value);
                builder.returnvalue();
            } else {
                builder.returnvoid();
            }
        },

        visitHost: (info) => {
            switch (info.op) {
                case binaryen.MemoryGrow:
                    index = methodIndex('__wasm2swf_memory_grow');
                    builder.getlocal_0(); // 'this'
                    traverse(info.operands[0]);
                    builder.callmethod(index, 1);
                    builder.convert_i();
                    break;
                case binaryen.MemorySize:
                    index = methodIndex('__wasm2swf_memory_size');
                    builder.getlocal_0(); // 'this'
                    builder.callmethod(index, 0);
                    builder.convert_i();
                    break;
                default:
                    throw new ('unknown host operation ' + info.op);
            }
        },

        visitNop: (info) => {
            builder.nop();
        },

        visitUnreachable: (info) => {
            // no-op
        }
    };

    function traverse(expr) {
        walkExpression(expr, callbacks);
    }

    let info = binaryen.getFunctionInfo(func);
    let argTypes = binaryen.expandType(info.params).map(avmType);
    let resultType = avmType(info.results);
    let varTypes = info.vars.map(avmType);
    let localTypes = argTypes.concat(varTypes);

    console.log('\n\nfunc ' + info.name);
    console.log('  (' + argTypes.join(', ') + ')');
    console.log('  -> ' + resultType);
    if (info.vars.length > 0) {
        console.log('  var ' + varTypes.join(', '));
    }
    console.log('{');

    if (info.module === '') {
        // Regular function

        // Initialize local vars to their correct type
        let localBase = localTypes.length - varTypes.length;
        for (let i = localBase; i < localTypes.length; i++) {
            let type = localTypes[i];
            let index = i + 1;
            switch (type) {
                case 'int':
                    builder.pushbyte(0);
                    builder.setlocal(index);
                    break;
                case 'Number':
                    builder.pushdouble(0);
                    builder.setlocal(index);
                    break;
                default:
                    throw new Error('unexpected local type ' + type);
            }
        }

        if (info.body) {
            traverse(info.body);
        }

        if (info.results == binaryen.none) {
            // why dont we have one?
            builder.returnvoid();
        } else {
            // we should already have one
            //builder.returnvalue();
        }
    } else {
        // Import function.
        console.log('import from: ' + info.module + '.' + info.base);
    }

    const globalns = file.namespace('');
    const method = file.method({
        name: file.string(info.name),
        return_type: file.qname(globalns, resultType),
        param_types: argTypes.map((type) => file.qname(globalns, type)),
    });

    const body = file.methodBody({
        method,
        local_count: localTypes.length + 1,
        code: builder.toBytes()
    });

    console.log('}');

    // @fixme we must also add it to the class
}

function convertModule(mod) {
    const abcBuilder = new abc.ABCBuilder();
    let type_v = binaryen.createType([]);
    let type_j = binaryen.createType([binaryen.i64]);
    let type_i = binaryen.createType([binaryen.i32]);
    let type_f = binaryen.createType([binaryen.f32]);
    let type_d = binaryen.createType([binaryen.f64]);

    function addScratch(store, load, params, ret) {
        mod.addFunctionImport(
            store,
            'env',
            store,
            params,
            binaryen.void
        );
        mod.addFunctionImport(
            load,
            'env',
            load,
            type_v,
            ret
        );
        // hack to keep them alive
        // may be better to do differently?
        mod.addFunctionExport(store, store);
        mod.addFunctionExport(load, load);
    }
    addScratch(
        'wasm2js_scratch_store_i32',
        'wasm2js_scratch_load_i32',
        type_i,
        binaryen.i32
    );
    addScratch(
        'wasm2js_scratch_store_i64',
        'wasm2js_scratch_load_i64',
        type_j,
        binaryen.i64
    );
    addScratch(
        'wasm2js_scratch_store_f32',
        'wasm2js_scratch_load_f32',
        type_f,
        binaryen.f32
    );
    addScratch(
        'wasm2js_scratch_store_f64',
        'wasm2js_scratch_load_f64',
        type_d,
        binaryen.f64
    );

    binaryen.setOptimizeLevel(3); // yes, this is global.
    mod.runPasses([
        'legalize-js-interface', // done by wasm2js to change interface types
        'remove-non-js-ops', // done by wasm2js, will introduce intrinsics?
        'flatten', // needed by i64 lowering
        'i64-to-i32-lowering', // needed to grok i64s in i32-world
    ]);
    mod.optimize();
    mod.runPasses([
        'avoid-reinterprets',
        'flatten',
        'simplify-locals-notee-nostructure',
        'remove-unused-names',
        'merge-blocks',
        'coalesce-locals',
        'reorder-locals',
        'vacuum',
        'remove-unused-module-elements',
    ]);

    for (let i = 0; i < mod.getNumExports(); i++) {
        let ex = mod.getExportByIndex(i);
        let info = binaryen.getExportInfo(ex);
        console.log('export', info);
    }

    // First assign slot indexes 
    for (let i = 0; i < mod.getNumFunctions(); i++) {
        let func = mod.getFunctionByIndex(i);
        let info = binaryen.getFunctionInfo(func);
        let index = methods.push(info.name) - 1;
        methodIndexes[info.name] = index;
    }

    for (let index in methods) {
        let name = methods[index];
        console.log('method', index, name);
    }

    for (let i = 0; i < mod.getNumFunctions(); i++) {
        let func = mod.getFunctionByIndex(i);
        convertFunction(func, abcBuilder);
    }

    let bytes = abcBuilder.toBytes();
    console.log(`\n\n${bytes.length} bytes of abc`);

    return bytes;
}

let wasm = fs.readFileSync(infile);
let mod = binaryen.readBinary(wasm);
let bytes = convertModule(mod);

fs.writeFileSync('output.abc', bytes);
