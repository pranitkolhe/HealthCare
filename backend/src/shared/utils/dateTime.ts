export function parseTimeString(time: string) {
  const [hoursStr, minutesStr] = time.split(':');
  return { hours: Number(hoursStr), minutes: Number(minutesStr) };
}

export function toUtcDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function formatIso(date: Date) {
  return date.toISOString();
}

export function isSameUtcDate(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

export function getDayOfWeek(date: Date) {
  return date.getUTCDay();
}

export function isInPast(date: Date) {
  return date.getTime() < Date.now();
}
