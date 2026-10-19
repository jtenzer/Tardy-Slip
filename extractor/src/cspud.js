import { ascii, startsWith, view } from "./bytes.js";
import { lzmaDecode } from "./lzma.js";
const MAGIC = ascii("CSPUD");
export function isPack(d            )          {
  return startsWith(d, MAGIC);
}
export function parsePack(d            )          {
  if (!isPack(d)) throw new Error("not a CSPUD pack");
  const v = view(d);
  const count = v.getUint32(5);
  if (9 + 6 * count > d.length) throw new Error("CSPUD table runs past the end of the file");
  const entries                     = [];
  for (let i = 0; i < count; i++) entries.push([v.getUint16(9 + 6 * i), v.getUint32(11 + 6 * i)]);
  const starts = [...new Set([...entries.map(([, off]) => off), d.length])].sort((a, b) => a - b);
  const endOf = new Map(starts.slice(0, -1).map((s, i) => [s, starts[i + 1]]));
  return entries.map(([id, off]) => {
    if (off + 12 > d.length) throw new Error(`resource ${id}: chunk header past the end of the file`);
    return {
      id,
      start: off,
      size: (endOf.get(off) ?? d.length) - off,
      stored: v.getUint32(off),
      unpacked: v.getUint32(off + 4),
      method: v.getUint32(off + 8),
    };
  });
}
export function chunkPayload(d            , c       )             {
  const body = d.subarray(c.start + 12, c.start + 12 + c.stored);
  if (body.length !== c.stored) throw new Error(`resource ${c.id}: chunk truncated`);
  if (c.method === 0) return body;
  if (c.method === 1) {
    if (body.length < 13) throw new Error(`resource ${c.id}: LZMA header truncated`);
    return lzmaDecode(body[0], body, 13, c.unpacked);
  }
  throw new Error(`resource ${c.id}: unknown method ${c.method}`);
}
export function readPack(d            )                          {
  const byStart = new Map                    ();
  const out = new Map                    ();
  for (const c of parsePack(d)) {
    let p = byStart.get(c.start);
    if (!p) {
      p = chunkPayload(d, c);
      byStart.set(c.start, p);
    }
    out.set(c.id, p);
  }
  return out;
}
