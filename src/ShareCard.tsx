// 旅が終わったあと、SNSに載せるための「旅のカード」（画像）を作る
// 絵は react-native-svg で描き、同じ絵を 1080px の大きさで画像にする（toDataURL）
// 英数字は Fredoka の形（src/card/fontFB.ts）をそのまま描くので、端末のフォントに左右されない
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Rect, Stop as GStop, Text as SvgText } from 'react-native-svg';
import { File as FSFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { RateInfo, Trip } from './data';
import { daysBetween, fmtMoney, hotelNights, isDate, tripDays, tripRange, tripTotal } from './data';
import { getLang, t } from './i18n';
import { C } from './theme';
import { tripPlaces } from './visited';
import { flag, tripCountries } from './countries';
import { cachedGeos } from './geo';
import { tripStops } from './MapTab';
import { GEO, GEO_K } from './card/countries50';
import { FB } from './card/fontFB';

const W = 1080;
const M = 64; // 外側の余白
const INK = '#3B2340';
const SUB = '#9A7590';
const PINK = '#FF5F93';
const STICKERS = ['#FF5F93', '#FFB938', '#36C2A0', '#8C7BFF'];
const JP_FONT = Platform.OS === 'ios' ? 'Hiragino Maru Gothic ProN' : Platform.OS === 'android' ? 'sans-serif' : '"Hiragino Maru Gothic ProN","M PLUS Rounded 1c","Yu Gothic",sans-serif';
const HEART = 'M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z';

/* ---------- 文字 ---------- */
const isLatin = (s: string) => [...s].every((ch) => !!FB[ch]);
const latinW = (s: string, size: number) => [...s].reduce((a, ch) => a + (FB[ch]?.[0] ?? 600), 0) * (size / 1000);
// 丸ゴシックの幅（全角は1文字ぶん、半角はおよそ0.6文字ぶん。少し多めに見て、はみ出さないようにする）
const jpW = (s: string, size: number) => [...s].reduce((a, ch) => a + (/[\x20-\x7E]/.test(ch) ? 0.62 : 1.02), 0) * size;
const textW = (s: string, size: number) => (isLatin(s) ? latinW(s, size) : jpW(s, size));
/** 幅に収まるように後ろを「…」で切る */
function fit(s: string, size: number, maxW: number) {
  if (textW(s, size) <= maxW) return s;
  const cs = [...s];
  while (cs.length > 1 && textW(cs.join('') + '…', size) > maxW) cs.pop();
  return cs.join('').trimEnd() + '…';
}
/** 2行までに折り返す（2行目に入りきらなければ「…」） */
function wrap2(s: string, size: number, maxW: number): string[] {
  if (textW(s, size) <= maxW) return [s];
  const cs = [...s];
  let i = cs.length;
  while (i > 1 && textW(cs.slice(0, i).join(''), size) > maxW) i--;
  // 英語は単語の切れ目で折り返す
  const sp = cs.slice(0, i).lastIndexOf(' ');
  if (sp > i * 0.5) i = sp + 1;
  return [cs.slice(0, i).join('').trim(), fit(cs.slice(i).join('').trim(), size, maxW)];
}

type Anchor = 'start' | 'middle' | 'end';
/** 文字を描く。英数字だけなら Fredoka の形、それ以外は丸ゴシック（ふち取りで太く見せる） */
function Txt({ s, x, y, size, color, anchor = 'start', bold = true }: { s: string; x: number; y: number; size: number; color: string; anchor?: Anchor; bold?: boolean }) {
  if (!s) return null;
  if (isLatin(s)) {
    const w = latinW(s, size);
    let cx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    const k = size / 1000;
    const parts: { d: string; x: number }[] = [];
    for (const ch of s) {
      const g = FB[ch];
      if (g[1]) parts.push({ d: g[1], x: cx });
      cx += g[0] * k;
    }
    return (
      <G>
        {parts.map((p, i) => (
          <Path key={i} d={p.d} fill={color} transform={`translate(${p.x.toFixed(1)} ${y}) scale(${k})`} />
        ))}
      </G>
    );
  }
  return (
    <SvgText x={x} y={y} fontSize={size} fontFamily={JP_FONT} fontWeight={bold ? '700' : '400'} fill={color} stroke={bold ? color : undefined} strokeWidth={bold ? size * 0.05 : 0} strokeLinejoin="round" textAnchor={anchor}>
      {s}
    </SvgText>
  );
}

/* ---------- 地図 ---------- */
type LL = [number, number]; // [経度, 緯度]
type Box = [number, number, number, number];
const ringCache: Record<string, { rings: LL[][]; boxes: Box[]; box: Box; main: LL[] }> = {};
const boxOf = (pts: LL[]) => pts.reduce<Box>((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [180, 90, -180, -90]);
function rings(cc: string) {
  if (ringCache[cc]) return ringCache[cc];
  const src = GEO[cc];
  if (!src) return null;
  const out: LL[][] = [];
  let main: LL[] = [];
  let best = -1;
  for (const r of src.split('|')) {
    let x = 0, y = 0;
    const pts: LL[] = r.split(' ').map((p) => {
      const [dx, dy] = p.split(',');
      x += +dx;
      y += +dy;
      return [x / GEO_K, y / GEO_K];
    });
    out.push(pts);
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      area += ax * by - bx * ay;
    }
    if (Math.abs(area) > best) {
      best = Math.abs(area);
      main = pts;
    }
  }
  const boxes = out.map(boxOf);
  const box = boxes.reduce<Box>((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], [180, 90, -180, -90]);
  return (ringCache[cc] = { rings: out, boxes, box, main });
}
const centroid = (pts: LL[]): LL => {
  const b = boxOf(pts);
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
};

/** 表示する範囲を決めて、経度緯度 → 画面の点 に変える関数を作る（その辺りの緯度で横を縮める＝形がゆがまない） */
function makeProj(focus: Box, w: number, h: number) {
  const [x0, y0, x1, y1] = focus;
  const midLat = Math.max(-70, Math.min(70, (y0 + y1) / 2));
  const kx = Math.cos((midLat * Math.PI) / 180);
  // 最低でもこのくらいの広さは見せる（街ひとつだけだと国の形がわからないため）
  let sw = Math.max((x1 - x0) * kx, 7), sh = Math.max(y1 - y0, 4.5);
  sw *= 1.35;
  sh *= 1.35;
  if (sw / sh > w / h) sh = (sw * h) / w;
  else sw = (sh * w) / h;
  const cx = ((x0 + x1) / 2) * kx, cy = (y0 + y1) / 2;
  const s = w / sw;
  const left = cx - sw / 2, top = cy + sh / 2;
  const view: Box = [left / kx, top - sh, (left + sw) / kx, top];
  return { p: ([lon, lat]: LL): [number, number] => [(lon * kx - left) * s, (top - lat) * s], view };
}

function MapArt({ ccs, spots, x, y, w, h }: { ccs: string[]; spots: LL[]; x: number; y: number; w: number; h: number }) {
  const data = useMemo(() => {
    const visited = new Set(ccs);
    let focus: Box | null = null;
    // 行った国の本土（大きすぎる国は除く）と、行った場所の点が全部入る範囲
    const mains = (ccs.map((c) => rings(c)?.main).filter(Boolean) as LL[][]).filter((m) => {
      const b = boxOf(m);
      return !spots.length || (b[2] - b[0] < 15 && b[3] - b[1] < 15);
    });
    const all = [...spots, ...mains.flat()];
    if (all.length) focus = boxOf(all);
    if (!focus) focus = [-20, 30, 40, 60];
    // 経度が大きく離れる旅（日本〜ヨーロッパなど）は世界全体
    if (focus[2] - focus[0] > 160) focus = [-170, -50, 180, 75];
    const { p, view } = makeProj(focus, w, h);
    const hit = (b: Box) => !(b[2] < view[0] - 2 || b[0] > view[2] + 2 || b[3] < view[1] - 2 || b[1] > view[3] + 2);
    const lands: { d: string; on: boolean }[] = [];
    Object.keys(GEO).forEach((cc) => {
      const r = rings(cc)!;
      if (!hit(r.box)) return;
      const d = r.rings
        .filter((_, i) => hit(r.boxes[i]))
        .map((ring) => 'M' + ring.map((q) => p(q).map((v) => v.toFixed(1)).join(' ')).join('L') + 'Z')
        .join('');
      if (d) lands.push({ d, on: visited.has(cc) });
    });
    lands.sort((a, b) => Number(a.on) - Number(b.on));
    // 行った場所：近すぎる点はまとめる
    const pts: [number, number][] = [];
    spots.forEach((q) => {
      const v = p(q);
      if (!pts.some((u) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 16)) pts.push(v);
    });
    // 点がないときは、行った国の真ん中にハートを置く
    const hearts = spots.length ? [] : (ccs.map((c) => rings(c)?.main).filter(Boolean) as LL[][]).map((m) => p(centroid(m)));
    // 点どうしを、ゆるいカーブの点線でつなぐ
    const route =
      pts.length > 1
        ? pts.reduce((d, [px, py], i) => {
            if (!i) return `M${px.toFixed(1)} ${py.toFixed(1)}`;
            const [ax, ay] = pts[i - 1];
            const mx = (ax + px) / 2 + (py - ay) * 0.18, my = (ay + py) / 2 - (px - ax) * 0.18;
            return `${d}Q${mx.toFixed(1)} ${my.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`;
          }, '')
        : '';
    return { lands, pts, hearts, route };
  }, [ccs.join(), spots.map((s) => s.join()).join('|'), w, h]);
  return (
    <G>
      <Defs>
        <ClipPath id="mapclip">
          <Rect x={x} y={y} width={w} height={h} rx={34} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#mapclip)">
        <Rect x={x} y={y} width={w} height={h} fill="#CDE6FF" />
        <G transform={`translate(${x} ${y})`}>
          {data.lands.map((l, i) => (
            <Path key={i} d={l.d} fill={l.on ? PINK : '#FFF7EE'} stroke={l.on ? '#FFFFFF' : '#E9D8CB'} strokeWidth={l.on ? 3 : 1.5} strokeLinejoin="round" />
          ))}
          {!!data.route && <Path d={data.route} fill="none" stroke={INK} strokeWidth={4} strokeDasharray="2 12" strokeLinecap="round" />}
          {data.pts.map(([px, py], i) => (
            <G key={i}>
              <Circle cx={px} cy={py} r={13} fill="#FFFFFF" />
              <Circle cx={px} cy={py} r={8} fill={i === 0 ? '#FFB938' : i === data.pts.length - 1 ? '#36C2A0' : INK} />
            </G>
          ))}
          {data.hearts.map(([hx, hy], i) => (
            <Path key={i} transform={`translate(${hx - 22} ${hy - 30}) scale(1.8)`} d={HEART} fill="#FFFFFF" stroke={INK} strokeWidth={1.6} />
          ))}
        </G>
      </G>
    </G>
  );
}

/* ---------- データ ---------- */
export type CardOpts = { dates: boolean; money: boolean; spots: boolean; map: boolean; photo: boolean; story: boolean };
const SPOT_TYPES = ['ticket', 'food', 'plan', 'other'];
const ymd = (s: string) => s.replace(/-/g, '.');

function useCardData(trip: Trip, rate: RateInfo) {
  const base = useMemo(() => {
    const ja = getLang() === 'ja';
    const pl = tripPlaces(trip);
    const ccs = [...new Set([...pl.countries, ...tripCountries(trip)])];
    const cities = [...pl.cities.values()].map((c) => (ja ? c.ja : c.en));
    const { start, end } = tripRange(trip);
    const days = tripDays(trip).length;
    const nights = Math.max(hotelNights(trip), isDate(start) && isDate(end) ? Math.max(0, daysBetween(start!, end!)) : 0);
    const spots = [...new Set(trip.bookings.filter((b) => SPOT_TYPES.includes(b.type) && !b.cancelled && b.title).map((b) => b.title.replace(/[（(].*[）)]/, '').trim()))].filter(Boolean);
    const total = tripTotal(trip, rate);
    return { ccs, cities, start, end, days, nights, spots, total };
  }, [trip, rate]);
  // 地図タブで一度調べた場所の位置（ネットには行かない）
  const [ll, setLl] = useState<LL[]>([]);
  useEffect(() => {
    const stops = tripStops(trip).filter((s) => s.b.type !== 'flight');
    cachedGeos(stops.map((s) => s.q))
      .then((g) => setLl(stops.map((s) => g[s.q]).filter(Boolean).map((v) => [v!.lng, v!.lat] as LL)))
      .catch(() => {});
  }, [trip]);
  return { ...base, ll };
}

/* ---------- カードの絵 ---------- */
export function TripCardSvg({ trip, rate, opts, cover, svgRef }: { trip: Trip; rate: RateInfo; opts: CardOpts; cover?: string | null; svgRef?: any }) {
  const d = useCardData(trip, rate);
  const H = opts.story ? 1920 : 1350;
  const top = opts.story ? 150 : 64;
  const hasPhoto = opts.photo && !!cover;
  const titleW = hasPhoto ? 600 : W - M * 2;
  const year = d.start?.slice(0, 4) ?? '';
  const titleSize = textW(trip.name, 84) > titleW ? 72 : 84;
  const title = wrap2(trip.name, titleSize, titleW);
  const titleTop = top + 106 + titleSize * 0.9;
  let yy = titleTop + (title.length - 1) * (titleSize + 14);
  const dateStr = d.start ? `${ymd(d.start)}${d.end && d.end !== d.start ? ` — ${d.end.slice(0, 4) === d.start.slice(0, 4) ? d.end.slice(5).replace('-', '.') : ymd(d.end)}` : ''}` : '';
  const dateY = yy + 70;
  if (opts.dates && dateStr) yy = dateY;
  if (hasPhoto) yy = Math.max(yy, top + 380);
  const showMap = opts.map;
  const mapTop = yy + 52;
  const statH = opts.story ? 190 : 172;
  const moneyOn = opts.money && d.total > 0;
  const footerY = H - 64 - (opts.story ? 110 : 0);
  const rowH = 62;
  const cityH = d.cities.length ? 64 : 0;
  // 下から順に場所を決めて、残りを地図にする（文字が下のロゴに重ならないように）
  const below = (rows: number) => 48 + statH + (moneyOn ? 126 : 0) + 64 + cityH + rows * rowH + 60;
  let rows = opts.spots ? Math.min(Math.ceil(d.spots.length / 2), opts.story ? 5 : 3) : 0;
  let mapH = 0;
  if (showMap) {
    const maxMap = opts.story ? 760 : 520;
    const minMap = opts.story ? 420 : 250;
    while (rows > 0 && footerY - mapTop - below(rows) < minMap) rows--;
    mapH = Math.min(maxMap, footerY - mapTop - below(rows));
  } else {
    rows = opts.spots ? Math.min(Math.ceil(d.spots.length / 2), Math.max(0, Math.floor((footerY - mapTop - below(0)) / rowH))) : 0;
  }
  const statsTop = showMap ? mapTop + mapH + 48 : mapTop;
  const moneyTop = statsTop + statH + 30;
  const listTop = (moneyOn ? moneyTop + 96 : statsTop + statH) + 64;
  const stats: [string, string][] = [
    [String(d.days), t('cardDays')],
    [String(d.nights), t('ysNights')],
    [String(Math.max(d.cities.length, 1)), t('ysPlaces')],
    [String(Math.max(d.ccs.length, 1)), t('ysCountries')],
  ];
  const sw = (W - M * 2 - 3 * 22) / 4;
  // 行った場所の一覧（2列）
  const cityLine = fit(d.cities.join(isLatin(d.cities.join('')) ? ' · ' : '・'), 46, W - M * 2);
  const rowsTop = listTop + cityH;
  const more = rows > 0 && d.spots.length > rows * 2 ? d.spots.length - (rows * 2 - 1) : 0;
  const items = rows <= 0 ? [] : more ? [...d.spots.slice(0, rows * 2 - 1), `+${more}`] : d.spots.slice(0, rows * 2);
  const colW = (W - M * 2 - 30) / 2;
  const half = Math.ceil(items.length / 2);
  // 紙吹雪（旅ごとに同じ並び）
  const seed = [...trip.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = (i: number) => (((seed ^ Math.imul(i + 1, 2654435761)) >>> 0) % 1000) / 1000;
  const confetti = Array.from({ length: 14 }, (_, i) => ({ x: rnd(i) * W, y: rnd(i + 50) * H, r: 5 + rnd(i + 99) * 7, c: STICKERS[i % 4], star: i % 3 === 0 }));
  const recapW = latinW('TRIP RECAP', 30);

  return (
    <Svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
          <GStop offset="0" stopColor="#FFE0EA" />
          <GStop offset="0.55" stopColor="#FFEFE4" />
          <GStop offset="1" stopColor="#FFF6D9" />
        </LinearGradient>
        <ClipPath id="photo">
          <Rect x={0} y={0} width={262} height={262} rx={6} />
        </ClipPath>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#bg)" />
      {confetti.map((c, i) =>
        c.star ? (
          <Path key={i} transform={`translate(${c.x} ${c.y}) scale(${c.r / 10})`} d="M0 -10 L2.6 -2.6 L10 0 L2.6 2.6 L0 10 L-2.6 2.6 L-10 0 L-2.6 -2.6Z" fill={c.c} opacity={0.5} />
        ) : (
          <Circle key={i} cx={c.x} cy={c.y} r={c.r} fill={c.c} opacity={0.28} />
        ),
      )}

      {/* 見出し */}
      <Rect x={M} y={top} width={recapW + 52} height={56} rx={28} fill={INK} />
      <Txt s="TRIP RECAP" x={M + 26} y={top + 39} size={30} color="#FFFFFF" />
      {!!year && opts.dates && (
        <>
          <Rect x={M + recapW + 66} y={top} width={latinW(year, 30) + 44} height={56} rx={28} fill="#FFFFFF" />
          <Txt s={year} x={M + recapW + 88} y={top + 39} size={30} color={PINK} />
        </>
      )}

      {/* 写真（ポラロイド風） */}
      {hasPhoto && (
        <G transform={`translate(${W - M - 300} ${top - 6}) rotate(6 150 170)`}>
          <Rect x={8} y={12} width={300} height={340} rx={10} fill="rgba(59,35,64,0.14)" />
          <Rect x={0} y={0} width={300} height={340} rx={10} fill="#FFFFFF" />
          <G transform="translate(19 19)">
            <SvgImage href={cover!} x={0} y={0} width={262} height={262} preserveAspectRatio="xMidYMid slice" clipPath="url(#photo)" />
          </G>
          <Txt s="memories" x={150} y={320} size={30} color={SUB} anchor="middle" />
          <Rect x={105} y={-18} width={90} height={36} fill="rgba(255,185,56,0.75)" transform="rotate(-4 150 0)" />
        </G>
      )}

      {/* タイトルと日付 */}
      {title.map((line, i) => (
        <Txt key={i} s={line} x={M} y={titleTop + i * (titleSize + 14)} size={titleSize} color={INK} />
      ))}
      {opts.dates && !!dateStr && <Txt s={dateStr} x={M} y={dateY} size={44} color={SUB} />}

      {/* 地図 */}
      {showMap && (
        <G>
          <Rect x={M + 4} y={mapTop + 14} width={W - M * 2} height={mapH} rx={44} fill="rgba(59,35,64,0.10)" />
          <Rect x={M - 12} y={mapTop - 12} width={W - M * 2 + 24} height={mapH + 24} rx={46} fill="#FFFFFF" />
          <MapArt ccs={d.ccs} spots={d.ll} x={M} y={mapTop} w={W - M * 2} h={mapH} />
          {d.ccs.length > 0 && (
            <G>
              <Rect x={M + 20} y={mapTop + mapH - 84} width={34 + Math.min(d.ccs.length, 6) * 60} height={64} rx={32} fill="#FFFFFF" />
              <SvgText x={M + 38} y={mapTop + mapH - 37} fontSize={40}>
                {d.ccs.slice(0, 6).map(flag).join(' ')}
              </SvgText>
            </G>
          )}
        </G>
      )}

      {/* 数字のステッカー */}
      {stats.map(([v, l], i) => {
        const x = M + i * (sw + 22);
        const rot = [-3, 2, -2, 3][i];
        return (
          <G key={l} transform={`rotate(${rot} ${x + sw / 2} ${statsTop + statH / 2})`}>
            <Rect x={x + 4} y={statsTop + 8} width={sw} height={statH} rx={44} fill="rgba(59,35,64,0.10)" />
            <Rect x={x} y={statsTop} width={sw} height={statH} rx={44} fill={STICKERS[i]} />
            <Txt s={v} x={x + sw / 2} y={statsTop + statH * 0.59} size={v.length > 3 ? 70 : statH > 180 ? 96 : 88} color="#FFFFFF" anchor="middle" />
            <Txt s={fit(l, 30, sw - 24)} x={x + sw / 2} y={statsTop + statH - 30} size={30} color="#FFFFFF" anchor="middle" />
          </G>
        );
      })}

      {/* お金（チケット風） */}
      {moneyOn && (
        <G>
          <Rect x={M} y={moneyTop} width={W - M * 2} height={96} rx={24} fill="#FFFFFF" />
          <Circle cx={M} cy={moneyTop + 48} r={16} fill="#FFF0E2" />
          <Circle cx={W - M} cy={moneyTop + 48} r={16} fill="#FFF0E2" />
          <Path d={`M${M + 330} ${moneyTop + 16}V${moneyTop + 80}`} stroke="#F1D6DD" strokeWidth={3} strokeDasharray="8 8" />
          <Txt s={fit(t('cardSpent'), 32, 280)} x={M + 40} y={moneyTop + 60} size={32} color={SUB} />
          <Txt s={fmtMoney(Math.round(d.total), rate.base)} x={W - M - 40} y={moneyTop + 66} size={56} color={PINK} anchor="end" />
        </G>
      )}

      {/* 行った街と場所 */}
      {d.cities.length > 0 && <Txt s={cityLine} x={M} y={listTop + 32} size={46} color={INK} />}
      {items.map((s, i) => {
        const col = i < half ? 0 : 1;
        const row = col ? i - half : i;
        const x = M + col * (colW + 30);
        const y = rowsTop + row * rowH;
        if (more && i === items.length - 1) return <Txt key={i} s={s} x={x + 4} y={y + 31} size={32} color={SUB} />;
        return (
          <G key={i}>
            <Circle cx={x + 20} cy={y + 20} r={20} fill={STICKERS[i % 4]} />
            <Txt s={String(i + 1)} x={x + 20} y={y + 29} size={26} color="#FFFFFF" anchor="middle" />
            <Txt s={fit(s, 32, colW - 60)} x={x + 54} y={y + 31} size={32} color={INK} />
          </G>
        );
      })}

      {/* 下のロゴ */}
      <Path transform={`translate(${W / 2 - latinW('made with Tripfold', 30) / 2 - 36} ${footerY - 26}) scale(1.25)`} d={HEART} fill={PINK} />
      <Txt s="made with Tripfold" x={W / 2 + 8} y={footerY} size={30} color={SUB} anchor="middle" />
    </Svg>
  );
}

/** 共有画面の中身：切り替えスイッチ＋プレビュー＋「画像で共有」 */
export function ShareCardPanel({ trip, rate, cover, onText }: { trip: Trip; rate: RateInfo; cover?: string | null; onText: (msg: string) => void }) {
  const [opts, setOpts] = useState<CardOpts>({ dates: true, money: false, spots: true, map: true, photo: !!cover, story: false });
  useEffect(() => {
    if (cover) setOpts((o) => ({ ...o, photo: true }));
  }, [cover]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pw, setPw] = useState(0);
  const ref = useRef<any>(null);
  const d = useCardData(trip, rate);
  const H = opts.story ? 1920 : 1350;
  const set = (k: keyof CardOpts) => (v: boolean) => setOpts((o) => ({ ...o, [k]: v }));
  const share = async () => {
    setErr('');
    const text = `${trip.name}\n${d.ccs.map(flag).join('')} ${d.cities.join('・')}\n#Tripfold`;
    if (Platform.OS === 'web' || !ref.current?.toDataURL) {
      onText(text);
      return;
    }
    setBusy(true);
    try {
      // 絵は実寸（1080px幅）で置いて縮めて見せているので、そのままの大きさで画像になる
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
    ['map', t('cardOptMap'), true],
    ['photo', t('cardOptPhoto'), !!cover],
  ];
  const k = pw ? pw / W : 0;
  return (
    <View>
      <View style={st.seg}>
        {[false, true].map((v) => (
          <Pressable key={String(v)} onPress={() => set('story')(v)} style={[st.segBtn, opts.story === v && st.segOn]}>
            <Text style={[st.segText, opts.story === v && st.segTextOn]}>{v ? t('cardStory') : t('cardPost')}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[st.preview, { aspectRatio: W / H }]} onLayout={(e) => setPw(e.nativeEvent.layout.width)}>
        {k > 0 && (
          // 実寸で描いて縮めて見せる（画像にするときに小さくならないように）
          <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: [{ scale: k }], transformOrigin: 'top left' }}>
            <TripCardSvg trip={trip} rate={rate} opts={opts} cover={cover} svgRef={ref} />
          </View>
        )}
      </View>
      {rows.filter((r) => r[2]).map(([key, label]) => (
        <View key={key} style={st.row}>
          <Text style={st.rowText}>{label}</Text>
          <Switch value={opts[key]} onValueChange={set(key)} trackColor={{ true: C.pink, false: C.line }} thumbColor="#FFFFFF" />
        </View>
      ))}
      <Pressable onPress={share} disabled={busy} style={[st.btn, busy && { opacity: 0.5 }]}>
        <Text style={st.btnText}>{busy ? t('cardMaking') : t('cardShare')}</Text>
      </Pressable>
      {!!err && <Text style={[st.rowText, { color: C.pink, marginTop: 8 }]}>{err}</Text>}
      <Text style={st.hint}>{t('cardHint')}</Text>
      {d.ll.length === 0 && opts.map && <Text style={st.hint}>{t('cardMapHint')}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  preview: { width: '100%', borderRadius: 18, overflow: 'hidden', marginBottom: 14, backgroundColor: '#FFEFE4' },
  seg: { flexDirection: 'row', backgroundColor: C.chip, borderRadius: 12, padding: 3, marginBottom: 12 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: C.card },
  segText: { color: C.sub, fontSize: 14, fontWeight: '700' },
  segTextOn: { color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowText: { color: C.ink, fontSize: 15, fontWeight: '600' },
  btn: { marginTop: 14, backgroundColor: C.ink, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnText: { color: C.onInk, fontSize: 16, fontWeight: '800' },
  hint: { color: C.sub, fontSize: 12, marginTop: 10, lineHeight: 18 },
});
