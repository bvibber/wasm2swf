const fs = require('fs');
const binaryen = require('binaryen');
const {
    ABCFileBuilder,
    Label,
    Namespace,
    Instance,
    Class,
    Trait,
    Script,
} = require('./abc');
const {SWFFileBuilder} = require('./swf');

function help() {
    console.error(`wasm2swf --sprite -o outfile.swf infile.wasm\n`);
    console.error(`  -o outfile.swf save output as a loadable .swf movie`);
    console.error(`  -o outfile.abc save output as raw .abc bytecode`);
    console.error(`  --sprite       includes a stub Sprite class for Flash timeline`);
    console.error(`  --debug        embed "line numbers" for debugging`);
    console.error(`  --trace        emit trace() calls on every line`);
    console.error(`  --trace-funcs  emit trace() calls on every function entry`);
    console.error(`  --trace-mem    emit trace() calls on every load/store`);
    console.error(`  --trace-only=x only trace on the given functions`);
    console.error(`  --save-wast=outfile.wast save the transformed Wasm source`);
    console.error(`\n`);
}

let infile, outfile;
let sprite = false;
let debug = false;
let trace = false;
let traceFuncs = false;
let traceMem = false;
let traceOnly = [];
let saveWast;

function shouldTrace(funcName) {
    if (traceOnly.length > 0) {
        return traceOnly.indexOf(funcName) !== -1;
    }
    return true;
}

let args = process.argv.slice(2);
while (args.length > 0) {
    let arg = args.shift();
    let val;
    function prefixed(prefix) {
        if (arg.startsWith(prefix)) {
            val = arg.substr(prefix.length);;
            return true;
        }
        return false;
    }
    switch (arg) {
        case '-o':
        case '--output':
            outfile = args.shift();
            break;
        case '--sprite':
            sprite = true;
            break;
        case '--debug':
            debug = true;
            break;
        case '--trace':
            trace = true;
            break;
        case '--trace-funcs':
            traceFuncs = true;
            break;
        case '--trace-mem':
            traceMem = true;
            break;
        case '--help':
            help();
            process.exit(0);
            break;
        default:
            if (prefixed('--trace-only=')) {
                traceOnly = val.split(',');
                continue;
            }
            if (prefixed('--save-wast=')) {
                saveWast = val;
                continue;
            }

            if (infile) {
                console.error(`Too many input files, can take only one!\n`);
                help();
                process.exit(1);
            }

            infile = arg;
    }
}

if (!infile) {
    console.error(`Must provide an input .wasm file!\n`);
    help();
    process.exit(1);
}
if (!outfile) {
    console.error(`Must provide an output .swf or .abc file!\n`);
    help();
    process.exit(1);
}
if (!(outfile.endsWith('.swf') || outfile.endsWith('.abc'))) {
    console.error(`Output file must have .abc or .swf extension.\n`);
    help();
    process.exit(1);
}

function convertModule(mod) {
    const abc = new ABCFileBuilder();
    let pubns = abc.namespace(Namespace.PackageNamespace, abc.string(''));
    let privatens = abc.namespace(Namespace.PrivateNs, abc.string(''));
    let flashutilsns = abc.namespace(Namespace.Namespace, abc.string('flash.utils'));

    let type_v = binaryen.createType([]);
    let type_j = binaryen.createType([binaryen.i64]);
    let type_i = binaryen.createType([binaryen.i32]);
    let type_f = binaryen.createType([binaryen.f32]);
    let type_d = binaryen.createType([binaryen.f64]);

    let classTraits = [];
    let instanceTraits = [];

    let knownGlobals = {};
    function addGlobal(name, type, info) {
        if (!knownGlobals[name]) {
            instanceTraits.push(abc.trait({
                name: name,
                kind: Trait.Slot,
                type_name: type,
            }));
            knownGlobals[name] = {
                info
            };
        }
    }
    addGlobal(
        abc.qname(pubns, abc.string('exports')),
        abc.qname(pubns, abc.string('Object'))
    );
    addGlobal(
        abc.qname(privatens, abc.string('wasm$memory')),
        abc.qname(flashutilsns, abc.string('ByteArray'))
    );
    addGlobal(
        abc.qname(privatens, abc.string('wasm$table')),
        abc.qname(pubns, abc.string('Array'))
    );

    function addImport(name, params, ret) {
        mod.addFunctionImport(
            name,
            'env',
            name,
            params,
            ret
        );
        // hack to keep them alive
        // may be better to do differently?
        mod.addFunctionExport(name, name);
    }

    function addScratch(store, load, params, ret) {
        addImport(store, params, binaryen.void);
        addImport(load, type_v, ret);
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

    const imports = [];

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

    function convertFunction(func) {
        const builder = abc.methodBuilder();
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
                let label = new Label(name);
                labelStack.push(label);
                info.children.forEach(traverse);
                if (label.used) {
                    builder.label(label);
                }
                labelStack.pop();
            },

            visitIf: (info) => {
                let cond = binaryen.getExpressionInfo(info.condition);
                let ifend = new Label();
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
                            builder.iftrue(ifend);
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
                if (info.ifFalse) {
                    let elseend = new Label();
                    builder.jump(elseend);
                    builder.label(ifend);
                    traverse(info.ifFalse);
                    builder.label(elseend);
                } else {
                    builder.label(ifend);
                }
            },
        
            visitLoop: (info) => {
                let start = new Label(info.name);
                labelStack.push(start);
                builder.label(start);
                traverse(info.body);
                labelStack.pop();
            },
        
            visitBreak: (info) => {
                let label = labelByName(info.name);
                if (info.value) {
                    traverse(info.value);
                }
                if (info.condition) {
                    let cond = binaryen.getExpressionInfo(info.condition);
                    if (cond.id === binaryen.BinaryId) {
                        // Note these are backwards from 'if' :)
                        switch (cond.op) {
                            case binaryen.EqInt32:
                            case binaryen.EqFloat32:
                            case binaryen.EqFloat64:
                                traverse(cond.left);
                                traverse(cond.right);
                                builder.ifstricteq(label);
                                break;
                            case binaryen.NeInt32:
                            case binaryen.NeFloat32:
                            case binaryen.NeFloat64:
                                traverse(cond.left);
                                traverse(cond.right);
                                builder.ifstrictne(label);
                                break;
                            case binaryen.LtSInt32:
                            case binaryen.LtFloat32:
                            case binaryen.LtFloat64:
                                traverse(cond.left);
                                traverse(cond.right);
                                builder.iflt(label);
                                break;
                            case binaryen.LtUInt32:
                                traverse(cond.left);
                                builder.convert_u();
                                traverse(cond.right);
                                builder.convert_u();
                                builder.iflt(label);
                                break;
                            case binaryen.LeSInt32:
                            case binaryen.LeFloat32:
                            case binaryen.LeFloat64:
                                traverse(cond.left);
                                traverse(cond.right);
                                builder.ifle(label);
                                break;
                            case binaryen.LeUInt32:
                                traverse(cond.left);
                                builder.convert_u();
                                traverse(cond.right);
                                builder.convert_u();
                                builder.ifle(label);
                                break;
                            case binaryen.GtSInt32:
                            case binaryen.GtFloat32:
                            case binaryen.GtFloat64:
                                traverse(cond.left);
                                traverse(cond.right);
                                builder.ifgt(label);
                                break;
                            case binaryen.GtUInt32:
                                traverse(cond.left);
                                builder.convert_u();
                                traverse(cond.right);
                                builder.convert_u();
                                builder.ifgt(label);
                                break;
                            case binaryen.GeSInt32:
                            case binaryen.GeFloat32:
                            case binaryen.GeFloat64:
                                traverse(cond.left);
                                traverse(cond.right);
                                builder.ifge(label);
                                break;
                            case binaryen.GeUInt32:
                                traverse(cond.left);
                                builder.convert_u();
                                traverse(cond.right);
                                builder.convert_u();
                                builder.ifge(label);
                                break;

                            default:
                                traverse(info.condition);
                                builder.iftrue(label);
                                break;
                        }
                        return;
                    } else if (cond.id === binaryen.UnaryId) {
                        if (cond.op === binaryen.EqZInt32) {
                            traverse(cond.value);
                            builder.iffalse(label);
                            return;
                        }
                    }

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
                builder.coerce(abc.qname(pubns, abc.string('Instance')));
                info.operands.forEach(traverse);
                let method = abc.qname(privatens, abc.string('func$' + info.target));
                switch (info.type) {
                    case binaryen.none:
                        builder.callpropvoid(method, info.operands.length);
                        break;
                    case binaryen.i32:
                        builder.callproperty(method, info.operands.length);
                        builder.convert_i();
                        break;
                    case binaryen.f32:
                    case binaryen.f64:
                        builder.callproperty(method, info.operands.length);
                        builder.convert_d();
                        break;
                    default:
                        throw new Error('unexpected type in call ' + info.type);
                }
            },

            visitCallIndirect: (info) => {
                builder.getlocal_0(); // this argument
                builder.coerce(abc.qname(pubns, abc.string('Instance')));
                builder.getproperty(abc.qname(privatens, abc.string('wasm$table')))
                builder.coerce(abc.qname(pubns, abc.string('Array')));
                traverse(info.target);
                info.operands.forEach(traverse);
                let pubset = abc.namespaceSet([pubns]);
                let runtime = abc.multinameL(pubset);
                switch (info.type) {
                    case binaryen.none:
                        builder.callpropvoid(runtime, info.operands.length);
                        break;
                    case binaryen.i32:
                        builder.callproperty(runtime, info.operands.length);
                        builder.convert_i();
                        break;
                    case binaryen.f32:
                    case binaryen.f64:
                        builder.callproperty(runtime, info.operands.length);
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
                        left.index == info.index &&
                        right.id == binaryen.ConstId
                    ) {
                        if (right.value === 1) {
                            builder.inclocal_i(i);
                            if (info.isTee) {
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
                let globalId = mod.getGlobal(info.name);
                let globalInfo = binaryen.getGlobalInfo(globalId);

                let name = abc.qname(privatens, abc.string('global$' + globalInfo.name));
                let type = abc.qname(pubns, abc.string(avmType(globalInfo.type)));
                addGlobal(name, type, globalInfo);
        
                builder.getlocal_0(); // 'this' param
                builder.coerce(abc.qname(pubns, abc.string('Instance')));
                builder.getproperty(name);
                switch (info.type) {
                    case binaryen.i32:
                        builder.convert_i();
                        break;
                    case binaryen.f32:
                    case binaryen.f64:
                        builder.convert_d();
                        break;
                }
            },

            visitGlobalSet: (info) => {
                let globalId = mod.getGlobal(info.name);
                let globalInfo = binaryen.getGlobalInfo(globalId);

                let name = abc.qname(privatens, abc.string('global$' + globalInfo.name));
                let type = abc.qname(pubns, abc.string(avmType(globalInfo.type)));
                addGlobal(name, type, globalInfo);

                builder.getlocal_0();
                builder.coerce(abc.qname(pubns, abc.string('Instance')));
                traverse(info.value);
                builder.setproperty(name);
            },

            visitLoad: (info) => {
                // todo: can be isAtomic
                // todo: need to worry about alignment hints or no?

                traverse(info.ptr);

                if (info.offset > 0) {
                    builder.pushint_value(info.offset);
                    builder.add_i();
                }

                if (traceMem && shouldTrace(funcName)) {
                    builder.dup();
                    builder.getlex(abc.qname(pubns, abc.string('trace')));
                    builder.swap();
                    builder.pushnull();
                    builder.swap();
                    builder.pushstring(abc.string(' load ptr - x' + info.bytes));
                    builder.add();
                    builder.call(1);
                    builder.pop();
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

                if (traceMem && shouldTrace(funcName)) {
                    builder.dup();
                    builder.getlex(abc.qname(pubns, abc.string('trace')));
                    builder.swap();
                    builder.pushnull();
                    builder.swap();
                    builder.pushstring(abc.string(' load val - x' + info.bytes));
                    builder.add();
                    builder.call(1);
                    builder.pop();
                }
            },

            visitStore: (info) => {
                // todo: can be isAtomic
                // todo: need to worry about alignment hints or no?

                traverse(info.ptr);
                if (info.offset > 0) {
                    builder.pushint_value(info.offset);
                    builder.add_i();
                }

                if (traceMem && shouldTrace(funcName)) {
                    builder.dup();
                    builder.getlex(abc.qname(pubns, abc.string('trace')));
                    builder.swap();
                    builder.pushnull();
                    builder.swap();
                    builder.pushstring(abc.string(' store ptr - x' + info.bytes));
                    builder.add();
                    builder.call(1);
                    builder.pop();
                }

                traverse(info.value);

                if (traceMem && shouldTrace(funcName)) {
                    builder.dup();
                    builder.getlex(abc.qname(pubns, abc.string('trace')));
                    builder.swap();
                    builder.pushnull();
                    builder.swap();
                    builder.pushstring(abc.string(' store val - x' + info.bytes));
                    builder.add();
                    builder.call(1);
                    builder.pop();
                }

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
                        throw new Error('unexpected store type ' + value.type);
                }
            },

            visitConst: (info) => {
                switch (info.type) {
                    case binaryen.i32:
                        builder.pushint_value(info.value);
                        break;
                    case binaryen.f32:
                    case binaryen.f64:
                        if (isNaN(info.value)) {
                            builder.pushnan();
                        } else {
                            builder.pushdouble(abc.double(info.value));
                        }
                        break;
                    default:
                        throw new Error('unexpected const type ' + info.type);
                }
            },

            visitUnary: (info) => {
                switch (info.op) {
                    // int
                    case binaryen.ClzInt32:
                        builder.getlocal_0(); // 'this'
                        traverse(info.value);
                        builder.callproperty(abc.qname(privatens, abc.string('wasm$clz32')), 1);
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
                        builder.getlex(abc.qname(pubns, abc.string('Math')));
                        traverse(info.value);
                        builder.callproperty(abc.qname(pubns, abc.string('abs')), 1);
                        builder.convert_d();
                        break;
                    case binaryen.CeilFloat32:
                    case binaryen.CeilFloat64:
                        builder.getlex(abc.qname(pubns, abc.string('Math')));
                        traverse(info.value);
                        builder.callproperty(abc.qname(pubns, abc.string('ceil')), 1);
                        builder.convert_d();
                        break;
                    case binaryen.FloorFloat32:
                    case binaryen.FloorFloat64:
                        builder.getlex(abc.qname(pubns, abc.string('Math')));
                        traverse(info.value);
                        builder.callproperty(abc.qname(pubns, abc.string('floor')), 1);
                        builder.convert_d();
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
                        builder.getlex(abc.qname(pubns, abc.string('Math')));
                        traverse(info.value);
                        builder.callproperty(abc.qname(pubns, abc.string('sqrt')), 1);
                        builder.convert_d();
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
                        builder.getlocal_0(); // 'this'
                        traverse(info.value);
                        builder.callpropvoid(abc.qname(pubns, abc.string('wasm2js_scratch_store_f32')), 1);

                        builder.getlocal_0(); // 'this'
                        builder.pushbyte(0);
                        builder.callproperty(abc.qname(pubns, abc.string('wasm2js_scratch_load_i32')), 1);
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
                        builder.getlocal_0(); // 'this'
                        builder.pushbyte(0);
                        traverse(info.value);
                        builder.callpropvoid(abc.qname(privatens, abc.string('func$wasm2js_scratch_store_i32')), 2);

                        builder.getlocal_0(); // 'this'
                        builder.callproperty(abc.qname(privatens, abc.string('func$wasm2js_scratch_load_f32')), 0);
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
                        builder.convert_u();
                        traverse(info.right);
                        builder.urshift();
                        builder.convert_i();
                        if (traceMem && shouldTrace(funcName)) {
                            builder.dup();
                            builder.getlex(abc.qname(pubns, abc.string('trace')));
                            builder.swap();
                            builder.pushnull();
                            builder.swap();
                            builder.pushstring(abc.string(' urshift result'));
                            builder.add();
                            builder.call(1);
                            builder.pop();
                        }
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
                        builder.getlex(abc.qname(pubns, abc.string('Math')));
                        traverse(info.left);
                        traverse(info.right);
                        builder.callproperty(abc.qname(pubns, abc.string('min')), 2);
                        builder.convert_d();
                        break;
                    case binaryen.MaxFloat32:
                    case binaryen.MaxFloat64:
                        builder.getlex(abc.qname(pubns, abc.string('Math')));
                        traverse(info.left);
                        traverse(info.right);
                        builder.callproperty(abc.qname(pubns, abc.string('max')), 2);
                        builder.convert_d();
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
                let label = new Label();
                builder.iftrue(label);
                builder.swap();
                builder.label(label);
                builder.pop();
            },

            visitDrop: (info) => {
                traverse(info.value);
                builder.pop();
            },

            visitReturn: (info) => {
                if (info.value) {
                    traverse(info.value);
                    if (traceFuncs && shouldTrace(funcName)) {
                        builder.dup();
                        builder.getlex(abc.qname(pubns, abc.string('trace')));
                        builder.swap();
                        builder.pushnull();
                        builder.swap();
                        builder.pushstring(abc.string(' returned from ' + funcName));
                        builder.add();
                        builder.call(1);
                        builder.pop();
                    }
                    builder.returnvalue();
                } else {
                    if (traceFuncs && shouldTrace(funcName)) {
                        builder.getlex(abc.qname(pubns, abc.string('trace')));
                        builder.pushnull();
                        builder.pushstring(abc.string('void returned from ' + funcName));
                        builder.call(1);
                        builder.pop();
                    }
                    builder.returnvoid();
                }
            },

            visitHost: (info) => {
                switch (info.op) {
                    case binaryen.MemoryGrow:
                        builder.getlocal_0(); // 'this'
                        traverse(info.operands[0]);
                        builder.callproperty(abc.qname(privatens, abc.string('wasm$memory_grow')), 1);
                        builder.convert_i();
                        break;
                    case binaryen.MemorySize:
                        builder.getlocal_0(); // 'this'
                        builder.callproperty(abc.qname(privatens, abc.string('wasm$memory_size')), 0);
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
                builder.getlex(abc.qname(pubns, abc.string('Error')));
                builder.pushstring(abc.string('unreachable'));
                builder.construct(1);
                builder.throw();
            }
        };

        let info = binaryen.getFunctionInfo(func);
        var funcName = info.name; // var to use above. sigh
        let argTypes = binaryen.expandType(info.params).map(avmType);
        var resultType = avmType(info.results);
        let varTypes = info.vars.map(avmType);
        let localTypes = argTypes.concat(varTypes);

        let lineno = 1;
        if (debug) {
            builder.debugfile(abc.string('func$' + info.name));
        }
        function traverse(expr) {
            if (debug) {
                builder.debugline(lineno);
            }
            if (trace && shouldTrace(funcName)) {
                builder.getlex(abc.qname(pubns, abc.string('trace')));
                builder.pushnull();
                builder.pushstring(abc.string('func$' + info.name + ' line ' + lineno));
                builder.call(1);
                builder.pop();
            }
            lineno++;
            walkExpression(expr, callbacks);
        }

        console.log('\n\nfunc ' + info.name);
        console.log('  (' + argTypes.join(', ') + ')');
        console.log('  -> ' + resultType);
        if (info.vars.length > 0) {
            console.log('  var ' + varTypes.join(', '));
        }
        console.log('{');

        if (info.module === '') {
            // Regular function

            if (traceFuncs && shouldTrace(funcName)) {
                builder.getlex(abc.qname(pubns, abc.string('trace')));
                builder.pushnull();
                builder.pushstring(abc.string(info.name + ': '));
                for (let n = 0; n < argTypes.length; n++) {
                    builder.getlocal(n + 1);
                }
                builder.newarray(argTypes.length);
                builder.pushstring(abc.string(', '));
                builder.callproperty(abc.qname(builtinns, abc.string('join')), 1);
                builder.add();
                builder.call(1);
                builder.pop();
            }

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
                        builder.pushdouble(abc.double(0));
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
                if (traceFuncs && shouldTrace(funcName)) {
                    builder.getlex(abc.qname(pubns, abc.string('trace')));
                    builder.pushnull();
                    builder.pushstring(abc.string('void returned from ' + funcName));
                    builder.call(1);
                    builder.pop();
                }
                builder.returnvoid();
            } else {
                // we should already have one
                //builder.returnvalue();
            }
        } else {
            // Import function.
            console.log('import from: ' + info.module + '.' + info.base);
            let name = abc.qname(privatens, abc.string('import$' + info.module + '$' + info.base));
            instanceTraits.push(abc.trait({
                name: name,
                kind: Trait.Slot,
                type_name: abc.qname(pubns, abc.string('Function'))
            }));
            imports.push(info);
            builder.getlocal_0();
            for (let index = 0; index < argTypes.length; index++) {
                builder.getlocal(index + 1);
            }
            if (info.results == binaryen.none) {
                builder.callpropvoid(name, argTypes.length);
                attachDomainMemory(builder);
                builder.returnvoid();
            } else {
                builder.callproperty(name, argTypes.length);
                // it will be coerced to the correct type
                attachDomainMemory(builder);
                builder.returnvalue();
            }
        }

        let method = abc.method({
            name: abc.string(info.name),
            return_type: abc.qname(pubns, abc.string(resultType)),
            param_types: argTypes.map((type) => abc.qname(pubns, abc.string(type))),
        });

        abc.methodBody({
            method,
            local_count: localTypes.length + 1,
            init_scope_depth: 3,
            max_scope_depth: 3,
            max_stack: builder.max_stack,
            code: builder.toBytes()
        });

        instanceTraits.push(abc.trait({
            name: abc.qname(privatens, abc.string('func$' + info.name)),
            kind: Trait.Method | Trait.Final,
            disp_id: method, // compiler-assigned, so use the same one
            method
        }));

        console.log('}');

        // @fixme we must also add it to the class

    }

    let privateUse = new Array(256);
    for (let i = 0; i < 256; i++) {
        privateUse[i] = String.fromCharCode(0xe000 + i);
    }

    function binaryString(data) {
        let bytes = new Uint8Array(data);
        let len = bytes.length;
        let arr = new Array(len);
        for (let i = 0; i < len; i++) {
            arr[i] = privateUse[bytes[i]];
        }
        return arr.join('');
    }

    binaryen.setOptimizeLevel(3); // yes, this is global.
    mod.runPasses([
        'legalize-js-interface', // done by wasm2js to change interface types
        'remove-non-js-ops', // done by wasm2js, will introduce intrinsics?
        'flatten', // needed by i64 lowering
        'i64-to-i32-lowering', // needed to grok i64s in i32-world
        //'alignment-lowering', // force aligned accesses
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

    // Convert functions to methods
    for (let i = 0; i < mod.getNumFunctions(); i++) {
        let func = mod.getFunctionByIndex(i);
        convertFunction(func);
    }

    // Internal functions o' doom
    {
        // wasm$clz32 helper
        let intType = abc.qname(pubns, abc.string('int'));
        let method = abc.method({
            name: abc.string('clz32'),
            return_type: intType,
            param_types: [intType]
        });

        let op = abc.methodBuilder();
        // var n:int = 32;
        op.pushbyte(32);
        op.setlocal_2();

        for (let bits of [16, 8, 4, 2]) {
            // var y:int = x >> bits;
            op.getlocal_1();
            op.pushbyte(bits);
            op.rshift();
            op.dup();
            op.setlocal_3();
            // if (y) {
            let endif = new Label();
            op.iffalse(endif);
            //   n -= bits;
            op.getlocal_2();
            op.pushbyte(bits);
            op.subtract_i();
            op.setlocal_2();
            //   x = y;
            op.getlocal_3();
            op.setlocal_1();
            op.label(endif);
            // }
        }

        // y = x >> 1
        op.getlocal_1();
        op.pushbyte(1);
        op.rshift();
        op.dup();
        op.setlocal_3();
        // if (y) {
        let endif = new Label();
        op.iffalse(endif);
        // return n - 2
        op.getlocal_2();
        op.pushbyte(2);
        op.subtract_i();
        op.returnvalue();
        op.label(endif);
        // }
        // return n - x
        op.getlocal_2();
        op.getlocal_1();
        op.subtract_i();
        op.returnvalue();

        let body = abc.methodBody({
            method,
            local_count: 4,
            init_scope_depth: 3,
            max_scope_depth: 3,
            code: op.toBytes(),
        });

        instanceTraits.push(abc.trait({
            name: abc.qname(privatens, abc.string('wasm$clz32')),
            kind: Trait.Method,
            method
        }));
    }
    {
        // wasm$memory_grow helper
        let intType = abc.qname(pubns, abc.string('int'));
        let method = abc.method({
            name: abc.string('memory_grow'),
            return_type: intType,
            param_types: [intType]
        });

        let op = abc.methodBuilder();
        // var old:int = this.wasm$memory.length >>> 16;
        op.getlocal_0();
        op.getproperty(abc.qname(privatens, abc.string('wasm$memory')));
        op.getproperty(abc.qname(pubns, abc.string('length')));
        op.pushbyte(16);
        op.urshift();
        op.convert_i();
        op.setlocal_2();

        // @fixme enforce maximums, etc.
        // this.wasm$memory.length = (arg1 + old) << 16;
        op.getlocal_0();
        op.getproperty(abc.qname(privatens, abc.string('wasm$memory')));
        op.getlocal_1();
        op.getlocal_2();
        op.add_i();
        op.pushbyte(16);
        op.lshift();

        if (traceMem) {
            op.dup();
            op.getlex(abc.qname(pubns, abc.string('trace')));
            op.swap();
            op.pushnull();
            op.swap();
            op.pushstring(abc.string(' growing memory size'));
            op.add();
            op.call(1);
            op.pop();
        }

        op.setproperty(abc.qname(pubns, abc.string('length')));

        // return old;
        op.getlocal_2();
        op.returnvalue();

        let body = abc.methodBody({
            method,
            local_count: 3,
            init_scope_depth: 3,
            max_scope_depth: 3,
            code: op.toBytes(),
        });

        instanceTraits.push(abc.trait({
            name: abc.qname(privatens, abc.string('wasm$memory_grow')),
            kind: Trait.Method,
            method
        }));
    }
    {
        // wasm$memory_size helper
        let intType = abc.qname(pubns, abc.string('int'));
        let method = abc.method({
            name: abc.string('memory_size'),
            return_type: intType,
            param_types: []
        });

        let op = abc.methodBuilder();
        // this.wasm$memory.length >>> 16
        op.getlocal_0();
        op.getproperty(abc.qname(privatens, abc.string('wasm$memory')));
        op.getproperty(abc.qname(pubns, abc.string('length')));

        if (traceMem) {
            op.dup();
            op.getlex(abc.qname(pubns, abc.string('trace')));
            op.swap();
            op.pushnull();
            op.swap();
            op.pushstring(abc.string(' is the memory size'));
            op.add();
            op.call(1);
            op.pop();
        }

        op.pushbyte(16);
        op.urshift();
        op.convert_i();
        op.returnvalue();

        let body = abc.methodBody({
            method,
            local_count: 1,
            init_scope_depth: 3,
            max_scope_depth: 3,
            code: op.toBytes(),
        });

        instanceTraits.push(abc.trait({
            name: abc.qname(privatens, abc.string('wasm$memory_size')),
            kind: Trait.Method,
            method
        }));
    }
    {
        // wasm$memory_init helper
        abc.qname(privatens, 'wasm$memory_init')

        let voidType = abc.qname(pubns, abc.string('void'));
        let intType = abc.qname(pubns, abc.string('int'));
        let stringType = abc.qname(pubns, abc.string('String'));
        let method = abc.method({
            name: abc.string('memory_init'),
            return_type: voidType,
            param_types: [intType, stringType]
        });

        let op = abc.methodBuilder();
        // local1 = byteOffset
        // local2 = str

        // local3 = i = 0
        op.pushbyte(0);
        op.setlocal_3();

        // local4 = len = str.length
        op.getlocal_2();
        op.getproperty(abc.qname(pubns, abc.string('length')));
        op.convert_i();
        op.setlocal(4);

        let loopStart = new Label();
        let loopEnd = new Label();
        op.label(loopStart);

        // if not i < len, jump to loopEnd
        op.getlocal_3();
        op.getlocal(4);
        op.ifnlt(loopEnd);

        // si8(str.charCodeAt(i), byteOffset + i)
        op.getlocal_2(); // str
        op.getlocal_3(); // i
        op.callproperty(abc.qname(pubns, abc.string('charCodeAt')), 1);
        op.convert_i();
        op.getlocal_1();
        op.getlocal_3();
        op.add_i();
        op.si8();

        // i++
        op.inclocal_i(3);

        // Back to start of loop
        op.jump(loopStart);

        op.label(loopEnd);

        op.returnvoid();

        abc.methodBody({
            method,
            local_count: 5,
            init_scope_depth: 3,
            max_scope_depth: 3,
            code: op.toBytes(),
            max_stack: op.max_stack
        });

        instanceTraits.push(abc.trait({
            name: abc.qname(privatens, abc.string('wasm$memory_init')),
            kind: Trait.Method,
            method
        }));
    }

    // Class static initializer
    let cinit = abc.method({
        name: abc.string('wasm2swf_cinit'),
        return_type: abc.qname(pubns, abc.string('void')),
        param_types: [],
    });
    let cinitBody = abc.methodBuilder();
    cinitBody.returnvoid();
    abc.methodBody({
        method: cinit,
        local_count: 1,
        init_scope_depth: 3,
        max_scope_depth: 3,
        code: cinitBody.toBytes()
    });
    let classi = abc.addClass(cinit, classTraits);

    // Instance constructor
    let iinit = abc.method({
        name: abc.string('wasm2swf_iinit'),
        return_type: abc.qname(pubns, abc.string('void')),
        param_types: [abc.qname(pubns, abc.string('Object'))],
    });

    let iinitBody = abc.methodBuilder();
    iinitBody.getlocal_0();
    iinitBody.constructsuper(0);

    // Initialize globals
    for (let glob of Object.values(knownGlobals)) {
        let globalInfo = glob.info;
        if (globalInfo) {
            let init = globalInfo.init;
            if (!init) continue;
            let info = binaryen.getExpressionInfo(init);
            if (info.id === binaryen.ConstId) {
                iinitBody.getlocal_0();
                switch (info.type) {
                    case binaryen.i32:
                        iinitBody.pushint_value(info.value);
                        break;
                    case binaryen.f32:
                    case binaryen.f64:
                        iinitBody.pushdouble(abc.double(info.value));
                        break;
                    default:
                        throw new Error('Unexpected constant initializer type');
                }
                iinitBody.initproperty(abc.qname(privatens, abc.string('global$' + globalInfo.name)))
            } else {
                throw new Error('Non-constant global initializer');
            }
        }
    }

    // Initialize the memory
    iinitBody.getlocal_0();
    iinitBody.getlex(abc.qname(flashutilsns, abc.string('ByteArray')));
    iinitBody.construct(0);
    iinitBody.dup();
    iinitBody.pushstring(abc.string('littleEndian'));
    iinitBody.setproperty(abc.qname(pubns, abc.string('endian')));
    iinitBody.dup();
    iinitBody.pushint_value(2 ** 24); // default to 16 MiB memory for the moment
    iinitBody.setproperty(abc.qname(pubns, abc.string('length')));
    iinitBody.initproperty(abc.qname(privatens, abc.string('wasm$memory'))); // on this

    // Set it as domain memory
    function attachDomainMemory(op) {
        let flashsystemns = abc.namespace(Namespace.Namespace, abc.string('flash.system'));
        let appDomainName = abc.qname(flashsystemns, abc.string('ApplicationDomain'));

        // @fixme maybe save the domain for handier access
        op.getlex(appDomainName);
        op.getproperty(abc.qname(pubns, abc.string('currentDomain')));
        op.coerce(appDomainName);

        op.getlocal_0();
        op.coerce(abc.qname(pubns, abc.string('Instance')));
        op.getproperty(abc.qname(privatens, abc.string('wasm$memory'))); // on this

        op.setproperty(abc.qname(pubns, abc.string('domainMemory'))); // on ApplicationDomain.currentDomain
    }
    attachDomainMemory(iinitBody);

    for (let i = 0; i < mod.getNumMemorySegments(); i++) {
        let segment = mod.getMemorySegmentInfoByIndex(i);

        iinitBody.getlocal_0();
        iinitBody.coerce(abc.qname(pubns, abc.string('Instance')));
        iinitBody.pushint_value(segment.byteOffset);
        iinitBody.pushstring(abc.string(binaryString(segment.data)));
        iinitBody.callpropvoid(abc.qname(privatens, abc.string('wasm$memory_init')), 2);
    }

    // Initialize the table
    let tableName = abc.qname(privatens, abc.string('wasm$table'));
    iinitBody.getlocal_0();
    iinitBody.coerce(abc.qname(pubns, abc.string('Instance')));
    iinitBody.getlex(abc.qname(pubns, abc.string('Array')));
    iinitBody.construct(0);
    // @fixme implement the initializer segments
    // needs accessors added to binaryen.js
    iinitBody.initproperty(tableName);

    for (let i = 0; i < mod.getNumFunctionTableSegments(); i++) {
        let segment = mod.getFunctionTableSegmentInfoByIndex(i);
        for (let j = 0; j < segment.functions.length; j++) {
            let name = segment.functions[j];
            let funcName = abc.qname(privatens, abc.string('func$' + name));

            let index = segment.offset + j;
            let pubset = abc.namespaceSet([pubns]); // is there a better way to do this?
            let runtimeName = abc.multinameL(pubset);

            iinitBody.getlocal_0();
            iinitBody.getproperty(tableName);
            iinitBody.pushint_value(index);
            iinitBody.getlocal_0();
            iinitBody.getproperty(funcName);
            iinitBody.setproperty(runtimeName);
        }
    }

    // Initialize the import function slots
    for (let info of imports) {
        iinitBody.getlocal_0(); // 'this'
        iinitBody.getlocal_1(); // imports
        iinitBody.getproperty(abc.qname(pubns, abc.string(info.module))); // imports.env
        iinitBody.getproperty(abc.qname(pubns, abc.string(info.base)));   // imports.env.somethingCool
        iinitBody.initproperty(abc.qname(privatens, abc.string('import$' + info.module + '$' + info.base)));
    }

    // Initialize the export object
    iinitBody.getlocal_0(); // 'this'
    let nprops = 0;
    for (let i = 0; i < mod.getNumExports(); i++) {
        let ex = mod.getExportByIndex(i);
        let info = binaryen.getExportInfo(ex);
        console.log('export', info);
        nprops++;
        let privname;
        switch (info.kind) {
            case binaryen.ExternalGlobal:
                // note we can't get a list of globals yet
                // so this is required to ensure we initialize all exported globals
                // evne if not referenced in methods
                {
                    let globalId = mod.getGlobal(info.value);
                    let globalInfo = binaryen.getGlobalInfo(globalId);

                    let name = abc.qname(privatens, abc.string('global$' + globalInfo.name));
                    let type = abc.qname(pubns, abc.string(avmType(globalInfo.type)));
                    addGlobal(name, type, globalInfo);
                }

                // @fixme this should export a WebAssembly.Global wrapper object
                privname = abc.string('global$' + info.value);
                break;
            case binaryen.ExternalFunction:
                privname = abc.string('func$' + info.value);
                break;
            case binaryen.ExternalMemory:
                // @fixme this should export a WebAssembly.Memory wrapper object
                privname = abc.string('wasm$memory');
                break;
            case binaryen.ExternalTable:
                // @fixme this should export a WebAssembly.Table wrapper object
                privname = abc.string('wasm$table');
                break;
            default: {
                console.log(info);
                throw new Error('unexpected export type');
            }
        }
        let pubname = abc.string(info.name);
        iinitBody.pushstring(pubname)
        iinitBody.getlocal_0(); // 'this'
        iinitBody.getproperty(abc.qname(privatens, privname));
    }
    iinitBody.newobject(nprops);
    iinitBody.initproperty(abc.qname(pubns, abc.string('exports')));
    iinitBody.returnvoid();

    abc.methodBody({
        method: iinit,
        local_count: 2,
        init_scope_depth: 3,
        max_scope_depth: 3,
        code: iinitBody.toBytes()
    });

    // @fixme maybe add class and instance data in the same call?
    let nameObject = abc.qname(pubns, abc.string('Object'));
    let className = abc.qname(pubns, abc.string('Instance'));
    abc.instance({
        name: className, // @todo make the namespace specifiable
        super_name: nameObject,
        flags: 0,
        iinit,
        traits: instanceTraits,
    });

    // Script initializer
    const init = abc.method({
        name: abc.string('wasm2swf_init'),
        return_type: abc.qname(pubns, abc.string('void')),
        param_types: [],
    });
    let initBody = abc.methodBuilder();

    // Initialize the Instance class
    initBody.getlocal_0(); // 'this' for pushscope
    initBody.pushscope();
    initBody.findpropstrict(className); // find where to store the class property soon...
    initBody.getlex(nameObject); // get base class scope
    initBody.pushscope();
    initBody.getlex(nameObject); // get base class
    initBody.newclass(classi);
    initBody.popscope();
    initBody.initproperty(className);

    let scriptTraits = [];
    scriptTraits.push(abc.trait({
        name: className,
        kind: Trait.Class,
        slot_id: 0,
        classi: classi,
    }));

    if (sprite) {
        // We seem to need a Sprite to load a swf
        let flashdisplayns = abc.namespace(Namespace.Namespace, abc.string('flash.display'));
        let flasheventsns = abc.namespace(Namespace.Namespace, abc.string('flash.events'));
        let spriteName = abc.qname(flashdisplayns, abc.string('Sprite'));
        let wrapperName = abc.qname(pubns, abc.string('Wrapper'));

        // Define the Wrapper sprite class

        let cinit = abc.method({
            name: abc.string('Wrapper_cinit'),
            return_type: abc.qname(pubns, abc.string('void')),
            param_types: []
        });
        let cinitBody = abc.methodBuilder();
        cinitBody.returnvoid();
        abc.methodBody({
            method: cinit,
            local_count: 1,
            init_scope_depth: 0,
            max_scope_depth: 8,
            code: cinitBody.toBytes(),
        })
        let classi = abc.addClass(cinit, []);

        let iinit = abc.method({
            name: abc.string('Wrapper_iinit'),
            return_type: abc.qname(pubns, abc.string('void')),
            param_types: []
        });
        let iinitBody = abc.methodBuilder();
        iinitBody.getlocal_0();
        iinitBody.constructsuper(0);
        iinitBody.returnvoid();
        abc.methodBody({
            method: iinit,
            local_count: 1,
            code: iinitBody.toBytes()
        });

        abc.instance({
            name: wrapperName,
            super_name: spriteName,
            flags: 0,
            iinit,
            traits: [],
        });
    
        // Initialize the Wrapper class
        initBody.getlocal_0(); // 'this' for pushscope
        initBody.pushscope();
        initBody.findpropstrict(className); // find where to store the class property soon...
        initBody.getlex(nameObject);
        initBody.pushscope();
        initBody.getlex(abc.qname(flasheventsns, abc.string('EventDispatcher')));
        initBody.pushscope();
        initBody.getlex(abc.qname(flashdisplayns, abc.string('DisplayObject')));
        initBody.pushscope();
        initBody.getlex(abc.qname(flashdisplayns, abc.string('InteractiveObject')));
        initBody.pushscope();
        initBody.getlex(abc.qname(flashdisplayns, abc.string('DisplayObjectContainer')));
        initBody.pushscope();
        initBody.getlex(spriteName); // get base class scope
        initBody.pushscope();
        initBody.getlex(spriteName); // get base class
        initBody.newclass(classi);
        initBody.popscope();
        initBody.popscope();
        initBody.popscope();
        initBody.popscope();
        initBody.popscope();
        initBody.popscope();
        initBody.initproperty(wrapperName);
        
        scriptTraits.push(abc.trait({
            name: wrapperName,
            kind: Trait.Class,
            slot_id: 0,
            classi: classi,
        }));
    }

    initBody.returnvoid();
    abc.methodBody({
        method: init,
        local_count: 1,
        init_scope_depth: 0,
        max_scope_depth: 8,
        code: initBody.toBytes(),
    });

    abc.script(init, scriptTraits);

    let bytes = abc.toBytes();
    console.log(`\n\n${bytes.length} bytes of abc`);

    return bytes;
}


function generateSWF(symbols, tags, bytecode) {
    let swf = new SWFFileBuilder();

    swf.header({
        width: 10000,
        height: 7500,
        framerate: 24,
    });

    swf.fileAttributes({
        actionScript3: true,
        useNetwork: true,
    });

    swf.frameLabel('frame1');
    swf.doABC('frame1', bytecode);
    swf.symbolClass(symbols, tags);
    swf.showFrame();
    swf.end();

    return swf.toBytes();
}

let wasm = fs.readFileSync(infile);
let mod = binaryen.readBinary(wasm);
let bytes = convertModule(mod, sprite);

if (saveWast) {
    let buf = (new TextEncoder()).encode(mod.emitText());
    fs.writeFileSync(saveWast, buf);
}

if (outfile.endsWith('.abc')) {
    fs.writeFileSync(outfile, bytes);
} else {
    let classes = ['Instance'];
    let tags = {};
    if (sprite) {
        /*
        classes.push('Wrapper');
        tags.Wrapper = 0;
        tags.Instance = 1;
        */
        classes = ['Wrapper'];
    }
    let swf = generateSWF(classes, tags, bytes);
    fs.writeFileSync(outfile, swf);
}
