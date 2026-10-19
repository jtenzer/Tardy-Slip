import { cp1252, encodeCp1252, fromBase64, toBase64 } from "../../../extractor/src/bytes.js";
export const STACK_WORDS = 0x400;
export const BUFFER_BASE = 0x7ff5;
export const BUFFER_COUNT = 11;
export const STACK_BASE = BUFFER_BASE - STACK_WORDS;
export const STACK_CAPACITY = 0x4000;
export const NO_LIBRARY = 0x8000;
export class VmFault extends Error {
           pc        ;
  constructor(message        , pc        ) {
    super(`${message} (pc ${pc})`);
    this.pc = pc;
  }
}
function wordsToBase64(w            )         {
  const bytes = new Uint8Array(w.length * 2);
  for (let i = 0; i < w.length; i++) {
    bytes[2 * i] = (w[i] >> 8) & 0xff;
    bytes[2 * i + 1] = w[i] & 0xff;
  }
  return toBase64(bytes);
}
function base64ToWords(s        )             {
  const bytes = fromBase64(s);
  const w = new Int16Array(bytes.length >> 1);
  for (let i = 0; i < w.length; i++) w[i] = (bytes[2 * i] << 8) | bytes[2 * i + 1];
  return w;
}
function b64(s        )             {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export function loadProgram(s            )          {
  const data = b64(s.data);
  const nData = data.length / 2;
  const memory = new Int16Array(nData + s.locals + s.consts.length);
  for (let i = 0; i < nData; i++) memory[i] = (data[2 * i] << 8) | data[2 * i + 1];
  memory.set(s.consts, nData + s.locals);
  const n = s.code.length / 2;
  const ops = new Uint8Array(n);
  const args = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    ops[i] = s.code[2 * i];
    args[i] = s.code[2 * i + 1];
  }
  return { ops, args, memory, library: s.extra ? { dataBase: s.extra[0], codeBase: s.extra[1] } : null };
}
const s16 = (v        )         => (v << 16) >> 16;
export class KiwiVM {
  ops             = new Uint8Array(0);
  args             = new Int16Array(0);
  mem             = new Int16Array(0);
  libOps             = new Uint8Array(0);
  libArgs             = new Int16Array(0);
  libMem             = new Int16Array(0);
  libDataBase = NO_LIBRARY;
  libCodeBase = NO_LIBRARY;
           stack = new Int16Array(STACK_CAPACITY);
          deepWarned = false;
           buffers           = new Array(BUFFER_COUNT).fill("");
  pc = 0;
  sp = 0;
  fp = 0;
  a = 0;
  b = 0;
  h = 0;
  m = 0;
  argc = 0;
  state          = "halted";
  steps = 0;
  warnings           = [];
  load(p         )       {
    if (p.library) {
      this.libOps = p.ops;
      this.libArgs = p.args;
      this.libMem = p.memory.slice();
      this.libDataBase = p.library.dataBase;
      this.libCodeBase = p.library.codeBase;
      return;
    }
    this.ops = p.ops;
    this.args = p.args;
    this.mem = p.memory.slice();
    this.reset();
  }
  reset()       {
    this.deepWarned = false;
    this.pc = 0;
    this.sp = 0;
    this.fp = 0;
    this.argc = 0;
    this.state = "running";
  }
          warn(msg        )       {
    if (this.warnings.length < 100) this.warnings.push(`${msg} (pc ${this.pc})`);
  }
  read(addr        )         {
    addr = s16(addr);
    if (addr >= STACK_BASE) {
      if (addr - STACK_BASE < STACK_CAPACITY) return this.stack[addr - STACK_BASE];
    } else if (addr >= 0 && addr < this.libDataBase) {
      if (addr < this.mem.length) return this.mem[addr];
    } else if (addr >= 0 && addr - this.libDataBase < this.libMem.length) {
      return this.libMem[addr - this.libDataBase];
    }
    throw new VmFault(`read outside memory at ${addr}`, this.pc);
  }
  write(addr        , v        )       {
    addr = s16(addr);
    if (addr >= STACK_BASE) {
      if (addr - STACK_BASE < STACK_CAPACITY) {
        this.stack[addr - STACK_BASE] = v;
        return;
      }
    } else if (addr >= 0 && addr < this.libDataBase) {
      if (addr < this.mem.length) {
        this.mem[addr] = v;
        return;
      }
    } else if (addr >= 0 && addr - this.libDataBase < this.libMem.length) {
      this.libMem[addr - this.libDataBase] = v;
      return;
    }
    throw new VmFault(`write outside memory at ${addr}`, this.pc);
  }
          push(v        )       {
    if (this.sp < 0 || this.sp >= STACK_CAPACITY) throw new VmFault(`stack overflow (sp ${this.sp})`, this.pc);
    if (this.sp >= STACK_WORDS && !this.deepWarned) {
      this.deepWarned = true;
      this.warn(`stack deeper than the original's ${STACK_WORDS} words`);
    }
    this.stack[this.sp] = v;
    this.sp = s16(this.sp + 1);
  }
          pop()         {
    this.sp = s16(this.sp - 1);
    if (this.sp < 0 || this.sp >= STACK_CAPACITY) throw new VmFault(`stack underflow (sp ${this.sp})`, this.pc);
    return this.stack[this.sp];
  }
          top()         {
    const i = this.sp < 1 ? this.sp : this.sp - 1;
    if (i < 0 || i >= STACK_CAPACITY) throw new VmFault(`stack empty (sp ${this.sp})`, this.pc);
    return this.stack[i];
  }
          setTop(v        )       {
    if (this.sp < 1 || this.sp > STACK_CAPACITY) throw new VmFault(`stack empty (sp ${this.sp})`, this.pc);
    this.stack[this.sp - 1] = v;
  }
  run(budget = Infinity)          {
    if (this.state === "halted") return "halted";
    this.state = "running";
    for (let n = 0; n < budget; n++) {
      const pc = this.pc;
      let op        ;
      let arg        ;
      if (pc >= 0 && pc < this.libCodeBase && pc < this.ops.length) {
        op = this.ops[pc];
        arg = this.args[pc];
      } else if (pc >= this.libCodeBase && pc - this.libCodeBase < this.libOps.length) {
        op = this.libOps[pc - this.libCodeBase];
        arg = this.libArgs[pc - this.libCodeBase];
      } else {
        throw new VmFault("pc outside code", pc);
      }
      this.steps++;
      let x        ;
      let y        ;
      switch (op) {
        case 1: this.a = arg; break;
        case 3: this.a = this.pop(); break;
        case 4: this.b = this.pop(); break;
        case 5: this.a = this.top(); break;
        case 7: this.push(this.a); break;
        case 8: this.push(this.b); break;
        case 10: case 11: case 12: case 13: case 14: case 15: case 17: case 18: {
          x = this.pop();
          y = this.pop();
          let r         ;
          switch (op) {
            case 10: r = y === x; break;
            case 11: r = y !== x; break;
            case 12: r = y > x; break;
            case 13: r = y >= x; break;
            case 14: r = y < x; break;
            case 15: r = y <= x; break;
            case 17: r = y !== 0 || x !== 0; break;
            default: r = y !== 0 && x !== 0; break;
          }
          this.push(r ? 1 : 0);
          break;
        }
        case 19: this.setTop(this.top() === 0 ? 1 : 0); break;
        case 21: case 22: case 23: case 24: this.sp = s16(this.sp - (op - 20)); break;
        case 25: this.sp = s16(this.sp - (arg & 0xffff)); break;
        case 26: this.push(arg); break;
        case 27: this.push(s16((arg & 0xff) << 8) >> 8); this.push(arg >> 8); break;
        case 28: this.push(this.top()); break;
        case 30:
          this.m = arg;
          this.argc = this.h;
          this.pc = s16(pc + 1);
          this.state = "native";
          return "native";
        case 31:
          this.h = arg & 0xff;
          this.m = (arg >> 8) & 0xff;
          this.argc = this.h;
          this.pc = s16(pc + 1);
          this.state = "native";
          return "native";
        case 32: this.h = arg; break;
        case 33: this.push(this.h); break;
        case 34: {
          const f = this.fp;
          this.sp = s16(f - 1);
          if (f - 1 < 0 || f - 1 >= STACK_CAPACITY) throw new VmFault(`bad frame pointer ${f}`, pc);
          this.fp = this.stack[f - 1];
          break;
        }
        case 35: this.push(s16(this.fp + arg + STACK_BASE)); break;
        case 36: this.setTop(s16(-this.top())); break;
        case 37: this.write(this.a, s16(this.read(this.a) + 1)); break;
        case 38: this.write(this.a, s16(this.read(this.a) - 1)); break;
        case 40: this.pc = s16(pc + arg); continue;
        case 41: this.pc = arg; continue;
        case 42: if (this.pop() !== 0) { this.pc = s16(pc + arg); continue; } break;
        case 43: if (this.pop() === 0) { this.pc = s16(pc + arg); continue; } break;
        case 44: if (this.top() !== 0) { this.pc = s16(pc + arg); continue; } break;
        case 45: if (this.top() === 0) { this.pc = s16(pc + arg); continue; } break;
        case 46: if (this.pop() === this.a) { this.pc = s16(pc + arg); continue; } break;
        case 50: this.pc = s16(pc + 1); this.state = "yield"; return "yield";
        case 51: this.state = "halted"; return "halted";
        case 62: {
          x = this.pop();
          y = this.pop();
          this.write(y, x);
          this.push(x);
          break;
        }
        case 63: this.setTop(this.read(this.top())); break;
        case 64: this.push(this.read(arg)); break;
        case 65: this.push(this.read(this.fp + arg + STACK_BASE)); break;
        case 66: this.push(s16(pc + 1)); break;
        case 67: this.pc = s16(this.pop() + 1); continue;
        case 70: this.sp = this.top(); break;
        case 72: this.push(this.fp); break;
        case 74: this.fp = this.sp; break;
        case 80: case 81: case 82: case 83: case 84: {
          x = this.pop();
          y = this.pop();
          let r        ;
          if (op === 80) r = y + x;
          else if (op === 81) r = y - x;
          else if (op === 82) r = Math.imul(y, x);
          else if (x === 0) {
            this.warn(op === 83 ? "division by zero" : "modulo by zero");
            r = 0;
          } else r = op === 83 ? Math.trunc(y / x) : y % x;
          this.push(s16(r));
          break;
        }
        case 90: this.push(0); break;
        case 91: this.push(1); break;
        case 92:
          if ((arg & 0xff) === (this.a & 0xffff)) {
            this.pc = s16(pc + ((arg >> 8) & 0xff));
            continue;
          }
          break;
        case 95: case 96: case 97: case 98: this.push(s16(this.fp + STACK_BASE + op - 95)); break;
        default:
          throw new VmFault(`unknown opcode ${op}`, pc);
      }
      this.pc = s16(pc + 1);
    }
    return "running";
  }
  saveState()             {
    if (this.libDataBase !== NO_LIBRARY) throw new Error("can't save a VM with a linked library");
    if (this.sp < 0 || this.sp > STACK_CAPACITY) throw new Error(`can't save with sp ${this.sp}`);
    return {
      mem: wordsToBase64(this.mem), stack: wordsToBase64(this.stack.subarray(0, this.sp)),
      pc: this.pc, sp: this.sp, fp: this.fp, a: this.a, b: this.b, h: this.h, m: this.m, argc: this.argc,
      state: this.state, buffers: [...this.buffers],
    };
  }
  restoreState(s            )       {
    const mem = base64ToWords(s.mem);
    if (mem.length !== this.mem.length) throw new Error(`snapshot memory is ${mem.length} words, the script has ${this.mem.length}`);
    this.mem = mem;
    this.stack.fill(0);
    this.stack.set(base64ToWords(s.stack));
    this.pc = s.pc;
    this.sp = s.sp;
    this.fp = s.fp;
    this.a = s.a;
    this.b = s.b;
    this.h = s.h;
    this.m = s.m;
    this.argc = s.argc;
    this.state = s.state;
    s.buffers.forEach((b, i) => (this.buffers[i] = b));
  }
  arg(i        )         {
    const k = this.sp - this.argc + i;
    if (i >= this.argc || k < 0 || k >= STACK_CAPACITY) throw new VmFault(`native ${this.m}: no argument ${i}`, this.pc);
    return this.stack[k];
  }
  finishNative(result                    )       {
    this.h = s16(result ?? 0);
    this.sp = s16(this.sp - this.argc);
    this.argc = 0;
    if (this.state === "native") this.state = "running";
  }
  stringAt(addr        )         {
    addr = s16(addr);
    if (addr >= BUFFER_BASE) return this.buffers[addr - BUFFER_BASE];
    if (addr === -1) return "";
    const bytes           = [];
    for (let p = addr; bytes.length < 0x10000; p++) {
      const w = this.read(p) & 0xffff;
      if ((w & 0xff00) === 0) break;
      bytes.push(w >> 8);
      if ((w & 0xff) === 0) break;
      bytes.push(w & 0xff);
    }
    return cp1252(Uint8Array.from(bytes));
  }
  writeString(addr        , s        )       {
    const bytes = encodeCp1252(s);
    let p = s16(addr);
    for (let i = 0; i <= bytes.length; i += 2) {
      const hi = i < bytes.length ? bytes[i] : 0;
      const lo = i + 1 < bytes.length ? bytes[i + 1] : 0;
      this.write(p++, (hi << 8) | lo);
    }
  }
}
