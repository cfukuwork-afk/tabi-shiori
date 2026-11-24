// 旅のDNAの画面：タイプ名・バーコード・15軸。画像で共有、友達に送って相性を見る
import { useMemo, useRef, useState } from 'react';
import { Pressable, Share, Text, TextInput, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { Trip, RateInfo } from './data';
import { AXES, barcode, compareDna, computeDna, decodeDna, dnaType } from './dna';
import { getLang, t } from './i18n';
import { shareImage } from './files';
import { SITE } from './sync';
import { C } from './theme';

const W = 1080;
const H = 1350;

function Barcode({ v, w, h }: { v: number[]; w: number; h: number }) {
  return (
    <Svg width={w} height={h}>
      {barcode(v, w).map((b, i) => (
        <Rect key={i} x={b.x} y={0} width={b.w} height={h} rx={Math.min(3, b.w / 2)} fill={`hsl(${b.hue},78%,${b.light}%)`} />
      ))}
    </Svg>
  );
}

export function DnaView({ trips, rate, friendCode }: { trips: Trip[]; rate: RateInfo; friendCode?: string }) {
  const ja = getLang() === 'ja';
  const dna = useMemo(() => computeDna(trips, rate), [trips, rate]);
  const [code, setCode] = useState(friendCode ?? '');
  const [busy, setBusy] = useState(false);
  const svg = useRef<any>(null);
  const [boxW, setBoxW] = useState(320);
  if (!dna) return <Text style={{ color: C.sub, fontSize: 14, lineHeight: 21 }}>{t('dnaNeedMore')}</Text>;
  const type = dnaType(dna.v, ja);
  const friend = decodeDna(code);
  const cmp = friend ? compareDna(dna.v, friend.v) : null;
  const label = (i: number) => (ja ? AXES[i].ja : AXES[i].en);
  const link = `${SITE}/dna/${dna.code}`;
  const scale = boxW / W;

  const saveImage = () => {
    if (!svg.current?.toDataURL) return;
    setBusy(true);
    svg.current.toDataURL(
      async (b64: string) => {
        try {
          await shareImage('tripfold-dna', b64);
        } catch {}
        setBusy(false);
      },
      { width: W, height: H },
    );
  };

  return (
    <View onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      <Text style={{ color: C.pink, fontWeight: '800', fontSize: 12, letterSpacing: 1.5 }}>TRAVEL DNA</Text>
      <Text style={{ color: C.ink, fontWeight: '900', fontSize: 26, marginTop: 4 }}>{type}</Text>
      <Text style={{ color: C.sub, fontSize: 13, marginTop: 4 }}>{t('dnaFrom', { trips: dna.trips, items: dna.items })}</Text>
      <View style={{ marginTop: 14, borderRadius: 14, overflow: 'hidden', backgroundColor: '#15171C', padding: 12 }}>
        <Barcode v={dna.v} w={boxW - 24} h={86} />
        <Text style={{ color: '#9AA0A6', fontSize: 11, marginTop: 8, letterSpacing: 2 }}>{dna.code.toUpperCase()}</Text>
      </View>
      <View style={{ marginTop: 14, gap: 7 }}>
        {dna.v.map((x, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ width: 84, color: C.ink, fontSize: 13, fontWeight: '700' }}>{label(i)}</Text>
            <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: C.line }}>
              <View style={{ width: `${Math.max(3, x)}%`, height: 8, borderRadius: 4, backgroundColor: `hsl(${[18, 42, 200, 8, 160, 280, 225, 250, 120, 30, 330, 190, 48, 265, 350][i]},70%,52%)` }} />
            </View>
            <Text style={{ width: 28, textAlign: 'right', color: C.sub, fontSize: 12 }}>{x}</Text>
          </View>
        ))}
      </View>
      <Text style={{ color: C.sub, fontSize: 12, lineHeight: 18, marginTop: 10 }}>{t('dnaMore')}</Text>

      {/* 共有用の画像（画面には小さく表示） */}
      <View style={{ width: boxW, height: H * scale, overflow: 'hidden', borderRadius: 16, marginTop: 16 }}>
        <View style={{ width: W, height: H, transform: [{ translateX: -(W - W * scale) / 2 }, { translateY: -(H - H * scale) / 2 }, { scale }] }}>
          <Svg ref={svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <Rect x={0} y={0} width={W} height={H} fill="#15171C" />
            <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={70} y={130} fill="#FF5B3A" fontSize={30} fontWeight="800" letterSpacing={6}>
              MY TRAVEL DNA
            </SvgText>
            <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={70} y={230} fill="#FFFFFF" fontSize={type.length > 14 ? 58 : 72} fontWeight="900">
              {type}
            </SvgText>
            {barcode(dna.v, W - 140).map((b, i) => (
              <Rect key={i} x={70 + b.x} y={300} width={b.w} height={330} rx={Math.min(4, b.w / 2)} fill={`hsl(${b.hue},78%,${b.light + 6}%)`} />
            ))}
            <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={70} y={690} fill="#8C9099" fontSize={26} fontWeight="700" letterSpacing={5}>
              {dna.code.toUpperCase()}
            </SvgText>
            {dna.v.map((x, i) => {
              const col = i % 2;
              const row = Math.floor(i / 2);
              const X = 70 + col * 480;
              const Y = 770 + row * 58;
              return [
                <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" key={'t' + i} x={X} y={Y} fill="#E8E6E1" fontSize={26} fontWeight="700">
                  {label(i)}
                </SvgText>,
                <Rect key={'b' + i} x={X + 170} y={Y - 18} width={240} height={14} rx={7} fill="#2A2D33" />,
                <Rect key={'f' + i} x={X + 170} y={Y - 18} width={Math.max(8, 2.4 * x)} height={14} rx={7} fill={`hsl(${[18, 42, 200, 8, 160, 280, 225, 250, 120, 30, 330, 190, 48, 265, 350][i]},70%,56%)`} />,
              ];
            })}
            <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={70} y={1290} fill="#FFFFFF" fontSize={34} fontWeight="900">
              Tripfold
            </SvgText>
            <SvgText fontFamily="Helvetica Neue, Hiragino Sans, Arial, sans-serif" x={W - 70} y={1290} fill="#8C9099" fontSize={26} fontWeight="700" textAnchor="end">
              {`tripfold.net/dna/${dna.code}`}
            </SvgText>
          </Svg>
        </View>
      </View>
      <Pressable onPress={saveImage} disabled={busy} style={{ marginTop: 12, backgroundColor: C.ink, borderRadius: 16, paddingVertical: 15, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: C.bg, fontWeight: '800', fontSize: 16 }}>{busy ? t('cardSaving') : t('dnaShareImage')}</Text>
      </Pressable>
      <Pressable
        onPress={() => Share.share({ message: t('dnaInviteText', { type, url: link }) })}
        style={{ marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
      >
        <Text style={{ color: C.ink, fontWeight: '800', fontSize: 15 }}>{t('dnaInvite')}</Text>
      </Pressable>

      {/* 友達のDNAと比べる */}
      <Text style={{ color: C.ink, fontWeight: '800', fontSize: 16, marginTop: 24 }}>{t('dnaCompare')}</Text>
      <TextInput
        value={code}
        onChangeText={(x) => setCode(x.replace(/.*\/dna\//, '').trim())}
        placeholder={t('dnaCodePh')}
        placeholderTextColor={C.sub}
        autoCapitalize="none"
        style={{ marginTop: 8, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, color: C.ink, fontSize: 15 }}
      />
      {cmp && friend && (
        <View style={{ marginTop: 12, backgroundColor: C.card, borderRadius: 16, padding: 16 }}>
          <Text style={{ color: C.pink, fontWeight: '900', fontSize: 34 }}>{cmp.score}%</Text>
          <Text style={{ color: C.ink, fontWeight: '800', fontSize: 15, marginTop: 2 }}>{t('dnaMatchWith', { type: dnaType(friend.v, ja) })}</Text>
          {cmp.same.length > 0 && <Text style={{ color: C.ink, fontSize: 14, marginTop: 8 }}>{t('dnaSame', { x: cmp.same.map(label).join('・') })}</Text>}
          {cmp.apart.length > 0 && <Text style={{ color: C.ink, fontSize: 14, marginTop: 4 }}>{t('dnaApart', { x: cmp.apart.map(label).join('・') })}</Text>}
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 8 }}>{cmp.score >= 80 ? t('dnaHint80') : cmp.score >= 60 ? t('dnaHint60') : t('dnaHintLow')}</Text>
        </View>
      )}
    </View>
  );
}
