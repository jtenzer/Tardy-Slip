export function emptyState()              {
  return { ints: {}, flags: {}, arrays: {}, names: [], registeredNames: [], expressions: {}, portraits: {} };
}
export class Entities {
  s             ;
  constructor(s              = emptyState()) {
    this.s = s;
  }
  getInt(entity        , prop        )         {
    return this.s.ints[`${entity}:${prop}`] ?? 0;
  }
  setInt(entity        , prop        , v        )       {
    this.s.ints[`${entity}:${prop}`] = v;
  }
  getFlag(a        , b        , c        )         {
    return this.s.flags[`${a}:${b}:${c}`] ?? 0;
  }
  setFlag(a        , b        , c        , v        )       {
    this.s.flags[`${a}:${b}:${c}`] = v;
  }
  array(entity        , prop        )           {
    return (this.s.arrays[`${entity}:${prop}`] ??= []);
  }
  getName(token        )         {
    return this.s.names.find(([t]) => t === token)?.[1] ?? "";
  }
  setName(token        , text        )       {
    const e = this.s.names.find(([t]) => t === token);
    if (e) e[1] = text;
    else this.s.names.push([token, text]);
  }
  replaceNames(text        )         {
    for (let pass = 0; pass < 16; pass++) {
      let changed = false;
      for (const [token, value] of this.s.names) {
        if (!token || !text.includes(token)) continue;
        text = text.split(token).join(value);
        changed = true;
      }
      if (!changed) break;
    }
    return text;
  }
  registerName(index        , name        )       {
    this.s.registeredNames[index] = name;
  }
  indexOfName(name        )         {
    return this.s.registeredNames.indexOf(name);
  }
}
