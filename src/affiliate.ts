// 予約サイトへのリンク（提携ID を入れると紹介料の対象になる。空でもふつうの検索リンクとして使える）
import { PLACES } from './places';
import { AIRPORT_CITY } from './airports';
import { INSPIRE_IATA } from './inspireIata';
// 登録後に下の ID を入れるだけで有効になる
export const PARTNER = {
  klook: '', // Klook アフィリエイトの aid
  gyg: 'LCIKN6S', // GetYourGuide の partner_id
  booking: '', // Booking.com の aid（2025年から CJ 経由の登録。リンクの形が変わる場合はここで直す）
  agoda: '', // Agoda の cid
  tripcom: '', // Trip.com の Allianceid
  airalo: '', // Airalo の紹介コード
  rakuten: '59674a62.6f5d1f31.59674a63.cf344897', // 楽天トラベル（楽天アフィリエイトID）
};

export type FindLink = { id: string; name: string; url: string };
const enc = encodeURIComponent;

// Travelpayouts（承認済み：Klook・Airalo・KKday・Tiqets）。リンク先を tp.media 経由にすると紹介料の対象になる
const TP = { marker: '804335', trs: '599453' };
const TP_BRAND: Record<string, { c: string; p: string }> = {
  klook: { c: '137', p: '4110' },
  airalo: { c: '541', p: '8310' },
  kkday: { c: '633', p: '9074' },
  tiqets: { c: '89', p: '2074' },
  yesim: { c: '224', p: '5998' },
  saily: { c: '629', p: '8979' },
  kiwitaxi: { c: '1', p: '647' },
  welcome: { c: '627', p: '8919' },
  getrentacar: { c: '222', p: '5996' },
  localrent: { c: '87', p: '2043' },
  radical: { c: '209', p: '5867' },
  aviasales: { c: '100', p: '4114' },
  airhelp: { c: '120', p: '9139' },
};
const tp = (brand: keyof typeof TP_BRAND, url: string) =>
  `https://tp.media/r?campaign_id=${TP_BRAND[brand].c}&marker=${TP.marker}&p=${TP_BRAND[brand].p}&trs=${TP.trs}&u=${enc(url)}`;
const q2 = (title: string, city?: string) => [title, city].filter(Boolean).join(' ').trim();
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
/** 日本語などの都市名を英語にする（おすすめ都市のデータから。ないときはそのまま） */
let JA2EN: Record<string, string> | null = null;
export function cityEn(city?: string): string | undefined {
  if (!city) return city;
  const c = city.trim();
  if (!CJK.test(c)) return c;
  if (!JA2EN) {
    JA2EN = {};
    for (const [, , list] of PLACES) for (const [en, ja] of list) JA2EN[ja] = en;
    Object.assign(JA2EN, { 東京: 'Tokyo', 大阪: 'Osaka', 京都: 'Kyoto', 札幌: 'Sapporo', 福岡: 'Fukuoka', 那覇: 'Naha', 名古屋: 'Nagoya', 横浜: 'Yokohama', 神戸: 'Kobe', 奈良: 'Nara', 沖縄: 'Okinawa', 北海道: 'Hokkaido', ソウル: 'Seoul', 台北: 'Taipei', 香港: 'Hong Kong', 上海: 'Shanghai', 北京: 'Beijing', ロンドン: 'London', パリ: 'Paris', ニューヨーク: 'New York', ハワイ: 'Hawaii', ホノルル: 'Honolulu' });
  }
  return JA2EN[c] ?? JA2EN[c.replace(/[市府県都]$/, '')] ?? c;
}

/** チケット・ツアー・体験を探す */
export function activityLinks(title: string, city?: string): FindLink[] {
  const q = q2(title, city);
  if (!q) return [];
  return [
    { id: 'klook', name: 'Klook', url: tp('klook', `https://www.klook.com/search/result/?query=${enc(q)}`) },
    // Tiqets は日本語で検索すると関係ない結果になるので、英語にできるときだけ出す
    ...(!CJK.test(q2(title, cityEn(city))) ? [{ id: 'tiqets', name: 'Tiqets', url: tp('tiqets', `https://www.tiqets.com/en/search?q=${enc(q2(title, cityEn(city)))}`) }] : []),
    { id: 'kkday', name: 'KKday', url: tp('kkday', `https://www.kkday.com/en/product/productlist?keyword=${enc(q)}`) },
    { id: 'gyg', name: 'GetYourGuide', url: `https://www.getyourguide.com/s/?q=${enc(q)}${PARTNER.gyg ? `&partner_id=${PARTNER.gyg}&utm_medium=online_publisher` : ''}` },
  ];
}

/** 宿を探す（日付があれば入れる）。国内なら楽天トラベルも */
export function hotelLinks(city: string, checkin?: string, checkout?: string, domestic = false, cc?: string): FindLink[] {
  if (!city) return [];
  // Booking.com は「Kingston」だけだとイギリスの Kingston upon Thames になる。国がわかるときは「都市, 国」で探す
  let ss = city;
  // 国は、おすすめ都市のデータにある都市ならそちらを優先（空港のタイムゾーンからだと、ハノイがタイになるなどずれる）
  cc = PLACES.find((p) => p[2].some(([en]) => en === city))?.[0] ?? cc;
  if (cc && !['HK', 'MO', 'SG'].includes(cc) && !/,/.test(city) && !CJK.test(city)) {
    try {
      const country = new (Intl as any).DisplayNames(['en'], { type: 'region' }).of(cc);
      if (country && country !== city) ss = `${city}, ${country}`;
    } catch {}
  }
  const d = checkin && checkout ? `&checkin=${checkin}&checkout=${checkout}` : '';
  // 楽天トラベルのキーワード検索（日付があれば入れる）
  const [y1, m1, d1] = (checkin ?? '').split('-');
  const [y2, m2, d2] = (checkout ?? '').split('-');
  const rkDates = checkin && checkout ? `&f_nen1=${y1}&f_tuki1=${+m1}&f_hi1=${+d1}&f_nen2=${y2}&f_tuki2=${+m2}&f_hi2=${+d2}` : '';
  const rk = `https://kw.travel.rakuten.co.jp/keyword/Search.do?charset=utf-8&f_query=${enc(city)}${rkDates}`;
  return [
    ...(domestic ? [{ id: 'rakuten', name: '楽天トラベル', url: PARTNER.rakuten ? `https://hb.afl.rakuten.co.jp/hgc/${PARTNER.rakuten}/?pc=${enc(rk)}&m=${enc(rk)}` : rk }] : []),
    { id: 'booking', name: 'Booking.com', url: `https://www.booking.com/searchresults.html?ss=${enc(ss)}${d}${PARTNER.booking ? `&aid=${PARTNER.booking}` : ''}` },
    // Agoda と Trip.com は、都市名の検索リンクが使えない（トップページや0件になる）。提携の承認後に都市IDつきで入れる
  ];
}

export const hasPartner = () => true;

/** eSIM を探す（海外旅行の持ち物の「eSIM」から） */
export function esimLinks(country?: string): FindLink[] {
  const q = country ? `eSIM ${country}` : 'eSIM';
  return [
    { id: 'airalo', name: 'Airalo', url: tp('airalo', 'https://www.airalo.com/') },
    { id: 'yesim', name: 'Yesim', url: tp('yesim', 'https://yesim.app/') },
    { id: 'saily', name: 'Saily', url: tp('saily', 'https://saily.com/') },
    { id: 'klook-esim', name: 'Klook eSIM', url: tp('klook', `https://www.klook.com/search/result/?query=${enc(q)}`) },
  ];
}

/** 航空券を探す */
export const flightLinks = (): FindLink[] => [{ id: 'aviasales', name: 'Aviasales', url: tp('aviasales', 'https://www.aviasales.com/') }];
/** 空港からの送迎 */
export const transferLinks = (): FindLink[] => [
  { id: 'kiwitaxi', name: 'Kiwitaxi', url: tp('kiwitaxi', 'https://kiwitaxi.com/') },
  { id: 'welcome', name: 'Welcome Pickups', url: tp('welcome', 'https://www.welcomepickups.com/') },
];
/** レンタカー */
export const carLinks = (): FindLink[] => [
  { id: 'getrentacar', name: 'GetRentacar', url: tp('getrentacar', 'https://getrentacar.com/') },
  { id: 'localrent', name: 'Localrent', url: tp('localrent', 'https://localrent.com/') },
];
/** 荷物を預ける（チェックアウト後・出発前） */
export const luggageLinks = (city?: string): FindLink[] => [
  // 検索ページはトップに飛ぶので、都市ページ（/luggage-storage/london）を開く
  { id: 'radical', name: 'Radical Storage', url: tp('radical', radicalUrl(city)) },
];
const radSlug = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const RADICAL_CITIES = new Set(
  [...Object.values(AIRPORT_CITY), 'Kyoto', 'Nara', 'Kobe', 'Yokohama', 'Hiroshima', 'Florence', 'Naples', 'Porto', 'Seville', 'Valencia', 'Nice', 'Lyon', 'Marseille', 'Bordeaux', 'Edinburgh', 'Liverpool', 'Bristol', 'Oxford', 'Cambridge', 'Bath', 'York', 'Brighton', 'Glasgow', 'Hamburg', 'Cologne', 'Krakow', 'Salzburg', 'Bruges', 'Antwerp', 'Rotterdam', 'Chicago', 'Miami', 'Orlando', 'New Orleans', 'San Diego', 'Montreal', 'Quebec City', 'Rio de Janeiro', 'Buenos Aires', 'Lima', 'Cusco', 'Marrakech', 'Cairo', 'Cape Town', 'Chiang Mai', 'Phuket', 'Seoul', 'Busan', 'Hong Kong'].map((x) => radSlug(x)),
);
function radicalUrl(city?: string) {
  const en = cityEn(city);
  // 都市ページがあるのは大きな都市だけ（小さな町は404になる）。空港のある都市＋主要都市に限る
  if (!en || CJK.test(en) || !RADICAL_CITIES.has(radSlug(en))) return 'https://radicalstorage.com/';
  const slug = radSlug(en);
  return slug ? `https://radicalstorage.com/luggage-storage/${slug}` : 'https://radicalstorage.com/';
}
/** 遅延・欠航の補償 */
export const airhelpLink = (): FindLink => ({ id: 'airhelp', name: 'AirHelp', url: tp('airhelp', 'https://www.airhelp.com/') });
/** 行き先のおすすめ（ホーム）：体験と航空券 */
// 同じ名前の有名な場所が別の国にある都市（Kingston→カナダ、Santiago→スペイン 等）は、検索が別の国に飛ぶので国名で探す
const AMBIGUOUS = new Set(['Kingston', 'Trinidad', 'San José', 'Santiago', 'Salvador', 'Cartagena', 'Cork', 'Bath', 'Split', 'Sur', 'Flores', 'Salento', 'Copacabana', 'Cuenca', 'Saint-Louis', 'La Paz', 'Sucre', 'Baños', 'Stanley', 'Ella', 'Paro', 'Mendoza', 'Tutong', 'Addu', 'Fontvieille', 'Comino']);
// アジア・オセアニアは Klook、それ以外（ヨーロッパ・中東・アフリカ・南北アメリカ）は GetYourGuide のほうが品ぞろえが多い
const KLOOK_REGIONS = new Set(['ea', 'sea', 'sa', 'oc']);
export function inspireLinks(city: string, cc?: string): FindLink[] {
  const place = PLACES.find((p) => p[0] === cc);
  let country = cc ?? '';
  try {
    country = cc ? new (Intl as any).DisplayNames(['en'], { type: 'region' }).of(cc) ?? cc : '';
  } catch {}
  const q = AMBIGUOUS.has(city) && country ? country : city;
  const act: FindLink =
    place && !KLOOK_REGIONS.has(place[1])
      ? { id: 'gyg', name: 'GetYourGuide', url: `https://www.getyourguide.com/s/?q=${enc(q)}${PARTNER.gyg ? `&partner_id=${PARTNER.gyg}&utm_medium=online_publisher` : ''}` }
      : { id: 'klook', name: 'Klook', url: tp('klook', `https://www.klook.com/search/result/?query=${enc(q)}`) };
  // 航空券：行き先の空港を入れて開く（出発地は Aviasales が現在地から自動で入れる）
  const iata = INSPIRE_IATA[city];
  const fly: FindLink = { id: 'aviasales', name: 'Aviasales', url: tp('aviasales', iata ? `https://www.aviasales.com/?destination=${iata}` : 'https://www.aviasales.com/') };
  return [act, fly];
}
