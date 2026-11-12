// 予約メールやスクショの文字から、予約の中身を読み取る（ネットに送らず端末の中だけで）
import { Booking, BookingType } from './data';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // フランス語・スペイン語・ドイツ語・イタリア語・ポルトガル語
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  januar: 1, februar: 2, märz: 3, maerz: 3, juni: 6, juli: 7, oktober: 10, dezember: 12,
  gennaio: 1, febbraio: 2, aprile: 4, maggio: 5, giugno: 6, luglio: 7, settembre: 9, ottobre: 10, dicembre: 12,
  janeiro: 1, fevereiro: 2, março: 3, maio: 5, junho: 6, julho: 7, setembro: 9, outubro: 10, dezembro: 12,
  okt: 10, dez: 12, mär: 3, mrz: 3, déc: 12, févr: 2, avr: 4, juil: 7, ene: 1, dic: 12, ago: 8, set: 9, out: 10, mag: 5, giu: 6, lug: 7, ott: 10,
};
const MON_RE = '(' + Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|') + ')';
const pad = (n: number) => String(n).padStart(2, '0');

type Found = { date: string; index: number; line: string };

/** 文中の日付をすべて見つける（年がなければ今日以降のいちばん近い年） */
export function findDates(text: string, today = new Date()): Found[] {
  const out: Found[] = [];
  const add = (y: number | null, m: number, d: number, index: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    let yy = y ?? today.getFullYear();
    if (yy < 100) yy += 2000;
    if (y == null) {
      const cand = new Date(yy, m - 1, d);
      if (cand.getTime() < today.getTime() - 86400000 * 30) yy += 1;
    }
    const line = text.slice(text.lastIndexOf('\n', index) + 1, text.indexOf('\n', index) === -1 ? undefined : text.indexOf('\n', index));
    out.push({ date: `${yy}-${pad(m)}-${pad(d)}`, index, line });
  };
  const mon = MON_RE + '(?![a-zà-ÿ])';
  let m: RegExpExecArray | null;
  const r1 = /(20\d{2})\s?[\/\-.年년]\s?(\d{1,2})\s?[\/\-.月월]\s?(\d{1,2})\s?[日일]?/g; // 2026-02-14 / 2026年2月14日
  while ((m = r1.exec(text))) add(+m[1], +m[2], +m[3], m.index);
  const r2 = new RegExp(`(?<![\\d:])(\\d{1,2})(?:st|nd|rd|th|er|º)?\\.?(?:[\\s\\-]|de\\s)*${mon}\\.?,?(?:[\\s\\-]|de\\s)*(20\\d{2}|\\d{2}(?!\\d|:))?`, 'gi'); // 14 Feb 2026 / 24JUN26 / 15 de diciembre de 2026
  while ((m = r2.exec(text))) add(m[3] ? +m[3] : null, MONTHS[m[2].toLowerCase()], +m[1], m.index);
  const r3 = new RegExp(`(?<![a-zà-ÿ])${mon}\\.?\\s+(\\d{1,2})(?!\\d|:)(?:st|nd|rd|th)?,?\\s*(20\\d{2})?`, 'gi'); // Feb 14, 2026
  while ((m = r3.exec(text))) add(m[3] ? +m[3] : null, MONTHS[m[1].toLowerCase()], +m[2], m.index);
  const r4 = /(?<![\d\/])(\d{1,2})\s?[月월]\s?(\d{1,2})\s?[日일]/g; // 2月14日（年なし）
  while ((m = r4.exec(text))) {
    if (/20\d{2}\s?[年년]\s?$/.test(text.slice(Math.max(0, m.index - 6), m.index))) continue;
    add(null, +m[1], +m[2], m.index);
  }
  const r5 = /(?<![\d\/.])(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})/g; // 14/02/2026・14.02.2026（ヨーロッパ式）
  while ((m = r5.exec(text))) {
    // ふつうは 日/月/年。2つ目が13以上なら アメリカ式の 月/日/年
    const us = +m[2] > 12 && +m[1] <= 12;
    add(+m[3], us ? +m[1] : +m[2], us ? +m[2] : +m[1], m.index);
  }
  // 同じ位置の重複を消して、出てきた順に
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.index - b.index)
    .filter((f) => {
      const k = f.date + ':' + Math.floor(f.index / 3);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

const findTimes = (s: string) => {
  const out: string[] = [];
  const re = /(?<!\d)([01]?\d|2[0-3])[:：時h]([0-5]\d)(?!\d)\s*(am|pm|AM|PM)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let h = +m[1];
    if (m[3] && /pm/i.test(m[3]) && h < 12) h += 12;
    if (m[3] && /am/i.test(m[3]) && h === 12) h = 0;
    out.push(`${pad(h)}:${m[2]}`);
  }
  return out;
};

// 通貨の書き方 → 通貨コード（長いものから順に調べる）
const CUR_SIGNS: [string, string][] = [
  ['NZ$', 'NZD'], ['A$', 'AUD'], ['AU$', 'AUD'], ['C$', 'CAD'], ['CA$', 'CAD'], ['HK$', 'HKD'], ['S$', 'SGD'], ['NT$', 'TWD'], ['US$', 'USD'],
  ['R$', 'BRL'], ['MX$', 'MXN'], ['$', 'USD'], ['£', 'GBP'], ['€', 'EUR'], ['¥', 'JPY'], ['円', 'JPY'], ['₩', 'KRW'], ['원', 'KRW'], ['฿', 'THB'],
  ['₹', 'INR'], ['Rs.', 'INR'], ['₺', 'TRY'], ['₫', 'VND'], ['₱', 'PHP'], ['zł', 'PLN'], ['Kč', 'CZK'], ['Ft', 'HUF'], ['RM', 'MYR'], ['Rp', 'IDR'],
  ['元', 'CNY'], ['RMB', 'CNY'], ['ユーロ', 'EUR'], ['ドル', 'USD'], ['ポンド', 'GBP'], ['ウォン', 'KRW'], ['バーツ', 'THB'],
];
const ISO = ['JPY','GBP','EUR','USD','KRW','AUD','CAD','NZD','CNY','TWD','HKD','SGD','THB','PHP','MYR','IDR','VND','INR','CHF','SEK','NOK','DKK','ISK','PLN','CZK','HUF','TRY','AED','QAR','SAR','ILS','ZAR','MXN','BRL','ARS','CLP'];
const esc = (x: string) => x.replace(/[$.]/g, (c) => '\\' + c);
const SIGN_RE = [...CUR_SIGNS.map(([k]) => k)].sort((x, y) => y.length - x.length).map(esc).join('|');
const CUR_RE = `(${ISO.join('|')}|${SIGN_RE})`;
const SUF_RE = `(${ISO.join('|')}|${SIGN_RE.replace(/\|\\\$(?=\||$)/, '')}|kr)`;
const curCode = (x?: string, num?: string) => {
  if (!x) return undefined;
  if (ISO.includes(x)) return x;
  if (x === 'kr') return 'SEK';
  return CUR_SIGNS.find(([k]) => k === x)?.[1];
};

/** "1.234,56" "1,234.56" "59,00" "12,980" を数字に */
export function toNumber(raw: string): number {
  const s = raw.replace(/[\s\u202f，]/g, (c) => (c === '，' ? ',' : ''));
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (lastSep < 0) return parseFloat(s);
  const tail = s.length - lastSep - 1;
  if (tail === 3 && s.split(/[.,]/).length >= 2 && !(s[lastSep] === '.' && s.indexOf(',') < 0 && s.split('.').length === 2 && /^0/.test(s))) {
    return parseFloat(s.replace(/[.,]/g, '')); // 区切りのあとが3桁 → 桁区切り
  }
  return parseFloat(s.slice(0, lastSep).replace(/[.,]/g, '') + '.' + s.slice(lastSep + 1));
}

const STRONG = /(お支払い?金額|お支払い?総額|お支払い?予定金額|お支払い?合計|支払金額|ご請求|total (?:paid|amount|charged|price|due)|amount (?:paid|charged)|payment total|grand total|estimated total|total amount|you paid|charged)/i;
const NORMAL = /(合計|総額|総計|total|summe|montant|importe)/i;
const WEAK = /(price|料金|運賃|fare|金額|代金|cost)/i;
const PENALTY = /(per night|\/\s?night|1泊あたり|1泊|avg|average|daily rate|per day|\bx\s?\d|×|割引|クーポン|discount|coupon|手数料|概算|うち|cleaning|清掃|サービス料|service fee|taxes|booking fee|消費税(?!込)|税金|deposit|保証金|refund|返金|ポイント|points|saved|節約)/i;

/** 合計金額らしいもの：「お支払い金額」＞「合計」＞「料金」の順、1泊あたり・割引・手数料の行は避ける */
export function findPrice(text0: string): { price?: number; currency?: string } {
  // 「1万2000円」「3.5万円」→ 12000円・35000円
  const text = text0.replace(/(\d+(?:\.\d+)?)\s?万\s?(\d{1,4})?(?=\s?円)/g, (_m, a: string, b?: string) => String(Math.round(+a * 10000 + (b ? +b : 0))));
  const r = findPriceRaw(text);
  // 中国語の「¥」は人民元（かなが無く、简体・繁体の言葉があるとき）
  if (r.currency === 'JPY' && !/円/.test(text) && !/[\u3040-\u30ff]/.test(text) && /(总价|總價|订单|訂單|人民币|人民幣|元|酒店|入住|退房|支付|付款)/.test(text)) r.currency = 'CNY';
  return r;
}
function findPriceRaw(text: string): { price?: number; currency?: string } {
  const num = '(\\d{1,3}(?:[.,，  \u202f]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const re = new RegExp(`(-|−)?(?<![A-Za-z])${CUR_RE}?\\s?${num}\\s?${SUF_RE}?(?![A-Za-z])`, 'g');
  const lines = text.split(/\n/);
  let best: { v: number; cur?: string; score: number } | null = null;
  lines.forEach((line, i) => {
    let label = STRONG.test(line) ? 6 : NORMAL.test(line) ? 4 : WEAK.test(line) ? 1 : 0;
    if (!label && /(合計|総額|total)\s*[:：]?\s*$/i.test(lines[i - 1] ?? '')) label = 3; // ラベルが前の行にある
    const pen = PENALTY.test(line) && !STRONG.test(line) ? 5 : 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line))) {
      if (m[1]) continue; // マイナスは割引
      const cur = m[2] || m[4];
      if (!cur) continue; // 通貨のない数字は予約番号や日付かもしれない
      const v = toNumber(m[3]);
      if (!v || v > 10_000_000_000) continue;
      // 「$1,045.23 CAD」のように両方あるときは後ろのコードを優先
      const code = (m[4] && m[2] === '$' ? curCode(m[4]) : undefined) ?? curCode(m[2]) ?? curCode(m[4]);
      // かっこの中（概算の円換算など）は少し下げる
      const inParen = /[（(][^）)]*$/.test(line.slice(0, m.index)) ? 1 : 0;
      const score = label - pen - inParen + Math.log10(v + 1) / 20 + i / 10000;
      if (!best || score > best.score) best = { v, cur: code, score };
    }
  });
  return best ? { price: (best as any).v, currency: (best as any).cur } : {};
}

const KEYS: Record<BookingType, RegExp> = {
  flight: /(flight|boarding|airline|airways|搭乗|航空|便名|フライト|항공|탑승|航班|登机|出発空港|e-?ticket|terminal|gate|ryanair|easyjet|\bana\b|\bjal\b|lufthansa|emirates|peach|ピーチ|jetstar|ジェットスター|skymark|スカイマーク|zipair|airasia|vueling|wizz|klm|air france|united|delta|cathay|singapore airlines)/gi,
  train: /(eurostar|train|rail|新幹線|기차|열차|ktx|高铁|火车|列車|特急|号車|coach \d|platform|trenitalia|sncf|renfe|deutsche bahn|\bdb\b|japan rail|jr|trainline|national rail|advance single|off-peak|anytime return|\bsingle\b|standard class|first class|railcard|乗車|のぞみ|ひかり|はやぶさ|えきねっと|ex予約)/gi,
  bus: /(\bbus\b|coach|flixbus|national express|megabus|高速バス|夜行バス)/gi,
  hotel: /(hotel|ホテル|check-?in|チェックイン|check-?out|チェックアウト|booking\.com|airbnb|宿泊|泊|room|客室|hostel|ゲストハウス|旅館|expedia|agoda|hilton|marriott|hyatt|ihg|accor|for stay|宿泊施設|一休|ryokan|inn\b|nights?\b|호텔|체크인|체크아웃|숙소|숙박|酒店|飯店|入住|退房|民宿|hôtel|unterkunft|alojamiento|albergo)/gi,
  car: /(rental car|car hire|レンタカー|pick-?up|drop-?off|hertz|avis|europcar|sixt|enterprise|返却|受取|貸渡|貸出|車両クラス|car class|vehicle)/gi,
  ticket: /(ticket|チケット|入場|admission|museum|美術館|tour|ツアー|event|コンサート|concert|show|公演|klook|kkday|getyourguide|viator|tiqets|ユニバーサル|usj|ディズニー|disney|パス|利用日|入園|入館|テーマパーク|アクティビティ|activity|experience|skip-the-line)/gi,
  food: /(restaurant|レストラン|reservation for|table for|party of \d|予約人数|opentable|食べログ|コース|resy|thefork|tablecheck|식당|레스토랑|餐厅|餐廳|bistro|trattoria|ristorante)/gi,
  plan: /$^/g,
  other: /$^/g,
};

export function guessType(text: string): BookingType {
  let best: BookingType = 'other';
  let score = 0;
  (Object.keys(KEYS) as BookingType[]).forEach((k) => {
    const n = (text.match(KEYS[k]) ?? []).length * (k === 'flight' && /[A-Z]{2}\s?\d{2,4}/.test(text) ? 1.5 : 1) + (k === 'flight' && /\b[A-Z0-9]{2}\s?\d{2,4}\b/.test(text) && /\([A-Z]{3}\)/.test(text) ? 3 : 0);
    if (n > score) ((score = n), (best = k));
  });
  return best;
}

const cleanLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const firstMatch = (text: string, re: RegExp) => {
  const m = text.match(re);
  return m ? cleanLine(m[1]) : undefined;
};

/** 予約番号（「予約番号」「Confirmation」「Booking reference」「PNR」の後ろ） */
function findCode(text: string) {
  const label =
    '(?:予約番号|予約コード|確認番号|予約確認番号|確認コード|予約ID|예약번호|예약 번호|訂位代號|訂位代号|预订编号|預訂編號|订单号|buchungscode|buchungsnummer|auftragsnummer|référence(?: de (?:réservation|dossier))?|code de réservation|localizador|código de reserva|clave de reservación|codice di prenotazione|booking id|order (?:reference|number|no\\.?)|itinerary(?: number| no\\.?| #)?|confirmation(?: number| code| no\\.?)?|booking (?:reference|ref\\.?|number|no\\.?|code)|reservation (?:number|code|no\\.?)|pnr|record locator)';
  const re = new RegExp(label + '\\s*(?:\\([^)\\n]{1,12}\\))?\\s*[:：#]*\\s*([A-Za-z0-9][A-Za-z0-9\\-.]{3,18}[A-Za-z0-9])', 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const c = m[1];
    if (/\d/.test(c) || /^[A-Z]{5,8}$/.test(c)) return c;
    re.lastIndex = m.index + 1; // 違ったら次のラベルを探す
  }
  return undefined;
}

/** テキスト → 予約の下書き（読み取れたところだけ） */
export function parseBooking(text: string, today = new Date()): Partial<Booking> {
  const t = text.replace(/\r/g, '');
  const type = guessType(t);
  const dates = findDates(t, today);
  const out: Partial<Booking> = { type, ...findPrice(t) };
  const code = findCode(t);
  if (code) out.code = code;

  // 日付：ラベルの近くを優先（チェックイン・出発・受取 → start、チェックアウト・到着・返却 → end）
  const H = type === 'hotel';
  const START = new RegExp(`(check-?in|チェックイン|체크인|入住|pick-?up|受取|貸出|outbound|往路|乗車|利用日|宿泊日|到着日|date|datum|le |visit${H ? '|arrival' : '|出発|depart'})`, 'gi');
  const END = new RegExp(`(check-?out|チェックアウト|체크아웃|退房|返却|drop-?off|return|復路${H ? '|departure' : ''})`, 'gi');
  const lastPos = (re: RegExp, s: string) => { let p = -1; let m: RegExpExecArray | null; re.lastIndex = 0; while ((m = re.exec(s))) p = m.index; return p; };
  const labelOf = (d: { index: number }) => {
    const ls = t.lastIndexOf('\n', d.index - 1) + 1;
    const pre = t.slice(Math.max(ls, d.index - 50), d.index);
    const s = lastPos(START, pre), e = lastPos(END, pre);
    if (s < 0 && e < 0) return '';
    return e > s ? 'end' : 'start';
  };
  const startD = (type === 'hotel' ? dates.find((d) => labelOf(d) === 'start' && /(check-?in|チェックイン|체크인|入住|arrival|宿泊日)/i.test(d.line)) : undefined) ?? dates.find((d) => labelOf(d) === 'start') ?? dates[0];
  const endD = dates.find((d) => d !== startD && labelOf(d) === 'end' && d.date >= (startD?.date ?? '')) ?? (type === 'hotel' || type === 'car' ? dates.find((d) => d.date > (startD?.date ?? '')) : undefined);
  if (startD) {
    out.start = startD.date;
    const tm = findTimes(startD.line);
    if (tm[0]) out.startTime = tm[0];
    if (tm[1] && type !== 'hotel' && type !== 'car') out.endTime = tm[1];
  }
  if (endD && endD.date !== out.start) {
    out.end = endD.date;
    const tm = findTimes(endD.line);
    if (tm[0]) out.endTime = tm[tm.length > 1 && endD === startD ? 1 : 0];
  }
  // 時刻がまだなら、出発・到着の近くから
  if (!out.startTime) {
    const all = findTimes(t);
    if (all[0]) out.startTime = all[0];
    if (type !== 'hotel' && all[1] && !out.endTime) out.endTime = all[1];
  }

  if (type === 'flight') {
    const fn = t.match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/);
    const air = [...t.matchAll(/\(([A-Z]{3})\)|\b([A-Z]{3})\s?(?:→|->|–|-|to|⇒|>)\s?([A-Z]{3})\b/g)];
    const codes: string[] = [];
    air.forEach((a) => [a[1], a[2], a[3]].forEach((c) => c && !codes.includes(c) && codes.push(c)));
    if (codes[0]) out.from = codes[0];
    if (codes[1]) out.to = codes[1];
    out.title = fn ? `${fn[1]} ${fn[2]}` : undefined;
    const seat = firstMatch(t, /(?:seat|座席)\s*[:：]?\s*(\d{1,2}[A-K])/i);
    if (seat) out.seat = seat;
  } else if (type === 'train' || type === 'bus') {
    const route = t.match(/([A-Za-z぀-ヿ一-鿿 .'-]{2,30}?)\s*(?:→|->|⇒|–|to|発.*?)\s*([A-Za-z぀-ヿ一-鿿 .'-]{2,30})/);
    if (route) ((out.from = cleanLine(route[1])), (out.to = cleanLine(route[2])));
    const seat = firstMatch(t, /(?:seat|座席|coach|号車)\s*[:：]?\s*([0-9A-Z\- ]{1,10})/i);
    if (seat) out.seat = seat;
    const brand = t.match(/\b(eurostar|tgv|ice|avanti|lner|gwr|trenitalia|frecciarossa|renfe|ave|flixbus|national express|megabus)\b/i);
    out.title = brand ? brand[1].replace(/\b\w/g, (c) => c.toUpperCase()) : firstMatch(t, /((?:のぞみ|ひかり|こだま|はやぶさ|さくら|みずほ)\s?\d+号)/);
  } else if (type === 'hotel') {
    // 「ホテル名：〇〇」「Property: 〇〇」のように項目名がついていれば、その後ろだけ
    out.title = firstMatch(t, /(?:ホテル名|宿泊施設名?|施設名|宿名|호텔명?|숙소명?|酒店名?称?|飯店名?稱?|hotel name|property(?: name)?|accommodation)\s*[:：]\s*([^\n]{2,60})/i) ?? firstMatch(t, /^\s*((?:hotel|ホテル|hostel|旅館)[^\n]{0,40}|[^\n]{0,40}(?:hotel|ホテル|inn|hostel|旅館|resort|suites))\s*$/im);
    out.from = firstMatch(t, /(?:address|adresse|dirección|indirizzo|住所|所在地)\s*[:：]?\s*([^\n]{5,80})/i);
    const room = firstMatch(t, /(?:room type|部屋タイプ|客室)\s*[:：]?\s*([^\n]{2,40})/i);
    if (room) out.seat = room;
  } else if (type === 'car') {
    out.title = firstMatch(t, /\b(hertz|avis|europcar|sixt|enterprise|budget|トヨタレンタカー|ニッポンレンタカー|オリックスレンタカー|タイムズカー)\b/i);
    out.from = firstMatch(t, /(?:pick-?up (?:location|at)|受取(?:場所|店舗)?|貸出(?:場所|店舗)?)\s*[:：]?\s*([^\n]{3,60})/i);
    out.to = firstMatch(t, /(?:drop-?off (?:location|at)|return (?:location|at)|返却(?:場所|店舗)?)\s*[:：]?\s*([^\n]{3,60})/i);
  } else {
    const addr = firstMatch(t, /(?:address|adresse|dirección|indirizzo|住所|所在地|location|venue|会場|集合場所|meeting point|店舗住所)\s*[:：]\s*([^\n]{4,80})/i);
    if (addr) out.from = addr;
    // 1行目のそれらしい名前
    const first = t.split('\n').map(cleanLine).find((l) => l.length >= 3 && l.length <= 40 && !/^\d/.test(l));
    if (first) out.title = first;
  }
  // キャンセルのお知らせ
  if (/(キャンセル(?:が完了|済|しました|を承り|のお知らせ|のご確認|確定)|予約(?:を)?取り?消|ご予約の取消|cancell?ation (?:confirm|notice)|has been cancell?ed|(?:booking|reservation|flight|trip|order) (?:is |was |has been )?cancell?ed|you(?:'ve| have) cancell?ed|annulation|stornierung|cancelación|cancellazione)/i.test(t)) out.cancelled = true;
  Object.keys(out).forEach((k) => (out as any)[k] === undefined && delete (out as any)[k]);
  return out;
}
