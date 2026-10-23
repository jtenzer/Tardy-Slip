export const BUILTIN_RANGES                      = (() => {
  const r                                     = [
    [12, 31, 12, 45],
    [80, 3, 80, 85],
  ];
  for (let k = 0; k <= 20; k++) r.push([289 + 5 * k, 3, 289 + 5 * k, 395 + k]);
  for (let k = 0; k < 4; k++) r.push([420 + 5 * k, 3, 420 + 5 * k, 416 + k]);
  r.push([200, 9, 200, 284], [260, 7, 260, 286]);
  for (const [first, count, desc] of [[461, 1, 492], [464, 2, 493], [468, 1, 494], [471, 2, 495], [475, 1, 496], [478, 1, 497], [481, 1, 498]]) {
    r.push([first, count, first, desc]);
  }
  for (let k = 0; k < 7; k++) r.push([440 + 3 * k, 1, 440 + 3 * k, 485 + k]);
  r.push([269, 5, 269, 287], [276, 5, 276, 288], [211, 47, 211, 285]);
  for (let k = 0; k < 60; k++) r.push([3001 + 3 * k, 1, 3001 + 3 * k, 3197 + k]);
  return r.map(([first, count, image, desc]) => ({ first, count, image, desc }));
})();
export class ArtTable {
                   ranges            ;
  constructor(extra             = []) {
    this.ranges = [...BUILTIN_RANGES, ...extra];
  }
  register(first        , count        , image        , desc        )       {
    if (count > 0) this.ranges.push({ first, count, image, desc });
  }
  added()             {
    return this.ranges.slice(BUILTIN_RANGES.length);
  }
  resolve(id        )         {
    const n = id < 0 ? -(id + 1) : id;
    for (const r of this.ranges) {
      if (n < r.first || n >= r.first + r.count) continue;
      return { kind: id < 0 ? "comp" : "frame", image: r.image, desc: r.desc, index: n - r.first };
    }
    return { kind: "image", image: id };
  }
}
export function parseSheetDescriptor(d            )                                     {
  let p = 0;
  const need = (n        ) => {
    if (p + n > d.length) throw new Error(`sheet descriptor: truncated at ${p}`);
  };
  const u8 = () => (need(1), d[p++]);
  const s8 = () => (need(1), (d[p++] << 24) >> 24);
  const s16 = () => (need(2), (p += 2), ((d[p - 2] << 24) >> 16) | d[p - 1]);
  const flags = u8();
  const xy = flags & 4 ? s8 : s16;
  const wh = flags & 2 ? s8 : s16;
  const hot = flags & 1 ? s8 : s16;
  const comp = flags & 8 ? s8 : s16;
  const frames               = [];
  const nFrames = s16();
  for (let i = 0; i < nFrames; i++) {
    const x = xy();
    const y = xy();
    const w = wh();
    const h = wh();
    const hx = hot();
    const hy = hot();
    frames.push({ x, y, w, h, hx: hx - x, hy: hy - y });
  }
  const nAnims = u8();
  for (let i = 0; i < nAnims; i++) p += u8();
  const comps               = [];
  if (p < d.length) {
    const nComps = flags & 8 ? u8() : s16();
    for (let i = 0; i < nComps; i++) {
      const fields = u8();
      const parts             = [];
      for (let j = 0; j + 3 <= fields; j += 3) parts.push({ frame: comp(), dx: comp(), dy: comp() });
      comps.push(parts);
    }
  }
  return { frames, comps, used: p };
}
export function parsePalette(d            )                     {
  const n = d[0] ?? 0;
  const out                     = [];
  for (let i = 0; i < n && 1 + 6 * i + 6 <= d.length; i++) {
    const p = 1 + 6 * i;
    out.push([(d[p] << 16) | (d[p + 1] << 8) | d[p + 2], (d[p + 3] << 16) | (d[p + 4] << 8) | d[p + 5]]);
  }
  return out;
}
