export const SCREEN_W = 240;
export const SCREEN_H = 320;
const BACK = "Back";
const KEYBOARD                           = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "select", " ": "select",
  NumpadEnter: "select", Backspace: "clr", Escape: "clr", F1: "soft1", "[": "soft1", F2: "soft2", "]": "soft2",
};
const PAD                                = [
  [[null, ""], ["up", "▲"], [null, ""]],
  [["left", "◀"], ["select", "OK"], ["right", "▶"]],
  [[null, ""], ["down", "▼"], ["clr", BACK]],
];
export class Phone {
           root             ;
           canvas                   ;
           g                          ;
  onKey                                         = () => {};
                   held = new Set          ();
                   cleanup                 = [];
  constructor(parent             ) {
    this.root = el("div", "phone", parent);
    const bezel = el("div", "phone-bezel", this.root);
    this.canvas = el("canvas", "phone-screen", bezel);
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    const g = this.canvas.getContext("2d");
    if (!g) throw new Error("no 2D canvas");
    g.imageSmoothingEnabled = false;
    this.g = g;
    const pad = el("div", "phone-pad", this.root);
    for (const row of PAD) {
      const r = el("div", "phone-row", pad);
      for (const [key, label] of row) {
        if (!key) {
          el("span", "phone-key blank", r);
          continue;
        }
        const b = el("button", `phone-key k-${key}`, r);
        b.type = "button";
        b.setAttribute("aria-label", ARIA[key] ?? label);
        el("span", "main", b, label);
        const down = (e       ) => {
          e.preventDefault();
          b.classList.add("down");
          this.press(key, true);
        };
        const up = (e       ) => {
          e.preventDefault();
          b.classList.remove("down");
          this.press(key, false);
        };
        b.addEventListener("pointerdown", down);
        b.addEventListener("pointerup", up);
        b.addEventListener("pointerleave", (e) => {
          if (this.held.has(key)) up(e);
        });
        b.addEventListener("contextmenu", (e) => e.preventDefault());
      }
    }
    const onKey = (down         ) => (e               ) => {
      const key = KEYBOARD[e.key] ?? KEYBOARD[e.code];
      if (!key || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (down && e.repeat) return;
      this.press(key, down);
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    const blur = () => {
      for (const k of [...this.held]) this.press(k, false);
    };
    window.addEventListener("blur", blur);
    this.cleanup.push(() => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    });
  }
  isDown(key          )          {
    return this.held.has(key);
  }
  setBackLabel(left        )       {
    const s = this.root.querySelector(".k-clr .main");
    if (s) s.textContent = left || BACK;
  }
  dispose()       {
    for (const f of this.cleanup) f();
    this.root.remove();
  }
          press(key          , down         )       {
    if (down === this.held.has(key)) return;
    if (down) this.held.add(key);
    else this.held.delete(key);
    this.onKey(key, down);
  }
}
const ARIA                                    = {
  up: "Up", down: "Down", left: "Left", right: "Right", select: "OK", clr: "Back",
};
function el                                       (tag   , cls        , parent             , text         )                           {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}
