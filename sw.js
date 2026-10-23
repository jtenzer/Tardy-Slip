const SITE = {"version":"2f5b704bd750","files":["./","extractor/src/bmp.js","extractor/src/brew.js","extractor/src/bytes.js","extractor/src/csmaster.js","extractor/src/cspud.js","extractor/src/cstext.js","extractor/src/cswidget.js","extractor/src/extract.js","extractor/src/kiwi.js","extractor/src/lzma.js","extractor/src/manifest.js","extractor/src/png.js","extractor/src/rar.js","extractor/src/zip.js","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png","manifest.webmanifest","player/src/audio/midi.js","player/src/audio/sf2.js","player/src/data/brew-art.js","player/src/data/brew-ui.js","player/src/data/build.js","player/src/engine/brew-calendar.js","player/src/engine/entities.js","player/src/engine/story.js","player/src/minigames/brew-catch.js","player/src/vm/kiwi.js","player/src/web/audio.js","player/src/web/brew/app.js","player/src/web/brew/art.js","player/src/web/brew/front.js","player/src/web/brew/intake.js","player/src/web/brew/phone.css","player/src/web/brew/phone.js","player/src/web/brew/screens.js","player/src/web/brew/site.js","player/src/web/brew/store.js","player/src/web/brew/ui.js","player/src/web/catalog.js","player/src/web/saves.js","player/src/web/synth.js","site.css"]};
const sw = self                          ;
const CODE = `hallpass-phone-${SITE.version}`;
const ASSETS = "hallpass-phone-assets";
const scope = sw.registration.scope;
const page = new URL("./", scope).href;
sw.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    await (await caches.open(CODE)).addAll(SITE.files.map((f) => new URL(f, scope).href));
    await sw.skipWaiting();
  })());
});
sw.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("hallpass-phone-") && k !== CODE && k !== ASSETS) await caches.delete(k);
    await sw.clients.claim();
  })());
});
sw.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(scope)) return;
  e.respondWith((async () => {
    const code = await caches.open(CODE);
    const hit = await code.match(req.mode === "navigate" ? page : req.url, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    const assets = await caches.open(ASSETS);
    const kept = await assets.match(req.url, { ignoreVary: true });
    if (kept) return kept;
    const res = await fetch(req);
    if (res.status === 200 && !req.headers.has("range")) await assets.put(req.url, res.clone());
    return res;
  })());
});
