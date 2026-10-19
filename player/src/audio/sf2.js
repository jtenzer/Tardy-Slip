const G = {
  startOffset: 0, endOffset: 1, loopStartOffset: 2, loopEndOffset: 3, startCoarse: 4, vibLfoToPitch: 6,
  modEnvToPitch: 7, filterFc: 8, filterQ: 9, modEnvToFilterFc: 11, endCoarse: 12, pan: 17, delayVibLfo: 23,
  freqVibLfo: 24, delayModEnv: 25, attackModEnv: 26, holdModEnv: 27, decayModEnv: 28, sustainModEnv: 29,
  releaseModEnv: 30, keynumToModEnvHold: 31, keynumToModEnvDecay: 32, delayVol: 33, attackVol: 34, holdVol: 35, decayVol: 36, sustainVol: 37, releaseVol: 38,
  keynumToHold: 39, keynumToDecay: 40, instrument: 41, keyRange: 43, velRange: 44, loopStartCoarse: 45, keynum: 46,
  velocity: 47, attenuation: 48, loopEndCoarse: 50, coarseTune: 51, fineTune: 52, sampleId: 53, sampleModes: 54,
  scaleTuning: 56, exclusiveClass: 57, rootKey: 58,
}         ;
const DEFAULTS                         = {
  [G.filterFc]: 13500, [G.delayVol]: -12000, [G.attackVol]: -12000, [G.holdVol]: -12000, [G.decayVol]: -12000,
  [G.releaseVol]: -12000, [G.delayModEnv]: -12000, [G.attackModEnv]: -12000, [G.holdModEnv]: -12000,
  [G.decayModEnv]: -12000, [G.releaseModEnv]: -12000, [G.delayVibLfo]: -12000, [G.scaleTuning]: 100, [G.rootKey]: -1, [G.keynum]: -1, [G.velocity]: -1,
};
const INSTRUMENT_ONLY = new Set        ([0, 1, 2, 3, 4, 12, 45, 50, 46, 47, 54, 57, 58]);
const timecents = (tc        ) => (tc <= -12000 ? 0 : Math.pow(2, tc / 1200));
export class SoundFont {
           name        ;
           samples             ;
           data            ;
                   presets          ;
                   instruments              ;
                   byProgram = new Map                ();
          constructor(name        , presets          , instruments              , samples             , data            ) {
    this.name = name;
    this.presets = presets;
    this.instruments = instruments;
    this.samples = samples;
    this.data = data;
    for (const p of presets) if (!this.byProgram.has((p.bank << 7) | p.program)) this.byProgram.set((p.bank << 7) | p.program, p);
  }
  static parse(bytes            )            {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = (p        ) => String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
    if (tag(0) !== "RIFF" || tag(8) !== "sfbk") throw new Error("not a SoundFont 2 bank");
    const chunks = new Map                                     ();
    const walk = (p        , end        ) => {
      while (p + 8 <= end) {
        const id = tag(p);
        const len = view.getUint32(p + 4, true);
        if (id === "LIST") walk(p + 12, Math.min(end, p + 8 + len));
        else if (!chunks.has(id)) chunks.set(id, { at: p + 8, len });
        p += 8 + len + (len & 1);
      }
    };
    walk(12, Math.min(bytes.length, 8 + view.getUint32(4, true)));
    const need = (id        ) => {
      const c = chunks.get(id);
      if (!c) throw new Error(`SoundFont: no ${id} chunk`);
      return c;
    };
    const text = (p        , n        ) => {
      let s = "";
      for (let i = 0; i < n && bytes[p + i]; i++) s += String.fromCharCode(bytes[p + i]);
      return s.trim();
    };
    const smpl = need("smpl");
    const data = new Int16Array(smpl.len >> 1);
    for (let i = 0; i < data.length; i++) data[i] = view.getInt16(smpl.at + 2 * i, true);
    const shdr = need("shdr");
    const samples              = [];
    for (let p = shdr.at; p + 46 <= shdr.at + shdr.len - 46; p += 46) {
      samples.push({
        name: text(p, 20), start: view.getUint32(p + 20, true), end: view.getUint32(p + 24, true),
        loopStart: view.getUint32(p + 28, true), loopEnd: view.getUint32(p + 32, true), rate: view.getUint32(p + 36, true),
        rootKey: bytes[p + 40], correction: view.getInt8(p + 41),
      });
    }
    const gens = (chunk        ) => {
      const c = need(chunk);
      const out                             = [];
      for (let p = c.at; p + 4 <= c.at + c.len; p += 4) out.push([view.getUint16(p, true), view.getInt16(p + 2, true), view.getUint16(p + 2, true)]);
      return out;
    };
    const bags = (chunk        ) => {
      const c = need(chunk);
      const out           = [];
      for (let p = c.at; p + 4 <= c.at + c.len; p += 4) out.push(view.getUint16(p, true));
      return out;
    };
    const zonesOf = (bagFrom        , bagTo        , bagIdx          , genList                            , targetOp        ) => {
      const zones         = [];
      let global              = null;
      for (let b = bagFrom; b < bagTo; b++) {
        const z       = { gens: new Map(), keys: [0, 127], vels: [0, 127], target: -1 };
        for (let g = bagIdx[b]; g < bagIdx[b + 1]; g++) {
          const [op, amount, raw] = genList[g];
          if (op === G.keyRange) z.keys = [raw & 0xff, raw >> 8];
          else if (op === G.velRange) z.vels = [raw & 0xff, raw >> 8];
          else if (op === targetOp) z.target = raw;
          else z.gens.set(op, amount);
        }
        if (z.target >= 0) zones.push(z);
        else if (b === bagFrom) global = z;
      }
      return { zones, global };
    };
    const ibag = bags("ibag");
    const igen = gens("igen");
    const inst = need("inst");
    const instruments               = [];
    for (let p = inst.at; p + 44 <= inst.at + inst.len; p += 22) {
      const { zones, global } = zonesOf(view.getUint16(p + 20, true), view.getUint16(p + 42, true), ibag, igen, G.sampleId);
      instruments.push({ name: text(p, 20), zones, global });
    }
    const pbag = bags("pbag");
    const pgen = gens("pgen");
    const phdr = need("phdr");
    const presets           = [];
    for (let p = phdr.at; p + 76 <= phdr.at + phdr.len; p += 38) {
      const { zones, global } = zonesOf(view.getUint16(p + 24, true), view.getUint16(p + 62, true), pbag, pgen, G.instrument);
      presets.push({ name: text(p, 20), program: view.getUint16(p + 20, true), bank: view.getUint16(p + 22, true), zones, global });
    }
    const info = chunks.get("INAM");
    return new SoundFont(info ? text(info.at, info.len) : "", presets, instruments, samples, data);
  }
  preset(bank        , program        )                                                         {
    const p = this.find(bank, program);
    return p ? { name: p.name, bank: p.bank, program: p.program } : null;
  }
          find(bank        , program        )                {
    return this.byProgram.get((bank << 7) | program) ?? (bank === 128 ? this.byProgram.get(128 << 7) : this.byProgram.get(program)) ?? null;
  }
  voices(bank        , program        , key        , velocity        )             {
    const preset = this.find(bank, program);
    if (!preset) return [];
    const out             = [];
    const inRange = (r                  , v        ) => v >= r[0] && v <= r[1];
    for (const pz of preset.zones) {
      if (!inRange(pz.keys, key) || !inRange(pz.vels, velocity)) continue;
      const instrument = this.instruments[pz.target];
      if (!instrument) continue;
      for (const iz of instrument.zones) {
        if (!inRange(iz.keys, key) || !inRange(iz.vels, velocity)) continue;
        const sample = this.samples[iz.target];
        if (!sample) continue;
        const g = new Map                (Object.entries(DEFAULTS).map(([k, v]) => [Number(k), v]));
        for (const [op, v] of instrument.global?.gens ?? []) g.set(op, v);
        for (const [op, v] of iz.gens) g.set(op, v);
        for (const zone of [preset.global, pz]) {
          for (const [op, v] of zone?.gens ?? []) if (!INSTRUMENT_ONLY.has(op)) g.set(op, (g.get(op) ?? 0) + v);
        }
        out.push(this.voice(g, sample, iz.target, key));
      }
    }
    return out;
  }
          voice(g                     , sample           , sampleIndex        , key        )           {
    const v = (op        ) => g.get(op) ?? 0;
    const root = v(G.rootKey) >= 0 ? v(G.rootKey) : sample.rootKey;
    const k = v(G.keynum) >= 0 ? v(G.keynum) : key;
    const cents = (k - root) * v(G.scaleTuning) + v(G.coarseTune) * 100 + v(G.fineTune) + sample.correction;
    const modes = v(G.sampleModes) & 3;
    const fc = v(G.filterFc);
    const hold = timecents(v(G.holdVol) + v(G.keynumToHold) * (60 - k));
    const decay = timecents(v(G.decayVol) + v(G.keynumToDecay) * (60 - k));
    return {
      sample,
      sampleIndex,
      pitch: Math.pow(2, cents / 1200),
      start: v(G.startOffset) + v(G.startCoarse) * 32768,
      end: sample.end - sample.start + v(G.endOffset) + v(G.endCoarse) * 32768,
      loopStart: sample.loopStart - sample.start + v(G.loopStartOffset) + v(G.loopStartCoarse) * 32768,
      loopEnd: sample.loopEnd - sample.start + v(G.loopEndOffset) + v(G.loopEndCoarse) * 32768,
      loop: modes === 1 ? "continuous" : modes === 3 ? "untilRelease" : "none",
      attenuation: Math.pow(10, (-0.4 * Math.max(0, v(G.attenuation))) / 200),
      pan: Math.max(-1, Math.min(1, v(G.pan) / 500)),
      filterHz: fc < 13500 || v(G.modEnvToFilterFc) !== 0 ? 8.176 * Math.pow(2, fc / 1200) : null,
      filterQ: v(G.filterQ) / 10,
      delay: timecents(v(G.delayVol)),
      attack: timecents(v(G.attackVol)),
      hold,
      decay,
      sustain: Math.pow(10, -Math.max(0, Math.min(1440, v(G.sustainVol))) / 200),
      release: timecents(v(G.releaseVol)),
      modEnv: {
        delay: timecents(v(G.delayModEnv)),
        attack: timecents(v(G.attackModEnv)),
        hold: timecents(v(G.holdModEnv) + v(G.keynumToModEnvHold) * (60 - k)),
        decay: timecents(v(G.decayModEnv) + v(G.keynumToModEnvDecay) * (60 - k)),
        sustain: 1 - Math.max(0, Math.min(1000, v(G.sustainModEnv))) / 1000,
        release: timecents(v(G.releaseModEnv)),
      },
      modEnvToFilter: v(G.modEnvToFilterFc),
      modEnvToPitch: v(G.modEnvToPitch),
      vibrato: { delay: timecents(v(G.delayVibLfo)), hz: 8.176 * Math.pow(2, v(G.freqVibLfo) / 1200), cents: v(G.vibLfoToPitch) },
      exclusiveClass: v(G.exclusiveClass),
    };
  }
}
