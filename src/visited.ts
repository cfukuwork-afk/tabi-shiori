// 予定の住所や駅名から「どの国・どの街か」を見分ける（年のまとめ・世界地図用）
import type { Booking, Trip } from './data';
import { AIRPORT_TZ } from './airports';
import { TZ_CC } from './countries';

// [国, 日本語名, 英語名, ほかの呼び方…]
const CITIES: [string, string, string, ...string[]][] = [
  ['JP', '東京', 'Tokyo'], ['JP', '京都', 'Kyoto'], ['JP', '大阪', 'Osaka'], ['JP', '奈良', 'Nara'], ['JP', '神戸', 'Kobe'], ['JP', '横浜', 'Yokohama'],
  ['JP', '名古屋', 'Nagoya'], ['JP', '札幌', 'Sapporo'], ['JP', '福岡', 'Fukuoka', '博多'], ['JP', '那覇', 'Naha'], ['JP', '広島', 'Hiroshima'], ['JP', '金沢', 'Kanazawa'],
  ['JP', '箱根', 'Hakone'], ['JP', '鎌倉', 'Kamakura'], ['JP', '日光', 'Nikko'], ['JP', '仙台', 'Sendai'], ['JP', '函館', 'Hakodate'], ['JP', '宇治', 'Uji'],
  ['KR', 'ソウル', 'Seoul'], ['KR', '釜山', 'Busan'], ['KR', '済州', 'Jeju'], ['TW', '台北', 'Taipei'], ['TW', '台中', 'Taichung'], ['TW', '高雄', 'Kaohsiung'],
  ['HK', '香港', 'Hong Kong'], ['MO', 'マカオ', 'Macau', 'Macao'], ['CN', '上海', 'Shanghai'], ['CN', '北京', 'Beijing'],
  ['TH', 'バンコク', 'Bangkok'], ['TH', 'プーケット', 'Phuket'], ['TH', 'チェンマイ', 'Chiang Mai'], ['SG', 'シンガポール', 'Singapore'],
  ['MY', 'クアラルンプール', 'Kuala Lumpur'], ['ID', 'バリ', 'Bali', 'Denpasar', 'Ubud'], ['VN', 'ハノイ', 'Hanoi'], ['VN', 'ホーチミン', 'Ho Chi Minh'],
  ['VN', 'ダナン', 'Da Nang'], ['PH', 'マニラ', 'Manila'], ['PH', 'セブ', 'Cebu'], ['IN', 'デリー', 'Delhi'], ['AE', 'ドバイ', 'Dubai'], ['TR', 'イスタンブール', 'Istanbul'],
  ['GB', 'ロンドン', 'London'], ['GB', 'エディンバラ', 'Edinburgh'], ['GB', 'バース', 'Bath'], ['GB', 'オックスフォード', 'Oxford'], ['GB', 'ケンブリッジ', 'Cambridge'],
  ['GB', 'マンチェスター', 'Manchester'], ['GB', 'リバプール', 'Liverpool'], ['GB', 'ヨーク', 'York'], ['GB', 'グラスゴー', 'Glasgow'], ['GB', 'ブライトン', 'Brighton'],
  ['GB', 'ネス湖', 'Loch Ness'], ['GB', 'ワトフォード', 'Watford'], ['GB', 'コッツウォルズ', 'Cotswolds'], ['IE', 'ダブリン', 'Dublin'],
  ['FR', 'パリ', 'Paris'], ['FR', 'ヴェルサイユ', 'Versailles'], ['FR', 'ニース', 'Nice'], ['FR', 'リヨン', 'Lyon'], ['FR', 'マルセイユ', 'Marseille'], ['FR', 'モン・サン・ミシェル', 'Mont-Saint-Michel'],
  ['IT', 'ローマ', 'Rome', 'Roma'], ['IT', 'ミラノ', 'Milan', 'Milano'], ['IT', 'フィレンツェ', 'Florence', 'Firenze'], ['IT', 'ヴェネツィア', 'Venice', 'Venezia'], ['IT', 'ナポリ', 'Naples', 'Napoli'],
  ['ES', 'バルセロナ', 'Barcelona'], ['ES', 'マドリード', 'Madrid'], ['ES', 'セビリア', 'Seville', 'Sevilla'], ['PT', 'リスボン', 'Lisbon', 'Lisboa'], ['PT', 'ポルト', 'Porto'],
  ['NL', 'アムステルダム', 'Amsterdam'], ['BE', 'ブリュッセル', 'Brussels', 'Bruxelles'], ['BE', 'ブルージュ', 'Bruges', 'Brugge'], ['DE', 'ベルリン', 'Berlin'],
  ['DE', 'ミュンヘン', 'Munich', 'München'], ['DE', 'フランクフルト', 'Frankfurt'], ['CH', 'チューリッヒ', 'Zurich', 'Zürich'], ['CH', 'ジュネーブ', 'Geneva', 'Genève'],
  ['CH', 'インターラーケン', 'Interlaken'], ['AT', 'ウィーン', 'Vienna', 'Wien'], ['AT', 'ザルツブルク', 'Salzburg'], ['CZ', 'プラハ', 'Prague', 'Praha'],
  ['HU', 'ブダペスト', 'Budapest'], ['DK', 'コペンハーゲン', 'Copenhagen'], ['SE', 'ストックホルム', 'Stockholm'], ['NO', 'オスロ', 'Oslo'], ['FI', 'ヘルシンキ', 'Helsinki'],
  ['IS', 'レイキャビク', 'Reykjavik', 'Reykjavík'], ['GR', 'アテネ', 'Athens'], ['GR', 'サントリーニ', 'Santorini'], ['HR', 'ドゥブロヴニク', 'Dubrovnik'],
  ['US', 'ニューヨーク', 'New York'], ['US', 'ロサンゼルス', 'Los Angeles'], ['US', 'サンフランシスコ', 'San Francisco'], ['US', 'ラスベガス', 'Las Vegas'],
  ['US', 'ホノルル', 'Honolulu'], ['US', 'シカゴ', 'Chicago'], ['US', 'シアトル', 'Seattle'], ['US', 'ボストン', 'Boston'], ['US', 'ワシントン', 'Washington'], ['US', 'オーランド', 'Orlando'],
  ['GU', 'グアム', 'Guam'], ['CA', 'トロント', 'Toronto'], ['CA', 'バンクーバー', 'Vancouver'], ['MX', 'メキシコシティ', 'Mexico City'], ['MX', 'カンクン', 'Cancun', 'Cancún'],
  ['AU', 'シドニー', 'Sydney'], ['AU', 'メルボルン', 'Melbourne'], ['AU', 'ケアンズ', 'Cairns'], ['AU', 'ゴールドコースト', 'Gold Coast'], ['NZ', 'オークランド', 'Auckland'],
  ['EG', 'カイロ', 'Cairo'], ['MA', 'マラケシュ', 'Marrakech', 'Marrakesh'],
];
type Hit = { cc: string; ja: string; en: string };
const NAMES: { re: RegExp; hit: Hit }[] = CITIES.flatMap(([cc, ja, en, ...more]) =>
  [ja, en, ...more].map((n) => ({
    re: /^[\x00-\x7f]+$/.test(n) || /[À-ÿ]/.test(n) ? new RegExp(`(^|[^A-Za-zÀ-ÿ])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-zÀ-ÿ])`, 'i') : new RegExp(n),
    hit: { cc, ja, en },
  })),
).sort((a, b) => b.re.source.length - a.re.source.length);

const UK_POST = /([A-Za-z][A-Za-z .'-]*?)\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/;
const JP_ADDR = /(東京都|北海道|京都府|大阪府|.{2,3}県)\s*([^\d\s]+?[市区町村郡])/;

/** 1つの文字列から国と街 */
export function placeIn(text?: string): { cc?: string; city?: Hit } {
  if (!text) return {};
  const t = text.trim();
  for (const n of NAMES) if (n.re.test(t)) return { cc: n.hit.cc, city: n.hit };
  const jp = t.match(JP_ADDR);
  if (jp) {
    const pref = jp[1];
    const name = pref === '東京都' ? '東京' : jp[2].replace(/[市区町村郡]$/, '');
    return { cc: 'JP', city: { cc: 'JP', ja: name, en: name } };
  }
  const uk = t.match(UK_POST);
  if (uk) {
    const name = uk[1].split(',').pop()!.trim();
    return name && !/\d/.test(name) ? { cc: 'GB', city: { cc: 'GB', ja: name, en: name } } : { cc: 'GB' };
  }
  return {};
}

const TRANSPORT = new Set(['flight', 'train', 'bus']);

/** 旅で行った国と街。乗り物は「着いた所」だけ数え、最後の乗り物（帰り）の行き先は数えない */
export function tripPlaces(trip: Trip): { countries: Set<string>; cities: Map<string, Hit> } {
  const countries = new Set<string>();
  const cities = new Map<string, Hit>();
  const live = trip.bookings.filter((b) => !b.cancelled);
  const moves = live.filter((b) => TRANSPORT.has(b.type)).sort((a, b) => `${a.start}${a.startTime ?? ''}`.localeCompare(`${b.start}${b.startTime ?? ''}`));
  const last = moves.length > 1 ? moves[moves.length - 1] : undefined;
  const add = (p: { cc?: string; city?: Hit }) => {
    if (p.cc) countries.add(p.cc);
    if (p.city) cities.set(`${p.city.cc}:${p.city.en.toLowerCase()}`, p.city);
  };
  live.forEach((b: Booking) => {
    if (b === last) return;
    if (TRANSPORT.has(b.type)) {
      const code = b.to?.trim().toUpperCase();
      if (b.type === 'flight' && code && /^[A-Z]{3}$/.test(code)) {
        const z = AIRPORT_TZ[code];
        if (z && TZ_CC[z]) countries.add(TZ_CC[z]);
        return;
      }
      add(placeIn(b.to) ?? {});
      return;
    }
    const p = placeIn(b.from);
    if (p.cc || p.city) add(p);
    else if (b.type !== 'car') add(placeIn(b.title));
    if (b.tz && TZ_CC[b.tz]) countries.add(TZ_CC[b.tz]);
  });
  return { countries, cities };
}

// 地図で小さすぎて見えない国は点で示す（経度・緯度）
export const SMALL_CC: Record<string, [number, number]> = {
  SG: [103.8, 1.35], HK: [114.17, 22.3], MO: [113.55, 22.2], MT: [14.4, 35.9], MC: [7.42, 43.74], MV: [73.5, 4.2], BH: [50.55, 26.07], LU: [6.13, 49.6],
  AD: [1.52, 42.5], LI: [9.55, 47.15], SM: [12.45, 43.94], VA: [12.45, 41.9], GU: [144.79, 13.44], MP: [145.75, 15.18], PW: [134.58, 7.5], BB: [-59.55, 13.1],
  MU: [57.55, -20.3], SC: [55.45, -4.6], CY: [33.2, 35.1],
};

/** 自然地球図法（地図データと同じ縮尺：幅1000×高さ520） */
export function projectNE(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  const p2 = p * p;
  const p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  const k = 182.78964407016804;
  return [500 + x * k, 260 - y * k];
}
