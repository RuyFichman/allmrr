// UTC day helpers. Days are "YYYY-MM-DD" strings, which sort lexicographically.

export function toDay(iso: string | Date) {
  return (typeof iso === "string" ? new Date(iso) : iso).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function eachDay(from: string, to: string) {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

// The instant a day's snapshot describes: the last moment of that UTC day.
export function endOfDay(day: string) {
  return `${day}T23:59:59.999Z`;
}
