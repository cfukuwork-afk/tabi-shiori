// 旅が終わったあと、SNSに載せるための「旅のカード」（画像）を作る
// お金・日付・行った場所は、出すかどうかを選べる。画像は react-native-svg の toDataURL で作る
import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, G, Image as SvgImage, Path, Rect, Text as SvgText, ClipPath, Defs } from 'react-native-svg';
import { File as FSFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { RateInfo, Trip } from './data';
import { daysBetween, fmtMoney, isDate, tripDays, tripRange, tripTotal } from './data';
import { getLang, prettyDate, range, t } from './i18n';
import { C } from './theme';
import { WORLD } from './worldPaths';
import { projectNE, SMALL_CC, tripPlaces } from './visited';
import { flag, tripCountries } from './countries';

const W = 1080;
const H = 1350;
// かわいい配色（紙のクリーム色＋桃色＋青）。ダークモードでも同じ見た目にする
const P = { bg: '#FFF4EA', card: '#FFFFFF', ink: '#2B2230', sub: '#8A7F8E', pink: '#FF7AA2', pinkSoft: '#FFE1EA', blue: '#7FB2FF', land: '#EFE6DE', line: '#F1DCCF', yellow: '#FFD46B' };

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const SPOT_TYPES = ['ticket', 'food', 'plan', 'other'];

/** 行った国の範囲だけを切り出す（地図の表示範囲） */
function mapBox(ccs: string[], ratio: number): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const cc of ccs) {
    const d = WORLD[cc];
    if (d) {
      // 本土だけを見たいので、いちばん大きい輪郭を使う（海外領土で地図が広がりすぎないように）
      const parts = d.split('Z').filter(Boolean);
      let best: number[] = [];
      for (const p of parts) {
        const n = (p.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
        if (n.length > best.length) best = n;
      }
      for (let i = 0; i + 1 < best.length; i += 2) {
        x0 = Math.min(x0, best[i]); x1 = Math.max(x1, best[i]);
        y0 = Math.min(y0, best[i + 1]); y1 = Math.max(y1, best[i + 1]);
      }
    } else if (SMALL_CC[cc]) {
      const [x, y] = projectNE(...SMALL_CC[cc]);
      x0 = Math.min(x0, x - 6); x1 = Math.max(x1, x + 6); y0 = Math.min(y0, y - 6); y1 = Math.max(y1, y + 6);
    }
  }
  if (!isFinite(x0)) return null;
  let w = Math.max(x1 - x0, 24), h = Math.max(y1 - y0, 24);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  w *= 1.6; h *= 1.6;
  if (w / h > ratio) h = w / ratio; else w = h * ratio;
  return [cx - w / 2, cy - h / 2, w, h];
}

export type CardOpts = { dates: boolean; money: boolean; spots: boolean; map: boolean; photo: boolean };

function useCardData(trip: Trip, rate: RateInfo) {
  return useMemo(() => {
    const ja = getLang() === 'ja';
    const pl = tripPlaces(trip);
    const ccs = [...new Set([...pl.countries, ...tripCountries(trip)])];
    const cities = [...pl.cities.values()].map((c) => (ja ? c.ja : c.en));
    const { start, end } = tripRange(trip);
    const days = tripDays(trip).length;
    const hotelN = trip.bookings.filter((b) => b.type === 'hotel' && !b.cancelled && isDate(b.end)).reduce((a, b) => a + Math.max(0, daysBetween(b.start, b.end!)), 0);
    const nights = Math.max(hotelN, isDate(start) && isDate(end) ? Math.max(0, daysBetween(start!, end!)) : 0);
    const spots = [...new Set(trip.bookings.filter((b) => SPOT_TYPES.includes(b.type) && !b.cancelled && b.title).map((b) => b.title.replace(/[（(].*[）)]/, '').trim()))].filter(Boolean);
    const total = tripTotal(trip, rate);
    return { ccs, cities, start, end, days, nights, spots, total };
  }, [trip, rate]);
}

/** カードの絵（SVG）。プレビューと書き出しで同じものを使う */
export function TripCardSvg({ trip, rate, opts, cover, svgRef }: { trip: Trip; rate: RateInfo; opts: CardOpts; cover?: string | null; svgRef?: any }) {
  const d = useCardData(trip, rate);
  const showMap = opts.map && d.ccs.length > 0;
  const mapH = 470;
  const box = showMap ? mapBox(d.ccs, 960 / mapH) : null;
  const visited = new Set(d.ccs);
  const stats: [string, string][] = [
    [String(d.days), t('cardDays')],
    [String(d.nights), t('ysNights')],
    [String(Math.max(d.cities.length, 1)), t('ysPlaces')],
    [String(Math.max(d.ccs.length, 1)), t('ysCountries')],
  ];
  if (opts.money && d.total > 0) stats.push([fmtMoney(Math.round(d.total), rate.base), t('cardSpent')]);
  const hasPhoto = opts.photo && !!cover;
  const titleY = hasPhoto ? 300 : 190;
  const mapTop = titleY + (opts.dates && d.start ? 120 : 70);
  const statsTop = showMap ? mapTop + mapH + 40 : mapTop;
  const chipsTop = statsTop + 170;
  const chips = [...d.cities.map((c) => ({ c, city: true })), ...(opts.spots ? d.spots.map((c) => ({ c, city: false })) : [])].slice(0, 12);
  // チップを横に並べて折り返す
  let cx = 60, cy = chipsTop;
  const placed = chips.map(({ c, city }) => {
    const wide = /[^\x00-\x7F]/.test(c);
    const label = cut(c, wide ? 14 : 24);
    const w = Math.min(960, 48 + label.length * (wide ? 30 : 16));
    if (cx + w > 1020) { cx = 60; cy += 74; }
    const r = { x: cx, y: cy, w, label, city };
    cx += w + 14;
    return r;
  }).filter((r) => r.y < H - 150);
  const statW = (960 - (stats.length - 1) * 14) / stats.length;
  return (
    <Svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <ClipPath id="ph"><Circle cx={W / 2} cy={150} r={95} /></ClipPath>
        <ClipPath id="mp"><Rect x={60} y={mapTop} width={960} height={mapH} rx={40} /></ClipPath>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill={P.bg} />
      {/* ふちの点線（チケットっぽく） */}
      <Rect x={24} y={24} width={W - 48} height={H - 48} rx={48} fill="none" stroke={P.line} strokeWidth={4} strokeDasharray="14 12" />
      {hasPhoto && (
        <G>
          <Circle cx={W / 2} cy={150} r={103} fill={P.card} />
          <SvgImage href={cover!} x={W / 2 - 95} y={55} width={190} height={190} preserveAspectRatio="xMidYMid slice" clipPath="url(#ph)" />
        </G>
      )}
      {!hasPhoto && <SvgText x={W / 2} y={110} fontSize={34} fontWeight="700" fill={P.pink} textAnchor="middle" letterSpacing={6}>MY TRIP</SvgText>}
      <SvgText x={W / 2} y={titleY + 10} fontSize={trip.name.length > 14 ? 58 : 72} fontWeight="800" fill={P.ink} textAnchor="middle">
        {cut(trip.name, 20)}
      </SvgText>
      {opts.dates && !!d.start && (
        <SvgText x={W / 2} y={titleY + 70} fontSize={34} fontWeight="600" fill={P.sub} textAnchor="middle">
          {prettyDate(d.start)}{d.end && d.end !== d.start ? `${range()}${prettyDate(d.end)}` : ''}
        </SvgText>
      )}
      {showMap && box && (
        <G>
          <Rect x={60} y={mapTop} width={960} height={mapH} rx={40} fill="#DCEBFF" />
          <G clipPath="url(#mp)">
            <G transform={`translate(60 ${mapTop}) scale(${960 / box[2]} ${mapH / box[3]}) translate(${-box[0]} ${-box[1]})`}>
              {Object.entries(WORLD).map(([cc, p]) => (
                <Path key={cc} d={p} fill={visited.has(cc) ? P.pink : P.land} stroke="#FFFFFF" strokeWidth={(box[2] / 960) * 2} />
              ))}
              {d.ccs.filter((cc) => !WORLD[cc] && SMALL_CC[cc]).map((cc) => {
                const [x, y] = projectNE(...SMALL_CC[cc]);
                return <Circle key={cc} cx={x} cy={y} r={(box[2] / 960) * 14} fill={P.pink} stroke="#fff" strokeWidth={(box[2] / 960) * 4} />;
              })}
            </G>
          </G>
          <SvgText x={1000} y={mapTop + mapH - 30} fontSize={44} textAnchor="end">
            {d.ccs.slice(0, 6).map(flag).join(' ')}
          </SvgText>
        </G>
      )}
      {stats.map(([v, l], i) => {
        const x = 60 + i * (statW + 14);
        const big = v.length > 6 ? 40 : 60;
        return (
          <G key={l}>
            <Rect x={x} y={statsTop} width={statW} height={140} rx={32} fill={i === stats.length - 1 && opts.money && d.total > 0 ? P.pinkSoft : P.card} />
            <SvgText x={x + statW / 2} y={statsTop + 75} fontSize={big} fontWeight="800" fill={P.ink} textAnchor="middle">{v}</SvgText>
            <SvgText x={x + statW / 2} y={statsTop + 115} fontSize={26} fontWeight="600" fill={P.sub} textAnchor="middle">{l}</SvgText>
          </G>
        );
      })}
      {placed.map((r, i) => (
        <G key={i}>
          <Rect x={r.x} y={r.y} width={r.w} height={58} rx={29} fill={r.city ? P.pink : P.card} />
          <SvgText x={r.x + r.w / 2} y={r.y + 39} fontSize={28} fontWeight="700" fill={r.city ? '#FFFFFF' : P.ink} textAnchor="middle">
            {r.label}
          </SvgText>
        </G>
      ))}
      <SvgText x={W / 2} y={H - 64} fontSize={28} fontWeight="700" fill={P.sub} textAnchor="middle" letterSpacing={4}>
        made with Tripfold
      </SvgText>
    </Svg>
  );
}

/** 共有画面の中身：切り替えスイッチ＋プレビュー＋「画像で共有」 */
export function ShareCardPanel({ trip, rate, cover, onText }: { trip: Trip; rate: RateInfo; cover?: string | null; onText: (msg: string) => void }) {
  const [opts, setOpts] = useState<CardOpts>({ dates: true, money: false, spots: true, map: true, photo: !!cover });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<any>(null);
  const d = useCardData(trip, rate);
  const set = (k: keyof CardOpts) => (v: boolean) => setOpts((o) => ({ ...o, [k]: v }));
  const share = async () => {
    setErr('');
    const text = `${trip.name}${opts.dates && d.start ? `\n${prettyDate(d.start)}${d.end && d.end !== d.start ? range() + prettyDate(d.end) : ''}` : ''}\n${d.ccs.map(flag).join('')} ${d.cities.join('・')}\n#Tripfold`;
    if (Platform.OS === 'web' || !ref.current?.toDataURL) {
      onText(text);
      return;
    }
    setBusy(true);
    try {
      const b64: string = await new Promise((res) => ref.current.toDataURL((x: string) => res(x), { width: W, height: H }));
      const f = new FSFile(Paths.cache, `tripfold-card-${Date.now()}.png`);
      f.create();
      f.write(b64, { encoding: 'base64' });
      await Sharing.shareAsync(f.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: trip.name });
    } catch {
      setErr(t('cardErr'));
    }
    setBusy(false);
  };
  const rows: [keyof CardOpts, string, boolean][] = [
    ['dates', t('cardOptDates'), true],
    ['money', t('cardOptMoney'), true],
    ['spots', t('cardOptSpots'), true],
    ['map', t('cardOptMap'), d.ccs.length > 0],
    ['photo', t('cardOptPhoto'), !!cover],
  ];
  return (
    <View>
      <View style={st.preview}>
        <TripCardSvg trip={trip} rate={rate} opts={opts} cover={cover} svgRef={ref} />
      </View>
      {rows.filter((r) => r[2]).map(([k, label]) => (
        <View key={k} style={st.row}>
          <Text style={st.rowText}>{label}</Text>
          <Switch value={opts[k]} onValueChange={set(k)} trackColor={{ true: C.pink, false: C.line }} thumbColor="#FFFFFF" />
        </View>
      ))}
      <Pressable onPress={share} disabled={busy} style={[st.btn, busy && { opacity: 0.5 }]}>
        <Text style={st.btnText}>{busy ? t('cardMaking') : t('cardShare')}</Text>
      </Pressable>
      {!!err && <Text style={[st.rowText, { color: C.pink, marginTop: 8 }]}>{err}</Text>}
      <Text style={st.hint}>{t('cardHint')}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  preview: { width: '100%', aspectRatio: W / H, borderRadius: 18, overflow: 'hidden', marginBottom: 14, backgroundColor: P.bg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowText: { color: C.ink, fontSize: 15, fontWeight: '600' },
  btn: { marginTop: 14, backgroundColor: C.ink, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnText: { color: C.onInk, fontSize: 16, fontWeight: '800' },
  hint: { color: C.sub, fontSize: 12, marginTop: 10, lineHeight: 18 },
});
