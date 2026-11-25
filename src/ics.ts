// カレンダー（.ics）への書き出し。iPhoneの「カレンダー」・Googleカレンダー・Outlookで開ける
// ・時刻のある予定は、その場所のタイムゾーンで正しい瞬間にしてから UTC で書く（時差で時刻がずれない）
// ・予約番号・座席・メモも説明欄に入れる（TripIt の「カレンダーにメモが出ない」という不満への対応）
import { localToDate } from './airports';
import type { Booking, Trip } from './data';

export type IcsOpts = {
  tzOf: (b: Booking) => string | undefined; // 出発・開始の場所のタイムゾーン
  arrTzOf: (b: Booking) => string | undefined; // 到着・終了の場所のタイムゾーン
  typeLabel: (type: string) => string;
  L: { code: string; seat: string; from: string; to: string; memo: string; trip: string };
  now?: Date;
};

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const ymd = (s: string) => s.replace(/-/g, '');
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const nextDay = (s: string) => {
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + 1));
  return d.toISOString().slice(0, 10);
};

/** 1行75バイトで折り返す（RFC 5545）。日本語の文字の途中では切らない */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function eventOf(b: Booking, trip: Trip, o: IcsOpts): string[] | null {
  if (b.cancelled || !isDate(b.start)) return null;
  const title = b.title || o.typeLabel(b.type);
  const route = b.type === 'flight' || b.type === 'train' || b.type === 'bus' ? [b.from, b.to].filter(Boolean).join(' → ') : '';
  const summary = route && !title.includes(route) ? `${title}  ${route}` : title;
  const desc: string[] = [];
  if (b.code) desc.push(`${o.L.code}: ${b.code}`);
  if (b.seat) desc.push(`${o.L.seat}: ${b.seat}`);
  if (b.from) desc.push(`${o.L.from}: ${b.from}`);
  if (b.to) desc.push(`${o.L.to}: ${b.to}`);
  if (b.memo) desc.push(`${o.L.memo}: ${b.memo}`);
  desc.push(`${o.L.trip}: ${trip.name} (Tripfold)`);
  const ev = ['BEGIN:VEVENT', `UID:${b.id}@tripfold.net`, `DTSTAMP:${utc(o.now ?? new Date())}`, `SUMMARY:${esc(summary)}`];
  // ホテル・時刻のない予定は終日（ホテルは泊まる夜の日付すべて）
  if (b.type === 'hotel' || !b.startTime) {
    const endEx = isDate(b.end) && b.end! > b.start ? b.end! : nextDay(b.start);
    // ホテルはチェックアウトの日を含めない（泊まる夜だけ）。それ以外で終了日があれば、その日まで含める
    const last = b.type === 'hotel' ? endEx : isDate(b.end) && b.end! > b.start ? nextDay(b.end!) : endEx;
    ev.push(`DTSTART;VALUE=DATE:${ymd(b.start)}`, `DTEND;VALUE=DATE:${ymd(last)}`);
  } else {
    const st = localToDate(b.start, b.startTime, o.tzOf(b));
    let en: Date | null = null;
    if (b.endTime || isDate(b.end)) en = localToDate(isDate(b.end) ? b.end! : b.start, b.endTime ?? b.startTime, o.arrTzOf(b));
    if (!en || !(en.getTime() > st.getTime())) en = new Date(st.getTime() + 60 * 60000);
    ev.push(`DTSTART:${utc(st)}`, `DTEND:${utc(en)}`);
  }
  const loc = b.type === 'flight' || b.type === 'train' || b.type === 'bus' ? b.from : b.from || (b.type !== 'car' ? b.title : undefined);
  if (loc) ev.push(`LOCATION:${esc(loc)}`);
  ev.push(`DESCRIPTION:${esc(desc.join('\n'))}`, 'END:VEVENT');
  return ev;
}

/** 旅全体、または予定ひとつを .ics の文字にする */
export function buildIcs(trip: Trip, o: IcsOpts, only?: Booking): string {
  const list = only ? [only] : trip.bookings;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tripfold//Tripfold//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(trip.name)}`];
  for (const b of list) {
    const ev = eventOf(b, trip, o);
    if (ev) lines.push(...ev);
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** カレンダーに入る予定の数（ボタンを出すかどうかに使う） */
export const icsCount = (trip: Trip) => trip.bookings.filter((b) => !b.cancelled && isDate(b.start)).length;
