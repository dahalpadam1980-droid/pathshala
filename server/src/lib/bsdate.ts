import NepaliDate from 'nepali-date-converter';

const NP_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

/** AD (Gregorian) → BS string 'YYYY-MM-DD'. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function adToBs(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  const bs = new NepaliDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  const { year, month, date: day } = bs.getBS();
  return `${pad(year)}-${pad(month + 1)}-${pad(day)}`;
}

/** BS string 'YYYY-MM-DD' → JS Date (local midnight). */
export function bsToAd(bs: string): Date {
  const [y, m, d] = bs.split('-').map(Number);
  if (!y || !m || !d) throw new Error('Invalid BS date, expected YYYY-MM-DD');
  const nep = new NepaliDate(y, m - 1, d);
  return nep.toJsDate();
}

/** Format a BS date for display: en → '2082-07-21', ne → Nepali digits. */
export function formatBs(bs: string, lang: 'en' | 'ne' = 'en'): string {
  if (lang === 'en') return bs;
  return bs.replace(/[0-9]/g, (c) => NP_DIGITS[Number(c)]);
}

/** Format an AD date as BS month name + year, e.g. 'Aswin 2082' / 'असोज २०८२'. */
export function formatAdAsBs(date: Date | string, lang: 'en' | 'ne' = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const nep = new NepaliDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  return nep.format('MMMM YYYY', lang === 'ne' ? 'np' : 'en');
}

/** Today's date in BS 'YYYY-MM-DD'. */
export function todayBs(): string {
  return adToBs(new Date());
}

/** Current BS year (e.g. 2083). */
export function currentBsYear(): number {
  return new NepaliDate().getBS().year;
}

/** Days in a given BS month (1-12). */
export function bsMonthLength(year: number, month1Based: number): number {
  const first = new NepaliDate(year, month1Based - 1, 1);
  const nextMonth = month1Based === 12 ? new NepaliDate(year + 1, 0, 1) : new NepaliDate(year, month1Based, 1);
  return Math.round((nextMonth.toJsDate().getTime() - first.toJsDate().getTime()) / 86400000);
}

/** BS month names. */
export const BS_MONTHS_EN = [
  'Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Aswin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
];
export const BS_MONTHS_NE = [
  'बैशाख', 'जेठ', 'असार', 'श्रावण', 'भदौ', 'असोज',
  'कात्तिक', 'मंसिर', 'पुष', 'माघ', 'फागुन', 'चैत',
];

/** Last calendar day of the AD month for a 'YYYY-MM' key (fixes e.g. 2026-11-31). */
export function monthEndKey(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) throw new Error('Invalid month key, expected YYYY-MM');
  const day = new Date(y, m, 0).getDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** Generate month keys ('YYYY-MM' AD) between two dates (for fee billing). */export function monthKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

export { NepaliDate };
