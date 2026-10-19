import { sha256Hex } from "../../../../extractor/src/bytes.js";
import { Build } from "../../data/build.js";
import { setSoundBank } from "../audio.js";
import { PhoneApp } from "./app.js";
import { extractInMemory, FOLDER, gather,              KNOWN_MAIN, MAIN_NAME, memorySource } from "./intake.js";
import { clearFiles, loadFiles, saveFiles } from "./store.js";
const LINKS = {
  pud: "https://archive.org/download/brewgames/BREW_by_Straces.zip/BREW_by_Straces%2FBREW%2FAllsiemens%20games%2FSHS%2FSHS%2Fres_xlarge.pud",
  rar: "https://archive.org/download/qualcomm-brew-games/Qualcomm%20BREW%20Games.zip/brew2010%2FSHS.rar",
  addons: "https://archive.org/download/qualcomm-brew-games/Qualcomm%20BREW%20Games.zip/brew2010%2Fshs-addons.rar",
  item: "https://archive.org/details/qualcomm-brew-games",
};
const root = document.getElementById("app") ;
function el                                       (tag   , cls = "", parent              , text         )                           {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}
function link(parent             , href        , text        )                    {
  const a = el("a", "", parent, text);
  a.href = href;
  a.rel = "noopener noreferrer";
  return a;
}
function split(files          )                                           {
  return { main: files.find((f) => f.path === MAIN_NAME) ?? null, packs: files.filter((f) => f.path !== MAIN_NAME) };
}
async function landing(error         )                {
  document.body.classList.remove("playing");
  root.replaceChildren();
  const page = el("main", "site", root);
  const head = el("header", "site-head", page);
  const icon = el("img", "", head);
  icon.src = "icons/icon-192.png";
  icon.alt = "";
  const titles = el("div", "", head);
  el("h1", "", titles, "Tardy Slip");
  el("p", "tag", titles, "Surviving High School, the 2008 Verizon flip-phone game, playable again in your browser.");
  const ready = el("section", "card ready hidden", page);
  const status = el("div", "status");
  status.setAttribute("aria-live", "polite");
  const say = (text        , kind                             = "") => el("p", kind, status, text);
  if (error) say(error, "bad");
  const showReady = async () => {
    const kept = split(await loadFiles());
    ready.replaceChildren();
    ready.classList.toggle("hidden", !kept.main && !kept.packs.length);
    if (!kept.main && !kept.packs.length) return;
    const n = kept.packs.length;
    const what = kept.main ? `The game is on this device${n ? `, with ${n} episode${n === 1 ? "" : "s"}` : ""}.` : `${n} episode${n === 1 ? "" : "s"} kept. Add the main game file to play.`;
    el("p", "", ready, what);
    const row = el("div", "buttons", ready);
    if (kept.main) {
      const play = el("button", "play", row, "Play");
      play.type = "button";
      play.addEventListener("click", () => void start().catch((e) => landing(`Couldn't start the game: ${(e         ).message}`)));
      play.focus();
    }
    const forget = el("button", "quiet", row, "Remove the game files");
    forget.type = "button";
    forget.addEventListener("click", async () => {
      if (!confirm("Remove the game files from this device? Your saved games stay.")) return;
      await clearFiles().catch(() => undefined);
      status.replaceChildren();
      await showReady();
    });
  };
  const get = el("section", "card", page);
  el("h2", "", get, "1. Get the game file");
  const p = el("p", "", get, "No game files come with this page. The Internet Archive keeps ");
  link(p, LINKS.item, "a copy of the 2008 release");
  p.append(" (version 1.0.5). One of these is all you need:");
  const list = el("ul", "links", get);
  const item = (href        , name        , about        ) => {
    const li = el("li", "", list);
    link(li, href, name);
    el("span", "", li, about);
  };
  item(LINKS.pud, "res_xlarge.pud", "537 KB · the whole game, football season included");
  item(LINKS.rar, "SHS.rar", "612 KB · the same file, as the collector packed it");
  const extra = el("p", "", get, "Optional: ");
  link(extra, LINKS.addons, "shs-addons.rar");
  extra.append(" (1.8 MB) adds the 123 episodes the game could download in 2008.");
  const drop = el("section", "card", page);
  el("h2", "", drop, "2. Drop it here");
  const zone = el("label", "dropzone", drop);
  const input = el("input", "", zone);
  input.type = "file";
  input.multiple = true;
  el("span", "", zone, "Drop the files here, or ");
  el("u", "", zone, "choose them");
  el("p", "note", drop, "They stay on this device. Nothing is uploaded.");
  drop.append(status);
  const take = async (list                   ) => {
    const picked = [...list];
    if (!picked.length) return;
    status.replaceChildren();
    say(`Reading ${picked.length === 1 ? picked[0].name : `${picked.length} files`}…`);
    try {
      await intake(picked, say);
    } catch (e) {
      say((e         ).message, "bad");
    }
    await showReady();
  };
  input.addEventListener("change", () => void take(input.files ?? []));
  for (const ev of ["dragenter", "dragover"]) {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("over");
    });
  }
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    void take(e.dataTransfer?.files ?? []);
  });
  const help = el("details", "card help", page);
  el("summary", "", help, "Controls and tips");
  const ul = el("ul", "", help);
  for (
    const t of [
      "Touch: the arrows, OK and Back under the screen. Back pauses during a story; its label says what it does.",
      "Keyboard: arrows, Enter or Space for OK, Backspace or Esc for Back. [ and ] (or F1 and F2) are the soft keys whose labels show at the bottom of the screen.",
      "The game saves itself as you play. Saves stay in this browser on this device.",
      "On a phone, add this page to your home screen: it then opens full screen, works offline and keeps the game files for good.",
      "Get Episodes in the game's menu tried Verizon's servers, which are long gone; the episodes from shs-addons.rar are under Play.",
    ]
  ) el("li", "", ul, t);
  const foot = el("footer", "site-foot", page);
  el("p", "", foot, "A fan project to keep an old phone game playable. Not affiliated with or endorsed by Electronic Arts. Surviving High School and its content belong to their owners.");
  el("p", "", foot, "Music plays through the TimGM6mb General MIDI sound bank by Tim Brechbill (GPL 2).");
  await showReady();
}
async function intake(picked        , say                                                           )                {
  const input = await Promise.all(picked.map(async (f) => ({ path: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
  const g = await gather(input);
  for (const p of g.problems) say(p, "bad");
  if (!g.main && !g.packs.length) {
    say("No game data in that. Drop res_xlarge.pud, SHS.rar or shs-addons.rar.", "bad");
    return;
  }
  const kept = split(await loadFiles());
  const main = g.main ?? kept.main;
  if (g.main) {
    if ((await sha256Hex(g.main.data)) === KNOWN_MAIN) say("Main game: the 2008 Verizon release, version 1.0.5.", "ok");
    else say("Main game: not the release this page was made for. It may not play right.", "warn");
  }
  if (main) {
    const packs = [...kept.packs.filter((k) => !g.packs.some((p) => p.path === k.path)), ...g.packs];
    try {
      await extractInMemory(main, packs);
    } catch (e) {
      say(`That didn't unpack: ${(e         ).message}`, "bad");
      return;
    }
  }
  if (g.packs.length) say(`${g.packs.length} episode${g.packs.length === 1 ? "" : "s"}.`, "ok");
  try {
    await saveFiles([...(g.main ? [g.main] : []), ...g.packs]);
  } catch {
    say("This browser won't keep files (private mode?). The game will play now but has to be dropped in again next time.", "warn");
    session = [...(g.main ? [g.main] : []), ...g.packs];
  }
  if (!main) say("Now add the main game file (res_xlarge.pud or SHS.rar).", "warn");
}
let session           = [];
async function start(files           )                {
  const all = files ?? [...await loadFiles(), ...session];
  const { main, packs } = split(all);
  if (!main) throw new Error("the main game file is missing");
  root.replaceChildren();
  el("p", "loading", root, "Unpacking the game…");
  const { files: out } = await extractInMemory(main, packs);
  const build = await Build.open(memorySource(out));
  document.body.classList.add("playing");
  root.replaceChildren();
  const phone = new PhoneApp(el("div", "", root), build, FOLDER);
  phone.onLeave = () => location.replace("?home");
  await phone.load();
  phone.start();
}
setSoundBank(new URL("soundbank/TimGM6mb.sf2", document.baseURI).href);
if ("serviceWorker" in navigator && isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("service worker:", e));
}
const home = new URLSearchParams(location.search).has("home");
if (home) history.replaceState(null, "", location.pathname);
const kept = home ? [] : await loadFiles();
if (kept.some((f) => f.path === MAIN_NAME)) {
  await start(kept).catch((e) => landing(`Couldn't start the game: ${(e         ).message}`));
} else await landing();
