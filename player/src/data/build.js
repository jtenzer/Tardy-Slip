export function fetchSource(base        )             {
  const root = base.endsWith("/") ? base : `${base}/`;
  return {
    async json   (path        )             {
      const r = await fetch(root + path);
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return (await r.json())     ;
    },
    url: (path) => root + path,
  };
}
export class Namespace {
           info               ;
           index                               ;
  constructor(info               , index                               ) {
    this.info = info;
    this.index = index;
  }
  entry(id        )                            {
    return this.index[id];
  }
  scriptIds()           {
    return Object.entries(this.index).filter(([, e]) => e.type === "script").map(([id]) => Number(id)).sort((a, b) => a - b);
  }
}
export class Build {
           src            ;
           info           ;
           namespaces = new Map                   ();
          scripts = new Map                    ();
          remaster                       = null;
          twinList                                = null;
          twinMaps = new Map                                     ();
          constructor(src            , info           ) {
    this.src = src;
    this.info = info;
  }
  static async open(src            , opts              = {})                 {
    const only = opts.only;
    const info = await src.json           ("build.json");
    if (info.tool !== "hallpass-extractor" || !(info.formatVersion >= 1 && info.formatVersion <= 2)) {
      throw new Error("not a Hall Pass extractor v1/v2 folder");
    }
    const b = new Build(src, info);
    for (const ns of info.namespaces) {
      if (only && !only(ns)) continue;
      const idx = await src.json                                              (`${ns.path}/index.json`);
      b.namespaces.set(ns.id, new Namespace(ns, idx.resources));
    }
    if (opts.remaster || opts.twins) {
      const index = await src.json               ("remaster/index.json").catch(() => null);
      if (opts.remaster) b.remaster = index;
      if (opts.twins) b.twinList = index?.twins ?? null;
    }
    return b;
  }
  chain(nsId        )              {
    const ns = this.namespaces.get(nsId);
    if (!ns) throw new Error(`no namespace ${nsId}`);
    const app = this.namespaces.get("app");
    return nsId === "app" || !app ? [ns] : [ns, app];
  }
  resolve(nsId        , id        )                                                 {
    for (const ns of this.chain(nsId)) {
      const entry = ns.entry(id);
      if (entry) return { ns, entry };
    }
    return null;
  }
  stringLoader(nsId        , lang = "en")               {
    return async (scriptId) => {
      const script = this.resolve(nsId, scriptId);
      const e = script?.ns.entry(scriptId + 50);
      if (!script || !e || e.type !== "strings") return null;
      const t = await this.src.json                                         (`${script.ns.info.path}/${e.file}`);
      return t.languages[lang] ?? Object.values(t.languages)[0] ?? null;
    };
  }
  files(nsId        )           {
    if (!this.src.url) return [];
    const out = new Set        ();
    for (const ns of this.chain(nsId)) {
      for (const e of Object.values(ns.index)) {
        out.add(this.src.url(`${ns.info.path}/${e.file}`));
        if (e.texture) out.add(this.src.url(`${ns.info.path}/${e.texture}`));
      }
      for (const [key, t] of Object.entries(this.remaster?.textures ?? {})) {
        if (key.startsWith(`${ns.info.id}:`)) out.add(this.src.url(`remaster/${t.file}`));
      }
      for (const t of Object.values(this.twinMaps.get(ns.info.id) ?? {})) out.add(this.src.url(`../${t.u}`));
    }
    return [...out];
  }
  async loadTwins(nsId        )                {
    for (const ns of this.chain(nsId)) {
      const id = ns.info.id;
      if (this.twinMaps.has(id)) continue;
      const file = this.twinList?.[id];
      let map = file ? await this.src.json                      (`remaster/${file}`).catch(() => null) : null;
      const folder = map && Object.values(map)[0]?.u.split("/")[0];
      if (folder && !(await this.hasFolder(folder))) map = null;
      this.twinMaps.set(id, map);
    }
  }
          folders = new Map                          ();
          hasFolder(folder        )                   {
    let p = this.folders.get(folder);
    if (!p) {
      p = this.src.json(`../${folder}/build.json`).then(() => true, () => false);
      this.folders.set(folder, p);
    }
    return p;
  }
  twin(nsId        , id        )                                      {
    const r = this.resolve(nsId, id);
    const t = r && this.twinMaps.get(r.ns.info.id)?.[id];
    if (!t || !this.src.url) return null;
    return { url: this.src.url(`../${t.u}`), res: t.r };
  }
  hiRes(nsId        , id        )                                                                                                 {
    const r = this.resolve(nsId, id);
    const t = r && this.remaster?.textures?.[`${r.ns.info.id}:${id}`];
    if (!t || !this.src.url) return null;
    return { url: this.src.url(`remaster/${t.file}`), res: t.res, frames: t.frames };
  }
  url(nsId        , id        )                                                         {
    const r = this.resolve(nsId, id);
    if (!r || !this.src.url) return null;
    const path = (f        ) => this.src.url (`${r.ns.info.path}/${f}`);
    return { url: path(r.entry.file), type: r.entry.type, texture: r.entry.texture ? path(r.entry.texture) : undefined };
  }
  scriptLoader(nsId        )               {
    return async (id) => {
      const r = this.resolve(nsId, id);
      if (!r || r.entry.type !== "script") return null;
      const key = `${r.ns.info.path}/${r.entry.file}`;
      let s = this.scripts.get(key);
      if (!s) {
        s = await this.src.json            (key);
        this.scripts.set(key, s);
      }
      return s;
    };
  }
}
