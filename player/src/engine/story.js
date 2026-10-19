import { cp1252 } from "../../../extractor/src/bytes.js";
import { BUFFER_BASE, BUFFER_COUNT, KiwiVM, loadProgram,                 } from "../vm/kiwi.js";
import * as Cal from "./brew-calendar.js";
import { Entities,                  } from "./entities.js";
export const ENTRY_SCRIPT = 25001;
export class StepLimit extends Error {}
export function titleCase(s        )         {
  let out = "";
  let start = true;
  for (const ch of s) {
    let c = ch.charCodeAt(0);
    if (ch === " ") {
      start = true;
      out += ch;
      continue;
    }
    if (start && ((c >= 0x61 && c <= 0x7a) || (c >= 0xe0 && c <= 0xfc))) c -= 0x20;
    else if (!start && ((c >= 0x41 && c <= 0x5a) || (c >= 0xc0 && c <= 0xdc))) c += 0x20;
    out += String.fromCharCode(c);
    start = false;
  }
  return out;
}
const char = (v        )         => cp1252(Uint8Array.of(v & 0xff));
function isPromise   (v                )                  {
  return typeof (v                      )?.then === "function";
}
export function rng(seed        )               {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const WAITING_SYSCALLS = new Set([13, 65, 15, 76, 1, 4, 71, 94, 96, 33, 8, 17, 40, 78]);
export const DECISION_SYSCALLS = new Set([1, 4, 71, 94, 96, 17, 40, 78]);
export const BREW_WAITING_SYSCALLS = new Set([72, 12, 74, 29]);
export const SAVE_VERSION = 1;
const HISTORY_LIMIT = 300;
export class Story {
           vm = new KiwiVM();
           entities          ;
           front          ;
           loadScript              ;
           loadStrings                     ;
           dialect         ;
          table                  = null;
  brew                        = Cal.newCalendar();
          brewSheets             = [];
          brewText                = null;
          brewSpin = 0;
          brewSpinSection = 0;
  random              ;
  queue                                   = [];
  current = -1;
          program                                        = null;
          brewIntro = false;
          context = 0;
  ended = false;
  primarySpeaker = -1;
  eventSpeaker = -1;
  registers = new Int16Array(16);
  formText = "";
  engineField = 0;
  minigameScores                   = [0, 0];
          textMenu                  = null;
          staging                           = {};
  history                 = [];
  onCheckpoint                                                         = null;
  maxSteps = Infinity;
           scriptsRun           = [];
           stats = new Map                     ();
           warnings           = [];
  constructor(
    loadScript              , front          ,
    opts                                                                                            = {},
  ) {
    this.loadScript = loadScript;
    this.loadStrings = opts.strings ?? null;
    this.front = front;
    this.entities = opts.entities ?? new Entities();
    this.random = opts.random ?? Math.random;
    this.dialect = opts.dialect ?? "hd";
  }
  warn(msg        )       {
    if (this.warnings.length < 500) this.warnings.push(`script ${this.current}: ${msg}`);
  }
  async run(entry = ENTRY_SCRIPT, from                )                    {
    let next                                                            = { id: entry, noGui: false };
    if (from) {
      this.brewIntro = true;
      await this.inContext(async () => {
        await this.restore(from);
        await this.runScript(true);
      });
      if (this.ended) return "ended";
      next = this.queue.pop() ?? (await this.nextBrewEvent());
    }
    while (next) {
      const json = await this.loadScript(next.id);
      if (!json) throw new Error(`script ${next.id} not found`);
      this.current = next.id;
      this.scriptsRun.push(next.id);
      this.program = loadProgram(json);
      this.vm.load(this.program);
      this.table = this.loadStrings ? await this.loadStrings(next.id) : null;
      this.formText = next.text ?? "";
      this.front.event("script", { id: next.id, noGui: next.noGui });
      await this.inContext(() => this.runScript());
      if (this.ended) return "ended";
      next = this.queue.pop() ?? (await this.nextBrewEvent());
    }
    return "finished";
  }
          async nextBrewEvent()                                                                     {
    if (this.dialect !== "brew") return undefined;
    Cal.finish(this.brew);
    for (let guard = 0; guard < 100_000; guard++) {
      const st = Cal.step(this.brew);
      if (st.kind === "over") return undefined;
      if (st.kind === "advance") {
        const r = this.front.brewPlanner?.({ day: st.day, from: st.from, to: st.to });
        if (isPromise(r)) await r;
        continue;
      }
      const e = st.event;
      if (!this.brewIntro) {
        this.brewIntro = true;
        const req                     = { day: this.brew.day, from: this.brew.minute, to: this.brew.minute, intro: e.caption };
        const r = this.front.brewPlanner?.(req);
        if (isPromise(r)) await r;
      }
      this.useEventFields(e);
      const [month, date] = Cal.dateOf(this.brew, this.brew.day);
      this.front.event("calendarEvent", { id: e.id, script: e.script, month, date, minute: e.minute });
      return { id: e.script, noGui: false, text: e.param };
    }
    return undefined;
  }
          async inContext(run                     )                {
    const context = ++this.context;
    this.front.event("scriptStart", { context });
    await run();
    this.front.event("scriptEnd", { context });
  }
          useEventFields(e               )       {
    this.registers.fill(0);
    e.fields.forEach((v, i) => {
      if (i < this.registers.length) this.registers[i] = v;
    });
  }
          async runNested()                {
    const saved = {
      program: this.program, vm: this.vm.saveState(), current: this.current, table: this.table,
      registers: [...this.registers], formText: this.formText,
    };
    while (this.brew.nested.length && !this.ended) {
      const e = Cal.event(this.brew, this.brew.nested.shift() );
      const json = e ? await this.loadScript(e.script) : null;
      if (!e || !json) continue;
      this.current = e.script;
      this.scriptsRun.push(e.script);
      this.program = loadProgram(json);
      this.vm.load(this.program);
      this.table = this.loadStrings ? await this.loadStrings(e.script) : null;
      this.formText = e.param;
      this.useEventFields(e);
      this.front.event("script", { id: e.script, noGui: false });
      await this.inContext(() => this.runScript());
    }
    if (this.ended || !saved.program) return;
    this.program = saved.program;
    this.vm.load(saved.program);
    this.vm.restoreState(saved.vm);
    this.current = saved.current;
    this.table = saved.table;
    this.registers.set(saved.registers);
    this.formText = saved.formText;
    this.front.event("script", { id: this.current, noGui: false });
  }
          async runScript(resuming = false)                {
    const vm = this.vm;
    for (;;) {
      const st = resuming ? "native" : vm.run(100_000);
      resuming = false;
      if (st === "halted") {
        if (this.dialect === "brew" && this.brew.nested.length) await this.runNested();
        return;
      }
      if (vm.steps > this.maxSteps) throw new StepLimit(`step limit ${this.maxSteps} reached in script ${this.current}`);
      if (st !== "native") continue;
      const waiting = this.dialect === "brew" ? BREW_WAITING_SYSCALLS : WAITING_SYSCALLS;
      if (this.dialect === "brew" && waiting.has(vm.m) && this.brew.nested.length) {
        await this.runNested();
        if (this.ended) return;
      }
      if (this.onCheckpoint && waiting.has(vm.m)) this.onCheckpoint(this.snapshot(), this.atDecision(vm.m));
      const r = this.syscall(vm.m);
      vm.finishNative(isPromise(r) ? await r : r);
      if (this.ended) return;
    }
  }
          atDecision(m        )          {
    if (this.dialect === "brew") return m === 29 || (m === 74 && this.textMenu !== null);
    return DECISION_SYSCALLS.has(m);
  }
  snapshot()                {
    if (this.vm.state !== "native") throw new Error("the story can only be saved at a native call");
    const copy =    (v   )    => JSON.parse(JSON.stringify(v))     ;
    return {
      version: SAVE_VERSION, script: this.current, queue: copy(this.queue),
      primarySpeaker: this.primarySpeaker, eventSpeaker: this.eventSpeaker, registers: [...this.registers],
      formText: this.formText, engineField: this.engineField, textMenu: copy(this.textMenu),
      entities: copy(this.entities.s), vm: this.vm.saveState(), staging: copy(this.staging), history: copy(this.history),
      ...(this.dialect === "brew" ? { brew: copy(this.brew), brewSheets: copy(this.brewSheets) } : {}),
    };
  }
          async restore(s               )                {
    if (s.version !== SAVE_VERSION) throw new Error(`save version ${s.version}, expected ${SAVE_VERSION}`);
    const json = await this.loadScript(s.script);
    if (!json) throw new Error(`script ${s.script} not found`);
    this.current = s.script;
    this.scriptsRun.push(s.script);
    this.program = loadProgram(json);
    this.vm.load(this.program);
    this.vm.restoreState(s.vm);
    this.table = this.loadStrings ? await this.loadStrings(s.script) : null;
    this.queue = s.queue.map((q) => ({ ...q }));
    this.primarySpeaker = s.primarySpeaker;
    this.eventSpeaker = s.eventSpeaker;
    this.registers.set(s.registers);
    this.formText = s.formText;
    this.engineField = s.engineField;
    this.textMenu = s.textMenu;
    this.entities.s = JSON.parse(JSON.stringify(s.entities))               ;
    this.history = s.history.slice();
    if (s.brew) this.brew = JSON.parse(JSON.stringify(s.brew))                         ;
    this.brewSheets = (s.brewSheets ?? []).map((a) => a.slice());
    for (const args of this.brewSheets) this.front.event("brewSheet", { args });
    this.ended = false;
    this.front.event("script", { id: s.script, noGui: false });
    this.front.event("primarySpeaker", { entity: this.primarySpeaker });
    this.front.event("eventSpeaker", { entity: this.eventSpeaker });
    for (const key of ["location", "pan", "caption", "music", "musicPaused"]) {
      const e = s.staging[key];
      if (e) this.ev(e.name, e.data);
    }
  }
          stage(name        , data                         )       {
    const st = this.staging;
    switch (name) {
      case "location": case "speakerLocation":
        if ((data.location          ) >= 0) st.location = { name, data: { ...data, wipe: false } };
        break;
      case "locationPan": st.pan = { name, data }; break;
      case "scheduleCaption": st.caption = { name, data }; break;
      case "music":
        if (data.loop) {
          st.music = { name, data };
          delete st.musicPaused;
        }
        break;
      case "stopMusic": delete st.music; delete st.musicPaused; break;
      case "pauseMusic": st.musicPaused = { name, data }; break;
      case "resumeMusic": delete st.musicPaused; break;
    }
  }
          remember(e              )       {
    this.history.push(e);
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
  }
          A(i        )         {
    return this.vm.arg(i);
  }
          str(i        )         {
    return this.stringValue(this.A(i));
  }
          memStr(i        )         {
    return this.vm.stringAt(this.A(i));
  }
  stringValue(v        )         {
    if (v >= BUFFER_BASE || v === -1 || !this.table) return this.vm.stringAt(v);
    const s = this.table[v];
    if (s === undefined) {
      this.warn(`string index ${v} outside the table (${this.table.length})`);
      return "";
    }
    return s;
  }
          strN(i        )         {
    return this.entities.replaceNames(this.str(i));
  }
          entityName(e        )         {
    return this.entities.s.registeredNames[e] ?? "";
  }
  speakerName(e        )         {
    return e < 0 ? "" : this.entities.replaceNames(this.entityName(e));
  }
  portrait(e        , expression        , exists                         )                {
    const base = this.entities.s.portraits[e];
    if (!base || base <= 0) return null;
    const id = base + (((expression % 5) + 5) % 5);
    return exists(id) ? id : base;
  }
          setBuffer(slot        , s        )         {
    if (slot < 0 || slot >= BUFFER_COUNT) {
      this.warn(`string buffer ${slot} out of range`);
      return BUFFER_BASE;
    }
    this.vm.buffers[slot] = s;
    return BUFFER_BASE + slot;
  }
          writeString(addr        , s        )       {
    if (addr >= BUFFER_BASE) this.vm.buffers[addr - BUFFER_BASE] = s;
    else this.vm.writeString(addr, s);
  }
          format(fmtArg        , full         , fmtInMemory = false)         {
    const fmt = fmtInMemory ? this.memStr(fmtArg) : this.str(fmtArg);
    const n = fmt.length;
    if (n === 0) return "";
    let k = fmtArg + 1;
    let out = "";
    let last = true;
    for (let i = 0; i < n - 1; i++) {
      const c = fmt[i];
      if (c !== "%") {
        out += c;
        last = true;
        continue;
      }
      const d = fmt[i + 1];
      last = i !== n - 2;
      if (d === "s") {
        out += this.str(k++);
        i++;
      } else if (d === "d" || (full && d === "c")) {
        const v = this.A(k++);
        out += d === "c" ? char(v) : String(v);
        i++;
      } else if (full) {
        out += c;
        last = true;
      }
    }
    if (last) out += fmt[n - 1];
    return out;
  }
          count(id        )       {
    let s = this.stats.get(id);
    if (!s) this.stats.set(id, (s = { calls: 0, argc: {} }));
    s.calls++;
    s.argc[this.vm.argc] = (s.argc[this.vm.argc] ?? 0) + 1;
  }
          args(n        )           {
    const out           = [];
    for (let i = 0; i < Math.min(n, this.vm.argc); i++) out.push(this.A(i));
    return out;
  }
          ev(name        , data                          = {})            {
    this.stage(name, data);
    this.front.event(name, data);
    return undefined;
  }
  syscall(id        )                           {
    this.count(id);
    if (this.dialect === "brew") return this.brewSyscall(id);
    const A = (i        ) => this.A(i);
    const E = this.entities;
    switch (id) {
      case 13: {
        const a0 = A(0);
        const ti = a0 < 0 ? 1 : 0;
        const style = a0 === -2 ? "thought" : a0 === -3 ? "backtick" : "plain";
        let text = E.replaceNames(this.str(ti));
        if (style === "thought") text = `(${text})`;
        else if (style === "backtick") text = `\`${text}\``;
        const speaker = A(ti + 1);
        let expression = E.s.expressions[speaker] ?? 0;
        if (this.vm.argc >= ti + 3 && A(ti + 2) !== -1) expression = A(ti + 2);
        return this.line({ kind: "say", style, title: null, text, speaker, expression });
      }
      case 65:
        return this.line({ kind: "sayAs", style: "plain", title: null, text: this.strN(1), speaker: A(0), expression: A(2) });
      case 15: {
        const ti = A(0) < 0 ? 1 : 0;
        return this.line({ kind: "titled", style: "plain", title: this.strN(ti), text: this.strN(ti + 1), speaker: -1, expression: 0 });
      }
      case 76:
        return this.line({ kind: "titled", style: "plain", title: this.strN(0), text: this.strN(1), speaker: -1, expression: 0 });
      case 88: return this.ev("topText", { text: this.strN(0) });
      case 90: return this.ev("scheduleCaption", { n: A(0), text: A(1) === -1 ? "" : this.strN(1) });
      case 10:
        this.queue.push({ id: A(0), noGui: A(1) !== 0 });
        return undefined;
      case 7: case 63:
        this.ended = true;
        return this.ev("endGame");
      case 14: case 18: case 21:
        return undefined;
      case 39: return undefined;
      case 89: return this.ev("modelFlag400");
      case 1: return this.menu();
      case 2: {
        const options               = A(1) === -1 ? [] : this.strN(1).split("|").map((text, i) => ({ text, value: i, enabled: true }));
        this.textMenu = { title: this.strN(0), options, timerMs: A(2), timeoutValue: A(3), speaker: A(4), side: A(5) };
        return undefined;
      }
      case 3: {
        if (!this.textMenu) {
          this.warn("addOption without a text menu");
          return undefined;
        }
        const o = this.textMenu.options;
        o.push({ text: this.strN(0), value: A(1) === -999 ? o.length : A(1), enabled: A(2) !== 0 });
        return undefined;
      }
      case 4: return this.runTextMenu(A(0) !== 0);
      case 71: return this.actionMenu();
      case 44: case 54: E.setInt(0, A(0), A(1)); return undefined;
      case 45: case 55: return E.getInt(0, A(0));
      case 52: E.setInt(A(0), A(1), A(2)); return undefined;
      case 53: return E.getInt(A(0), A(1));
      case 50: E.setFlag(A(0), A(1), A(2), A(3)); return undefined;
      case 51: return E.getFlag(A(0), A(1), A(2));
      case 56: E.array(A(0), A(1)).push(A(2)); return undefined;
      case 57: return E.array(A(0), A(1))[A(2)] ?? 0;
      case 58: return E.array(A(0), A(1)).length;
      case 59: E.array(A(0), A(1)).splice(A(2), 1); return undefined;
      case 5: E.s.expressions[A(0)] = (A(1) << 24) >> 24; return undefined;
      case 72: E.s.portraits[A(0)] = A(1); return undefined;
      case 73: return E.s.portraits[A(0)] ?? 0;
      case 43: E.setName("$USR", this.str(0)); return this.ev("names");
      case 46: E.setName(this.str(0), this.str(1)); return this.ev("names");
      case 47: {
        const token = this.str(0);
        let name = E.getName(token);
        if (!name) {
          name = this.str(1);
          E.setName(token, name);
          this.ev("saveOptions");
        }
        return this.setBuffer(~A(2), name);
      }
      case 60: return E.indexOfName(this.str(0));
      case 64: E.registerName(A(0), this.str(1)); return undefined;
      case 6: {
        const name = this.entityName(A(0));
        const dest = A(1);
        if (dest >= 0) {
          this.writeString(dest, name);
          return dest;
        }
        return this.setBuffer(~dest, name);
      }
      case 61: this.writeString(A(1), this.entityName(A(0))); return undefined;
      case 74: this.primarySpeaker = A(0); return this.ev("primarySpeaker", { entity: A(0) });
      case 75: this.eventSpeaker = A(0); return this.ev("eventSpeaker", { entity: A(0) });
      case 16: this.engineField = A(0); return undefined;
      case 95: return this.minigameScores[(A(0) & 0xffff) === 1 ? 0 : 1];
      case 29: return this.registers[A(0)] ?? 0;
      case 0: {
        const a0 = A(0);
        return a0 >= 0 ? this.setBuffer(0, this.format(0, true)) : this.setBuffer(1 - a0, this.format(1, true, a0 === -8));
      }
      case 22: this.writeString(A(0), this.format(1, false)); return undefined;
      case 24: return this.str(0) === this.str(1) ? 1 : 0;
      case 25: this.writeString(A(0), this.memStr(0) + this.str(1)); return undefined;
      case 26: return undefined;
      case 27: return A(0) > 0 ? Math.abs(Math.floor(this.random() * 0x7fffffff) % A(0)) : 0;
      case 28: this.writeString(A(0), this.formText); return undefined;
      case 49: {
        const name = this.str(1);
        E.registerName(A(0), A(2) !== 0 && name.length > 0 && name[0] !== "$" ? titleCase(name) : name);
        return undefined;
      }
      case 94: return this.minigame("football", 22);
      case 96: return this.minigame("word", 20);
      case 33: return this.form();
      case 11: return this.ev("location", { mode: A(0), location: A(1) });
      case 35: return this.ev("speakerLocation", { speaker: A(0), mode: A(1), location: A(2), expression: A(3) });
      case 86: return this.ev("location", { location: A(0), mode: A(1), wipe: A(2) !== 0 });
      case 34: return this.ev("openDialog", { args: this.args(4) });
      case 85: return this.ev("locationWipe");
      case 97: return this.ev("locationPan", { args: this.args(2) });
      case 79: return A(0) >= 8201 && A(0) <= 8225 ? this.ev("music", { id: A(0), loop: false }) : this.ev("sound", { id: A(0) });
      case 80: return this.ev("music", { id: A(0), loop: A(1) !== 0 });
      case 81: return this.ev("stopMusic", { id: A(0) });
      case 82: return this.ev("vibrate");
      case 83: return this.ev("pauseMusic");
      case 84: return this.ev("resumeMusic");
      case 8: return this.chapter();
      case 17: case 40: return this.textEntry();
      case 78: return this.portraitSelect();
      case 32: return this.ev("addMaster", { args: this.args(4) });
      case 91: return this.ev("loadingBar", { show: true });
      case 98: return this.ev("loadingBar", { show: false });
      case 115: return this.ev("textMessage", { text: this.str(0), from: A(1), expression: A(2) });
      case 116: return this.ev("textMessageMore", { text: this.str(0), url: this.str(1) });
      case 117: return this.ev("textMessageImage", { image: A(0), text: this.str(1), url: this.str(2) });
      case 102: case 103: case 104: case 105: case 106: case 107: case 108: case 111: case 112:
        return this.ev("results", { call: id, args: this.args(8) });
      case 9: case 70: case 99:
        return this.ev("network", { call: id });
      case 100: return this.ev("exitToUrl");
      default:
        this.ev("unhandled", { call: id, args: this.args(8) });
        return undefined;
    }
  }
          brewSyscall(id        )                           {
    const A = (i        ) => this.A(i);
    const E = this.entities;
    if (id === 51 && A(0) === 1001) {
      const section = E.getInt(0, 1001);
      this.brewSpin = section === this.brewSpinSection ? this.brewSpin + 1 : 0;
      this.brewSpinSection = section;
      if (this.brewSpin > 1000) {
        this.warn(`section ${section} makes no progress; ending this event`);
        this.brewSpin = 0;
        return 0;
      }
    } else if (BREW_WAITING_SYSCALLS.has(id)) this.brewSpin = 0;
    switch (id) {
      case 1: this.writeString(A(0), this.format(1, true)); return undefined;
      case 3: return this.str(0) === this.str(1) ? 1 : 0;
      case 4: this.writeString(A(0), this.memStr(0) + this.str(1)); return undefined;
      case 6: return A(0) > 0 ? Math.abs(Math.floor(this.random() * 0x7fffffff) % A(0)) : 0;
      case 7: this.writeString(A(0), this.formText); return undefined;
      case 8: return this.registers[A(0)] ?? 0;
      case 73: {
        const w = this.args(this.vm.argc).map((x) => Math.max(0, x));
        let r = Math.floor(this.random() * w.reduce((a, b) => a + b, 0));
        for (let i = 0; i < w.length; i++) {
          if (r < w[i]) return i;
          r -= w[i];
        }
        return Math.max(0, w.length - 1);
      }
      case 80: return A(0) === 1 ? 2 : A(0) === 2 ? 1 : A(0) === 3 ? 5 : 0;
      case 0: case 10: return undefined;
      case 72:
        return this.line({ kind: "sayAs", style: "plain", title: null, text: this.strN(1), speaker: A(0), expression: A(2) });
      case 12:
        return this.line({ kind: "titled", style: "plain", title: this.strN(0), text: this.strN(1), speaker: -1, expression: 0 });
      case 13: this.ev("location", { mode: 0, location: A(1), brewMode: A(0) }); return 1;
      case 14: return this.ev("speakerLocation", { speaker: A(0), mode: 0, location: A(2), expression: A(3), brewMode: A(1) });
      case 15: return this.ev("brewName", { text: this.strN(0) });
      case 16: this.brewText = this.strN(0); return undefined;
      case 17: return this.ev("brewIcons", { art: A(0), count: A(1) });
      case 18: return this.ev("dialogClose", {});
      case 74: return this.brewWait();
      case 31: if (this.textMenu) this.textMenu.timerMs = Math.max(0, A(0)); return undefined;
      case 32: return undefined;
      case 28: return this.brewMenu(this.strN(0), this.strN(1).split("|"));
      case 30: {
        const r = this.brewMenu(this.strN(0), this.strN(1).split("|"));
        if (this.textMenu) this.textMenu.spinMs = Math.max(50, A(2));
        return r;
      }
      case 27: {
        const n = Math.min(Math.max(A(0), 1), 20);
        const people = Array.from({ length: n }, (_, i) => this.vm.read(A(1) + i));
        const options = people.map((_, i) => ({ text: String(i + 1), value: i, enabled: true }));
        this.textMenu = { title: "", options, timerMs: 0, timeoutValue: 0, speaker: -1, side: 1, people };
        return 1;
      }
      case 29: return this.brewTextEntry();
      case 50: case 60: E.setInt(0, A(0), A(1)); return undefined;
      case 51: case 61: return E.getInt(0, A(0));
      case 58: E.setInt(A(0), A(1), A(2)); return undefined;
      case 59: return E.getInt(A(0), A(1));
      case 56: E.setFlag(A(0), A(1), A(2), A(3)); return undefined;
      case 57: return E.getFlag(A(0), A(1), A(2));
      case 52: E.setName(this.str(0), this.str(1)); return this.ev("names");
      case 53: this.writeString(A(1), E.getName(this.str(0))); return undefined;
      case 55: case 71: E.registerName(A(0), this.str(1)); return undefined;
      case 68: this.writeString(A(1), this.entityName(A(0))); return undefined;
      case 49: E.setName("$USR", this.str(0)); return this.ev("names");
      case 62: {
        const list = E.array(A(0), A(1));
        if (list.length < 23) list.push(A(2));
        return undefined;
      }
      case 63: return E.array(A(0), A(1))[A(2)] ?? 0;
      case 64: {
        const list = E.array(A(0), A(1));
        while (list.length < A(2)) list.push(0);
        if (A(2) >= 0 && A(2) < 23) list[A(2)] = A(3);
        return undefined;
      }
      case 65: return E.array(A(0), A(1)).length;
      case 66: E.array(A(0), A(1)).splice(A(2), 1); return undefined;
      case 67: {
        const name = this.str(0).toLowerCase();
        const i = E.s.registeredNames.findIndex((n) => (n ?? "").toLowerCase() === name);
        return i;
      }
      case 9: return this.ev("music", { id: A(0), loop: false });
      case 11: {
        const args = this.args(4);
        this.brewSheets.push(args);
        return this.ev("brewSheet", { args });
      }
      case 19: case 20: case 21:
        return this.minigame("brew", id === 20 ? 7 : 6, id);
      case 69:
        Cal.configure(this.brew, {
          dayStart: A(0), dayEnd: A(1), startMonth: A(2), startDay: A(3), weekdayOffset: A(4), endMonth: A(5), endDay: A(6),
        });
        return undefined;
      case 33: {
        if (A(0) <= 0) return 0;
        const day = Cal.dayIndex(this.brew, A(4), A(5));
        return Cal.schedule(this.brew, {
          script: A(0), param: this.str(1), name: this.strN(2), caption: this.strN(3), minute: A(6), duration: A(7), icon: A(8), flag: A(9),
        }, [day]);
      }
      case 34: {
        if (A(0) <= 0) return 0;
        const days = Cal.weekdaysBetween(this.brew, Cal.dayIndex(this.brew, A(5), A(6)), Cal.dayIndex(this.brew, A(7), A(8)), this.str(4));
        return Cal.schedule(this.brew, {
          script: A(0), param: this.str(1), name: this.strN(2), caption: this.strN(3), minute: A(9), duration: A(10), icon: A(11), flag: A(12),
        }, days);
      }
      case 35: {
        const e = Cal.event(this.brew, A(0));
        if (e && A(1) >= 0 && A(1) < 16) e.fields[A(1)] = A(2);
        else if (!e) this.warn(`calendar event ${A(0)} not found`);
        return undefined;
      }
      case 37: Cal.fireDue(this.brew); return undefined;
      case 38: Cal.advanceWithin(this.brew, A(0)); return undefined;
      case 39: this.brew.minute = A(0); return undefined;
      case 41: return this.brew.minute;
      case 42: case 43: {
        const day = id === 42 ? Cal.nextSchoolDay(this.brew, this.brew.day) : this.brew.day;
        const [m, d] = Cal.dateOf(this.brew, Math.max(0, day));
        this.vm.write(A(0), m);
        this.vm.write(A(1), d);
        return undefined;
      }
      case 44: {
        const name = this.str(0);
        let day = Cal.dayIndex(this.brew, this.vm.read(A(1)), this.vm.read(A(2)));
        for (let i = 0; i < 400; i++) {
          const n = Cal.DAY_NAMES[Cal.weekday(this.brew, day)];
          if (n[0] === name[0] || n[1] === name[1]) break;
          const next = Cal.nextSchoolDay(this.brew, day);
          if (next < 0) break;
          day = next;
        }
        const [m, d] = Cal.dateOf(this.brew, day);
        this.vm.write(A(1), m);
        this.vm.write(A(2), d);
        return undefined;
      }
      case 45: return Cal.dayIndex(this.brew, A(2), A(3)) - Cal.dayIndex(this.brew, A(0), A(1));
      case 46: return Cal.event(this.brew, A(0))?.flag ? 1 : 0;
      case 48: {
        const day = Cal.dayIndex(this.brew, A(0), A(1));
        const ids = this.brew.entries.filter(([d]) => d === day).map(([, i]) => Cal.event(this.brew, i) ).filter((e) => {
          const end = e.minute + Math.max(0, e.duration);
          return (e.minute >= A(2) && e.minute <= A(3)) || (end >= A(2) && end <= A(3)) || (e.minute <= A(2) && A(3) <= end);
        }).map((e) => e.id);
        ids.forEach((v, i) => this.vm.write(A(4) + i, v));
        return ids.length;
      }
      case 36: case 47: return this.ev("calendar", { call: id, args: this.args(4) });
      case 70:
        this.ended = true;
        return this.ev("endGame");
      default:
        this.ev("unhandled", { call: id, args: this.args(8) });
        return undefined;
    }
  }
          brewMenu(title        , choices          )         {
    const options = choices.map((text, i) => ({ text, value: i, enabled: true }));
    this.textMenu = { title, options, timerMs: 0, timeoutValue: 0, speaker: -1, side: 1 };
    return 1;
  }
          brewWait()                           {
    const m = this.textMenu;
    if (!m) {
      const text = this.brewText;
      if (text === null) return undefined;
      this.brewText = null;
      const r = this.line({ kind: "say", style: "plain", title: null, text, speaker: -1, expression: -1 });
      return isPromise(r) ? r.then(() => undefined) : undefined;
    }
    this.textMenu = null;
    if (m.people) {
      const pick = (idx        )         => {
        this.registers[0] = Math.max(0, idx);
        return this.registers[0];
      };
      const r = this.front.portraitSelect({ title: m.title, portraits: m.people });
      return isPromise(r) ? r.then(pick) : pick(r);
    }
    const req = {
      kind: "menu"         , title: m.title, subtitle: "", options: m.options, timerMs: m.timerMs,
      speaker: m.speaker, speakerName: "", expression: 0, side: m.side, ...(m.spinMs ? { spinMs: m.spinMs } : {}),
    };
    const done = (idx        )         => {
      const r = idx < 0 ? m.timeoutValue : idx;
      this.remember({ kind: "choice", title: m.title, choice: idx < 0 ? "" : (m.options[idx]?.text ?? "") });
      this.registers[0] = r;
      return r;
    };
    const r = this.front.menu(req);
    return isPromise(r) ? r.then(done) : done(r);
  }
          brewTextEntry()                           {
    const req = { title: this.strN(0), message: "", initial: this.str(1), maxLength: 12 };
    const done = (text        )         => {
      this.remember({ kind: "choice", title: req.title, choice: text });
      this.formText = text;
      return 1;
    };
    const r = this.front.textEntry(req);
    return isPromise(r) ? r.then(done) : done(r);
  }
          line(l                                 )                           {
    const speaker = l.kind === "titled" ? (l.title ?? "") : l.speaker === this.eventSpeaker ? "" : this.speakerName(l.speaker);
    this.remember({ kind: "line", speaker, text: l.text });
    const r = this.front.line(l);
    return isPromise(r) ? r.then(() => undefined) : undefined;
  }
          menu()                           {
    const A = (i        ) => this.A(i);
    let speaker = A(5);
    if (speaker === -2) speaker = this.primarySpeaker;
    const title = this.str(0) === "$PORTRAIT" ? this.entityName(speaker) : this.strN(0);
    const options = this.strN(1).split("|").map((text, i) => ({ text, value: i, enabled: true }));
    const timeoutValue = A(4);
    const req = {
      kind: "menu"         , title, subtitle: A(2) >= 0 ? this.strN(2) : "", options,
      timerMs: A(3), speaker, speakerName: this.entityName(speaker), expression: A(6), side: A(7),
    };
    const done = (idx        )         => {
      const r = idx < 0 ? timeoutValue : idx;
      this.remember({ kind: "choice", title: req.subtitle || title, choice: idx < 0 ? "" : (options[idx]?.text ?? "") });
      this.registers[0] = r;
      return r;
    };
    const r = this.front.menu(req);
    return isPromise(r) ? r.then(done) : done(r);
  }
          runTextMenu(shuffle         )                           {
    const m = this.textMenu;
    this.textMenu = null;
    if (!m) {
      this.warn("runMenu without a text menu");
      return undefined;
    }
    if (shuffle) {
      for (let i = m.options.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [m.options[i], m.options[j]] = [m.options[j], m.options[i]];
      }
    }
    const req = {
      kind: "text"         , title: m.title, subtitle: "", options: m.options, timerMs: m.timerMs,
      speaker: m.speaker, speakerName: this.entityName(m.speaker), expression: 0, side: m.side,
    };
    const done = (idx        )         => {
      const i = idx < 0 ? m.timeoutValue : idx;
      this.remember({ kind: "choice", title: m.title, choice: idx < 0 ? "" : (m.options[idx]?.text ?? "") });
      const r = m.options[i]?.value ?? m.timeoutValue;
      this.registers[0] = r;
      return r;
    };
    const r = this.front.menu(req);
    return isPromise(r) ? r.then(done) : done(r);
  }
          actionMenu()                           {
    const A = (i        ) => this.A(i);
    let speaker = A(5);
    if (speaker === -2) speaker = this.primarySpeaker;
    const req = {
      title: this.strN(0), subtitle: this.strN(1), listA: this.strN(2).split("|"), listB: this.strN(3).split("|"),
      timerMs: A(4), speaker, side: A(6), intervalMs: A(7),
    };
    const done = (score        )         => {
      this.registers[0] = score;
      return score;
    };
    const r = this.front.actionMenu(req);
    return isPromise(r) ? r.then(done) : done(r);
  }
          minigame(game                              , n        , call         )                           {
    const args = this.args(n);
    if (args.length !== n && game !== "brew") this.warn(`${game}: ${args.length} arguments, expected ${n}`);
    const done = (r                )         => {
      if (typeof r !== "number") {
        this.minigameScores = [r.scores[0], r.scores[1]];
        return r.result;
      }
      if (game === "football") this.minigameScores = [Math.max(r, 0), Math.max(-r, 0)];
      return r;
    };
    const r = this.front.minigame({ game, args, vm: this.vm, ...(call !== undefined ? { call } : {}) });
    return isPromise(r) ? r.then(done) : done(r);
  }
          form()                           {
    const r = this.front.form({ title: this.strN(0), text: this.strN(1), lockMs: this.A(2) });
    return isPromise(r) ? r.then(() => undefined) : undefined;
  }
          textEntry()                           {
    const req = { title: this.strN(0), message: this.strN(1), initial: this.strN(2), maxLength: 20 };
    const done = (text        )         => {
      this.remember({ kind: "choice", title: req.title, choice: text });
      this.formText = text;
      return this.setBuffer(0, text);
    };
    const r = this.front.textEntry(req);
    return isPromise(r) ? r.then(done) : done(r);
  }
          chapter()                           {
    const req = { title: this.A(0) >= 0 ? this.strN(0) : "", subtitle: this.strN(1), background: this.A(2), extra: this.A(3) };
    const r = this.front.chapter(req);
    return isPromise(r) ? r.then(() => undefined) : undefined;
  }
          portraitSelect()                           {
    const n = Math.max(0, this.A(1));
    const portraits           = [];
    for (let i = 0; i < n; i++) portraits.push(this.vm.read(this.A(2) + i));
    const done = (i        )         => {
      this.registers[0] = i;
      return i;
    };
    const r = this.front.portraitSelect({ title: this.strN(0), portraits });
    return isPromise(r) ? r.then(done) : done(r);
  }
}
