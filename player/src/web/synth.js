const FLOOR = 1e-4;
class ChannelTrack {
                   points                                   ;
                   initial        ;
  constructor(controls               , channel        , kind                     , initial        ) {
    this.points = controls.filter((c) => c.channel === channel && c.kind === kind).map((c) => ({ time: c.time, value: c.value }));
    this.initial = initial;
  }
  at(time        )         {
    let v = this.initial;
    for (const p of this.points) {
      if (p.time > time) break;
      v = p.value;
    }
    return v;
  }
  between(from        , to        )                                    {
    return this.points.filter((p) => p.time > from && p.time <= to);
  }
}
export class MidiSynth {
                   ctx              ;
                   bank           ;
                   out          ;
                   buffers = new Map                     ();
          playing                 = null;
  constructor(ctx              , bank           , destination            = ctx.destination) {
    this.ctx = ctx;
    this.bank = bank;
    this.out = ctx.createGain();
    this.out.connect(destination);
  }
  set volume(v        ) {
    this.out.gain.value = v;
  }
  play(song          , loop = false)       {
    this.stop();
    const master = this.ctx.createGain();
    master.connect(this.out);
    const playing          = { master, sources: [], timer: 0 };
    this.playing = playing;
    const run = (start        ) => {
      this.schedule(song, start, master, playing.sources);
      if (!loop || song.duration <= 0) return;
      const next = start + song.duration;
      playing.timer = setTimeout(() => {
        if (this.playing === playing) run(next);
      }, Math.max(0, (next - this.ctx.currentTime - 0.5) * 1000))                     ;
    };
    run(this.ctx.currentTime + 0.05);
  }
  stop()       {
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    clearTimeout(p.timer);
    const now = this.ctx.currentTime;
    p.master.gain.setValueAtTime(p.master.gain.value, now);
    p.master.gain.linearRampToValueAtTime(0, now + 0.03);
    for (const s of p.sources) {
      try {
        s.stop(now + 0.05);
      } catch {
      }
    }
    setTimeout(() => p.master.disconnect(), 200);
  }
  get busy()          {
    return this.playing !== null;
  }
          schedule(song          , t0        , master          , sources                            )       {
    const tracks = new Map                                      ();
    const track = (ch        ) => {
      let t = tracks.get(ch);
      if (!t) {
        const c = song.controls;
        t = {
          program: new ChannelTrack(c, ch, "program", 0), volume: new ChannelTrack(c, ch, "volume", 100),
          expression: new ChannelTrack(c, ch, "expression", 127), pan: new ChannelTrack(c, ch, "pan", 64),
          bend: new ChannelTrack(c, ch, "bend", 0), bendRange: new ChannelTrack(c, ch, "bendRange", 2),
        };
        tracks.set(ch, t);
      }
      return t;
    };
    const cutAt = new Map                ();
    const planned                                                                      = [];
    for (const note of song.notes) {
      const t = track(note.channel);
      const drums = note.channel === 9;
      const voices = this.bank.voices(drums ? 128 : 0, drums ? 0 : t.program.at(note.time), note.key, note.velocity);
      for (const voice of voices) planned.push({ voice, note, end: note.time + note.duration });
    }
    for (let i = planned.length - 1; i >= 0; i--) {
      const p = planned[i];
      const cls = p.voice.exclusiveClass;
      if (!cls) continue;
      const key = `${p.note.channel}:${cls}`;
      const next = cutAt.get(key);
      if (next !== undefined && next < p.end) p.end = next;
      cutAt.set(key, p.note.time);
    }
    for (const { voice, note, end } of planned) {
      const t = track(note.channel);
      const start = t0 + note.time;
      const release = t0 + Math.max(note.time, end);
      const level = (note.velocity / 127) ** 2 * voice.attenuation * (t.volume.at(note.time) / 127) ** 2 *
        (t.expression.at(note.time) / 127) ** 2;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer(voice);
      const rate = voice.sample.rate;
      if (voice.loop !== "none" && voice.loopEnd > voice.loopStart) {
        src.loop = true;
        src.loopStart = voice.loopStart / rate;
        src.loopEnd = voice.loopEnd / rate;
      }
      const range = t.bendRange.at(note.time);
      const bent = (b        ) => voice.pitch * Math.pow(2, (b * range) / 12);
      src.playbackRate.setValueAtTime(bent(t.bend.at(note.time)), start);
      const stopAt = release + Math.min(voice.release, 3) + 0.05;
      for (const b of t.bend.between(note.time, stopAt - t0)) src.playbackRate.setValueAtTime(bent(b.value), t0 + b.time);
      if (voice.vibrato.cents && src.detune) {
        const lfo = this.ctx.createOscillator();
        const depth = this.ctx.createGain();
        lfo.frequency.value = voice.vibrato.hz;
        depth.gain.value = voice.vibrato.cents;
        lfo.connect(depth).connect(src.detune);
        lfo.start(start + voice.vibrato.delay);
        lfo.stop(stopAt);
        sources.push(lfo);
      }
      let node            = src;
      if (voice.filterHz !== null) {
        const f = this.ctx.createBiquadFilter();
        f.type = "lowpass";
        f.Q.value = voice.filterQ;
        envelope(f.frequency, start, release, voice.modEnv, (x) => clampHz(voice.filterHz  * Math.pow(2, (voice.modEnvToFilter * x) / 1200)), false);
        node = node.connect(f);
      }
      const amp = this.ctx.createGain();
      envelope(amp.gain, start, release, voice, (x) => x * level, true);
      node = node.connect(amp);
      const pan = Math.max(-1, Math.min(1, voice.pan + (t.pan.at(note.time) - 64) / 64));
      if (pan && this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = pan;
        node = node.connect(p);
      }
      node.connect(master);
      src.start(start, Math.max(0, voice.start) / rate);
      src.stop(stopAt);
      sources.push(src);
    }
  }
          buffer(voice          )              {
    let b = this.buffers.get(voice.sampleIndex);
    if (!b) {
      const s = voice.sample;
      const n = Math.max(1, s.end - s.start);
      b = this.ctx.createBuffer(1, n, Math.max(3000, s.rate));
      const ch = b.getChannelData(0);
      const data = this.bank.data;
      for (let i = 0; i < n; i++) ch[i] = (data[s.start + i] ?? 0) / 32768;
      this.buffers.set(voice.sampleIndex, b);
    }
    return b;
  }
}
function clampHz(hz        )         {
  return Math.max(20, Math.min(20000, hz));
}
function envelope(
  param            , start        , releaseAt        ,
  e                                                                                                  ,
  value                       , exponential         ,
)       {
  const a0 = start + e.delay;
  const a1 = a0 + e.attack;
  const h1 = a1 + e.hold;
  const d1 = h1 + e.decay;
  const sustain = Math.max(e.sustain, exponential ? FLOOR : 0);
  const levelAt = (t        )         => {
    if (t <= a0) return 0;
    if (t < a1) return (t - a0) / Math.max(1e-6, e.attack);
    if (t < h1) return 1;
    if (t < d1) {
      const k = (t - h1) / Math.max(1e-6, e.decay);
      return exponential ? Math.pow(sustain, k) : 1 + (sustain - 1) * k;
    }
    return sustain;
  };
  const floor = (x        ) => (exponential ? Math.max(FLOOR, x) : x);
  param.setValueAtTime(value(exponential ? FLOOR : 0), start);
  const steps                                            = [];
  if (e.delay > 0) steps.push([a0, 0, "set"]);
  steps.push([a1, 1, "lin"]);
  if (e.hold > 0) steps.push([h1, 1, "set"]);
  steps.push([d1, sustain, exponential ? "exp" : "lin"]);
  for (const [time, level, kind] of steps) {
    if (time >= releaseAt) {
      const x = levelAt(releaseAt);
      if (kind === "exp") param.exponentialRampToValueAtTime(value(floor(x)), releaseAt);
      else param.linearRampToValueAtTime(value(floor(x)), releaseAt);
      break;
    }
    if (kind === "exp") param.exponentialRampToValueAtTime(value(floor(level)), time);
    else if (kind === "lin") param.linearRampToValueAtTime(value(floor(level)), time);
    else param.setValueAtTime(value(floor(level)), time);
  }
  const from = levelAt(releaseAt);
  const end = releaseAt + Math.min(e.release, 3);
  param.setValueAtTime(value(floor(from)), releaseAt);
  if (exponential) param.exponentialRampToValueAtTime(value(FLOOR), Math.max(end, releaseAt + 0.005));
  else param.linearRampToValueAtTime(value(0), Math.max(end, releaseAt + 0.005));
}
