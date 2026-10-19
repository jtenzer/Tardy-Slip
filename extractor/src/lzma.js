const PROB_INIT = 1024;
const TOP = 1 << 24;
class RangeDecoder {
           d            ;
  pos        ;
  range = 0xffffffff;
  code = 0;
  constructor(d            , pos        ) {
    this.d = d;
    this.pos = pos;
    if (this.next() !== 0) throw new Error("lzma: stream does not start with 0");
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.next()) >>> 0;
    if (this.code === this.range) throw new Error("lzma: corrupted stream start");
  }
  next()         {
    if (this.pos >= this.d.length) throw new Error("lzma: input ended early");
    return this.d[this.pos++];
  }
  normalize()       {
    if (this.range < TOP) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.next()) >>> 0;
    }
  }
  bit(probs             , i        )         {
    const p = probs[i];
    const bound = (this.range >>> 11) * p;
    let b        ;
    if (this.code < bound) {
      probs[i] = p + ((2048 - p) >>> 5);
      this.range = bound;
      b = 0;
    } else {
      probs[i] = p - (p >>> 5);
      this.code -= bound;
      this.range -= bound;
      b = 1;
    }
    this.normalize();
    return b;
  }
  direct(n        )         {
    let res = 0;
    for (; n > 0; n--) {
      this.range >>>= 1;
      let b = 0;
      if (this.code >= this.range) {
        this.code -= this.range;
        b = 1;
      }
      this.normalize();
      res = res * 2 + b;
    }
    return res;
  }
  tree(probs             , base        , n        )         {
    let m = 1;
    for (let i = 0; i < n; i++) m = (m << 1) | this.bit(probs, base + m);
    return m - (1 << n);
  }
  reverse(probs             , base        , n        )         {
    let m = 1;
    let sym = 0;
    for (let i = 0; i < n; i++) {
      const b = this.bit(probs, base + m);
      m = (m << 1) | b;
      sym |= b << i;
    }
    return sym;
  }
}
const LEN_LOW = 2;
const LEN_MID = 2 + 16 * 8;
const LEN_HIGH = 2 + 2 * 16 * 8;
const LEN_PROBS = LEN_HIGH + 256;
function decodeLen(rc              , probs             , posState        )         {
  if (rc.bit(probs, 0) === 0) return rc.tree(probs, LEN_LOW + posState * 8, 3);
  if (rc.bit(probs, 1) === 0) return 8 + rc.tree(probs, LEN_MID + posState * 8, 3);
  return 16 + rc.tree(probs, LEN_HIGH, 8);
}
function probs(n        )              {
  return new Uint16Array(n).fill(PROB_INIT);
}
export function lzmaDecode(props        , src            , start        , outSize        )             {
  if (props >= 9 * 5 * 5) throw new Error(`lzma: bad properties byte ${props}`);
  const lc = props % 9;
  const lp = Math.floor(props / 9) % 5;
  const pb = Math.floor(props / 45);
  const out = new Uint8Array(outSize);
  if (outSize === 0) return out;
  const literal = probs(0x300 << (lc + lp));
  const isMatch = probs(12 << 4);
  const isRep = probs(12);
  const isRepG0 = probs(12);
  const isRepG1 = probs(12);
  const isRepG2 = probs(12);
  const isRep0Long = probs(12 << 4);
  const posSlot = probs(4 << 6);
  const posDecoders = probs(1 + 128 - 14);
  const align = probs(16);
  const lenProbs = probs(LEN_PROBS);
  const repLenProbs = probs(LEN_PROBS);
  const rc = new RangeDecoder(src, start);
  const pbMask = (1 << pb) - 1;
  const lpMask = (1 << lp) - 1;
  let state = 0;
  let rep0 = 0;
  let rep1 = 0;
  let rep2 = 0;
  let rep3 = 0;
  let pos = 0;
  while (pos < outSize) {
    const posState = pos & pbMask;
    if (rc.bit(isMatch, (state << 4) + posState) === 0) {
      const prev = pos > 0 ? out[pos - 1] : 0;
      const base = 0x300 * (((pos & lpMask) << lc) + (prev >> (8 - lc)));
      let sym = 1;
      if (state >= 7) {
        let match = out[pos - rep0 - 1];
        while (sym < 0x100) {
          const mb = (match >> 7) & 1;
          match <<= 1;
          const b = rc.bit(literal, base + ((1 + mb) << 8) + sym);
          sym = (sym << 1) | b;
          if (mb !== b) break;
        }
      }
      while (sym < 0x100) sym = (sym << 1) | rc.bit(literal, base + sym);
      out[pos++] = sym - 0x100;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }
    let len        ;
    if (rc.bit(isRep, state) !== 0) {
      if (pos === 0) throw new Error("lzma: repeat match before any output");
      if (rc.bit(isRepG0, state) === 0) {
        if (rc.bit(isRep0Long, (state << 4) + posState) === 0) {
          state = state < 7 ? 9 : 11;
          out[pos] = out[pos - rep0 - 1];
          pos++;
          continue;
        }
      } else {
        let dist        ;
        if (rc.bit(isRepG1, state) === 0) {
          dist = rep1;
        } else {
          if (rc.bit(isRepG2, state) === 0) {
            dist = rep2;
          } else {
            dist = rep3;
            rep3 = rep2;
          }
          rep2 = rep1;
        }
        rep1 = rep0;
        rep0 = dist;
      }
      len = decodeLen(rc, repLenProbs, posState);
      state = state < 7 ? 8 : 11;
    } else {
      rep3 = rep2;
      rep2 = rep1;
      rep1 = rep0;
      len = decodeLen(rc, lenProbs, posState);
      state = state < 7 ? 7 : 10;
      const slot = rc.tree(posSlot, (len < 3 ? len : 3) << 6, 6);
      if (slot < 4) {
        rep0 = slot;
      } else {
        const bits = (slot >> 1) - 1;
        let dist = (2 | (slot & 1)) * 2 ** bits;
        if (slot < 14) dist += rc.reverse(posDecoders, dist - slot, bits);
        else dist += rc.direct(bits - 4) * 16 + rc.reverse(align, 0, 4);
        rep0 = dist;
      }
      if (rep0 === 0xffffffff) break;
    }
    if (rep0 >= pos) throw new Error(`lzma: match distance ${rep0 + 1} beyond output position ${pos}`);
    const end = Math.min(pos + len + 2, outSize);
    for (; pos < end; pos++) out[pos] = out[pos - rep0 - 1];
  }
  if (pos !== outSize) throw new Error(`lzma: end marker after ${pos} of ${outSize} bytes`);
  return out;
}
