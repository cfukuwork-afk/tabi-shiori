// 旅のDNA：これまでの旅（予定の時間・種類・移動・日数・人数・お金・記録）から、旅の仕方を15の軸（0〜100）で表す。
// 上位の特徴からタイプ名（約300通り）、15軸の値から世界に一つのバーコード模様を作る。端末の中だけで計算する。
import { Trip, isDate, daysBetween, tripRange, RateInfo } from './data';
import { tripPlaces } from './visited';

export const AXES = [
  { k: 'early', ja: '早起き', en: 'Early starts' },
  { k: 'night', ja: '夜型', en: 'Night outs' },
  { k: 'packed', ja: '詰め込み', en: 'Packed days' },
  { k: 'food', ja: 'グルメ', en: 'Food' },
  { k: 'sights', ja: '名所', en: 'Sights' },
  { k: 'exp', ja: '体験', en: 'Experiences' },
  { k: 'cities', ja: '都市巡り', en: 'City hopping' },
  { k: 'far', ja: '遠出', en: 'Long haul' },
  { k: 'rail', ja: '鉄道・バス', en: 'Rail & bus' },
  { k: 'long', ja: '長旅', en: 'Long trips' },
  { k: 'group', ja: '仲間旅', en: 'Group travel' },
  { k: 'stay', ja: '宿重視', en: 'Stays' },
  { k: 'spend', ja: 'ご褒美', en: 'Splurge' },
  { k: 'plan', ja: '計画派', en: 'Planning ahead' },
  { k: 'memo', ja: '記録派', en: 'Journaling' },
] as const;
export const HUES = [18, 42, 200, 8, 160, 280, 225, 250, 120, 30, 330, 190, 48, 265, 350];

// 強い特徴の言葉（高いとき / 低いとき）。タイプ名は「形容（2番目の特徴）＋名詞（1番目の特徴）」
const ADJ_HI: Record<string, [string, string]> = {
  early: ['早起きの', 'Early-rising'], night: ['夜を楽しむ', 'After-dark'], packed: ['欲張りな', 'Go-getting'], food: ['食いしん坊の', 'Hungry'],
  sights: ['名所好きの', 'Landmark-loving'], exp: ['体験重視の', 'Hands-on'], cities: ['都市を渡る', 'Roaming'], far: ['遠くへ飛ぶ', 'Far-flying'],
  rail: ['鉄道好きの', 'Rail-riding'], long: ['じっくり滞在する', 'Slow-travel'], group: ['みんなで楽しむ', 'Social'], stay: ['宿にこだわる', 'Stay-savvy'],
  spend: ['ご褒美派の', 'Treat-yourself'], plan: ['計画上手な', 'Well-planned'], memo: ['記録好きの', 'Story-keeping'],
};
const ADJ_LO: Record<string, [string, string]> = { packed: ['のんびり派の', 'Easy-going'], group: ['ひとり旅の', 'Solo'], spend: ['節約上手な', 'Thrifty'], plan: ['思い立ったら即の', 'Spontaneous'], early: ['朝はゆっくりの', 'Late-morning'] };
const NOUN: Record<string, [string, string]> = {
  early: ['アーリーバード', 'Early Bird'], night: ['ナイトウォーカー', 'Night Walker'], packed: ['スケジュールマスター', 'Schedule Master'], food: ['グルメハンター', 'Food Hunter'],
  sights: ['名所コレクター', 'Landmark Collector'], exp: ['アドベンチャラー', 'Adventurer'], cities: ['シティホッパー', 'City Hopper'], far: ['ジェットセッター', 'Jet Setter'],
  rail: ['レイルトラベラー', 'Rail Traveller'], long: ['ノマド', 'Nomad'], group: ['旅のリーダー', 'Trip Leader'], stay: ['ホテルラバー', 'Hotel Lover'],
  spend: ['ラグジュアリー旅人', 'Luxe Traveller'], plan: ['トラベルプランナー', 'Trip Planner'], memo: ['ストーリーテラー', 'Storyteller'],
};

export type Dna = { v: number[]; season: number; trips: number; items: number; code: string; top: string[] };
const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const scale = (x: number, lo: number, hi: number) => clamp(((x - lo) / (hi - lo)) * 100);
const minutes = (hm?: string) => (hm && /^\d{1,2}:\d{2}/.test(hm) ? Number(hm.slice(0, 2).replace(':', '')) * 60 + Number(hm.slice(-2)) : null);

export function computeDna(trips: Trip[], rate?: RateInfo): Dna | null {
  const live = trips.filter((tr) => !tr.id.startsWith('tpl_'));
  const all = live.flatMap((tr) => tr.bookings.filter((b) => !b.cancelled && isDate(b.start)).map((b) => ({ tr, b })));
  if (all.length < 5) return null;
  const spots = all.filter(({ b }) => ['plan', 'ticket', 'food', 'other'].includes(b.type));
  const moves = all.filter(({ b }) => ['flight', 'train', 'bus', 'car'].includes(b.type));
  // 日ごとの最初の予定の時刻
  const byDay = new Map<string, number[]>();
  spots.forEach(({ tr, b }) => {
    const m = minutes(b.startTime);
    if (m == null) return;
    const k = tr.id + b.start;
    byDay.set(k, [...(byDay.get(k) ?? []), m]);
  });
  const firsts = [...byDay.values()].map((x) => Math.min(...x));
  const avgFirst = firsts.length ? firsts.reduce((a, b) => a + b, 0) / firsts.length : 10 * 60;
  const timed = spots.map(({ b }) => minutes(b.startTime)).filter((x): x is number => x != null);
  const nightShare = timed.length ? timed.filter((m) => m >= 19 * 60 || m < 3 * 60).length / timed.length : 0;
  const perDay = byDay.size ? spots.length / byDay.size : 2;
  const share = (type: string) => (spots.length ? spots.filter(({ b }) => b.type === type).length / spots.length : 0);
  const lens = live.map((tr) => {
    const { start, end } = tripRange(tr);
    return start && end ? daysBetween(start, end) + 1 : 1;
  });
  const avgLen = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
  const cityCounts = live.map((tr) => tripPlaces(tr).cities.size || 1);
  const avgCities = cityCounts.reduce((a, b) => a + b, 0) / Math.max(1, cityCounts.length);
  const flights = moves.filter(({ b }) => b.type === 'flight').length;
  const rails = moves.filter(({ b }) => b.type === 'train' || b.type === 'bus').length;
  const members = live.map((tr) => Math.max(1, tr.members.length));
  const avgMembers = members.reduce((a, b) => a + b, 0) / Math.max(1, members.length);
  // お金：母国通貨に直して比べる（為替がなければ同じ通貨のものだけ）
  const conv = (n: number, cur?: string) => {
    if (!cur || !rate || cur === rate.base) return n;
    const r = rate.rates[cur];
    return r ? n / r : 0;
  };
  let hotelCost = 0;
  let total = 0;
  all.forEach(({ b }) => {
    const v = b.price ? conv(Number(b.price), b.currency) : 0;
    total += v;
    if (b.type === 'hotel') hotelCost += v;
  });
  live.forEach((tr) => (tr.expenses ?? []).forEach((e) => (total += conv(e.amount, e.currency))));
  const totalDays = lens.reduce((a, b) => a + b, 0) || 1;
  // 1日あたりの費用：日本円換算で ¥5,000 〜 ¥60,000 の間で見る（母国通貨が違えば相当額）
  const yen = rate?.base === 'JPY' || !rate ? 1 : (rate.rates.JPY ?? 150);
  const perDayCost = (total / totalDays) * yen;
  const leads = live.map((tr) => {
    const { start } = tripRange(tr);
    return start ? (new Date(start + 'T00:00:00').getTime() - tr.createdAt) / 864e5 : 0;
  });
  const avgLead = leads.reduce((a, b) => a + b, 0) / Math.max(1, leads.length);
  const journal = live.reduce((a, tr) => a + Object.values(tr.journal ?? {}).filter((j) => j?.text || j?.photos?.length).length, 0);
  const months = all.map(({ b }) => Number(b.start.slice(5, 7)));
  const seasons = [0, 0, 0, 0];
  months.forEach((m) => seasons[m >= 3 && m <= 5 ? 0 : m >= 6 && m <= 8 ? 1 : m >= 9 && m <= 11 ? 2 : 3]++);
  const v = [
    scale(11 * 60 - avgFirst, -60, 180), // 早く始めるほど高い（11時→0、8時→100）
    scale(nightShare, 0, 0.3),
    scale(perDay, 1.5, 6),
    scale(share('food'), 0, 0.45),
    scale(share('plan'), 0.1, 0.7),
    scale(share('ticket'), 0, 0.35),
    scale(avgCities, 1, 4),
    scale(flights / Math.max(1, live.length), 0, 3),
    scale(moves.length ? rails / moves.length : 0, 0, 0.8),
    scale(avgLen, 2, 10),
    scale(avgMembers, 1, 5),
    scale(total ? hotelCost / total : 0, 0.15, 0.65),
    scale(perDayCost, 5000, 60000),
    scale(avgLead, 7, 120),
    scale(journal / totalDays, 0, 0.8),
  ];
  const season = seasons.indexOf(Math.max(...seasons));
  const top = AXES.map((a, i) => ({ k: a.k, d: v[i] - 50 })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  return { v, season, trips: live.length, items: all.length, code: encodeDna(v, season), top: top.slice(0, 3).map((x) => (x.d >= 0 ? x.k : '-' + x.k)) };
}

/** タイプ名（1番目の特徴が名詞、2番目が形容） */
export function dnaType(v: number[], ja: boolean): string {
  const order = AXES.map((a, i) => ({ k: a.k, d: v[i] - 50 })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const nounK = order.find((x) => x.d > 0)?.k ?? 'sights';
  const second = order.find((x) => x.k !== nounK && (x.d > 0 ? ADJ_HI[x.k] : ADJ_LO[x.k]));
  const adj = second ? (second.d > 0 ? ADJ_HI[second.k] : ADJ_LO[second.k]) : null;
  const noun = NOUN[nounK];
  return ja ? `${adj ? adj[0] : ''}${noun[0]}` : `${adj ? adj[1] + ' ' : ''}${noun[1]}`;
}

// 15軸（0〜100）を 0〜z の36段階にして16文字のコードに（最後の1文字は季節）
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
export const encodeDna = (v: number[], season: number) => v.map((x) => B36[Math.round((x / 100) * 35)]).join('') + String(season);
export function decodeDna(code: string): { v: number[]; season: number } | null {
  const c = String(code || '').toLowerCase().trim();
  if (!/^[0-9a-z]{15}[0-3]$/.test(c)) return null;
  return { v: [...c.slice(0, 15)].map((ch) => Math.round((B36.indexOf(ch) / 35) * 100)), season: Number(c[15]) };
}

/** 相性（0〜100）と、似ているところ・違うところ */
export function compareDna(a: number[], b: number[]) {
  const diffs = a.map((x, i) => ({ k: AXES[i].k, i, d: Math.abs(x - b[i]), both: Math.min(x, b[i]) }));
  const score = clamp(100 - (diffs.reduce((s, x) => s + x.d, 0) / diffs.length) * 1.6);
  const same = diffs.filter((x) => x.both >= 55).sort((p, q) => q.both - p.both).slice(0, 2).map((x) => x.i);
  const apart = diffs.sort((p, q) => q.d - p.d).slice(0, 2).filter((x) => x.d >= 30).map((x) => x.i);
  return { score, same, apart };
}

/** バーコード：15軸それぞれの帯の中に、値に応じた本数・太さの線を引く */
export function barcode(v: number[], w: number) {
  const seg = w / v.length;
  const bars: { x: number; w: number; hue: number; light: number }[] = [];
  v.forEach((x, i) => {
    const n = 1 + Math.floor(x / 22);
    const thick = Math.max(2, (seg * (0.25 + (x / 100) * 0.55)) / n);
    const gap = (seg - thick * n) / (n + 1);
    for (let j = 0; j < n; j++) bars.push({ x: i * seg + gap + j * (thick + gap), w: thick, hue: HUES[i], light: 38 + Math.round((1 - x / 100) * 22) });
  });
  return bars;
}
