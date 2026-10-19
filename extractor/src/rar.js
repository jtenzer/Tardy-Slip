import { crc32 } from "./bytes.js";
const MARK = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
const MARK5 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];
function at(d            , sig          , p = 0)          {
  return p + sig.length <= d.length && sig.every((b, i) => d[p + i] === b);
}
export function isRar(d            )          {
  return at(d, MARK) || at(d, MARK5);
}
const u16 = (d            , p        ) => d[p] | (d[p + 1] << 8);
const u32 = (d            , p        ) => (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0;
function fileName(raw            , unicode         )         {
  const zero = raw.indexOf(0);
  if (!unicode) return String.fromCharCode(...raw);
  if (zero < 0) return new TextDecoder().decode(raw);
  const name = raw.subarray(0, zero);
  const enc = raw.subarray(zero + 1);
  if (!enc.length) return String.fromCharCode(...name);
  const out           = [];
  let p = 0;
  const high = enc[p++];
  let flags = 0;
  let flagBits = 0;
  while (p < enc.length && out.length < 0x10000) {
    if (flagBits === 0) {
      flags = enc[p++];
      flagBits = 8;
    }
    switch (flags >> 6) {
      case 0:
        out.push(enc[p++]);
        break;
      case 1:
        out.push(enc[p++] + (high << 8));
        break;
      case 2:
        out.push(enc[p] + (enc[p + 1] << 8));
        p += 2;
        break;
      default: {
        let len = enc[p++];
        if (len & 0x80) {
          const fix = enc[p++];
          for (len = (len & 0x7f) + 2; len > 0; len--) out.push(((name[out.length] + fix) & 0xff) + (high << 8));
        } else for (len += 2; len > 0; len--) out.push(name[out.length]);
      }
    }
    flags = (flags << 2) & 0xff;
    flagBits -= 2;
  }
  return String.fromCharCode(...out);
}
export function listRar(d            )             {
  if (at(d, MARK5)) throw new Error("RAR 5 archives are not supported");
  if (!at(d, MARK)) throw new Error("not a RAR archive");
  const out             = [];
  let p = MARK.length;
  while (p + 7 <= d.length) {
    const crc = u16(d, p);
    const type = d[p + 2];
    const flags = u16(d, p + 3);
    const size = u16(d, p + 5);
    if (size < 7 || p + size > d.length) throw new Error(`RAR: bad block header at ${p}`);
    let add = flags & 0x8000 && p + 11 <= d.length ? u32(d, p + 7) : 0;
    if (type === 0x73 && flags & 0x80) throw new Error("RAR: the archive's headers are encrypted");
    if (type === 0x74 || type === 0x7a) {
      if ((crc32(d.subarray(p + 2, p + size)) & 0xffff) !== crc) throw new Error(`RAR: header CRC mismatch at ${p}`);
      const large = (flags & 0x100) !== 0;
      const packedSize = add + (large ? u32(d, p + 32) * 2 ** 32 : 0);
      add = packedSize;
      const nameAt = p + (large ? 40 : 32);
      const e           = {
        name: fileName(d.subarray(nameAt, nameAt + u16(d, p + 26)), (flags & 0x200) !== 0).replace(/\\/g, "/"),
        size: u32(d, p + 11) + (large ? u32(d, p + 36) * 2 ** 32 : 0),
        packedSize,
        crc: u32(d, p + 16),
        method: d[p + 25],
        version: d[p + 24],
        dir: (flags & 0xe0) === 0xe0,
        solid: (flags & 0x10) !== 0,
        encrypted: (flags & 0x04) !== 0,
        split: (flags & 0x03) !== 0,
        dataOffset: p + size,
      };
      if (type === 0x74) out.push(e);
    }
    if (type === 0x7b) break;
    p += size + add;
  }
  return out;
}
export function readRar(d            , want                           = () => true)            {
  const out            = [];
  let unpack                  = null;
  for (const e of listRar(d)) {
    if (e.dir) continue;
    const wanted = want(e);
    if (!wanted && !e.solid) continue;
    if (e.encrypted) throw new Error(`${e.name}: password-protected`);
    if (e.split) throw new Error(`${e.name}: split across volumes`);
    if (e.dataOffset + e.packedSize > d.length) throw new Error(`${e.name}: archive is truncated`);
    const packed = d.subarray(e.dataOffset, e.dataOffset + e.packedSize);
    let data            ;
    if (e.method === 0x30) data = packed.slice();
    else if (e.version === 29 || e.version === 36) {
      if (!e.solid || !unpack) unpack = new Unpack29();
      data = unpack.unpack(packed, e.size, e.solid);
    } else throw new Error(`${e.name}: RAR ${e.version / 10} compression is not supported`);
    if (data.length !== e.size || crc32(data) !== e.crc) throw new Error(`${e.name}: CRC mismatch (damaged archive or unpacker bug)`);
    if (wanted) out.push({ path: e.name, data });
  }
  return out;
}
export class BitInput {
                   buf            ;
           end        ;
  addr = 0;
  bit = 0;
  constructor(d            ) {
    this.buf = new Uint8Array(d.length + 8);
    this.buf.set(d);
    this.end = d.length;
  }
  getbits()         {
    const b = this.buf;
    const a = this.addr;
    return ((((b[a] << 16) | (b[a + 1] << 8) | b[a + 2]) >>> (8 - this.bit)) & 0xffff) >>> 0;
  }
  addbits(n        )       {
    n += this.bit;
    this.addr += n >> 3;
    this.bit = n & 7;
  }
}
function makeHuff(lengths            , off        , size        )       {
  const count = new Uint32Array(16);
  for (let i = 0; i < size; i++) count[lengths[off + i] & 0xf]++;
  count[0] = 0;
  const h       = { len: new Uint32Array(16), pos: new Uint32Array(16), num: new Uint16Array(size), size };
  let upper = 0;
  for (let i = 1; i < 16; i++) {
    upper += count[i];
    h.len[i] = Math.min(upper << (16 - i), 0xffff);
    upper *= 2;
    h.pos[i] = h.pos[i - 1] + count[i - 1];
  }
  const next = h.pos.slice();
  for (let i = 0; i < size; i++) {
    const l = lengths[off + i] & 0xf;
    if (l) h.num[next[l]++] = i;
  }
  return h;
}
function decodeSym(inp          , h      )         {
  const bf = inp.getbits() & 0xfffe;
  let bits = 15;
  for (let i = 1; i < 15; i++) {
    if (bf < h.len[i]) {
      bits = i;
      break;
    }
  }
  inp.addbits(bits);
  const n = h.pos[bits] + ((bf - h.len[bits - 1]) >>> (16 - bits));
  return h.num[n >= h.size ? 0 : n];
}
const NC = 299;
const DC = 60;
const LDC = 17;
const RC = 28;
const BC = 20;
const TABLE = NC + DC + LDC + RC;
const LDECODE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224];
const LBITS = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5];
const SDDECODE = [0, 4, 8, 16, 32, 64, 128, 192];
const SDBITS = [2, 2, 3, 4, 5, 6, 6, 6];
const [DDECODE, DBITS] = (() => {
  const counts = [4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 14, 0, 12];
  const dec           = [];
  const bits           = [];
  let dist = 0;
  counts.forEach((n, b) => {
    for (let i = 0; i < n; i++, dist += 2 ** b) {
      dec.push(dist);
      bits.push(b);
    }
  });
  return [dec, bits];
})();
const LOW_DIST_REP = 16;
const Filter = { None: 0, E8: 1, E8E9: 2, Itanium: 3, Delta: 4, Rgb: 5, Audio: 6, Upcase: 7, Custom: 8 }         ;
const STANDARD                             = [
  [53, 0xad576887, Filter.E8],
  [57, 0x3cd7e57e, Filter.E8E9],
  [120, 0x3769893f, Filter.Itanium],
  [29, 0x0e06077d, Filter.Delta],
  [149, 0x1c2c5dc8, Filter.Rgb],
  [216, 0xbc85e701, Filter.Audio],
  [40, 0x46b9c560, Filter.Upcase],
];
const VM_MEMSIZE = 0x40000;
const VM_GLOBALADDR = 0x3c000;
function filterType(code            )         {
  let xor = 0;
  for (let i = 1; i < code.length; i++) xor ^= code[i];
  if (xor !== code[0]) return Filter.None;
  const crc = crc32(code);
  return STANDARD.find(([len, c]) => len === code.length && c === crc)?.[2] ?? Filter.Custom;
}
function vmData(inp          )         {
  const d = inp.getbits();
  switch (d & 0xc000) {
    case 0:
      inp.addbits(6);
      return (d >> 10) & 0xf;
    case 0x4000:
      if ((d & 0x3c00) === 0) {
        inp.addbits(14);
        return (0xffffff00 | ((d >> 2) & 0xff)) >>> 0;
      }
      inp.addbits(10);
      return (d >> 6) & 0xff;
    case 0x8000: {
      inp.addbits(2);
      const v = inp.getbits();
      inp.addbits(16);
      return v;
    }
    default: {
      inp.addbits(2);
      const hi = inp.getbits();
      inp.addbits(16);
      const lo = inp.getbits();
      inp.addbits(16);
      return ((hi << 16) | lo) >>> 0;
    }
  }
}
export class Unpack29 {
          win = new Uint8Array(0);
          pos = 0;
          inp = new BitInput(new Uint8Array(0));
          oldDist = [0, 0, 0, 0];
          lastLength = 0;
          oldTable = new Uint8Array(TABLE);
          tablesRead = false;
          ld       ;
          dd       ;
          ldd       ;
          rd       ;
          prevLowDist = 0;
          lowDistRep = 0;
          filters           = [];
          filterLengths           = [];
          lastFilter = 0;
          stack            = [];
  unpack(packed            , size        , solid = false)             {
    if (!solid) {
      this.pos = 0;
      this.oldDist = [0, 0, 0, 0];
      this.lastLength = 0;
      this.oldTable.fill(0);
      this.tablesRead = false;
      this.filters = [];
      this.filterLengths = [];
      this.lastFilter = 0;
    }
    this.stack = [];
    const start = this.pos;
    const end = start + size;
    this.grow(end + 0x200);
    this.inp = new BitInput(packed);
    if ((!solid || !this.tablesRead) && !this.readTables()) throw new Error("RAR: bad Huffman tables");
    this.decode(end);
    return this.flush(start, Math.min(this.pos, end));
  }
          grow(n        )       {
    if (this.win.length >= n) return;
    const w = new Uint8Array(Math.max(n, this.win.length * 2));
    w.set(this.win.subarray(0, this.pos));
    this.win = w;
  }
          copy(length        , dist        )       {
    const w = this.win;
    let p = this.pos;
    let s = p - dist;
    const stop = Math.min(p + length, w.length);
    if (s >= 0) while (p < stop) w[p++] = w[s++];
    else while (p < stop) w[p++] = s < 0 ? (s++, 0) : w[s++];
    this.pos = p;
  }
          insertOldDist(d        )       {
    const o = this.oldDist;
    o[3] = o[2];
    o[2] = o[1];
    o[1] = o[0];
    o[0] = d;
  }
          decode(end        )       {
    const inp = this.inp;
    const w = this.win;
    while (this.pos < end) {
      if (inp.addr > inp.end + 2) throw new Error("RAR: packed data ended early");
      const n = decodeSym(inp, this.ld);
      if (n < 256) {
        w[this.pos++] = n;
        continue;
      }
      if (n >= 271) {
        const k = n - 271;
        let length = LDECODE[k] + 3;
        let bits = LBITS[k];
        if (bits > 0) {
          length += inp.getbits() >>> (16 - bits);
          inp.addbits(bits);
        }
        const dn = decodeSym(inp, this.dd);
        let dist = DDECODE[dn] + 1;
        bits = DBITS[dn];
        if (bits > 0) {
          if (dn > 9) {
            if (bits > 4) {
              dist += (inp.getbits() >>> (20 - bits)) << 4;
              inp.addbits(bits - 4);
            }
            if (this.lowDistRep > 0) {
              this.lowDistRep--;
              dist += this.prevLowDist;
            } else {
              const low = decodeSym(inp, this.ldd);
              if (low === 16) {
                this.lowDistRep = LOW_DIST_REP - 1;
                dist += this.prevLowDist;
              } else {
                dist += low;
                this.prevLowDist = low;
              }
            }
          } else {
            dist += inp.getbits() >>> (16 - bits);
            inp.addbits(bits);
          }
        }
        if (dist >= 0x2000) {
          length++;
          if (dist >= 0x40000) length++;
        }
        this.insertOldDist(dist);
        this.lastLength = length;
        this.copy(length, dist);
        continue;
      }
      if (n === 256) {
        if (!this.endOfBlock()) return;
        continue;
      }
      if (n === 257) {
        if (!this.readVmCode()) return;
        continue;
      }
      if (n === 258) {
        if (this.lastLength) this.copy(this.lastLength, this.oldDist[0]);
        continue;
      }
      if (n < 263) {
        const k = n - 259;
        const dist = this.oldDist[k];
        for (let i = k; i > 0; i--) this.oldDist[i] = this.oldDist[i - 1];
        this.oldDist[0] = dist;
        const ln = decodeSym(inp, this.rd);
        let length = LDECODE[ln] + 2;
        const bits = LBITS[ln];
        if (bits > 0) {
          length += inp.getbits() >>> (16 - bits);
          inp.addbits(bits);
        }
        this.lastLength = length;
        this.copy(length, dist);
        continue;
      }
      const k = n - 263;
      let dist = SDDECODE[k] + 1;
      const bits = SDBITS[k];
      if (bits > 0) {
        dist += inp.getbits() >>> (16 - bits);
        inp.addbits(bits);
      }
      this.insertOldDist(dist);
      this.lastLength = 2;
      this.copy(2, dist);
    }
  }
          readTables()          {
    const inp = this.inp;
    if (inp.bit) inp.addbits(8 - inp.bit);
    const head = inp.getbits();
    if (head & 0x8000) throw new Error("RAR: PPMd-compressed blocks are not supported");
    this.prevLowDist = 0;
    this.lowDistRep = 0;
    if (!(head & 0x4000)) this.oldTable.fill(0);
    inp.addbits(2);
    const bl = new Uint8Array(BC);
    for (let i = 0; i < BC; i++) {
      const len = inp.getbits() >>> 12;
      inp.addbits(4);
      if (len === 15) {
        let zeros = inp.getbits() >>> 12;
        inp.addbits(4);
        if (zeros === 0) bl[i] = 15;
        else {
          zeros += 2;
          while (zeros-- > 0 && i < BC) bl[i++] = 0;
          i--;
        }
      } else bl[i] = len;
    }
    const bd = makeHuff(bl, 0, BC);
    const table = new Uint8Array(TABLE);
    for (let i = 0; i < TABLE;) {
      if (inp.addr > inp.end + 2) return false;
      const n = decodeSym(inp, bd);
      if (n < 16) {
        table[i] = (n + this.oldTable[i]) & 0xf;
        i++;
        continue;
      }
      let count        ;
      if (n === 16 || n === 18) {
        count = (inp.getbits() >>> 13) + 3;
        inp.addbits(3);
      } else {
        count = (inp.getbits() >>> 9) + 11;
        inp.addbits(7);
      }
      if (n < 18) {
        if (i === 0) return false;
        for (; count > 0 && i < TABLE; count--, i++) table[i] = table[i - 1];
      } else for (; count > 0 && i < TABLE; count--) table[i++] = 0;
    }
    this.tablesRead = true;
    if (inp.addr > inp.end) return false;
    this.ld = makeHuff(table, 0, NC);
    this.dd = makeHuff(table, NC, DC);
    this.ldd = makeHuff(table, NC + DC, LDC);
    this.rd = makeHuff(table, NC + DC + LDC, RC);
    this.oldTable.set(table);
    return true;
  }
          endOfBlock()          {
    const inp = this.inp;
    const bf = inp.getbits();
    let newTable         ;
    let newFile = false;
    if (bf & 0x8000) {
      newTable = true;
      inp.addbits(1);
    } else {
      newFile = true;
      newTable = (bf & 0x4000) !== 0;
      inp.addbits(2);
    }
    this.tablesRead = !newTable;
    if (newFile) return false;
    if (newTable && !this.readTables()) throw new Error("RAR: bad Huffman tables");
    return true;
  }
          readVmCode()          {
    const inp = this.inp;
    const first = inp.getbits() >>> 8;
    inp.addbits(8);
    let length = (first & 7) + 1;
    if (length === 7) {
      length = (inp.getbits() >>> 8) + 7;
      inp.addbits(8);
    } else if (length === 8) {
      length = inp.getbits();
      inp.addbits(16);
    }
    const code = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      if (inp.addr > inp.end) return false;
      code[i] = inp.getbits() >>> 8;
      inp.addbits(8);
    }
    return this.addVmCode(first, code);
  }
          addVmCode(first        , code            )          {
    const inp = new BitInput(code);
    let def        ;
    if (first & 0x80) {
      def = vmData(inp);
      if (def === 0) {
        this.filters = [];
        this.filterLengths = [];
        this.stack = [];
      } else def--;
    } else def = this.lastFilter;
    if (def > this.filters.length || def > this.filterLengths.length || def > 1024) return false;
    this.lastFilter = def;
    const isNew = def === this.filters.length;
    if (isNew) {
      this.filters.push(Filter.None);
      this.filterLengths.push(0);
    }
    let blockStart = vmData(inp);
    if (first & 0x40) blockStart += 258;
    const length = first & 0x20 ? vmData(inp) : this.filterLengths[def] ?? 0;
    this.filterLengths[def] = length;
    const r = [0, 0, 0, VM_GLOBALADDR, length, 0, 0];
    if (first & 0x10) {
      const mask = inp.getbits() >>> 9;
      inp.addbits(7);
      for (let i = 0; i < 7; i++) if (mask & (1 << i)) r[i] = vmData(inp);
    }
    if (isNew) {
      const size = vmData(inp);
      if (size === 0 || size >= 0x10000) return false;
      const vm = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        vm[i] = inp.getbits() >>> 8;
        inp.addbits(8);
      }
      this.filters[def] = filterType(vm);
    }
    this.stack.push({ def, start: this.pos + blockStart, length, r });
    return true;
  }
          flush(start        , end        )             {
    const out = this.win.slice(start, end);
    let border = start;
    for (let i = 0; i < this.stack.length; i++) {
      const f = this.stack[i];
      if (f.start < border || f.start + f.length > end) continue;
      let data = this.run(f, this.win.slice(f.start, f.start + f.length), f.start - start);
      while (i + 1 < this.stack.length) {
        const g = this.stack[i + 1];
        if (g.start !== f.start || g.length !== data.length) break;
        data = this.run(g, data, f.start - start);
        i++;
      }
      out.set(data.subarray(0, end - f.start), f.start - start);
      border = f.start + f.length;
    }
    return out;
  }
          run(f         , d            , fileOffset        )             {
    const type = this.filters[f.def];
    const n = d.length;
    switch (type) {
      case Filter.None:
        return d;
      case Filter.E8:
      case Filter.E8E9:
        if (n >= 4 && n <= VM_MEMSIZE / 2) e8(d, fileOffset, type === Filter.E8E9);
        return d;
      case Filter.Itanium:
        if (n >= 21 && n <= VM_MEMSIZE / 2) itanium(d, fileOffset);
        return d;
      case Filter.Delta:
        return f.r[0] > 0 && f.r[0] <= 1024 && n <= VM_MEMSIZE / 2 ? delta(d, f.r[0]) : d;
      case Filter.Rgb:
        return n >= 3 && n <= VM_MEMSIZE / 2 && f.r[0] >= 3 && f.r[0] - 3 <= n && f.r[1] <= 2 ? rgb(d, f.r[0] - 3, f.r[1]) : d;
      case Filter.Audio:
        return f.r[0] > 0 && f.r[0] <= 128 && n <= VM_MEMSIZE / 2 ? audio(d, f.r[0]) : d;
      default:
        throw new Error(`RAR: ${type === Filter.Upcase ? "the old upcase" : "a custom VM"} filter is not supported`);
    }
  }
}
function e8(d            , fileOffset        , e9         )       {
  const FILE_SIZE = 0x1000000;
  for (let cur = 0; cur < d.length - 4;) {
    const b = d[cur++];
    if (b !== 0xe8 && !(e9 && b === 0xe9)) continue;
    const offset = cur + fileOffset;
    const addr = u32(d, cur);
    let put                = null;
    if (addr & 0x80000000) {
      if (((addr + offset) & 0x80000000) === 0) put = addr + FILE_SIZE;
    } else if ((addr - FILE_SIZE) & 0x80000000) put = addr - offset;
    if (put !== null) {
      put >>>= 0;
      d[cur] = put;
      d[cur + 1] = put >>> 8;
      d[cur + 2] = put >>> 16;
      d[cur + 3] = put >>> 24;
    }
    cur += 4;
  }
}
function itanium(d            , fileOffset        )       {
  const MASKS = [4, 4, 6, 6, 0, 0, 7, 7, 4, 4, 0, 0, 4, 4, 0, 0];
  const get = (base        , bit        , count        ) => {
    const a = base + (bit >> 3);
    return (u32(d, a) >>> (bit & 7)) & (0xffffffff >>> (32 - count));
  };
  const set = (base        , value        , bit        , count        ) => {
    const a = base + (bit >> 3);
    let and = ~((0xffffffff >>> (32 - count)) << (bit & 7));
    let v = value << (bit & 7);
    for (let i = 0; i < 4; i++) {
      d[a + i] = (d[a + i] & and) | v;
      and = (and >>> 8) | 0xff000000;
      v >>>= 8;
    }
  };
  let off = fileOffset >>> 4;
  for (let cur = 0; cur < d.length - 21; cur += 16, off++) {
    const b = (d[cur] & 0x1f) - 0x10;
    if (b < 0) continue;
    const mask = MASKS[b];
    for (let i = 0; i <= 2; i++) {
      if (!(mask & (1 << i))) continue;
      const pos = i * 41 + 5;
      if (get(cur, pos + 37, 4) !== 5) continue;
      set(cur, (get(cur, pos + 13, 20) - off) & 0xfffff, pos + 13, 20);
    }
  }
}
function delta(d            , channels        )             {
  const out = new Uint8Array(d.length);
  let src = 0;
  for (let ch = 0; ch < channels; ch++) {
    let prev = 0;
    for (let p = ch; p < d.length; p += channels) out[p] = prev = (prev - d[src++]) & 0xff;
  }
  return out;
}
function rgb(d            , width        , posR        )             {
  const n = d.length;
  const out = new Uint8Array(n);
  let src = 0;
  for (let ch = 0; ch < 3; ch++) {
    let prev = 0;
    for (let i = ch; i < n; i += 3) {
      let predicted = prev;
      if (i >= width + 3) {
        const up = out[i - width];
        const upLeft = out[i - width - 3];
        const p = prev + up - upLeft;
        const pa = Math.abs(p - prev);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predicted = pa <= pb && pa <= pc ? prev : pb <= pc ? up : upLeft;
      }
      out[i] = prev = (predicted - d[src++]) & 0xff;
    }
  }
  for (let i = posR; i < n - 2; i += 3) {
    const g = out[i + 1];
    out[i] = (out[i] + g) & 0xff;
    out[i + 2] = (out[i + 2] + g) & 0xff;
  }
  return out;
}
function audio(d            , channels        )             {
  const n = d.length;
  const out = new Uint8Array(n);
  let src = 0;
  for (let ch = 0; ch < channels; ch++) {
    let prevByte = 0;
    let prevDelta = 0;
    const dif = [0, 0, 0, 0, 0, 0, 0];
    let d1 = 0;
    let d2 = 0;
    let d3 = 0;
    let k1 = 0;
    let k2 = 0;
    let k3 = 0;
    for (let i = ch, count = 0; i < n; i += channels, count++) {
      d3 = d2;
      d2 = prevDelta - d1;
      d1 = prevDelta;
      let predicted = ((8 * prevByte + k1 * d1 + k2 * d2 + k3 * d3) >> 3) & 0xff;
      const cur = d[src++];
      predicted -= cur;
      out[i] = predicted & 0xff;
      prevDelta = ((predicted - prevByte) << 24) >> 24;
      prevByte = predicted;
      const dv = ((cur << 24) >> 24) * 8;
      dif[0] += Math.abs(dv);
      dif[1] += Math.abs(dv - d1);
      dif[2] += Math.abs(dv + d1);
      dif[3] += Math.abs(dv - d2);
      dif[4] += Math.abs(dv + d2);
      dif[5] += Math.abs(dv - d3);
      dif[6] += Math.abs(dv + d3);
      if ((count & 0x1f) === 0) {
        let min = dif[0];
        let which = 0;
        dif[0] = 0;
        for (let j = 1; j < 7; j++) {
          if (dif[j] < min) {
            min = dif[j];
            which = j;
          }
          dif[j] = 0;
        }
        if (which === 1 && k1 >= -16) k1--;
        else if (which === 2 && k1 < 16) k1++;
        else if (which === 3 && k2 >= -16) k2--;
        else if (which === 4 && k2 < 16) k2++;
        else if (which === 5 && k3 >= -16) k3--;
        else if (which === 6 && k3 < 16) k3++;
      }
    }
  }
  return out;
}
