/**
 * Utilitaires de date en heure de Paris, indépendants du fuseau du serveur
 * (Vercel tourne en UTC : « demain 9h » doit rester 9h à Rennes).
 */
export const TZ = "Europe/Paris";

interface Parts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parisParts(date: Date): Parts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), weekday: WEEKDAYS.indexOf(p.weekday ?? "Sun"),
  };
}

/** Instant UTC correspondant à une heure « murale » à Paris (gère l'heure d'été). */
export function fromParis(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Deux passes suffisent pour converger, y compris autour des changements d'heure.
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = parisParts(new Date(ts));
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    ts += guess - asUtc;
  }
  return new Date(ts);
}

/** Début et fin de la journée (Paris) contenant `date`. */
export function parisDayBounds(date = new Date(), offsetDays = 0) {
  const p = parisParts(date);
  const start = fromParis(p.year, p.month, p.day + offsetDays, 0, 0);
  const end = fromParis(p.year, p.month, p.day + offsetDays + 1, 0, 0);
  return { start, end };
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const longDayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

export const formatTime = (d: string | Date) => timeFmt.format(new Date(d));
export const formatDay = (d: string | Date) => dayFmt.format(new Date(d));
export const formatLongDay = (d: string | Date) => longDayFmt.format(new Date(d));

/** « il y a 3 h », « dans 2 j » — pour les listes. */
export function relative(d: string | Date, now = new Date()): string {
  const diff = new Date(d).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}
