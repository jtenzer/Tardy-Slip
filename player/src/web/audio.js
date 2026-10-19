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
export class AudioPlayer {
          music                          = null;
          musicId = -1;
          midi                                                                 = null;
                   songs = new Map                                  ();
          midiTurn = 0;
           resolve                               ;
  volume = 0.8;
  muted = false;
  constructor(resolve                               ) {
    this.resolve = resolve;
  }
  playMusic(id        , loop         )       {
    if (id === this.musicId && this.music && !this.music.paused) return;
    this.stopMusic();
    const url = this.resolve(id);
    if (!url) return;
    if (isMidi(url)) {
      this.musicId = id;
      void this.playMidi(url, loop);
      return;
    }
    const a = new window.Audio(url);
    a.loop = loop;
    a.volume = this.muted ? 0 : this.volume * 0.7;
    a.play().catch(() => {});
    this.music = a;
    this.musicId = id;
  }
  stopMusic()       {
    this.music?.pause();
    this.music = null;
    this.musicId = -1;
    this.midiTurn++;
    void this.midi?.synth.then((s) => s?.stop());
  }
  pauseMusic()       {
    this.music?.pause();
    void this.midi?.ctx.suspend().catch(() => {});
  }
  resumeMusic()       {
    this.music?.play().catch(() => {});
    void this.midi?.ctx.resume().catch(() => {});
  }
          synth()                                                                 {
    if (this.midi) return this.midi;
    const Ctx = window.AudioContext ?? (window                                                           ).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const wake = () => void ctx.resume().catch(() => {});
    for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, wake, { capture: true });
    const synth = loadBank().then((b) => {
      if (!b) return null;
      const s = new MidiSynth(ctx, b);
      s.volume = this.muted ? 0 : this.volume * 0.75;
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
    if (!synth || !song || turn !== this.midiTurn) return;
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
    const a = new window.Audio(url);
    a.volume = this.volume;
    a.play().catch(() => {});
  }
  setMuted(m         )       {
    this.muted = m;
    if (this.music) this.music.volume = m ? 0 : this.volume * 0.7;
    void this.midi?.synth.then((s) => {
      if (s) s.volume = m ? 0 : this.volume * 0.75;
    });
  }
}
const isMidi = (url        ) => /\.midi?(\?|$)/i.test(url);
