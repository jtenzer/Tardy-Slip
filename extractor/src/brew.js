import { cp1252, sha256Hex } from "./bytes.js";
import { isPack, readPack } from "./cspud.js";
import {                                      FORMAT_VERSION,                     safeName,            writeNamespace } from "./extract.js";
export const BREW_SEASON = 20084;
export const BREW_CAMPAIGN = 20085;
export const BREW_CLASSIC = 20086;
export function isBrewBuild(files            )          {
  return files.some((f) => /\.mif$/i.test(f.path)) && files.some((f) => mainPack(f.path));
}
function mainPack(path        )          {
  return /(^|\/)res_[^/]*\.pud$/i.test(path);
}
function base(path        )         {
  return path.split("/").pop() .replace(/\.(pud|exp)$/i, "");
}
export function mifStrings(d            )           {
  const out           = [];
  let cur = "";
  for (let i = 0; i + 1 < d.length; i += 2) {
    const c = d[i] | (d[i + 1] << 8);
    if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
    else {
      if (cur.length >= 4) out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.length >= 4) out.push(cur.trim());
  return out.filter((s) => /[A-Za-z]{3}/.test(s));
}
function stableHash(s        )         {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return h;
}
export function brewManifest(name        , label            )           {
  const title = cp1252(label).replace(/[\r\n\0]+/g, " ").trim();
  const n = name.toLowerCase();
  let storyId = BREW_CAMPAIGN;
  let sortKey        ;
  let m                        ;
  if (n.startsWith("clsc_")) {
    storyId = BREW_CLASSIC;
    m = /^clsc_(\d+)/.exec(n);
    sortKey = m ? Number(m[1]) : 1000 + stableHash(n);
  } else if ((m = /^shs085_(\d+)_(\d+)_/.exec(n))) sortKey = Number(m[1]) * 100 + Number(m[2]);
  else if ((m = /^shs085_quiz_(\d+)/.exec(n))) sortKey = 9000 + Number(m[1]);
  else if ((m = /^shs085_sp(\d+)/.exec(n))) sortKey = 9100 + Number(m[1]);
  else if ((m = /^(\d+)\.(\d+)\s/.exec(title))) sortKey = Number(m[1]) * 100 + Number(m[2]);
  else sortKey = 20000 + stableHash(n);
  return { storyId, sortKey, titles: { en: title }, tail: null };
}
export async function extractBrew(folder        , files            , sink      , opts                 = {})                     {
  const log = opts.log ?? (() => {});
  const mains = files.filter((f) => mainPack(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  const main = mains.find((f) => /(^|\/)res_xlarge\.pud$/i.test(f.path)) ?? mains[0];
  if (!main) throw new Error("no res_*.pud main pack found (not an SHS BREW folder?)");
  const mif = files.find((f) => /\.mif$/i.test(f.path));
  const build            = {
    tool: "hallpass-extractor",
    formatVersion: FORMAT_VERSION,
    name: safeName(opts.name ?? folder.split(/[\\/]/).filter(Boolean).pop() ?? "brew"),
    platform: "brew",
    source: { file: main.path, size: main.data.length, sha256: await sha256Hex(main.data) },
    namespaces: [],
    skippedPacks: [],
    warnings: [],
  };
  if (mif) log(`${mif.path}: ${mifStrings(mif.data).join(" | ")}`);
  for (const other of mains) if (other !== main) build.warnings.push(`${other.path}: handset variant of the main pack, not extracted`);
  if (!isPack(main.data)) throw new Error(`${main.path} is not a CSPUD pack`);
  const app = readPack(main.data);
  const appInfo                = { id: "app", path: "app", source: main.path, bundled: true, resources: 0, counts: {} };
  log(`app: ${app.size} resources`);
  await writeNamespace(sink, appInfo, app, false, build.warnings, { brew: true });
  const title = app.get(1);
  if (title) appInfo.manifest = { storyId: BREW_SEASON, sortKey: 0, titles: { en: cp1252(title).replace(/[\r\n\0]+/g, " ").trim() }, tail: null };
  build.namespaces.push(appInfo);
  const packs = [
    ...files.filter((f) => /\.pud$/i.test(f.path) && !mainPack(f.path)).map((f) => ({ name: base(f.path), source: f.path, bundled: true, data: f.data })),
    ...(opts.packs ?? []).map((p) => ({ name: p.name, source: p.source ?? p.name, bundled: false, data: p.data })),
  ];
  const used = new Set        ();
  for (const p of packs) {
    let name = safeName(p.name);
    for (let n = 2; used.has(name); n++) name = `${safeName(p.name)}-${n}`;
    used.add(name);
    if (!isPack(p.data)) {
      build.warnings.push(`${p.source}: not a CSPUD pack, skipped`);
      continue;
    }
    const res = readPack(p.data);
    const label = res.get(1);
    const info                = { id: `pack:${name}`, path: `packs/${name}`, source: p.source, bundled: p.bundled, resources: 0, counts: {} };
    log(`${info.id}: ${res.size} resources`);
    await writeNamespace(sink, info, res, true, build.warnings, { brew: true, manifest: label ? brewManifest(p.name, label) : undefined });
    build.namespaces.push(info);
  }
  await sink.write("build.json", JSON.stringify(build, null, 2));
  return build;
}
