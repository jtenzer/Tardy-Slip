import { Reader } from "./bytes.js";
export function parseWidgetLayout(d            )               {
  const r = new Reader(d);
  const masters = r.u8();
  const images = r.u8();
  r.u8();
  const nColors = r.u8();
  const colors           = [];
  for (let i = 0; i < nColors; i++) colors.push(r.u32());
  const nWidgets = r.s16();
  if (nWidgets < 1 || nWidgets > 2000) throw new Error("not a widget layout");
  const widgets           = [];
  for (let w = 0; w < nWidgets; w++) {
    const width = r.s16();
    const height = r.s16();
    const n = r.s16();
    if (width < 0 || height < 0 || n < 0 || n > 1000) throw new Error("not a widget layout");
    const elements                  = [];
    for (let e = 0; e < n; e++) {
      const pos                                   = [r.s16(), r.s16(), r.s16(), r.s16()];
      const anchor                                   = [r.s16(), r.s16(), r.s16(), r.s16()];
      const flags = r.u8();
      const type = flags & 0xf;
      if (type > 7) throw new Error("not a widget layout");
      let ref           = [];
      if (type === 0) ref = [r.s16()];
      else if (type === 1) ref = [r.s16(), r.s16()];
      else if (type <= 5 || type === 7) ref = [r.u8()];
      if (type === 7 && ref[0] >= nWidgets) throw new Error("not a widget layout");
      if (type === 1 && (ref[0] < 0 || ref[0] >= masters)) throw new Error("not a widget layout");
      elements.push({ type, flags, pos, anchor, ref });
    }
    widgets.push({ width, height, elements });
  }
  if (r.remaining !== 0) throw new Error(`parsed ${r.p} of ${d.length} bytes`);
  return { masters, images, colors, widgets };
}
export function isFont(d            )          {
  if (d.length < 12) return false;
  const tag = String.fromCharCode(d[0], d[1], d[2], d[3]);
  return tag === "\0\x01\0\0" || tag === "OTTO" || tag === "true";
}
export function fontFamily(d            )                {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  try {
    const tables = v.getUint16(4);
    for (let i = 0; i < tables; i++) {
      const p = 12 + i * 16;
      if (String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]) !== "name") continue;
      const off = v.getUint32(p + 8);
      const count = v.getUint16(off + 2);
      const strings = off + v.getUint16(off + 4);
      let mac                = null;
      for (let k = 0; k < count; k++) {
        const r = off + 6 + k * 12;
        if (v.getUint16(r + 6) !== 1) continue;
        const platform = v.getUint16(r);
        const bytes = d.subarray(strings + v.getUint16(r + 10), strings + v.getUint16(r + 10) + v.getUint16(r + 8));
        if (platform === 0 || platform === 3) {
          let s = "";
          for (let j = 0; j + 1 < bytes.length; j += 2) s += String.fromCharCode((bytes[j] << 8) | bytes[j + 1]);
          return s;
        }
        if (platform === 1) mac = String.fromCharCode(...bytes);
      }
      return mac;
    }
  } catch {
  }
  return null;
}
