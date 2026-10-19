import { cp1252 } from "../../../extractor/src/bytes.js";
export function parseFont(d            )              {
  const count = (d[3] << 8) | d[4];
  const glyphs = new Map                   ();
  for (let i = 0; i < count; i++) {
    const p = 6 + 6 * i;
    if (p + 6 > d.length) break;
    glyphs.set(d[p], { x: (d[p + 1] << 8) | d[p + 2], y: (d[p + 3] << 8) | d[p + 4], w: d[p + 5] });
  }
  return { space: d[0], gap: d[1], tracking: (d[2] << 24) >> 24, height: d[5], glyphs };
}
export function parseStrings(d            )           {
  const u32 = (p        ) => ((d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]) >>> 0;
  let p = 4;
  const skip = u32(p);
  p += 4 + 2 * skip;
  const count = u32(p);
  p += 4 + 2;
  const out           = [];
  for (let i = 0; i < count && p + 2 <= d.length; i++) {
    const len = (d[p] << 8) | d[p + 1];
    out.push(cp1252(d.subarray(p + 2, p + 2 + len)));
    p += 2 + len;
  }
  return out;
}
export function glyphCode(ch        )         {
  const c = ch.charCodeAt(0);
  switch (c) {
    case 0x2018: case 0x2019: case 0x91: case 0x92: return 0x27;
    case 0x201c: case 0x201d: case 0x93: case 0x94: return 0x22;
    case 0x2013: case 0x96: return 0x2d;
    case 0x2026: return 0x85;
    default: return c < 256 ? c : 0x3f;
  }
}
export function findGlyph(f             , code        )                   {
  const g = f.glyphs.get(code);
  if (g) return g;
  const lower = (code >= 0x61 && code <= 0x7a) || (code >= 0xe0 && code <= 0xfd && code !== 0xf7);
  const upper = (code >= 0x41 && code <= 0x5a) || (code >= 0xc0 && code <= 0xdd && code !== 0xd7);
  if (lower) return f.glyphs.get(code - 0x20) ?? null;
  if (upper) return f.glyphs.get(code + 0x20) ?? null;
  return null;
}
export function advance(f             , ch        )         {
  if (ch === " ") return f.space + f.tracking;
  const g = findGlyph(f, glyphCode(ch));
  return (g ? g.w : f.space) + f.tracking;
}
export function wrapText(f             , text        , width        )             {
  const lines             = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && text[i] === " ") i++;
    if (i >= text.length) break;
    const start = i;
    let w = 0;
    let lastSpace = -1;
    let end = i;
    while (end < text.length && text[end] !== "\n") {
      const a = advance(f, text[end]);
      if (w + a - f.tracking > width && end > start) break;
      if (text[end] === " ") lastSpace = end;
      w += a;
      end++;
    }
    if (end < text.length && text[end] !== "\n" && lastSpace > start) end = lastSpace;
    lines.push({ start, end, width: measure(f, text.slice(start, end)) });
    i = end < text.length && text[end] === "\n" ? end + 1 : end;
  }
  return lines;
}
export function measure(f             , s        )         {
  let w = 0;
  for (const ch of s) w += advance(f, ch);
  return s.length ? w - f.tracking : 0;
}
export function parseLayoutSet(d            )            {
  let p = 3;
  const s16 = () => {
    const v = ((d[p] << 24) >> 16) | d[p + 1];
    p += 2;
    return v;
  };
  const colours           = [];
  for (let i = 0; i < d[2]; i++, p += 4) colours.push(((d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]) >>> 0);
  const layouts           = [];
  const n = s16();
  for (let l = 0; l < n; l++) {
    const w = s16();
    const h = s16();
    const count = s16();
    const children                = [];
    for (let c = 0; c < count; c++) {
      const x1 = s16(), y1 = s16(), x2 = s16(), y2 = s16();
      const ax1 = s16(), ay1 = s16(), ax2 = s16(), ay2 = s16();
      const type = d[p++];
      let a = 0;
      let b = 0;
      switch (type & 7) {
        case 0: a = s16(); break;
        case 1: a = s16(); b = s16(); break;
        case 6: break;
        default: a = d[p++];
      }
      children.push({ x1, y1, x2, y2, ax1, ay1, ax2, ay2, type, a, b });
    }
    layouts.push({ w, h, children });
  }
  if (p !== d.length) throw new Error(`layout set: ${d.length - p} bytes left over`);
  return { colours, layouts };
}
export function childRect(l        , c             , x        , y        , w        , h        )       {
  const dw = w - l.w;
  const dh = h - l.h;
  const x1 = c.x1 + x + ((dw * c.ax1) >> 12);
  const y1 = c.y1 + y + ((dh * c.ay1) >> 12);
  const x2 = c.x2 + x + ((dw * c.ax2) >> 12);
  const y2 = c.y2 + y + ((dh * c.ay2) >> 12);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
const isSub = (c             ) => (c.type & 7) === 7;
export function layoutRect(set           , layout        , index        , x        , y        , w        , h        )              {
  let found              = null;
  const walk = (l        , idx        , x        , y        , w        , h        )         => {
    if (idx === 0) {
      found = { x, y, w, h };
      return -1;
    }
    let left = idx - 1;
    for (const c of l.children) {
      const r = childRect(l, c, x, y, w, h);
      if (left === 0) {
        found = r;
        return -1;
      }
      if (isSub(c)) {
        const sub = set.layouts[c.a];
        if (sub) {
          const used = walk(sub, left, r.x, r.y, r.w, r.h);
          if (used < 0) return -1;
          left -= used;
          continue;
        }
      }
      left -= 1;
    }
    return idx - left;
  };
  const l = set.layouts[layout];
  if (!l) return null;
  walk(l, index, x, y, w, h);
  return found;
}
export function rectCount(set           , layout        )         {
  const l = set.layouts[layout];
  if (!l) return 0;
  let n = 1;
  for (const c of l.children) n += isSub(c) && set.layouts[c.a] ? rectCount(set, c.a) : 1;
  return n;
}
export function fitSize(set           , layout        , index        , want        , axis           )         {
  const at = (s        ) => {
    const r = axis === "w" ? layoutRect(set, layout, index, 0, 0, s, 100) : layoutRect(set, layout, index, 0, 0, 100, s);
    return r ? (axis === "w" ? r.w : r.h) : 0;
  };
  const c100 = at(100);
  const c1000 = at(1000);
  const slope = Math.trunc(((c1000 - c100) * 4096) / 900);
  return ((want - c100) * slope >> 12) + 100;
}
export const PAGE_STYLES                       = [
  { layout: 3, title: 13, body: 17, bodyArrows: 14, up: 16, down: 15 },
  { layout: 2, title: 14, body: 17, bodyArrows: 13, up: 16, down: 15 },
  { layout: 14, title: 14, body: 16, bodyArrows: 15, up: 17, down: 18 },
];
export function pageBox(
  set           , style           , font             , title        , items          ,
  opts                                                                                                       = {},
)          {
  const W = opts.areaW ?? 240;
  const H = opts.areaH ?? 320;
  const pad = opts.itemPad ?? 5;
  const gap = opts.itemGap ?? 2;
  const L = style.layout;
  const design = set.layouts[L];
  const rect = (idx        , w        , h        ) => layoutRect(set, L, idx, 0, 0, w, h) ?? { x: 0, y: 0, w: 0, h: 0 };
  const titleW = measure(font, title);
  const minW = fitSize(set, L, style.title, Math.min(titleW, rect(style.title, design.w, design.h).w), "w");
  const contentW = Math.max(titleW, ...items.map((s) => measure(font, s) + pad));
  const widthFor = (idx        ) => Math.max(Math.min(Math.max(fitSize(set, L, idx, contentW, "w"), minW), W), opts.minW ?? 0);
  let w = widthFor(style.body);
  let body = rect(style.body, w, H);
  const lineH = font.height + font.gap;
  const heights = (bw        ) => items.map((s) => Math.max(1, wrapText(font, s, bw - pad).length) * lineH - font.gap);
  let hs = heights(body.w);
  let contentH = hs.reduce((a, b) => a + b + gap, 0) - (items.length ? gap : 0);
  let maxBody = Math.min(body.h, H - 9 - body.y);
  let scrolls = false;
  let h        ;
  if (contentH > maxBody) {
    scrolls = true;
    w = widthFor(style.bodyArrows);
    h = H;
    body = rect(style.bodyArrows, w, h);
    hs = heights(body.w);
    contentH = hs.reduce((a, b) => a + b + gap, 0) - (items.length ? gap : 0);
  } else {
    h = fitSize(set, L, style.body, Math.max(0, contentH), "h");
  }
  h = Math.max(h, opts.minH ?? 0);
  let x = Math.trunc((W - w) / 2);
  let y = Math.trunc((H - h) / 2);
  body = layoutRect(set, L, scrolls ? style.bodyArrows : style.body, x, y, w, h) ?? body;
  const over = body.y + body.h - (H - 9);
  if (over > 0) {
    if (y >= over) {
      y -= over;
      body = { ...body, y: body.y - over };
    } else body = { ...body, h: body.h - over };
  }
  maxBody = body.h;
  const offsets           = [];
  let at = 0;
  for (const ih of hs) {
    offsets.push(at);
    at += ih + gap;
  }
  return { x, y, w, h, body, scrolls, offsets, contentH };
}
