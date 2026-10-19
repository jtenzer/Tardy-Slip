export class Reader {
           d            ;
  p        ;
                   view          ;
  constructor(d            , p = 0) {
    this.d = d;
    this.p = p;
    this.view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  }
  get remaining()         {
    return this.d.length - this.p;
  }
  need(n        )       {
    if (n < 0 || this.p + n > this.d.length) {
      throw new RangeError(`truncated: need ${n} bytes at ${this.p}, have ${this.remaining}`);
    }
  }
  u8()         {
    this.need(1);
    return this.d[this.p++];
  }
  s16()         {
    this.need(2);
    const v = this.view.getInt16(this.p);
    this.p += 2;
    return v;
  }
  u16()         {
    this.need(2);
    const v = this.view.getUint16(this.p);
    this.p += 2;
    return v;
  }
  s32()         {
    this.need(4);
    const v = this.view.getInt32(this.p);
    this.p += 4;
    return v;
  }
  u32()         {
    this.need(4);
    const v = this.view.getUint32(this.p);
    this.p += 4;
    return v;
  }
  take(n        )             {
    this.need(n);
    const v = this.d.subarray(this.p, this.p + n);
    this.p += n;
    return v;
  }
}
export function view(d            )           {
  return new DataView(d.buffer, d.byteOffset, d.byteLength);
}
export function ascii(s        )             {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
export function startsWith(d            , prefix            , at = 0)          {
  if (at + prefix.length > d.length) return false;
  for (let i = 0; i < prefix.length; i++) if (d[at + i] !== prefix[i]) return false;
  return true;
}
const SIGNATURES                         = [
  ["png", Uint8Array.of(0x89, 0x50, 0x4e, 0x47)],
  ["jpeg", Uint8Array.of(0xff, 0xd8, 0xff)],
  ["riff", ascii("RIFF")],
  ["mp3", ascii("ID3")],
  ["ogg", ascii("OggS")],
  ["kiwi", ascii("kiwi")],
  ["cspud", ascii("CSPUD")],
  ["CMB0", ascii("CMB0")],
  ["zip", Uint8Array.of(0x50, 0x4b, 0x03, 0x04)],
  ["bplist", ascii("bplist")],
  ["xml", ascii("<?xml")],
  ["sqlite", ascii("SQLite")],
];
export function signature(d            )         {
  for (const [name, magic] of SIGNATURES) if (startsWith(d, magic)) return name;
  if (d.length >= 2 && d[0] === 0xff && (d[1] & 0xe0) === 0xe0) return "mp3";
  return "unknown";
}
export function concat(parts              )             {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
const CP1252_HIGH =
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ" +
  "‘’“”•–—˜™š›œžŸ";
export function cp1252(d            )         {
  let s = "";
  for (let i = 0; i < d.length; i += 0x2000) {
    const part = d.subarray(i, i + 0x2000);
    s += String.fromCharCode(...part);
  }
  return s.replace(/[-]/g, (c) => CP1252_HIGH[c.charCodeAt(0) - 0x80]);
}
export function encodeCp1252(s        )             {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out[i] = c;
    else {
      const k = CP1252_HIGH.indexOf(s[i]);
      out[i] = k >= 0 ? 0x80 + k : 0x3f;
    }
  }
  return out;
}
export function toBase64(d            )         {
  let s = "";
  for (let i = 0; i < d.length; i += 0x8000) {
    s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
export function fromBase64(s        )             {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export async function sha256Hex(d            )                  {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", d                           ));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(d            , crc = 0)         {
  let c = ~crc >>> 0;
  for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
async function pipe(d            , t                                         )                      {
  const stream = new Blob([d                           ]).stream().pipeThrough(t);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export function inflateRaw(d            )                      {
  return pipe(d, new DecompressionStream("deflate-raw"));
}
export function deflateZlib(d            )                      {
  return pipe(d, new CompressionStream("deflate"));
}
export function inflateZlib(d            )                      {
  return pipe(d, new DecompressionStream("deflate"));
}
