import { ALIGN,              } from "./art.js";
import { outline,                             } from "./ui.js";
import { fitSize, PAGE_STYLES,               pageBox } from "../../data/brew-ui.js";
import {                                 FIELD } from "../../minigames/brew-catch.js";
export const W = 240;
export const H = 320;
export const S = { pause: 1, yes: 2, no: 3, exit: 8, resume: 11, select: 18, back: 19, done: 23, confirm: 27, clear: 28 }         ;
function portraitParts(expr        )                              {
  const face = expr === 2 ? [9, 6, 14] : expr === 3 ? [10, 7, 15] : expr === 4 ? [8, 5, 13] : [3, 4, 12];
  return [[0, 22, true], [17, 21, false], [1, 22, false], [11, -1, false], ...face.map((s)                            => [s, -1, false]),
    [16, 20, false], [18, -1, false], [19, -1, false]];
}
export function portraitArt(list                 )                     {
  if (!list || list[0] === undefined || list[0] === -1) return [];
  const out                     = [];
  for (const expr of [1, 2, 3, 4]) {
    for (const [slot, pal] of portraitParts(expr)) {
      const id = list[slot] ?? -1;
      if (id !== -1) out.push([id, pal >= 0 ? (list[pal] ?? -1) : -1]);
    }
  }
  return out;
}
export function drawPortrait(g                          , art         , list                 , expr        , cx        , cy        )       {
  if (!list || list[0] === undefined || list[0] === -1) return;
  for (const [slot, pal, base] of portraitParts(expr)) {
    const id = list[slot] ?? -1;
    if (id === -1) continue;
    const palette = pal >= 0 ? (list[pal] ?? -1) : -1;
    const h = art.hotspot(id);
    if (base && h.x === 0 && h.y === 0) art.draw(g, id, cx, cy, palette, ALIGN.hcenter | ALIGN.vcenter);
    else art.draw(g, id, cx, cy, palette);
  }
}
export function drawSky(g                          , mode        , minute        , x        , y        , w        , h        )       {
  const m = mode === -1 ? (minute > 1079 ? 1 : 0) : mode;
  const [top, bottom] = m === 1 ? [0x000000, 0x42a2f7] : m === 2 ? [0x34386c, 0xef7351] : [0x008aff, 0xffffff];
  const gh = Math.trunc((h * 2) / 3);
  const n = 10;
  let step = Math.trunc((gh << 8) / n);
  let pos = (y + gh) * 256;
  const lerp = (a        , b        , t        ) => ((a * t + b * (65536 - t)) >> 16) & 0xff;
  for (let i = 0; i < n; i++) {
    const t = Math.trunc((i << 16) / n);
    const r = lerp(top >> 16, bottom >> 16, t);
    const gg = lerp((top >> 8) & 0xff, (bottom >> 8) & 0xff, t);
    const b = lerp(top & 0xff, bottom & 0xff, t);
    g.fillStyle = `rgb(${r},${gg},${b})`;
    pos -= step;
    g.fillRect(x, pos >> 8, w, (step >> 8) + (i > 0 ? 1 : 0) + 1);
    if (i === n - 2) step = pos - y * 256;
  }
  g.fillStyle = `rgb(${bottom >> 16},${(bottom >> 8) & 0xff},${bottom & 0xff})`;
  g.fillRect(x, y + gh, w, h - gh);
}
const L_DIALOGUE = 5;
const L_NAMETAG = 1;
const TEXT = { x: 5, y: 141, w: 230, h: 170 };
const CHARS_PER_SECOND = 50;
export class DialogueScreen                       {
  closed = false;
  speaker = -1;
  expression = 1;
  name = "";
  sky = -1;
  location = -1;
  icons                                 = { art: 82, count: 0 };
          oldIcons                                        = null;
          iconsAnim = 0;
          text = "";
          firstLine = 0;
          typed = 0;
          pageDone = false;
          shown = false;
          totalLines = 0;
          onClose                      = null;
  say(text        , c         )                {
    this.text = text;
    this.firstLine = 0;
    this.typed = 0;
    this.pageDone = false;
    this.shown = false;
    this.totalLines = Math.floor((c.f1.wrappedHeight(text, TEXT.w) + 2) / 17);
    return new Promise((resolve) => {
      this.onClose = resolve;
    });
  }
  setIcons(icons                                , before                                       )       {
    this.icons = icons;
    this.oldIcons = before;
    this.iconsAnim = 0;
  }
  get waiting()          {
    return this.onClose !== null;
  }
  art(c         )           {
    const ids = [...c.ui.artIds(L_DIALOGUE), ...c.ui.artIds(L_NAMETAG), 80, 81, 82];
    if (this.location >= 0) ids.push(this.location);
    return ids;
  }
  update(dt        , c         )       {
    if (!this.onClose) return;
    if (!this.pageDone) {
      this.typed += dt;
      const chars = Math.floor((this.typed * CHARS_PER_SECOND) / 1000);
      const r = c.f1.draw(null, this.text, TEXT.x, TEXT.y, TEXT.w, 0, TEXT.h, this.firstLine, chars);
      if (!r.cut) this.pageDone = true;
    } else if (this.iconsAnim > 0) {
      this.iconsAnim = Math.max(0, this.iconsAnim - dt);
      if (this.iconsAnim === 0) this.oldIcons = null;
    }
  }
  key(k          , c         )       {
    if (k !== "select" || !this.onClose || !this.shown) return;
    const perPage = Math.floor(TEXT.h / 17);
    const more = this.firstLine + perPage < this.totalLines;
    if (!this.pageDone) {
      this.pageDone = true;
      return;
    }
    if (more) {
      this.firstLine += perPage;
      this.typed = 0;
      this.pageDone = false;
      return;
    }
    if (this.oldIcons && this.iconsAnim === 0) {
      this.iconsAnim = 2400;
      return;
    }
    if (this.iconsAnim > 0) return;
    this.oldIcons = null;
    const done = this.onClose;
    this.onClose = null;
    done();
    void c;
  }
  softKeys()                                 {
    return [S.pause, S.confirm];
  }
  draw(g                          , c         )       {
    drawSky(g, this.sky, c.minute(), 0, 0, W, 80);
    c.ui.slots.set(0, this.location);
    const parts = this.speaker >= 0 ? c.portrait(this.speaker) : null;
    const pink = parts?.[2] === 0;
    c.ui.draw(g, L_DIALOGUE, 0, 0, W, H, pink ? { frames: new Map([[4, 3]]), colours: new Map([[0, 0xffe78e8c]]) } : {});
    if (this.speaker >= 0) drawPortrait(g, c.art, parts, this.expression, 36, 80);
    const icons = this.iconsAnim > 1000 && this.oldIcons && !c.blink ? this.oldIcons : this.icons;
    if (this.speaker >= 1 && c.prop(this.speaker, 629) !== 1) {
      const s = c.art.size(icons.art);
      if (s) for (let i = 0; i < icons.count; i++) c.art.draw(g, icons.art, 76 + i * (s.w + 1), 80 - (s.h >> 1));
    }
    if (this.name) {
      const nameW = c.f3.width(this.name);
      const w = 120 + (Math.max(1, Math.ceil(nameW / 76)) - 1) * 76;
      c.ui.draw(g, L_NAMETAG, 76, 98, w, 32);
      c.f3.draw(g, this.name, 92, 98 + ((32 - c.f3.m.height) >> 1), 256);
    }
    if (this.onClose) {
      const chars = this.pageDone ? -1 : Math.floor((this.typed * CHARS_PER_SECOND) / 1000);
      c.f1.draw(g, this.text, TEXT.x, TEXT.y, TEXT.w, 0, TEXT.h, this.firstLine, chars);
      const perPage = Math.floor(TEXT.h / 17);
      if (this.pageDone && this.firstLine + perPage < this.totalLines) c.f1.draw(g, "...", 235 - 13, H - 2 - 15, 64);
      this.shown = true;
    }
  }
}
export function relationshipIcons(c         , speaker        )                                 {
  if (speaker < 1) return { art: 82, count: 0 };
  const v = c.prop(speaker, 407);
  if (v < 40) return { art: 81, count: v < 20 ? 3 : v < 30 ? 2 : 1 };
  const art = c.prop(0, 601) === speaker ? 80 : 82;
  return { art, count: v >= 76 ? 3 : v >= 66 ? 2 : 1 };
}
const L_PENCIL = 7;
const L2_STOPWATCH_FACE = 12;
export class PageScreen                       {
  closed = false;
                   o             ;
          selected = 0;
          scroll = 0;
          box                 = null;
          timerLeft = 0;
          spinLeft = 0;
          confirming = -1;
                   done                         ;
  constructor(o             , done                         ) {
    this.o = o;
    this.done = done;
    this.selected = o.selected ?? 0;
    this.timerLeft = o.timerMs ? o.timerMs - 1 : 0;
  }
  start(c         )       {
    if (this.o.spinMs) {
      this.selected = c.random(this.o.items.length);
      this.spinLeft = this.o.spinMs;
    }
  }
  art(c         )           {
    const st = PAGE_STYLES[this.o.style];
    return [...c.ui.artIds(st.layout), ...c.ui.artIds(L_PENCIL)];
  }
          layout(c         )          {
    if (!this.box) {
      const st = PAGE_STYLES[this.o.style];
      const fit = pageBox(c.ui.set, st, c.f1.m, this.o.title, this.o.items, this.o.menu ? {} : { itemPad: 5 });
      const f = this.o.box;
      if (f) {
        let body = c.ui.rect(st.layout, st.body, f.x, f.y, f.w, f.h);
        const scrolls = fit.contentH > Math.min(body.h, H - 9 - body.y);
        if (scrolls) body = c.ui.rect(st.layout, st.bodyArrows, f.x, f.y, f.w, f.h);
        body = { ...body, h: Math.min(body.h, H - 9 - body.y) };
        this.box = { ...f, body, scrolls, offsets: fit.offsets, contentH: fit.contentH };
      } else this.box = fit;
    }
    return this.box;
  }
  get index()         {
    return this.selected;
  }
  setItem(i        , text        )       {
    this.o.items[i] = text;
  }
  update(dt        , c         )       {
    if (this.closed) return;
    if (this.confirming >= 0) {
      this.confirming += dt;
      if (this.confirming >= 1200) this.finish(this.selected);
      return;
    }
    if (this.o.spinMs && this.o.items.length > 1) {
      this.spinLeft -= dt;
      while (this.spinLeft <= 0) {
        let next = c.random(this.o.items.length - 1);
        if (next >= this.selected) next++;
        this.selected = next;
        this.spinLeft += this.o.spinMs;
      }
    }
    if (this.o.timerMs) {
      this.timerLeft -= dt;
      if (this.timerLeft <= 0) {
        this.timerLeft = 0;
        this.pick();
      }
    }
  }
          pick()       {
    if (!this.o.menu) return this.finish(0);
    if (this.o.spinMs || this.o.timerMs) {
      if (this.confirming < 0) this.confirming = 0;
      return;
    }
    this.finish(this.selected);
  }
          finish(i        )       {
    if (this.closed) return;
    this.closed = true;
    this.done(i);
  }
  key(k          , c         )       {
    if (this.closed || this.confirming >= 0) return;
    const b = this.layout(c);
    if (k === "clr" && this.o.onClr) return this.o.onClr();
    if (k === "select") return this.pick();
    if (k !== "up" && k !== "down") return;
    if (!this.o.menu) {
      const max = Math.max(0, b.contentH - b.body.h);
      this.scroll = Math.max(0, Math.min(max, this.scroll + (k === "down" ? 17 : -17)));
      return;
    }
    if (this.o.spinMs) return;
    const n = this.o.items.length;
    this.selected = (this.selected + (k === "down" ? 1 : n - 1)) % n;
    const top = b.offsets[this.selected];
    const bottom = top + (b.offsets[this.selected + 1] ?? b.contentH + 2) - 2 - top;
    while (top < this.scroll) this.scroll = Math.max(0, this.scroll - 17);
    while (top + (bottom - top) > this.scroll + b.body.h) this.scroll += 17;
  }
  softKeys()                                 {
    return this.o.soft ?? (this.o.menu ? [S.pause, S.select] : [S.pause, S.confirm]);
  }
  draw(g                          , c         )       {
    const st = PAGE_STYLES[this.o.style];
    const b = this.layout(c);
    const show = new Set        ();
    const hide = new Set        ([st.up, st.down]);
    const more = b.scrolls && this.scroll + b.body.h < b.contentH;
    if (more) { hide.delete(st.down); show.add(st.down); }
    if (b.scrolls && this.scroll > 0) { hide.delete(st.up); show.add(st.up); }
    c.ui.draw(g, st.layout, b.x, b.y, b.w, b.h, { show, hide });
    const tr = c.ui.rect(st.layout, st.title, b.x, b.y, b.w, b.h);
    const th = c.f1.wrappedHeight(this.o.title, tr.w);
    c.f1.draw(g, this.o.title, tr.x, th > tr.h ? b.y + 1 : tr.y + ((tr.h - th) >> 1), tr.w, 2);
    g.save();
    g.beginPath();
    g.rect(b.body.x, b.body.y, b.body.w, b.body.h);
    g.clip();
    this.o.items.forEach((item, i) => {
      if (this.o.menu && this.confirming >= 0 && i === this.selected && c.blink) return;
      const y = b.body.y + b.offsets[i] - this.scroll;
      c.f1.draw(g, item, b.body.x + 5, y, b.body.w - 5);
      if (this.o.menu && this.o.style === 1) {
        const cy = y + 7;
        g.fillStyle = "#000";
        g.fillRect(b.body.x, cy - 1, 3, 3);
        g.fillStyle = "#fff";
        g.fillRect(b.body.x + 1, cy, 1, 1);
      }
    });
    g.restore();
    if (this.o.menu && !this.o.noPencil) {
      const cy = b.body.y + b.offsets[this.selected] - this.scroll + 7;
      if (cy >= b.body.y && cy <= b.body.y + b.body.h) c.ui.draw(g, L_PENCIL, 0, cy - 13, b.body.x - 2, 26);
    }
    if (this.o.timerMs && this.o.style === 1) {
      const face = c.ui.rect(st.layout, L2_STOPWATCH_FACE, b.x, b.y, b.w, b.h);
      const digit = String(Math.floor((this.timerLeft * 10) / this.o.timerMs));
      c.f1.draw(g, digit, face.x, face.y + ((face.h - c.f1.m.height) >> 1), face.w, 2);
    }
    if (this.o.people) {
      const slot = c.ui.rect(st.layout, 13, b.x, b.y, b.w, b.h);
      drawPortrait(g, c.art, c.portrait(this.o.people[this.selected]), 1, slot.x + (slot.w >> 1), slot.y + (slot.h >> 1) - 3);
    }
  }
}
const L_ENTRY = 12;
const CELL = 18;
const MAX_NAME = 10;
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
export class TextEntryScreen                       {
  closed = false;
          text = "";
          index = 0;
          state                = 0;
                   title        ;
                   done                        ;
                   rows = 3;
                   cols = 9;
  onPause             = () => {};
  constructor(title        , done                        ) {
    this.title = title;
    this.done = done;
  }
  art(c         )           {
    return [...c.ui.artIds(L_ENTRY)];
  }
          box(c         )                                                 {
    const set = c.ui.set;
    let w = fitSize(set, L_ENTRY, 11, this.cols * CELL, "w");
    const h = fitSize(set, L_ENTRY, 11, this.rows * 17 - 2, "h");
    const tw = c.f1.width(this.title);
    if (tw > c.ui.rect(L_ENTRY, 12, 0, 0, w, h).w) w = fitSize(set, L_ENTRY, 12, tw, "w");
    w = Math.min(w, W);
    return { x: Math.trunc((W - w) / 2), y: Math.trunc((H - h) / 2), w, h };
  }
          letterAt(r        , col        )         {
    const i = r * this.cols + col;
    return i < LETTERS.length ? i : -1;
  }
  update()       {}
  key(k          )       {
    if (this.closed) return;
    if (this.state === 3) {
      if (k === "select" || k === "clr") this.state = 2;
      return;
    }
    const row = Math.floor(this.index / this.cols);
    const col = this.index % this.cols;
    switch (k) {
      case "clr":
        if (this.text) this.text = this.text.slice(0, -1);
        else this.onPause();
        return;
      case "select":
        if (this.state === 1) this.text = this.text.slice(0, -1);
        else if (this.state === 2) {
          if (this.text) {
            this.closed = true;
            this.done(this.text);
          } else this.state = 3;
        } else {
          const ch = LETTERS[this.index];
          this.text += this.text ? ch : ch.toUpperCase();
          if (this.text.length >= MAX_NAME) this.state = 2;
        }
        return;
      case "left": case "right": {
        if (this.state !== 0) {
          this.state = this.state === 1 ? 2 : 1;
          return;
        }
        const n = row === this.rows - 1 ? LETTERS.length - row * this.cols : this.cols;
        this.index = row * this.cols + ((col + (k === "right" ? 1 : n - 1)) % n);
        return;
      }
      case "down":
        if (this.state !== 0) return;
        if (row === this.rows - 1) {
          this.state = col < this.cols / 2 ? 1 : 2;
          return;
        }
        this.index = this.letterAt(row + 1, col) >= 0 ? this.index + this.cols : LETTERS.length - 1;
        return;
      case "up":
        if (this.state !== 0) {
          if (this.text.length < MAX_NAME) {
            this.index = this.state === 1 ? 18 + 2 : 18 + 6;
            this.state = 0;
          }
          return;
        }
        if (row > 0) this.index -= this.cols;
        return;
    }
  }
  softKeys()                                 {
    if (this.state === 3) return [S.pause, S.confirm];
    return [this.text ? S.clear : S.pause, S.select];
  }
  draw(g                          , c         )       {
    const b = this.box(c);
    const r = (i        ) => c.ui.rect(L_ENTRY, i, b.x, b.y, b.w, b.h);
    if (this.state === 3) {
      c.ui.draw(g, L_ENTRY, b.x, b.y, b.w, b.h, { hide: new Set([11, 13, 14, 15]) });
      const t = r(12);
      c.f1.draw(g, "Error", t.x, t.y, t.w, 2);
      const m = r(16);
      c.f1.draw(g, "No text entered.", m.x, m.y, m.w, 2, m.h);
      return;
    }
    c.ui.draw(g, L_ENTRY, b.x, b.y, b.w, b.h);
    const t = r(12);
    c.f1.draw(g, this.title, t.x, t.y, t.w, 2);
    const typed = r(15);
    c.f1.draw(g, this.text, typed.x, typed.y, typed.w, 2);
    const grid = r(11);
    const glyphW = (ch        ) => c.f1.width(ch);
    let rowW = 0;
    for (let row = 0; row < this.rows; row++) {
      const n = Math.min(this.cols, LETTERS.length - row * this.cols);
      rowW = Math.max(rowW, (n - 1) * CELL + glyphW(LETTERS[row * this.cols + n - 1]));
    }
    const x0 = grid.x + ((grid.w - rowW) >> 1);
    for (let i = 0; i < LETTERS.length; i++) {
      const row = Math.floor(i / this.cols);
      const col = i % this.cols;
      const gw = glyphW(LETTERS[i]);
      const x = x0 + col * CELL + ((CELL - gw) >> 1);
      const y = grid.y + row * 17;
      if (this.state === 0 && i === this.index) {
        g.fillStyle = "#fff";
        g.fillRect(x - 1, y, gw + 2, 15);
      }
      c.f1.draw(g, LETTERS[i], x, y, 64);
    }
    for (const [state, idx, label] of [[1, 13, "Del"], [2, 14, "Done"]]         ) {
      const br = r(idx);
      const tw = c.f1.width(label);
      const x = br.x + ((br.w - tw) >> 1);
      const y = br.y + ((br.h - c.f1.m.height) >> 1);
      if (this.state === state) {
        g.fillStyle = "#fff";
        g.fillRect(x - 1, y - 1, tw + 2, 17);
      }
      c.f1.draw(g, label, x, y, 128);
    }
  }
}
const L_PLANNER = 8;
const L_ROW = 9;
const L_TAB = 10;
const ROW_H = 60;
const ROWS = 5;
export function clockLabel(minute        )         {
  const h24 = Math.floor(minute / 60);
  const h = h24 > 12 ? h24 - 12 : h24;
  const pad = (n        ) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(minute % 60)} ${h24 < 12 ? "AM" : "PM"}`;
}
export class PlannerView {
  minute = 450;
  target = 450;
  intro = -1;
  introCaption = "";
          onDone                      = null;
  run(from        , to        )                {
    if (from > this.minute || from < this.minute - 90) this.minute = from;
    this.target = to;
    return new Promise((resolve) => {
      this.onDone = resolve;
    });
  }
  showIntro(caption        )                {
    this.intro = 0;
    this.introCaption = caption;
    return new Promise((resolve) => {
      this.onDone = resolve;
    });
  }
  update(dt        )       {
    if (this.intro >= 0) {
      this.intro += dt;
      if (this.intro >= 2000) {
        this.intro = -1;
        this.finish();
      }
      return;
    }
    if (this.minute < this.target) {
      this.minute = Math.min(this.target, this.minute + Math.max(1, Math.trunc((dt * 90) / 1024)));
    }
    if (this.minute >= this.target) this.finish();
  }
          finish()       {
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }
  art(c         , day                   )           {
    const ids = [...c.ui.artIds(L_PLANNER), ...c.ui.artIds(L_ROW), ...c.ui.artIds(L_TAB), 16];
    for (const r of day?.rows.values() ?? []) if (r.icon !== -1) ids.push(r.icon);
    return ids;
  }
  draw(g                          , c         , day                   )       {
    c.ui.draw(g, L_PLANNER, 0, 0, W, H);
    const header = c.ui.rect(L_PLANNER, 3, 0, 0, W, H);
    if (day) {
      const title = `${day.weekday}, ${day.month} ${day.date}`;
      c.f1.draw(g, title, header.x, header.y + ((header.h - c.f1.m.height) >> 1), header.w, 2);
    }
    const area = c.ui.rect(L_PLANNER, 2, 0, 0, W, H);
    const clock = Math.floor(this.minute);
    const current = Math.floor(clock / 90);
    let first = current - (ROWS >> 1) + (ROWS % 2 === 0 ? 1 : 0);
    first = Math.max(Math.floor((day?.dayStart ?? 0) / 90), first);
    let shift = 0;
    const last = Math.floor((day?.dayEnd ?? 1440) / 90);
    if (last < ROWS + first) {
      first = last - ROWS;
      shift = ROW_H * ROWS - area.h;
    }
    g.save();
    g.beginPath();
    g.rect(area.x, area.y, area.w, area.h);
    g.clip();
    const tabW = c.f1.width("12:00 PM") + 11;
    let y = area.y - shift;
    for (let i = 0; i < ROWS; i++, y += ROW_H) {
      const row = first + i;
      const start = row * 90;
      g.fillStyle = row % 2 ? "#afb6f0" : "#7e8be5";
      g.fillRect(area.x, y, area.w, ROW_H);
      if (start < clock) {
        const w = clock < start + 89 ? Math.trunc(((clock - start) * area.w) / 90) : area.w;
        g.fillStyle = "#000";
        g.fillRect(area.x, y, Math.min(30, w), ROW_H);
        c.ui.tile(g, 16, area.x, y, w, ROW_H);
      }
      c.ui.draw(g, L_ROW, area.x, y, area.w, ROW_H);
      const ev = day?.rows.get(row);
      if (ev && ev.icon !== -1) {
        const at = c.ui.rect(L_ROW, 8, area.x, y, area.w, ROW_H);
        const s = c.art.size(ev.icon);
        if (s) c.art.draw(g, ev.icon, at.x - (s.w >> 1), at.y - (s.h >> 1));
      }
      const tabAt = c.ui.rect(L_ROW, 6, area.x, y, area.w, ROW_H);
      c.ui.draw(g, L_TAB, tabAt.x, tabAt.y, tabW, 28);
      const label = c.ui.rect(L_TAB, 1, tabAt.x, tabAt.y, tabW, 28);
      c.f1.draw(g, clockLabel(start), tabAt.x + 2, ((label.h - c.f1.m.height) >> 1) + label.y + 1, 256);
      if (ev?.name) {
        const nameAt = c.ui.rect(L_ROW, 7, area.x, y, area.w, ROW_H);
        const x = tabAt.x + 2;
        const w = nameAt.x + nameAt.w - x;
        const gap = c.f1.m.gap;
        c.f1.m.gap = 0;
        const th = c.f1.wrappedHeight(ev.name, w);
        const bottom = y + ROW_H;
        const tabBottom = tabAt.y + 28;
        c.f1.draw(g, ev.name, x, bottom - ((bottom - tabBottom) + th) / 2, w, 1);
        c.f1.m.gap = gap;
      }
      if (this.intro >= 0 && row === current) {
        if (this.intro < 1001) {
          if (c.blink) {
            g.fillStyle = "#ff0";
            outline(g, area.x, y, area.w, ROW_H);
          }
        } else if (this.introCaption !== "none") {
          const text = this.introCaption || (c.strings[56] ?? "");
          if (text) {
            const tw = c.f1.width(text);
            const bx = (W - tw) >> 1;
            const by = y + (ROW_H >> 1) - (c.f1.m.height >> 1);
            g.fillStyle = "#fff";
            g.fillRect(bx - 1, by - 1, tw + 2, c.f1.m.height + 2);
            c.f1.draw(g, text, bx, by, 256);
            g.fillStyle = "#000";
            outline(g, bx - 2, by - 2, tw + 4, c.f1.m.height + 4);
          }
        }
      }
    }
    g.restore();
  }
}
export class CatchScreen                       {
  closed = false;
           game           ;
                   done                         ;
  constructor(game           , done                         ) {
    this.game = game;
    this.done = done;
  }
  static art(spec           )           {
    return [spec.sprite, ...spec.templates.map((t) => t.image), 32, 33, 34, 35, 39, 40, 41].filter((id) => id > 0);
  }
  update(dt        )       {
    if (this.closed) return;
    this.game.update(dt);
    if (this.game.done) {
      this.closed = true;
      this.done(this.game.result);
    }
  }
  key(k          )       {
    if (k === "select") this.game.reverse();
  }
  softKeys()                                 {
    return [S.pause, S.confirm];
  }
  draw(g                          , c         )       {
    const game = this.game;
    const { x: x0, y: y0, w: FW, h: FH } = FIELD;
    g.fillStyle = "#ffebd3";
    g.fillRect(1, 29, 238, 290);
    g.fillStyle = "#7595ae";
    g.fillRect(x0 - 1, y0 - 1, FW + 2, 1);
    g.fillRect(x0 - 1, y0 - 1, 1, FH + 2);
    g.fillStyle = "#c3ccce";
    g.fillRect(x0 - 1, y0 + FH, FW + 2, 1);
    g.fillRect(x0 + FW, y0 - 1, 1, FH + 2);
    g.save();
    g.beginPath();
    g.rect(x0, y0, FW, FH);
    g.clip();
    g.fillStyle = "#4444ff";
    g.fillRect(x0, y0, FW, FH);
    g.fillStyle = "#fff";
    if (game.spec.mode === 1) g.fillRect(x0, y0 + (game.py >> 8) + (game.ph >> 1) - 1, FW, 2);
    else if (game.spec.mode === 2) g.fillRect(x0 + (FW >> 1) - 1, y0, 2, FH);
    g.restore();
    c.art.draw(g, 34, 1, 29);
    c.art.draw(g, 35, 1 + 238 - 12, 29);
    c.art.draw(g, 32, 1, 29 + 290 - 12);
    c.art.draw(g, 33, 1 + 238 - 12, 29 + 290 - 12);
    g.save();
    g.beginPath();
    g.rect(x0, y0, FW, FH);
    g.clip();
    if (game.spec.sprite > 0) c.art.draw(g, game.spec.sprite, x0 + (game.px >> 8), y0 + (game.py >> 8));
    for (const o of game.objects) {
      const img = game.spec.templates[o.t]?.image ?? 0;
      if (img > 0) c.art.draw(g, img, x0 + (o.x >> 8), y0 + (o.y >> 8));
    }
    g.restore();
    const hx = x0 + ((FW - 168) >> 1);
    const capW = c.art.size(41)?.w ?? 8;
    c.ui.tile(g, 40, hx + 20, y0 - 28, 148 - capW, 28);
    c.art.draw(g, 41, hx + 168 - capW, y0 - 28);
    if (game.score > 0) {
      g.fillStyle = "#ff0";
      g.fillRect(hx + 24, y0 - 28 + 3, Math.max(1, Math.trunc((game.score * (149 - capW)) / Math.max(1, game.spec.target))), 21);
    }
    c.art.draw(g, 39, hx, y0 - 34);
    const digit = String(game.digit);
    const tw = c.f1.width(digit);
    c.f1.draw(g, digit, hx + ((28 - tw) >> 1), y0 - ((34 + c.f1.m.height) >> 1), 64);
    if (game.over) {
      const caption = c.strings[game.score >= game.spec.target ? 59 : 58] ?? "";
      const cw = c.f1.width(caption);
      c.f1.draw(g, caption, (W - cw) >> 1, (H - c.f1.m.height) >> 1, W);
    }
  }
}
