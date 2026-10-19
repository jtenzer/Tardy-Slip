import { view } from "./bytes.js";
export function isBmp(d            )          {
  return d.length >= 54 && d[0] === 0x42 && d[1] === 0x4d && view(d).getUint32(14, true) >= 40;
}
export function decodeBmp(d            , keyMagenta = true)         {
  if (!isBmp(d)) throw new Error("not a BMP");
  const v = view(d);
  const offBits = v.getUint32(10, true);
  const header = v.getUint32(14, true);
  const width = v.getInt32(18, true);
  const rawHeight = v.getInt32(22, true);
  const bpp = v.getUint16(28, true);
  const compression = v.getUint32(30, true);
  if (compression !== 0) throw new Error(`BMP compression ${compression} not supported`);
  if (![1, 4, 8, 24, 32].includes(bpp)) throw new Error(`BMP depth ${bpp} not supported`);
  const height = Math.abs(rawHeight);
  if (width <= 0 || height === 0 || width > 4096 || height > 4096) throw new Error(`BMP size ${width}x${rawHeight}`);
  const stride = Math.ceil((width * bpp) / 32) * 4;
  if (offBits + stride * height > d.length) throw new Error("BMP pixel data truncated");
  let palette             = new Uint8Array(0);
  if (bpp <= 8) {
    const used = v.getUint32(46, true) || 1 << bpp;
    palette = d.subarray(14 + header, Math.min(offBits, 14 + header + 4 * used));
  }
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = offBits + stride * (rawHeight < 0 ? y : height - 1 - y);
    for (let x = 0; x < width; x++) {
      let r        , g        , b        ;
      if (bpp <= 8) {
        let i        ;
        if (bpp === 8) i = d[row + x];
        else if (bpp === 4) i = (d[row + (x >> 1)] >> (x & 1 ? 0 : 4)) & 15;
        else i = (d[row + (x >> 3)] >> (7 - (x & 7))) & 1;
        if (4 * i + 2 >= palette.length) i = 0;
        b = palette[4 * i] ?? 0;
        g = palette[4 * i + 1] ?? 0;
        r = palette[4 * i + 2] ?? 0;
      } else {
        const p = row + x * (bpp >> 3);
        b = d[p];
        g = d[p + 1];
        r = d[p + 2];
      }
      const o = (y * width + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = keyMagenta && r === 255 && g === 0 && b === 255 ? 0 : 255;
    }
  }
  return { width, height, pixels: out };
}
