// Web 版（確認用）：地図の代わりに案内を出す
import { Text, View } from 'react-native';
import { C } from './theme';
import type { MapPoint, MapLine } from './NativeMap';
export type { MapPoint, MapLine };

export default function NativeMap({ points }: { points: MapPoint[]; lines: MapLine[] }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Text style={{ color: C.sub, textAlign: 'center' }}>{`Map (iPhone) — ${points.length} pins`}</Text>
    </View>
  );
}
