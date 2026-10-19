export const HD_SHA256 = "7fac59e76e7223c34187008921839fbd75b41af2015a9ca5ac554ddf0fb29d36";
const KNOWN                        = {
  a6499f32d8a0b18e83ca8d1b62fcfcb7330c54d68d1f9246b216545762a0fe36: { edition: "app", label: "Paid 1.4.3.54 (iPhone)", rank: 1 },
  "17cca9961f16865b8caba452707d928940a7fd1f7d858cdae21bd0cef31645ae": { edition: "app", label: "1.0.9 (Android)", rank: 2 },
  "7bb0de3d6265fbff4f6f3d61a51160478a163751e3a42698e1c8646dece92715": { edition: "app", label: "1.2.4 (iPhone)", rank: 3 },
  fb63564bf8eb6751c8fa6b91c05a4d8f33274f7e7496acf2296642020e8bae29: { edition: "app", label: "1.1.1 (iPhone)", rank: 4 },
  [HD_SHA256]: { edition: "app", label: "HD 1.4.38 (iPad)", rank: 5 },
  "86d01d5ec4fb89b139bdaf147ed7f09b156a18b3f281a8caa6ff7f8cd449879a": { edition: "other", label: "Cause of Death 1.4.7", rank: 50 },
};
export const BUILT_IN_TITLE = "The Football Star";
export const BUNDLED_GROUP = "Start here";
export function knownBuild(b              )               {
  return (b.sha256 && KNOWN[b.sha256]) || null;
}
export function buildRank(b              )                                                    {
  return knownBuild(b) ?? { edition: "app", rank: 100, label: b.name };
}
export function isStory(ns               )          {
  return (ns.counts.script ?? 0) > 0 && !/^pack:test/i.test(ns.id);
}
export function storyTitle(ns               )         {
  if (ns.id === "app") return ns.manifest?.titles.en || BUILT_IN_TITLE;
  return ns.manifest?.titles.en || ns.id.replace(/^pack:/, "").replace(/_/g, " ");
}
const key = (title        ) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function packFolders(b              )                             {
  const loose = b.namespaces.filter((n) => n.id !== "app" && !n.bundled);
  const dirs = loose.map((n) => n.source.replaceAll("\\", "/").split("/").slice(0, -1));
  if (new Set(dirs.map((d) => d.join("/"))).size < 3) return null;
  let common = dirs[0].length;
  for (const d of dirs) {
    let i = 0;
    while (i < common && i < d.length && d[i] === dirs[0][i]) i++;
    common = i;
  }
  const out = new Map                ();
  loose.forEach((n, i) => out.set(n.id, dirs[i].slice(common).join(" · ")));
  return out;
}
function leadingNumber(title        )                {
  const m = /^(\d+)\s*:/.exec(title);
  return m ? Number(m[1]) : null;
}
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
function groupOrder(a        , b        )         {
  const rank = (g        ) =>
    g === BUNDLED_GROUP ? 0 : /^Season\b/i.test(g) ? 1 : g === MORE_GROUP ? 4 : /^Premium/i.test(g) ? 3 : 2;
  return rank(a) - rank(b) || collator.compare(a, b);
}
export const MORE_GROUP = "More stories";
function label(copies        , title        , series                     )         {
  if (copies.some((c) => c.bundled)) return BUNDLED_GROUP;
  const set = /^Set (\d+):/.exec(title);
  if (set) return `Season ${Number(set[1])}`;
  const of = (c      ) => (c.ns.manifest ? series.get(c.ns.manifest.storyId) : undefined);
  const folders = copies.map((c) => c.folder).filter((f)              => !!f);
  if (folders.length) return folders.find((f) => copies.some((c) => of(c) === f)) ?? folders[0];
  const named = /^(.*\D)\s+(\d+):\s/.exec(title);
  if (named) return `${named[1]} · Season ${Number(named[2])}`;
  for (const c of copies) {
    const s = of(c);
    if (s) return s;
  }
  return MORE_GROUP;
}
const STOP = new Set(["the", "a", "an", "of", "and", "special"]);
const NUMBER_WORDS                         = { one: "1", two: "2", three: "3", four: "4", five: "5" };
function words(title        )              {
  return new Set(key(title).split(" ").map((w) => NUMBER_WORDS[w] ?? w).filter((w) => w && !STOP.has(w)));
}
function sameStory(a               , b               )          {
  const ma = a.manifest;
  const mb = b.manifest;
  if (!ma || !mb || ma.storyId !== mb.storyId || ma.sortKey !== mb.sortKey) return false;
  const wa = words(storyTitle(a));
  const wb = words(storyTitle(b));
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  return both / (wa.size + wb.size - both) >= 0.5;
}
function episodeOrder(x         , y         )         {
  const a = leadingNumber(x.title);
  const b = leadingNumber(y.title);
  if (a !== null && b !== null) return a - b || collator.compare(x.title, y.title);
  if (a !== null || b !== null) return a !== null ? -1 : 1;
  return x.sortKey - y.sortKey || collator.compare(x.title, y.title);
}
export function appEpisodes(builds                )                 {
  const ordered = builds
    .map((b) => ({ b, r: buildRank(b) }))
    .filter(({ r }) => r.edition === "app")
    .sort((x, y) => x.r.rank - y.r.rank || x.b.folder.localeCompare(y.b.folder));
  const stories           = [];
  const byTitle = new Map                ();
  for (const { b } of ordered) {
    const folders = packFolders(b);
    for (const ns of b.namespaces.filter(isStory)) {
      const c       = { b, ns, bundled: ns.id === "app" || ns.bundled, folder: folders?.get(ns.id) || null };
      const k = key(storyTitle(ns));
      const list = byTitle.get(k) ?? stories.find((l) => l.some((o) => sameStory(o.ns, ns)));
      if (list) list.push(c);
      else stories.push([c]);
      byTitle.set(k, list ?? stories[stories.length - 1]);
    }
  }
  const votes = new Map                             ();
  for (const list of stories) {
    for (const c of list) {
      const id = c.ns.manifest?.storyId;
      if (id === undefined || !c.folder) continue;
      const v = votes.get(id) ?? new Map                ();
      v.set(c.folder, (v.get(c.folder) ?? 0) + 1);
      votes.set(id, v);
    }
  }
  const series = new Map                ();
  for (const [id, v] of votes) {
    const total = [...v.values()].reduce((a, b) => a + b, 0);
    const [top, n] = [...v.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n / total >= 0.75) series.set(id, top);
  }
  const episodes            = stories.map((list) => {
    const best = list[0];
    const title = storyTitle(best.ns);
    return {
      title, folder: best.b.folder, nsId: best.ns.id, group: label(list, title, series),
      sortKey: best.ns.id === "app" ? -1 : (best.ns.manifest?.sortKey ?? 0),
      series: best.ns.manifest?.storyId ?? -1,
    };
  });
  const size = new Map                ();
  for (const e of episodes) size.set(e.group, (size.get(e.group) ?? 0) + 1);
  for (const e of episodes) {
    const cut = e.group.lastIndexOf(" · ");
    if (size.get(e.group) === 1 && cut > 0) e.group = e.group.slice(0, cut);
  }
  const byGroup = new Map                   ();
  for (const e of episodes) {
    const list = byGroup.get(e.group) ?? [];
    list.push(e);
    byGroup.set(e.group, list);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => groupOrder(a, b))
    .map(([name, list]) => ({
      name,
      episodes: list.sort((x, y) => (name === MORE_GROUP && x.series !== y.series ? x.series - y.series : episodeOrder(x, y))),
    }));
}
