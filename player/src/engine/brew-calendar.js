export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function newCalendar()                    {
  return { cfg: null, events: [], entries: [], lastId: 0, day: 0, minute: 480, checked: 479, pending: [], nested: [], current: 0 };
}
function monthDays(m        )         {
  while (m > 12) m -= 12;
  return MONTH_DAYS[m - 1] ?? 30;
}
export function dayIndex(s                   , month        , day        )         {
  const sm = s.cfg?.startMonth ?? 1;
  const sd = s.cfg?.startDay ?? 1;
  if (month < sm) month += 12;
  if (month === sm) return day - sd;
  let n = monthDays(sm) - sd;
  for (let m = sm + 1; m < month; m++) n += monthDays(m);
  return n + day;
}
export function dateOf(s                   , idx        )                   {
  let m = s.cfg?.startMonth ?? 1;
  let d = s.cfg?.startDay ?? 1;
  for (let i = 0; i < idx; i++) {
    d++;
    if (d > monthDays(m)) {
      d = 1;
      m++;
    }
    if (m > 12) m = 1;
  }
  return [m, d];
}
export function weekday(s                   , idx        )         {
  return (((s.cfg?.weekdayOffset ?? 1) + idx) % 7 + 7) % 7;
}
export function nextSchoolDay(s                   , idx        )         {
  if (!s.cfg) return idx + 1;
  const w = weekday(s, idx);
  return w === 1 || w === 3 ? idx + 2 : w === 5 ? idx + 3 : -1;
}
function lastDay(s                   )         {
  if (s.cfg) return dayIndex(s, s.cfg.endMonth, s.cfg.endDay);
  return s.entries.reduce((n, [d]) => Math.max(n, d), 0);
}
export function configure(s                   , cfg                    )       {
  s.cfg = cfg;
  s.day = 0;
  s.minute = cfg.dayStart;
  s.checked = cfg.dayStart - 1;
}
export function schedule(s                   , e                                  , days          )         {
  const id = ++s.lastId;
  s.events.push({ ...e, id, fields: [] });
  for (const d of days) s.entries.push([d, id]);
  return id;
}
export function weekdaysBetween(s                   , from        , to        , weekdays        )           {
  const want = new Set        ();
  for (const w of weekdays.split(/[|,]/)) {
    const k = w.trim().toLowerCase().slice(0, 2);
    const i = DAY_NAMES.findIndex((n) => n.toLowerCase().startsWith(k));
    if (k && i >= 0) want.add(i);
  }
  const out           = [];
  for (let d = from; d <= to && out.length < 400; d++) if (want.has(weekday(s, d))) out.push(d);
  return out;
}
export function event(s                   , id        )                        {
  return s.events.find((e) => e.id === id);
}
function collect(s                   , lo        , hi        )              {
  const out              = [];
  for (const [d, id] of s.entries) {
    if (d !== s.day) continue;
    const e = event(s, id);
    if (e && e.minute >= lo && e.minute <= hi) out.push(e);
  }
  return out;
}
export function fireDue(s                   )       {
  if (s.day < 0) return;
  const now = Math.min(s.minute, 1440);
  if (now <= s.checked) return;
  for (const e of collect(s, s.checked + 1, now)) if (e.duration < 0) s.nested.push(e.id);
  s.checked = now;
}
function advanceTo(s                   , t        )       {
  if (t > s.minute) s.minute = t;
  const end = s.cfg?.dayEnd ?? 1440;
  if (s.minute <= end) return;
  const next = nextSchoolDay(s, s.day);
  if (next < 0 || next > lastDay(s)) {
    s.day = -1;
    return;
  }
  s.day = next;
  s.minute = s.cfg?.dayStart ?? 0;
  s.checked = s.minute - 1;
}
function anyLeft(s                   )          {
  return s.entries.some(([d, id]) => d > s.day || (d === s.day && (event(s, id)?.minute ?? -1) >= s.minute));
}
export function advanceWithin(s                   , percent        )       {
  const e = event(s, s.current);
  if (!e) return;
  const end = e.minute + Math.max(0, e.duration) - 1;
  s.minute = e.minute + Math.trunc((percent * (end - e.minute)) / 100);
}
export function step(s                   )               {
  const queued = s.pending.shift();
  if (queued !== undefined) {
    const e = event(s, queued);
    if (e) return { kind: "run", event: e };
  }
  if (s.day < 0 || !anyLeft(s)) return { kind: "over" };
  const slotEnd = Math.min(Math.floor(s.minute / 30) * 30 + 29, 1440);
  const due = collect(s, s.minute, slotEnd);
  const timed = due.filter((e) => e.duration >= 0);
  if (timed.length) {
    const e = timed.find((x) => x.flag) ?? timed[0];
    s.minute = Math.max(s.minute, e.minute);
    s.checked = s.minute;
    s.current = e.id;
    return { kind: "run", event: e };
  }
  const from = s.minute;
  const day = s.day;
  for (const e of due) s.pending.push(e.id);
  s.checked = Math.max(s.checked, slotEnd);
  advanceTo(s, slotEnd + 1);
  if (s.pending.length) return step(s);
  return { kind: "advance", day, from, to: slotEnd };
}
export function finish(s                   )       {
  const e = s.current ? event(s, s.current) : undefined;
  s.current = 0;
  if (!e || s.day < 0) return;
  const end = e.minute + Math.max(0, e.duration) - 1;
  if (end > s.checked) {
    for (const x of collect(s, s.checked + 1, end)) if (x.duration < 0) s.pending.push(x.id);
    s.checked = end;
  }
  advanceTo(s, Math.max(s.minute, end + 1, e.minute + 1));
}
export function plannerRows(s                   , day        )                                      {
  const byRow = new Map                     ();
  for (const [d, id] of s.entries) {
    const e = d === day ? event(s, id) : undefined;
    if (!e) continue;
    const r = Math.floor(e.minute / 90);
    byRow.set(r, [...(byRow.get(r) ?? []), e]);
  }
  const out                                      = [];
  for (const [row, list] of byRow) {
    const pick = list.find((e) => e.flag) ?? [...list].reverse().find((e) => e.icon !== -1);
    if (pick) out.push({ row, event: pick });
  }
  return out.sort((a, b) => a.row - b.row);
}
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];
