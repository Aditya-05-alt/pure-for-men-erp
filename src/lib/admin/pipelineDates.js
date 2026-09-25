export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function toCalendarISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function enumerateDatesInclusive(fromIso, toIso) {
  const out = [];
  if (!fromIso || !toIso) return out;
  const start = new Date(`${fromIso}T12:00:00`);
  const end = new Date(`${toIso}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cur = new Date(start);
  while (cur <= end) {
    out.push(toCalendarISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Last N calendar days ending on `endIso` (inclusive). */
export function lastNDays(endIso, count = 5) {
  const end = new Date(`${endIso || todayISO()}T12:00:00`);
  if (Number.isNaN(end.getTime())) return [];
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    days.push(toCalendarISO(d));
  }
  return days;
}

export function missingDatesInRange(fromIso, toIso, filledSet) {
  return enumerateDatesInclusive(fromIso, toIso).filter((d) => !filledSet.has(d));
}
