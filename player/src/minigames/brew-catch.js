export const FIELD = { x: 6, y: 34, w: 228, h: 280 }         ;
export const ORBIT_POINTS = 20;
export function readCatchSpec(call        , a          , vm                      )            {
  const mode            = call === 19 ? 3 : call === 20 ? 1 : 2;
  const listAt = mode === 3 ? a[4] : a[3];
  const n = Math.max(0, Math.min(20, vm.read(listAt)));
  const templates                  = [];
  for (let i = 0; i < n; i++) {
    const p = listAt + 1 + 3 * i;
    templates.push({ value: vm.read(p), image: vm.read(p + 1), count: Math.max(0, vm.read(p + 2)) });
  }
  return {
    mode, target: a[0], interval: a[1], speed: a[2], spread: mode === 3 ? a[3] : 0,
    angleChance: mode === 1 ? a[5] : 0, angle: mode === 1 ? (a[5] ? a[6] : 0) : 0, leftChance: mode === 2 ? a[5] : 0,
    sprite: mode === 3 ? a[5] : a[4], templates,
  };
}
export function sin16(deg        )         {
  const d = ((deg % 360) + 360) % 360;
  const q = (x        ) => Math.round(65535 * Math.sin((x * Math.PI) / 180));
  if (d <= 90) return q(d);
  if (d <= 180) return q(180 - d);
  if (d <= 270) return -q(d - 180);
  return -q(360 - d);
}
export const sin8 = (deg        ) => sin16(deg) >> 8;
export const cos8 = (deg        ) => sin16(deg + 90) >> 8;
export class Lcg {
          s        ;
  constructor(seed        ) {
    this.s = seed >>> 0;
  }
  next()         {
    this.s = (Math.imul(this.s, 1103515245) + 12345) >>> 0;
    return (this.s & 0x7fffffff) >>> 16;
  }
  mod(n        )         {
    return n > 0 ? this.next() % n : 0;
  }
}
const tdiv = (a        , b        ) => Math.trunc(a / b);
export class CatchGame {
           spec           ;
  score = 0;
           total        ;
  remaining        ;
  px = 0;
  py = 0;
           pw        ;
           ph        ;
  dir = 1;
  objects          = [];
                   sizes        ;
                   counts          ;
                   rng     ;
          acc = 0;
          spawnAcc = 0;
          angle = 0;
                   rx        ;
                   ry        ;
  endMs = 0;
  done = false;
  constructor(spec           , player      , sizes        , seed        ) {
    this.spec = spec;
    this.sizes = sizes;
    this.counts = spec.templates.map((t) => t.count);
    this.total = this.remaining = this.counts.reduce((a, b) => a + b, 0);
    this.rng = new Lcg(seed);
    this.pw = player.w;
    this.ph = player.h;
    const { w: W, h: H } = FIELD;
    if (spec.mode === 1) {
      this.px = tdiv(W - this.pw, 2) << 8;
      this.py = (H - this.ph - 4) << 8;
    } else if (spec.mode === 2) {
      this.px = tdiv(W - this.pw, 2) << 8;
      this.py = (H - this.ph) << 8;
    }
    this.rx = tdiv(W, 2) - tdiv(this.pw, 2);
    this.ry = tdiv(H, 2) - tdiv(this.ph, 2);
    this.angle = tdiv(3 * ORBIT_POINTS, 4);
    this.dir = this.rng.next() & 1 ? -1 : 1;
    if (spec.mode === 3) this.placeOnOrbit();
  }
  get over()          {
    return this.score >= this.spec.target || (this.remaining === 0 && this.objects.length === 0);
  }
  get result()         {
    return Math.max(0, Math.min(this.spec.target, this.score));
  }
  get digit()         {
    const n = this.total ? Math.trunc((this.remaining * 9) / this.total) : 0;
    return !this.over && n === 0 ? 1 : n;
  }
  reverse()       {
    if (!this.over) this.dir = -this.dir;
  }
          ellipse(index        , w        , h        )                   {
    const deg = tdiv(index * 360, ORBIT_POINTS);
    const { w: W, h: H } = FIELD;
    return [
      (tdiv(W, 2) << 8) + this.rx * cos8(deg) - (tdiv(w, 2) << 8),
      (tdiv(H, 2) << 8) + this.ry * (sin16(deg) >> 8) - (tdiv(h, 2) << 8),
    ];
  }
          placeOnOrbit()       {
    [this.px, this.py] = this.ellipse(this.angle, this.pw, this.ph);
  }
  update(dt        )       {
    if (this.done) return;
    this.acc += dt;
    this.spawnAcc += dt;
    if (this.over) {
      this.endMs += dt;
      if (this.endMs > 1000) this.done = true;
    } else {
      if (this.spawnAcc >= this.spec.interval) {
        this.spawn();
        this.spawnAcc = 0;
      }
      if (this.spec.mode === 3) {
        this.angle = (this.angle + this.dir + ORBIT_POINTS) % ORBIT_POINTS;
        this.placeOnOrbit();
      }
      while (this.acc > 10) {
        this.substep();
        this.acc -= 10;
      }
    }
    if (this.score < 0) this.score = 0;
    if (this.score > this.spec.target) this.score = this.spec.target;
  }
          substep()       {
    const { w: W, h: H } = FIELD;
    const m = this.spec.mode;
    if (m === 1 || m === 2) {
      const len = m === 1 ? W : H;
      const step = tdiv(len * this.dir * 128, 100);
      if (m === 1) {
        let x = this.px + step;
        if ((x >> 8) + this.pw >= W) {
          this.dir = -this.dir;
          x = (W - this.pw - 1) << 8;
        } else if (x >> 8 <= 0) {
          this.dir = -this.dir;
          x = 1 << 8;
        }
        this.px = x;
      } else {
        let y = this.py + step;
        if ((y >> 8) + this.ph >= H) {
          this.dir = -this.dir;
          y = (H - this.ph - 1) << 8;
        } else if (y >> 8 <= 0) {
          this.dir = -this.dir;
          y = 1 << 8;
        }
        this.py = y;
      }
    }
    const A2 = this.spec.speed;
    const px = this.px >> 8;
    const py = this.py >> 8;
    for (let i = 0; i < this.objects.length; i++) {
      let o = this.objects[i];
      const s = this.sizes[o.t] ?? { w: 0, h: 0 };
      const ox = o.x >> 8;
      const oy = o.y >> 8;
      if (ox + s.w < 0 || ox > W || oy + s.h < 0 || oy > H) {
        this.objects.splice(i, 1);
        o = this.objects[i];
        if (!o) break;
      } else {
        if (m === 1) {
          if (ox + s.w >= W) {
            o.vx = -o.vx;
            o.x = (W - s.w - 1) << 8;
          } else if (ox <= 0) {
            o.vx = -o.vx;
            o.x = 1 << 8;
          }
        }
        const cx = (o.x >> 8) + 2;
        const cy = (o.y >> 8) + 2;
        const cw = s.w - 4;
        const ch = s.h - 4;
        if (px <= cx + cw && cx <= px + this.pw && py <= cy + ch && cy <= py + this.ph) {
          this.score += this.spec.templates[o.t]?.value ?? 0;
          this.objects.splice(i, 1);
          o = this.objects[i];
          if (!o) break;
        }
      }
      o.x += tdiv(A2 * o.vx, 256);
      o.y += tdiv(A2 * o.vy, 256);
    }
  }
          spawn()       {
    if (this.remaining <= 0) return;
    const r = this.rng.mod(this.remaining);
    let sum = 0;
    let t = 0;
    for (; t < this.counts.length; t++) {
      sum += this.counts[t];
      if (r < sum) break;
    }
    if (t >= this.counts.length) return;
    this.counts[t]--;
    this.remaining--;
    const s = this.sizes[t] ?? { w: 0, h: 0 };
    const { w: W, h: H } = FIELD;
    const A2 = this.spec.speed;
    const o        = { x: 0, y: 0, vx: 0, vy: 0, t };
    if (this.spec.mode === 1) {
      o.x = this.rng.mod(W - s.w) << 8;
      o.y = (1 - s.h) << 8;
      const a = this.rng.mod(100) < this.spec.angleChance ? this.spec.angle : 0;
      const sn = sin8(a) || 1;
      const c = cos8(a);
      o.vx = tdiv(A2 * (((this.rng.mod(2 * sn) - sn) * 128) >> 8), 256);
      o.vy = tdiv(A2 * ((c * 128) >> 8), 256);
    } else if (this.spec.mode === 2) {
      const v = tdiv(A2 * 128, 256);
      if (this.rng.mod(100) < this.spec.leftChance) {
        o.x = (1 - s.w) << 8;
        o.vx = v;
      } else {
        o.x = (W - 1) << 8;
        o.vx = -v;
      }
      o.y = this.rng.mod(H - s.h) << 8;
    } else {
      const k = this.rng.mod(ORBIT_POINTS);
      const S = this.rng.mod(2 * this.spec.spread) + A2 - this.spec.spread;
      o.x = (tdiv(W, 2) - tdiv(s.w, 2)) << 8;
      o.y = (tdiv(H, 2) - tdiv(s.h, 2)) << 8;
      const [tx, ty] = this.ellipse(k, s.w, s.h);
      const D = tdiv(6553600, Math.max(1, tdiv(S, 2)));
      o.vx = tdiv((tx - o.x) * 256, D);
      o.vy = tdiv((ty - o.y) * 256, D);
    }
    this.objects.push(o);
  }
}
