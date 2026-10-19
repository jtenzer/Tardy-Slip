import {              ArtTable, parsePalette, parseSheetDescriptor,                      } from "../../data/brew-art.js";
export const ALIGN = { hcenter: 1, vcenter: 2, right: 8, bottom: 0x20 }         ;
export class BrewArt {
           table = new ArtTable();
                   build       ;
                   nsId        ;
                   images = new Map                                ();
                   ready = new Map                       ();
                   sheets = new Map                                         ();
                   sheetReady = new Map                                ();
                   palettes = new Map                                            ();
  constructor(build       , nsId        ) {
    this.build = build;
    this.nsId = nsId;
  }
          url(id        )                {
    const r = this.build.url(id < 26000 ? "app" : this.nsId, id);
    return r ? r.url : null;
  }
          async bytes(id        )                             {
    const u = this.url(id);
    if (!u) return null;
    const r = await fetch(u).catch(() => null);
    return r?.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  }
          palette(id        )                                     {
    let p = this.palettes.get(id);
    if (!p) {
      p = this.bytes(id).then((b) => (b ? parsePalette(b) : null));
      this.palettes.set(id, p);
    }
    return p;
  }
  image(id        , palette = -1)                         {
    const key = `${id}:${palette}`;
    let p = this.images.get(key);
    if (!p) {
      p = (async () => {
        const u = this.url(id);
        if (!u) return null;
        const img = new Image();
        const loaded = await new Promise         ((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = u;
        });
        if (!loaded) return null;
        const map = palette >= 0 ? await this.palette(palette) : null;
        if (!map?.length) return img;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext("2d", { willReadFrequently: true }) ;
        g.drawImage(img, 0, 0);
        const data = g.getImageData(0, 0, c.width, c.height);
        const swap = new Map(map);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          if (!px[i + 3]) continue;
          const to = swap.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
          if (to === undefined) continue;
          px[i] = to >> 16;
          px[i + 1] = (to >> 8) & 0xff;
          px[i + 2] = to & 0xff;
        }
        g.putImageData(data, 0, 0);
        return c;
      })().then((b) => {
        this.ready.set(key, b);
        return b;
      });
      this.images.set(key, p);
    }
    return p;
  }
          sheet(desc        )                                  {
    let p = this.sheets.get(desc);
    if (!p) {
      p = this.bytes(desc).then((b) => {
        let s                         = null;
        try {
          s = b ? parseSheetDescriptor(b) : null;
        } catch {
          s = null;
        }
        this.sheetReady.set(desc, s);
        return s;
      });
      this.sheets.set(desc, p);
    }
    return p;
  }
  async load(artId        , palette = -1)                   {
    const ref = this.table.resolve(artId);
    const img = await this.image(ref.image, palette);
    if (!img) return false;
    if (ref.kind === "image") return true;
    return (await this.sheet(ref.desc)) !== null;
  }
  size(artId        , palette = -1)                                  {
    const b = this.bounds(this.table.resolve(artId), palette);
    return b ? { w: b.x1 - b.x0, h: b.y1 - b.y0 } : null;
  }
  hotspot(artId        )                           {
    const ref = this.table.resolve(artId);
    if (ref.kind === "image") return { x: 0, y: 0 };
    const sheet = this.sheetReady.get(ref.desc);
    if (ref.kind === "comp") {
      const b = sheet ? compBounds(sheet, ref.index, 0, 0, 0) : null;
      return b ? { x: b.x0, y: b.y0 } : { x: 0, y: 0 };
    }
    const f = sheet?.frames[ref.index];
    return f ? { x: f.hx, y: f.hy } : { x: 0, y: 0 };
  }
  draw(g                          , artId        , x        , y        , palette = -1, align = 0)          {
    const ref = this.table.resolve(artId);
    const img = this.ready.get(`${ref.image}:${palette}`);
    if (!img) return false;
    if (align) {
      const b = this.bounds(ref, palette);
      if (!b) return false;
      const w = b.x1 - b.x0;
      const h = b.y1 - b.y0;
      if (align & ALIGN.hcenter) x -= w >> 1;
      else if (align & ALIGN.right) x -= w;
      if (align & ALIGN.vcenter) y -= h >> 1;
      else if (align & ALIGN.bottom) y -= h;
      x -= b.x0;
      y -= b.y0;
    }
    if (ref.kind === "image") {
      g.drawImage(img, x, y);
      return true;
    }
    const sheet = this.sheetReady.get(ref.desc);
    if (!sheet) return false;
    if (ref.kind === "frame") {
      const f = sheet.frames[ref.index];
      if (!f) return false;
      g.drawImage(img, f.x, f.y, f.w, f.h, x - f.hx, y - f.hy, f.w, f.h);
      return true;
    }
    return this.drawComp(g, img, sheet, ref.index, x, y, 0);
  }
          drawComp(g                          , img        , sheet                 , index        , x        , y        , depth        )          {
    const parts = sheet.comps[index];
    if (!parts || depth > 4) return false;
    for (const p of parts) {
      if (p.frame < 0) {
        this.drawComp(g, img, sheet, -(p.frame + 1), x + p.dx, y + p.dy, depth + 1);
        continue;
      }
      const f = sheet.frames[p.frame];
      if (f) g.drawImage(img, f.x, f.y, f.w, f.h, x + p.dx, y + p.dy, f.w, f.h);
    }
    return true;
  }
          bounds(ref        , palette        )                                                            {
    const img = this.ready.get(`${ref.image}:${palette}`);
    if (!img) return null;
    if (ref.kind === "image") {
      const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
      const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
      return { x0: 0, y0: 0, x1: w, y1: h };
    }
    const sheet = this.sheetReady.get(ref.desc);
    if (!sheet) return null;
    if (ref.kind === "frame") {
      const f = sheet.frames[ref.index];
      return f ? { x0: -f.hx, y0: -f.hy, x1: f.w - f.hx, y1: f.h - f.hy } : null;
    }
    return compBounds(sheet, ref.index, 0, 0, 0);
  }
}
function compBounds(sheet                 , index        , ox        , oy        , depth        )                                                            {
  const parts = sheet.comps[index];
  if (!parts || depth > 4) return null;
  let b                                                            = null;
  const add = (x0        , y0        , x1        , y1        ) => {
    b = b ? { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) } : { x0, y0, x1, y1 };
  };
  for (const p of parts) {
    if (p.frame < 0) {
      const n = compBounds(sheet, -(p.frame + 1), ox + p.dx, oy + p.dy, depth + 1);
      if (n) add(n.x0, n.y0, n.x1, n.y1);
      continue;
    }
    const f = sheet.frames[p.frame];
    if (f) add(ox + p.dx, oy + p.dy, ox + p.dx + f.w, oy + p.dy + f.h);
  }
  return b;
}
