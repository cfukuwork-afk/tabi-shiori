// iPhone の地図（Apple マップ）。ピンに番号をつけ、移動を点線でつなぐ
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

export type MapPoint = { key: string; lat: number; lng: number; label: string; color: string; title: string; onPress?: () => void };

export type MapLine = { color: string; coords: { lat: number; lng: number }[] };

export default function NativeMap({ points, lines }: { points: MapPoint[]; lines: MapLine[] }) {
  const ref = useRef<MapView>(null);
  // 自作のピンは、最初は描き直しを許して表示が終わってから止める（止めたままだと空のピンになることがある）
  const [track, setTrack] = useState(true);
  const sig = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
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
      {lines.map((l, i) =>
        l.coords.length > 1 ? (
          <Polyline key={`${i}-${l.coords.length}`} coordinates={l.coords.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={l.color} strokeWidth={3} lineDashPattern={[8, 6]} />
        ) : null,
      )}
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
