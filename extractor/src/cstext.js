import { cp1252, view } from "./bytes.js";
export const EFIGS = ["en", "fr", "it", "de", "es"];
export function parseCsl(d            )           {
  if (d.length < 9) throw new Error("not a CSL table");
  const v = view(d);
  const n = v.getInt16(7);
  if (v.getInt32(0) !== 1 || n < 0 || 9 + 2 * n > d.length) throw new Error("not a CSL table");
  const out           = [];
  for (let i = 0; i < n; i++) {
    const o = v.getUint16(9 + 2 * i);
    const end = d.indexOf(0, o);
    if (o >= d.length || end < 0) throw new Error(`bad string offset ${o}`);
    out.push(cp1252(d.subarray(o, end)));
  }
  return out;
}
export function parseStringTable(d            )                           {
  if (d.length < 8) throw new Error("not a script string table");
  const v = view(d);
  const langs = v.getUint16(0);
  const total = v.getUint16(2);
  if (v.getUint32(4) !== d.length - 8 || langs === 0 || total % langs) throw new Error("not a script string table");
  const n = total / langs;
  const out                           = {};
  let p = 8;
  for (let i = 0; i < langs; i++) {
    if (p + 4 > d.length) throw new Error(`language block ${i} truncated`);
    const size = v.getUint32(p);
    p += 4;
    const block = d.subarray(p, p + size);
    if (block.length !== size || (size > 0 && block[size - 1] !== 0)) throw new Error(`language block ${i} truncated`);
    p += size;
    const strs           = [];
    let s = 0;
    for (let k = 0; k < size; k++) {
      if (block[k] === 0) {
        strs.push(cp1252(block.subarray(s, k)));
        s = k + 1;
      }
    }
    if (strs.length !== n) throw new Error(`language block ${i}: ${strs.length} strings, expected ${n}`);
    out[EFIGS[i] ?? `lang${i}`] = strs;
  }
  if (p !== d.length) throw new Error(`parsed ${p} of ${d.length} bytes`);
  return out;
}
