// 旅行の地図：予約と予定をピンで並べ、日ごとの移動を線でつなぐ
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Booking, Trip, timeline, typeOf } from './data';
import { C } from './theme';
import { dot, t, prettyDate, typeName } from './i18n';
import { openMap, placeQuery, routeUrl, tripCity } from './maps';
import { Geo, getRoute, locate, looksLikeAddress, searchPlace } from './geo';
import NativeMap, { MapBadge, MapLine, LineStyle } from './NativeMap';
import { distKm, estimate, fmtKm } from './eta';
import { openRoute } from './maps';

export type Stop = { key: string; day: string; n: number; time?: string; title: string; sub: string; q: string; b: Booking; color: string };

/** 地図に出す地点を、日付と時間の順に並べる */
export function tripStops(trip: Trip): Stop[] {
  const city = tripCity(trip.bookings);
  const out: Stop[] = [];
  timeline(trip).forEach(({ date, items }) => {
    let n = 0;
    const add = (b: Booking, q: string | undefined, sub: string, time?: string) => {
      if (!q) return;
      const last = out[out.length - 1];
      if (last && last.day === date && last.q === q) return; // 同じ場所が続くときはまとめる
      n += 1;
      out.push({ key: `${b.id}-${out.length}`, day: date, n, time, title: b.title || typeName(b.type), sub, q, b, color: typeOf(b.type).color });
    };
    items.forEach(({ booking: b, edge, time }) => {
      if (b.type === 'flight' || b.type === 'train' || b.type === 'bus') {
        add(b, placeQuery(b, 'from'), b.from ?? '', time);
        add(b, placeQuery(b, 'to'), b.to ?? '', b.endTime);
      } else if (b.type === 'car' && edge === 'end') {
        add(b, placeQuery(b, b.to ? 'to' : 'from', city), b.to ?? b.from ?? '', time);
      } else {
        add(b, placeQuery(b, 'from', city), b.from ?? '', time);
      }
    });
  });
  return out;
}

type Seg = { key: string; day: string; mode: LineStyle; a: Geo; b: Geo };
const MODE_COLOR: Record<LineStyle, string> = { flight: '#2F6BFF', train: '#00A86B', bus: '#F59F00', walk: '#FF3D7F', car: '#7B2FF7', ride: '#0096C7' };
const MODE_KEY: Record<LineStyle, 'mFlight' | 'mTrain' | 'mBus' | 'mWalk' | 'mCar' | 'mRide'> = { flight: 'mFlight', train: 'mTrain', bus: 'mBus', walk: 'mWalk', car: 'mCar', ride: 'mRide' };
const MODE_ICON: Record<LineStyle, string> = { flight: 'airplane', train: 'train', bus: 'bus', walk: 'walk', car: 'car', ride: 'subway' };

/** となりあう地点の区間と、その移動手段 */
function segments(list: Stop[], geo: Record<string, Geo | null>, trip: Trip): Seg[] {
  const out: Seg[] = [];
  for (let i = 1; i < list.length; i++) {
    const p = list[i - 1];
    const s = list[i];
    if (p.day !== s.day) continue;
    const a = geo[p.q];
    const b = geo[s.q];
    if (!a || !b || distKm(a, b) < 0.03) continue;
    let mode: LineStyle;
    if (p.b.id === s.b.id && (s.b.type === 'flight' || s.b.type === 'train' || s.b.type === 'bus')) mode = s.b.type;
    else if (distKm(a, b) <= 1.5) mode = 'walk';
    else {
      // その日にレンタカーを借りていれば車、そうでなければ電車・バスなど
      const car = trip.bookings.some((x) => x.type === 'car' && !x.cancelled && x.start <= s.day && (x.end ?? x.start) >= s.day);
      mode = car ? 'car' : 'ride';
    }
    out.push({ key: `${p.key}>${s.key}`, day: s.day, mode, a, b });
  }
  return out;
}

/** 飛行機の線：ふくらんだ弧にする（直線の道と見分けやすく） */
function arc(a: Geo, b: Geo) {
  const mx = (a.lng + b.lng) / 2;
  const my = (a.lat + b.lat) / 2;
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const cx = mx - dy * 0.25;
  const cy = my + dx * 0.25;
  return Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    return { lat: (1 - t) ** 2 * a.lat + 2 * (1 - t) * t * cy + t * t * b.lat, lng: (1 - t) ** 2 * a.lng + 2 * (1 - t) * t * cx + t * t * b.lng };
  });
}

// 日ごとの色（全日程のときの線とピン）
const DAY_COLORS = ['#FF5B3A', '#3B5BDB', '#1F9D74', '#7048E8', '#D6336C', '#B07D00', '#0B7285', '#E8590C', '#495057'];

export default function MapTab({ trip, onOpen }: { trip: Trip; onOpen: (b: Booking) => void }) {
  const stops = useMemo(() => tripStops(trip), [trip]);
  const days = useMemo(() => [...new Set(stops.map((s) => s.day))], [stops]);
  const [day, setDay] = useState<string>('all');
  const [geo, setGeo] = useState<Record<string, Geo | null>>({});
  const [busy, setBusy] = useState(false);
  const [paths, setPaths] = useState<Record<string, { lat: number; lng: number }[]>>({});

  useEffect(() => {
    let off = false;
    (async () => {
      setBusy(true);
      const found: Record<string, Geo | null> = { ...geo };
      const isMove = (st: Stop) => ['flight', 'train', 'bus'].includes(st.b.type);
      // 時間の順で一番近い、見つかっている地点（前の予定、なければ後の予定）。別の町に飛んだ結果を見分けるのに使う
      const refOf = (st: Stop) => {
        const i = stops.indexOf(st);
        for (let k = i - 1; k >= 0; k--) if (found[stops[k].q]) return found[stops[k].q]!;
        for (let k = i + 1; k < stops.length; k++) if (found[stops[k].q]) return found[stops[k].q]!;
        return null;
      };
      // ①駅・空港 → ②住所 → ③名前だけ（近くに絞って）の順に探す
      const order = [
        ...stops.filter((st) => isMove(st)),
        ...stops.filter((st) => !isMove(st) && looksLikeAddress(st.q)),
        ...stops.filter((st) => !isMove(st) && !looksLikeAddress(st.q)),
      ];
      for (const st of order) {
        if (off) return;
        if (st.q in found) continue;
        let g: Geo | null = null;
        if (isMove(st)) g = await locate(st.q, null, true);
        else {
          const ref = refOf(st);
          // 「名前, 住所」で見つからなければ、住所だけ → 名前だけ（近くに絞って）の順に試す
          const v = st.b.from?.trim();
          const alts = [st.q, ...(v && v !== st.q ? [v] : []), ...(ref && st.b.title && st.b.title !== st.q ? [st.b.title] : [])];
          for (const q of alts) {
            let c = await locate(q, looksLikeAddress(q) ? null : ref);
            // 前後の予定から100km以上離れていたら別の町の可能性が高い → 近くに絞って探し直し、だめなら次の候補
            if (c && ref && distKm(c, ref) > 100) {
              const c2 = await searchPlace(q, ref);
              c = c2 && distKm(c2, ref) <= 100 ? c2 : null;
            }
            if (c) {
              g = c;
              break;
            }
          }
        }
        found[st.q] = g;
        if (!off) setGeo((x) => ({ ...x, [st.q]: g }));
      }
      if (!off) setBusy(false);
    })();
    return () => {
      off = true;
    };
  }, [stops.map((s) => s.q).join('|')]);

  // 徒歩・車の区間は、実際の道のりを取ってくる（OpenStreetMap）
  const segKeys = segments(stops, geo, trip)
    .filter((g) => (g.mode === 'walk' || g.mode === 'car' || g.mode === 'ride') && distKm(g.a, g.b) < 60)
    .map((g) => g.key)
    .join('|');
  useEffect(() => {
    let off = false;
    (async () => {
      for (const g of segments(stops, geo, trip)) {
        if (off) return;
        if (!(g.mode === 'walk' || g.mode === 'car' || g.mode === 'ride') || distKm(g.a, g.b) >= 60 || paths[g.key]) continue;
        const r = await getRoute(g.mode === 'walk' ? 'foot' : 'car', g.a, g.b);
        if (r && !off) setPaths((x) => ({ ...x, [g.key]: r.coords.map(([lat, lng]) => ({ lat, lng })) }));
      }
    })();
    return () => {
      off = true;
    };
  }, [segKeys]);

  const all = day === 'all';
  const shown = all ? stops : stops.filter((s) => s.day === day);
  const dayNo = (d: string) => days.indexOf(d) + 1;
  const dayColor = (d: string) => DAY_COLORS[(dayNo(d) - 1) % DAY_COLORS.length];
  // 全日程では「日-順番」（例：2-3 = 2日目の3番目）、1日だけのときは順番だけ
  const label = (s: Stop) => (all ? `${dayNo(s.day)}-${s.n}` : String(s.n));
  const pinColor = (s: Stop) => (all ? dayColor(s.day) : C.ink);
  // 同じ場所（30m以内）のピンは1つにまとめて番号を並べる（重なって見えなくならないように）
  const points: { key: string; lat: number; lng: number; label: string; color: string; title: string; onPress: () => void }[] = [];
  shown.forEach((s) => {
    const g = geo[s.q];
    if (!g) return;
    const same = points.find((p) => distKm(p, g) < 0.03);
    if (same) {
      same.label += `·${label(s)}`;
      same.title += ` / ${label(s)}  ${s.title}`;
      same.key += `+${label(s)}`;
      return;
    }
    points.push({ key: `${s.key}|${label(s)}`, lat: g.lat, lng: g.lng, label: label(s), color: pinColor(s), title: `${label(s)}  ${s.title}`, onPress: () => onOpen(s.b) });
  });
  // 線は日ごとに引く。全日程では日ごとに色を変える
  // 区間ごとに移動の手段を決めて、線の描き方を変える（飛行機・電車・バス・徒歩・車）
  const segs = segments(shown, geo, trip);
  const lines: MapLine[] = segs.map((g) => ({
    color: all ? dayColor(g.day) : MODE_COLOR[g.mode],
    style: g.mode,
    coords: g.mode === 'flight' ? arc(g.a, g.b) : (paths[g.key] ?? [g.a, g.b]),
  }));
  const badges: MapBadge[] = segs
    .filter((g) => distKm(g.a, g.b) > 0.3)
    .map((g) => {
      const c = g.mode === 'flight' ? arc(g.a, g.b) : (paths[g.key] ?? [g.a, g.b]);
      const mid = c.length > 2 ? c[Math.floor(c.length / 2)] : { lat: (g.a.lat + g.b.lat) / 2, lng: (g.a.lng + g.b.lng) / 2 };
      return { key: `b-${g.key}`, lat: mid.lat, lng: mid.lng, icon: MODE_ICON[g.mode], color: all ? dayColor(g.day) : MODE_COLOR[g.mode] };
    });
  const missing = shown.filter((s) => s.q in geo && !geo[s.q]);
  const route = routeUrl(shown.map((s) => s.q));

  if (!stops.length) return <Text style={st.empty}>{t('mapEmpty')}</Text>;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
        {['all', ...days].map((d) => (
          <Pressable key={d} onPress={() => setDay(d)} style={[st.chip, day === d && st.chipOn]}>
            <Text style={[st.chipText, day === d && { color: C.onInk }]}>
              {d === 'all' ? t('allDays') : `${t('dayN', { n: days.indexOf(d) + 1 })} ${dot()} ${prettyDate(d)}`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={st.mapBox}>
        <NativeMap points={points} lines={lines} badges={badges} />
        {busy && (
          <View style={st.busy}>
            <Text style={st.busyText}>{t('mapLoading')}</Text>
          </View>
        )}
      </View>
      {segs.length > 0 && (
        <View style={st.legend}>
          {[...new Set(segs.map((g) => g.mode))].map((m) => (
            <View key={m} style={st.legendItem}>
              <Ionicons name={MODE_ICON[m] as any} size={13} color={all ? C.sub : MODE_COLOR[m]} />
              <Text style={st.legendText}>{t(MODE_KEY[m])}</Text>
            </View>
          ))}
        </View>
      )}
      {!!route && (
        <Pressable style={st.routeBtn} onPress={() => Linking.openURL(route)}>
          <Ionicons name="navigate" size={16} color={C.onInk} />
          <Text style={st.routeText}>{t('routeGoogle')}</Text>
        </Pressable>
      )}
      <View style={{ marginTop: 14 }}>
        {shown.map((s, i) => {
          const newDay = i === 0 || shown[i - 1].day !== s.day;
          const prev = !newDay ? shown[i - 1] : undefined;
          // 同じ便・列車の出発→到着の間は出さない
          const leg = prev && prev.b.id === s.b.id && ['flight', 'train', 'bus'].includes(s.b.type);
          const est = prev && !leg && geo[prev.q] && geo[s.q] ? estimate(geo[prev.q]!, geo[s.q]!) : null;
          const sg = prev ? segs.find((g) => g.key === `${prev.key}>${s.key}`) : undefined;
          return (
            <View key={s.key}>
              {est && est.mode !== 'far' && (
                <Pressable style={st.eta} onPress={() => openRoute(prev!.q, s.q)}>
                  <Ionicons name={((sg ? MODE_ICON[sg.mode] : est.mode === 'walk' ? 'walk' : 'subway') + '-outline') as any} size={13} color={C.sub} />
                  <Text style={st.etaText}>{`${sg ? t(MODE_KEY[sg.mode]) : est.mode === 'walk' ? t('walk') : t('ride')} ${t('aboutMin', { n: est.min })} · ${fmtKm(est.km)}`}</Text>
                  <Ionicons name="chevron-forward" size={12} color={C.sub} />
                </Pressable>
              )}
              {newDay && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 6 }}>
                  {all && <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: dayColor(s.day) }} />}
                  <Text style={[st.dayHead, { marginTop: 0, marginBottom: 0 }]}>{`${t('dayN', { n: dayNo(s.day) })}  ${prettyDate(s.day)}`}</Text>
                </View>
              )}
              <Pressable style={st.row} onPress={() => openMap(s.q)} onLongPress={() => onOpen(s.b)}>
                <View style={[st.num, { borderColor: pinColor(s) }]}>
                  <Text style={[st.numText, { color: pinColor(s) }]}>{label(s)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.title} numberOfLines={2}>
                    {s.time ? `${s.time}  ` : ''}
                    {s.title}
                  </Text>
                  {!!s.sub && (
                    <Text style={st.sub} numberOfLines={2}>
                      {s.sub}
                    </Text>
                  )}
                </View>
                <Ionicons name={geo[s.q] === null ? 'alert-circle-outline' : 'navigate-outline'} size={18} color={geo[s.q] === null ? C.pink : C.sub} />
              </Pressable>
            </View>
          );
        })}
      </View>
      {missing.length > 0 && <Text style={st.missing}>{`${t('mapNoPin')}: ${missing.map((m) => m.title).join('、')}`}</Text>}
    </View>
  );
}

let st = makeSt();
export function restyleMap() {
  st = makeSt();
}
function makeSt() {
  return StyleSheet.create({
  eta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 13, paddingLeft: 22, borderLeftWidth: 2, borderStyle: 'dotted', borderColor: C.line, paddingVertical: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { color: C.sub, fontSize: 12, fontWeight: '700' },
  etaText: { color: C.sub, fontSize: 12, fontWeight: '700' },
  empty: { color: C.sub, textAlign: 'center', marginTop: 40, lineHeight: 22 },
  chip: { borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  chipText: { fontWeight: '800', color: C.ink, fontSize: 13 },
  mapBox: { height: 360, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: C.chip },
  busy: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: 'rgba(21,23,28,0.85)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  busyText: { color: C.onInk, fontSize: 12, fontWeight: '700' },
  routeBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink, borderRadius: 16, paddingVertical: 14, marginTop: 12 },
  routeText: { color: C.onInk, fontWeight: '800', fontSize: 15 },
  dayHead: { fontSize: 13, fontWeight: '900', color: C.ink, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: C.line },
  num: { minWidth: 32, height: 28, paddingHorizontal: 5, borderRadius: 14, borderWidth: 2.5, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  numText: { color: C.onInk, fontWeight: '900', fontSize: 13 },
  title: { fontWeight: '800', color: C.ink, fontSize: 14 },
  sub: { color: C.sub, fontSize: 12, marginTop: 2 },
  missing: { color: C.sub, fontSize: 12, marginTop: 8, lineHeight: 18 },
});
}
