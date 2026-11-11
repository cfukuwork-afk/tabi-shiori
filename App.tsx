import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShareIntent } from 'expo-share-intent';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Share,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Booking,
  BookingType,
  COVERS,
  EXP_CATS,
  Expense,
  ExpenseCat,
  coverOf,
  monogram,
  isPast,
  memoryPhotos,
  tripDays,
  DEFAULT_SETTINGS,
  RateInfo,
  Settings,
  TYPES,
  Trip,
  daysBetween,
  fallbackRates,
  fetchRates,
  fmtMoney,
  isDate,
  loadRate,
  loadSettings,
  loadTrips,
  nextUp,
  saveSettings,
  saveTrips,
  settle,
  shiftDate,
  timeline,
  todayStr,
  toHome,
  tripRange,
  tripTotal,
  typeOf,
  uid,
} from './src/data';
import { prettyDate, setLang, t, typeName } from './src/i18n';
import { parseBooking } from './src/parse';
import { CURRENCIES, findCurrency } from './src/currencies';
import { C, cleanNum, shadow } from './src/theme';
import { ocrAvailable, recognizeReceipt } from './modules/receipt-ocr';
import { askPermission, rescheduleAll } from './src/notify';
import { toMyTime } from './src/airports';
import { Directory, File as FSFile, Paths } from 'expo-file-system';
import * as ExpoLinking from 'expo-linking';

/** 選んだ写真をアプリの中にコピー（元の写真を消しても、圏外でも見られるように） */
function keepImage(uri: string) {
  if (Platform.OS === 'web') return uri;
  try {
    const dir = new Directory(Paths.document, 'photos');
    if (!dir.exists) dir.create();
    const ext = (uri.split('?')[0].split('.').pop() || 'jpg').slice(0, 4);
    const dest = new FSFile(dir, `p${Date.now()}${Math.random().toString(36).slice(2, 6)}.${ext}`);
    new FSFile(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

const SHARE_NATIVE = !!requireOptionalNativeModule('ExpoShareIntentModule');
const openMap = (q: string) => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(q)}`);
const catName = (c: ExpenseCat) => t(('cat' + c[0].toUpperCase() + c.slice(1)) as any);

/** しおりを文字にして共有（LINE・メールなど） */
function itineraryText(trip: Trip) {
  const { start, end } = tripRange(trip);
  const lines = [`【${trip.name}】 ${start ? prettyDate(start) : ''}${end && end !== start ? ' – ' + prettyDate(end) : ''}`, ''];
  timeline(trip).forEach(({ date, items }) => {
    lines.push(`■ ${start ? t('dayN', { n: daysBetween(start, date) + 1 }) + ' ' : ''}${prettyDate(date)}`);
    items.forEach((it) => {
      const b = it.booking;
      const edge = it.edge === 'start' ? (b.type === 'hotel' ? t('checkin') : t('pickup')) : it.edge === 'end' ? (b.type === 'hotel' ? t('checkout') : t('dropoff')) : '';
      lines.push(`${it.time ?? '--:--'}  ${typeName(b.type)}｜${b.title || ''}${edge ? `（${edge}）` : ''}`);
      if (it.edge !== 'end' && (b.from || b.to)) lines.push(`        ${b.from ?? ''}${b.to ? ' → ' + b.to : ''}`);
      if (b.code) lines.push(`        ${t('code')}: ${b.code}`);
    });
    lines.push('');
  });
  lines.push('— Tripfold');
  return lines.join('\n');
}

/** アプリに入れてある写真（お試し旅行の表紙） */
const BUNDLED: Record<string, any> = {
  'asset:paris': require('./assets/covers/paris.jpg'),
  'asset:kyoto': require('./assets/covers/kyoto.jpg'),
  'asset:london': require('./assets/covers/london.jpg'),
  'asset:matcha': require('./assets/covers/matcha.jpg'),
  'asset:window': require('./assets/covers/window.jpg'),
  'asset:croissant': require('./assets/covers/croissant.jpg'),
};
const imgSrc = (u: string) => BUNDLED[u] ?? { uri: u };

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const Icon = ({ name, size = 18, color = C.ink }: { name: string; size?: number; color?: string }) => (
  <Ionicons name={name as IconName} size={size} color={color} />
);
/** 種類のアイコン（四角の中にアイコン） */
const TypeBadge = ({ type, size = 38 }: { type: BookingType; size?: number }) => {
  const ty = typeOf(type);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: ty.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={ty.icon + '-outline'} size={size * 0.48} color={ty.color} />
    </View>
  );
};
/** 旅行の表紙（色＋頭文字） */
const Cover = ({ trip, size = 52 }: { trip: { name: string; emoji: string; cover?: string }; size?: number }) =>
  trip.cover ? (
    <Image source={imgSrc(trip.cover)} style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: C.chip }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: coverOf(trip), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.34, letterSpacing: 0.5 }}>{monogram(trip.name)}</Text>
    </View>
  );
const pickImage = async () => {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  return !r.canceled && r.assets?.[0] ? keepImage(r.assets[0].uri) : null;
};

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [rate, setRate] = useState<RateInfo>(fallbackRates('JPY'));
  const [openId, setOpenId] = useState<string | null>(null);
  const [newTrip, setNewTrip] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [adding, setAdding] = useState<{ tripId: string; edit?: Booking; initial?: { text?: string; image?: string; planDate?: string } } | null>(null);
  const [detail, setDetail] = useState<{ tripId: string; id: string } | null>(null);
  const [incoming, setIncoming] = useState<{ text?: string; image?: string } | null>(null);
  const [settleIn, setSettleIn] = useState<{ n: string; c: string; p: { f: string; t: string; a: number }[] } | null>(null);
  const url = ExpoLinking.useURL();
  useEffect(() => {
    if (!url || !url.includes('settle?d=')) return;
    try {
      setSettleIn(JSON.parse(decodeURIComponent(url.split('settle?d=')[1])));
    } catch {}
  }, [url]);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({ disabled: !SHARE_NATIVE });
  useEffect(() => {
    if (!hasShareIntent) return;
    const img = shareIntent.files?.find((f) => f.mimeType?.startsWith('image'))?.path;
    const text = shareIntent.text ?? undefined;
    if (img || text) setIncoming({ text, image: img });
    resetShareIntent();
  }, [hasShareIntent]);
  useEffect(() => {
    if (ready) rescheduleAll(trips, settings.notify);
  }, [trips, settings.notify, settings.lang, ready]);

  setLang(settings.lang);

  useEffect(() => {
    (async () => {
      const [tr, st] = await Promise.all([loadTrips(), loadSettings()]);
      setTrips(tr);
      setSettings(st);
      setRate(await loadRate(st.home));
      setReady(true);
      const fresh = await fetchRates(st.home);
      if (fresh) setRate(fresh);
    })();
  }, []);

  const updateTrips = (fn: (t: Trip[]) => Trip[]) =>
    setTrips((prev) => {
      const next = fn(prev);
      saveTrips(next);
      return next;
    });
  const updateTrip = (id: string, fn: (t: Trip) => Trip) => updateTrips((all) => all.map((x) => (x.id === id ? fn(x) : x)));
  const changeSettings = async (s: Settings) => {
    if (s.notify && !settings.notify) askPermission();
    setSettings(s);
    saveSettings(s);
    if (s.home !== rate.base) {
      setRate(await loadRate(s.home));
      const fresh = await fetchRates(s.home);
      if (fresh) setRate(fresh);
    }
  };

  const trip = trips.find((x) => x.id === openId) ?? null;
  const detailTrip = detail ? trips.find((x) => x.id === detail.tripId) : null;
  const detailBooking = detailTrip?.bookings.find((b) => b.id === detail?.id) ?? null;

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      {trip ? (
        <TripScreen
          trip={trip}
          rate={rate}
          settings={settings}
          onBack={() => setOpenId(null)}
          onChange={(fn) => updateTrip(trip.id, fn)}
          onDelete={() => {
            updateTrips((all) => all.filter((x) => x.id !== trip.id));
            setOpenId(null);
          }}
          onAdd={() => setAdding({ tripId: trip.id })}
          onAddPlan={(d) => setAdding({ tripId: trip.id, initial: { planDate: d } })}
          onShare={() => Share.share({ message: itineraryText(trip) })}
          onOpen={(b) => setDetail({ tripId: trip.id, id: b.id })}
        />
      ) : (
        <Home
          trips={trips}
          rate={rate}
          onOpen={setOpenId}
          onNew={() => setNewTrip(true)}
          onSettings={() => setShowSettings(true)}
          onOpenBooking={(tripId, id) => setDetail({ tripId, id })}
        />
      )}

      <NewTripSheet
        visible={newTrip}
        onClose={() => setNewTrip(false)}
        onCreate={(name, color, cover) => {
          const tr: Trip = {
            id: uid(),
            name,
            emoji: color,
            cover,
            members: [{ id: 'me', name: settings.myName || t('me') }],
            bookings: [],
            checklist: t('defaultPack')
              .split(',')
              .map((x) => ({ id: uid(), text: x, done: false })),
            createdAt: Date.now(),
          };
          updateTrips((all) => [tr, ...all]);
          setNewTrip(false);
          setOpenId(tr.id);
        }}
      />

      {incoming && !adding && (
        <PickTripSheet
          trips={trips.filter((x) => !isPast(x))}
          onClose={() => setIncoming(null)}
          onPick={(id) => {
            if (id) {
              setAdding({ tripId: id, initial: incoming });
            } else {
              const tr: Trip = {
                id: uid(),
                name: t('newTrip'),
                emoji: COVERS[Math.floor(Math.random() * COVERS.length)],
                members: [{ id: 'me', name: settings.myName || t('me') }],
                bookings: [],
                checklist: t('defaultPack').split(',').map((x) => ({ id: uid(), text: x, done: false })),
                createdAt: Date.now(),
              };
              updateTrips((all) => [tr, ...all]);
              setOpenId(tr.id);
              setAdding({ tripId: tr.id, initial: incoming });
            }
            setIncoming(null);
          }}
        />
      )}

      {adding && trips.some((x) => x.id === adding.tripId) && (
        <AddBookingSheet
          initial={adding.initial}
          trip={trips.find((x) => x.id === adding.tripId)!}
          edit={adding.edit}
          home={settings.home}
          onClose={() => setAdding(null)}
          onSave={(b) => {
            updateTrip(adding.tripId, (tr) => ({
              ...tr,
              bookings: tr.bookings.some((x) => x.id === b.id) ? tr.bookings.map((x) => (x.id === b.id ? b : x)) : [...tr.bookings, b],
            }));
            setAdding(null);
          }}
        />
      )}

      {detailTrip && detailBooking && (
        <BookingDetail
          trip={detailTrip}
          b={detailBooking}
          rate={rate}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDetail(null);
            setAdding({ tripId: detailTrip.id, edit: detailBooking });
          }}
          onDelete={() => {
            updateTrip(detailTrip.id, (tr) => ({ ...tr, bookings: tr.bookings.filter((x) => x.id !== detailBooking.id) }));
            setDetail(null);
          }}
        />
      )}

      {settleIn && (
        <Sheet visible onClose={() => setSettleIn(null)}>
          <Text style={s.kicker}>{t('settle').toUpperCase()}</Text>
          <Text style={s.sheetTitle}>{settleIn.n}</Text>
          <View style={s.card}>
            {settleIn.p.map((p, i) => (
              <View key={i} style={[s.rowBetween, { paddingVertical: 8 }]}>
                <Text style={s.tlTitle}>
                  {p.f} → {p.t}
                </Text>
                <Text style={[s.price, { color: C.pink }]}>{fmtMoney(p.a, settleIn.c)}</Text>
              </View>
            ))}
          </View>
        </Sheet>
      )}

      <SettingsSheet visible={showSettings} settings={settings} onClose={() => setShowSettings(false)} onChange={changeSettings} />

      <WelcomeSheet
        visible={!settings.onboarded}
        settings={settings}
        onDone={(s, sample) => {
          changeSettings({ ...s, onboarded: true });
          askPermission();
          if (sample) updateTrips((all) => [sampleTrip(s), pastSample(s), londonSample(s), ...all]);
        }}
      />
    </View>
  );
}

/* ---------------- ホーム ---------------- */
function Home({
  trips,
  rate,
  onOpen,
  onNew,
  onSettings,
  onOpenBooking,
}: {
  trips: Trip[];
  rate: RateInfo;
  onOpen: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
  onOpenBooking: (tripId: string, id: string) => void;
}) {
  const next = useMemo(() => nextUp(trips), [trips]);
  const sorted = useMemo(() => {
    const today = todayStr();
    return [...trips].sort((a, b) => {
      const ra = tripRange(a);
      const rb = tripRange(b);
      const endedA = ra.end && ra.end < today ? 1 : 0;
      const endedB = rb.end && rb.end < today ? 1 : 0;
      if (endedA !== endedB) return endedA - endedB;
      return (ra.start ?? '9999').localeCompare(rb.start ?? '9999') * (endedA ? -1 : 1);
    });
  }, [trips]);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
      <View style={s.headRow}>
        <View>
          <Text style={s.kicker}>{greeting()}</Text>
          <Text style={s.appTitle}>{t('appName')}</Text>
        </View>
        <Pressable onPress={onSettings} hitSlop={12} style={s.gear}>
          <Icon name="settings-outline" size={20} />
        </Pressable>
      </View>

      <Text style={s.sec}>{t('nextUp').toUpperCase()}</Text>
      {next ? (
        <NextCard next={next} onPress={() => onOpenBooking(next.trip.id, next.item.booking.id)} />
      ) : (
        <View style={[s.card, { alignItems: 'center', paddingVertical: 22 }]}>
          <Text style={s.hint}>{t('noNext')}</Text>
        </View>
      )}

      <View style={[s.headRow, { marginTop: 30, marginBottom: 10 }]}>
        <Text style={[s.sec, { marginTop: 0, marginBottom: 0 }]}>{t('trips').toUpperCase()}</Text>
        <Pressable onPress={onNew} style={s.ghostBtn} hitSlop={8}>
          <Icon name="add" size={18} />
          <Text style={s.ghostBtnText}>{t('newTrip')}</Text>
        </Pressable>
      </View>
      {sorted.length === 0 && (
        <View style={[s.card, { alignItems: 'center', paddingVertical: 28 }]}>
          <Icon name="map-outline" size={34} color={C.sub} />
          <Text style={[s.hint, { textAlign: 'center', marginTop: 10 }]}>{t('noTrips')}</Text>
        </View>
      )}
      {sorted
        .filter((tr) => !isPast(tr))
        .map((tr) => (
          <TripCard key={tr.id} trip={tr} rate={rate} onPress={() => onOpen(tr.id)} />
        ))}
      <Memories trips={sorted.filter((tr) => isPast(tr))} onOpen={onOpen} />
      <YearSummary trips={trips} rate={rate} />
    </ScrollView>
  );
}

function statusOf(tr: Trip) {
  const { start, end } = tripRange(tr);
  const today = todayStr();
  if (!start) return { label: t('undated'), tone: 'sub' as const };
  if (end && end < today) return { label: t('ended'), tone: 'sub' as const };
  if (start <= today) return { label: t('onTrip'), tone: 'mint' as const };
  const n = daysBetween(today, start);
  return { label: n === 0 ? t('today') : t('daysLeft', { n }), tone: 'pink' as const };
}

function YearSummary({ trips, rate }: { trips: Trip[]; rate: RateInfo }) {
  const y = todayStr().slice(0, 4);
  const mine = trips.filter((tr) => (tripRange(tr).start ?? '').startsWith(y));
  if (!mine.length) return null;
  const nights = mine.reduce(
    (a, tr) => a + tr.bookings.filter((b) => b.type === 'hotel' && isDate(b.end)).reduce((x, b) => x + Math.max(0, daysBetween(b.start, b.end!)), 0),
    0,
  );
  const places = new Set<string>();
  mine.forEach((tr) => tr.bookings.forEach((b) => b.to && b.type !== 'car' && places.add(b.to.split(/[ ,(]/)[0])));
  const flights = mine.reduce((a, tr) => a + tr.bookings.filter((b) => b.type === 'flight').length, 0);
  const total = mine.reduce((a, tr) => a + tripTotal(tr, rate), 0);
  const msg = `${t('yearTitle', { y })}\n✈ ${t('ysTrips')} ${mine.length} / ${t('ysNights')} ${nights} / ${t('ysPlaces')} ${places.size} / ${t('ysFlights')} ${flights}\n— Tripfold`;
  return (
    <>
      <Text style={[s.sec, { marginTop: 14 }]}>{t('yearTitle', { y }).toUpperCase()}</Text>
      <View style={s.yearCard}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[
            [t('ysTrips'), mine.length],
            [t('ysNights'), nights],
            [t('ysPlaces'), places.size],
            [t('ysFlights'), flights],
          ].map(([k, v]) => (
            <View key={String(k)} style={{ width: '50%', paddingVertical: 8 }}>
              <Text style={s.yearNum}>{v}</Text>
              <Text style={s.passK}>{String(k).toUpperCase()}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <View>
            <Text style={s.passK}>{t('total').toUpperCase()}</Text>
            <Text style={[s.passV, { fontSize: 20 }]}>{fmtMoney(Math.round(total), rate.base)}</Text>
          </View>
          <Pressable onPress={() => Share.share({ message: msg })} style={s.yearShare}>
            <Icon name="share-outline" size={16} color={C.ink} />
            <Text style={[s.chipText, { color: C.ink }]}>{t('share')}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

function Memories({ trips, onOpen }: { trips: Trip[]; onOpen: (id: string) => void }) {
  if (!trips.length) return null;
  const years = [...new Set(trips.map((tr) => (tripRange(tr).start ?? '').slice(0, 4)))].sort().reverse();
  return (
    <>
      <Text style={[s.sec, { marginTop: 30 }]}>{t('memories').toUpperCase()}</Text>
      {years.map((y) => (
        <View key={y}>
          <Text style={s.year}>{y}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
            {trips
              .filter((tr) => (tripRange(tr).start ?? '').startsWith(y))
              .map((tr) => {
                const { start, end } = tripRange(tr);
                const photos = memoryPhotos(tr);
                const img = tr.cover ?? photos[0];
                return (
                  <Pressable key={tr.id} onPress={() => onOpen(tr.id)} style={({ pressed }) => [s.memCard, pressed && { opacity: 0.9 }]}>
                    {img ? (
                      <Image source={imgSrc(img)} style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]} resizeMode="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: coverOf(tr), alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 64, fontWeight: '900' }}>{monogram(tr.name)}</Text>
                      </View>
                    )}
                    <View style={s.memShade} />
                    <View style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
                      <Text style={s.memName} numberOfLines={1}>
                        {tr.name}
                      </Text>
                      <Text style={s.memSub}>
                        {start ? prettyDate(start) : ''}
                        {end && end !== start ? ` – ${prettyDate(end)}` : ''}
                        {photos.length ? `  ·  ${photos.length}${t('photosN') === '枚' ? '' : ' '}${photos.length === 1 && t('photosN') === 'photos' ? 'photo' : t('photosN')}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
          </ScrollView>
        </View>
      ))}
    </>
  );
}

function TripCard({ trip, rate, onPress }: { trip: Trip; rate: RateInfo; onPress: () => void }) {
  const { start, end } = tripRange(trip);
  const st = statusOf(trip);
  const total = tripTotal(trip, rate);
  return (
    <Pressable style={({ pressed }) => [s.tripCard, pressed && { opacity: 0.85 }]} onPress={onPress}>
      <Cover trip={trip} />
      <View style={{ flex: 1 }}>
        <Text style={s.tripName} numberOfLines={1}>
          {trip.name}
        </Text>
        <Text style={s.hint}>
          {start ? `${prettyDate(start)}${end && end !== start ? ' – ' + prettyDate(end) : ''}` : t('undated')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 7, alignItems: 'center' }}>
          <Text style={[s.status, st.tone === 'pink' ? { color: C.pink } : st.tone === 'mint' ? { color: C.mint } : {}, { flexShrink: 0 }]} numberOfLines={1}>● {st.label}</Text>
          <View style={{ flexDirection: 'row', gap: 4, flexShrink: 1, overflow: 'hidden' }}>
            {TYPES.filter((ty) => trip.bookings.some((b) => b.type === ty.id)).map((ty) => (
              <Icon key={ty.id} name={ty.icon + '-outline'} size={13} color={C.sub} />
            ))}
          </View>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        {total > 0 && <Text style={s.tripTotal}>{fmtMoney(Math.round(total), rate.base)}</Text>}
        <Icon name="chevron-forward" size={16} color={C.sub} />
      </View>
    </Pressable>
  );
}

function NextCard({ next, onPress }: { next: NonNullable<ReturnType<typeof nextUp>>; onPress: () => void }) {
  const b = next.item.booking;
  const ty = typeOf(b.type);
  const n = daysBetween(todayStr(), next.date);
  const edgeLabel =
    next.item.edge === 'start' ? (b.type === 'hotel' ? t('checkin') : t('pickup')) : next.item.edge === 'end' ? (b.type === 'hotel' ? t('checkout') : t('dropoff')) : '';
  const route = (b.type === 'flight' || b.type === 'train' || b.type === 'bus') && b.from && b.to;
  const short = (x: string) => (/^[A-Z]{3}$/.test(x) ? x : x.split(/[ ,(]/)[0]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.pass, pressed && { opacity: 0.92 }]}>
      <View style={s.passTop}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={ty.icon} size={16} color="#fff" />
          <Text style={s.passKicker}>
            {typeName(b.type).toUpperCase()}
            {edgeLabel ? ` · ${edgeLabel}` : ''}
          </Text>
        </View>
        <Text style={s.passWhen}>{n === 0 ? t('today') : t('daysLeft', { n })}</Text>
      </View>
      {route ? (
        <View style={s.passRoute}>
          <Text style={[s.passCity, { fontSize: cityFont(short(b.from!), short(b.to!)) }]} numberOfLines={1} adjustsFontSizeToFit>
            {short(b.from!)}
          </Text>
          <View style={s.passLine}>
            <View style={s.passDash} />
            <Icon name={ty.icon} size={16} color={C.pink} />
            <View style={s.passDash} />
          </View>
          <Text style={[s.passCity, { textAlign: 'right', fontSize: cityFont(short(b.from!), short(b.to!)) }]} numberOfLines={1} adjustsFontSizeToFit>
            {short(b.to!)}
          </Text>
        </View>
      ) : (
        <Text style={s.passTitle} numberOfLines={2}>
          {b.title || typeName(b.type)}
        </Text>
      )}
      {route && !!b.title && <Text style={s.passSub}>{b.title}</Text>}
      {!route && !!b.from && (
        <Text style={s.passSub} numberOfLines={1}>
          {b.from}
        </Text>
      )}
      <View style={s.perf}>
        <View style={[s.notch, { left: -30 }]} />
        <View style={s.perfLine} />
        <View style={[s.notch, { right: -30 }]} />
      </View>
      <View style={s.passGrid}>
        <PassCell k={t('date')} v={prettyDate(next.date)} flex={1.5} />
        <PassCell k={t('time')} v={next.item.time ?? '—'} flex={0.8} />
        {!!b.seat && <PassCell k={t('seat')} v={b.seat} />}
      </View>
      {!!b.code && (
        <View style={{ marginTop: 14 }}>
          <Text style={s.passK}>{t('code')}</Text>
          <Text style={s.passCode} selectable>
            {b.code}
          </Text>
        </View>
      )}
      <Text style={s.passTrip} numberOfLines={1}>
        {next.trip.name}
      </Text>
    </Pressable>
  );
}
const cityFont = (a: string, b: string) => {
  const n = Math.max(a.length, b.length);
  return n <= 4 ? 34 : n <= 6 ? 26 : 20;
};
const PassCell = ({ k, v, flex = 1 }: { k: string; v: string; flex?: number }) => (
  <View style={{ flex }}>
    <Text style={s.passK}>{k}</Text>
    <Text style={s.passV} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
      {v}
    </Text>
  </View>
);
const greeting = () => {
  const h = new Date().getHours();
  return h < 11 ? t('gMorning') : h < 18 ? t('gDay') : t('gEvening');
};

/* ---------------- 旅行の画面 ---------------- */
type Tab = 'plan' | 'bookings' | 'money' | 'pack';
function TripScreen({
  trip,
  rate,
  settings,
  onBack,
  onChange,
  onDelete,
  onAdd,
  onOpen,
  onShare,
  onAddPlan,
}: {
  onAddPlan: (date: string) => void;
  onShare: () => void;
  trip: Trip;
  rate: RateInfo;
  settings: Settings;
  onBack: () => void;
  onChange: (fn: (t: Trip) => Trip) => void;
  onDelete: () => void;
  onAdd: () => void;
  onOpen: (b: Booking) => void;
}) {
  const [tab, setTab] = useState<Tab>('plan');
  const scrollRef = useRef<any>(null);
  useEffect(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), [tab]);
  const [journalDay, setJournalDay] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const { start, end } = tripRange(trip);
  const total = tripTotal(trip, rate);
  return (
    <View style={{ flex: 1 }}>
      <View style={s.tripHead}>
        <Pressable onPress={onBack} hitSlop={14} style={s.back}>
          <Icon name="chevron-back" size={20} />
        </Pressable>
        <Pressable
          onPress={async () => {
            const uri = await pickImage();
            if (uri) onChange((tr) => ({ ...tr, cover: uri }));
          }}
          onLongPress={() => onChange((tr) => ({ ...tr, cover: undefined }))}
        >
          <Cover trip={trip} size={40} />
          <View style={[s.camBadge, { width: 18, height: 18, right: -4, bottom: -4 }]}>
            <Icon name="camera" size={10} color="#fff" />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.tripHeadName} numberOfLines={1}>
            {trip.name}
          </Text>
          <Text style={s.hint}>
            {start ? `${prettyDate(start)}${end && end !== start ? ' 〜 ' + prettyDate(end) : ''}` : t('undated')}
            {total > 0 ? `  ・  ${fmtMoney(Math.round(total), rate.base)}` : ''}
          </Text>
        </View>
        <Pressable onPress={onShare} hitSlop={12} style={s.back}>
          <Icon name="share-outline" size={19} />
        </Pressable>
      </View>
      <View style={s.tabs}>
        {(['plan', 'bookings', 'money', 'pack'] as Tab[]).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={s.tab}>
            <Text style={[s.tabText, tab === k && { color: C.ink }]}>
              {k === 'plan' ? t('tabPlan') : k === 'bookings' ? t('tabBookings') : k === 'money' ? t('tabMoney') : t('tabPack')}
            </Text>
            <View style={[s.tabBar, tab === k && { backgroundColor: C.ink }]} />
          </Pressable>
        ))}
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 20, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {tab === 'plan' && <PlanTab trip={trip} onOpen={onOpen} onJournal={setJournalDay} onAddPlan={onAddPlan} />}
        {tab === 'bookings' && <BookingsTab trip={trip} rate={rate} onOpen={onOpen} />}
        {tab === 'money' && <MoneyTab trip={trip} rate={rate} onChange={onChange} />}
        {tab === 'pack' && <PackTab trip={trip} onChange={onChange} />}
        <Pressable onPress={() => (sure ? onDelete() : setSure(true))} style={{ alignSelf: 'center', marginTop: 30 }}>
          <Text style={{ color: sure ? C.pink : C.sub, fontWeight: '700' }}>{sure ? t('deleteSure') : t('deleteTrip')}</Text>
        </Pressable>
      </ScrollView>
      {(tab === 'plan' || tab === 'bookings') && (
        <Pressable style={({ pressed }) => [s.fab, pressed && { transform: [{ scale: 0.97 }] }]} onPress={onAdd}>
          <Icon name="add" size={20} color="#fff" />
          <Text style={s.fabText}>{t('addBooking')}</Text>
        </Pressable>
      )}
      {journalDay && (
        <JournalSheet
          date={journalDay}
          value={trip.journal?.[journalDay] ?? {}}
          onClose={() => setJournalDay(null)}
          onSave={(v) => {
            onChange((tr) => ({ ...tr, journal: { ...(tr.journal ?? {}), [journalDay]: v } }));
            setJournalDay(null);
          }}
        />
      )}
    </View>
  );
}

function JournalSheet({
  date,
  value,
  onClose,
  onSave,
}: {
  date: string;
  value: { text?: string; photos?: string[] };
  onClose: () => void;
  onSave: (v: { text?: string; photos?: string[] }) => void;
}) {
  const [text, setText] = useState(value.text ?? '');
  const [photos, setPhotos] = useState<string[]>(value.photos ?? []);
  return (
    <Sheet visible onClose={onClose} tall>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
        <Text style={s.kicker}>{t('journal').toUpperCase()}</Text>
        <Text style={s.sheetTitle}>{prettyDate(date)}</Text>
        <TextInput
          style={[s.input, { height: 160, textAlignVertical: 'top', lineHeight: 22 }]}
          multiline
          value={text}
          onChangeText={setText}
          placeholder={t('journalPh')}
          placeholderTextColor={C.sub}
        />
        <Text style={s.label}>{t('photos')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((p) => (
            <Pressable key={p} onLongPress={() => setPhotos(photos.filter((x) => x !== p))}>
              <Image source={imgSrc(p)} style={s.memThumb} />
            </Pressable>
          ))}
          <Pressable
            style={[s.memThumb, s.thumbAdd]}
            onPress={async () => {
              const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true });
              if (!r.canceled) setPhotos([...photos, ...r.assets.map((a) => keepImage(a.uri))]);
            }}
          >
            <Icon name="add" size={22} color={C.sub} />
          </Pressable>
        </View>
        <Pressable style={s.primary} onPress={() => onSave({ text: text.trim() || undefined, photos: photos.length ? photos : undefined })}>
          <Text style={s.primaryText}>{t('save')}</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

function PlanTab({ trip, onOpen, onJournal, onAddPlan }: { trip: Trip; onOpen: (b: Booking) => void; onJournal?: (d: string) => void; onAddPlan?: (d: string) => void }) {
  const tl = timeline(trip);
  const today = todayStr();
  const days = tripDays(trip).map((date) => ({ date, items: tl.find((d) => d.date === date)?.items ?? [] }));
  const { start } = tripRange(trip);
  if (!days.length)
    return (
      <View style={[s.card, { alignItems: 'center', paddingVertical: 30 }]}>
        <Icon name="document-text-outline" size={34} color={C.sub} />
        <Text style={[s.hint, { textAlign: 'center', marginTop: 10, lineHeight: 19 }]}>{t('noBookings')}</Text>
      </View>
    );
  return (
    <>
      {days.map(({ date, items }) => (
        <View key={date} style={{ marginBottom: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            {!!start && <Text style={s.dayN}>{t('dayN', { n: daysBetween(start, date) + 1 })}</Text>}
            <Text style={s.dayDate}>{prettyDate(date)}</Text>
          </View>
          {items.length === 0 && !onAddPlan && <Text style={[s.hint, { marginLeft: 52, marginBottom: 8 }]}>{t('freeDay')}</Text>}
          {items.map((it, i) => {
            const b = it.booking;
            const ty = typeOf(b.type);
            const edge =
              it.edge === 'start' ? (b.type === 'hotel' ? t('checkin') : t('pickup')) : it.edge === 'end' ? (b.type === 'hotel' ? t('checkout') : t('dropoff')) : '';
            const last = i === items.length - 1;
            return (
              <View key={b.id + it.edge} style={{ flexDirection: 'row' }}>
                <View style={{ width: 52 }}>
                  <Text style={s.tlTime}>{it.time ?? '—'}</Text>
                </View>
                <View style={{ alignItems: 'center', width: 18 }}>
                  <View style={[s.tlDotSmall, { borderColor: ty.color }]} />
                  {!last && <View style={s.tlRail} />}
                </View>
                <Pressable onPress={() => onOpen(b)} style={({ pressed }) => [s.tlCard, pressed && { opacity: 0.85 }]}>
                  <TypeBadge type={b.type} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.tlTitle} numberOfLines={1}>
                      {b.title || typeName(b.type)}
                    </Text>
                    {!!edge && <Text style={[s.tlEdge, { color: ty.color }]}>{edge}</Text>}
                    {(b.from || b.to) && it.edge !== 'end' ? (
                      <Text style={s.hint} numberOfLines={1}>
                        {b.from}
                        {b.to && b.type !== 'car' ? `  →  ${b.to}` : ''}
                      </Text>
                    ) : null}
                    {!!b.code && <Text style={s.tlCode}>{b.code}</Text>}
                  </View>
                  {!!b.photos?.length && <Icon name="image-outline" size={16} color={C.sub} />}
                </Pressable>
              </View>
            );
          })}
          {onAddPlan && (
            <Pressable onPress={() => onAddPlan(date)} hitSlop={6} style={({ pressed }) => [s.addPlan, pressed && { opacity: 0.6 }]}>
              <Icon name="add" size={15} color={C.sub} />
              <Text style={s.addPlanText}>{items.length ? t('addPlan') : `${t('freeDay')} ・ ${t('addPlan')}`}</Text>
            </Pressable>
          )}
          {onJournal && date <= today && <JournalBlock entry={trip.journal?.[date]} onPress={() => onJournal(date)} />}
        </View>
      ))}
    </>
  );
}

function JournalBlock({ entry, onPress }: { entry?: { text?: string; photos?: string[] }; onPress: () => void }) {
  const has = !!entry?.text || !!entry?.photos?.length;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [has ? s.journal : s.journalEmpty, pressed && { opacity: 0.85 }]}>
      {has ? (
        <>
          {!!entry?.photos?.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {entry.photos.map((p) => (
                <Image key={p} source={imgSrc(p)} style={s.journalPhoto} />
              ))}
            </ScrollView>
          )}
          {!!entry?.text && (
            <Text style={s.journalText} numberOfLines={4}>
              {entry.text}
            </Text>
          )}
        </>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="images-outline" size={16} color={C.sub} />
          <Text style={[s.hint, { fontWeight: '800' }]}>{t('addMemory')}</Text>
        </View>
      )}
    </Pressable>
  );
}

function BookingsTab({ trip, rate, onOpen }: { trip: Trip; rate: RateInfo; onOpen: (b: Booking) => void }) {
  if (!trip.bookings.length) return <PlanTab trip={trip} onOpen={onOpen} />;
  return (
    <>
      {TYPES.filter((ty) => trip.bookings.some((b) => b.type === ty.id)).map((ty) => (
        <View key={ty.id} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 }}>
            <Icon name={ty.icon + '-outline'} size={16} color={ty.color} />
            <Text style={[s.sec, { marginTop: 0, marginBottom: 0 }]}>{typeName(ty.id).toUpperCase()}</Text>
          </View>
          <View style={s.card}>
            {trip.bookings
              .filter((b) => b.type === ty.id)
              .sort((a, b) => (a.start + (a.startTime ?? '')).localeCompare(b.start + (b.startTime ?? '')))
              .map((b, i) => (
                <Pressable key={b.id} onPress={() => onOpen(b)} style={[s.tlRow, i > 0 && s.tlLine]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tlTitle} numberOfLines={1}>
                      {b.title || typeName(b.type)}
                    </Text>
                    <Text style={s.hint}>
                      {isDate(b.start) ? prettyDate(b.start) : ''} {b.startTime ?? ''}
                      {isDate(b.end) && b.end !== b.start ? ` 〜 ${prettyDate(b.end!)}` : ''}
                    </Text>
                    {!!b.code && <Text style={s.tlCode}>{b.code}</Text>}
                  </View>
                  {!!b.price && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.price}>{fmtMoney(b.price, b.currency || rate.base)}</Text>
                      {(b.currency || rate.base) !== rate.base && (
                        <Text style={s.hint}>≈ {fmtMoney(Math.round(toHome(b.price, b.currency!, rate)), rate.base)}</Text>
                      )}
                    </View>
                  )}
                </Pressable>
              ))}
          </View>
        </View>
      ))}
    </>
  );
}

function MoneyTab({ trip, rate, onChange }: { trip: Trip; rate: RateInfo; onChange: (fn: (t: Trip) => Trip) => void }) {
  const total = tripTotal(trip, rate);
  const [name, setName] = useState('');
  const st = settle(trip, rate);
  const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? '?';
  const byType = TYPES.map((ty) => ({
    ty,
    v: trip.bookings.filter((b) => b.type === ty.id && b.price).reduce((a, b) => a + toHome(b.price!, b.currency || rate.base, rate), 0),
  })).filter((x) => x.v > 0);
  const max = Math.max(1, ...byType.map((x) => x.v));
  return (
    <>
      <View style={[s.card, { backgroundColor: C.ink }]}>
        <Text style={{ color: '#E8DCE6', fontWeight: '800', fontSize: 13 }}>{t('total')}</Text>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 32, marginTop: 2 }}>{fmtMoney(Math.round(total), rate.base)}</Text>
        {trip.members.length > 1 && (
          <Text style={{ color: '#E8DCE6', fontWeight: '700', marginTop: 2 }}>
            {t('perPerson')} {fmtMoney(Math.round(total / trip.members.length), rate.base)}
          </Text>
        )}
        <Text style={{ color: '#B9A9B7', fontSize: 11, marginTop: 6 }}>{t('rateNote')}</Text>
        <BudgetBar trip={trip} total={total} home={rate.base} onChange={onChange} />
      </View>

      <Text style={s.sec}>{t('spending').toUpperCase()}</Text>
      <ExpenseBox trip={trip} rate={rate} onChange={onChange} />

      <Text style={s.sec}>{t('convert').toUpperCase()}</Text>
      <Converter trip={trip} rate={rate} />

      {byType.length > 0 && (
        <>
          <Text style={s.sec}>{t('byType').toUpperCase()}</Text>
          <View style={s.card}>
            {byType.map(({ ty, v }) => (
              <View key={ty.id} style={{ marginVertical: 5 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name={ty.icon + '-outline'} size={15} color={ty.color} />
                    <Text style={s.tlTitle}>{typeName(ty.id)}</Text>
                  </View>
                  <Text style={s.price}>{fmtMoney(Math.round(v), rate.base)}</Text>
                </View>
                <View style={s.barBg}>
                  <View style={[s.bar, { width: `${(v / max) * 100}%`, backgroundColor: ty.color }]} />
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={s.sec}>{t('members').toUpperCase()}</Text>
      <View style={s.card}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {trip.members.map((m) => (
            <Pressable
              key={m.id}
              onLongPress={() =>
                m.id !== 'me' && onChange((tr) => ({ ...tr, members: tr.members.filter((x) => x.id !== m.id) }))
              }
              style={s.chip}
            >
              <View style={s.avatar}>
                <Text style={s.avatarText}>{m.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text style={s.chipText}>{m.name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TextInput style={[s.input, { flex: 1 }]} value={name} onChangeText={setName} placeholder={t('memberName')} placeholderTextColor={C.sub} />
          <Pressable
            style={s.smallBtn}
            onPress={() => {
              if (!name.trim()) return;
              onChange((tr) => ({ ...tr, members: [...tr.members, { id: uid(), name: name.trim() }] }));
              setName('');
            }}
          >
            <Text style={s.smallBtnText}>＋</Text>
          </Pressable>
        </View>
      </View>

      {trip.members.length > 1 && (
        <>
          <Text style={s.sec}>{t('settle').toUpperCase()}</Text>
          <View style={s.card}>
            {trip.members.map((m) => (
              <View key={m.id} style={s.rowBetween}>
                <Text style={s.tlTitle}>{m.name}</Text>
                <Text style={s.hint}>
                  {t('paidTotal')} {fmtMoney(Math.round(st.paid[m.id] ?? 0), rate.base)} ・ {t('oweTotal')} {fmtMoney(Math.round(st.owe[m.id] ?? 0), rate.base)}
                </Text>
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: C.line, marginVertical: 8 }} />
            {st.pay.length === 0 ? (
              <Text style={s.hint}>{t('settleNone')}</Text>
            ) : (
              [
                <Pressable
                  key="send"
                  style={[s.secondary, { marginBottom: 8 }]}
                  onPress={() => {
                    const data = { n: trip.name, c: rate.base, p: st.pay.map((p) => ({ f: nameOf(p.from), t: nameOf(p.to), a: Math.round(p.amount) })) };
                    const link = `tripfold://settle?d=${encodeURIComponent(JSON.stringify(data))}`;
                    const lines = st.pay.map((p) => `・${nameOf(p.from)} → ${nameOf(p.to)}  ${fmtMoney(Math.round(p.amount), rate.base)}`);
                    Share.share({ message: `【${trip.name}】${t('settle')}\n${lines.join('\n')}\n\n${t('openInApp')}\n${link}` });
                  }}
                >
                  <Icon name="paper-plane-outline" size={17} />
                  <Text style={s.secondaryText}>{t('sendSettle')}</Text>
                </Pressable>,
                ...st.pay.map((p, i) => (
                <View key={i} style={[s.rowBetween, { paddingVertical: 6 }]}>
                  <Text style={s.tlTitle}>{t('pays', { a: nameOf(p.from), b: nameOf(p.to) })}</Text>
                  <Text style={[s.price, { color: C.pink }]}>{fmtMoney(Math.round(p.amount), rate.base)}</Text>
                </View>
              )),
              ]
            )}
          </View>
        </>
      )}
    </>
  );
}

function BudgetBar({ trip, total, home, onChange }: { trip: Trip; total: number; home: string; onChange: (fn: (t: Trip) => Trip) => void }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(trip.budget ? String(trip.budget) : '');
  const b = trip.budget ?? 0;
  const ratio = b ? Math.min(1, total / b) : 0;
  const over = b > 0 && total > b;
  return (
    <View style={{ marginTop: 14 }}>
      {edit ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[s.input, { flex: 1, backgroundColor: '#24272E', borderColor: '#33363E', color: '#fff' }]}
            value={v}
            onChangeText={(x) => setV(cleanNum(x, 0))}
            keyboardType="number-pad"
            placeholder={`${t('budget')} (${home})`}
            placeholderTextColor="#8C9099"
            autoFocus
            onBlur={() => onChange((tr) => ({ ...tr, budget: v ? parseFloat(v) : undefined }))}
          />
          <Pressable
            style={[s.smallBtn, { backgroundColor: C.pink }]}
            onPress={() => {
              onChange((tr) => ({ ...tr, budget: v ? parseFloat(v) : undefined }));
              setEdit(false);
            }}
          >
            <Icon name="checkmark" size={20} color="#fff" />
          </Pressable>
        </View>
      ) : b ? (
        <Pressable onPress={() => setEdit(true)}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#B9BCC4', fontSize: 12, fontWeight: '700' }}>
              {t('budget')} {fmtMoney(b, home)}
            </Text>
            <Text style={{ color: over ? C.pink : '#7FE0BE', fontSize: 12, fontWeight: '800' }}>
              {over ? `${fmtMoney(Math.round(total - b), home)} ${t('over')}` : `${fmtMoney(Math.round(b - total), home)} ${t('left')}`}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#2C2F36', marginTop: 8, overflow: 'hidden' }}>
            <View style={{ height: 6, width: `${ratio * 100}%`, backgroundColor: over ? C.pink : '#7FE0BE' }} />
          </View>
        </Pressable>
      ) : (
        <Pressable onPress={() => setEdit(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="add-circle-outline" size={16} color="#B9BCC4" />
          <Text style={{ color: '#B9BCC4', fontSize: 13, fontWeight: '800' }}>{t('budgetSet')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ExpenseBox({ trip, rate, onChange }: { trip: Trip; rate: RateInfo; onChange: (fn: (t: Trip) => Trip) => void }) {
  const last = trip.expenses?.[0]?.currency;
  const [title, setTitle] = useState('');
  const [amt, setAmt] = useState('');
  const [cur, setCur] = useState(last ?? trip.bookings.find((b) => b.currency && b.currency !== rate.base)?.currency ?? rate.base);
  const [cat, setCat] = useState<ExpenseCat>('meal');
  const [payer, setPayer] = useState(trip.members[0]?.id);
  const c = findCurrency(cur);
  const list = trip.expenses ?? [];
  const sum = list.reduce((a, e) => a + toHome(e.amount, e.currency, rate), 0);
  const add = () => {
    const v = parseFloat(amt);
    if (!v) return;
    const e: Expense = { id: uid(), title: title.trim() || catName(cat), cat, amount: v, currency: cur, date: todayStr(), paidBy: payer };
    onChange((tr) => ({ ...tr, expenses: [e, ...(tr.expenses ?? [])] }));
    setTitle('');
    setAmt('');
  };
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {EXP_CATS.map((x) => (
          <Pressable key={x.id} onPress={() => setCat(x.id)} style={[s.typeChip, cat === x.id && { backgroundColor: C.ink, borderColor: C.ink }]}>
            <Icon name={x.icon} size={14} color={cat === x.id ? '#fff' : C.sub} />
            <Text style={[s.chipText, cat === x.id ? { color: '#fff' } : { color: C.sub }]}>{catName(x.id)}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={[s.input, { marginTop: 10 }]} value={title} onChangeText={setTitle} placeholder={t('expTitle')} placeholderTextColor={C.sub} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TextInput style={[s.input, { flex: 1 }]} value={amt} onChangeText={(x) => setAmt(cleanNum(x, c.decimals))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.sub} />
        <CurrencyPicker value={cur} onChange={setCur} />
        <Pressable style={[s.smallBtn, !amt && { opacity: 0.35 }]} onPress={add} disabled={!amt}>
          <Icon name="add" size={20} color="#fff" />
        </Pressable>
      </View>
      {trip.members.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Text style={s.hint}>{t('paidBy')}</Text>
          {trip.members.map((m) => (
            <Pressable key={m.id} onPress={() => setPayer(m.id)} style={[s.typeChip, payer === m.id && { borderColor: C.ink }]}>
              <Text style={s.chipText}>{m.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={{ height: 1, backgroundColor: C.line, marginVertical: 12 }} />
      {list.length === 0 ? (
        <Text style={s.hint}>{t('noExp')}</Text>
      ) : (
        <>
          {list.slice(0, 30).map((e) => (
            <Pressable key={e.id} onLongPress={() => onChange((tr) => ({ ...tr, expenses: (tr.expenses ?? []).filter((x) => x.id !== e.id) }))} style={s.expRow}>
              <View style={s.expIcon}>
                <Icon name={EXP_CATS.find((x) => x.id === e.cat)?.icon ?? 'ellipsis-horizontal'} size={15} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.tlTitle} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={s.hint}>
                  {prettyDate(e.date)}
                  {trip.members.length > 1 ? ` · ${trip.members.find((m) => m.id === e.paidBy)?.name ?? ''}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.price}>{fmtMoney(e.amount, e.currency)}</Text>
                {e.currency !== rate.base && <Text style={s.hint}>≈ {fmtMoney(Math.round(toHome(e.amount, e.currency, rate)), rate.base)}</Text>}
              </View>
            </Pressable>
          ))}
          <View style={[s.rowBetween, { marginTop: 6 }]}>
            <Text style={s.hint}>{t('expensesTotal')}</Text>
            <Text style={s.price}>{fmtMoney(Math.round(sum), rate.base)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

function Converter({ trip, rate }: { trip: Trip; rate: RateInfo }) {
  const [cur, setCur] = useState(trip.bookings.find((b) => b.currency && b.currency !== rate.base)?.currency ?? (rate.base === 'JPY' ? 'USD' : 'JPY'));
  const [v, setV] = useState('10');
  const c = findCurrency(cur);
  const n = parseFloat(v) || 0;
  return (
    <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
      <TextInput style={[s.input, { flex: 1, fontSize: 18 }]} value={v} onChangeText={(x) => setV(cleanNum(x, c.decimals))} keyboardType="decimal-pad" />
      <CurrencyPicker value={cur} onChange={setCur} />
      <Icon name="arrow-forward" size={16} color={C.sub} />
      <Text style={[s.price, { fontSize: 18, minWidth: 90, textAlign: 'right' }]} numberOfLines={1} adjustsFontSizeToFit>
        {fmtMoney(Math.round(toHome(n, cur, rate)), rate.base)}
      </Text>
    </View>
  );
}

const PACK_SETS = [
  { id: 'abroad', icon: 'earth-outline', name: 'psAbroad', key: 'packAbroad' },
  { id: 'biz', icon: 'briefcase-outline', name: 'psBiz', key: 'packBiz' },
  { id: 'beach', icon: 'sunny-outline', name: 'psBeach', key: 'packBeach' },
  { id: 'cold', icon: 'snow-outline', name: 'psCold', key: 'packCold' },
  { id: 'camp', icon: 'bonfire-outline', name: 'psCamp', key: 'packCamp' },
  { id: 'baby', icon: 'happy-outline', name: 'psKids', key: 'packKids' },
] as const;

function PackTab({ trip, onChange }: { trip: Trip; onChange: (fn: (t: Trip) => Trip) => void }) {
  const [text, setText] = useState('');
  const done = trip.checklist.filter((c) => c.done).length;
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
        {PACK_SETS.map((ps) => (
          <Pressable
            key={ps.id}
            style={s.typeChip}
            onPress={() =>
              onChange((tr) => {
                const have = new Set(tr.checklist.map((c) => c.text));
                const add = t(ps.key).split(',').filter((x) => !have.has(x));
                return { ...tr, checklist: [...tr.checklist, ...add.map((x) => ({ id: uid(), text: x, done: false }))] };
              })
            }
          >
            <Icon name={ps.icon} size={14} color={C.sub} />
            <Text style={s.chipText}>{t(ps.name)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={s.hint}>
        {t('packHint')} ・ {done}/{trip.checklist.length}
      </Text>
      <View style={[s.card, { marginTop: 8 }]}>
        {trip.checklist.map((c, i) => (
          <Pressable
            key={c.id}
            style={[s.tlRow, i > 0 && s.tlLine]}
            onPress={() => onChange((tr) => ({ ...tr, checklist: tr.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) }))}
            onLongPress={() => onChange((tr) => ({ ...tr, checklist: tr.checklist.filter((x) => x.id !== c.id) }))}
          >
            <View style={[s.check, c.done && { backgroundColor: C.ink, borderColor: C.ink }]}>{c.done && <Icon name="checkmark" size={15} color="#fff" />}</View>
            <Text style={[s.tlTitle, c.done && { color: C.sub, textDecorationLine: 'line-through' }]}>{c.text}</Text>
          </Pressable>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={text}
            onChangeText={setText}
            placeholder={t('packPh')}
            placeholderTextColor={C.sub}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={() => {
              if (!text.trim()) return;
              onChange((tr) => ({ ...tr, checklist: [...tr.checklist, { id: uid(), text: text.trim(), done: false }] }));
              setText('');
            }}
          />
          <Pressable
            style={s.smallBtn}
            onPress={() => {
              if (!text.trim()) return;
              onChange((tr) => ({ ...tr, checklist: [...tr.checklist, { id: uid(), text: text.trim(), done: false }] }));
              setText('');
            }}
          >
            <Text style={s.smallBtnText}>＋</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

/* ---------------- シートの共通部分 ---------------- */
function Sheet({ visible, onClose, children, tall }: { visible: boolean; onClose: () => void; children: React.ReactNode; tall?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, tall && { height: '92%' }, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.sheetTop}>
            <View style={s.grabber} />
            <Pressable onPressIn={onClose} hitSlop={18} style={s.closeBtn}>
              <Icon name="close" size={18} />
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PickTripSheet({ trips, onClose, onPick }: { trips: Trip[]; onClose: () => void; onPick: (id: string | null) => void }) {
  return (
    <Sheet visible onClose={onClose}>
      <Text style={s.kicker}>{t('shared').toUpperCase()}</Text>
      <Text style={s.sheetTitle}>{t('pickTrip')}</Text>
      {trips.map((tr) => (
        <Pressable key={tr.id} style={s.option} onPress={() => onPick(tr.id)}>
          <Cover trip={tr} size={40} />
          <Text style={[s.tlTitle, { flex: 1 }]} numberOfLines={1}>
            {tr.name}
          </Text>
          <Icon name="chevron-forward" size={18} color={C.sub} />
        </Pressable>
      ))}
      <Pressable style={s.option} onPress={() => onPick(null)}>
        <View style={s.optIcon}>
          <Icon name="add" size={22} />
        </View>
        <Text style={[s.tlTitle, { flex: 1 }]}>{t('newTrip')}</Text>
      </Pressable>
    </Sheet>
  );
}

function NewTripSheet({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: (name: string, color: string, cover?: string) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COVERS[0]);
  const [cover, setCover] = useState<string | undefined>();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={s.sheetTitle}>{t('newTrip')}</Text>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <Pressable
          onPress={async () => {
            const uri = await pickImage();
            if (uri) setCover(uri);
          }}
          onLongPress={() => setCover(undefined)}
        >
          <Cover trip={{ name: name || '··', emoji: color, cover }} size={96} />
          <View style={s.camBadge}>
            <Icon name="camera" size={14} color="#fff" />
          </View>
        </Pressable>
        <Text style={[s.hint, { marginTop: 8 }]}>{t('coverHint')}</Text>
      </View>
      <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t('tripName')} placeholderTextColor={C.sub} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, justifyContent: 'center' }}>
        {COVERS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} style={[s.swatch, { backgroundColor: c }, color === c && s.swatchOn]} />
        ))}
      </View>
      <Pressable
        style={[s.primary, !name.trim() && { opacity: 0.35 }]}
        disabled={!name.trim()}
        onPress={() => {
          onCreate(name.trim(), color, cover);
          setName('');
          setCover(undefined);
        }}
      >
        <Text style={s.primaryText}>{t('create')}</Text>
      </Pressable>
    </Sheet>
  );
}

/* ---------------- 予約の追加・編集 ---------------- */
function AddBookingSheet({
  trip,
  edit,
  home,
  onClose,
  onSave,
  initial,
}: {
  initial?: { text?: string; image?: string; planDate?: string };
  trip: Trip;
  edit?: Booking;
  home: string;
  onClose: () => void;
  onSave: (b: Booking) => void;
}) {
  const [mode, setMode] = useState<'choose' | 'text' | 'form'>(edit || initial?.planDate ? 'form' : 'choose');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [b, setB] = useState<Booking>(
    edit ??
      (initial?.planDate
        ? { id: uid(), type: 'plan', title: '', start: initial.planDate, currency: home, createdAt: Date.now() }
        : { id: uid(), type: 'flight', title: '', start: tripRange(trip).start ?? todayStr(), currency: home, createdAt: Date.now() }),
  );
  const set = (p: Partial<Booking>) => setB((x) => ({ ...x, ...p }));
  const applyParsed = (src: string, photo?: string) => {
    const p = parseBooking(src);
    const got = Object.keys(p).filter((k) => k !== 'type').length;
    setB((x) => ({ ...x, ...p, currency: p.currency ?? x.currency, photos: photo ? [...(x.photos ?? []), photo] : x.photos }));
    setNote(got >= 2 ? t('readOk') : t('readNone'));
    setMode('form');
  };
  const pickShot = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets?.[0]) return;
    readImage(keepImage(r.assets[0].uri));
  };
  const readImage = async (uri: string) => {
    if (!ocrAvailable) {
      set({ photos: [...(b.photos ?? []), uri] });
      setNote(t('ocrNA'));
      setMode('form');
      return;
    }
    setBusy(true);
    try {
      const lines = (await recognizeReceipt(uri)) ?? [];
      // 上から順・同じ高さは左から順に並べて1つの文にする
      const sorted = [...lines].sort((a, c) => (Math.abs(a.y - c.y) < Math.min(a.h, c.h) * 0.5 ? a.x - c.x : a.y - c.y));
      const rows: string[] = [];
      let lastY = -1;
      sorted.forEach((l) => {
        if (lastY >= 0 && Math.abs(l.y - lastY) < l.h * 0.5) rows[rows.length - 1] += ' ' + l.text;
        else rows.push(l.text);
        lastY = l.y;
      });
      applyParsed(rows.join('\n'), uri);
    } catch {
      set({ photos: [...(b.photos ?? []), uri] });
      setNote(t('readNone'));
      setMode('form');
    }
    setBusy(false);
  };
  const addPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled && r.assets?.[0]) set({ photos: [...(b.photos ?? []), keepImage(r.assets[0].uri)] });
  };
  const cur = findCurrency(b.currency || home);
  useEffect(() => {
    if (!initial || initial.planDate) return;
    if (initial.image) readImage(keepImage(initial.image));
    else if (initial.text) applyParsed(initial.text);
  }, []);

  return (
    <Sheet visible onClose={onClose} tall={mode === 'form'}>
      {mode === 'choose' && (
        <>
          <Text style={s.sheetTitle}>{t('howAdd')}</Text>
          <AddOption icon="scan-outline" title={t('fromShot')} sub={busy ? t('ocrBusy') : t('fromShotSub')} onPress={pickShot} />
          <AddOption icon="mail-open-outline" title={t('fromText')} sub={t('fromTextSub')} onPress={() => setMode('text')} />
          <AddOption icon="create-outline" title={t('manual')} sub={t('manualSub')} onPress={() => setMode('form')} />
          <AddOption
            icon="flag-outline"
            title={t('addPlan')}
            sub={t('planSub')}
            onPress={() => {
              set({ type: 'plan' });
              setMode('form');
            }}
          />
        </>
      )}
      {mode === 'text' && (
        <>
          <Text style={s.sheetTitle}>{t('fromText')}</Text>
          <TextInput
            style={[s.input, { height: 220, textAlignVertical: 'top' }]}
            multiline
            value={text}
            onChangeText={setText}
            placeholder={t('pasteHere')}
            placeholderTextColor={C.sub}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              style={[s.secondary, { flex: 1 }]}
              onPress={async () => {
                const c = await Clipboard.getStringAsync();
                if (c) setText(c);
              }}
            >
              <Icon name="clipboard-outline" size={17} />
              <Text style={s.secondaryText}>{t('paste')}</Text>
            </Pressable>
            <Pressable style={[s.primary, { flex: 1, marginTop: 0 }, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim()} onPress={() => applyParsed(text)}>
              <Text style={s.primaryText}>{t('read')}</Text>
            </Pressable>
          </View>
        </>
      )}
      {mode === 'form' && (
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          <Text style={s.sheetTitle}>{edit ? t('edit') : b.type === 'plan' ? t('addPlan') : t('addTitle')}</Text>
          {!!note && (
            <View style={s.note}>
              <Text style={s.noteText}>{note}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {TYPES.map((ty) => (
              <Pressable key={ty.id} onPress={() => set({ type: ty.id as BookingType })} style={[s.typeChip, b.type === ty.id && { backgroundColor: ty.soft, borderColor: ty.color }]}>
                <Icon name={ty.icon + '-outline'} size={14} color={b.type === ty.id ? ty.color : C.sub} />
                <Text style={[s.chipText, b.type !== ty.id && { color: C.sub }]}>{typeName(ty.id)}</Text>
              </Pressable>
            ))}
          </View>
          <Field label={b.type === 'plan' ? t('planName') : t('title')} value={b.title} onChange={(v) => set({ title: v })} placeholder={b.type === 'plan' ? t('planTitlePh') : undefined} />
          {b.type === 'plan' && tripDays(trip).length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 6 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
              {tripDays(trip).map((d, i) => (
                <Pressable key={d} onPress={() => set({ start: d })} style={[s.typeChip, b.start === d && { backgroundColor: C.ink, borderColor: C.ink }]}>
                  <Text style={[s.chipText, b.start === d && { color: '#fff' }]}>{`${t('dayN', { n: i + 1 })} ・ ${prettyDate(d)}`}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {b.type === 'plan' ? (
            <>
              <View style={s.two}>
                <Field label={t('time')} value={b.startTime ?? ''} onChange={(v) => set({ startTime: v || undefined })} placeholder="10:00" small />
                <Field label={t('endTime')} value={b.endTime ?? ''} onChange={(v) => set({ endTime: v || undefined })} placeholder="12:00" small />
              </View>
              <Field label={t('place')} value={b.from ?? ''} onChange={(v) => set({ from: v || undefined })} />
            </>
          ) : (
          <>
          <View style={s.two}>
            <DateField label={t('startDate')} value={b.start} onChange={(v) => set({ start: v })} />
            <Field label={t('time')} value={b.startTime ?? ''} onChange={(v) => set({ startTime: v || undefined })} placeholder="09:30" small />
          </View>
          <View style={s.two}>
            <DateField label={t('endDate')} value={b.end ?? ''} onChange={(v) => set({ end: v || undefined })} optional />
            <Field label={t('time')} value={b.endTime ?? ''} onChange={(v) => set({ endTime: v || undefined })} placeholder="11:00" small />
          </View>
          <Field label={t('from')} value={b.from ?? ''} onChange={(v) => set({ from: v || undefined })} />
          <Field label={t('to')} value={b.to ?? ''} onChange={(v) => set({ to: v || undefined })} />
          <View style={s.two}>
            <Field label={t('code')} value={b.code ?? ''} onChange={(v) => set({ code: v || undefined })} />
            <Field label={t('seat')} value={b.seat ?? ''} onChange={(v) => set({ seat: v || undefined })} small />
          </View>
          </>
          )}
          <Text style={s.label}>{t('price')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              keyboardType="decimal-pad"
              value={b.price != null ? String(b.price) : ''}
              onChangeText={(v) => {
                const c = cleanNum(v, cur.decimals);
                set({ price: c ? parseFloat(c) : undefined });
              }}
              placeholder="0"
              placeholderTextColor={C.sub}
            />
            <CurrencyPicker value={b.currency || home} onChange={(c) => set({ currency: c })} />
          </View>
          {trip.members.length > 1 && (
            <>
              <Text style={s.label}>{t('paidBy')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {trip.members.map((m) => (
                  <Pressable key={m.id} onPress={() => set({ paidBy: m.id })} style={[s.typeChip, (b.paidBy ?? trip.members[0].id) === m.id && { backgroundColor: C.pinkSoft, borderColor: C.pink }]}>
                    <Text style={s.chipText}>{m.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.label}>{t('splitWith')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {trip.members.map((m) => {
                  const on = !b.splitWith?.length || b.splitWith.includes(m.id);
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => {
                        const base = b.splitWith?.length ? b.splitWith : trip.members.map((x) => x.id);
                        const next = on ? base.filter((x) => x !== m.id) : [...base, m.id];
                        set({ splitWith: next.length === trip.members.length ? undefined : next });
                      }}
                      style={[s.typeChip, on && { backgroundColor: C.mintSoft, borderColor: C.mint }]}
                    >
                      <Text style={s.chipText}>
                        {on ? '✓ ' : ''}
                        {m.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          <Field label={t('memo')} value={b.memo ?? ''} onChange={(v) => set({ memo: v || undefined })} multiline />
          <Text style={s.label}>{t('photos')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(b.photos ?? []).map((p) => (
              <Pressable key={p} onLongPress={() => set({ photos: b.photos!.filter((x) => x !== p) })}>
                <Image source={imgSrc(p)} style={s.thumb} />
              </Pressable>
            ))}
            <Pressable style={[s.thumb, s.thumbAdd]} onPress={addPhoto}>
              <Text style={s.hint}>{t('addPhoto')}</Text>
            </Pressable>
          </View>
          <Pressable style={[s.primary, !b.start && { opacity: 0.4 }]} disabled={!b.start} onPress={() => onSave(b)}>
            <Text style={s.primaryText}>{t('save')}</Text>
          </Pressable>
        </ScrollView>
      )}
    </Sheet>
  );
}

function AddOption({ icon, title, sub, onPress }: { icon: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.option, pressed && { opacity: 0.8 }]} onPress={onPress}>
      <View style={s.optIcon}>
        <Icon name={icon} size={22} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.tlTitle}>{title}</Text>
        <Text style={s.hint}>{sub}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={C.sub} />
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  small,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  small?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ flex: small ? 0.75 : 1 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { height: 70, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.sub}
        multiline={multiline}
      />
    </View>
  );
}

function DateField({ label, value, onChange, optional }: { label: string; value: string; onChange: (v: string) => void; optional?: boolean }) {
  return (
    <View style={{ flex: 1.5 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.dateRow}>
        <Pressable onPress={() => onChange(shiftDate(isDate(value) ? value : todayStr(), -1))} style={s.dateBtn} hitSlop={6}>
          <Icon name="chevron-back" size={16} color={C.ink} />
        </Pressable>
        <TextInput
          style={s.dateInput}
          value={value}
          onChangeText={onChange}
          placeholder={optional ? '—' : 'YYYY-MM-DD'}
          placeholderTextColor={C.sub}
          maxLength={10}
        />
        <Pressable onPress={() => onChange(shiftDate(isDate(value) ? value : todayStr(), 1))} style={s.dateBtn} hitSlop={6}>
          <Icon name="chevron-forward" size={16} color={C.ink} />
        </Pressable>
      </View>
      {isDate(value) && <Text style={[s.hint, { marginTop: 2, textAlign: 'center' }]}>{prettyDate(value)}</Text>}
    </View>
  );
}

function CurrencyPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const c = findCurrency(value);
  return (
    <>
      <Pressable style={s.curBtn} onPress={() => setOpen(true)}>
        <Text style={s.chipText}>{c.code}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.curWrap} onPress={() => setOpen(false)}>
          <View style={s.curList}>
            <ScrollView>
              {CURRENCIES.map((x) => (
                <Pressable
                  key={x.code}
                  style={[s.curRow, x.code === value && { backgroundColor: C.pinkSoft }]}
                  onPress={() => {
                    onChange(x.code);
                    setOpen(false);
                  }}
                >
                  <Text style={s.tlTitle}>{x.code}</Text>
                  <Text style={s.hint}>{x.symbol}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/* ---------------- 予約の詳細 ---------------- */
function BookingDetail({
  trip,
  b,
  rate,
  onClose,
  onEdit,
  onDelete,
}: {
  trip: Trip;
  b: Booking;
  rate: RateInfo;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ty = typeOf(b.type);
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const nights = b.type === 'hotel' && isDate(b.end) ? daysBetween(b.start, b.end!) : 0;
  return (
    <Sheet visible onClose={onClose} tall>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={s.detailHead}>
          <TypeBadge type={b.type} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[s.kicker, { color: ty.color }]}>
              {typeName(b.type).toUpperCase()} · {trip.name}
            </Text>
            <Text style={s.detailTitle}>{b.title || typeName(b.type)}</Text>
          </View>
        </View>
        {!!b.code && (
          <Pressable
            style={s.codeBig}
            onPress={async () => {
              await Clipboard.setStringAsync(b.code!);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Text style={s.hint}>{t('code')}</Text>
            <Text style={s.codeBigText} selectable>
              {b.code}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name={copied ? 'checkmark' : 'copy-outline'} size={14} color={C.pink} />
              <Text style={[s.hint, { color: C.pink, fontWeight: '800' }]}>{copied ? t('copied') : t('copy')}</Text>
            </View>
          </Pressable>
        )}
        <View style={s.card}>
          <Info k={b.type === 'hotel' ? t('checkin') : b.type === 'car' ? t('pickup') : t('startDate')} v={`${prettyDate(b.start)} ${b.startTime ?? ''}`} />
          {isDate(b.end) && (
            <Info
              k={b.type === 'hotel' ? t('checkout') : b.type === 'car' ? t('dropoff') : t('endDate')}
              v={`${prettyDate(b.end!)} ${b.endTime ?? ''}${nights > 0 ? `  (${t('nights', { n: nights })})` : ''}`}
            />
          )}
          {!isDate(b.end) && b.endTime && <Info k={t('time')} v={`→ ${b.endTime}`} />}
          {!!b.from && <Info k={b.type === 'plan' ? t('place') : t('from')} v={b.from} onMap />}
          {!!b.to && <Info k={t('to')} v={b.to} onMap />}
          {b.type === 'flight' && (() => {
            const dep = toMyTime(b.from, b.start, b.startTime);
            const arr = toMyTime(b.to, b.end ?? b.start, b.endTime);
            const fmtD = (h: number) => (h === 0 ? '' : `  (${t('tzDiff')} ${h > 0 ? '+' : ''}${h}h)`);
            return (
              <>
                {dep && dep.diffH !== 0 && <Info k={t('depMine')} v={`${dep.time}${fmtD(dep.diffH)}`} />}
                {arr && arr.diffH !== 0 && <Info k={t('arrMine')} v={`${arr.time}${fmtD(arr.diffH)}`} />}
              </>
            );
          })()}
          {!!b.seat && <Info k={t('seat')} v={b.seat} />}
          {!!b.price && (
            <Info
              k={t('price')}
              v={`${fmtMoney(b.price, b.currency || rate.base)}${(b.currency || rate.base) !== rate.base ? `  ≈ ${fmtMoney(Math.round(toHome(b.price, b.currency!, rate)), rate.base)}` : ''}`}
            />
          )}
          {trip.members.length > 1 && !!b.price && (
            <Info k={t('paidBy')} v={trip.members.find((m) => m.id === (b.paidBy ?? trip.members[0].id))?.name ?? ''} />
          )}
          {!!b.memo && <Info k={t('memo')} v={b.memo} />}
        </View>
        {!!b.photos?.length && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {b.photos.map((p) => (
              <Pressable key={p} onPress={() => setZoom(p)}>
                <Image source={imgSrc(p)} style={s.photoBig} />
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <Pressable style={[s.secondary, { flex: 1 }]} onPress={onEdit}>
            <Icon name="create-outline" size={17} />
            <Text style={s.secondaryText}>{t('edit')}</Text>
          </Pressable>
          <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => (sure ? onDelete() : setSure(true))}>
            <Icon name="trash-outline" size={17} color={sure ? C.pink : C.ink} />
            <Text style={[s.secondaryText, sure && { color: C.pink }]}>{sure ? t('deleteSure') : t('delete')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      <Modal visible={!!zoom} transparent onRequestClose={() => setZoom(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }} onPress={() => setZoom(null)}>
          {zoom && <Image source={imgSrc(zoom)} style={{ width: '100%', height: '85%' }} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </Sheet>
  );
}

const Info = ({ k, v, onMap }: { k: string; v: string; onMap?: boolean }) => (
  <View style={[s.infoRow, { alignItems: 'center' }]}>
    <Text style={s.infoK}>{k}</Text>
    <Text style={s.infoV} selectable>
      {v}
    </Text>
    {onMap && (
      <Pressable onPress={() => openMap(v)} hitSlop={8} style={s.mapBtn}>
        <Icon name="navigate" size={14} color="#fff" />
      </Pressable>
    )}
  </View>
);

/* ---------------- 設定・ようこそ ---------------- */
function SettingsSheet({ visible, settings, onClose, onChange }: { visible: boolean; settings: Settings; onClose: () => void; onChange: (s: Settings) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={s.sheetTitle}>{t('settings')}</Text>
      <SettingsBody settings={settings} onChange={onChange} />
      <Text style={[s.hint, { textAlign: 'center', marginTop: 16 }]}>v0.1</Text>
    </Sheet>
  );
}
function SettingsBody({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  return (
    <>
      <Text style={s.label}>{t('language')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['ja', 'en'] as const).map((l) => (
          <Pressable key={l} onPress={() => onChange({ ...settings, lang: l })} style={[s.typeChip, settings.lang === l && { backgroundColor: C.pinkSoft, borderColor: C.pink }]}>
            <Text style={s.chipText}>{l === 'ja' ? '日本語' : 'English'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.label}>{t('homeCur')}</Text>
      <View style={{ flexDirection: 'row' }}>
        <CurrencyPicker value={settings.home} onChange={(c) => onChange({ ...settings, home: c })} />
      </View>
      <Text style={s.label}>{t('notify')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[true, false].map((v) => (
          <Pressable key={String(v)} onPress={() => onChange({ ...settings, notify: v })} style={[s.typeChip, settings.notify === v && { backgroundColor: C.ink, borderColor: C.ink }]}>
            <Text style={[s.chipText, settings.notify === v && { color: '#fff' }]}>{v ? 'ON' : 'OFF'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.label}>{t('myName')}</Text>
      <TextInput style={s.input} value={settings.myName} onChangeText={(v) => onChange({ ...settings, myName: v })} placeholder={t('me')} placeholderTextColor={C.sub} />
    </>
  );
}
function WelcomeSheet({ visible, settings, onDone }: { visible: boolean; settings: Settings; onDone: (s: Settings, sample: boolean) => void }) {
  const [st, setSt] = useState(settings);
  setLang(st.lang);
  return (
    <Modal visible={visible} animationType="fade">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, backgroundColor: C.bg }}>
        <Image source={require('./assets/icon.png')} style={[s.logoBig, { overflow: 'hidden' }]} />
        <Text style={[s.appTitle, { textAlign: 'center', fontSize: 34, marginTop: 18 }]}>{t('appName')}</Text>
        <Text style={[s.hint, { textAlign: 'center', fontSize: 15, lineHeight: 23, marginTop: 10 }]}>{t('welcomeText')}</Text>
        <View style={{ marginTop: 20 }}>
          <SettingsBody settings={st} onChange={setSt} />
        </View>
        <Pressable style={s.primary} onPress={() => onDone(st, false)}>
          <Text style={s.primaryText}>{t('start')}</Text>
        </Pressable>
        <Pressable style={[s.secondary, { marginTop: 10 }]} onPress={() => onDone(st, true)}>
          <Text style={s.secondaryText}>{t('sample')}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

/* ---------------- お試し用の旅行 ---------------- */
function pastSample(st: Settings): Trip {
  const ja = st.lang === 'ja';
  const a = shiftDate(todayStr(), -40);
  return {
    id: uid(),
    name: ja ? '京都 週末旅' : 'Kyoto weekend',
    emoji: '#0B7285',
    cover: 'asset:kyoto',
    members: [{ id: 'me', name: st.myName || t('me') }],
    bookings: [
      { id: uid(), type: 'train', title: ja ? 'のぞみ 21号' : 'Nozomi 21', start: a, startTime: '08:00', endTime: '10:15', from: ja ? '東京' : 'Tokyo', to: ja ? '京都' : 'Kyoto', price: 14170, currency: 'JPY', createdAt: 1 },
      { id: uid(), type: 'hotel', title: ja ? '町家ステイ 祇園' : 'Machiya Stay Gion', start: a, startTime: '15:00', end: shiftDate(a, 2), endTime: '10:00', price: 38000, currency: 'JPY', createdAt: 2 },
    ],
    checklist: [],
    journal: {
      [a]: { text: ja ? '朝の新幹線で富士山がきれいに見えた。夜は先斗町で湯豆腐。' : 'Saw Mt Fuji from the train. Yudofu in Pontocho at night.' },
      [shiftDate(a, 1)]: { text: ja ? '伏見稲荷を早朝に。人が少なくて最高だった。帰りに抹茶と和菓子。' : 'Fushimi Inari at dawn — almost empty, magical. Matcha and wagashi on the way back.', photos: ['asset:matcha'] },
    },
    createdAt: Date.now() - 1,
  };
}
function londonSample(st: Settings): Trip {
  const ja = st.lang === 'ja';
  const a = shiftDate(todayStr(), -95);
  return {
    id: uid(),
    name: ja ? 'ロンドン 3日間' : 'London, 3 days',
    emoji: '#D6336C',
    cover: 'asset:london',
    members: [{ id: 'me', name: st.myName || t('me') }],
    bookings: [
      { id: uid(), type: 'flight', title: 'NH 211', start: a, startTime: '11:40', endTime: '16:35', from: 'HND', to: 'LHR', code: '5Y8K2M', seat: '34K', price: 128400, currency: 'JPY', createdAt: 1 },
      { id: uid(), type: 'hotel', title: 'The Hoxton, Holborn', start: a, startTime: '15:00', end: shiftDate(a, 3), endTime: '12:00', from: '199-206 High Holborn, London', price: 540, currency: 'GBP', createdAt: 2 },
      { id: uid(), type: 'plan', title: ja ? '大英博物館' : 'British Museum', start: shiftDate(a, 1), startTime: '10:00', endTime: '13:00', from: 'Great Russell St, London', createdAt: 3 },
    ],
    checklist: [],
    journal: {
      [a]: { text: ja ? '機内から見た夕焼けが最高だった。' : 'The sunset from the plane was stunning.', photos: ['asset:window'] },
      [shiftDate(a, 1)]: { text: ja ? '朝はカフェでクロワッサン。雨上がりの街がきれいだった。夜はパブでフィッシュアンドチップス。' : 'Croissant at a cafe in the morning. The streets after the rain were lovely. Fish and chips at a pub.', photos: ['asset:croissant'] },
    },
    createdAt: Date.now() - 2,
  };
}
function sampleTrip(st: Settings): Trip {
  const base = shiftDate(todayStr(), 20);
  const d = (n: number) => shiftDate(base, n);
  const ja = st.lang === 'ja';
  return {
    id: uid(),
    name: ja ? 'パリ 3泊' : 'Paris, 3 nights',
    emoji: '#FF5B3A',
    cover: 'asset:paris',
    members: [
      { id: 'me', name: st.myName || t('me') },
      { id: 'm2', name: ja ? 'ゆき' : 'Yuki' },
    ],
    bookings: [
      { id: uid(), type: 'train', title: 'Eurostar', start: d(0), startTime: '08:31', endTime: '11:47', from: 'London St Pancras', to: 'Paris Gare du Nord', code: 'QXK7PL', seat: 'Coach 7 / 63, 64', price: 208, currency: 'GBP', paidBy: 'me', createdAt: 1 },
      { id: uid(), type: 'hotel', title: 'Hotel Le Marais', start: d(0), startTime: '15:00', end: d(3), endTime: '11:00', from: '12 Rue de Rivoli, Paris', code: '4821.339.112', price: 420, currency: 'EUR', paidBy: 'm2', createdAt: 2 },
      { id: uid(), type: 'ticket', title: ja ? 'ルーヴル美術館' : 'Louvre Museum', start: d(1), startTime: '10:00', code: 'LV-55219', price: 44, currency: 'EUR', paidBy: 'me', createdAt: 3 },
      { id: uid(), type: 'food', title: 'Le Comptoir', start: d(1), startTime: '19:30', memo: ja ? '2名・窓側' : 'Table for 2', createdAt: 4 },
      { id: uid(), type: 'plan', title: ja ? 'セーヌ川クルーズ' : 'Seine river cruise', start: d(1), startTime: '16:00', endTime: '17:00', from: 'Port de la Bourdonnais', createdAt: 7 },
      { id: uid(), type: 'car', title: 'Europcar', start: d(2), startTime: '09:00', end: d(2), endTime: '18:00', from: 'Paris Gare de Lyon', code: 'EC9921034', price: 89, currency: 'EUR', paidBy: 'm2', createdAt: 5 },
      { id: uid(), type: 'train', title: 'Eurostar', start: d(3), startTime: '17:13', endTime: '18:30', from: 'Paris Gare du Nord', to: 'London St Pancras', code: 'QXK7PL', price: 196, currency: 'GBP', paidBy: 'me', createdAt: 6 },
    ],
    checklist: t('defaultPack')
      .split(',')
      .map((x) => ({ id: uid(), text: x, done: false })),
    budget: 250000,
    expenses: [
      { id: uid(), title: ja ? 'カフェで朝ごはん' : 'Breakfast at a cafe', cat: 'meal', amount: 18.5, currency: 'EUR', date: d(1), paidBy: 'me' },
      { id: uid(), title: ja ? 'メトロ 回数券' : 'Metro tickets', cat: 'move', amount: 21.5, currency: 'EUR', date: d(1), paidBy: 'm2' },
      { id: uid(), title: ja ? 'マルシェでおみやげ' : 'Souvenirs at the market', cat: 'shop', amount: 46, currency: 'EUR', date: d(2), paidBy: 'me' },
    ],
    createdAt: Date.now(),
  };
}

const s = StyleSheet.create({
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontSize: 11, fontWeight: '800', color: C.sub, letterSpacing: 1.2 },
  appTitle: { fontSize: 30, fontWeight: '900', color: C.ink, letterSpacing: -0.8 },
  logoBig: { width: 88, height: 88, borderRadius: 28, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  gear: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  sec: { fontSize: 11, fontWeight: '800', color: C.sub, letterSpacing: 1.4, marginTop: 26, marginBottom: 10 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.line },
  hint: { fontSize: 12.5, color: C.sub, fontWeight: '600' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  ghostBtnText: { fontWeight: '800', fontSize: 13, color: C.ink },
  smallBtn: { backgroundColor: C.ink, borderRadius: 14, paddingHorizontal: 16, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  tripCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 20, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  tripName: { fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  tripTotal: { fontSize: 14, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  status: { fontSize: 11.5, fontWeight: '800', color: C.sub },
  // 搭乗券風のカード
  pass: { backgroundColor: C.ink, borderRadius: 26, padding: 20, overflow: 'hidden' },
  passTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  passKicker: { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 1.3 },
  passWhen: { color: C.pink, fontWeight: '800', fontSize: 12 },
  passRoute: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 10 },
  passCity: { flex: 1, color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  passLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 0.8 },
  passDash: { flex: 1, height: 1, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderStyle: 'dashed' },
  passTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 16, letterSpacing: -0.4 },
  passSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700', marginTop: 4 },
  perf: { height: 26, justifyContent: 'center', marginVertical: 10, marginHorizontal: -20 },
  perfLine: { marginHorizontal: 24, borderTopWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', borderStyle: 'dashed' },
  notch: { position: 'absolute', width: 40, height: 26, borderRadius: 13, backgroundColor: C.bg },
  passGrid: { flexDirection: 'row', gap: 12 },
  passK: { color: 'rgba(255,255,255,0.5)', fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  passV: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 3 },
  passCode: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 3, marginTop: 2, fontVariant: ['tabular-nums'] },
  passTrip: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', marginTop: 14 },
  tripHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  tripHeadName: { fontSize: 20, fontWeight: '900', color: C.ink, letterSpacing: -0.4 },
  tabs: { flexDirection: 'row', marginHorizontal: 20, marginTop: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  tab: { flex: 1, paddingTop: 10, alignItems: 'center' },
  tabBar: { height: 2.5, width: '60%', marginTop: 9, borderRadius: 2, backgroundColor: 'transparent' },
  tabText: { fontWeight: '800', color: C.sub, fontSize: 14 },
  dayN: { fontSize: 22, fontWeight: '900', color: C.ink, letterSpacing: -0.5 },
  dayDate: { fontSize: 13, fontWeight: '700', color: C.sub },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  tlLine: { borderTopWidth: 1, borderTopColor: C.line },
  tlTime: { fontWeight: '800', color: C.ink, fontSize: 13, marginTop: 14, fontVariant: ['tabular-nums'] },
  tlDotSmall: { width: 10, height: 10, borderRadius: 5, borderWidth: 2.5, backgroundColor: C.bg, marginTop: 17 },
  tlRail: { flex: 1, width: 1.5, backgroundColor: C.line, marginTop: 2 },
  addPlan: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 78, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, alignSelf: 'flex-start' },
  addPlanText: { color: C.sub, fontWeight: '700', fontSize: 13 },
  tlCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 12, marginLeft: 8, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  tlTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  tlEdge: { fontSize: 11.5, fontWeight: '800', marginTop: 1 },
  tlCode: { fontSize: 12, fontWeight: '800', color: C.ink, marginTop: 4, letterSpacing: 1, opacity: 0.55 },
  price: { fontSize: 14, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  barBg: { height: 6, borderRadius: 3, backgroundColor: C.chip, marginTop: 6, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.chip, borderRadius: 20, paddingLeft: 4, paddingRight: 12, paddingVertical: 4 },
  chipText: { fontWeight: '800', color: C.ink, fontSize: 13 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: '#CFCAC2', alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 34, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.ink, borderRadius: 30, paddingHorizontal: 24, paddingVertical: 16, ...shadow, shadowOpacity: 0.2 },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(21,23,28,0.35)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10 },
  sheetTop: { height: 40, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D6D2CB' },
  closeBtn: { position: 'absolute', right: -6, top: 0, width: 42, height: 42, borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 24, fontWeight: '900', color: C.ink, marginBottom: 14, letterSpacing: -0.5 },
  input: { minWidth: 0, backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.ink, fontWeight: '700', borderWidth: 1, borderColor: C.line },
  label: { fontSize: 11, fontWeight: '800', color: C.sub, marginTop: 14, marginBottom: 6, letterSpacing: 0.6 },
  primary: { backgroundColor: C.ink, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondary: { flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: C.card, borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  secondaryText: { color: C.ink, fontWeight: '800', fontSize: 14 },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchOn: { borderWidth: 3, borderColor: C.bg, outlineWidth: 2, outlineColor: C.ink, transform: [{ scale: 1.1 }] } as any,
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  optIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  note: { backgroundColor: C.mintSoft, borderRadius: 14, padding: 12, marginBottom: 12 },
  noteText: { color: '#17795A', fontWeight: '800', fontSize: 13 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 11, paddingVertical: 7 },
  two: { flexDirection: 'row', gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  dateBtn: { paddingHorizontal: 8, paddingVertical: 12 },
  dateBtnText: { fontSize: 18, fontWeight: '900', color: C.ink },
  dateInput: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 13, fontWeight: '800', color: C.ink, paddingVertical: 10 },
  curBtn: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, justifyContent: 'center', minHeight: 48 },
  curWrap: { flex: 1, backgroundColor: 'rgba(21,23,28,0.35)', justifyContent: 'center', padding: 40 },
  curList: { backgroundColor: C.bg, borderRadius: 22, maxHeight: '70%', padding: 8 },
  curRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12 },
  thumb: { width: 76, height: 110, borderRadius: 12, backgroundColor: '#eee' },
  thumbAdd: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  detailTitle: { fontSize: 24, fontWeight: '900', color: C.ink, letterSpacing: -0.5, marginTop: 2 },
  codeBig: { backgroundColor: C.card, borderRadius: 20, padding: 18, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: C.line },
  codeBigText: { fontSize: 32, fontWeight: '900', color: C.ink, letterSpacing: 3, marginVertical: 6 },
  infoRow: { flexDirection: 'row', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line, gap: 10 },
  infoK: { width: 100, fontSize: 12, fontWeight: '700', color: C.sub },
  infoV: { flex: 1, fontSize: 14, fontWeight: '800', color: C.ink },
  camBadge: { position: 'absolute', right: -6, bottom: -6, width: 28, height: 28, borderRadius: 14, backgroundColor: C.ink, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  mapBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  expIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  yearCard: { backgroundColor: C.ink, borderRadius: 24, padding: 18 },
  yearNum: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  yearShare: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  year: { fontSize: 20, fontWeight: '900', color: C.ink, marginBottom: 10, marginTop: 4, letterSpacing: -0.3 },
  memCard: { width: 210, height: 260, borderRadius: 22, overflow: 'hidden', backgroundColor: C.ink, marginBottom: 16 },
  memShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, backgroundColor: 'rgba(0,0,0,0.38)' },
  memName: { color: '#fff', fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  memSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', marginTop: 3 },
  memThumb: { width: 96, height: 96, borderRadius: 14, backgroundColor: C.chip },
  journal: { marginLeft: 52, marginTop: 2, backgroundColor: C.card, borderRadius: 18, padding: 12, gap: 10, borderWidth: 1, borderColor: C.line },
  journalEmpty: { marginLeft: 52, marginTop: 2, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' },
  journalPhoto: { width: 120, height: 120, borderRadius: 12, backgroundColor: C.chip },
  journalText: { fontSize: 14, color: C.ink, fontWeight: '600', lineHeight: 21 },
  photoBig: { width: 150, height: 230, borderRadius: 14, backgroundColor: '#eee' },
});
