// 予約サイトへのリンク（提携ID を入れると紹介料の対象になる。空でもふつうの検索リンクとして使える）
// 登録後に下の ID を入れるだけで有効になる
export const PARTNER = {
  klook: '', // Klook アフィリエイトの aid
  gyg: '', // GetYourGuide の partner_id
  booking: '', // Booking.com の aid（2025年から CJ 経由の登録。リンクの形が変わる場合はここで直す）
  agoda: '', // Agoda の cid
  tripcom: '', // Trip.com の Allianceid
  airalo: '', // Airalo の紹介コード
  rakuten: '', // 楽天トラベル（楽天アフィリエイトID）
};

export type FindLink = { id: string; name: string; url: string };
const enc = encodeURIComponent;
const q2 = (title: string, city?: string) => [title, city].filter(Boolean).join(' ').trim();

/** チケット・ツアー・体験を探す */
export function activityLinks(title: string, city?: string): FindLink[] {
  const q = q2(title, city);
  if (!q) return [];
  return [
    { id: 'klook', name: 'Klook', url: `https://www.klook.com/search/result/?query=${enc(q)}${PARTNER.klook ? `&aid=${PARTNER.klook}` : ''}` },
    { id: 'gyg', name: 'GetYourGuide', url: `https://www.getyourguide.com/s/?q=${enc(q)}${PARTNER.gyg ? `&partner_id=${PARTNER.gyg}` : ''}` },
  ];
}

/** 宿を探す（日付があれば入れる）。国内なら楽天トラベルも */
export function hotelLinks(city: string, checkin?: string, checkout?: string, domestic = false): FindLink[] {
  if (!city) return [];
  const d = checkin && checkout ? `&checkin=${checkin}&checkout=${checkout}` : '';
  const rk = `https://search.travel.rakuten.co.jp/ds/hotellist/Japan-${enc(city)}`;
  return [
    ...(domestic ? [{ id: 'rakuten', name: '楽天トラベル', url: PARTNER.rakuten ? `https://hb.afl.rakuten.co.jp/hgc/${PARTNER.rakuten}/?pc=${enc(rk)}` : `https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query=${enc(city)}` }] : []),
    { id: 'booking', name: 'Booking.com', url: `https://www.booking.com/searchresults.html?ss=${enc(city)}${d}${PARTNER.booking ? `&aid=${PARTNER.booking}` : ''}` },
    { id: 'agoda', name: 'Agoda', url: `https://www.agoda.com/search?text=${enc(city)}${checkin ? `&checkIn=${checkin}` : ''}${PARTNER.agoda ? `&cid=${PARTNER.agoda}` : ''}` },
  ];
}

export const hasPartner = () => Object.values(PARTNER).some(Boolean);

/** eSIM を探す（海外旅行の持ち物の「eSIM」から） */
export function esimLinks(country?: string): FindLink[] {
  const q = country ? `eSIM ${country}` : 'eSIM';
  return [
    { id: 'klook-esim', name: 'Klook eSIM', url: `https://www.klook.com/search/result/?query=${enc(q)}${PARTNER.klook ? `&aid=${PARTNER.klook}` : ''}` },
    { id: 'airalo', name: 'Airalo', url: `https://www.airalo.com/${PARTNER.airalo ? `?ref=${PARTNER.airalo}` : ''}` },
  ];
}
