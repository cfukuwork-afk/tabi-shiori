// iPhone の地図（Apple マップ）。ピンに番号をつけ、移動を点線でつなぐ
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';

export type MapPoint = { key: string; lat: number; lng: number; label: string; color: string; title: string; onPress?: () => void };

// 線の種類：飛行機は弧の破線、電車は線路の模様、バスは太線、徒歩は点線、車・電車（街中）は実線
export type LineStyle = 'flight' | 'train' | 'bus' | 'walk' | 'ride' | 'car';
export type MapLine = { color: string; coords: { lat: number; lng: number }[]; style?: LineStyle };
export type MapBadge = { key: string; lat: number; lng: number; icon: string; color: string };

export default function NativeMap({ points, lines, badges = [] }: { points: MapPoint[]; lines: MapLine[]; badges?: MapBadge[] }) {
  const ref = useRef<MapView>(null);
  // 自作のピンは、最初は描き直しを許して表示が終わってから止める（止めたままだと空のピンになることがある）
  const [track, setTrack] = useState(true);
  const sig = badges.map((b) => b.key).join(',') + '#' + points.map((p) => `${p.key}:${p.label}:${p.color}:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  useEffect(() => {
    setTrack(true);
    const off = setTimeout(() => setTrack(false), 1200);
    if (!points.length) return () => clearTimeout(off);
    const t = setTimeout(() => {
      if (points.length === 1) {
        ref.current?.animateToRegion({ latitude: points[0].lat, longitude: points[0].lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 400);
        return;
      }
      ref.current?.fitToCoordinates(
        points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 60, right: 50, bottom: 50, left: 50 }, animated: true },
      );
    }, 300);
    return () => {
      clearTimeout(t);
      clearTimeout(off);
    };
  }, [sig]);
  return (
    <MapView ref={ref} style={{ flex: 1 }} showsPointsOfInterests={false} toolbarEnabled={false}>
      {lines.map((l, i) => {
        if (l.coords.length < 2) return null;
        const c = l.coords.map((p) => ({ latitude: p.lat, longitude: p.lng }));
        const k = `${i}-${l.style}-${l.coords.length}`;
        switch (l.style) {
          case 'flight':
            return <Polyline key={k} coordinates={c} strokeColor={l.color} strokeWidth={2} lineDashPattern={[10, 8]} geodesic />;
          case 'train':
            // 線路のように：太い線の上に白の破線
            return [
              <Polyline key={k + 'a'} coordinates={c} strokeColor={l.color} strokeWidth={6} lineCap="round" />,
              <Polyline key={k + 'b'} coordinates={c} strokeColor="#FFFFFF" strokeWidth={2} lineDashPattern={[6, 6]} />,
            ];
          case 'bus':
            return <Polyline key={k} coordinates={c} strokeColor={l.color} strokeWidth={5} lineCap="round" />;
          case 'walk':
            return <Polyline key={k} coordinates={c} strokeColor={l.color} strokeWidth={4} lineCap="round" lineDashPattern={[1, 7]} />;
          case 'car':
          case 'ride':
            return <Polyline key={k} coordinates={c} strokeColor={l.color} strokeWidth={3.5} lineCap="round" lineJoin="round" />;
          default:
            return <Polyline key={k} coordinates={c} strokeColor={l.color} strokeWidth={1.5} lineDashPattern={[4, 4]} />;
        }
      })}
      {badges.map((b) => (
        <Marker key={b.key} coordinate={{ latitude: b.lat, longitude: b.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: b.color, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={b.icon as any} size={13} color={b.color} />
          </View>
        </Marker>
      ))}
      {points.map((p) => (
        <Marker key={p.key} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.title} onCalloutPress={p.onPress} tracksViewChanges={track}>
          <View style={{ minWidth: 28, height: 28, paddingHorizontal: 5, borderRadius: 14, backgroundColor: p.color, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>{p.label}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}
