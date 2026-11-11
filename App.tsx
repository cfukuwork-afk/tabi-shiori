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
  useWindowDimensions,
  useColorScheme,
  AppState,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { openMap, openRoute, placeQuery, setMapApp, tripCity } from './src/maps';
import { bookingTz, arrivalTz, fillTimezones, geocode } from './src/geo';
import { estimate, fmtKm } from './src/eta';
import MapTab, { tripStops } from './src/MapTab';
import { fetchMeta, firstUrl, platformOf } from './src/wish';
import { stamp, mergeTrip } from './src/merge';
import { fetchShared, loadPhotoMap, localPhoto, normCode, prettyCode, startShare, syncTrip } from './src/sync';
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
  Wish,
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
  expHome,
  typeOf,
  uid,
} from './src/data';
import { prettyDate, setLang, t, typeName } from './src/i18n';
import { parseBooking } from './src/parse';
import { CURRENCIES, CUR_COUNTRIES, findCurrency } from './src/currencies';
import { C, applyTheme, cleanNum, isDark, shadow } from './src/theme';
import { restyleMap } from './src/MapTab';
import { ocrAvailable, recognizeReceipt } from './modules/receipt-ocr';
import { askPermission, rescheduleAll } from './src/notify';
import { toMyTime, tzToMyTime, localToDate } from './src/airports';
import { Directory, File as FSFile, Paths } from 'expo-file-system';
import * as ExpoLinking from 'expo-linking';
import { tripWeather, wxIcon, TripWx } from './src/weather';
import { exportShioriPdf, exportSettleCsv, exportSettlePdf } from './src/exporters';
import { exportBackup, importBackup, mergeBackup } from './src/backup';
import { findPrice } from './src/parse';
import { parseItinerary, PlanDraft } from './src/itinerary';
import { SERVER } from './src/sync';
import { InboxItem } from './src/data';
import { isPdf, isPkpass, keepFile, readPkpass, TicketFile } from './src/pkpass';
import { pickAnyFile } from './src/files';
import * as Sharing from 'expo-sharing';
import { activityLinks, hotelLinks, FindLink } from './src/affiliate';
import { syncTripActivity, updateNextWidget, widgetsAvailable } from './src/liveWidgets';

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
/** 予約の種類ごとの「場所」欄の名前。2つ目が null なら到着地の欄は出さない */
const placeLabels = (ty: BookingType): [string, string | null] =>
  ty === 'flight' ? [t('fromAirport'), t('toAirport')]
  : ty === 'train' || ty === 'bus' ? [t('fromStation'), t('toStation')]
  : ty === 'car' ? [t('pickupAt'), t('returnAt')]
  : ty === 'plan' ? [t('place'), null]
  : [t('address'), null];
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

type AddInitial = { file?: { name: string; uri: string; mime?: string }; text?: string; image?: string; planDate?: string; planTitle?: string; planMemo?: string; planFrom?: string; inboxId?: string };
/** アプリに入れてある写真（お試し旅行の表紙） */
const BUNDLED: Record<string, any> = {
  'asset:paris': require('./assets/covers/paris.jpg'),
  'asset:kyoto': require('./assets/covers/kyoto.jpg'),
  'asset:london': require('./assets/covers/london.jpg'),
  'asset:matcha': require('./assets/covers/matcha.jpg'),
  'asset:window': require('./assets/covers/window.jpg'),
  'asset:croissant': require('./assets/covers/croissant.jpg'),
  'asset:ticket': require('./assets/covers/ticket.jpg'),
};
const imgSrc = (u: string) => BUNDLED[u] ?? { uri: localPhoto(u) };

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const Icon = ({ name, size = 18, color = C.ink }: { name: string; size?: number; color?: string }) => (
  <Ionicons name={name as IconName} size={size} color={color} />
);
/** 種類のアイコン（四角の中にアイコン） */
const TypeBadge = ({ type, size = 38 }: { type: BookingType; size?: number }) => {
  const ty = typeOf(type);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: isDark() ? ty.color + '33' : ty.soft, alignItems: 'center', justifyContent: 'center' }}>
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
/** 読み取った文字を、上から順・同じ高さは左から順に並べて行にする */
function rowsOf(lines: { text: string; x: number; y: number; h: number }[]) {
  const sorted = [...lines].sort((a, c) => (Math.abs(a.y - c.y) < Math.min(a.h, c.h) * 0.5 ? a.x - c.x : a.y - c.y));
  const rows: string[] = [];
  let lastY = -1;
  sorted.forEach((l) => {
    if (lastY >= 0 && Math.abs(l.y - lastY) < l.h * 0.5) rows[rows.length - 1] += ' ' + l.text;
    else rows.push(l.text);
    lastY = l.y;
  });
  return rows;
}
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
  const [adding, setAdding] = useState<{ tripId: string; edit?: Booking; initial?: AddInitial } | null>(null);
  const [detail, setDetail] = useState<{ tripId: string; id: string } | null>(null);
  const [incoming, setIncoming] = useState<{ text?: string; image?: string; file?: { name: string; uri: string; mime?: string } } | null>(null);
  const [wishIn, setWishIn] = useState<{ tripId: string; url: string } | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null); // 共有コード（空文字なら入力から）
  // SNSのリンクだけが送られてきたときは「行きたい場所」に入れる（予約メールではない）
  const linkOnly = (x: { text?: string; image?: string } | null) => {
    const u = firstUrl(x?.text);
    if (!u || x?.image) return undefined;
    const rest = (x!.text ?? '').replace(u, '').trim();
    return rest.length < 120 && !/(予約|booking|confirmation|reservation|check-?in|搭乗|便)/i.test(rest) ? u : undefined;
  };
  const [settleIn, setSettleIn] = useState<{ n: string; c: string; p: { f: string; t: string; a: number }[] } | null>(null);
  const url = ExpoLinking.useURL();
  useEffect(() => {
    if (url && url.includes('join?c=')) {
      setJoining(normCode(url.split('join?c=')[1] ?? ''));
      return;
    }
    if (!url || !url.includes('settle?d=')) return;
    try {
      setSettleIn(JSON.parse(decodeURIComponent(url.split('settle?d=')[1])));
    } catch {}
  }, [url]);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({ disabled: !SHARE_NATIVE });
  useEffect(() => {
    if (!hasShareIntent) return;
    const img = shareIntent.files?.find((f) => f.mimeType?.startsWith('image'))?.path;
    const doc = shareIntent.files?.find((f) => isPdf(f.fileName, f.mimeType) || isPkpass(f.fileName, f.mimeType));
    const text = shareIntent.text ?? undefined;
    if (doc) setIncoming({ file: { name: doc.fileName ?? 'ticket', uri: doc.path, mime: doc.mimeType ?? undefined } });
    else if (img || text) setIncoming({ text, image: img });
    resetShareIntent();
  }, [hasShareIntent]);
  useEffect(() => {
    if (ready) rescheduleAll(trips, settings.notify);
  }, [trips, settings.notify, settings.lang, ready]);
  // ホーム画面ウィジェット・ロック画面のライブアクティビティ（App Store 版のみ）
  useEffect(() => {
    if (!ready || !widgetsAvailable) return;
    const tm = setTimeout(() => {
      updateNextWidget(trips);
      syncTripActivity(trips);
    }, 800);
    return () => clearTimeout(tm);
  }, [trips, settings.lang, ready]);
  useEffect(() => {
    if (!widgetsAvailable) return;
    const sub = AppState.addEventListener('change', (st) => st === 'active' && (updateNextWidget(tripsRef.current), syncTripActivity(tripsRef.current)));
    return () => sub.remove();
  }, []);

  setLang(settings.lang);
  setMapApp(settings.mapApp ?? 'ask');
  // ダークモード（設定：自動・ライト・ダーク）
  const scheme = useColorScheme();
  const dark = settings.theme === 'dark' || (settings.theme !== 'light' && scheme === 'dark');
  if (dark !== isDark()) {
    applyTheme(dark);
    s = makeStyles();
    restyleMap();
  }

  useEffect(() => {
    (async () => {
      const [tr0, st] = await Promise.all([loadTrips(), loadSettings(), loadPhotoMap()]);
      let tr = tr0;
      // 【確認用・一時的】Expo Go にお試し旅行を1回だけ入れる（TestFlight に出す前に消す）
      if (st.onboarded && !(await AsyncStorage.getItem('ts.demo.once.v1'))) {
        await AsyncStorage.setItem('ts.demo.once.v1', '1');
        setLang(st.lang);
        tr = [sampleTrip(st), pastSample(st), londonSample(st), ...tr];
        saveTrips(tr);
      }
      setTrips(tr);
      setSettings(st);
      setRate(await loadRate(st.home));
      setReady(true);
      const fresh = await fetchRates(st.home);
      if (fresh) setRate(fresh);
    })();
  }, []);

  // 手元での変更：変わった項目に時刻をつける（共有した旅行のまとめに使う）
  const editSeq = useRef<Record<string, number>>({});
  const updateTrips = (fn: (t: Trip[]) => Trip[]) =>
    setTrips((prev) => {
      const next = fn(prev).map((tr) => {
        const before = prev.find((x) => x.id === tr.id);
        if (!before || before === tr) return tr;
        const st = stamp(before, tr);
        if (st.share && st !== tr) editSeq.current[tr.id] = (editSeq.current[tr.id] ?? 0) + 1;
        return st;
      });
      saveTrips(next);
      return next;
    });
  // サーバーから来た版を、手元の変更とまとめて入れる（時刻はつけ直さない）
  const applyRemote = (id: string, remote: Trip, rev: number, seqAtStart: number) =>
    setTrips((prev) => {
      const next = prev.map((tr) => {
        if (tr.id !== id || !tr.share) return tr;
        const merged = mergeTrip(remote, tr);
        const stillDirty = (editSeq.current[id] ?? 0) !== seqAtStart;
        return { ...merged, share: { ...tr.share, rev, dirty: stillDirty, syncedAt: Date.now() } };
      });
      saveTrips(next);
      return next;
    });
  const tripsRef = useRef(trips);
  tripsRef.current = trips;
  const syncing = useRef(false);
  const syncAll = async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      for (const tr of tripsRef.current.filter((x) => x.share)) {
        const seq = editSeq.current[tr.id] ?? 0;
        try {
          const r = await syncTrip(tr);
          if (r) applyRemote(tr.id, r.trip, r.rev, seq);
        } catch {}
      }
    } finally {
      syncing.current = false;
    }
  };
  // 共有した旅行は、開いている間ずっと数秒ごとに合わせる
  useEffect(() => {
    if (!ready) return;
    syncAll();
    const iv = setInterval(() => AppState.currentState === 'active' && syncAll(), 8000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && syncAll());
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [ready]);
  // 手元で変えたら少し待って送る
  const dirtyKey = trips.filter((x) => x.share?.dirty).map((x) => x.id + (editSeq.current[x.id] ?? 0)).join('|');
  useEffect(() => {
    if (!dirtyKey) return;
    const tm = setTimeout(syncAll, 1500);
    return () => clearTimeout(tm);
  }, [dirtyKey]);
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
    <View key={dark ? 'dark' : 'light'} style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
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
          onAddPlan={(d, extra) => setAdding({ tripId: trip.id, initial: { planDate: d, ...(extra ?? {}) } })}
          onShare={() => setSharing(trip.id)}
          onOpen={(b) => setDetail({ tripId: trip.id, id: b.id })}
          onInbox={(it) => setAdding({ tripId: trip.id, initial: { text: it.text, image: it.image, inboxId: it.id } })}
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
        onJoin={() => {
          setNewTrip(false);
          setJoining('');
        }}
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
            const link = linkOnly(incoming);
            if (id && link) {
              setOpenId(id);
              setWishIn({ tripId: id, url: link });
            } else if (id) {
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
              if (link) setWishIn({ tripId: tr.id, url: link });
              else setAdding({ tripId: tr.id, initial: incoming });
            }
            setIncoming(null);
          }}
        />
      )}

      {sharing && trips.some((x) => x.id === sharing) && (
        <ShareSheet
          trip={trips.find((x) => x.id === sharing)!}
          onClose={() => setSharing(null)}
          onShared={(tr) => setTrips((prev) => { const next = prev.map((x) => (x.id === tr.id ? tr : x)); saveTrips(next); return next; })}
          onStop={() => {
            setTrips((prev) => {
              const next = prev.map((x) => (x.id === sharing ? { ...x, share: undefined } : x));
              saveTrips(next);
              return next;
            });
          }}
        />
      )}
      {joining !== null && (
        <JoinSheet
          initialCode={joining}
          myName={settings.myName}
          onClose={() => setJoining(null)}
          onJoin={(tr) => {
            setTrips((prev) => {
              const next = [tr, ...prev.filter((x) => x.id !== tr.id)];
              saveTrips(next);
              return next;
            });
            setJoining(null);
            setOpenId(tr.id);
          }}
        />
      )}
      {wishIn && (
        <WishSheet
          initialUrl={wishIn.url}
          onClose={() => setWishIn(null)}
          onSave={(w) => {
            updateTrip(wishIn.tripId, (tr) => ({ ...tr, wishes: [w, ...(tr.wishes ?? [])] }));
            setWishIn(null);
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
            const inboxId = adding.initial?.inboxId;
            updateTrip(adding.tripId, (tr) => ({
              ...tr,
              bookings: tr.bookings.some((x) => x.id === b.id) ? tr.bookings.map((x) => (x.id === b.id ? b : x)) : [...tr.bookings, b],
              inbox: inboxId ? (tr.inbox ?? []).filter((x) => x.id !== inboxId) : tr.inbox,
            }));
            setAdding(null);
          }}
          onSaveMany={(list) => {
            updateTrip(adding.tripId, (tr) => ({ ...tr, bookings: [...tr.bookings, ...list] }));
            setAdding(null);
          }}
          onLater={(src) => {
            if (!adding.initial?.inboxId) {
              const it: InboxItem = { id: uid(), text: src.text, image: src.image, at: Date.now() };
              updateTrip(adding.tripId, (tr) => ({ ...tr, inbox: [it, ...(tr.inbox ?? [])] }));
            }
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
          onUpdate={(nb) => updateTrip(detailTrip.id, (tr) => ({ ...tr, bookings: tr.bookings.map((x) => (x.id === nb.id ? nb : x)) }))}
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

      <SettingsSheet
        visible={showSettings}
        settings={settings}
        onClose={() => setShowSettings(false)}
        onChange={changeSettings}
        onBackup={() => exportBackup(trips)}
        onRestore={async () => {
          const got = await importBackup();
          if (!got) return 0;
          updateTrips((all) => mergeBackup(all, got));
          return got.length;
        }}
      />

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
  const [tickets, setTickets] = useState<string[] | null>(null);
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
      {tickets && <TicketViewer photos={tickets} onClose={() => setTickets(null)} />}
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
        <NextCard next={next} onPress={() => onOpenBooking(next.trip.id, next.item.booking.id)} onTickets={() => setTickets(next.item.booking.photos ?? null)} />
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
            <Icon name="share-outline" size={16} color="#15171C" />
            <Text style={[s.chipText, { color: '#15171C' }]}>{t('share')}</Text>
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
                      <Text style={s.memName} numberOfLines={2}>
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
        <Text style={s.tripName} numberOfLines={2}>
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

/** チケット・QRを全画面で見せる（画面を明るくして読み取りやすく） */
function TicketViewer({ photos, start = 0, onClose }: { photos: string[]; start?: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [i, setI] = useState(start);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let prev: number | null = null;
    let B: any = null;
    try {
      B = require('expo-brightness');
      B.getBrightnessAsync().then((v: number) => {
        prev = v;
        B.setBrightnessAsync(1).catch(() => {});
      });
    } catch {}
    return () => {
      if (B && prev !== null) B.setBrightnessAsync(prev).catch(() => {});
    };
  }, []);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: start * width, y: 0 }}
          onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {photos.map((p) => (
            <Image key={p} source={imgSrc(p)} style={{ width, height }} resizeMode="contain" />
          ))}
        </ScrollView>
        <Pressable onPress={onClose} hitSlop={14} style={s.viewerClose}>
          <Icon name="close" size={22} color="#fff" />
        </Pressable>
        {photos.length > 1 && <Text style={s.viewerCount}>{`${i + 1} / ${photos.length}`}</Text>}
      </View>
    </Modal>
  );
}

function NextCard({ next, onPress, onTickets }: { next: NonNullable<ReturnType<typeof nextUp>>; onPress: () => void; onTickets?: () => void }) {
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
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
        <Text style={[s.passTrip, { flex: 1, marginTop: 0 }]} numberOfLines={1}>
          {next.trip.name}
        </Text>
        {!!b.photos?.length && onTickets && (
          <Pressable onPress={onTickets} hitSlop={8} style={s.ticketPill}>
            <Icon name="qr-code" size={14} color="#15171C" />
            <Text style={s.ticketPillText}>{t('showTicket')}</Text>
          </Pressable>
        )}
      </View>
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
    <Text style={s.passV} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
      {v}
    </Text>
  </View>
);
const greeting = () => {
  const h = new Date().getHours();
  return h < 11 ? t('gMorning') : h < 18 ? t('gDay') : t('gEvening');
};

/* ---------------- 旅行の画面 ---------------- */
type Tab = 'plan' | 'bookings' | 'map' | 'money' | 'pack';
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
  onInbox,
}: {
  onInbox: (it: InboxItem) => void;
  onAddPlan: (date: string, extra?: { planTitle?: string; planMemo?: string; planFrom?: string }) => void;
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
  const [editing, setEditing] = useState(false);
  // 予約の現地タイムゾーンを調べて保存（通知や「自分の時間」の表示に使う）
  useEffect(() => {
    let off = false;
    fillTimezones(trip).then((found) => {
      if (off || !Object.keys(found).length) return;
      onChange((tr) => ({ ...tr, bookings: tr.bookings.map((b) => (found[b.id] && !b.tz ? { ...b, tz: found[b.id] } : b)) }));
    });
    return () => {
      off = true;
    };
  }, [trip.bookings.map((b) => b.id + (b.from ?? '') + (b.tz ?? '')).join('|')]);
  useEffect(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), [tab]);
  const [journalDay, setJournalDay] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [wx, setWx] = useState<TripWx | null>(null);
  const wxKey = tripRange(trip).start + '|' + tripRange(trip).end + '|' + trip.bookings.filter((b) => b.type === 'hotel' || b.type === 'flight').map((b) => (b.from ?? '') + (b.to ?? '')).join(',');
  useEffect(() => {
    let off = false;
    tripWeather(trip).then((w) => !off && setWx(w));
    return () => {
      off = true;
    };
  }, [trip.id, wxKey]);
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
            <Icon name="camera" size={10} color={C.onInk} />
          </View>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => setEditing(true)} accessibilityHint={t('tapToRename')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[s.tripHeadName, { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {trip.name}
            </Text>
            <Icon name="pencil" size={13} color={C.sub} />
          </View>
          <Text style={s.hint}>
            {start ? `${prettyDate(start)}${end && end !== start ? ' 〜 ' + prettyDate(end) : ''}` : t('undated')}
            {total > 0 ? `  ・  ${fmtMoney(Math.round(total), rate.base)}` : ''}
          </Text>
        </Pressable>
        <Pressable onPress={onShare} hitSlop={12} style={s.back}>
          <Icon name="share-outline" size={19} />
        </Pressable>
      </View>
      <View style={s.tabs}>
        {(['plan', 'bookings', 'map', 'money', 'pack'] as Tab[]).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={s.tab}>
            <Text style={[s.tabText, tab === k && { color: C.ink }]}>
              {k === 'plan' ? t('tabPlan') : k === 'bookings' ? t('tabBookings') : k === 'map' ? t('tabMap') : k === 'money' ? t('tabMoney') : t('tabPack')}
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
        {tab === 'plan' && (
          <WishSection
            trip={trip}
            onChange={onChange}
            onToPlan={(w) => onAddPlan(tripDays(trip)[0] ?? todayStr(), { planTitle: w.title, planMemo: [w.url, w.memo].filter(Boolean).join('\n') || undefined })}
          />
        )}
        {tab === 'plan' && <PlanTab trip={trip} wx={wx} onOpen={onOpen} onJournal={setJournalDay} onAddPlan={onAddPlan} />}
        {tab === 'bookings' && (
          <BookingsTab trip={trip} rate={rate} onOpen={onOpen} onInbox={onInbox} onDropInbox={(id) => onChange((tr) => ({ ...tr, inbox: (tr.inbox ?? []).filter((x) => x.id !== id) }))} />
        )}
        {tab === 'map' && <MapTab trip={trip} onOpen={onOpen} />}
        {tab === 'money' && <MoneyTab trip={trip} rate={rate} onChange={onChange} />}
        {tab === 'pack' && <PackTab trip={trip} onChange={onChange} />}
        <Pressable onPress={() => (sure ? onDelete() : setSure(true))} style={{ alignSelf: 'center', marginTop: 30 }}>
          <Text style={{ color: sure ? C.pink : C.sub, fontWeight: '700' }}>{sure ? t('deleteSure') : t('deleteTrip')}</Text>
        </Pressable>
      </ScrollView>
      {(tab === 'plan' || tab === 'bookings') && (
        <Pressable style={({ pressed }) => [s.fab, pressed && { transform: [{ scale: 0.97 }] }]} onPress={onAdd}>
          <Icon name="add" size={20} color={C.onInk} />
          <Text style={s.fabText}>{t('addBooking')}</Text>
        </Pressable>
      )}
      <NewTripSheet
        visible={editing}
        edit={trip}
        onClose={() => setEditing(false)}
        onCreate={(name, color, cover) => {
          onChange((tr) => ({ ...tr, name, emoji: color, cover }));
          setEditing(false);
        }}
      />
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

/* ---------------- 共有（一緒に編集） ---------------- */
function ShareSheet({ trip, onClose, onShared, onStop }: { trip: Trip; onClose: () => void; onShared: (t: Trip) => void; onStop: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);
  const code = trip.share?.code;
  const meId = trip.myId ?? trip.members.find((m) => m.id === 'me')?.id ?? trip.members[0]?.id;
  const meName = trip.members.find((m) => m.id === meId)?.name ?? '';
  const generic = (n: string) => !n.trim() || n === '自分' || n.toLowerCase() === 'me';
  const [myName, setMyName] = useState(generic(meName) ? '' : meName);
  const invite = code ? t('inviteText', { name: trip.name, code: prettyCode(code), link: `${SERVER}/j/${code}` }) : '';
  const [pdfBusy, setPdfBusy] = useState(false);
  return (
    <Sheet visible onClose={onClose}>
      <Text style={s.sheetTitle}>{t('shareTitle')}</Text>
      <Text style={[s.kicker, { marginBottom: 8 }]}>{t('coEdit').toUpperCase()}</Text>
      {!code ? (
        <>
          <Text style={[s.hint, { lineHeight: 20, marginBottom: 12 }]}>{t('coEditHint')}</Text>
          <Text style={s.label}>{t('yourNameShown')}</Text>
          <TextInput style={[s.input, { marginBottom: 12 }]} value={myName} onChangeText={setMyName} placeholder={t('myName')} placeholderTextColor={C.sub} />
          <Pressable
            style={[s.primary, { marginTop: 0 }, (busy || !myName.trim()) && { opacity: 0.4 }]}
            disabled={busy || !myName.trim()}
            onPress={async () => {
              setBusy(true);
              setErr('');
              try {
                const named = { ...trip, myId: meId, members: trip.members.map((m) => (m.id === meId ? { ...m, name: myName.trim(), u: Date.now() } : m)) };
                onShared(await startShare(named));
              } catch {
                setErr(t('netErr'));
              }
              setBusy(false);
            }}
          >
            {busy ? <ActivityIndicator color={C.onInk} /> : <Text style={s.primaryText}>{t('makeCode')}</Text>}
          </Pressable>
        </>
      ) : (
        <View style={[s.card, { alignItems: 'center' }]}>
          <Text style={s.hint}>{t('shareCode')}</Text>
          <Text style={s.codeBigText} selectable>
            {prettyCode(code)}
          </Text>
          <Text style={[s.hint, { fontSize: 11, marginTop: 4 }]}>
            {trip.share?.syncedAt ? `${t('synced')} ${new Date(trip.share.syncedAt).toLocaleTimeString().slice(0, 5)}` : ''}
            {trip.share?.dirty ? `  ・  ${t('pending')}` : ''}
          </Text>
          <Pressable style={[s.primary, { alignSelf: 'stretch' }]} onPress={() => Share.share({ message: invite })}>
            <Text style={s.primaryText}>{t('sendCode')}</Text>
          </Pressable>
          <Pressable onPress={() => (sure ? (onStop(), onClose()) : setSure(true))} style={{ marginTop: 14 }}>
            <Text style={{ color: sure ? C.pink : C.sub, fontWeight: '700' }}>{sure ? t('stopShareSure') : t('stopShare')}</Text>
          </Pressable>
        </View>
      )}
      {!!err && <Text style={[s.hint, { color: C.pink, marginTop: 8 }]}>{err}</Text>}
      <Text style={[s.kicker, { marginTop: 22, marginBottom: 8 }]}>{t('shareText').toUpperCase()}</Text>
      <Pressable
        style={[s.secondary, { marginBottom: 8 }, pdfBusy && { opacity: 0.5 }]}
        disabled={pdfBusy}
        onPress={async () => {
          setPdfBusy(true);
          try {
            await exportShioriPdf(trip, await tripWeather(trip).catch(() => null));
          } catch {}
          setPdfBusy(false);
        }}
      >
        {pdfBusy ? <ActivityIndicator color={C.ink} /> : <Icon name="print-outline" size={17} />}
        <Text style={s.secondaryText}>{t('sendPdf')}</Text>
      </Pressable>
      <Pressable style={[s.secondary]} onPress={() => Share.share({ message: itineraryText(trip) })}>
        <Icon name="document-text-outline" size={17} />
        <Text style={s.secondaryText}>{t('sendItinerary')}</Text>
      </Pressable>
    </Sheet>
  );
}

function JoinSheet({ initialCode, myName, onClose, onJoin }: { initialCode: string; myName: string; onClose: () => void; onJoin: (t: Trip) => void }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [found, setFound] = useState<{ trip: Trip; rev: number } | null>(null);
  const [name, setName] = useState(myName);
  const look = async (c = code) => {
    const n = normCode(c);
    if (n.length !== 8) return setErr(t('codeLen'));
    setBusy(true);
    setErr('');
    try {
      setFound(await fetchShared(n));
    } catch (e: any) {
      setErr(e?.status === 404 ? t('codeNotFound') : t('netErr'));
    }
    setBusy(false);
  };
  useEffect(() => {
    if (normCode(initialCode).length === 8) look(initialCode);
  }, []);
  const join = (myId: string, extra?: { id: string; name: string }) => {
    const tr = found!.trip;
    const members = extra ? [...tr.members, { ...extra, u: Date.now() }] : tr.members;
    onJoin({ ...tr, members, myId, share: { code: normCode(code), rev: found!.rev, dirty: !!extra, syncedAt: Date.now() } });
  };
  return (
    <Sheet visible onClose={onClose}>
      <Text style={s.sheetTitle}>{t('joinByCode')}</Text>
      {!found ? (
        <>
          <TextInput
            style={[s.input, { fontSize: 24, fontWeight: '900', letterSpacing: 4, textAlign: 'center' }]}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="XXXX-XXXX"
            placeholderTextColor={C.sub}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={() => look()}
          />
          <Pressable style={[s.primary, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => look()}>
            {busy ? <ActivityIndicator color={C.onInk} /> : <Text style={s.primaryText}>{t('findTrip')}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
            <Cover trip={found.trip} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={s.tlTitle}>{found.trip.name}</Text>
              <Text style={s.hint}>{t('nBookings', { n: found.trip.bookings.length })}</Text>
            </View>
          </View>
          <Text style={s.label}>{t('whoAreYou')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {found.trip.members.map((m) => (
              <Pressable key={m.id} onPress={() => join(m.id)} style={s.typeChip}>
                <Text style={s.chipText}>{m.name}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>{t('orAddMe')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} value={name} onChangeText={setName} placeholder={t('myName')} placeholderTextColor={C.sub} />
            <Pressable style={[s.smallBtn, !name.trim() && { opacity: 0.35 }]} disabled={!name.trim()} onPress={() => {
              const id = uid();
              join(id, { id, name: name.trim() });
            }}>
              <Icon name="add" size={20} color={C.onInk} />
            </Pressable>
          </View>
        </>
      )}
      {!!err && <Text style={[s.hint, { color: C.pink, marginTop: 8 }]}>{err}</Text>}
    </Sheet>
  );
}

/* ---------------- 行きたい場所 ---------------- */
function WishSection({ trip, onChange, onToPlan }: { trip: Trip; onChange: (fn: (t: Trip) => Trip) => void; onToPlan: (w: Wish) => void }) {
  const [edit, setEdit] = useState<Wish | 'new' | null>(null);
  const me = trip.myId ?? 'me';
  // いいねの多い順（同じなら新しい順）
  const list = [...(trip.wishes ?? [])].sort((a, b) => (b.likes?.length ?? 0) - (a.likes?.length ?? 0));
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={[s.sec, { marginTop: 0, marginBottom: 0 }]}>{`${t('wishes').toUpperCase()}${list.length ? `  ${list.length}` : ''}`}</Text>
        <Pressable onPress={() => setEdit('new')} hitSlop={8} style={s.addPlan}>
          <Icon name="add" size={15} color={C.sub} />
          <Text style={s.addPlanText}>{t('addWish')}</Text>
        </Pressable>
      </View>
      {list.length === 0 ? (
        <Text style={[s.hint, { fontSize: 12, lineHeight: 18 }]}>{t('wishHint')}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ flexGrow: 0 }}>
          {list.map((w) => {
            const pf = platformOf(w.url);
            const img = w.photos?.[0] ?? w.image;
            return (
              <Pressable key={w.id} style={s.wishCard} onPress={() => setEdit(w)}>
                {img ? (
                  <Image source={imgSrc(img)} style={s.wishImg} />
                ) : (
                  <View style={[s.wishImg, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon name={pf.icon} size={26} color={C.sub} />
                  </View>
                )}
                {trip.members.length > 1 && (
                  <Pressable
                    hitSlop={8}
                    style={s.likeBtn}
                    onPress={() =>
                      onChange((tr) => ({
                        ...tr,
                        wishes: (tr.wishes ?? []).map((x) => {
                          if (x.id !== w.id) return x;
                          const l = x.likes ?? [];
                          return { ...x, likes: l.includes(me) ? l.filter((i) => i !== me) : [...l, me] };
                        }),
                      }))
                    }
                  >
                    <Icon name={w.likes?.includes(me) ? 'heart' : 'heart-outline'} size={15} color={w.likes?.includes(me) ? C.pink : C.ink} />
                    {!!w.likes?.length && <Text style={s.likeText}>{w.likes.length}</Text>}
                  </Pressable>
                )}
                <View style={{ padding: 10 }}>
                  <Text style={s.wishTitle} numberOfLines={2}>
                    {w.title || pf.name}
                  </Text>
                  {!!w.likes?.length && trip.members.length > 1 && (
                    <Text style={[s.hint, { fontSize: 10, marginTop: 2 }]} numberOfLines={1}>
                      ♥ {w.likes.map((i) => trip.members.find((m) => m.id === i)?.name ?? '').filter(Boolean).join('・')}
                    </Text>
                  )}
                  {!!pf.name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Icon name={pf.icon} size={11} color={C.sub} />
                      <Text style={[s.hint, { fontSize: 11 }]} numberOfLines={1}>
                        {pf.name}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {edit && (
        <WishSheet
          city={tripCity(trip.bookings)}
          wish={edit === 'new' ? undefined : edit}
          onClose={() => setEdit(null)}
          onSave={(w) => {
            onChange((tr) => {
              const cur = tr.wishes ?? [];
              return { ...tr, wishes: cur.some((x) => x.id === w.id) ? cur.map((x) => (x.id === w.id ? w : x)) : [w, ...cur] };
            });
            setEdit(null);
          }}
          onDelete={(id) => {
            onChange((tr) => ({ ...tr, wishes: (tr.wishes ?? []).filter((x) => x.id !== id) }));
            setEdit(null);
          }}
          onToPlan={(w) => {
            setEdit(null);
            onToPlan(w);
          }}
        />
      )}
    </View>
  );
}

function WishSheet({
  wish,
  initialUrl,
  onClose,
  onSave,
  onDelete,
  onToPlan,
  city,
}: {
  city?: string;
  wish?: Wish;
  initialUrl?: string;
  onClose: () => void;
  onSave: (w: Wish) => void;
  onDelete?: (id: string) => void;
  onToPlan?: (w: Wish) => void;
}) {
  const [w, setW] = useState<Wish>(wish ?? { id: uid(), title: '', url: initialUrl, createdAt: Date.now() });
  const [sure, setSure] = useState(false);
  const [loading, setLoading] = useState(false);
  const lookup = async (url?: string) => {
    if (!url || !/^https?:/.test(url)) return;
    setLoading(true);
    const m = await fetchMeta(url);
    setLoading(false);
    setW((x) => ({ ...x, title: x.title || m.title || '', image: x.image ?? m.image }));
  };
  useEffect(() => {
    if (initialUrl && !wish) lookup(initialUrl);
  }, []);
  const pf = platformOf(w.url);
  return (
    <Sheet visible onClose={onClose} tall>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <Text style={s.sheetTitle}>{wish ? w.title || t('wishes') : t('addWish')}</Text>
        <Text style={s.label}>{t('wishUrl')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={w.url ?? ''}
            onChangeText={(v) => setW({ ...w, url: v.trim() || undefined })}
            onEndEditing={() => lookup(w.url)}
            placeholder="https://"
            placeholderTextColor={C.sub}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable
            style={s.smallBtn}
            onPress={async () => {
              const txt = await Clipboard.getStringAsync();
              const u = firstUrl(txt);
              if (u) {
                setW((x) => ({ ...x, url: u }));
                lookup(u);
              }
            }}
          >
            <Icon name="clipboard-outline" size={18} color={C.onInk} />
          </Pressable>
        </View>
        {!!w.url && (
          <Pressable onPress={() => Linking.openURL(w.url!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Icon name={pf.icon} size={15} color={C.pink} />
            <Text style={{ color: C.pink, fontWeight: '800' }}>{`${t('openLink')}${pf.name ? ` · ${pf.name}` : ''}`}</Text>
          </Pressable>
        )}
        {loading && <Text style={[s.hint, { marginTop: 6 }]}>…</Text>}
        <Text style={s.label}>{t('wishTitle')}</Text>
        <TextInput style={s.input} value={w.title} onChangeText={(v) => setW({ ...w, title: v })} placeholderTextColor={C.sub} />
        <Text style={s.label}>{t('wishMemo')}</Text>
        <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} value={w.memo ?? ''} onChangeText={(v) => setW({ ...w, memo: v || undefined })} multiline placeholderTextColor={C.sub} />
        <Text style={s.label}>{t('photos')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {!!w.image && !w.photos?.length && <Image source={{ uri: w.image }} style={s.ticketThumb} />}
          {(w.photos ?? []).map((p) => (
            <Pressable key={p} onLongPress={() => setW({ ...w, photos: w.photos!.filter((x) => x !== p) })}>
              <Image source={imgSrc(p)} style={s.ticketThumb} />
            </Pressable>
          ))}
          <Pressable
            style={s.ticketAdd}
            onPress={async () => {
              const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8 });
              if (!r.canceled) setW((x) => ({ ...x, photos: [...(x.photos ?? []), ...r.assets.map((a) => keepImage(a.uri))] }));
            }}
          >
            <Icon name="image-outline" size={22} color={C.sub} />
          </Pressable>
        </ScrollView>
        {!!wish && !!w.title.trim() && <FindRow title={t('findTickets')} links={activityLinks(w.title.trim(), city)} />}
        <Pressable style={[s.primary, !(w.title || w.url) && { opacity: 0.35 }]} disabled={!(w.title || w.url)} onPress={() => onSave({ ...w, title: w.title.trim() || pf.name })}>
          <Text style={s.primaryText}>{t('save')}</Text>
        </Pressable>
        {wish && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {onToPlan && (
              <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => onToPlan({ ...w, title: w.title.trim() || pf.name })}>
                <Icon name="flag-outline" size={16} />
                <Text style={s.secondaryText}>{t('toPlan')}</Text>
              </Pressable>
            )}
            {onDelete && (
              <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => (sure ? onDelete(w.id) : setSure(true))}>
                <Text style={[s.secondaryText, sure && { color: C.pink }]}>{sure ? t('deleteSure') : t('delete')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

function PlanTab({ trip, wx, onOpen, onJournal, onAddPlan }: { trip: Trip; wx?: TripWx | null; onOpen: (b: Booking) => void; onJournal?: (d: string) => void; onAddPlan?: (d: string) => void }) {
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
            {!!wx?.days[date] && (
              <View style={s.wxPill}>
                <Icon name={wxIcon(wx.days[date].code).icon} size={14} color={C.ink} />
                <Text style={s.wxText}>
                  {wx.days[date].max}° / {wx.days[date].min}°{wx.days[date].rain ? `  ☂${wx.days[date].rain}%` : ''}
                </Text>
              </View>
            )}
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
                    <Text style={[s.tlTitle, b.cancelled && s.cancelled]} numberOfLines={2}>
                      {b.title || typeName(b.type)}
                    </Text>
                    {!!b.cancelled && <Text style={[s.tlEdge, { color: C.pink }]}>{t('cancelled')}</Text>}
                    {!!edge && <Text style={[s.tlEdge, { color: ty.color }]}>{edge}</Text>}
                    {(b.from || b.to) && it.edge !== 'end' ? (
                      <Text style={s.hint} numberOfLines={2}>
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

function InboxBox({ items, onOpen, onDrop }: { items: InboxItem[]; onOpen: (it: InboxItem) => void; onDrop: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <View style={[s.card, { borderWidth: 1, borderColor: C.yellow, marginBottom: 6 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon name="alert-circle-outline" size={17} color={C.ink} />
        <Text style={s.tlTitle}>
          {t('inbox')} ({items.length})
        </Text>
      </View>
      <Text style={[s.hint, { marginBottom: 6 }]}>{t('inboxHint')}</Text>
      {items.map((it, i) => (
        <Pressable key={it.id} onPress={() => onOpen(it)} onLongPress={() => onDrop(it.id)} style={[s.tlRow, i > 0 && s.tlLine]}>
          {it.image ? <Image source={imgSrc(it.image)} style={{ width: 34, height: 44, borderRadius: 6, backgroundColor: C.chip }} /> : <Icon name="mail-outline" size={20} color={C.sub} />}
          <View style={{ flex: 1 }}>
            <Text style={s.tlTitle} numberOfLines={2}>
              {(it.text ?? '').trim().split('\n')[0] || t('screenshot')}
            </Text>
            <Text style={s.hint}>{new Date(it.at).toLocaleDateString()}</Text>
          </View>
          <Icon name="chevron-forward" size={16} color={C.sub} />
        </Pressable>
      ))}
    </View>
  );
}

function BookingsTab({ trip, rate, onOpen, onInbox, onDropInbox }: { trip: Trip; rate: RateInfo; onOpen: (b: Booking) => void; onInbox: (it: InboxItem) => void; onDropInbox: (id: string) => void }) {
  const inbox = <InboxBox items={trip.inbox ?? []} onOpen={onInbox} onDrop={onDropInbox} />;
  if (!trip.bookings.length)
    return (
      <>
        {inbox}
        <PlanTab trip={trip} onOpen={onOpen} />
      </>
    );
  const city = tripCity(trip.bookings) ?? (trip.bookings.find((b) => b.type === 'flight' && b.to)?.to ? placeQuery(trip.bookings.find((b) => b.type === 'flight' && b.to)!, 'to')?.replace(/\s*(International\s*)?Airport.*$/i, '') : undefined);
  const { start: rs, end: re } = tripRange(trip);
  const noHotel = !trip.bookings.some((b) => b.type === 'hotel') && rs && re && rs !== re && rs >= todayStr();
  return (
    <>
      {inbox}
      {noHotel && !!city && (
        <View style={[s.card, { marginBottom: 6 }]}>
          <Text style={s.tlTitle}>{t('noHotelYet')}</Text>
          <FindRow title={t('findHotel', { city })} links={hotelLinks(city, rs, re)} />
        </View>
      )}
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
                    <Text style={[s.tlTitle, b.cancelled && s.cancelled]} numberOfLines={2}>
                      {b.title || typeName(b.type)}
                    </Text>
                    {!!b.cancelled && <Text style={[s.tlEdge, { color: C.pink }]}>{t('cancelled')}</Text>}
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
    v: trip.bookings.filter((b) => b.type === ty.id && b.price && !b.cancelled).reduce((a, b) => a + toHome(b.price!, b.currency || rate.base, rate), 0),
  })).filter((x) => x.v > 0);
  const max = Math.max(1, ...byType.map((x) => x.v));
  return (
    <>
      <View style={[s.card, { backgroundColor: C.night }]}>
        <Text style={{ color: '#E8DCE6', fontWeight: '800', fontSize: 13 }}>{t('total')}</Text>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 32, marginTop: 2 }}>{fmtMoney(Math.round(total), rate.base)}</Text>
        {trip.members.length > 1 && (
          <Text style={{ color: '#E8DCE6', fontWeight: '700', marginTop: 2 }}>
            {t('perPerson')} {fmtMoney(Math.round(total / trip.members.length), rate.base)}
          </Text>
        )}
        <Text style={{ color: '#B9A9B7', fontSize: 11, marginTop: 6 }}>{t('rateNote')}</Text>
        <BudgetBar trip={trip} total={total} rate={rate} home={rate.base} onChange={onChange} />
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
                    const link = trip.share ? `${SERVER}/s/${trip.share.code}?c=${rate.base}` : `tripfold://settle?d=${encodeURIComponent(JSON.stringify(data))}`;
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
            {!trip.share && st.pay.length > 0 && <Text style={[s.hint, { fontSize: 11, marginTop: 4 }]}>{t('settleWebHint')}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => exportSettlePdf(trip, rate).catch(() => {})}>
                <Icon name="document-outline" size={16} />
                <Text style={s.secondaryText}>PDF</Text>
              </Pressable>
              <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => exportSettleCsv(trip, rate).catch(() => {})}>
                <Icon name="grid-outline" size={16} />
                <Text style={s.secondaryText}>CSV</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </>
  );
}

function BudgetBar({ trip, total, rate, home, onChange }: { trip: Trip; total: number; rate: RateInfo; home: string; onChange: (fn: (t: Trip) => Trip) => void }) {
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
            style={[s.input, { flex: 1, backgroundColor: '#24272E', borderColor: '#33363E', color: C.onInk }]}
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
            <Icon name="checkmark" size={20} color={C.onInk} />
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
          {(() => {
            // 1日の予算：残りの予算を残りの日数で割って、今日使った分を引く
            const { start, end } = tripRange(trip);
            const today = todayStr();
            if (!start || !end || end < today) return null;
            const from = start > today ? start : today;
            const daysLeft = daysBetween(from, end) + 1;
            const todaySpent = (trip.expenses ?? []).filter((e) => e.date === today).reduce((a, e) => a + expHome(e, rate), 0);
            const daily = (b - (total - todaySpent)) / daysLeft;
            const leftToday = daily - (start > today ? 0 : todaySpent);
            return (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <Text style={{ color: '#B9BCC4', fontSize: 12, fontWeight: '700' }}>{t('perDay', { v: fmtMoney(Math.max(0, Math.round(daily)), home) })}</Text>
                {start <= today && (
                  <Text style={{ color: leftToday < 0 ? C.pink : '#FFFFFF', fontSize: 13, fontWeight: '900' }}>
                    {leftToday < 0 ? t('todayOver', { v: fmtMoney(Math.round(-leftToday), home) }) : t('todayLeft', { v: fmtMoney(Math.round(leftToday), home) })}
                  </Text>
                )}
              </View>
            );
          })()}
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
  const [payer, setPayer] = useState(trip.myId && trip.members.some((m) => m.id === trip.myId) ? trip.myId : trip.members[0]?.id);
  const c = findCurrency(cur);
  const list = trip.expenses ?? [];
  const sum = list.reduce((a, e) => a + expHome(e, rate), 0);
  const [rateTxt, setRateTxt] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [ocrMsg, setOcrMsg] = useState('');
  const [reading, setReading] = useState(false);
  const autoRate = cur !== rate.base ? toHome(1, cur, rate) : 1;
  const add = () => {
    const v = parseFloat(amt);
    if (!v) return;
    const r = parseFloat(rateTxt);
    const e: Expense = { id: uid(), title: title.trim() || catName(cat), cat, amount: v, currency: cur, date: todayStr(), paidBy: payer, rate: r > 0 && cur !== rate.base ? r : undefined, photo };
    onChange((tr) => ({ ...tr, expenses: [e, ...(tr.expenses ?? [])] }));
    setTitle('');
    setAmt('');
    setPhoto(undefined);
    setOcrMsg('');
  };
  // レシートを撮って（選んで）金額・通貨・お店の名前を読み取る
  const receipt = async (camera: boolean) => {
    let r: ImagePicker.ImagePickerResult;
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
        r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      } else r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    } catch {
      r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    }
    if (r.canceled || !r.assets?.[0]) return;
    const uri = keepImage(r.assets[0].uri);
    setPhoto(uri);
    if (!ocrAvailable) {
      setOcrMsg(t('ocrNA'));
      return;
    }
    setReading(true);
    try {
      const lines = (await recognizeReceipt(uri)) ?? [];
      const rows = rowsOf(lines);
      const text = rows.join('\n');
      const p = findPrice(text);
      const shop = rows.map((x) => x.trim()).find((x) => x.length >= 2 && x.length <= 30 && !/\d{3,}|receipt|領収|レシート|tel|〒/i.test(x));
      if (p.price) setAmt(String(p.price));
      if (p.currency) setCur(p.currency);
      if (shop && !title) setTitle(shop);
      setOcrMsg(p.price ? t('receiptOk') : t('readNone'));
    } catch {
      setOcrMsg(t('readNone'));
    }
    setReading(false);
  };
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {EXP_CATS.map((x) => (
          <Pressable key={x.id} onPress={() => setCat(x.id)} style={[s.typeChip, cat === x.id && { backgroundColor: C.ink, borderColor: C.ink }]}>
            <Icon name={x.icon} size={14} color={cat === x.id ? C.onInk : C.sub} />
            <Text style={[s.chipText, cat === x.id ? { color: C.onInk } : { color: C.sub }]}>{catName(x.id)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <TextInput style={[s.input, { flex: 1 }]} value={title} onChangeText={setTitle} placeholder={t('expTitle')} placeholderTextColor={C.sub} />
        <Pressable style={s.iconBtn} onPress={() => receipt(true)} onLongPress={() => receipt(false)} accessibilityLabel={t('receipt')}>
          {reading ? <ActivityIndicator color={C.ink} /> : photo ? <Image source={imgSrc(photo)} style={{ width: 30, height: 30, borderRadius: 6 }} /> : <Icon name="receipt-outline" size={20} />}
        </Pressable>
      </View>
      {!!ocrMsg && <Text style={[s.hint, { marginTop: 4 }]}>{ocrMsg}</Text>}
      {!ocrMsg && !amt && <Text style={[s.hint, { marginTop: 4, fontSize: 11 }]}>{t('receiptHint')}</Text>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TextInput style={[s.input, { flex: 1 }]} value={amt} onChangeText={(x) => setAmt(cleanNum(x, c.decimals))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.sub} />
        <CurrencyPicker value={cur} onChange={(x) => (setCur(x), setRateTxt(''))} />
        <Pressable style={[s.smallBtn, !amt && { opacity: 0.35 }]} onPress={add} disabled={!amt}>
          <Icon name="add" size={20} color={C.onInk} />
        </Pressable>
      </View>
      {cur !== rate.base && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <Text style={[s.hint, { flexShrink: 0 }]}>{t('rate')}  1 {cur} =</Text>
          <TextInput
            style={[s.input, { paddingVertical: 6, flex: 1, fontSize: 13 }]}
            value={rateTxt}
            onChangeText={(x) => setRateTxt(cleanNum(x, 6))}
            keyboardType="decimal-pad"
            placeholder={String(Math.round(autoRate * 10000) / 10000)}
            placeholderTextColor={C.sub}
          />
          <Text style={[s.hint, { flexShrink: 0 }]}>{rate.base}</Text>
        </View>
      )}
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
                <Text style={s.tlTitle} numberOfLines={2}>
                  {e.title}
                </Text>
                <Text style={s.hint}>
                  {prettyDate(e.date)}
                  {trip.members.length > 1 ? ` · ${trip.members.find((m) => m.id === e.paidBy)?.name ?? ''}` : ''}
                  {e.rate ? ` · ${t('rateManual')}` : ''}
                </Text>
              </View>
              {!!e.photo && <Image source={imgSrc(e.photo)} style={{ width: 26, height: 34, borderRadius: 4, marginRight: 8 }} />}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.price}>{fmtMoney(e.amount, e.currency)}</Text>
                {e.currency !== rate.base && <Text style={s.hint}>≈ {fmtMoney(Math.round(expHome(e, rate)), rate.base)}</Text>}
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
  const [mode, setMode] = useState<'pack' | 'gift'>('pack');
  const [text, setText] = useState('');
  const [who, setWho] = useState('');
  const list = trip.checklist.filter((c) => (mode === 'gift' ? c.kind === 'gift' : c.kind !== 'gift'));
  const done = list.filter((c) => c.done).length;
  const add = () => {
    if (!text.trim()) return;
    const item = mode === 'gift' ? { id: uid(), text: text.trim(), done: false, kind: 'gift' as const, who: who.trim() || undefined } : { id: uid(), text: text.trim(), done: false };
    onChange((tr) => ({ ...tr, checklist: [...tr.checklist, item] }));
    setText('');
  };
  // お土産は「誰に」ごとにまとめる
  const groups = mode === 'gift' ? [...new Set(list.map((c) => c.who ?? ''))].map((w) => ({ who: w, items: list.filter((c) => (c.who ?? '') === w) })) : [{ who: '', items: list }];
  const row = (c: (typeof list)[number], i: number) => (
    <Pressable
      key={c.id}
      style={[s.tlRow, i > 0 && s.tlLine]}
      onPress={() => onChange((tr) => ({ ...tr, checklist: tr.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) }))}
      onLongPress={() => onChange((tr) => ({ ...tr, checklist: tr.checklist.filter((x) => x.id !== c.id) }))}
    >
      <View style={[s.check, c.done && { backgroundColor: C.ink, borderColor: C.ink }]}>{c.done && <Icon name="checkmark" size={15} color={C.onInk} />}</View>
      <Text style={[s.tlTitle, { flex: 1 }, c.done && { color: C.sub, textDecorationLine: 'line-through' }]}>{c.text}</Text>
      {mode === 'gift' && (
        <Pressable
          hitSlop={8}
          onPress={async () => {
            const uri = await pickImage();
            if (uri) onChange((tr) => ({ ...tr, checklist: tr.checklist.map((x) => (x.id === c.id ? { ...x, photo: uri } : x)) }));
          }}
        >
          {c.photo ? <Image source={imgSrc(c.photo)} style={{ width: 34, height: 34, borderRadius: 8 }} /> : <Icon name="camera-outline" size={18} color={C.sub} />}
        </Pressable>
      )}
    </Pressable>
  );
  return (
    <>
      <View style={[s.seg, { marginBottom: 12 }]}>
        {(['pack', 'gift'] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[s.segItem, mode === m && s.segOn]}>
            <Icon name={m === 'pack' ? 'bag-check-outline' : 'gift-outline'} size={15} color={mode === m ? C.ink : C.sub} />
            <Text style={[s.chipText, mode !== m && { color: C.sub }]}>{m === 'pack' ? t('tabPack') : t('gifts')}</Text>
          </Pressable>
        ))}
      </View>
      {mode === 'pack' && (
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
      )}
      <Text style={s.hint}>
        {mode === 'gift' ? t('giftHint') : t('packHint')} ・ {done}/{list.length}
      </Text>
      {groups.map((g) => (
        <View key={g.who || '-'} style={[s.card, { marginTop: 8 }]}>
          {mode === 'gift' && !!g.who && <Text style={[s.kicker, { marginBottom: 4 }]}>{t('giftFor', { who: g.who })}</Text>}
          {g.items.map(row)}
        </View>
      ))}
      <View style={[s.card, { marginTop: 8 }]}>
        {mode === 'gift' && (
          <TextInput style={[s.input, { marginBottom: 8 }]} value={who} onChangeText={setWho} placeholder={t('giftWhoPh')} placeholderTextColor={C.sub} />
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={text}
            onChangeText={setText}
            placeholder={mode === 'gift' ? t('giftPh') : t('packPh')}
            placeholderTextColor={C.sub}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={add}
          />
          <Pressable style={s.smallBtn} onPress={add}>
            <Text style={s.smallBtnText}>＋</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

/** 予約サイトで探す（提携リンク） */
function FindRow({ title, links }: { title: string; links: FindLink[] }) {
  if (!links.length) return null;
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={[s.hint, { marginBottom: 6, fontWeight: '800' }]}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {links.map((l) => (
          <Pressable key={l.id} onPress={() => Linking.openURL(l.url)} style={s.typeChip}>
            <Icon name="open-outline" size={13} color={C.sub} />
            <Text style={s.chipText}>{l.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[s.hint, { fontSize: 10, marginTop: 4 }]}>{t('affNote')}</Text>
    </View>
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
          <Text style={[s.tlTitle, { flex: 1 }]} numberOfLines={2}>
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

function NewTripSheet({
  visible,
  onClose,
  onCreate,
  edit,
  onJoin,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string, cover?: string) => void;
  edit?: Trip;
  onJoin?: () => void;
}) {
  const [name, setName] = useState(edit?.name ?? '');
  const [color, setColor] = useState(edit ? coverOf(edit) : COVERS[0]);
  const [cover, setCover] = useState<string | undefined>(edit?.cover);
  useEffect(() => {
    if (visible && edit) {
      setName(edit.name);
      setColor(coverOf(edit));
      setCover(edit.cover);
    }
  }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={s.sheetTitle}>{edit ? t('editTrip') : t('newTrip')}</Text>
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
            <Icon name="camera" size={14} color={C.onInk} />
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
        <Text style={s.primaryText}>{edit ? t('save') : t('create')}</Text>
      </Pressable>
      {!edit && onJoin && (
        <Pressable onPress={onJoin} style={{ alignSelf: 'center', marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="people-outline" size={16} color={C.pink} />
          <Text style={{ color: C.pink, fontWeight: '800' }}>{t('joinByCode')}</Text>
        </Pressable>
      )}
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
  onLater,
  onSaveMany,
  initial,
}: {
  initial?: AddInitial;
  trip: Trip;
  edit?: Booking;
  home: string;
  onClose: () => void;
  onSave: (b: Booking) => void;
  onLater?: (src: { text?: string; image?: string }) => void;
  onSaveMany?: (list: Booking[]) => void;
}) {
  const [drafts, setDrafts] = useState<PlanDraft[] | null>(null);
  const [src, setSrc] = useState<{ text?: string; image?: string }>({});
  const [mode, setMode] = useState<'choose' | 'text' | 'form' | 'ai'>(edit || initial?.planDate ? 'form' : 'choose');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [b, setB] = useState<Booking>(
    edit ??
      (initial?.planDate
        ? { id: uid(), type: 'plan', title: initial.planTitle ?? '', start: initial.planDate, memo: initial.planMemo, from: initial.planFrom, currency: home, paidBy: trip.myId, createdAt: Date.now() }
        : { id: uid(), type: 'flight', title: '', start: tripRange(trip).start ?? todayStr(), currency: home, paidBy: trip.myId, createdAt: Date.now() }),
  );
  const set = (p: Partial<Booking>) => setB((x) => ({ ...x, ...p }));
  const applyParsed = (raw: string, photo?: string) => {
    setSrc({ text: photo ? undefined : raw, image: photo });
    applyFields(parseBooking(raw), photo);
  };
  const applyFields = (p: Partial<Booking>, photo?: string, file?: TicketFile) => {
    const addFile = (fs?: TicketFile[]) => (file ? [...(fs ?? []), file] : fs);
    const got = Object.keys(p).filter((k) => k !== 'type' && k !== 'cancelled').length;
    // 同じ予約番号の予約があれば、そちらを更新する（座席指定・変更・キャンセルのメール）
    const norm = (c?: string) => (c ?? '').replace(/[\s-]/g, '').toUpperCase();
    // 往復で同じ予約番号のこともあるので、便名・日付で見分ける
    const same = !edit && p.code && norm(p.code).length >= 5 ? trip.bookings.filter((x) => norm(x.code) === norm(p.code)) : [];
    const hit =
      same.find((x) => p.title && norm(x.title) === norm(p.title)) ??
      same.find((x) => p.start && x.start === p.start && (!p.startTime || !x.startTime || x.startTime === p.startTime)) ??
      (same.length === 1 && (!p.title || !same[0].title) ? same[0] : undefined);
    if (hit) {
      const keep = p.cancelled ? { cancelled: true } : { ...p, type: hit.type, cancelled: undefined };
      setB({ ...hit, ...keep, currency: (keep as any).currency ?? hit.currency, photos: photo ? [...(hit.photos ?? []), photo] : hit.photos, files: addFile(hit.files), memo: p.memo && hit.memo && !hit.memo.includes(p.memo) ? `${hit.memo}\n${p.memo}` : p.memo ?? hit.memo });
      setNote(p.cancelled ? t('readCancel') : t('readUpdate'));
      setMode('form');
      return;
    }
    setB((x) => ({ ...x, ...p, currency: p.currency ?? x.currency, photos: photo ? [...(x.photos ?? []), photo] : x.photos, files: addFile(x.files) }));
    setNote(p.cancelled ? t('readCancelNew') : got >= 2 ? t('readOk') : t('readNone'));
    setMode('form');
  };
  // 搭乗券（.pkpass）・PDFのチケット
  const readFile = async (f: { name: string; uri: string; mime?: string }) => {
    const uri = keepFile(f.uri, f.name);
    const file: TicketFile = { name: f.name, uri, mime: f.mime };
    if (isPkpass(f.name, f.mime)) {
      const p = await readPkpass(uri);
      if (p) return applyFields(p, undefined, file);
    }
    setB((x) => ({ ...x, files: [...(x.files ?? []), file] }));
    setNote(isPdf(f.name, f.mime) ? t('pdfAttached') : t('fileAttached'));
    setMode('form');
  };
  const pickFile = async () => {
    const f = await pickAnyFile(['application/pdf', 'application/vnd.apple.pkpass', 'com.apple.pkpass', '*/*']);
    if (f) readFile(f);
  };
  const pickShot = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets?.[0]) return;
    readImage(keepImage(r.assets[0].uri));
  };
  const readImage = async (uri: string) => {
    if (!ocrAvailable) {
      setSrc({ image: uri });
      set({ photos: [...(b.photos ?? []), uri] });
      setNote(t('ocrNA'));
      setMode('form');
      return;
    }
    setBusy(true);
    try {
      const lines = (await recognizeReceipt(uri)) ?? [];
      applyParsed(rowsOf(lines).join('\n'), uri);
    } catch {
      setSrc({ image: uri });
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
    if (initial.file) readFile(initial.file);
    else if (initial.image) readImage(keepImage(initial.image));
    else if (initial.text) applyParsed(initial.text);
  }, []);

  return (
    <Sheet visible onClose={onClose} tall={mode === 'form' || mode === 'ai'}>
      {mode === 'choose' && (
        <>
          <Text style={s.sheetTitle}>{t('howAdd')}</Text>
          <AddOption icon="scan-outline" title={t('fromShot')} sub={busy ? t('ocrBusy') : t('fromShotSub')} onPress={pickShot} />
          <AddOption icon="wallet-outline" title={t('fromFile')} sub={t('fromFileSub')} onPress={pickFile} />
          <AddOption icon="mail-open-outline" title={t('fromText')} sub={t('fromTextSub')} onPress={() => setMode('text')} />
          <AddOption icon="create-outline" title={t('manual')} sub={t('manualSub')} onPress={() => setMode('form')} />
          {!!onSaveMany && <AddOption icon="sparkles-outline" title={t('fromAi')} sub={t('fromAiSub')} onPress={() => setMode('ai')} />}
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
      {mode === 'ai' && (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={s.sheetTitle}>{t('fromAi')}</Text>
          <Text style={[s.hint, { marginBottom: 8, lineHeight: 18 }]}>{t('aiHint')}</Text>
          <TextInput style={[s.input, { height: 180, textAlignVertical: 'top' }]} multiline value={text} onChangeText={(v) => (setText(v), setDrafts(null))} placeholder={t('aiPh')} placeholderTextColor={C.sub} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable style={[s.secondary, { flex: 1 }]} onPress={async () => { const c = await Clipboard.getStringAsync(); if (c) (setText(c), setDrafts(null)); }}>
              <Icon name="clipboard-outline" size={17} />
              <Text style={s.secondaryText}>{t('paste')}</Text>
            </Pressable>
            <Pressable style={[s.primary, { flex: 1, marginTop: 0 }, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim()} onPress={() => setDrafts(parseItinerary(text, tripRange(trip).start ?? todayStr()))}>
              <Text style={s.primaryText}>{t('read')}</Text>
            </Pressable>
          </View>
          {drafts && (
            <View style={[s.card, { marginTop: 12 }]}>
              {drafts.length === 0 ? (
                <Text style={s.hint}>{t('aiNone')}</Text>
              ) : (
                drafts.map((d, i) => (
                  <View key={i} style={[s.tlRow, i > 0 && s.tlLine]}>
                    <Text style={[s.tlTime, { width: 74 }]}>{`${t('dayN', { n: d.day })}\n${d.time ?? '—'}`}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.tlTitle} numberOfLines={2}>{d.title}</Text>
                      {!!d.memo && <Text style={s.hint} numberOfLines={2}>{d.memo}</Text>}
                    </View>
                    <Pressable hitSlop={8} onPress={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                      <Icon name="close-circle" size={18} color={C.sub} />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          )}
          {!!drafts?.length && (
            <Pressable
              style={s.primary}
              onPress={() => {
                const base = tripRange(trip).start ?? todayStr();
                onSaveMany!(
                  drafts.map((d, i) => ({
                    id: uid(),
                    type: 'plan' as BookingType,
                    title: d.title,
                    start: d.date ?? shiftDate(base, d.day - 1),
                    startTime: d.time,
                    endTime: d.endTime,
                    from: d.place,
                    memo: d.memo,
                    currency: home,
                    createdAt: Date.now() + i,
                  })),
                );
              }}
            >
              <Text style={s.primaryText}>{t('aiAdd', { n: drafts.length })}</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
      {mode === 'form' && (
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          <Text style={s.sheetTitle}>{edit ? t('edit') : b.type === 'plan' ? t('addPlan') : t('addTitle')}</Text>
          {!!note && (
            <View style={s.note}>
              <Text style={s.noteText}>{note}</Text>
              {!!onLater && !edit && !!(src.text || src.image) && (note === t('readNone') || note === t('ocrNA')) && (
                <Pressable onPress={() => onLater(src)} hitSlop={8} style={{ marginTop: 6 }}>
                  <Text style={[s.noteText, { textDecorationLine: 'underline' }]}>{initial?.inboxId ? t('keepInInbox') : t('later')}</Text>
                </Pressable>
              )}
            </View>
          )}
          {!!b.cancelled && (
            <Pressable onPress={() => set({ cancelled: undefined })} style={[s.note, { backgroundColor: C.pinkSoft }]}>
              <Text style={[s.noteText, { color: C.pink }]}>{t('cancelled')} ・ {t('undoCancel')}</Text>
            </Pressable>
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
                  <Text style={[s.chipText, b.start === d && { color: C.onInk }]}>{`${t('dayN', { n: i + 1 })} ・ ${prettyDate(d)}`}</Text>
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
          <Field label={placeLabels(b.type)[0]} value={b.from ?? ''} onChange={(v) => set({ from: v || undefined, tz: undefined })} placeholder={placeLabels(b.type)[1] ? undefined : t('addressPh')} />
          {(placeLabels(b.type)[1] || !!b.to) && <Field label={placeLabels(b.type)[1] ?? t('to')} value={b.to ?? ''} onChange={(v) => set({ to: v || undefined })} />}
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
          {!!b.files?.length && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {b.files.map((f) => (
                <Pressable key={f.uri} onLongPress={() => set({ files: b.files!.filter((x) => x.uri !== f.uri) })} style={s.typeChip}>
                  <Icon name={isPkpass(f.name, f.mime) ? 'wallet-outline' : 'document-outline'} size={14} color={C.sub} />
                  <Text style={s.chipText} numberOfLines={1}>{f.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
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
  const [q, setQ] = useState('');
  const c = findCurrency(value);
  const qq = q.trim().toLowerCase();
  const list = qq
    ? CURRENCIES.filter((x) => `${x.code} ${x.name} ${x.symbol} ${CUR_COUNTRIES[x.code] ?? ''}`.toLowerCase().includes(qq))
    : CURRENCIES;
  return (
    <>
      <Pressable style={s.curBtn} onPress={() => setOpen(true)}>
        <Text style={s.chipText}>{c.code}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.curWrap} onPress={() => setOpen(false)}>
          <Pressable style={s.curList} onPress={() => {}}>
            <TextInput
              style={[s.input, { marginBottom: 8 }]}
              value={q}
              onChangeText={setQ}
              placeholder={t('searchCur')}
              placeholderTextColor={C.sub}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            <ScrollView keyboardShouldPersistTaps="handled">
              {list.map((x) => (
                <Pressable
                  key={x.code}
                  style={[s.curRow, x.code === value && { backgroundColor: C.pinkSoft }]}
                  onPress={() => {
                    onChange(x.code);
                    setOpen(false);
                    setQ('');
                  }}
                >
                  <Text style={s.tlTitle}>{x.code}</Text>
                  <Text style={[s.hint, { flex: 1 }]} numberOfLines={1}>{`${x.symbol.trim()}  ${x.name}`}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
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
  onUpdate,
}: {
  trip: Trip;
  b: Booking;
  rate: RateInfo;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (b: Booking) => void;
}) {
  const [viewer, setViewer] = useState<number | null>(null);
  const attach = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
      if (!r.canceled) onUpdate({ ...b, photos: [...(b.photos ?? []), ...r.assets.map((a) => keepImage(a.uri))] });
    } catch {}
  };
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
        <Text style={s.sec}>{t('ticketsSec').toUpperCase()}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0, marginBottom: 14 }}>
          {(b.photos ?? []).map((p, i) => (
            <Pressable key={p} onPress={() => setViewer(i)} onLongPress={() => onUpdate({ ...b, photos: b.photos!.filter((x) => x !== p) })}>
              <Image source={imgSrc(p)} style={s.ticketThumb} />
            </Pressable>
          ))}
          {(b.files ?? []).map((f) => (
            <Pressable key={f.uri} onPress={() => openTicketFile(f)} onLongPress={() => onUpdate({ ...b, files: b.files!.filter((x) => x.uri !== f.uri) })} style={[s.ticketAdd, { borderStyle: 'solid', backgroundColor: C.card }]}>
              <Icon name={isPkpass(f.name, f.mime) ? 'wallet-outline' : 'document-text-outline'} size={24} color={C.ink} />
              <Text style={[s.hint, { fontSize: 10, textAlign: 'center' }]} numberOfLines={2}>
                {isPkpass(f.name, f.mime) ? t('addToWallet') : f.name}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={attach} style={s.ticketAdd}>
            <Icon name="qr-code-outline" size={22} color={C.sub} />
            <Text style={[s.hint, { fontSize: 11, textAlign: 'center' }]}>{t('attachTicket')}</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              const f = await pickAnyFile(['application/pdf', 'application/vnd.apple.pkpass', 'com.apple.pkpass', '*/*']);
              if (!f) return;
              const file = { name: f.name, uri: keepFile(f.uri, f.name), mime: f.mime };
              const p = isPkpass(f.name, f.mime) ? await readPkpass(file.uri) : null;
              onUpdate({ ...b, seat: b.seat ?? p?.seat, memo: p?.memo && !(b.memo ?? '').includes(p.memo) ? [b.memo, p.memo].filter(Boolean).join('\n') : b.memo, files: [...(b.files ?? []), file] });
            }}
            style={s.ticketAdd}
          >
            <Icon name="document-attach-outline" size={22} color={C.sub} />
            <Text style={[s.hint, { fontSize: 11, textAlign: 'center' }]}>{t('attachFile')}</Text>
          </Pressable>
        </ScrollView>
        {!!b.photos?.length && <Text style={[s.hint, { marginTop: -8, marginBottom: 10, fontSize: 11 }]}>{t('ticketHint')}</Text>}
        {viewer !== null && b.photos?.length ? <TicketViewer photos={b.photos} start={viewer} onClose={() => setViewer(null)} /> : null}
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
          {!!b.from && <Info k={placeLabels(b.type)[0].replace(/（.*）| \(.*\)/, '')} v={b.from} q={placeQuery(b, 'from', tripCity(trip.bookings))} />}
          {!b.from && ['hotel', 'ticket', 'food', 'plan', 'other'].includes(b.type) && !!b.title && (
            <Info k={placeLabels(b.type)[0]} v={b.title} q={placeQuery(b, 'from', tripCity(trip.bookings))} />
          )}
          {!!b.to && <Info k={(placeLabels(b.type)[1] ?? t('to')).replace(/（.*）| \(.*\)/, '')} v={b.to} q={placeQuery(b, 'to')} />}
          {(() => {
            // ひとつ前の予定の場所 → この予定の場所（出発地は前の予定から決まる）
            const stops = tripStops(trip);
            const i = stops.findIndex((x) => x.b.id === b.id);
            if (i <= 0 || b.type === 'flight') return null;
            const prev = stops[i - 1];
            if (prev.q === stops[i].q) return null;
            return <HowTo fromQ={prev.q} toQ={stops[i].q} label={`${t('howToGet')}：${prev.title} → ${stops[i].title}`} />;
          })()}
          {b.type !== 'flight' && (() => {
            const tz = bookingTz(b, trip);
            const st = tzToMyTime(tz, b.start, b.startTime);
            if (!st || st.diffH === 0) return null;
            return <Info k={t('startMine')} v={`${st.time}  (${t('tzDiff')} ${st.diffH > 0 ? '+' : ''}${st.diffH}h)`} />;
          })()}
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
        {(b.type === 'plan' || (b.type === 'ticket' && !b.code)) && !!b.title && <FindRow title={t('findTickets')} links={activityLinks(b.title, tripCity(trip.bookings))} />}
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

/** 搭乗券・PDFを開く（共有メニュー：プレビュー・ウォレットに追加・ファイルに保存） */
async function openTicketFile(f: { name: string; uri: string; mime?: string }) {
  try {
    if (Platform.OS === 'web') return Linking.openURL(f.uri);
    await Sharing.shareAsync(f.uri, { mimeType: f.mime ?? (isPdf(f.name) ? 'application/pdf' : 'application/vnd.apple.pkpass'), UTI: isPkpass(f.name, f.mime) ? 'com.apple.pkpass' : isPdf(f.name, f.mime) ? 'com.adobe.pdf' : undefined, dialogTitle: f.name });
  } catch {}
}
/** 前の予定からの行き方（所要時間の目安つき） */
function HowTo({ fromQ, toQ, label }: { fromQ: string; toQ: string; label: string }) {
  const [est, setEst] = useState<ReturnType<typeof estimate>>(null);
  useEffect(() => {
    let off = false;
    (async () => {
      const a = await geocode(fromQ);
      const b = a ? await geocode(toQ) : null;
      if (!off && a && b) setEst(estimate(a, b));
    })();
    return () => {
      off = true;
    };
  }, [fromQ, toQ]);
  return (
    <Pressable onPress={() => openRoute(fromQ, toQ)} style={s.howTo}>
      <Icon name={est?.mode === 'ride' ? 'train-outline' : 'walk-outline'} size={16} color={C.pink} />
      <View style={{ flex: 1 }}>
        <Text style={s.howToText} numberOfLines={2}>
          {label}
        </Text>
        {!!est && est.mode !== 'far' && <Text style={[s.hint, { fontSize: 12, marginTop: 2 }]}>{`${est.mode === 'walk' ? t('walk') : t('ride')} ${t('aboutMin', { n: est.min })} · ${fmtKm(est.km)}（${t('estimate')}）`}</Text>}
      </View>
    </Pressable>
  );
}
const Info = ({ k, v, q }: { k: string; v: string; q?: string }) => (
  <View style={[s.infoRow, { alignItems: 'center' }]}>
    <Text style={s.infoK}>{k}</Text>
    <Text style={s.infoV} selectable>
      {v}
    </Text>
    {!!q && (
      <Pressable onPress={() => openMap(q)} hitSlop={8} style={s.mapBtn}>
        <Icon name="navigate" size={14} color={C.onInk} />
      </Pressable>
    )}
  </View>
);

/* ---------------- 設定・ようこそ ---------------- */
function SettingsSheet({
  visible,
  settings,
  onClose,
  onChange,
  onBackup,
  onRestore,
}: {
  visible: boolean;
  settings: Settings;
  onClose: () => void;
  onChange: (s: Settings) => void;
  onBackup: () => Promise<unknown>;
  onRestore: () => Promise<number>;
}) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg('');
    try {
      setMsg(await fn());
    } catch {
      setMsg(t('backupErr'));
    }
    setBusy(false);
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={s.sheetTitle}>{t('settings')}</Text>
      <SettingsBody settings={settings} onChange={onChange} />
      <Text style={s.label}>{t('backup')}</Text>
      <Text style={[s.hint, { marginBottom: 8, lineHeight: 18 }]}>{t('backupHint')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[s.secondary, { flex: 1 }, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => run(async () => (await onBackup(), ''))}>
          <Icon name="cloud-upload-outline" size={16} />
          <Text style={s.secondaryText}>{t('backupSave')}</Text>
        </Pressable>
        <Pressable style={[s.secondary, { flex: 1 }, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => run(async () => { const n = await onRestore(); return n ? t('restored', { n }) : ''; })}>
          <Icon name="cloud-download-outline" size={16} />
          <Text style={s.secondaryText}>{t('backupLoad')}</Text>
        </Pressable>
      </View>
      {!!msg && <Text style={[s.hint, { marginTop: 6 }]}>{msg}</Text>}
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
            <Text style={[s.chipText, settings.notify === v && { color: C.onInk }]}>{v ? 'ON' : 'OFF'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.label}>{t('theme')}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['auto', 'light', 'dark'] as const).map((v) => (
          <Pressable key={v} onPress={() => onChange({ ...settings, theme: v })} style={[s.typeChip, (settings.theme ?? 'auto') === v && { backgroundColor: C.ink, borderColor: C.ink }]}>
            <Text style={[s.chipText, (settings.theme ?? 'auto') === v && { color: C.onInk }]}>{v === 'auto' ? t('themeAuto') : v === 'light' ? t('themeLight') : t('themeDark')}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.label}>{t('mapApp')}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['ask', 'apple', 'google'] as const).map((v) => (
          <Pressable key={v} onPress={() => onChange({ ...settings, mapApp: v })} style={[s.typeChip, (settings.mapApp ?? 'ask') === v && { backgroundColor: C.ink, borderColor: C.ink }]}>
            <Text style={[s.chipText, (settings.mapApp ?? 'ask') === v && { color: C.onInk }]}>{v === 'ask' ? t('mapAsk') : v === 'apple' ? 'Apple' : 'Google'}</Text>
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
      { id: uid(), type: 'train', title: 'Eurostar', start: d(0), startTime: '08:31', endTime: '11:47', from: 'London St Pancras', to: 'Paris Gare du Nord', code: 'QXK7PL', seat: 'Coach 7 / 63, 64', price: 208, currency: 'GBP', paidBy: 'me', photos: ['asset:ticket'], createdAt: 1 },
      { id: uid(), type: 'hotel', title: 'Hotel Le Marais', start: d(0), startTime: '15:00', end: d(3), endTime: '11:00', from: '12 Rue de Rivoli, Paris', code: '4821.339.112', price: 420, currency: 'EUR', paidBy: 'm2', createdAt: 2 },
      { id: uid(), type: 'ticket', title: ja ? 'ルーヴル美術館' : 'Louvre Museum', start: d(1), startTime: '10:00', from: 'Rue de Rivoli, 75001 Paris', code: 'LV-55219', price: 44, currency: 'EUR', paidBy: 'me', createdAt: 3 },
      { id: uid(), type: 'food', title: 'Le Comptoir du Relais', start: d(1), startTime: '19:30', from: "9 Carrefour de l'Odéon, 75006 Paris", memo: ja ? '2名・窓側' : 'Table for 2', createdAt: 4 },
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

let s = makeStyles();
function makeStyles() {
  return StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: C.chip, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10 },
  segOn: { backgroundColor: C.card },
  likeBtn: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5 },
  likeText: { fontSize: 12, fontWeight: '800', color: C.ink },
  iconBtn: { width: 48, borderRadius: 14, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  wxPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  wxText: { fontSize: 12, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  cancelled: { textDecorationLine: 'line-through', color: C.sub },
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
  smallBtnText: { color: C.onInk, fontWeight: '800', fontSize: 16 },
  tripCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 20, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  tripName: { fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  tripTotal: { fontSize: 14, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  status: { fontSize: 11.5, fontWeight: '800', color: C.sub },
  // 搭乗券風のカード
  pass: { backgroundColor: C.night, borderRadius: 26, padding: 20, overflow: 'hidden' },
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
  wishCard: { width: 150, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  wishImg: { width: 150, height: 100, backgroundColor: C.chip },
  wishTitle: { fontWeight: '800', color: C.ink, fontSize: 13, lineHeight: 17 },
  howTo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderTopWidth: 1, borderColor: C.line },
  howToText: { color: C.pink, fontWeight: '800', flex: 1, fontSize: 13 },
  ticketPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  ticketPillText: { color: '#15171C', fontWeight: '800', fontSize: 12 },
  viewerClose: { position: 'absolute', top: 54, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(21,23,28,0.7)', alignItems: 'center', justifyContent: 'center' },
  viewerCount: { position: 'absolute', bottom: 40, alignSelf: 'center', color: C.sub, fontWeight: '800' },
  ticketThumb: { width: 96, height: 128, borderRadius: 12, backgroundColor: C.chip, borderWidth: 1, borderColor: C.line },
  ticketAdd: { width: 96, height: 128, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.sub, alignItems: 'center', justifyContent: 'center', gap: 4 },
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
  avatarText: { color: C.onInk, fontWeight: '900', fontSize: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: C.sub, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 34, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.ink, borderRadius: 30, paddingHorizontal: 24, paddingVertical: 16, ...shadow, shadowOpacity: 0.2 },
  fabText: { color: C.onInk, fontWeight: '800', fontSize: 15 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(21,23,28,0.35)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10 },
  sheetTop: { height: 40, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line },
  closeBtn: { position: 'absolute', right: -6, top: 0, width: 42, height: 42, borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 24, fontWeight: '900', color: C.ink, marginBottom: 14, letterSpacing: -0.5 },
  input: { minWidth: 0, backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.ink, fontWeight: '700', borderWidth: 1, borderColor: C.line },
  label: { fontSize: 11, fontWeight: '800', color: C.sub, marginTop: 14, marginBottom: 6, letterSpacing: 0.6 },
  primary: { backgroundColor: C.ink, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryText: { color: C.onInk, fontWeight: '800', fontSize: 16 },
  secondary: { flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: C.card, borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  secondaryText: { color: C.ink, fontWeight: '800', fontSize: 14 },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchOn: { borderWidth: 3, borderColor: C.bg, outlineWidth: 2, outlineColor: C.ink, transform: [{ scale: 1.1 }] } as any,
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  optIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  note: { backgroundColor: C.mintSoft, borderRadius: 14, padding: 12, marginBottom: 12 },
  noteText: { color: C.mint, fontWeight: '800', fontSize: 13 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 11, paddingVertical: 7 },
  two: { flexDirection: 'row', gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  dateBtn: { paddingHorizontal: 8, paddingVertical: 12 },
  dateBtnText: { fontSize: 18, fontWeight: '900', color: C.ink },
  dateInput: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 13, fontWeight: '800', color: C.ink, paddingVertical: 10 },
  curBtn: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, justifyContent: 'center', minHeight: 48 },
  curWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-start', paddingTop: 70, paddingHorizontal: 24 },
  curList: { backgroundColor: C.bg, borderRadius: 22, maxHeight: '55%', padding: 8 },
  curRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12 },
  thumb: { width: 76, height: 110, borderRadius: 12, backgroundColor: C.chip },
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
  yearCard: { backgroundColor: C.night, borderRadius: 24, padding: 18 },
  yearNum: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  yearShare: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  year: { fontSize: 20, fontWeight: '900', color: C.ink, marginBottom: 10, marginTop: 4, letterSpacing: -0.3 },
  memCard: { width: 210, height: 260, borderRadius: 22, overflow: 'hidden', backgroundColor: C.night, marginBottom: 16 },
  memShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, backgroundColor: 'rgba(0,0,0,0.38)' },
  memName: { color: '#fff', fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  memSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', marginTop: 3 },
  memThumb: { width: 96, height: 96, borderRadius: 14, backgroundColor: C.chip },
  journal: { marginLeft: 52, marginTop: 2, backgroundColor: C.card, borderRadius: 18, padding: 12, gap: 10, borderWidth: 1, borderColor: C.line },
  journalEmpty: { marginLeft: 52, marginTop: 2, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' },
  journalPhoto: { width: 120, height: 120, borderRadius: 12, backgroundColor: C.chip },
  journalText: { fontSize: 14, color: C.ink, fontWeight: '600', lineHeight: 21 },
  photoBig: { width: 150, height: 230, borderRadius: 14, backgroundColor: C.chip },
});
}
