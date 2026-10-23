import {                parseMidi } from "../audio/midi.js";
import { SoundFont } from "../audio/sf2.js";
import { MidiSynth } from "./synth.js";
let bankUrl = "/extracted/soundbank/TimGM6mb.sf2";
let bank                                   = null;
export function setSoundBank(url        )       {
  bankUrl = url;
  bank = null;
}
function loadBank()                            {
  bank ??= fetch(bankUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b ? SoundFont.parse(new Uint8Array(b)) : null))
    .catch(() => null);
  return bank;
}
const MUTE_KEY = "hallpass:muted";
export function savedMute()          {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
export function saveMute(muted         )       {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
  }
}
function audioSession(type                    )       {
  const s = (navigator                                                   ).audioSession;
  try {
    if (s) s.type = type;
  } catch {
  }
}
export class AudioPlayer {
          music                          = null;
          musicId = -1;
          musicLoop = false;
          held = false;
          midi                                                                 = null;
          fx                                 ;
                   effects = new Map                                     ();
                   songs = new Map                                  ();
          midiTurn = 0;
           resolve                               ;
  volume = 0.8;
  muted = false;
  constructor(resolve                               ) {
    this.resolve = resolve;
  }
  playMusic(id        , loop         )       {
    if (id === this.musicId && this.music && (this.muted || !this.music.paused)) return;
    this.stopMusic();
    const url = this.resolve(id);
    if (!url) return;
    this.musicId = id;
    this.musicLoop = loop;
    if (isMidi(url)) {
      if (!this.muted) void this.playMidi(url, loop);
      return;
    }
    const a = new window.Audio(url);
    a.loop = loop;
    a.volume = this.volume * 0.7;
    if (!this.muted) a.play().catch(() => {});
    this.music = a;
  }
  stopMusic()       {
    this.music?.pause();
    this.music = null;
    this.musicId = -1;
    this.held = false;
    this.midiTurn++;
    void this.midi?.synth.then((s) => s?.stop());
  }
  pauseMusic()       {
    this.held = true;
    this.music?.pause();
    void this.midi?.ctx.suspend().catch(() => {});
  }
  resumeMusic()       {
    this.held = false;
    if (this.muted) return;
    this.music?.play().catch(() => {});
    void this.midi?.ctx.resume().catch(() => {});
  }
          context(mayPlay               )                      {
    const Ctx = window.AudioContext ?? (window                                                           ).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const wake = () => {
      if (mayPlay()) void ctx.resume().catch(() => {});
    };
    for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, wake, { capture: true });
    return ctx;
  }
          synth()                                                                 {
    if (this.midi) return this.midi;
    const ctx = this.context(() => !this.muted && !this.held);
    if (!ctx) return null;
    const synth = loadBank().then((b) => {
      if (!b) return null;
      const s = new MidiSynth(ctx, b);
      s.volume = this.volume * 0.75;
      return s;
    });
    this.midi = { ctx, synth };
    return this.midi;
  }
          song(url        )                           {
    let p = this.songs.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => (b ? parseMidi(new Uint8Array(b)) : null))
        .catch(() => null);
      this.songs.set(url, p);
    }
    return p;
  }
          async playMidi(url        , loop         )                {
    const turn = ++this.midiTurn;
    const m = this.synth();
    if (!m) return;
    const [synth, song] = await Promise.all([m.synth, this.song(url)]);
    if (!synth || !song || turn !== this.midiTurn || this.muted) return;
    void m.ctx.resume().catch(() => {});
    synth.play(song, loop);
  }
  sound(id        )       {
    const url = this.resolve(id);
    if (!url || this.muted) return;
    if (isMidi(url)) {
      this.musicId = -1;
      void this.playMidi(url, false);
      return;
    }
    void this.effect(url);
  }
          async effect(url        )                {
    if (this.fx === undefined) this.fx = this.context(() => !this.muted);
    const ctx = this.fx;
    if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
    const buffer = ctx ? await this.decoded(ctx, url) : null;
    if (this.muted) return;
    if (!ctx || !buffer) {
      const a = new window.Audio(url);
      a.volume = this.volume;
      a.play().catch(() => {});
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }
          decoded(ctx              , url        )                              {
    let p = this.effects.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => (b ? ctx.decodeAudioData(b) : null))
        .catch(() => null);
      this.effects.set(url, p);
    }
    return p;
  }
  setMuted(m         )       {
    if (m === this.muted) return;
    this.muted = m;
    audioSession(m ? "ambient" : "auto");
    if (m) {
      this.music?.pause();
      this.midiTurn++;
      void this.midi?.synth.then((s) => s?.stop());
      void this.midi?.ctx.suspend().catch(() => {});
      void this.fx?.suspend().catch(() => {});
      return;
    }
    void this.fx?.resume().catch(() => {});
    if (this.held) return;
    if (this.music) this.music.play().catch(() => {});
    else if (this.musicId >= 0) {
      const url = this.resolve(this.musicId);
      if (url && isMidi(url)) void this.playMidi(url, this.musicLoop);
    }
  }
}
const isMidi = (url        ) => /\.midi?(\?|$)/i.test(url);
