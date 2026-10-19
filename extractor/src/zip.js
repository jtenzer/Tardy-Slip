import { crc32, inflateRaw, view } from "./bytes.js";
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const UTF8 = new TextDecoder("utf-8");
export class ZipArchive {
           data            ;
           entries                       ;
  constructor(data            ) {
    this.data = data;
    this.entries = new Map();
    const v = view(data);
    let eocd = -1;
    for (let p = data.length - 22; p >= Math.max(0, data.length - 22 - 0xffff); p--) {
      if (v.getUint32(p, true) === EOCD) {
        eocd = p;
        break;
      }
    }
    if (eocd < 0) throw new Error("not a zip archive (no end of central directory)");
    const count = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    if (count === 0xffff || p === 0xffffffff) throw new Error("ZIP64 archives are not supported");
    for (let i = 0; i < count; i++) {
      if (v.getUint32(p, true) !== CENTRAL) throw new Error(`bad central directory entry ${i}`);
      const nameLen = v.getUint16(p + 28, true);
      const extraLen = v.getUint16(p + 30, true);
      const commentLen = v.getUint16(p + 32, true);
      const e           = {
        name: UTF8.decode(data.subarray(p + 46, p + 46 + nameLen)),
        flags: v.getUint16(p + 8, true),
        method: v.getUint16(p + 10, true),
        crc: v.getUint32(p + 16, true),
        compressedSize: v.getUint32(p + 20, true),
        size: v.getUint32(p + 24, true),
        localOffset: v.getUint32(p + 42, true),
      };
      this.entries.set(e.name, e);
      p += 46 + nameLen + extraLen + commentLen;
    }
  }
  names()           {
    return [...this.entries.keys()];
  }
  has(name        )          {
    return this.entries.has(name);
  }
  async read(name        )                      {
    const e = this.entries.get(name);
    if (!e) throw new Error(`${name}: not in archive`);
    if (e.flags & 1) throw new Error(`${name}: encrypted entries are not supported`);
    const v = view(this.data);
    if (v.getUint32(e.localOffset, true) !== LOCAL) throw new Error(`${name}: bad local header`);
    const start = e.localOffset + 30 + v.getUint16(e.localOffset + 26, true) + v.getUint16(e.localOffset + 28, true);
    const raw = this.data.subarray(start, start + e.compressedSize);
    let out            ;
    if (e.method === 0) out = raw;
    else if (e.method === 8) out = await inflateRaw(raw);
    else throw new Error(`${name}: unsupported compression method ${e.method}`);
    if (out.length !== e.size) throw new Error(`${name}: ${out.length} bytes, directory says ${e.size}`);
    if (crc32(out) !== e.crc) throw new Error(`${name}: CRC mismatch`);
    return out;
  }
}
