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
export function offsetMin(tz: string, d: Date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
  return Math.round((asUTC - d.getTime()) / 60000);
}

/** 空港の現地時刻（date, HH:MM）を、この端末の時間に直す。分からなければ null */
export function toMyTime(code: string | undefined, date: string, time: string | undefined) {
  if (!code) return null;
  return tzToMyTime(AIRPORT_TZ[code.trim().toUpperCase()], date, time);
}
/** あるタイムゾーンの現地時刻を、この端末の時間に直す */
export function tzToMyTime(tz: string | undefined, date: string, time: string | undefined) {
  if (!tz || !time) return null;
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

/** 現地の日付と時刻（その場所のタイムゾーン）を、実際の瞬間（Date）に直す。tz が無ければ端末の時間として扱う */
export function localToDate(date: string, time: string | undefined, tz?: string): Date {
  const [h, m] = (time ?? '00:00').split(':').map(Number);
  const y = +date.slice(0, 4), mo = +date.slice(5, 7) - 1, d = +date.slice(8, 10);
  if (!tz) return new Date(y, mo, d, h || 0, m || 0);
  try {
    const guess = new Date(Date.UTC(y, mo, d, h || 0, m || 0));
    const first = guess.getTime() - offsetMin(tz, guess) * 60000;
    // 夏時間の切り替わり付近のずれを1回補正
    return new Date(guess.getTime() - offsetMin(tz, new Date(first)) * 60000);
  } catch {
    return new Date(y, mo, d, h || 0, m || 0);
  }
}

/** 端末のタイムゾーン */
export const myTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

/** 空港名（地図で探すとき用） */
export const AIRPORT_NAME: Record<string, string> = {
  HND: 'Haneda Airport', NRT: 'Narita International Airport', KIX: 'Kansai International Airport', ITM: 'Itami Airport', NGO: 'Chubu Centrair International Airport',
  CTS: 'New Chitose Airport', FUK: 'Fukuoka Airport', OKA: 'Naha Airport', ICN: 'Incheon International Airport', GMP: 'Gimpo International Airport', PUS: 'Gimhae International Airport',
  TPE: 'Taoyuan International Airport', TSA: 'Taipei Songshan Airport', HKG: 'Hong Kong International Airport', MFM: 'Macau International Airport',
  PEK: 'Beijing Capital International Airport', PKX: 'Beijing Daxing International Airport', PVG: 'Shanghai Pudong International Airport', SHA: 'Shanghai Hongqiao International Airport',
  CAN: 'Guangzhou Baiyun International Airport', BKK: 'Suvarnabhumi Airport', DMK: 'Don Mueang International Airport', SIN: 'Singapore Changi Airport', KUL: 'Kuala Lumpur International Airport',
  CGK: 'Soekarno-Hatta International Airport', DPS: 'Ngurah Rai International Airport', MNL: 'Ninoy Aquino International Airport', SGN: 'Tan Son Nhat International Airport',
  HAN: 'Noi Bai International Airport', DEL: 'Indira Gandhi International Airport', BOM: 'Chhatrapati Shivaji Maharaj International Airport', DXB: 'Dubai International Airport',
  DOH: 'Hamad International Airport', AUH: 'Zayed International Airport', IST: 'Istanbul Airport', LHR: 'Heathrow Airport', LGW: 'Gatwick Airport', STN: 'Stansted Airport',
  LTN: 'Luton Airport', MAN: 'Manchester Airport', EDI: 'Edinburgh Airport', DUB: 'Dublin Airport', CDG: 'Paris Charles de Gaulle Airport', ORY: 'Paris Orly Airport',
  NCE: "Nice Côte d'Azur Airport", AMS: 'Amsterdam Airport Schiphol', BRU: 'Brussels Airport', FRA: 'Frankfurt Airport', MUC: 'Munich Airport', BER: 'Berlin Brandenburg Airport',
  ZRH: 'Zurich Airport', GVA: 'Geneva Airport', VIE: 'Vienna International Airport', PRG: 'Václav Havel Airport Prague', BUD: 'Budapest Ferenc Liszt International Airport',
  WAW: 'Warsaw Chopin Airport', CPH: 'Copenhagen Airport', ARN: 'Stockholm Arlanda Airport', OSL: 'Oslo Airport Gardermoen', HEL: 'Helsinki Airport',
  MAD: 'Adolfo Suárez Madrid–Barajas Airport', BCN: 'Barcelona–El Prat Airport', LIS: 'Lisbon Airport', FCO: 'Rome Fiumicino Airport', MXP: 'Milan Malpensa Airport',
  VCE: 'Venice Marco Polo Airport', ATH: 'Athens International Airport', KEF: 'Keflavík International Airport', JFK: 'John F. Kennedy International Airport',
  EWR: 'Newark Liberty International Airport', LGA: 'LaGuardia Airport', BOS: 'Boston Logan International Airport', IAD: 'Washington Dulles International Airport',
  ORD: "Chicago O'Hare International Airport", DFW: 'Dallas Fort Worth International Airport', DEN: 'Denver International Airport', LAX: 'Los Angeles International Airport',
  SFO: 'San Francisco International Airport', SEA: 'Seattle–Tacoma International Airport', LAS: 'Harry Reid International Airport', HNL: 'Daniel K. Inouye International Airport',
  YVR: 'Vancouver International Airport', YYZ: 'Toronto Pearson International Airport', MEX: 'Mexico City International Airport', CUN: 'Cancún International Airport',
  GRU: 'São Paulo/Guarulhos International Airport', SYD: 'Sydney Airport', MEL: 'Melbourne Airport', BNE: 'Brisbane Airport', PER: 'Perth Airport', CNS: 'Cairns Airport',
  AKL: 'Auckland Airport', GUM: 'Guam International Airport',
};

/** 空港コード → 宿を探すときの都市名（英語） */
export const AIRPORT_CITY: Record<string, string> = {
  HND: 'Tokyo', NRT: 'Tokyo', KIX: 'Osaka', ITM: 'Osaka', NGO: 'Nagoya', CTS: 'Sapporo', FUK: 'Fukuoka', OKA: 'Naha',
  ICN: 'Seoul', GMP: 'Seoul', PUS: 'Busan', TPE: 'Taipei', TSA: 'Taipei', HKG: 'Hong Kong', MFM: 'Macau',
  PEK: 'Beijing', PKX: 'Beijing', PVG: 'Shanghai', SHA: 'Shanghai', CAN: 'Guangzhou', BKK: 'Bangkok', DMK: 'Bangkok',
  SIN: 'Singapore', KUL: 'Kuala Lumpur', CGK: 'Jakarta', DPS: 'Bali', MNL: 'Manila', SGN: 'Ho Chi Minh City', HAN: 'Hanoi',
  DEL: 'New Delhi', BOM: 'Mumbai', DXB: 'Dubai', DOH: 'Doha', AUH: 'Abu Dhabi', IST: 'Istanbul',
  LHR: 'London', LGW: 'London', STN: 'London', LTN: 'London', MAN: 'Manchester', EDI: 'Edinburgh', DUB: 'Dublin',
  CDG: 'Paris', ORY: 'Paris', AMS: 'Amsterdam', BRU: 'Brussels', FRA: 'Frankfurt', MUC: 'Munich', BER: 'Berlin',
  ZRH: 'Zurich', GVA: 'Geneva', VIE: 'Vienna', PRG: 'Prague', BUD: 'Budapest', WAW: 'Warsaw', CPH: 'Copenhagen',
  ARN: 'Stockholm', OSL: 'Oslo', HEL: 'Helsinki', MAD: 'Madrid', BCN: 'Barcelona', LIS: 'Lisbon', FCO: 'Rome',
  MXP: 'Milan', VCE: 'Venice', ATH: 'Athens', KEF: 'Reykjavik', JFK: 'New York', EWR: 'New York', LGA: 'New York',
  BOS: 'Boston', IAD: 'Washington, D.C.', DFW: 'Dallas', DEN: 'Denver', LAX: 'Los Angeles', SFO: 'San Francisco',
  SEA: 'Seattle', LAS: 'Las Vegas', HNL: 'Honolulu', YVR: 'Vancouver', YYZ: 'Toronto', MEX: 'Mexico City', CUN: 'Cancun',
  GRU: 'Sao Paulo', SYD: 'Sydney', MEL: 'Melbourne', BNE: 'Brisbane', PER: 'Perth', CNS: 'Cairns', AKL: 'Auckland', GUM: 'Guam',
};
