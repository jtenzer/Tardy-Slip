import { ascii, Reader, startsWith, toBase64 } from "./bytes.js";
export const OPERAND = new Set([1, 25, 26, 27, 30, 31, 32, 35, 40, 41, 42, 43, 44, 45, 46, 64, 65, 92]);
const MAGIC = ascii("kiwi");
export function isKiwi(d            )          {
  return startsWith(d, MAGIC);
}
export function parseKiwi(d            )         {
  if (!isKiwi(d)) throw new Error("not a kiwi script");
  const r = new Reader(d, 4);
  const version = r.u8();
  if (version !== 1 && version !== 2) throw new Error(`unsupported kiwi version ${version}`);
  const extra                          = r.u8() ? [r.s16(), r.s16()] : null;
  const hasTrailer = version === 2 ? r.u8() : 0;
  const nData = r.s16();
  const nLocals = r.s16();
  const nConsts = r.s16();
  const nInstr = r.s16();
  if (nData < 0 || nLocals < 0 || nConsts < 0 || nInstr < 0) throw new Error("negative kiwi segment size");
  const trailer = hasTrailer ? r.s16() : null;
  const data = r.take(2 * nData);
  const consts           = [];
  for (let i = 0; i < nConsts; i++) consts.push(r.s16());
  const ops = new Uint8Array(nInstr);
  const args = new Int16Array(nInstr);
  for (let i = 0; i < nInstr; i++) {
    ops[i] = r.u8();
    if (OPERAND.has(ops[i])) args[i] = r.s16();
  }
  if (r.remaining !== 0) throw new Error(`decoded ${r.p} of ${d.length} bytes`);
  return { version, extra, trailer, data, nLocals, consts, ops, args };
}
export function scriptToJson(s        )             {
  const code           = [];
  for (let i = 0; i < s.ops.length; i++) code.push(s.ops[i], s.args[i]);
  return {
    format: "kiwi",
    version: s.version,
    extra: s.extra,
    trailer: s.trailer,
    locals: s.nLocals,
    consts: s.consts,
    data: toBase64(s.data),
    code,
  };
}
