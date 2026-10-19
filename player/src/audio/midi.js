export function parseMidi(bytes            )           {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (p        ) => String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
  if (bytes.length < 14 || tag(0) !== "MThd") throw new Error("not a Standard MIDI file");
  const headerLen = view.getUint32(4);
  const tracks = view.getUint16(10);
  const division = view.getInt16(12);
  const tempos                                           = [];
  const notes            = [];
  const controls               = [];
  let order = 0;
  let lastTick = 0;
  let p = 8 + headerLen;
  for (let t = 0; t < tracks && p + 8 <= bytes.length; t++) {
    if (tag(p) !== "MTrk") break;
    const end = Math.min(bytes.length, p + 8 + view.getUint32(p + 4));
    p += 8;
    let tick = 0;
    let running = 0;
    const rpn = new Map                ();
    const vlq = ()         => {
      let v = 0;
      let c        ;
      do {
        c = bytes[p++];
        v = (v << 7) | (c & 0x7f);
      } while (c & 0x80 && p < end);
      return v;
    };
    while (p < end) {
      tick += vlq();
      let status = bytes[p];
      if (status < 0x80) status = running;
      else {
        p++;
        if (status < 0xf0) running = status;
      }
      if (status === 0xff) {
        const type = bytes[p++];
        const len = vlq();
        if (type === 0x51 && len === 3) tempos.push({ tick, usPerQuarter: (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2] });
        p += len;
        if (type === 0x2f) break;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        p += vlq();
        continue;
      }
      const kind = status & 0xf0;
      const channel = status & 0x0f;
      const a = bytes[p];
      const b = bytes[p + 1];
      const control = (k                 , value        ) => controls.push({ tick, order: order++, channel, kind: k, value });
      switch (kind) {
        case 0x80:
        case 0x90:
          notes.push({ tick, order: order++, on: kind === 0x90 && b > 0, channel, key: a, velocity: b });
          p += 2;
          break;
        case 0xa0:
          p += 2;
          break;
        case 0xb0:
          p += 2;
          if (a === 7) control("volume", b);
          else if (a === 10) control("pan", b);
          else if (a === 11) control("expression", b);
          else if (a === 64) control("sustain", b >= 64 ? 1 : 0);
          else if (a === 101) rpn.set(channel, ((b & 0x7f) << 7) | ((rpn.get(channel) ?? 0x3fff) & 0x7f));
          else if (a === 100) rpn.set(channel, ((rpn.get(channel) ?? 0x3fff) & ~0x7f) | (b & 0x7f));
          else if (a === 6 && rpn.get(channel) === 0) control("bendRange", b);
          break;
        case 0xc0:
          control("program", a);
          p += 1;
          break;
        case 0xd0:
          p += 1;
          break;
        case 0xe0:
          control("bend", (((b << 7) | a) - 8192) / 8192);
          p += 2;
          break;
        default:
          p = end;
      }
    }
    lastTick = Math.max(lastTick, tick);
    p = end;
  }
  const seconds = timeline(division, tempos);
  const byTime = (x       , y       ) => x.tick - y.tick || x.order - y.order;
  notes.sort(byTime);
  controls.sort(byTime);
  const duration = seconds(lastTick);
  const out             = [];
  const open = new Map                                              ();
  for (const n of notes) {
    const k = (n.channel << 7) | n.key;
    if (n.on) {
      const list = open.get(k) ?? [];
      list.push({ tick: n.tick, velocity: n.velocity });
      open.set(k, list);
      continue;
    }
    const start = open.get(k)?.shift();
    if (start) out.push(note(start.tick, n.tick, n.channel, n.key, start.velocity));
  }
  for (const [k, starts] of open) for (const s of starts) out.push(note(s.tick, lastTick, k >> 7, k & 0x7f, s.velocity));
  out.sort((x, y) => x.time - y.time || x.channel - y.channel || x.key - y.key);
  function note(from        , to        , channel        , key        , velocity        )           {
    const time = seconds(from);
    return { time, duration: Math.max(0, seconds(to) - time), channel, key, velocity };
  }
  return {
    notes: out,
    controls: controls.map((c) => ({ time: seconds(c.tick), channel: c.channel, kind: c.kind, value: c.value })),
    duration,
  };
}
function timeline(division        , tempos                                          )                           {
  if (division < 0) {
    const fps = -(division >> 8);
    const perFrame = division & 0xff;
    return (tick) => tick / (fps * perFrame);
  }
  const ppq = division || 480;
  const map = tempos.slice().sort((x, y) => x.tick - y.tick);
  const starts                                              = [{ tick: 0, sec: 0, us: 500_000 }];
  for (const t of map) {
    const last = starts[starts.length - 1];
    const sec = last.sec + ((t.tick - last.tick) * last.us) / ppq / 1e6;
    if (t.tick === last.tick) starts[starts.length - 1] = { tick: t.tick, sec: last.sec, us: t.usPerQuarter };
    else starts.push({ tick: t.tick, sec, us: t.usPerQuarter });
  }
  return (tick) => {
    let s = starts[0];
    for (const x of starts) {
      if (x.tick > tick) break;
      s = x;
    }
    return s.sec + ((tick - s.tick) * s.us) / ppq / 1e6;
  };
}
