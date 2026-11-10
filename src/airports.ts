// 主な空港のタイムゾーン（現地時間 ↔ 自分の時間の換算に使う）
export const AIRPORT_TZ: Record<string, string> = {
  HND: 'Asia/Tokyo', NRT: 'Asia/Tokyo', KIX: 'Asia/Tokyo', ITM: 'Asia/Tokyo', NGO: 'Asia/Tokyo', CTS: 'Asia/Tokyo', FUK: 'Asia/Tokyo', OKA: 'Asia/Tokyo',
  ICN: 'Asia/Seoul', GMP: 'Asia/Seoul', PUS: 'Asia/Seoul', TPE: 'Asia/Taipei', TSA: 'Asia/Taipei', HKG: 'Asia/Hong_Kong', MFM: 'Asia/Macau',
  PEK: 'Asia/Shanghai', PKX: 'Asia/Shanghai', PVG: 'Asia/Shanghai', SHA: 'Asia/Shanghai', CAN: 'Asia/Shanghai',
  BKK: 'Asia/Bangkok', DMK: 'Asia/Bangkok', SIN: 'Asia/Singapore', KUL: 'Asia/Kuala_Lumpur', CGK: 'Asia/Jakarta', DPS: 'Asia/Makassar',
  MNL: 'Asia/Manila', SGN: 'Asia/Ho_Chi_Minh', HAN: 'Asia/Bangkok', DEL: 'Asia/Kolkata', BOM: 'Asia/Kolkata', DXB: 'Asia/Dubai', DOH: 'Asia/Qatar', AUH: 'Asia/Dubai', IST: 'Europe/Istanbul',
  LHR: 'Europe/London', LGW: 'Europe/London', STN: 'Europe/London', LTN: 'Europe/London', MAN: 'Europe/London', EDI: 'Europe/London', DUB: 'Europe/Dublin',
  CDG: 'Europe/Paris', ORY: 'Europe/Paris', NCE: 'Europe/Paris', AMS: 'Europe/Amsterdam', BRU: 'Europe/Brussels', FRA: 'Europe/Berlin', MUC: 'Europe/Berlin', BER: 'Europe/Berlin',
  ZRH: 'Europe/Zurich', GVA: 'Europe/Zurich', VIE: 'Europe/Vienna', PRG: 'Europe/Prague', BUD: 'Europe/Budapest', WAW: 'Europe/Warsaw', CPH: 'Europe/Copenhagen', ARN: 'Europe/Stockholm',
  OSL: 'Europe/Oslo', HEL: 'Europe/Helsinki', MAD: 'Europe/Madrid', BCN: 'Europe/Madrid', LIS: 'Europe/Lisbon', FCO: 'Europe/Rome', MXP: 'Europe/Rome', VCE: 'Europe/Rome', ATH: 'Europe/Athens', KEF: 'Atlantic/Reykjavik',
  JFK: 'America/New_York', EWR: 'America/New_York', LGA: 'America/New_York', BOS: 'America/New_York', IAD: 'America/New_York', ORD: 'America/Chicago', DFW: 'America/Chicago',
  DEN: 'America/Denver', LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles', SEA: 'America/Los_Angeles', LAS: 'America/Los_Angeles', HNL: 'Pacific/Honolulu',
  YVR: 'America/Vancouver', YYZ: 'America/Toronto', MEX: 'America/Mexico_City', CUN: 'America/Cancun', GRU: 'America/Sao_Paulo',
  SYD: 'Australia/Sydney', MEL: 'Australia/Melbourne', BNE: 'Australia/Brisbane', PER: 'Australia/Perth', CNS: 'Australia/Brisbane', AKL: 'Pacific/Auckland', GUM: 'Pacific/Guam',
};

/** そのタイムゾーンの、その日時のUTCからのずれ（分） */
function offsetMin(tz: string, d: Date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
  return Math.round((asUTC - d.getTime()) / 60000);
}

/** 空港の現地時刻（date, HH:MM）を、この端末の時間に直す。分からなければ null */
export function toMyTime(code: string | undefined, date: string, time: string | undefined) {
  if (!code || !time) return null;
  const tz = AIRPORT_TZ[code.trim().toUpperCase()];
  if (!tz) return null;
  try {
    const [h, m] = time.split(':').map(Number);
    const guess = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, m));
    const utc = guess.getTime() - offsetMin(tz, guess) * 60000;
    const mine = new Date(utc);
    const myOff = -mine.getTimezoneOffset();
    const diffH = (offsetMin(tz, mine) - myOff) / 60;
    const hh = String(mine.getHours()).padStart(2, '0');
    const mm = String(mine.getMinutes()).padStart(2, '0');
    const myDate = `${mine.getFullYear()}-${String(mine.getMonth() + 1).padStart(2, '0')}-${String(mine.getDate()).padStart(2, '0')}`;
    const mark = myDate === date ? '' : myDate > date ? ' (+1)' : ' (-1)';
    return { time: `${hh}:${mm}${mark}`, diffH };
  } catch {
    return null;
  }
}
