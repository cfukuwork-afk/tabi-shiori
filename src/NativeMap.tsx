// iPhone の地図（Apple マップ）。ピンに番号をつけ、移動を点線でつなぐ
import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { C } from './theme';

export type MapPoint = { key: string; lat: number; lng: number; label: string; color: string; title: string; onPress?: () => void };

export default function NativeMap({ points, lines }: { points: MapPoint[]; lines: { lat: number; lng: number }[][] }) {
  const ref = useRef<MapView>(null);
  const sig = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  useEffect(() => {
    if (!points.length) return;
    const t = setTimeout(() => {
      ref.current?.fitToCoordinates(
        points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 60, right: 50, bottom: 50, left: 50 }, animated: true },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [sig]);
  return (
    <MapView ref={ref} style={{ flex: 1 }} showsPointsOfInterests={false} toolbarEnabled={false}>
      {lines.map((l, i) =>
        l.length > 1 ? (
          <Polyline key={i} coordinates={l.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={C.pink} strokeWidth={3} lineDashPattern={[6, 6]} />
        ) : null,
      )}
      {points.map((p) => (
        <Marker key={p.key} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.title} onCalloutPress={p.onPress} tracksViewChanges={false}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: p.color, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{p.label}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}
