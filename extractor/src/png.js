import { concat, crc32, deflateZlib, view } from "./bytes.js";
const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
function chunk(tag        , body            )             {
  const out = new Uint8Array(12 + body.length);
  const v = view(out);
  v.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = tag.charCodeAt(i);
  out.set(body, 8);
  v.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}
export async function encodePng(width        , height        , rgba            )                      {
  if (rgba.length !== width * height * 4) throw new Error("pixel buffer does not match the image size");
  const ihdr = new Uint8Array(13);
  const v = view(ihdr);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", await deflateZlib(raw)), chunk("IEND", new Uint8Array(0))]);
}
