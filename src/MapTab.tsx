// 旅行の地図：予約と予定をピンで並べ、日ごとの移動を線でつなぐ
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Booking, Trip, timeline, typeOf } from './data';
import { C } from './theme';
import { t, prettyDate, typeName } from './i18n';
import { openMap, placeQuery, routeUrl, tripCity } from './maps';
import { geocode, Geo } from './geo';
import NativeMap from './NativeMap';

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
      for (const s of stops) {
        if (off) return;
        if (s.q in geo) continue;
        const g = await geocode(s.q);
        if (!off) setGeo((x) => ({ ...x, [s.q]: g }));
      }
      if (!off) setBusy(false);
    })();
    return () => {
      off = true;
    };
  }, [stops.map((s) => s.q).join('|')]);

  const shown = day === 'all' ? stops : stops.filter((s) => s.day === day);
  const points = shown
    .map((s) => ({ s, g: geo[s.q] }))
    .filter((x): x is { s: Stop; g: Geo } => !!x.g)
    .map(({ s, g }) => ({ key: s.key, lat: g.lat, lng: g.lng, label: String(s.n), color: s.color, title: s.title, onPress: () => onOpen(s.b) }));
  // 線は日ごとに引く（日をまたいだ移動は飛行機・電車の線で分かる）
  const lines = (day === 'all' ? days : [day]).map((d) =>
    shown.filter((s) => s.day === d && geo[s.q]).map((s) => ({ lat: geo[s.q]!.lat, lng: geo[s.q]!.lng })),
  );
  const missing = shown.filter((s) => s.q in geo && !geo[s.q]);
  const route = routeUrl(shown.map((s) => s.q));

  if (!stops.length) return <Text style={st.empty}>{t('mapEmpty')}</Text>;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
        {['all', ...days].map((d) => (
          <Pressable key={d} onPress={() => setDay(d)} style={[st.chip, day === d && st.chipOn]}>
            <Text style={[st.chipText, day === d && { color: '#fff' }]}>
              {d === 'all' ? t('allDays') : `${t('dayN', { n: days.indexOf(d) + 1 })} ・ ${prettyDate(d)}`}
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
          <Ionicons name="navigate" size={16} color="#fff" />
          <Text style={st.routeText}>{t('routeGoogle')}</Text>
        </Pressable>
      )}
      <View style={{ marginTop: 14 }}>
        {shown.map((s, i) => {
          const newDay = i === 0 || shown[i - 1].day !== s.day;
          return (
            <View key={s.key}>
              {newDay && <Text style={st.dayHead}>{`${t('dayN', { n: days.indexOf(s.day) + 1 })}  ${prettyDate(s.day)}`}</Text>}
              <Pressable style={st.row} onPress={() => openMap(s.q)} onLongPress={() => onOpen(s.b)}>
                <View style={[st.num, { backgroundColor: s.color }]}>
                  <Text style={st.numText}>{s.n}</Text>
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

const st = StyleSheet.create({
  empty: { color: C.sub, textAlign: 'center', marginTop: 40, lineHeight: 22 },
  chip: { borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  chipText: { fontWeight: '800', color: C.ink, fontSize: 13 },
  mapBox: { height: 360, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: C.chip },
  busy: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: 'rgba(21,23,28,0.85)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  busyText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  routeBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink, borderRadius: 16, paddingVertical: 14, marginTop: 12 },
  routeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dayHead: { fontSize: 13, fontWeight: '900', color: C.ink, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: C.line },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  title: { fontWeight: '800', color: C.ink, fontSize: 14 },
  sub: { color: C.sub, fontSize: 12, marginTop: 2 },
  missing: { color: C.sub, fontSize: 12, marginTop: 8, lineHeight: 18 },
});
