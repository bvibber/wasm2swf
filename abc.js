const {
    Builder
} = require('./utils');

class ABCFile {
    constructor() {
        this.minor_version = 16;
        this.major_version = 46;
        this.constant_pool = new CPool();
        this.methods = [];
        this.metadata = [];
        this.instances = [];
        this.classes = [];
        this.scripts = [];
        this.method_bodies = [];
    }
}

class CPool {
    constructor() {
        this.integers = [0];
        this.uintegers = [0];
        this.doubles = [NaN];
        this.strings = [undefined]; // placeholder for '' or '*' in namespace constants
        this.namespaces = [new Namespace(-1)]; // placeholder for '*' namespace
        this.ns_sets = [new NamespaceSet([-1])];
        this.multinames = [new Multiname({
            kind: -1,
            name: -1
        })];
    }

    _find(list, val) {
        // Try for an exact match first:
        let index = list.indexOf(val);

        // If we created a new object, match its props.
        if (index === -1 && typeof val === 'object') {
            return list.findIndex((o) => val.equals(o));
        }

        return index;
    }

    _append(list, val) {
        let index = this._find(list, val);
        if (index === -1) {
            index = list.push(val) - 1;
        }
        return index;
    }

    integer(val) {
        if (typeof val !== 'number') {
            throw new Error('integer must be a number');
        }
        return this._append(this.integers, val | 0);
    }

    uinteger(val) {
        if (typeof val !== 'number') {
            throw new Error('uinteger must be a number');
        }
        return this._append(this.uintegers, val >>> 0);
    }

    double(val) {
        if (typeof val !== 'number') {
            throw new Error('double must be a number');
        }
        if (isNaN(val)) {
            return 0;
        }
        return this._append(this.doubles, +val);
    }

    string(str) {
        if (typeof str !== 'string') {
            throw new Error('string must be a string');
        }
        return this._append(this.strings, str);
    }

    namespace(ns) {
        if (!(ns instanceof Namespace)) {
            throw new Error('namespace must be a Namespace');
        }
        return this._append(this.namespaces, ns);
    }

    namespaceSet(ns_set) {
        if (!(ns_set instanceof NamespaceSet)) {
            throw new Error('namespaceSet must be a NamespaceSet');
        }
        return this._append(this.ns_sets, ns_set);
    }

    multiname(multiname) {
        if (!(multiname instanceof Multiname)) {
            throw new Error('multiname must be a Multiname');
        }
        return this._append(this.multinames, multiname);
    }
}

class Namespace {
    // kind is one of the constants
    // name is a reference to the string pool
    constructor(kind, name) {
        this.kind = kind;
        this.name = name;
    }

    equals(ns) {
        return (this.kind === ns.kind) && (this.name === ns.name);
    }

    static Namespace = 0x08;
    static PackageNamespace = 0x16;
    static PackageInternalNs = 0x17;
    static ProtectedNamespace = 0x18;
    static ExplicitNamespace = 0x19;
    static StaticProtectedNs = 0x1a;
    static PrivateNs = 0x05;
}

class NamespaceSet {
    // @param {Array<int>} ns
    constructor(ns) {
        this.ns = ns;
    }

    equals(other) {
        if (this === other) {
            return true;
        }
        if (this.ns.length === other.ns.length) {
            for (let i = 0; i < this.ns.length; i++) {
                if (this.ns[i] !== other.ns[i]) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
}

class Multiname {
    constructor(info) {
        this.kind = info.kind;
        this.ns = info.ns || 0;
        this.name = info.name || 0;
        this.ns_set = info.ns_set || 0;
    }

    equals(o) {
        return (this === o) || (
            this.kind === o.kind &&
            this.ns === o.ns &&
            this.name === o.name &&
            this.ns_set === o.ns_set
        );
    }

    static QName       = 0x07;
    static QNameA      = 0x0D;
    static RTQName     = 0x0F;
    static RTQNameA    = 0x10;
    static RTQNameL    = 0x11;
    static RTQNameLA   = 0x12;
    static Multiname   = 0x09;
    static MultinameA  = 0x0E;
    static MultinameL  = 0x1B;
    static MultinameLA = 0x1C;
}

class Method {
    constructor(info = {}) {
        this.return_type = info.return_type || 0;
        this.param_types = info.param_types || []
        this.name = info.name || 0;
        this.flags = info.flags || 0;
        this.options = info.options || [];
        this.param_names = info.param_names || [];
    }

    static NEED_ARGUMENTS = 0x01;
    static NEED_ACTIVATION = 0x02;
    static NEED_REST = 0x04;
    static HAS_OPTIONAL = 0x08;
    static SET_DXNS = 0x40;
    static HAS_PARAM_NAMES = 0x80;
}

class OptionDetail {
    constructor(val, kind) {
        this.val = val;
        this.kind = kind;
    }

    static Int = 0x03;
    static UInt = 0x04;
    static Double = 0x06;
    static Utf8 = 0x01;
    static True = 0x0b;
    static False = 0x0a;
    static Null = 0x0c;
    static Undefined = 0x00;
}

class MethodBody {
    constructor(info) {
        this.method = info.method || 0;
        this.max_stack = info.max_stack || 64; // ! just use a large #?
        this.local_count = info.local_count || 0; // includes args?
        this.init_scope_depth = info.init_scope_depth || 0;
        this.max_scope_depth = info.max_scope_depth || 0;
        this.code = info.code || new Uint8Array(0);
        this.exceptions = info.exceptions || [];
        this.traits = info.traits || [];
    }
}

class Metadata {
    constructor(name, items) {
        this.name = name;
        this.items = items;
    }
}

class Item {
    constructor(key, value) {
        this.key = key;
        this.value = value;
    }
}

class Instance {
    constructor(info) {
        this.name        = info.name        || 0;  // string index
        this.super_name  = info.super_name  || 0;  // string index or 0
        this.flags       = info.flags       || 0;  // flags
        this.protectedNs = info.protectedNs || 0;  // optional multiname if flag specifies it
        this.interfaces  = info.interfaces  || []; // array of multiname indexes
        this.iinit       = info.iinit       || 0;  // method index for constructor
        this.traits      = info.traits      || []; // array of Trait objects
    }

    static ClassSealed = 0x01;
    static ClassFinal = 0x02;
    static ClassInterface = 0x04;
    static ClassProtectedNs = 0x08;
}

class Trait {
    constructor(info) {
        this.name     = info.name     || 0;  // string ref
        this.kind     = info.kind     || 0;  // const
        this.metadata = info.metadata || []; // array of metadata indexes

        // for Slot, Const
        this.slot_id   = info.slot_id   || 0; // slot id (0 is auto)
        this.type_name = info.type_name || 0; // multiname index
        this.vindex    = info.vindex    || 0; // Ref to one of the constants, or 0
        this.vkind     = info.vkind     || 0; // One of the constant pool types

        // for Class
        this.classi = info.classi || 0; // index to class table

        // for Function
        this.function = info.function || 0; // index to method table

        // for Method, Getter, Setter
        this.disp_id = info.disp_id || 0; // compiled-assigned optimization for virtual methods, or 0
        this.method  = info.method  || 0; /// index to method table
    }

    // Take one of these
    static Slot = 0;
    static Method = 1;
    static Getter = 2;
    static Setter = 3;
    static Class = 4;
    static Function = 5;
    static Const = 6;

    // And OR it with one or more of these
    // for the kind.
    static Final = 0x10;
    static Override = 0x20;
    static Metadata = 0x40;

    // vkind
    static Int = 0x03;
    static UInt = 0x04;
    static Double = 0x06;
    static Utf8 = 0x01;
    static True = 0x0b;
    static False = 0x0a;
    static Null = 0x0c;
    static Undefined = 0x00;

}

class Class {
    constructor(cinit, traits) {
        this.cinit = cinit; // index into method for static initializer
        this.traits = traits; // array of Trait objects
    }
}

class Script {
    constructor(init, traits) {
        this.init = init; // index into method for body of the script
        this.traits = traits;
    }
}

class ExceptionInfo {
    constructor(info) {
        this.from     = info.from || 0; // offset in bytecode array
        this.to       = info.to   || 0; // offset in bytecode array
        this.target   = info.target || 0; // offset in bytecode array
        this.exc_type = info.exc_type || 0; // index to string of exception type, or 0 for any exception
        this.var_name = info.var_name || 0; // index to string of varname to receive exception, or 0 for none
    }
}

const floatTemp = new Float64Array(1);
const floatTempBytes = new Uint8Array(floatTemp.buffer);
const utf8 = new TextEncoder();

class ABCBuilder extends Builder {
    u8(val) {
        this.out(val & 255);
    }

    u16(val) {
        this.out(val & 255);
        this.out((val >> 8) & 255);
    }

    s24(val) {
        this.out(val & 255);
        this.out((val >> 8) & 255);
        this.out((val >> 16) & 255);
    }

    u30(val) {
        val >>>= 0;
        if (val >= 2 ** 30) {
            throw new RangeError('too big integer to emit u30');
        }
        this.u32(val);
    }

    s32(val) {
        val |= 0;
        let bits = 32 - Math.clz32(Math.abs(val)) + 1;
        if (bits > 32) {
            throw new Error('wtf too many bits');
        }
        do {
            let byte = val & 127;
            bits -= 7;
            if (bits > 0) {
                byte |= 128;
            }
            this.out(byte);
            val >>= 7;
        } while (bits > 0);
    }

    u32(val) {
        val >>>= 0;
        let bits = 32 - Math.clz32(val);
        do {
            let byte = val & 127;
            bits -= 7;
            if (bits > 0) {
                byte |= 128;
            }
            this.out(byte);
            val >>>= 7;
        } while (bits > 0);
    }

    d64(val) {
        floatTemp[0] = val;
        for (let byte of floatTempBytes) {
            this.out(byte);
        }
    }
}

class ABCFileBuilder extends ABCBuilder {
    constructor() {
        super();
        this.abc = new ABCFile();
        this.cpool = this.abc.constant_pool;
    }

    methodBuilder() {
        return new MethodBuilder(this.abc.constant_pool);
    }

    toBytes() {
        this.abcFile(this.abc);
        return super.toBytes();
    }

    // ----

    integer(val) {
        return this.cpool.integer(val);
    }

    uinteger(val) {
        return this.cpool.uinteger(val);
    }

    double(val) {
        return this.cpool.double(val);
    }

    string(val) {
        return this.cpool.string(val);
    }

    namespace(kind, name=0) {
        return this.cpool.namespace(new Namespace(
            kind,
            name
        ));
    }

    namespaceSet(namespaces) {
        return this.cpool.namespaceSet(new NamespaceSet(namespaces));
    }

    qname(ns, name) {
        return this.cpool.multiname(new Multiname({
            kind: Multiname.QName,
            ns,
            name
        }));
    }

    qnameA(ns, name) {
        return this.cpool.multiname(new Multiname({
            kind: Multiname.QNameA,
            ns,
            name
        }));
    }

    rtqname(name) {
        return this.cpool.multiname(new Multiname({
            kind: Multiname.RTQName,
            name
        }));
    }

    rtqnameA(name) {
        return this.cpool.multiname(new Multiname({
            kind: Multiname.RTQNameA,
            name
        }));
    }

    rtqnameL() {
        return this.cpool.multiname(new Multiname({
            kind: Multiname.RTQNameL
        }));
    }

    rtqnameLA() {
        return this.cpool.multiname(new Multiname({
            kind: Multiname.RTQNameLA
        }));
    }

    multiname(name, ns_set) {
        return this.cpool.multiname(new Multiname({
            kind: Multiname.Multiname,
            name,
            ns_set
        }));
    }

    multinameA(name, ns_set) {
        return this.cpool.multiname(new Multiname({
            kind: Multiname.MultinameA,
            name,
            ns_set
        }));
    }

    multinameL(ns_set) {
        return this.cpool.multiname(new Multiname({
            kind: Multiname.MultinameL,
            ns_set
        }));
    }

    multinameLA(ns_set) {
        return this.cpool.multiname(new Multiname({
            kind: Multiname.MultinameLA,
            ns_set
        }));
    }

    method(info) {
        let method = new Method(info);
        return this.abc.methods.push(method) - 1;
    }

    methodBody(info) {
        let body = new MethodBody(info);
        return this.abc.method_bodies.push(body) - 1;
    }

    /// @param name string id
    /// @param items array of Item instances
    metadata(name, items) {
        return new Metadata(
            name,
            items
        );
    }

    /// @param key string id
    /// @param value string id
    item(key, value) {
        return new Item(
            key,
            value
        );
    }

    interface(info) {
        let iface = new Interface(info);
        return this.abc.interfaces.push(iface) - 1;
    }

    addClass(cinit, traits) {
        let classObj = new Class(cinit, traits);
        return this.abc.classes.push(classObj) - 1;
    }

    instance(info) {
        let inst = new Instance(info);
        return this.abc.instances.push(inst) - 1;
    }

    script(init, traits) {
        let script = new Script(init, traits);
        return this.abc.scripts.push(script) - 1;
    }

    trait(info) {
        let trait = new Trait(info);
        return trait;
    }

    // ----

    abcFile(file) {
        this.u16(file.minor_version);
        this.u16(file.major_version);

        this.cpool_info(file.constant_pool);

        this.u30(file.methods.length);
        for (let method of file.methods) {
            this.method_info(method);
        }

        this.u30(file.metadata.length);
        for (let metadata of file.metadata) {
            this.metadata_info(metadata);
        }

        if (file.classes.length !== file.instances.length) {
            throw new Error('Mismatched classes and instances length');
        }
        this.u30(file.classes.length);
        for (let instance of file.instances) {
            this.instance_info(instance);
        }
        for (let classInfo of file.classes) {
            this.class_info(classInfo);
        }

        this.u30(file.scripts.length);
        for (let script of file.scripts) {
            this.script_info(script);
        }

        this.u30(file.method_bodies.length);
        for (let method_body of file.method_bodies) {
            this.method_body_info(method_body);
        }


    }

    cpool_info(cpool) {
        this.u30(cpool.integers.length);
        for (let int of cpool.integers.slice(1)) {
            this.s32(int);
        }

        this.u30(cpool.uintegers.length);
        for (let uint of cpool.uintegers.slice(1)) {
            this.u32(uint);
        }

        this.u30(cpool.doubles.length);
        for (let double of cpool.doubles.slice(1)) {
            this.d64(double);
        }

        this.u30(cpool.strings.length);
        for (let str of cpool.strings.slice(1)) {
            this.string_info(str);
        }
        
        this.u30(cpool.namespaces.length);
        for (let ns of cpool.namespaces.slice(1)) {
            this.namespace_info(ns);
        }

        this.u30(cpool.ns_sets.length);
        for (let ns_set of cpool.ns_sets.slice(1)) {
            this.ns_set_info(ns_set);
        }

        this.u30(cpool.multinames.length);
        for (let multiname of cpool.multinames.slice(1)) {
            this.multiname_info(multiname);
        }
    }

    string_info(str) {
        let bytes = utf8.encode(str);
        this.u30(bytes.length);
        for (let byte of bytes) {
            this.u8(byte);
        }
    }

    namespace_info(ns) {
        this.u8(ns.kind);
        this.u30(ns.name);
    }

    /// @param {Array<number>} ns_set
    ns_set_info(ns_set) {
        this.u30(ns_set.length);
        for (let ns of ns_set) {
            this.u30(ns);
        }
    }

    multiname_info(multiname) {
        this.u8(multiname.kind);
        switch (multiname.kind) {
            case Multiname.QName:
            case Multiname.QNameA:
                this.u30(multiname.ns);
                this.u30(multiname.name);
                break;
            case Multiname.RTQName:
            case Multiname.RTQNameA:
                this.u30(multiname.name);
                break;
            case Multiname.RTQNameL:
            case Multiname.RTQNameLA:
                break;
            case Multiname.Multiname:
            case Multiname.MultinameA:
                this.u30(multiname.name);
                this.u30(multiname.ns_set);
                break;
            case Multiname.MultinameL:
            case Multiname.MultinameLA:
                this.u30(multiname.ns_set);
                break;
            default:
                throw new Error('invalid multiname kind');
        }
    }

    method_info(method) {
        this.u30(method.param_types.length);
        this.u30(method.return_type);
        for (let param_type of method.param_types) {
            this.u30(param_type);
        }
        this.u30(method.name);
        this.u8(method.flags);
        if (method.flags & Method.HAS_OPTIONAL) {
            this.option_info(method.options);
        }
        if (method.flags & Method.HAS_PARAM_NAMES) {
            this.param_info(method.param_names);
        }
    }

    option_info(options) {
        this.u30(options.length);
        for (let option of options) {
            this.option_detail(option);
        }
    }

    option_detail(option) {
        this.u30(option.val);
        this.u8(option.kind);
    }

    param_info(param_names) {
        for (let name of param_names) {
            this.u30(name);
        }
    }

    metadata_info(metadata) {
        this.u30(metadata.name);
        this.u30(metadata.items.length);
        for (let item of metadata.items) {
            this.item_info(item);
        }
    }

    item_info(item) {
        this.u30(item.key);
        this.u30(item.value);
    }

    instance_info(inst) {
        this.u30(inst.name);
        this.u30(inst.super_name);
        this.u8(inst.flags);
        if (inst.flags & Instance.ClassProtectedNs) {
            this.u30(inst.protectedNs);
        }
        this.u30(inst.interfaces.length);
        for (let iface of inst.interfaces) {
            this.u30(iface);
        }
        this.u30(inst.iinit); // constructor method index
        this.u30(inst.traits.length);
        for (let trait of inst.traits) {
            this.traits_info(trait);
        }
    }

    traits_info(trait) {
        this.u30(trait.name);
        this.u8(trait.kind);
        switch (trait.kind & 0x0f) {
            case Trait.Slot:
            case Trait.Const:
                this.u30(trait.slot_id);
                this.u30(trait.type_name);
                this.u30(trait.vindex);
                if (trait.vindex > 0) {
                    this.u8(trait.vkind);
                }
                break;
            case Trait.Class:
                this.u30(trait.slot_id);
                this.u30(trait.classi);
                break;
            case Trait.Function:
                this.u30(trait.slot_id);
                this.u30(trait.function);
                break;
            case Trait.Method:
            case Trait.Getter:
            case Trait.Setter:
                this.u30(trait.disp_id);
                this.u30(trait.method);
                break;
            default:
                throw new Error('Unexpected trait kind ' + trait.kind);
        }
        if (trait.kind & Trait.Metadata) {
            this.u30(trait.metadata.length);
            for (let item of trait.metadata) {
                this.u30(item);
            }
        }
    }

    class_info(aclass) {
        this.u30(aclass.cinit);
        this.u30(aclass.traits.length);
        for (let trait of aclass.traits) {
            this.traits_info(trait);
        }
    }

    script_info(script) {
        this.u30(script.init);
        this.u30(script.traits.length);
        for (let trait of script.traits) {
            this.traits_info(trait);
        }
    }

    method_body_info(body) {
        this.u30(body.method);
        this.u30(body.max_stack);
        this.u30(body.local_count);
        this.u30(body.init_scope_depth);
        this.u30(body.max_scope_depth);
        this.u30(body.code.length);
        for (let byte of body.code) {
            this.u8(byte);
        }
        this.u30(body.exceptions.length);
        for (let ex of body.exceptions) {
            this.exception_info(ex);
        }
        this.u30(body.traits.length);
        for (let trait of body.traits) {
            this.traits_info(trait);
        }
    }

    exception_info(ex) {
        this.u30(ex.from);
        this.u30(ex.to);
        this.u30(ex.target);
        this.u30(ex.exc_name);
        this.u30(ex.var_name);
    }
}

let labelIndex = 0;
class Label {
    constructor(name) {
        if (name === undefined) {
            name = '$$label$' + (++labelIndex);
        }
        this.name = name;
        this.used = false;
    }
}

class MethodBuilder extends ABCBuilder {
    constructor(cpool) {
        super();
        this.cpool = cpool;
        this.fixups = [];
        this.addresses = new Map();
    }

    toBytes() {
        this.applyFixups();
        return super.toBytes();
    }

    allocLabel(name) {
        return new Label(name);
    }

    fixup(label) {
        // Add a placeholder for a relative jump to the future
        this.s24(0);
        this.fixups.push({
            addr: this.offset(),
            label
        });
    }

    relativeAddress(label) {
        label.used = true;
        if (this.addresses.has(label)) {
            let addr = this.offset() + 3;
            this.s24(this.addresses.get(label) - addr);
        } else {
            this.fixup(label);
        }
    }

    applyFixups() {
        for (let {addr, label} of this.fixups) {
            if (!this.addresses.has(label)) {
                throw new Error('fixup to nonexistent label ' + label);
            }
            let rel = this.addresses.get(label) - addr;
            this.stream[addr - 3] = rel & 0xff;
            this.stream[addr - 2] = (rel >> 8) & 0xff;
            this.stream[addr - 1] = (rel >> 16) & 0xff;
        }
        this.fixups = [];
    }

    add() {
        this.log('add');
        this.u8(0xa0);
    }

    add_i() {
        this.log('add_i');
        this.u8(0xc5);
    }

    bitand() {
        this.log('bitand');
        this.u8(0xa8);
    }

    bitnot() {
        this.log('bitnot');
        this.u8(0x97);
    }

    bitor() {
        this.log('bitor');
        this.u8(0xa9);
    }

    bitxor() {
        this.log('bitxor');
        this.u8(0xaa);
    }

    call(arg_count) {
        this.log('call', arg_count);
        this.u8(0x41);
        this.u30(arg_count);
    }

    callmethod(index, arg_count) {
        this.log('callmethod', index, arg_count);
        this.u8(0x43);
        this.u30(index);
        this.u30(arg_count);
    }

    callproperty(index, arg_count) {
        this.log('callproperty', index, arg_count);
        this.u8(0x46);
        this.u30(index); // a multiname index
        this.u30(arg_count);
    }

    callproplex(index, arg_count) {
        this.log('callproplex', index, arg_count);
        this.u8(0x4c);
        this.u30(index); // a multiname index
        this.u30(arg_count);
    }

    callpropvoid(index, arg_count) {
        this.log('callpropvoid', index, arg_count);
        this.u8(0x46);
        this.u30(index); // a multiname index
        this.u30(arg_count);
    }

    construct(arg_count) {
        this.log('construct', arg_count);
        this.u8(0x42);
        this.u30(arg_count);
    }

    constructsuper(arg_count) {
        this.log('constructsuper', arg_count);
        this.u8(0x49);
        this.u30(arg_count);
    }

    convert_i() {
        this.log('convert_i');
        this.u8(0x73);
    }

    convert_d() {
        this.log('convert_d');
        this.u8(0x75);
    }

    convert_u() {
        this.log('convert_u');
        this.u8(0x74);
    }

    declocal(index) {
        this.log('declocal');
        this.u8(0x94);
        this.u30(index);
    }

    declocal_i(index) {
        this.log('declocal_i');
        this.u8(0xc3);
        this.u30(index);
    }

    decrement() {
        this.log('decrement');
        this.u8(0x93);
    }

    decrement_i() {
        this.log('decrement_i');
        this.u8(0xc1);
    }

    divide() {
        this.log('divide');
        this.u8(0xa3);
    }

    dup() {
        this.log('dup');
        this.u8(0x2a);
    }

    equals() {
        this.log('equals');
        this.u8(0xab);
    }

    findpropstrict(index) {
        this.log('findpropstrict', index);
        this.u8(0x5d);
        this.u30(index);
    }

    getlex(index) {
        this.log('getlex', index);
        this.u8(0x60);
        this.u30(index);
    }

    getlocal(index) {
        switch (index) {
            case 0: this.getlocal_0(); break;
            case 1: this.getlocal_1(); break;
            case 2: this.getlocal_2(); break;
            case 3: this.getlocal_3(); break;
            default:
                this.log('getlocal', index);
                this.u8(0x62);
                this.u30(index);
        }
    }

    getlocal_0() {
        this.log('getlocal_0');
        this.u8(0xd0);
    }

    getlocal_1() {
        this.log('getlocal_1');
        this.u8(0xd1);
    }

    getlocal_2() {
        this.log('getlocal_2');
        this.u8(0xd2);
    }

    getlocal_3() {
        this.log('getlocal_3');
        this.u8(0xd3);
    }

    getproperty(multiname) {
        this.log('getproperty', multiname);
        this.u8(0x66);
        this.u30(multiname);
    }

    getscopeobject(index) {
        this.log('getscopeobject', index);
        this.u8(0x65);
        this.u30(index);
    }

    getslot(index) {
        this.log('getslot', index);
        this.u8(0x6c);
        this.u30(index);
    }

    getsuper(index) {
        this.log('getsuper', index);
        this.u8(0x04);
        this.u30(index);
    }

    greaterequals() {
        this.log('greaterequals');
        this.u8(0xb0);
    }

    greaterthan() {
        this.log('greaterthan');
        this.u8(0xaf);
    }

    ifeq(label) {
        this.log('ifeq', label.name);
        this.u8(0x13);
        this.relativeAddress(label);
    }

    iffalse(label) {
        this.log('iffalse', label.name);
        this.u8(0x12);
        this.relativeAddress(label);
    }

    ifge(label) {
        this.log('ifge', label.name);
        this.u8(0x18);
        this.relativeAddress(label);
    }

    ifgt(label) {
        this.log('ifgt', label.name);
        this.u8(0x17);
        this.relativeAddress(label);
    }

    ifle(label) {
        this.log('ifle', label.name);
        this.u8(0x16);
        this.relativeAddress(label);
    }

    iflt(label) {
        this.log('iflt', label.name);
        this.u8(0x15);
        this.relativeAddress(label);
    }

    ifnge(label) {
        this.log('ifnge', label.name);
        this.u8(0x0f);
        this.relativeAddress(label);
    }

    ifngt(label) {
        this.log('ifngt', label.name);
        this.u8(0x0e);
        this.relativeAddress(label);
    }

    ifnle(label) {
        this.log('ifnle', label.name);
        this.u8(0x0d);
        this.relativeAddress(label);
    }

    ifnlt(label) {
        this.log('ifnlt', label.name);
        this.u8(0x0c);
        this.relativeAddress(label);
    }

    ifne(label) {
        this.log('ifne', label.name);
        this.u8(0x14);
        this.relativeAddress(label);
    }

    ifstricteq(label) {
        this.log('ifstricteq', label.name);
        this.u8(0x19);
        this.relativeAddress(label);
    }

    ifstrictne(label) {
        this.log('ifstrictne', label.name);
        this.u8(0x1a);
        this.relativeAddress(label);
    }

    iftrue(label) {
        this.log('iftrue', label.name);
        this.u8(0x11);
        this.relativeAddress(label);
    }

    inclocal(index) {
        this.log('inclocal', index);
        this.u8(0x92);
        this.u30(index);
    }

    inclocal_i(index) {
        this.log('inclocal_i', index);
        this.u8(0xc2);
        this.u30(index);
    }

    increment() {
        this.log('increment');
        this.u8(0x91);
    }

    increment_i() {
        this.log('increment_i');
        this.u8(0xc0);
    }

    initproperty(index) {
        this.log('initproperty', index);
        this.u8(0x68);
        this.u32(index);
    }

    jump(label) {
        this.log('jump', label.name);
        this.u8(0x10);
        this.relativeAddress(label);
    }

    kill(index) {
        this.log('kill', index);
        this.u8(0x08);
        this.u30(index);
    }

    label(label) {
        this.log('label', label.name);
        this.addresses.set(label, this.offset());
        this.u8(0x09);
    }

    lessequals() {
        this.log('lessequals');
        this.u8(0xae);
    }

    lessthan() {
        this.log('lessthan');
        this.u8(0xad);
    }

    lookupswitch(default_label, case_labels) {
        this.log('lookupswitch', default_label.name, case_labels.length, case_labels.map((x) => x.name).join(' '));
        this.u8(0x1b);
        this.relativeAddress(default_label);
        this.u30(case_labels.length);
        for (let label of case_labels) {
            this.relativeAddress(label);
        }
    }

    lshift() {
        this.log('lshift');
        this.u8(0xa5);
    }

    modulo() {
        this.log('modulo');
        this.u8(0xa4);
    }

    multiply() {
        this.log('multiply');
        this.u8(0xa2);
    }

    multiply_i() {
        this.log('multiply_i');
        this.u8(0xc7);
    }

    negate() {
        this.log('negate');
        this.u8(0x90);
    }

    negate_i() {
        this.log('negate_i');
        this.u8(0xc4);
    }

    newarray(arg_count) {
        this.log('newarray', arg_count);
        this.u8(0x86);
        this.u30(arg_count);
    }

    newclass(index) {
        this.log('newclass', index);
        this.u8(0x58);
        this.u30(index);
    }

    newfunction(index) {
        this.log('newfunction', index);
        this.u8(0x40);
        this.u30(index);
    }

    newobject(arg_count) {
        this.log('newobject', arg_count);
        this.u8(0x55);
        this.u30(arg_count);
    }

    nop() {
        this.log('nop');
        this.u8(0x02);
    }

    not() {
        this.log('not');
        this.u8(0x96);
    }

    pop() {
        this.log('pop');
        this.u8(0x29);
    }

    popscope() {
        this.log('popscope');
        this.u8(0x1d);
    }

    pushbyte(byte_value) {
        this.log('pushbyte', byte_value);
        this.u8(0x24);
        this.u8(byte_value);
    }

    pushdouble(double_value) {
        let index = this.cpool.double(double_value);
        this.log('pushdouble', index + ' (' + double_value + ')');
        this.u8(0x2f);
        this.u30(index);
    }

    pushfalse() {
        this.log('pushfalse');
        this.u8(0x27);
    }

    pushint(int_value) {
        let index = this.cpool.integer(int_value);
        this.log('pushint', index + ' (' + int_value + ')');
        this.u8(0x2d);
        this.u30(index);
    }

    pushnan() {
        this.log('pushnan');
        this.u8(0x28);
    }

    pushnull() {
        this.log('pushnull');
        this.u8(0x20);
    }

    pushscope() {
        this.log('pushscope');
        this.u8(0x30);
    }

    pushshort(int_value) {
        if (int_value > 32767 || int_value <= -32768) {
            throw new Error('pushshort out of bounds');
        }
        this.log('pushshort', int_value);
        this.u8(0x25);
        this.u30(int_value & 0xffff);
    }

    pushstring(index) {
        this.log('pushstring', index);
        this.u8(0x2c);
        this.u30(index);
    }

    pushtrue() {
        this.log('pushtrue');
        this.u8(0x26);
    }

    pushuint(uint_value) {
        let index = this.cpool.uinteger(uint_value);
        this.log('pushuint', index + ' (' + uint_value + ')');
        this.u8(0x2e);
        this.u30(index);
    }

    pushundefined() {
        this.log('pushundefined');
        this.u8(0x21);
    }

    returnvalue() {
        this.log('returnvalue');
        this.u8(0x48);
    }

    returnvoid() {
        this.log('returnvoid');
        this.u8(0x47);
    }

    rshift() {
        this.log('rshift');
        this.u8(0xa6);
    }

    setlocal(index) {
        switch (index) {
            case 0: this.setlocal_0(); break;
            case 1: this.setlocal_1(); break;
            case 2: this.setlocal_2(); break;
            case 3: this.setlocal_3(); break;
            default:
                this.log('setlocal', index);
                this.u8(0x63);
                this.u30(index);
        }
    }

    setlocal_0() {
        this.log('setlocal_0');
        this.u8(0xd4);
    }

    setlocal_1() {
        this.log('setlocal_1');
        this.u8(0xd5);
    }

    setlocal_2() {
        this.log('setlocal_2');
        this.u8(0xd6);
    }

    setlocal_3() {
        this.log('setlocal_3');
        this.u8(0xd7);
    }

    setproperty(index) {
        this.log('setproperty', index);
        this.u8(0x61);
        this.u30(index);
    }

    setslot(slotindex) {
        this.log('setslot', slotindex);
        this.u8(0x6d);
        this.u30(slotindex);
    }

    strictequals() {
        this.log('strictequals');
        this.u8(0xac);
    }

    subtract() {
        this.log('subtract');
        this.u8(0xa1);
    }

    subtract_i() {
        this.log('subtract_i');
        this.u8(0xc6);
    }

    swap() {
        this.log('swap');
        this.u8(0x2b);
    }

    throw() {
        this.log('throw');
        this.u8(0x03);
    }

    urshift() {
        this.log('urshift');
        this.u8(0xa7);
    }

    // The alchemy/flascc/crossbridge magic memory opcodes

    li8() {
        this.log('li8');
        this.u8(0x35);
    }

    li16() {
        this.log('li16');
        this.u8(0x36);
    }

    li32() {
        this.log('li32');
        this.u8(0x37);
    }

    lf32() {
        this.log('lf32');
        this.u8(0x38);
    }

    lf64() {
        this.log('lif64');
        this.u8(0x39);
    }

    si8() {
        this.log('si8');
        this.u8(0x3a);
    }

    si16() {
        this.log('si16');
        this.u8(0x3b);
    }

    si32() {
        this.log('si32');
        this.u8(0x3c);
    }

    sf32() {
        this.log('sf32');
        this.u8(0x3d);
    }

    sf64() {
        this.log('sf64');
        this.u8(0x3e);
    }

    sxi1() {
        this.log('sxi1');
        this.u8(0x50);
    }

    sxi8() {
        this.log('sxi8');
        this.u8(0x51);
    }

    sxi16() {
        this.log('sxi16');
        this.u8(0x52);
    }
}

module.exports = {
    ABCFile,

    CPool,
    Namespace,
    NamespaceSet,
    Multiname,

    Method,
    OptionDetail,
    MethodBody,
    Metadata,
    Item,
    Instance,
    Script,
    Trait,

    Label,
    MethodBuilder,

    ABCFileBuilder
};
