// 旅のしおり：データの形と保存
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FALLBACK_PER_USD, findCurrency } from './currencies';

export type BookingType = 'flight' | 'train' | 'bus' | 'hotel' | 'car' | 'ticket' | 'food' | 'plan' | 'other';

export const TYPES: { id: BookingType; icon: string; color: string; soft: string }[] = [
  { id: 'flight', icon: 'airplane', color: '#3B5BDB', soft: '#EDF0FB' },
  { id: 'train', icon: 'train', color: '#1F9D74', soft: '#E6F4EF' },
  { id: 'bus', icon: 'bus', color: '#5C7F3A', soft: '#EEF3E8' },
  { id: 'hotel', icon: 'bed', color: '#7048E8', soft: '#F0ECFC' },
  { id: 'car', icon: 'car-sport', color: '#E8590C', soft: '#FCEEE6' },
  { id: 'ticket', icon: 'ticket', color: '#D6336C', soft: '#FBEAF0' },
  { id: 'food', icon: 'restaurant', color: '#B07D00', soft: '#F8F1DF' },
  { id: 'plan', icon: 'flag', color: '#0B7285', soft: '#E3F2F4' },
  { id: 'other', icon: 'bookmark', color: '#6C727C', soft: '#EFEFEF' },
];
/** 旅行の表紙の色（emoji 欄に色コードを入れて使う） */
export const COVERS = ['#15171C', '#FF5B3A', '#3B5BDB', '#1F9D74', '#7048E8', '#D6336C', '#E8590C', '#0B7285', '#B07D00', '#495057'];
export const coverOf = (t: { emoji: string }) => (t.emoji?.startsWith('#') ? t.emoji : COVERS[0]);
export const monogram = (name: string) => {
  const w = name.trim();
  if (!w) return '··';
  if (/^[A-Za-z]/.test(w)) {
    const parts = w.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : w.slice(0, 2)).toUpperCase();
  }
  return w.replace(/[0-9０-９\s月年泊日]/g, '').slice(0, 2) || w.slice(0, 2);
};
export const typeOf = (t: BookingType) => TYPES.find((x) => x.id === t) ?? TYPES[TYPES.length - 1];

/** 予約1件（航空券・ホテル・レンタカーなど） */
export type Booking = {
  id: string;
  type: BookingType;
  title: string; // 例：BA 0008 / Hotel Le Marais / Hertz
  start: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  end?: string; // YYYY-MM-DD（ホテルのチェックアウト・レンタカーの返却など）
  endTime?: string;
  from?: string; // 出発地・受取場所・ホテルの住所
  to?: string; // 到着地・返却場所
  code?: string; // 予約番号・確認番号
  seat?: string; // 座席・部屋など
  price?: number;
  currency?: string;
  paidBy?: string; // 払った人（メンバーID）
  splitWith?: string[]; // 割り勘する人（空なら全員）
  memo?: string;
  photos?: string[]; // スクショ（端末内のURI）
  tz?: string; createdAt: number;
};

export type Member = { id: string; name: string };

export type ExpenseCat = 'meal' | 'move' | 'shop' | 'sight' | 'etc';
export const EXP_CATS: { id: ExpenseCat; icon: string }[] = [
  { id: 'meal', icon: 'restaurant-outline' },
  { id: 'move', icon: 'subway-outline' },
  { id: 'shop', icon: 'bag-handle-outline' },
  { id: 'sight', icon: 'camera-outline' },
  { id: 'etc', icon: 'ellipsis-horizontal' },
];
/** 旅行中の出費 */
export type Expense = { id: string; title: string; cat: ExpenseCat; amount: number; currency: string; date: string; paidBy?: string; splitWith?: string[] };

/** 行きたい場所（SNSで見つけた所など） */
export type Wish = { id: string; title: string; url?: string; memo?: string; image?: string; photos?: string[]; createdAt: number };

export type Trip = {
  id: string;
  name: string;
  emoji: string;
  start?: string;
  end?: string;
  members: Member[];
  bookings: Booking[];
  checklist: { id: string; text: string; done: boolean }[];
  cover?: string; // 表紙の写真（端末内のURI）
  budget?: number; // 旅行の予算（母国通貨）
  expenses?: Expense[]; // 旅行中の出費（食事・お土産など）
  journal?: Record<string, { text?: string; photos?: string[] }>; // 日ごとの思い出
  wishes?: Wish[];
  createdAt: number;
};

export type Settings = { home: string; myName: string; lang: 'ja' | 'en'; onboarded: boolean; notify: boolean; mapApp?: 'ask' | 'apple' | 'google' };

export type RateInfo = { base: string; rates: Record<string, number>; updatedAt: number };

const K_TRIPS = 'ts.trips.v1';
const K_SETTINGS = 'ts.settings.v1';
const K_RATE = 'ts.rate.v1';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
async function writeJSON(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const detectLang = (): 'ja' | 'en' => {
  try {
    const l = Intl.DateTimeFormat().resolvedOptions().locale || '';
    return l.startsWith('ja') ? 'ja' : 'en';
  } catch {
    return 'ja';
  }
};

export const DEFAULT_SETTINGS: Settings = { home: 'JPY', myName: '', lang: detectLang(), onboarded: false, notify: true };
export const loadTrips = () => readJSON<Trip[]>(K_TRIPS, []);
export const saveTrips = (v: Trip[]) => writeJSON(K_TRIPS, v);
export const loadSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await readJSON<Partial<Settings>>(K_SETTINGS, {})) });
export const saveSettings = (s: Settings) => writeJSON(K_SETTINGS, s);

// ---------- 為替 ----------
export const fallbackRates = (base: string): RateInfo => {
  const b = FALLBACK_PER_USD[base] ?? 1;
  const rates: Record<string, number> = {};
  Object.entries(FALLBACK_PER_USD).forEach(([k, v]) => (rates[k] = v / b));
  return { base, rates, updatedAt: 0 };
};
export async function loadRate(base: string): Promise<RateInfo> {
  const r = await readJSON<RateInfo | null>(K_RATE, null);
  return r && r.base === base ? r : fallbackRates(base);
}
export async function fetchRates(base: string): Promise<RateInfo | null> {
  for (const url of [`https://open.er-api.com/v6/latest/${base}`, `https://api.frankfurter.dev/v1/latest?base=${base}`]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const j = await res.json();
      if (j?.rates) {
        const info: RateInfo = { base, rates: { ...j.rates, [base]: 1 }, updatedAt: Date.now() };
        await writeJSON(K_RATE, info);
        return info;
      }
    } catch {}
  }
  return null;
}
/** amount(cur) を rateInfo.base（母国通貨）に */
export function toHome(amount: number, cur: string, r: RateInfo): number {
  if (cur === r.base) return amount;
  const x = r.rates[cur] ?? fallbackRates(r.base).rates[cur];
  return x ? amount / x : 0;
}

// ---------- 表示 ----------
const commas = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const fmtMoney = (n: number, code: string) => {
  const c = findCurrency(code);
  const [i, d] = Math.abs(n).toFixed(c.decimals).split('.');
  return `${n < 0 ? '-' : ''}${c.symbol}${commas(i)}${d ? '.' + d : ''}`;
};

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const parseDate = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
export const dateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const shiftDate = (s: string, n: number) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
};
export const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
export const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 旅行の期間（手入力がなければ予約から自動で） */
export function tripRange(t: Trip): { start?: string; end?: string } {
  const ds: string[] = [];
  t.bookings.forEach((b) => {
    if (isDate(b.start)) ds.push(b.start);
    if (isDate(b.end)) ds.push(b.end!);
  });
  ds.sort();
  return { start: t.start || ds[0], end: t.end || ds[ds.length - 1] };
}

/** 旅行の全日程（予約のない日も含む。最大60日） */
export function tripDays(t: Trip): string[] {
  const { start, end } = tripRange(t);
  const set = new Set<string>(timeline(t).map((d) => d.date));
  Object.keys(t.journal ?? {}).forEach((d) => set.add(d));
  if (start && end && daysBetween(start, end) <= 60) for (let d = start; d <= end; d = shiftDate(d, 1)) set.add(d);
  return [...set].sort();
}
export const isPast = (t: Trip, today = todayStr()) => {
  const { end } = tripRange(t);
  return !!end && end < today;
};
export const memoryPhotos = (t: Trip) => Object.values(t.journal ?? {}).flatMap((j) => j.photos ?? []);

/** しおり用：日付ごとの予定（ホテル・レンタカーは開始日と終了日の両方に出す） */
export type TimelineItem = { booking: Booking; edge: 'start' | 'end' | 'single'; time?: string };
export function timeline(t: Trip): { date: string; items: TimelineItem[] }[] {
  const map = new Map<string, TimelineItem[]>();
  const push = (d: string, it: TimelineItem) => map.set(d, [...(map.get(d) ?? []), it]);
  t.bookings.forEach((b) => {
    if (!isDate(b.start)) return;
    const long = (b.type === 'hotel' || b.type === 'car') && isDate(b.end) && b.end !== b.start;
    if (long) {
      push(b.start, { booking: b, edge: 'start', time: b.startTime });
      push(b.end!, { booking: b, edge: 'end', time: b.endTime });
    } else push(b.start, { booking: b, edge: 'single', time: b.startTime });
  });
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, items]) => ({ date, items: items.sort((x, y) => (x.time ?? '99').localeCompare(y.time ?? '99')) }));
}

/** 次の予定（今日以降でいちばん近いもの） */
export function nextUp(trips: Trip[], now = todayStr()): { trip: Trip; item: TimelineItem; date: string } | null {
  let best: { trip: Trip; item: TimelineItem; date: string } | null = null;
  trips.forEach((trip) =>
    timeline(trip).forEach(({ date, items }) => {
      if (date < now) return;
      items.forEach((item) => {
        const key = date + (item.time ?? '99');
        if (!best || key < best.date + (best.item.time ?? '99')) best = { trip, item, date };
      });
    }),
  );
  return best;
}

/** 費用の合計（母国通貨） */
export function tripTotal(t: Trip, r: RateInfo) {
  return (
    t.bookings.reduce((s, b) => s + (b.price ? toHome(b.price, b.currency || r.base, r) : 0), 0) +
    (t.expenses ?? []).reduce((s, e) => s + toHome(e.amount, e.currency, r), 0)
  );
}

/** 割り勘：だれがいくら払って、だれが誰にいくら渡せばいいか（母国通貨） */
export function settle(t: Trip, r: RateInfo) {
  const ids = t.members.map((m) => m.id);
  const paid: Record<string, number> = {};
  const owe: Record<string, number> = {};
  ids.forEach((i) => ((paid[i] = 0), (owe[i] = 0)));
  const items = [
    ...t.bookings.map((b) => ({ price: b.price, currency: b.currency, paidBy: b.paidBy, splitWith: b.splitWith })),
    ...(t.expenses ?? []).map((e) => ({ price: e.amount, currency: e.currency, paidBy: e.paidBy, splitWith: e.splitWith })),
  ];
  items.forEach((b) => {
    if (!b.price) return;
    const v = toHome(b.price, b.currency || r.base, r);
    const payer = b.paidBy && ids.includes(b.paidBy) ? b.paidBy : ids[0];
    const among = (b.splitWith && b.splitWith.length ? b.splitWith : ids).filter((i) => ids.includes(i));
    if (!payer || !among.length) return;
    paid[payer] += v;
    among.forEach((i) => (owe[i] += v / among.length));
  });
  const bal = ids.map((i) => ({ id: i, v: paid[i] - owe[i] }));
  const pay: { from: string; to: string; amount: number }[] = [];
  const cred = bal.filter((b) => b.v > 0.5).sort((a, b) => b.v - a.v);
  const debt = bal.filter((b) => b.v < -0.5).sort((a, b) => a.v - b.v);
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const x = Math.min(-debt[i].v, cred[j].v);
    pay.push({ from: debt[i].id, to: cred[j].id, amount: x });
    debt[i].v += x;
    cred[j].v -= x;
    if (debt[i].v > -0.5) i++;
    if (cred[j].v < 0.5) j++;
  }
  return { paid, owe, pay };
}
