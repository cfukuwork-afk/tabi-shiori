// 旅行の地図：予約と予定をピンで並べ、日ごとの移動を線でつなぐ
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Booking, Trip, timeline, typeOf } from './data';
import { C } from './theme';
import { dot, t, prettyDate, typeName } from './i18n';
import { openMap, placeQuery, routeUrl, tripCity } from './maps';
import { Geo, locate, looksLikeAddress } from './geo';
import NativeMap from './NativeMap';
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

// 日ごとの色（全日程のときの線とピン）
const DAY_COLORS = ['#FF5B3A', '#3B5BDB', '#1F9D74', '#7048E8', '#D6336C', '#B07D00', '#0B7285', '#E8590C', '#495057'];

export default function MapTab({ trip, onOpen }: { trip: Trip; onOpen: (b: Booking) => void }) {
  const stops = useMemo(() => tripStops(trip), [trip]);
  const days = useMemo(() => [...new Set(stops.map((s) => s.day))], [stops]);
  const [day, setDay] = useState<string>('all');
  const [geo, setGeo] = useState<Record<string, Geo | null>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    (async () => {
      setBusy(true);
      const found: Record<string, Geo | null> = { ...geo };
      // 住所・駅・空港を先に探して、名前だけの予定はその近くに絞って探す（同じ名前の別の場所に飛ばないように）
      const isMove = (st: Stop) => ['flight', 'train', 'bus'].includes(st.b.type);
      const order = [...stops.filter((st) => isMove(st) || looksLikeAddress(st.q)), ...stops.filter((st) => !isMove(st) && !looksLikeAddress(st.q))];
      for (const st of order) {
        if (off) return;
        if (st.q in found) continue;
        const sameDay = stops.filter((x) => x.day === st.day && found[x.q]).map((x) => found[x.q]!);
        const any = stops.filter((x) => found[x.q] && !(x.b.type === 'flight')).map((x) => found[x.q]!);
        const near = sameDay[sameDay.length - 1] ?? any[0] ?? null;
        let g = await locate(st.q, isMove(st) ? null : near, isMove(st));
        // 近くの地点から300km以上離れた結果は別の場所とみなして使わない
        if (g && near && !isMove(st) && distKm(g, near) > 300) g = null;
        found[st.q] = g;
        if (!off) setGeo((x) => ({ ...x, [st.q]: g }));
      }
      if (!off) setBusy(false);
    })();
    return () => {
      off = true;
    };
  }, [stops.map((s) => s.q).join('|')]);

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
  const lines = (all ? days : [day]).map((d) => ({
    color: all ? dayColor(d) : C.pink,
    coords: shown.filter((s) => s.day === d && geo[s.q]).map((s) => ({ lat: geo[s.q]!.lat, lng: geo[s.q]!.lng })),
  }));
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
        <NativeMap points={points} lines={lines} />
        {busy && (
          <View style={st.busy}>
            <Text style={st.busyText}>{t('mapLoading')}</Text>
          </View>
        )}
      </View>
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
          return (
            <View key={s.key}>
              {est && est.mode !== 'far' && (
                <Pressable style={st.eta} onPress={() => openRoute(prev!.q, s.q)}>
                  <Ionicons name={est.mode === 'walk' ? 'walk-outline' : 'train-outline'} size={13} color={C.sub} />
                  <Text style={st.etaText}>{`${est.mode === 'walk' ? t('walk') : t('ride')} ${t('aboutMin', { n: est.min })} · ${fmtKm(est.km)}`}</Text>
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
                <View style={[st.num, { backgroundColor: pinColor(s) }]}>
                  <Text style={st.numText}>{label(s)}</Text>
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
  num: { minWidth: 30, height: 26, paddingHorizontal: 5, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numText: { color: C.onInk, fontWeight: '900', fontSize: 13 },
  title: { fontWeight: '800', color: C.ink, fontSize: 14 },
  sub: { color: C.sub, fontSize: 12, marginTop: 2 },
  missing: { color: C.sub, fontSize: 12, marginTop: 8, lineHeight: 18 },
});
}
