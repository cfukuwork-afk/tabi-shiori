// 地図まわり：検索語づくり・Apple／Googleマップを開く・経路URL
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import { Booking } from './data';
import { t } from './i18n';
import { AIRPORT_NAME } from './airports';

export type MapApp = 'ask' | 'apple' | 'google';
let MAP_APP: MapApp = 'ask';
export const setMapApp = (m: MapApp) => (MAP_APP = m);

const isCode = (s: string) => /^[A-Z]{3}$/.test(s.trim());
const STATION = /(station|gare|bahnhof|hbf|estación|stazione|駅|terminal|ターミナル|airport|空港|port|港)/i;

/** 地図アプリで探すときの言葉。空港コードは空港名に、駅名には「駅」を付ける */
export function placeQuery(b: Booking, which: 'from' | 'to', hint?: string): string | undefined {
  const v = (which === 'from' ? b.from : b.to)?.trim();
  if (b.type === 'flight') {
    if (!v) return undefined;
    if (isCode(v)) return AIRPORT_NAME[v.toUpperCase()] ?? `${v.toUpperCase()} Airport`;
    return STATION.test(v) ? v : `${v} Airport`;
  }
  if (b.type === 'train' || b.type === 'bus') {
    if (!v) return undefined;
    if (STATION.test(v)) return v;
    if (/[぀-ヿ一-鿿]/.test(v)) return b.type === 'bus' ? `${v} バスターミナル` : `${v}駅`;
    return b.type === 'bus' ? `${v} bus station` : `${v} station`;
  }
  if (which === 'to') return v || undefined;
  // ホテル・チケット・お店・予定・レンタカー：住所があれば住所、なければ名前で探す
  if (v) return b.title && !v.includes(b.title) && b.type !== 'car' ? `${b.title}, ${v}` : v;
  if (!b.title) return undefined;
  return hint ? `${b.title}, ${hint}` : b.title;
}

/** 旅行先の街（ホテルの住所の後ろの部分）。名前だけの予定を地図で探すときに添える */
export function tripCity(bookings: Booking[]): string | undefined {
  const h = bookings.find((b) => b.type === 'hotel' && b.from && b.from.includes(','));
  if (!h) return undefined;
  const parts = h.from!.split(',').map((x) => x.trim()).filter(Boolean);
  return parts.slice(-2).join(', ').replace(/^\d{3,6}\s*/, '') || undefined;
}

const appleUrl = (q: string) => `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
const googleUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/** 地図アプリを選んで開く（設定で決めていれば聞かない） */
export function openMap(q: string) {
  const go = (app: 'apple' | 'google') => Linking.openURL(app === 'apple' ? appleUrl(q) : googleUrl(q));
  if (MAP_APP !== 'ask' || Platform.OS === 'web') return go(MAP_APP === 'apple' ? 'apple' : 'google');
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [t('appleMaps'), t('googleMaps'), t('cancel')], cancelButtonIndex: 2, title: q },
      (i) => (i === 0 ? go('apple') : i === 1 ? go('google') : undefined),
    );
    return;
  }
  Alert.alert(q, undefined, [
    { text: t('appleMaps'), onPress: () => go('apple') },
    { text: t('googleMaps'), onPress: () => go('google') },
    { text: t('cancel'), style: 'cancel' },
  ]);
}

/** Googleマップの経路（立ち寄り地点つき）。Googleの上限に合わせて最大10地点 */
export function routeUrl(points: string[]): string | undefined {
  const p = points.filter(Boolean);
  const uniq = p.filter((x, i) => i === 0 || x !== p[i - 1]);
  if (uniq.length === 0) return undefined;
  if (uniq.length === 1) return googleUrl(uniq[0]);
  const list = uniq.slice(0, 10);
  const origin = list[0];
  const dest = list[list.length - 1];
  const way = list.slice(1, -1);
  return (
    `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}` +
    (way.length ? `&waypoints=${encodeURIComponent(way.join('|'))}` : '')
  );
}
