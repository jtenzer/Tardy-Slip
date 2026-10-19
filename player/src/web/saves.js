import { deflateZlib, fromBase64, inflateZlib, toBase64 } from "../../../extractor/src/bytes.js";
export const SLOTS = ["auto", "1", "2", "3"]         ;
const PREFIX = "hallpass:save:";
function storage()                 {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
export function describe(s               )         {
  for (let i = s.history.length - 1; i >= 0; i--) {
    const h = s.history[i];
    const text = h.kind === "line" ? (h.speaker ? `${h.speaker}: ${h.text}` : h.text) : `${h.title} → ${h.choice}`;
    const plain = text.replaceAll("`", "").replace(/\s+/g, " ").trim();
    if (plain) return plain.length > 70 ? `${plain.slice(0, 69)}…` : plain;
  }
  return "";
}
export class SaveStore {
           folder        ;
           nsId        ;
           title        ;
  constructor(folder        , nsId        , title        ) {
    this.folder = folder;
    this.nsId = nsId;
    this.title = title;
  }
          key(slot      )         {
    return `${PREFIX}${this.folder}|${this.nsId}|${slot}`;
  }
          stored(slot      )                {
    try {
      const raw = storage()?.getItem(this.key(slot));
      const v = raw ? (JSON.parse(raw)          ) : null;
      return v && v.v === 1 ? v : null;
    } catch {
      return null;
    }
  }
  info(slot      )                  {
    const s = this.stored(slot);
    return s ? { slot, savedAt: s.savedAt, title: s.title, where: s.where } : null;
  }
  list()             {
    return SLOTS.map((s) => this.info(s)).filter((x)                => x !== null);
  }
  async write(slot      , snap               )                   {
    const st = storage();
    if (!st) return false;
    const data = toBase64(await deflateZlib(new TextEncoder().encode(JSON.stringify(snap))));
    const value         = { v: 1, savedAt: Date.now(), title: this.title, where: describe(snap), data };
    try {
      st.setItem(this.key(slot), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  async read(slot      )                                {
    const s = this.stored(slot);
    if (!s) return null;
    try {
      return JSON.parse(new TextDecoder().decode(await inflateZlib(fromBase64(s.data))))                 ;
    } catch {
      return null;
    }
  }
  remove(slot      )       {
    try {
      storage()?.removeItem(this.key(slot));
    } catch {
    }
  }
}
export class AutoSaver {
  latest                       = null;
          next                       = null;
          started = false;
          writing = false;
                   store                          ;
  failed = false;
  constructor(store                          ) {
    this.store = store;
  }
  take(s               , decision         )       {
    this.latest = s;
    if (!decision && this.started) return;
    this.started = true;
    this.next = s;
    if (!this.writing) void this.flush();
  }
          async flush()                {
    this.writing = true;
    while (this.next) {
      const s = this.next;
      this.next = null;
      this.failed = !(await this.store.write("auto", s));
    }
    this.writing = false;
  }
}
