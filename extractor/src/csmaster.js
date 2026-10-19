import { Reader } from "./bytes.js";
const EMPTY        = { width: 0, height: 0, pixels: null };
export function transform(img       , t        )        {
  const { width: w, height: h, pixels: src } = img;
  if (!src) return EMPTY;
  const [ow, oh] = t > 3 ? [h, w] : [w, h];
  const out = new Uint8Array(ow * oh * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ox        ;
      let oy        ;
      switch (t) {
        case 0: ox = x; oy = y; break;
        case 1: ox = x; oy = h - 1 - y; break;
        case 2: ox = w - 1 - x; oy = y; break;
        case 3: ox = w - 1 - x; oy = h - 1 - y; break;
        case 4: ox = y; oy = x; break;
        case 5: ox = h - 1 - y; oy = x; break;
        case 6: ox = y; oy = w - 1 - x; break;
        default: ox = h - 1 - y; oy = w - 1 - x; break;
      }
      out.set(src.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (oy * ow + ox) * 4);
    }
  }
  return { width: ow, height: oh, pixels: out };
}
function reorder(px            , order                                  )             {
  const out = new Uint8Array(px.length);
  for (let i = 0; i < px.length; i += 4) {
    out[i] = px[i + order[0]];
    out[i + 1] = px[i + order[1]];
    out[i + 2] = px[i + order[2]];
    out[i + 3] = px[i + order[3]];
  }
  return out;
}
function parseHead(r        , m        )       {
  const f = m.flags;
  const ngroups = r.u8();
  if (ngroups > 0) {
    const base = r.s16();
    r.s16();
    for (let g = 0; g < ngroups; g++) {
      const ids           = [];
      for (let n = r.u8(); n > 0; n--) ids.push((f & 4 ? r.s16() : r.u8()) + base);
      m.groups.push(ids);
    }
  }
  const ncomp = r.s16();
  r.s16();
  for (let c = 0; c < ncomp; c++) {
    const parts                             = [];
    for (let n = r.u8(); n > 0; n--) {
      const img = f & 1 ? r.s16() : r.u8();
      const x = f & 2 ? r.s16() : r.u8();
      const y = f & 2 ? r.s16() : r.u8();
      parts.push([img, x, y]);
    }
    m.composites.push(parts);
  }
}
function parseSheet(r        , m        , decode         )       {
  const f = m.flags;
  for (let n = r.s16(); n > 0; n--) m.derived.push([r.s16(), r.s16(), r.u8()]);
  const fmt = f & 8 ? 1 : r.s16();
  if (fmt !== -1 && fmt !== -2) throw new Error(`image-pack format ${fmt} (not implemented by the engine either)`);
  m.format = fmt === -1 ? "rgba" : "mask";
  for (let n = r.s16(); n > 0; n--) {
    const w = f & 0x20 ? r.u16() : r.u8();
    if (w === 0) {
      m.images.push(EMPTY);
      continue;
    }
    const h = f & 0x20 ? r.u16() : r.u8();
    const raw = r.take(w * h * (m.format === "rgba" ? 4 : 1));
    let px                    = null;
    if (decode) {
      if (m.format === "rgba") {
        px = reorder(raw, [1, 2, 3, 0]);
      } else {
        px = new Uint8Array(w * h * 4).fill(255);
        for (let i = 0; i < raw.length; i++) px[i * 4 + 3] = raw[i];
      }
    }
    m.images.push({ width: w, height: h, pixels: px });
  }
}
function parseAtlas(r        , m        , decode         )       {
  for (let n = r.s16(); n > 0; n--) m.derived.push([r.s16(), -1, r.u8()]);
  m.scale = r.s16();
  m.textureSize = r.s16();
  for (let n = r.s16(); n > 0; n--) {
    const [x, y, w, h, ox, oy] = [r.s16(), r.s16(), r.s16(), r.s16(), r.s16(), r.s16()];
    m.rects.push([x * m.scale, y * m.scale, w, h, ox, oy]);
  }
  const size = m.textureSize;
  if (size < 0) throw new Error("negative texture size");
  const tex = r.take(size * size * 4);
  m.format = "rgba";
  if (!decode) return;
  const texture        = { width: size, height: size, pixels: reorder(tex, [3, 2, 1, 0]) };
  m.texture = texture;
  for (const [x, y, w, h] of m.rects) {
    if (w <= 0 || h <= 0) {
      m.images.push(EMPTY);
      continue;
    }
    const px = new Uint8Array(w * h * 4);
    for (let j = 0; j < h; j++) {
      const s = ((y + j) * size + x) * 4;
      px.set(texture.pixels .subarray(s, s + w * 4), j * w * 4);
    }
    m.images.push({ width: w, height: h, pixels: px });
  }
}
function blank(kind                , flags        , numImages        )         {
  return {
    kind, flags, numImages, format: "rgba", groups: [], composites: [], derived: [], images: [],
    scale: 1, textureSize: 0, rects: [], texture: null,
  };
}
export function parseMaster(d            , decode = true)         {
  const errors           = [];
  for (const kind of ["sheet", "atlas"]         ) {
    const r = new Reader(d);
    try {
      const m = blank(kind, r.u8(), r.s16());
      parseHead(r, m);
      if (kind === "sheet") parseSheet(r, m, decode);
      else parseAtlas(r, m, decode);
      if (r.remaining !== 0) {
        errors.push(`${kind}: parsed ${r.p} of ${d.length} bytes`);
        continue;
      }
      if (decode && kind === "sheet") {
        for (const [src, dst, t] of m.derived) {
          if (dst < 0) continue;
          while (m.images.length <= dst) m.images.push(EMPTY);
          if (src >= 0 && src < m.images.length && m.images[src].pixels) m.images[dst] = transform(m.images[src], t);
        }
      }
      return m;
    } catch (e) {
      errors.push(`${kind}: ${(e         ).message}`);
    }
  }
  throw new Error(errors.join("; "));
}
