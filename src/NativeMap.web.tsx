// Web 版（確認用）：地図の代わりに案内を出す
import { Text, View } from 'react-native';
import { C } from './theme';
import type { MapPoint } from './NativeMap';
export type { MapPoint };

export default function NativeMap({ points }: { points: MapPoint[]; lines: { lat: number; lng: number }[][] }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Text style={{ color: C.sub, textAlign: 'center' }}>{`Map (iPhone) — ${points.length} pins`}</Text>
    </View>
  );
}
