import { decodeBmp, isBmp } from "./bmp.js";
import { sha256Hex, signature } from "./bytes.js";
import { parseMaster,                         } from "./csmaster.js";
import { isPack, readPack } from "./cspud.js";
import { parseCsl, parseStringTable } from "./cstext.js";
import { fontFamily, isFont, parseWidgetLayout } from "./cswidget.js";
import { parseKiwi, scriptToJson } from "./kiwi.js";
import { parseManifest,               } from "./manifest.js";
import { encodePng } from "./png.js";
import { ZipArchive } from "./zip.js";
export const FORMAT_VERSION = 2;
const IOS_RES = /^Payload\/[^/]+\.app\/res_generated\/(\d+)$/;
const ANDROID_RES = [/^assets\/Assets\/(\d+)(?:\.\w+)?$/, /^assets\/Assets\/audio\/(?:[^/]+\/)*(\d+)\.\w+$/];
export function appLayout(zip            )            {
  const names = zip.names().sort();
  const ios = names.some((n) => IOS_RES.test(n));
  const android = !ios && names.some((n) => ANDROID_RES[0].test(n));
  if (!ios && !android) throw new Error("no numbered resources found (not an SHS IPA/APK?)");
  const patterns = ios ? [IOS_RES] : ANDROID_RES;
  const resources = new Map                ();
  const warnings           = [];
  for (const n of names) {
    for (const re of patterns) {
      const m = re.exec(n);
      if (!m) continue;
      const id = Number(m[1]);
      if (resources.has(id)) warnings.push(`resource ${id}: ${n} ignored, already have ${resources.get(id)}`);
      else resources.set(id, n);
    }
  }
  const root = ios ? /^Payload\/[^/]+\.app\// : /^assets\//;
  const packs = names
    .filter((n) => root.test(n) && n.toLowerCase().endsWith(".exp"))
    .map((n) => ({ name: n.split("/").pop() .replace(/\.exp$/i, ""), path: n, test: n.includes("/test_expansion/") }));
  return { platform: ios ? "ios" : "android", resources, packs, warnings };
}
export function safeName(s        )         {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "") || "unnamed";
}
const MEDIA                                         = {
  png: ["image", "png"], jpeg: ["image", "jpg"], riff: ["audio", "wav"], mp3: ["audio", "mp3"], ogg: ["audio", "ogg"],
};
export function packSheet(images         )                                                                         {
  const PAD = 1;
  const items = images
    .map((im, i) => ({ im, i }))
    .filter(({ im }) => im.pixels && im.width > 0 && im.height > 0)
    .sort((a, b) => b.im.height - a.im.height || b.im.width - a.im.width || a.i - b.i);
  const frames          = images.map(() => null);
  if (items.length === 0) return { width: 0, height: 0, pixels: new Uint8Array(0), frames };
  const area = items.reduce((n, { im }) => n + (im.width + PAD) * (im.height + PAD), 0);
  const width = Math.max(...items.map(({ im }) => im.width + PAD), Math.min(4096, Math.ceil(Math.sqrt(area))));
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const { im, i } of items) {
    if (x > 0 && x + im.width > width) {
      y += rowH;
      x = 0;
      rowH = 0;
    }
    frames[i] = [x, y, im.width, im.height];
    x += im.width + PAD;
    rowH = Math.max(rowH, im.height + PAD);
  }
  const height = y + rowH;
  const pixels = new Uint8Array(width * height * 4);
  for (const { im, i } of items) {
    const [fx, fy, w, h] = frames[i] ;
    for (let j = 0; j < h; j++) pixels.set(im.pixels .subarray(j * w * 4, (j + 1) * w * 4), ((fy + j) * width + fx) * 4);
  }
  return { width, height, pixels, frames };
}
async function writeMaster(sink      , dir        , id        , m        )                         {
  const texture = `img/${id}.png`;
  const common = { groups: m.groups, composites: m.composites, numImages: m.numImages };
  let meta        ;
  if (m.kind === "sheet") {
    const t = packSheet(m.images);
    if (t.width > 0) await sink.write(`${dir}/${texture}`, await encodePng(t.width, t.height, t.pixels));
    meta = { kind: "sheet", format: m.format, texture: t.width > 0 ? texture : null, width: t.width, height: t.height, frames: t.frames, ...common };
  } else {
    const tex = m.texture ;
    await sink.write(`${dir}/${texture}`, await encodePng(tex.width, tex.height, tex.pixels ));
    meta = {
      kind: "atlas", format: m.format, texture, width: tex.width, height: tex.height, scale: m.scale,
      frames: m.rects, transforms: m.derived.map(([img, , t]) => [img, t]), ...common,
    };
  }
  await sink.write(`${dir}/img/${id}.json`, JSON.stringify(meta));
  return { type: m.kind, file: `img/${id}.json`, texture };
}
function attempt   (f         )           {
  try {
    return f();
  } catch {
    return null;
  }
}
async function writeBrewResource(sink      , dir        , id        , d            )                                {
  if (isBmp(d)) {
    try {
      const bmp = decodeBmp(d);
      const file = `res/${id}.png`;
      await sink.write(`${dir}/${file}`, await encodePng(bmp.width, bmp.height, bmp.pixels));
      return { type: "image", file };
    } catch (e) {
      const file = `res/${id}.bmp`;
      await sink.write(`${dir}/${file}`, d);
      return { type: "blob", file, error: (e         ).message };
    }
  }
  if (d.length >= 4 && d[0] === 0x4d && d[1] === 0x54 && d[2] === 0x68 && d[3] === 0x64) {
    const file = `res/${id}.mid`;
    await sink.write(`${dir}/${file}`, d);
    return { type: "audio", file };
  }
  return null;
}
export function brewCmb0(d            )                      {
  if (d.length < 5 || d[0] !== 0x43 || d[1] !== 0x4d || d[2] !== 0x42 || d[3] !== 0x30) return null;
  const n = d[4];
  if (n === 0 || 5 + 4 * n > d.length) return null;
  const starts           = [];
  for (let i = 0; i < n; i++) {
    const p = 5 + 4 * i;
    starts.push(((d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]) >>> 0);
  }
  const out               = [];
  for (let i = 0; i < n; i++) {
    const from = starts[i];
    const to = i + 1 < n ? starts[i + 1] : d.length;
    if (from < 5 + 4 * n || to > d.length || to < from) return null;
    out.push(d.subarray(from, to));
  }
  return out;
}
async function writeResource(
  sink      , dir        , id        , d            , inPack         , brew = false,
)                         {
  if (brew) {
    const e = await writeBrewResource(sink, dir, id, d);
    if (e) return e;
  }
  const sig = signature(d);
  const media = MEDIA[sig];
  if (media) {
    const file = `res/${id}.${media[1]}`;
    await sink.write(`${dir}/${file}`, d);
    return { type: media[0], file };
  }
  let error                    ;
  if (isFont(d)) {
    const file = `res/${id}.ttf`;
    await sink.write(`${dir}/${file}`, d);
    const family = fontFamily(d);
    return family ? { type: "font", file, family } : { type: "font", file };
  }
  if (sig === "cspud") {
    const file = `res/${id}.exp`;
    await sink.write(`${dir}/${file}`, d);
    return { type: "pack", file, namespace: `pack:res-${id}` };
  }
  if (sig === "kiwi") {
    try {
      const file = `scripts/${id}.json`;
      await sink.write(`${dir}/${file}`, JSON.stringify(scriptToJson(parseKiwi(d))));
      return { type: "script", file };
    } catch (e) {
      error = (e         ).message;
    }
  } else if (inPack && id === 1) {
    const m = attempt(() => parseManifest(d));
    if (m) {
      await sink.write(`${dir}/manifest.json`, JSON.stringify(m));
      return { type: "manifest", file: "manifest.json" };
    }
  } else {
    const master = attempt(() => parseMaster(d));
    if (master) return writeMaster(sink, dir, id, master);
    const table = attempt(() => parseStringTable(d));
    if (table) {
      const file = `text/${id}.json`;
      await sink.write(`${dir}/${file}`, JSON.stringify({ format: "strings", languages: table }));
      return { type: "strings", file };
    }
    const csl = id <= 20 ? attempt(() => parseCsl(d)) : null;
    if (csl) {
      const file = `text/${id}.json`;
      await sink.write(`${dir}/${file}`, JSON.stringify({ format: "csl", strings: csl }));
      return { type: "csl", file };
    }
    const layout = attempt(() => parseWidgetLayout(d));
    if (layout) {
      const file = `ui/${id}.json`;
      await sink.write(`${dir}/${file}`, JSON.stringify({ format: "widgets", ...layout }));
      return { type: "layout", file };
    }
  }
  const file = `res/${id}.bin`;
  await sink.write(`${dir}/${file}`, d);
  return error ? { type: "blob", file, error } : { type: "blob", file };
}
export async function writeNamespace(
  sink      , info               , resources                         , inPack         , warnings          ,
  opts                                          = {},
)                {
  const index                                = {};
  const members = new Map                          ();
  if (opts.brew) {
    for (const [id, d] of [...resources]) {
      const parts = brewCmb0(d);
      if (!parts) continue;
      parts.forEach((m, k) => {
        const mid = id + 1 + k;
        if (resources.has(mid)) warnings.push(`${info.id} ${id}: CMB0 member ${k} would be ${mid}, which exists; skipped`);
        else {
          resources.set(mid, m);
          members.set(mid, [id, k]);
        }
      });
    }
  }
  for (const id of [...resources.keys()].sort((a, b) => a - b)) {
    let e               ;
    if (inPack && id === 1 && opts.manifest) {
      await sink.write(`${info.path}/manifest.json`, JSON.stringify(opts.manifest));
      e = { type: "manifest", file: "manifest.json" };
    } else {
      e = await writeResource(sink, info.path, id, resources.get(id) , inPack, opts.brew);
    }
    if (e.error) warnings.push(`${info.id} ${id}: ${e.error}`);
    const m = members.get(id);
    if (m) e.member = m;
    index[id] = e;
    info.counts[e.type] = (info.counts[e.type] ?? 0) + 1;
  }
  info.resources = resources.size;
  if (inPack && index[1]?.type === "manifest") info.manifest = opts.manifest ?? parseManifest(resources.get(1) );
  await sink.write(`${info.path}/index.json`, JSON.stringify({ formatVersion: FORMAT_VERSION, namespace: info.id, resources: index }));
}
export async function extractApp(fileName        , data            , sink      , opts                 = {})                     {
  const log = opts.log ?? (() => {});
  const zip = new ZipArchive(data);
  const lay = appLayout(zip);
  const build            = {
    tool: "hallpass-extractor",
    formatVersion: FORMAT_VERSION,
    name: safeName(opts.name ?? fileName.split(/[\\/]/).pop() .replace(/\.(ipa|apk)$/i, "")),
    platform: lay.platform,
    source: { file: fileName.split(/[\\/]/).pop() , size: data.length, sha256: await sha256Hex(data) },
    namespaces: [],
    skippedPacks: [],
    warnings: [...lay.warnings],
  };
  const app = new Map                    ();
  for (const [id, path] of lay.resources) app.set(id, await zip.read(path));
  const appInfo                = { id: "app", path: "app", source: build.source.file, bundled: true, resources: 0, counts: {} };
  log(`app: ${app.size} resources`);
  await writeNamespace(sink, appInfo, app, false, build.warnings);
  build.namespaces.push(appInfo);
  const used = new Set        ();
  const packs                                                                                        = [];
  for (const p of lay.packs) {
    if (p.test && !opts.testPacks) {
      build.skippedPacks.push(p.path);
      continue;
    }
    packs.push({ name: p.name, source: p.path, bundled: true, data: () => zip.read(p.path) });
  }
  for (const id of [...app.keys()].sort((a, b) => a - b)) {
    const d = app.get(id) ;
    if (isPack(d)) packs.push({ name: `res-${id}`, source: `app:${id}`, bundled: true, data: async () => d });
  }
  for (const p of opts.packs ?? []) {
    packs.push({ name: p.name, source: p.source ?? p.name, bundled: false, data: async () => p.data });
  }
  for (const p of packs) {
    let name = safeName(p.name);
    for (let n = 2; used.has(name); n++) name = `${safeName(p.name)}-${n}`;
    used.add(name);
    const bytes = await p.data();
    if (!isPack(bytes)) {
      build.warnings.push(`${p.source}: not a CSPUD pack, skipped`);
      continue;
    }
    const info                = { id: `pack:${name}`, path: `packs/${name}`, source: p.source, bundled: p.bundled, resources: 0, counts: {} };
    const res = readPack(bytes);
    log(`${info.id}: ${res.size} resources`);
    await writeNamespace(sink, info, res, true, build.warnings);
    build.namespaces.push(info);
  }
  await sink.write("build.json", JSON.stringify(build, null, 2));
  return build;
}
