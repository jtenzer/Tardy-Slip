import { cp1252, toBase64, view } from "./bytes.js";
import { EFIGS } from "./cstext.js";
export function parseManifest(d            )           {
  if (d.length < 5) throw new Error("manifest too short");
  const v = view(d);
  const titles                         = {};
  let p = 5;
  for (let i = 0; i < EFIGS.length && p < d.length; i++) {
    const n = d[p];
    if (p + 1 + n > d.length) break;
    titles[EFIGS[i]] = cp1252(d.subarray(p + 1, p + 1 + n));
    p += 1 + n;
    if (p < d.length && d[p] === 0) p++;
  }
  return {
    storyId: v.getUint16(0),
    sortKey: v.getUint16(2),
    titles,
    tail: p < d.length ? toBase64(d.subarray(p)) : null,
  };
}
