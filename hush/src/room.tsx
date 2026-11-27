// 部屋の絵：時間帯で変わる背景・育つ家具・5つの机・ひとことの吹き出し
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, View } from 'react-native';
import type { Member } from './api';

const BG = {
  morning: require('../assets/img/room_morning.jpg'),
  day: require('../assets/img/room_day.jpg'),
  evening: require('../assets/img/room_evening.jpg'),
  night: require('../assets/img/room_night.jpg'),
};
const DESK = [
  [require('../assets/img/d0_off.png'), require('../assets/img/d0_on.png')],
  [require('../assets/img/d1_off.png'), require('../assets/img/d1_on.png')],
  [require('../assets/img/d2_off.png'), require('../assets/img/d2_on.png')],
  [require('../assets/img/d3_off.png'), require('../assets/img/d3_on.png')],
  [require('../assets/img/d4_off.png'), require('../assets/img/d4_on.png')],
];
// 部屋の育ち（みんなの作業時間で順に増える）。x,y＝置く場所の%、w＝幅%、a＝縦横比（高さ/幅）
const ITEMS = [
  { k: 'cat', src: require('../assets/img/cat.png'), x: 15, y: 80, w: 12, a: 188 / 240 },
  { k: 'monstera', src: require('../assets/img/monstera.png'), x: 84, y: 56, w: 12, a: 315 / 240 },
  { k: 'floorlamp', src: require('../assets/img/floorlamp.png'), x: 15, y: 55, w: 7, a: 397 / 215 },
  { k: 'lights', src: require('../assets/img/lights.png'), x: 75, y: 29, w: 30, a: 100 / 240 },
  { k: 'books', src: require('../assets/img/books.png'), x: 86, y: 80, w: 8, a: 229 / 240 },
  { k: 'poster', src: require('../assets/img/poster.png'), x: 27, y: 38, w: 10, a: 334 / 240 },
];
export const ITEM_COUNT = ITEMS.length;
// 席：手前2・奥3。0番が自分
const SEATS = [
  { x: 36, y: 78 },
  { x: 64, y: 78 },
  { x: 22, y: 58 },
  { x: 50, y: 55 },
  { x: 78, y: 58 },
];
const IMG_A = 1402 / 1122; // 背景の縦横比
const DESK_A = 420 / 340;

export function timeOfDay(d = new Date()): keyof typeof BG {
  const h = d.getHours();
  return h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'evening' : 'night';
}

export function RoomView({ seats, items, party, onDesk }: { seats: (Member | null)[]; items: number; party: boolean; onDesk: (i: number) => void }) {
  const [W, setW] = useState(0);
  const [tod, setTod] = useState(timeOfDay());
  const [spark, setSpark] = useState<{ i: number; k: number } | null>(null);
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const iv = setInterval(() => setTod(timeOfDay()), 60e3);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (!party) return glow.setValue(0);
    const a = Animated.loop(Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(glow, { toValue: 0.3, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [party]);
  const H = W * 0.86;
  const iw = W * 1.16;
  const ih = iw * IMG_A;
  const il = -W * 0.08;
  const it = -H * 0.36;
  const order = SEATS.map((s, i) => ({ ...s, i })).sort((a, b) => a.y - b.y);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H || 300, borderRadius: 22, overflow: 'hidden', backgroundColor: '#221F30' }}>
      {W > 0 && (
        <View style={{ position: 'absolute', left: il, top: it, width: iw, height: ih }}>
          <Image source={BG[tod]} style={{ position: 'absolute', width: iw, height: ih }} />
          {ITEMS.map((x, n) => {
            if (n >= items && !(x.k === 'lights' && party)) return null;
            const w = (iw * x.w) / 100;
            const h = w * x.a;
            const st = { position: 'absolute' as const, left: (iw * x.x) / 100 - w / 2, top: (ih * x.y) / 100 - h, width: w, height: h };
            if (x.k === 'lights' && party) return <Animated.Image key={x.k} source={x.src} style={[st, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }]} />;
            return <Image key={x.k} source={x.src} style={st} />;
          })}
          {order.map((s) => {
            const m = seats[s.i];
            const w = iw * 0.26;
            const h = w * DESK_A;
            const lit = !!m?.live && !m.live.pausedAt;
            const paused = !!m?.live?.pausedAt;
            const left = (iw * s.x) / 100 - w / 2;
            const top = (ih * s.y) / 100 - h * 0.92;
            return (
              <Pressable key={s.i} onPress={() => {
                  if (m?.live && s.i > 0) setSpark({ i: s.i, k: Date.now() });
                  onDesk(s.i);
                }} style={{ position: 'absolute', left, top, width: w, height: h }} accessibilityRole="button" accessibilityLabel={m ? m.name : ''}>
                <Image source={DESK[s.i][lit ? 1 : 0]} style={{ width: w, height: h, opacity: lit ? 1 : paused ? 0.85 : 0.7 }} />
                {m?.live?.say ? (
                  <View style={{ position: 'absolute', left: w * 0.62, top: -h * 0.02, transform: [{ translateX: -40 }], backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#2B2633' }} numberOfLines={1}>
                      {m.live.say}
                    </Text>
                  </View>
                ) : null}
                {spark?.i === s.i ? <Sparkle key={spark.k} x={w / 2} y={h * 0.25} onEnd={() => setSpark(null)} /> : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** 机をタップしたときのキラキラ */
export function Sparkle({ x, y, onEnd }: { x: number; y: number; onEnd: () => void }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(onEnd);
  }, []);
  return (
    <Animated.Text style={{ position: 'absolute', left: x - 12, top: y - 20, fontSize: 24, opacity: v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) }] }} pointerEvents="none">
      ✨
    </Animated.Text>
  );
}
