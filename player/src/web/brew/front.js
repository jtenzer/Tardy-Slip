import {                 parseFont, parseLayoutSet, parseStrings } from "../../data/brew-ui.js";
import * as Cal from "../../engine/brew-calendar.js";
import { AudioPlayer } from "../audio.js";
import { CatchGame, readCatchSpec } from "../../minigames/brew-catch.js";
import { BrewArt } from "./art.js";
import {
                                 CatchScreen, DialogueScreen, S, H, PageScreen,                  PlannerView, portraitArt, relationshipIcons,
  TextEntryScreen, W,
} from "./screens.js";
import { drawSoftKeys, UiFont, UiLayouts } from "./ui.js";
export const TICK_MS = 100;
export async function loadBrewUi(build       )                      {
  const art = new BrewArt(build, "app");
  const bytes = async (id        )                      => {
    const r = build.url("app", id);
    if (!r) throw new Error(`BREW resource ${id} is missing`);
    return new Uint8Array(await (await fetch(r.url)).arrayBuffer());
  };
  const font = async (sheet        , metrics        , gap         ) => {
    const m = parseFont(await bytes(metrics));
    if (gap !== undefined) m.gap = gap;
    const img = await art.image(sheet);
    if (!img) throw new Error(`font sheet ${sheet} is missing`);
    return new UiFont(m, img);
  };
  const [f1, f3, f2, strings, set10, set11] = await Promise.all([
    font(2, 3, 2), font(4, 5), font(6, 7), bytes(9).then(parseStrings), bytes(10).then(parseLayoutSet), bytes(11).then(parseLayoutSet),
  ]);
  return { f1, f2, f3, strings, set10, set11 };
}
export async function loadUiArt(art         )                {
  await Promise.all([art.load(12), ...Array.from({ length: 31 }, (_, i) => art.load(12 + i)), art.load(80), art.load(81), art.load(82)]);
}
export class BrewFrontend                     {
           phone       ;
                   build       ;
                   nsId        ;
                   data            ;
          story               = null;
          ctx                 = null;
          softUi                                             = null;
                   screens               = [];
          dialogue                        = null;
                   planner = new PlannerView();
          plannerDayIndex                = null;
                   shownIcons = new Map                                        ();
                   audio             ;
          timer = 0;
          last = 0;
          blinkMs = 0;
  onExit             = () => {};
          pausePage                    = null;
                   contexts           = [];
                   owner = new WeakMap                    ();
  constructor(phone       , build       , nsId        , data            , audio             ) {
    this.build = build;
    this.nsId = nsId;
    this.data = data;
    this.phone = phone;
    this.phone.onKey = (k, down) => {
      if (down) this.key(k);
    };
    this.audio = audio;
  }
  attach(story       )       {
    this.story = story;
  }
  async load()                {
    const art = new BrewArt(this.build, this.nsId);
    const { f1, f2, f3, strings, set10, set11 } = this.data;
    const ui = new UiLayouts(set10, art);
    await loadUiArt(art);
    this.softUi = { font: f2, colours: set11.colours };
    const story = () => this.story ;
    this.ctx = {
      art, ui, f1, f2, f3, strings, blink: false,
      minute: () => story().brew.minute,
      portrait: (e) => {
        const list = story().entities.array(e, 635);
        return list.length ? list : null;
      },
      prop: (e, p) => story().entities.getInt(e, p),
      random: (n) => (n > 0 ? Math.floor(Math.random() * n) : 0),
    };
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), TICK_MS)                     ;
  }
  dispose()       {
    clearInterval(this.timer);
    this.timer = 0;
  }
          tick()       {
    const now = performance.now();
    const dt = Math.max(0, Math.min(200, now - this.last));
    this.last = now;
    const c = this.ctx;
    if (!c) return;
    this.blinkMs += dt;
    if (this.blinkMs >= 200) {
      this.blinkMs %= 200;
      c.blink = !c.blink;
    }
    const top = this.screens[this.screens.length - 1];
    if (top) top.update(dt, c);
    else this.planner.update(dt);
    this.popClosed();
    this.draw();
  }
          draw()       {
    const c = this.ctx;
    if (!c) return;
    const g = this.phone.g;
    g.imageSmoothingEnabled = false;
    if (!(this.screens[0] instanceof DialogueScreen)) this.planner.draw(g, c, this.plannerDay());
    for (const s of this.screens) s.draw(g, c);
    const top = this.screens[this.screens.length - 1];
    const [l, r] = top ? top.softKeys(c) : [null, null];
    const label = (id               ) => (id === null ? null : (c.strings[id] ?? null));
    if (this.softUi) drawSoftKeys(g, this.softUi.font, this.softUi.colours, label(l), label(r), W, H);
    this.phone.setBackLabel(label(l) ?? "");
  }
          key(k          )       {
    const c = this.ctx;
    if (!c) return;
    const key           = k === "soft1" ? "clr" : k === "soft2" ? "select" : k;
    const top = this.screens[this.screens.length - 1];
    if (key === "clr" && !(top instanceof TextEntryScreen) && top !== this.pausePage) {
      this.pause();
      return;
    }
    if (!top) return;
    top.key(key, c);
    this.popClosed();
    this.draw();
  }
          popClosed()       {
    const top = this.screens[this.screens.length - 1];
    if (!top?.closed) return;
    this.screens.pop();
    if (top === this.dialogue) this.dialogue = this.topDialogue();
  }
          topDialogue()                        {
    for (let i = this.screens.length - 1; i >= 0; i--) {
      const s = this.screens[i];
      if (s instanceof DialogueScreen) return s;
    }
    return null;
  }
          pause()       {
    const c = this.ctx;
    if (!c || this.pausePage) return;
    const s = c.strings;
    const soundLabel = () => s[this.audio.muted ? 12 : 13] ?? "";
    const page             = new PageScreen(
      {
        style: 1, title: s[1] ?? "", items: [s[11] ?? "", soundLabel(), s[0] ?? ""], menu: true, soft: [S.resume, S.select],
        onClr: () => close(),
      },
      (i) => {
        if (i === 1) {
          this.audio.setMuted(!this.audio.muted);
          if (this.audio.muted) this.audio.stopMusic();
          this.pausePage = null;
          this.pause();
          return;
        }
        close();
        if (i === 2) this.onExit();
      },
    );
    const close = () => {
      page.closed = true;
      this.pausePage = null;
      this.draw();
    };
    this.pausePage = page;
    this.push(page, false);
  }
          push(s            , owned = true)       {
    if (owned) this.own(s);
    this.screens.push(s);
    this.draw();
  }
          own(s            )       {
    const ctx = this.contexts[this.contexts.length - 1];
    if (ctx !== undefined) this.owner.set(s, ctx);
  }
          endContext(ctx        )       {
    const i = this.contexts.lastIndexOf(ctx);
    if (i >= 0) this.contexts.splice(i, 1);
    for (let k = this.screens.length - 1; k >= 0; k--) {
      if (this.owner.get(this.screens[k]) === ctx) this.screens.splice(k, 1);
    }
    this.dialogue = this.topDialogue();
  }
          async preload(ids          )                {
    const c = this.ctx;
    if (c) await Promise.all(ids.map((id) => c.art.load(id)));
  }
          async preloadPortrait(entity        )                {
    const c = this.ctx;
    if (!c || entity < 0) return;
    await Promise.all(portraitArt(c.portrait(entity)).map(([id, pal]) => c.art.load(id, pal)));
  }
          openDialogue(reopen = false)                 {
    let d = this.topDialogue();
    if (!d) {
      d = new DialogueScreen();
      this.own(d);
      this.screens.unshift(d);
    }
    if (reopen) d.closed = false;
    this.dialogue = d;
    return d;
  }
          showIcons(d                , blink         )       {
    const c = this.ctx ;
    const now = relationshipIcons(c, d.speaker);
    const before = this.shownIcons.get(d.speaker);
    const changed = !!before && (before.art !== now.art || before.count !== now.count);
    d.setIcons(now, blink && changed ? before : null);
    if (d.speaker >= 0) this.shownIcons.set(d.speaker, now);
  }
          plannerDay()                    {
    const s = this.story;
    if (!s) return null;
    const cal = s.brew;
    const day = this.plannerDayIndex ?? cal.day;
    if (day < 0 || !cal.cfg) return null;
    const [month, date] = Cal.dateOf(cal, day);
    const rows = new Map                                        ();
    for (const r of Cal.plannerRows(cal, day)) rows.set(r.row, { name: s.entities.replaceNames(r.event.name), icon: r.event.icon });
    return {
      weekday: Cal.DAY_NAMES[Cal.weekday(cal, day)], month: Cal.MONTH_NAMES[month - 1] ?? "", date,
      dayStart: cal.cfg.dayStart, dayEnd: cal.cfg.dayEnd, rows,
    };
  }
  async brewPlanner(p                    )                {
    const c = this.ctx;
    if (!c) return;
    this.plannerDayIndex = p.day;
    await this.preload(this.planner.art(c, this.plannerDay()));
    if (p.intro !== undefined) {
      this.planner.minute = p.from;
      this.planner.target = p.from;
      await this.planner.showIntro(p.intro);
    } else {
      await this.planner.run(p.from, p.to);
    }
    this.plannerDayIndex = null;
  }
          nameOf(entity        )         {
    const s = this.story;
    if (!s || entity < 0) return "";
    return s.entities.replaceNames(s.entities.s.registeredNames[entity] ?? "");
  }
  async line(l      )                {
    const c = this.ctx ;
    if (l.kind === "titled") {
      await this.preload(new PageScreen({ style: 0, title: "", items: [], menu: false }, () => {}).art(c));
      await new Promise      ((resolve) => this.push(new PageScreen({ style: 0, title: l.title ?? "", items: [l.text], menu: false }, () => resolve())));
      return;
    }
    const d = this.openDialogue(true);
    if (l.kind === "sayAs") {
      d.speaker = l.speaker;
      d.expression = l.expression;
      d.name = this.nameOf(l.speaker);
      this.showIcons(d, true);
    }
    await Promise.all([this.preload(d.art(c)), this.preloadPortrait(d.speaker)]);
    const shown = d.say(l.text, c);
    this.draw();
    await shown;
  }
  async menu(m             )                  {
    const c = this.ctx ;
    const page = new PageScreen(
      { style: 1, title: m.title, items: m.options.map((o) => o.text), menu: true, timerMs: m.timerMs || undefined, spinMs: m.spinMs || undefined },
      () => {},
    );
    await this.preload(page.art(c));
    return new Promise        ((resolve) => {
      const p = new PageScreen(
        { style: 1, title: m.title, items: m.options.map((o) => o.text), menu: true, timerMs: m.timerMs || undefined, spinMs: m.spinMs || undefined },
        (i) => resolve(i),
      );
      p.start(c);
      this.push(p);
    });
  }
  async portraitSelect(p                       )                  {
    const c = this.ctx ;
    const items = p.portraits.map((_, i) => `${c.strings[50] ?? ""} ${i + 1}`);
    await Promise.all(p.portraits.map((e) => this.preloadPortrait(e)));
    const opts = { style: 2, title: p.title || (c.strings[51] ?? ""), items, menu: true, people: p.portraits };
    await this.preload(new PageScreen(opts, () => {}).art(c));
    return new Promise        ((resolve) => this.push(new PageScreen(opts, (i) => resolve(i))));
  }
  async textEntry(t                  )                  {
    const c = this.ctx ;
    await this.preload(new TextEntryScreen(t.title, () => {}).art(c));
    return new Promise        ((resolve) => {
      const s = new TextEntryScreen(t.title, resolve);
      s.onPause = () => this.pause();
      this.push(s);
    });
  }
  async minigame(g                 )                          {
    const c = this.ctx ;
    if (g.game !== "brew") return 0;
    const spec = readCatchSpec(g.call ?? 19, g.args, g.vm);
    await this.preload(CatchScreen.art(spec));
    const size = (id        ) => c.art.size(id) ?? { w: 0, h: 0 };
    const game = new CatchGame(spec, size(spec.sprite), spec.templates.map((t) => size(t.image)), (Math.random() * 0x7fffffff) | 0);
    return new Promise        ((resolve) => this.push(new CatchScreen(game, resolve)));
  }
  actionMenu(_m                   )         {
    return 0;
  }
  form(_f             )       {}
  chapter(_c                )       {}
  event(name        , data                         )       {
    const c = this.ctx;
    if (!c) return;
    const n = (k        ) => data[k]          ;
    switch (name) {
      case "location": {
        const d = new DialogueScreen();
        this.own(d);
        this.screens.push(d);
        this.dialogue = d;
        d.speaker = -1;
        d.name = "";
        d.sky = n("brewMode");
        d.location = n("location");
        void this.preload([d.location]);
        break;
      }
      case "speakerLocation": {
        const d = this.openDialogue();
        const speaker = n("speaker");
        if (speaker === -2) {
          d.speaker = -1;
          d.name = "";
        } else if (speaker !== -1) {
          d.speaker = speaker;
          d.name = this.nameOf(speaker);
          this.showIcons(d, false);
          void this.preloadPortrait(speaker);
        }
        if (n("brewMode") !== -1) d.sky = n("brewMode");
        if (n("location") !== -1) {
          d.location = n("location");
          void this.preload([d.location]);
        }
        if (n("expression") !== -1) d.expression = n("expression");
        break;
      }
      case "brewName": this.openDialogue().name = String(data.text ?? ""); break;
      case "brewIcons": {
        const d = this.openDialogue();
        d.icons = { art: n("art"), count: n("count") };
        break;
      }
      case "dialogClose": {
        const d = this.topDialogue();
        if (d) d.closed = true;
        break;
      }
      case "brewSheet": {
        const [first, count, image, desc] = data.args            ;
        c.art.table.register(first, count, image, desc);
        break;
      }
      case "scriptStart": this.contexts.push(n("context")); return;
      case "scriptEnd": this.endContext(n("context")); break;
      case "music": return this.audio.playMusic(n("id"), !!data.loop);
      case "sound": return this.audio.sound(n("id"));
      case "stopMusic": return this.audio.stopMusic();
    }
    this.draw();
  }
}
