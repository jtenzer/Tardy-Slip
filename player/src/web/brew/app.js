import { ENTRY_SCRIPT, Story,                    } from "../../engine/story.js";
import { AudioPlayer } from "../audio.js";
import { storyTitle } from "../catalog.js";
import { AutoSaver, SaveStore } from "../saves.js";
import { BrewArt } from "./art.js";
import {                  BrewFrontend, loadBrewUi, loadUiArt, TICK_MS } from "./front.js";
import { Phone,               } from "./phone.js";
import {                                H, PageScreen, S, W } from "./screens.js";
import { drawSoftKeys, UiLayouts } from "./ui.js";
const LOGO = 8;
const TITLE = 47;
const TITLE_MUSIC = 8006;
const VERSION = "1.0.5";
class TimedScreen                       {
  closed = false;
          ms = 0;
                   minMs        ;
                   paint                                                   ;
                   soft                                ;
                   skippable         ;
                   done            ;
  constructor(o                                                                                                                                                         ) {
    this.minMs = o.minMs;
    this.paint = o.paint;
    this.soft = o.soft;
    this.skippable = o.skippable;
    this.done = o.done;
  }
  update(dt        )       {
    this.ms += dt;
    if (!this.closed && this.ms >= this.minMs) this.finish();
  }
          finish()       {
    this.closed = true;
    this.done();
  }
  key(k          )       {
    if (k === "select" && this.skippable && !this.closed) this.finish();
  }
  softKeys()                                 {
    return this.soft;
  }
  draw(g                          , c         )       {
    this.paint(g, c);
  }
}
export class PhoneApp {
           phone       ;
                   build       ;
                   folder        ;
          data                    = null;
          ctx                 = null;
                   audio             ;
          currentNs = "app";
                   screens               = [];
          timer = 0;
          last = 0;
          blinkMs = 0;
          tickerMs = 0;
          onMenu = false;
          musicStarted = false;
  onLeave             = () => {};
  constructor(parent             , build       , folder        ) {
    this.build = build;
    this.folder = folder;
    this.phone = new Phone(parent);
    this.audio = new AudioPlayer((id) => {
      const r = this.build.url(id < 26000 ? "app" : this.currentNs, id);
      return r && r.type === "audio" ? r.url : null;
    });
  }
  async load()                {
    this.data = await loadBrewUi(this.build);
    const art = new BrewArt(this.build, "app");
    const ui = new UiLayouts(this.data.set10, art);
    await Promise.all([loadUiArt(art), art.load(LOGO), art.load(TITLE)]);
    const { f1, f2, f3, strings } = this.data;
    this.ctx = {
      art, ui, f1, f2, f3, strings, blink: false, minute: () => 450, portrait: () => null, prop: () => 0,
      random: (n) => (n > 0 ? Math.floor(Math.random() * n) : 0),
    };
  }
  start(nsId         , snapshot                       )       {
    this.resume();
    if (nsId) {
      this.musicStarted = true;
      void this.play(nsId, snapshot ?? null);
      return;
    }
    this.logo();
  }
          resume()       {
    this.phone.onKey = (k, down) => {
      if (down) this.key(k);
    };
    this.last = performance.now();
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS)                     ;
  }
          stop()       {
    clearInterval(this.timer);
    this.timer = 0;
  }
          tick()       {
    const c = this.ctx;
    if (!c) return;
    const now = performance.now();
    const dt = Math.max(0, Math.min(200, now - this.last));
    this.last = now;
    this.blinkMs += dt;
    this.tickerMs += dt;
    if (this.blinkMs >= 200) {
      this.blinkMs %= 200;
      c.blink = !c.blink;
    }
    for (let i = this.screens.length - 1; i >= 0; i--) if (this.screens[i].closed) this.screens.splice(i, 1);
    this.screens[this.screens.length - 1]?.update(dt, c);
    this.draw();
  }
          draw()       {
    const c = this.ctx;
    if (!c || !this.data) return;
    const g = this.phone.g;
    g.imageSmoothingEnabled = false;
    c.ui.tile(g, 12 + 2, 0, 0, W, H);
    for (const s of this.screens) s.draw(g, c);
    if (this.onMenu && this.screens.length) this.drawHeader(g, c);
    const top = this.screens[this.screens.length - 1];
    const [l, r] = top ? top.softKeys(c) : [null, null];
    const label = (id               ) => (id === null ? null : (c.strings[id] ?? null));
    drawSoftKeys(g, this.data.f2, this.data.set11.colours, label(l), label(r), W, H);
    this.phone.setBackLabel(label(l) ?? "");
  }
          drawHeader(g                          , c         )       {
    c.ui.draw(g, 17, 0, 0, W, 22);
    const text = c.strings[54] ?? "";
    const w = c.f1.width(text);
    const x = W - Math.floor(this.tickerMs / 50) % (W + w);
    g.save();
    g.beginPath();
    g.rect(0, 0, W, 16);
    g.clip();
    c.f1.draw(g, text, x, 0, w + 8);
    g.restore();
  }
          key(k          )       {
    const c = this.ctx;
    if (!c) return;
    const key           = k === "soft1" ? "clr" : k === "soft2" ? "select" : k;
    this.screens[this.screens.length - 1]?.key(key, c);
    this.draw();
  }
          show(s            , menu = false)       {
    for (const x of this.screens) x.closed = true;
    this.screens.length = 0;
    this.onMenu = menu;
    this.screens.push(s);
    this.draw();
  }
          logo()       {
    this.show(new TimedScreen({
      minMs: 2001, soft: [null, null], skippable: false,
      paint: (g, c) => {
        g.fillStyle = "#fff";
        g.fillRect(0, 0, W, H);
        const s = c.art.size(LOGO);
        if (s) c.art.draw(g, LOGO, (W - s.w) >> 1, (H - s.h) >> 1);
      },
      done: () => this.soundPrompt(),
    }));
  }
          page(
    o                                                                                                                                                                   ,
    pick                     , menu = false,
  )       {
    this.show(new PageScreen({
      style: 0, title: o.title, items: o.items, menu: !o.text, soft: o.soft, box: o.box, onClr: o.back, noPencil: o.text,
    }, pick), menu);
  }
          soundPrompt()       {
    const s = this.ctx .strings;
    this.page({ title: s[62] ?? "", items: [s[2] ?? "", s[3] ?? "", s[8] ?? ""], soft: [null, S.select] }, (i) => {
      if (i === 2) return this.onLeave();
      this.audio.setMuted(i === 1);
      this.title();
    });
  }
          title()       {
    this.show(new TimedScreen({
      minMs: 3000, soft: [null, S.done], skippable: true,
      paint: (g, c) => {
        g.fillStyle = "#000";
        g.fillRect(0, 0, W, H);
        c.ui.tile(g, 12 + 2, 0, 0, W, H);
        const s = c.art.size(TITLE);
        if (s) c.art.draw(g, TITLE, (W - s.w) >> 1, (H - s.h) >> 1);
      },
      done: () => this.mainMenu(),
    }));
  }
          mainMenu()       {
    const s = this.ctx .strings;
    if (!this.musicStarted) {
      this.musicStarted = true;
      this.audio.playMusic(TITLE_MUSIC, false);
    }
    const last = this.latestSave();
    const items                         = [];
    if (last) items.push([s[11] ?? "", () => void this.play(last.nsId, null, true)]);
    items.push(
      [s[20] ?? "", () => this.playList()],
      [s[36] ?? "", () => this.getEpisodes()],
      [s[5] ?? "", () => this.options()],
      [s[7] ?? "", () => this.textPage(s[7] ?? "", [63, 64, 66, 67, 69].map((i) => s[i] ?? "").join("\n\n"))],
      [s[6] ?? "", () => this.textPage(s[6] ?? "", (s[70] ?? "").replace("$VERSION", VERSION))],
      [s[8] ?? "", () => this.exitPrompt()],
    );
    this.page(
      { title: s[0] ?? "", items: items.map((x) => x[0]), soft: [S.exit, S.select], box: { x: 8, y: 30, w: 224, h: 282 }, back: () => this.exitPrompt() },
      (i) => items[i]?.[1](),
      true,
    );
  }
          textPage(title        , text        )       {
    this.page({ title, items: [text], soft: [S.back, null], text: true, box: { x: 0, y: 0, w: W, h: H }, back: () => this.mainMenu() }, () => {});
  }
          exitPrompt()       {
    const s = this.ctx .strings;
    this.page({ title: s[9] ?? "", items: [s[2] ?? "", s[3] ?? ""], soft: [S.no, S.yes], back: () => this.mainMenu() }, (i) => {
      if (i === 0) this.onLeave();
      else this.mainMenu();
    });
  }
          options()       {
    const s = this.ctx .strings;
    const sound = s[this.audio.muted ? 12 : 13] ?? "";
    this.page({ title: s[5] ?? "", items: [sound, s[32] ?? "", s[19] ?? ""], soft: [S.back, S.select], back: () => this.mainMenu() }, (i) => {
      if (i === 0) {
        this.audio.setMuted(!this.audio.muted);
        if (this.audio.muted) this.audio.stopMusic();
        return this.options();
      }
      if (i === 1) return this.messagePage(s[32] ?? "", s[39] ?? "", () => this.options());
      this.mainMenu();
    });
  }
          getEpisodes()       {
    const s = this.ctx .strings;
    this.messagePage(s[52] ?? "", s[53] ?? "", () => this.mainMenu());
    setTimeout(() => {
      if (this.timer) this.messagePage(s[41] ?? "", s[42] ?? "", () => this.mainMenu());
    }, 1500);
  }
          messagePage(title        , text        , back            )       {
    this.page({ title, items: [text], soft: [S.back, S.confirm], text: true, back }, () => back());
  }
          entries()          {
    const out          = [];
    for (const ns of this.build.namespaces.values()) {
      if (!ns.scriptIds().length) continue;
      out.push({ nsId: ns.info.id, title: storyTitle(ns.info) });
    }
    const rank = (e       ) => (e.nsId === "app" ? 0 : /pt1$/i.test(e.nsId) ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, undefined, { numeric: true }));
  }
          store(nsId        )            {
    const ns = this.build.namespaces.get(nsId);
    return new SaveStore(this.folder, nsId, ns ? storyTitle(ns.info) : nsId);
  }
          latestSave()               {
    let best                                  = null;
    for (const e of this.entries()) {
      const info = this.store(e.nsId).info("auto");
      if (info && (!best || info.savedAt > best.at)) best = { e, at: info.savedAt };
    }
    return best?.e ?? null;
  }
          playList()       {
    const s = this.ctx .strings;
    const list = this.entries();
    this.page({ title: s[20] ?? "", items: list.map((e) => e.title), soft: [S.back, S.select], box: { x: 0, y: 0, w: W, h: H }, back: () => this.mainMenu() }, (i) => {
      const e = list[i];
      if (!e) return this.mainMenu();
      if (!this.store(e.nsId).info("auto")) return void this.play(e.nsId, null);
      this.page({ title: s[57] ?? "", items: [s[2] ?? "", s[3] ?? ""], soft: [S.no, S.yes], back: () => this.playList() }, (k) => {
        if (k === 0) void this.play(e.nsId, null);
        else this.playList();
      });
    });
  }
          async play(nsId        , snapshot                      , resume = false)                {
    const store = this.store(nsId);
    if (resume) snapshot = await store.read("auto");
    this.stop();
    this.onMenu = false;
    this.screens.length = 0;
    this.currentNs = nsId;
    const front = new BrewFrontend(this.phone, this.build, nsId, this.data , this.audio);
    const story = new Story(this.build.scriptLoader(nsId), front, { strings: this.build.stringLoader(nsId), dialect: "brew" });
    front.attach(story);
    const autosave = new AutoSaver(store);
    story.onCheckpoint = (snap, decision) => autosave.take(snap, decision);
    (window                                    ).hallpass = { story, front, build: this.build, app: this };
    let left = false;
    const back = () => {
      if (left) return;
      left = true;
      front.dispose();
      this.currentNs = "app";
      this.resume();
      this.mainMenu();
    };
    front.onExit = back;
    await front.load();
    try {
      await story.run(ENTRY_SCRIPT, snapshot ?? undefined);
    } catch (e) {
      console.error(e);
    }
    back();
  }
}
