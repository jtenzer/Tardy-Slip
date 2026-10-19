import {
  findGlyph,                   glyphCode,              layoutRect,                 measure,            wrapText,
} from "../../data/brew-ui.js";
export const css = (argb        ) => `rgb(${(argb >> 16) & 0xff},${(argb >> 8) & 0xff},${argb & 0xff})`;
export class UiFont {
           m             ;
                   sheet        ;
  constructor(m             , sheet        ) {
    this.m = m;
    this.sheet = sheet;
  }
  get lineHeight()         {
    return this.m.height + this.m.gap;
  }
  width(text        )         {
    return measure(this.m, text);
  }
  wrappedHeight(text        , w        )         {
    const n = wrapText(this.m, text, w).length;
    return n ? n * this.lineHeight - this.m.gap : 0;
  }
  wrappedWidth(text        , w        )         {
    return Math.max(0, ...wrapText(this.m, text, w).map((l) => l.width));
  }
  draw(g                                 , text        , x        , y        , w        , align = 0, h = 1 << 20, skip = 0, maxChars = -1)             {
    const lines = wrapText(this.m, text, w);
    const lh = this.lineHeight;
    const visible = Math.max(0, Math.floor((h + this.m.gap) / lh));
    const shown = lines.slice(skip, skip + visible);
    const from = shown[0]?.start ?? 0;
    const limit = maxChars < 0 ? Infinity : from + maxChars;
    let cut = false;
    shown.forEach((line, i) => {
      if (!g) return;
      let cx = align === 1 ? x + w - line.width : align === 2 ? x + ((w - line.width) >> 1) : x;
      const cy = y + i * lh;
      for (let k = line.start; k < line.end; k++) {
        if (k >= limit) {
          cut = true;
          return;
        }
        const ch = text[k];
        if (ch === " ") {
          cx += this.m.space + this.m.tracking;
          continue;
        }
        const gl = findGlyph(this.m, glyphCode(ch));
        if (gl) g.drawImage(this.sheet, gl.x, gl.y, gl.w, this.m.height, cx, cy, gl.w, this.m.height);
        cx += (gl ? gl.w : this.m.space) + this.m.tracking;
      }
    });
    if (shown.length && shown[shown.length - 1].end > limit) cut = true;
    return { height: shown.length ? shown.length * lh - this.m.gap : 0, lines: lines.length, cut };
  }
}
const UI_SHEET_FIRST = 12;
export function sheetArt(frame        )         {
  return frame >= 0 ? UI_SHEET_FIRST + frame : -(UI_SHEET_FIRST + (-(frame + 1)) + 1);
}
export class UiLayouts {
           set;          ;
                   art         ;
           slots = new Map                ();
  constructor(set           , art         ) {
    this.set = set;
    this.art = art;
  }
  rect(layout        , index        , x        , y        , w        , h        )       {
    return layoutRect(this.set, layout, index, x, y, w, h) ?? { x, y, w: 0, h: 0 };
  }
  artIds(layout        , out = new Set        ())              {
    const l = this.set.layouts[layout];
    if (!l) return out;
    for (const c of l.children) {
      if ((c.type & 7) === 1) out.add(sheetArt(c.b));
      else if ((c.type & 7) === 7) this.artIds(c.a, out);
    }
    return out;
  }
  draw(g                          , layout        , x        , y        , w        , h        , o                  = {})       {
    const l = this.set.layouts[layout];
    if (l) this.drawLayout(g, l, x, y, w, h, o, { next: 1 });
  }
          drawLayout(g                          , l        , x        , y        , w        , h        , o                 , idx                  )       {
    const dw = w - l.w;
    const dh = h - l.h;
    for (const c of l.children) {
      const index = idx.next++;
      const kind = c.type & 7;
      const sub = kind === 7 ? this.set.layouts[c.a] : undefined;
      const visible = o.show?.has(index) || (!o.hide?.has(index) && (c.type & 0x20) !== 0);
      const x1 = c.x1 + x + ((dw * c.ax1) >> 12);
      const y1 = c.y1 + y + ((dh * c.ay1) >> 12);
      const rw = c.x2 + x + ((dw * c.ax2) >> 12) - x1;
      const rh = c.y2 + y + ((dh * c.ay2) >> 12) - y1;
      if (!visible) {
        if (sub) idx.next += countAll(this.set, sub) - 1;
        continue;
      }
      switch (kind) {
        case 0: {
          const id = this.slots.get(c.a);
          if (id !== undefined) this.tile(g, id, x1, y1, rw, rh);
          break;
        }
        case 1:
          this.tile(g, sheetArt(o.frames?.get(index) ?? c.b), x1, y1, rw, rh);
          break;
        case 2: case 3: case 5:
          g.fillStyle = css(o.colours?.get(c.a) ?? this.set.colours[c.a] ?? 0);
          outline(g, x1, y1, rw, rh);
          break;
        case 4:
          g.fillStyle = css(o.colours?.get(c.a) ?? this.set.colours[c.a] ?? 0);
          if (rw > 0 && rh > 0) g.fillRect(x1, y1, rw, rh);
          break;
        case 7:
          if (!sub) break;
          if (c.type & 0x40) {
            g.save();
            g.beginPath();
            g.rect(x1, y1, Math.max(0, rw), Math.max(0, rh));
            g.clip();
            const start = idx.next;
            for (let ix = 0; ix < rw; ix += sub.w) {
              for (let iy = 0; iy < rh; iy += sub.h) {
                idx.next = start;
                this.drawLayout(g, sub, x1 + ix, y1 + iy, w, h, o, idx);
              }
            }
            if (rw <= 0 || rh <= 0) idx.next = start + countAll(this.set, sub) - 1;
            g.restore();
          } else {
            this.drawLayout(g, sub, x1, y1, rw, rh, o, idx);
          }
          break;
      }
    }
  }
  tile(g                          , id        , x        , y        , w        , h        )       {
    const s = this.art.size(id);
    if (!s || w <= 0 || h <= 0 || s.w <= 0 || s.h <= 0) return;
    const hot = this.art.hotspot(id);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    for (let ty = y; ty < y + h; ty += s.h) for (let tx = x; tx < x + w; tx += s.w) this.art.draw(g, id, tx + hot.x, ty + hot.y);
    g.restore();
  }
}
function countAll(set           , l        )         {
  let n = 1;
  for (const c of l.children) n += (c.type & 7) === 7 && set.layouts[c.a] ? countAll(set, set.layouts[c.a]) : 1;
  return n;
}
export function outline(g                          , x        , y        , w        , h        )       {
  if (w <= 0 || h <= 0) return;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
}
export function drawSoftKeys(g                          , font        , colours          , left               , right               , W = 240, H = 320)       {
  const fill = css(colours[0] ?? 0xffeaed0b);
  const edge = css(colours[1] ?? 0xff7b8113);
  const y0 = H - 11;
  if (right) {
    const w = font.width(right);
    g.fillStyle = fill;
    g.fillRect(W - w - 9, H - 12, w + 8, 12);
    g.fillStyle = edge;
    g.fillRect(W - w - 9, H - 13, w + 8, 1);
    g.fillRect(W - w - 10, H - 12, 1, 12);
    g.fillRect(W - 1, H - 12, 1, 12);
    font.draw(g, right, W - w - 5, y0, 256);
  }
  if (left) {
    const w = font.width(left);
    g.fillStyle = fill;
    g.fillRect(1, H - 12, w + 8, 12);
    g.fillStyle = edge;
    g.fillRect(1, H - 13, w + 8, 1);
    g.fillRect(0, H - 12, 1, 12);
    g.fillRect(w + 9, H - 12, 1, 12);
    font.draw(g, left, 5, y0, 256);
  }
}
