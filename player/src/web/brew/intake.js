import { signature, sha256Hex } from "../../../../extractor/src/bytes.js";
import { extractBrew } from "../../../../extractor/src/brew.js";
import { isPack, readPack } from "../../../../extractor/src/cspud.js";
import { isRar, readRar } from "../../../../extractor/src/rar.js";
import { ZipArchive } from "../../../../extractor/src/zip.js";
export const FOLDER = "shs-brew-085";
export const MAIN_NAME = "res_xlarge.pud";
export const KNOWN_MAIN = "52c59c4f2a44bb3a77c8401229d9f0dbbfa68fb8d98bc2ebf47adf66b10858da";
const base = (p        ) => p.split(/[\\/]/).pop() ?? p;
function keepName(p        )         {
  return base(p).replace(/[^\w.-]+/g, "_");
}
export async function gather(input          )                    {
  const g           = { main: null, packs: [], unused: [], problems: [] };
  const packs           = [];
  const wanted = (name        ) => /\.(pud|exp)$/i.test(name);
  const add = (f        ) => {
    if (isPack(f.data)) packs.push(f);
    else if (wanted(f.path)) g.problems.push(`${base(f.path)}: not a game data pack`);
    else g.unused.push(base(f.path));
  };
  for (const f of input) {
    try {
      if (isRar(f.data)) {
        const inside = readRar(f.data);
        for (const x of inside) add(x);
        if (!inside.some((x) => isPack(x.data))) g.problems.push(`${base(f.path)}: no game data inside`);
      } else if (signature(f.data) === "zip") {
        const z = new ZipArchive(f.data);
        for (const name of z.names()) if (!name.endsWith("/")) add({ path: name, data: await z.read(name) });
      } else add(f);
    } catch (e) {
      g.problems.push(`${base(f.path)}: ${(e         ).message}`);
    }
  }
  const hashes = await Promise.all(packs.map((p) => sha256Hex(p.data)));
  let main = packs.findIndex((_, i) => hashes[i] === KNOWN_MAIN);
  if (main < 0) main = packs.findIndex((p) => /res_xlarge\.pud$/i.test(base(p.path)));
  if (main < 0) {
    let best = -1;
    packs.forEach((p, i) => {
      const r = readPack(p.data);
      if (r.size >= 100 && r.has(9) && r.has(10) && r.has(11) && (best < 0 || p.data.length > packs[best].data.length)) best = i;
    });
    main = best;
  }
  if (main < 0) main = packs.findIndex((p) => /res_\w*\.pud$/i.test(base(p.path)));
  if (main >= 0) g.main = { path: MAIN_NAME, data: packs[main].data };
  const seen = new Set        ();
  packs.forEach((p, i) => {
    if (i === main || hashes[i] === hashes[main]) return;
    const name = keepName(p.path);
    if (/^res_\w*\.pud$/i.test(name)) {
      g.unused.push(`${base(p.path)} (another handset's main pack)`);
      return;
    }
    if (seen.has(name)) return;
    seen.add(name);
    g.packs.push({ path: name, data: p.data });
  });
  return g;
}
export async function extractInMemory(main        , packs          )                                                                        {
  const files = new Map                             ();
  const sink = {
    write(path        , data                     )                {
      files.set(path, data);
      return Promise.resolve();
    },
  };
  const loose = packs.filter((p) => /\.pud$/i.test(p.path));
  const exp = packs.filter((p) => /\.exp$/i.test(p.path)).map((p) => ({ name: p.path.replace(/\.exp$/i, ""), source: p.path, data: p.data }));
  const info = await extractBrew(FOLDER, [{ path: MAIN_NAME, data: main.data }, ...loose], sink, { name: FOLDER, packs: exp });
  return { files, info };
}
const TYPES                         = {
  png: "image/png", json: "application/json", mid: "audio/midi", midi: "audio/midi", wav: "audio/wav", mp3: "audio/mpeg",
};
export function memorySource(files                                  )             {
  const urls = new Map                ();
  return {
    json   (path        )             {
      const f = files.get(path);
      if (f === undefined) return Promise.reject(new Error(`${path}: not found`));
      return Promise.resolve(JSON.parse(typeof f === "string" ? f : new TextDecoder().decode(f))     );
    },
    url(path        )         {
      let u = urls.get(path);
      if (!u) {
        const f = files.get(path);
        if (f === undefined) return `blob:missing#${path}`;
        const type = TYPES[path.split(".").pop() .toLowerCase()] ?? "application/octet-stream";
        u = `${URL.createObjectURL(new Blob([f            ], { type }))}#${path}`;
        urls.set(path, u);
      }
      return u;
    },
  };
}
