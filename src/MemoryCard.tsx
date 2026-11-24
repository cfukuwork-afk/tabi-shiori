// 思い出カード：行った国の形を、旅の写真のモザイクで埋めた1枚の画像（1080×1350・SNS向け）
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Image as SvgImage, Path, Rect, Text as SvgText } from 'react-native-svg';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { WORLD } from './worldPaths';
import { Trip, tripRange } from './data';
import { tripPlaces } from './visited';
import { prettyDate, range, t, getLang, localeOf } from './i18n';
import { shareImage } from './files';
import { C } from './theme';

const countryName = (cc: string) => {
  try {
    return new (Intl as any).DisplayNames([localeOf(getLang())], { type: 'region' }).of(cc) || cc;
  } catch {
    return cc;
  }
};
const W = 1080;
const H = 1350;
const BOX = { x: 60, y: 300, w: 960, h: 860 };

type Pt = [number, number];
/** "M1,2L3,4Z…" を多角形の配列に */
function polys(d: string): Pt[][] {
  return d
    .split(/(?=M)/)
    .map((part) => (part.match(/-?\d+(\.\d+)?/g) || []).map(Number))
    .map((n) => {
      const out: Pt[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
      return out;
    })
    .filter((p) => p.length > 2);
}
const inside = (x: number, y: number, ps: Pt[][]) => {
  let c = false;
  for (const p of ps)
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i];
      const [xj, yj] = p[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
  return c;
};

/** 旅の写真（日ごとの思い出・表紙） */
export function tripPhotos(trip: Trip): string[] {
  const days = Object.keys(trip.journal ?? {}).sort();
  const list = days.flatMap((d) => trip.journal?.[d]?.photos ?? []);
  if (trip.cover && !list.includes(trip.cover)) list.unshift(trip.cover);
  return list;
}

/** 一番長くいた国（予約が多い国）を形に使う */
function mainCountry(trip: Trip): string | null {
  const { countries } = tripPlaces(trip);
  const list = [...countries].filter((cc) => WORLD[cc]);
  if (!list.length) return null;
  const score = (cc: string) => trip.bookings.filter((b) => (b.from || '').toUpperCase().includes(cc) || b.tz?.includes(cc)).length;
  return list.sort((a, b) => score(b) - score(a))[0];
}

function layout(cc: string | null, n: number) {
  // 国の形を枠いっぱいに拡大。形が取れない（小さすぎる）ときは角丸の四角
  let ps: Pt[][] = [];
  if (cc && WORLD[cc]) ps = polys(WORLD[cc]);
  // 小さな島などで面積が小さすぎる部分は省く
  const area = (p: Pt[]) => Math.abs(p.reduce((a, [x, y], i) => a + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0) / 2);
  const big = ps.length ? Math.max(...ps.map(area)) : 0;
  ps = ps.filter((p) => area(p) >= big * 0.04);
  const xs = ps.flat().map((p) => p[0]);
  const ys = ps.flat().map((p) => p[1]);
  const bw = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const bh = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  if (!ps.length || Math.max(bw, bh) < 6) {
    ps = [[[0, 0], [1, 0], [1, 1], [0, 1]]];
  }
  const minX = Math.min(...ps.flat().map((p) => p[0]));
  const minY = Math.min(...ps.flat().map((p) => p[1]));
  const sw = Math.max(...ps.flat().map((p) => p[0])) - minX || 1;
  const sh = Math.max(...ps.flat().map((p) => p[1])) - minY || 1;
  const k = Math.min(BOX.w / sw, BOX.h / sh);
  const ox = BOX.x + (BOX.w - sw * k) / 2;
  const oy = BOX.y + (BOX.h - sh * k) / 2;
  const scaled: Pt[][] = ps.map((p) => p.map(([x, y]) => [ox + (x - minX) * k, oy + (y - minY) * k]));
  const d = scaled.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z').join('');
  // 写真の枚数に合わせて、形の中に入るマス目の大きさを決める（写真が少なければ繰り返して埋める）
  const want = Math.max(12, Math.min(70, n * 2));
  let cell = 220;
  let cells: { x: number; y: number }[] = [];
  for (; cell >= 26; cell = Math.floor(cell * 0.88)) {
    cells = [];
    for (let y = oy - cell; y < oy + sh * k + cell; y += cell)
      for (let x = ox - cell; x < ox + sw * k + cell; x += cell) {
        const hits = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].some(([a, b]) => inside(x + cell * a, y + cell * b, scaled));
        if (hits) cells.push({ x, y });
      }
    if (cells.length >= want) break;
  }
  return { d, cells, cell };
}

export function MemoryCard({ trip, onDone }: { trip: Trip; onDone?: () => void }) {
  const photos = useMemo(() => tripPhotos(trip).slice(0, 60), [trip]);
  const cc = useMemo(() => mainCountry(trip), [trip]);
  const lay = useMemo(() => layout(cc, photos.length), [cc, photos.length]);
  const [imgs, setImgs] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const svg = useRef<any>(null);
  const [boxW, setBoxW] = useState(320);

  useEffect(() => {
    let live = true;
    (async () => {
      // 小さく縮めて画像の中に埋め込む（書き出しで確実に写るように）
      const out: string[] = [];
      for (const u of photos) {
        try {
          if (Platform.OS === 'web') out.push(u);
          else {
            const r = await manipulateAsync(u, [{ resize: { width: Math.min(400, lay.cell * 2) } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
            if (r.base64) out.push(`data:image/jpeg;base64,${r.base64}`);
          }
        } catch {}
      }
      if (live) setImgs(out);
    })();
    return () => {
      live = false;
    };
  }, [photos, lay.cell]);

  const { start, end } = tripRange(trip);
  const names = [...tripPlaces(trip).countries].map((c) => countryName(c)).filter(Boolean).slice(0, 4).join(' · ');
  const scale = boxW / W;

  const save = () => {
    if (!svg.current?.toDataURL) return;
    setBusy(true);
    svg.current.toDataURL(
      async (b64: string) => {
        try {
          await shareImage(`${trip.name}-memories`, b64);
        } catch {}
        setBusy(false);
        onDone?.();
      },
      { width: W, height: H },
    );
  };

  if (!photos.length)
    return <Text style={{ color: C.sub, fontSize: 14, lineHeight: 21, marginTop: 8 }}>{t('cardNoPhotos')}</Text>;
  return (
    <View onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      <View style={{ width: boxW, height: H * scale, overflow: 'hidden', borderRadius: 16, backgroundColor: '#F4F3EF' }}>
        <View style={{ width: W, height: H, transform: [{ translateX: -(W - W * scale) / 2 }, { translateY: -(H - H * scale) / 2 }, { scale }] }}>
          {imgs ? (
            <Svg ref={svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              <Defs>
                <ClipPath id="shape">
                  <Path d={lay.d} />
                </ClipPath>
              </Defs>
              <Rect x={0} y={0} width={W} height={H} fill="#F4F3EF" />
              <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={60} y={96} fill="#FF5B3A" fontSize={26} fontWeight="800" letterSpacing={4}>
                TRIPFOLD MEMORIES
              </SvgText>
              <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={60} y={172} fill="#15171C" fontSize={62} fontWeight="900">
                {trip.name.length > 16 ? trip.name.slice(0, 15) + '…' : trip.name}
              </SvgText>
              <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={60} y={226} fill="#6B6F78" fontSize={30} fontWeight="700">
                {[start ? prettyDate(start) + (end && end !== start ? range() + prettyDate(end) : '') : '', names].filter(Boolean).join('  ·  ')}
              </SvgText>
              <Path d={lay.d} fill="#E2DED6" />
              <G clipPath="url(#shape)">
                {lay.cells.map((c, i) => (
                  <SvgImage key={i} x={c.x + 2} y={c.y + 2} width={lay.cell - 4} height={lay.cell - 4} href={imgs[i % imgs.length]} preserveAspectRatio="xMidYMid slice" />
                ))}
              </G>
              <Path d={lay.d} fill="none" stroke="#15171C" strokeWidth={5} strokeLinejoin="round" />
              <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={60} y={1268} fill="#15171C" fontSize={34} fontWeight="900">
                Tripfold
              </SvgText>
              <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={60} y={1306} fill="#8C9099" fontSize={24} fontWeight="700">
                tripfold.net
              </SvgText>
              <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={W - 60} y={1290} fill="#8C9099" fontSize={24} fontWeight="700" textAnchor="end">
                {t('cardPhotos', { n: photos.length })}
              </SvgText>
            </Svg>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" />
            </View>
          )}
        </View>
      </View>
      <Pressable
        onPress={save}
        disabled={!imgs || busy}
        style={{ marginTop: 14, backgroundColor: C.ink, borderRadius: 16, paddingVertical: 15, alignItems: 'center', opacity: !imgs || busy ? 0.5 : 1 }}
      >
        <Text style={{ color: C.bg, fontWeight: '800', fontSize: 16 }}>{busy ? t('cardSaving') : t('cardShare')}</Text>
      </Pressable>
    </View>
  );
}
