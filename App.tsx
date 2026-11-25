import Svg, { Circle, Path } from 'react-native-svg';
import { WORLD, WORLD_H, WORLD_SPHERE, WORLD_W } from './src/worldPaths';
import { projectNE, SMALL_CC, tripPlaces } from './src/visited';
import { makeDemoTrips } from './src/demo';
import { DnaView } from './src/DnaView';
import { MemoryCard } from './src/MemoryCard';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { IAP_AVAILABLE, TERMS_URL, unlocked, usePlus, type PlusApi } from './src/plus';
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
  Alert,
  View,
  useWindowDimensions,
  useColorScheme,
  AppState,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { openMap, openRoute, placeQuery, setMapApp, tripCity } from './src/maps';
import { bookingTz, arrivalTz, fillTimezones, locate } from './src/geo';
import { estimate, fmtKm } from './src/eta';
import MapTab, { tripStops } from './src/MapTab';
import { fetchMeta, firstUrl, platformOf } from './src/wish';
import { stamp, mergeTrip } from './src/merge';
import { photoLimited, setSyncPlus } from './src/sync';
import { fetchPub, fetchShared, loadPhotoMap, localPhoto, normCode, prettyCode, publishTrip, pubUrl, startShare, syncTrip, unpublishTrip, updatePub, type PubTrip } from './src/sync';
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
  hotelNights,
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
  normDate,
  normTime,
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
import { LANGS, bracket, dot, getLang, localeOf, paren, prettyDate, range, setLang, t, typeName } from './src/i18n';
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
import { exportBudgetCsv, exportMemoryBook, exportShioriPdf, exportSettleCsv, exportSettlePdf } from './src/exporters';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { exportBackup, importBackup, mergeBackup } from './src/backup';
import { findPrice } from './src/parse';
import { parseItinerary, PlanDraft } from './src/itinerary';
import { SITE } from './src/sync';
import { InboxItem } from './src/data';
import { TZ_CC, countriesOf, flag, tripCountries } from './src/countries';
import { NEAR, PLACES } from './src/places';
import { AIRPORT_CITY, AIRPORT_TZ } from './src/airports';
import { useCityPhoto } from './src/cityPhoto';
import { dropVaultImage, keepVaultImage, loadVault, saveVault, unlock, VaultDoc } from './src/vault';
import { myTz } from './src/airports';
import { isPdf, isPkpass, keepFile, readPkpass, TicketFile } from './src/pkpass';
import { pickAnyFile, shareTextFile } from './src/files';
import { buildIcs } from './src/ics';
import { mailAddress, fetchMail, ackMail, pickTripFor, mailText } from './src/mailin';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { activityLinks, airhelpLink, carLinks, esimLinks, flightLinks, hotelLinks, inspireLinks, luggageLinks, transferLinks, FindLink } from './src/affiliate';
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
/** 同じ予約が2件以上あるか（同期や取り込みで重なったもの）。消さずに色で知らせる */
const bkCode = (c?: string) => (c ?? '').replace(/[\s-]/g, '').toUpperCase();
const DUP_KEYS: (keyof Booking)[] = ['title', 'start', 'startTime', 'end', 'endTime', 'from', 'to', 'seat', 'price', 'currency'];
const dupKey = (b: Booking) =>
  b.cancelled ? '' : bkCode(b.code).length >= 5 ? `${b.type}|c|${bkCode(b.code)}|${bkCode(b.title)}` : b.title && isDate(b.start) ? `${b.type}|t|${bkCode(b.title)}|${b.start}` : '';
function findDups(trip: Trip): Map<string, Booking[]> {
  const g = new Map<string, Booking[]>();
  for (const b of trip.bookings) {
    const k = dupKey(b);
    if (k) g.set(k, [...(g.get(k) ?? []), b]);
  }
  const out = new Map<string, Booking[]>();
  for (const list of g.values()) if (list.length > 1) for (const b of list) out.set(b.id, list.filter((x) => x.id !== b.id));
  return out;
}
const diffKeys = (a: Booking, b: Booking) =>
  DUP_KEYS.filter((k) => String((a as any)[k] ?? '').trim() !== String((b as any)[k] ?? '').trim());
const dupLabel = (k: keyof Booking, ty: BookingType) =>
  (({ title: t('title'), start: t('startDate'), startTime: t('time'), end: t('endDate'), endTime: t('endTime'), from: placeLabels(ty)[0], to: placeLabels(ty)[1] ?? t('to'), seat: t('seat'), price: t('price'), currency: t('price') }) as Record<string, string>)[k as string] ?? String(k);
/** 一覧に出す「重複」の印（違うところの名前つき） */
function DupTag({ b, twins }: { b: Booking; twins?: Booking[] }) {
  if (!twins?.length) return null;
  const ks = [...new Set(twins.flatMap((x) => diffKeys(b, x)))];
  return (
    <Text style={[s.tlEdge, { color: C.pink }]}>
      {ks.length ? t('dupDiff', { n: twins.length + 1, k: ks.map((k) => dupLabel(k, b.type)).join('・') }) : t('dupSame', { n: twins.length + 1 })}
    </Text>
  );
}
const placeLabels = (ty: BookingType): [string, string | null] =>
  ty === 'flight' ? [t('fromAirport'), t('toAirport')]
  : ty === 'train' || ty === 'bus' ? [t('fromStation'), t('toStation')]
  : ty === 'car' ? [t('pickupAt'), t('returnAt')]
  : ty === 'plan' ? [t('place'), null]
  : [t('address'), null];
const catName = (c: ExpenseCat) => t(('cat' + c[0].toUpperCase() + c.slice(1)) as any);

/** しおりを文字にして共有（LINE・メールなど） */
/** カレンダー（.ics）にして共有メニューを開く。only を渡すとその予定だけ */
function icsOf(trip: Trip, only?: Booking) {
  return buildIcs(
    trip,
    { tzOf: (b) => bookingTz(b, trip), arrTzOf: (b) => arrivalTz(b, trip), typeLabel: typeName, L: { code: t('code'), seat: t('seat'), from: t('from'), to: t('to'), memo: t('memo'), trip: t('icsTrip') } },
    only,
  );
}
const shareIcs = (trip: Trip, only?: Booking) => shareTextFile(`${(only && (only.title || typeName(only.type))) || trip.name}.ics`, icsOf(trip, only), 'text/calendar').catch(() => undefined);

function itineraryText(trip: Trip) {
  const { start, end } = tripRange(trip);
  const lines = [`${bracket(trip.name)} ${start ? prettyDate(start) : ''}${end && end !== start ? range() + prettyDate(end) : ''}`, ''];
  timeline(trip).forEach(({ date, items }) => {
    lines.push(`■ ${start ? t('dayN', { n: daysBetween(start, date) + 1 }) + ' ' : ''}${prettyDate(date)}`);
    items.forEach((it) => {
      const b = it.booking;
      const edge = it.edge === 'start' ? (b.type === 'hotel' ? t('checkin') : t('pickup')) : it.edge === 'end' ? (b.type === 'hotel' ? t('checkout') : t('dropoff')) : '';
      lines.push(`${it.time ?? '--:--'}  ${typeName(b.type)} | ${b.title || ''}${edge ? paren(edge) : ''}`);
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
/** 写真を小さくして data: URI に（PDFの中に入れる用） */
async function toDataUri(u: string): Promise<string | null> {
  try {
    const uri = BUNDLED[u] ? Image.resolveAssetSource(BUNDLED[u])?.uri ?? u : localPhoto(u);
    if (Platform.OS === 'web') return uri;
    const r = await manipulateAsync(uri, [{ resize: { width: 900 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
    return r.base64 ? `data:image/jpeg;base64,${r.base64}` : null;
  } catch {
    return null;
  }
}

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

// クリップボードは許可されないことがある（ブラウザなど）：読めなければ空として扱う
const readClipboard = () => Clipboard.getStringAsync().catch(() => '');
// 共有シートは端末やブラウザによって使えないことがある：失敗しても画面を止めない
const shareSafe = (c: Parameters<typeof Share.share>[0]) => Share.share(c).catch(() => undefined);

/* ---------- 元に戻す（まとめて追加・削除のあとに出す） ---------- */
// その操作で変わった分だけを記録する（共有中に相手が足した分は消さない）
type UndoOp = { key: 'bookings' | 'expenses' | 'inbox' | 'checklist' | 'members'; remove?: string[]; put?: { id: string }[] };
type UndoSnap = { tripId: string; label: string; ops: UndoOp[]; at: number };
const undoBus: { push?: (u: Omit<UndoSnap, 'at'>) => void } = {};
const pushUndo = (tripId: string | undefined, label: string, ops: UndoOp[]) => tripId && ops.length && undoBus.push?.({ tripId, label, ops });
function applyUndo(tr: Trip, ops: UndoOp[]): Trip {
  const out: any = { ...tr };
  for (const op of ops) {
    let arr: any[] = [...((tr as any)[op.key] ?? [])].filter((x) => !op.remove?.includes(x.id));
    for (const it of op.put ?? []) {
      const i = arr.findIndex((x) => x.id === it.id);
      if (i >= 0) arr[i] = it;
      else arr = op.key === 'expenses' || op.key === 'inbox' ? [it, ...arr] : [...arr, it];
    }
    out[op.key] = arr;
  }
  return out;
}

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
  const [paywall, setPaywall] = useState<{ tripId?: string } | null>(null);
  const plusApi = usePlus((tripId) => updateTripsRef.current((all) => all.map((x) => (x.id === tripId ? { ...x, pass: Date.now() } : x))));
  const updateTripsRef = useRef<(fn: (all: Trip[]) => Trip[]) => void>(() => {});
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
  const [pubIn, setPubIn] = useState<PubTrip | null>(null);
  const [dnaIn, setDnaIn] = useState<string | null>(null);
  const [settleIn, setSettleIn] = useState<{ n: string; c: string; p: { f: string; t: string; a: number }[] } | null>(null);
  const url = ExpoLinking.useURL();
  useEffect(() => {
    if (url && url.includes('join?c=')) {
      setJoining(normCode(url.split('join?c=')[1] ?? ''));
      return;
    }
    // 友達から届いた旅のDNA（tripfold://dna?c=… / tripfold.net/dna/…）→ 相性を見る
    const dm = url?.match(/dna(?:\?c=|\/)([0-9a-z]{16})/i);
    if (dm) {
      setDnaIn(dm[1].toLowerCase());
      return;
    }
    // みんなのしおりのページの「Tripfold にコピーする」
    const pm = url?.match(/pub\?id=([a-z0-9]{10})/);
    if (pm) {
      fetchPub(pm[1]).then(setPubIn).catch(() => Alert.alert(t('pubNotFound')));
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
      setTrips(tr0);
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
  // 共有の状態：最後にサーバーと話せた時刻と、つながらないときの理由（画面に出す）
  const [syncStat, setSyncStat] = useState<Record<string, { ok: number; err?: string }>>({});
  const syncAll = async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      for (const tr of tripsRef.current.filter((x) => x.share)) {
        const seq = editSeq.current[tr.id] ?? 0;
        try {
          const r = await syncTrip(tr);
          if (r) applyRemote(tr.id, r.trip, r.rev, seq);
          setSyncStat((p) => ({ ...p, [tr.id]: { ok: Date.now() } }));
        } catch (e: any) {
          const err = e?.status === 404 ? 'syncErrGone' : e?.status ? 'syncErrServer' : e?.message === 'bad trip' ? 'syncErrData' : 'syncErrNet';
          setSyncStat((p) => ({ ...p, [tr.id]: { ok: p[tr.id]?.ok ?? 0, err } }));
        }
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
  // 転送されたメール（<10文字>@tripfold.net）を取りに行き、日付の合う旅行の「読み取り待ち」に入れる
  const [mailOpen, setMailOpen] = useState(false);
  const pulling = useRef(false);
  const pullMail = async () => {
    if (pulling.current) return;
    pulling.current = true;
    try {
      const items = await fetchMail();
      if (!items.length) return;
      const cur = [...tripsRef.current];
      let added = 0;
      let target: string | null = null;
      for (const m of [...items].reverse()) {
        if (m.confirm) {
          // Gmail の自動転送を設定したときの確認メール：確認のページを開くだけ
          const link = m.confirm;
          Alert.alert(t('mailGmailTitle'), t('mailGmailBody'), [
            { text: t('close'), style: 'cancel' },
            { text: t('mailGmailOpen'), onPress: () => Linking.openURL(link).catch(() => undefined) },
          ]);
          await ackMail(m.id);
          continue;
        }
        const item = { id: 'm_' + m.id, text: mailText(m), at: m.at };
        let id = pickTripFor(cur, item.text, todayStr());
        if (!id) {
          const tr: Trip = {
            id: uid(),
            name: t('newTrip'),
            emoji: COVERS[Math.floor(Math.random() * COVERS.length)],
            members: [{ id: 'me', name: settings.myName || t('me') }],
            bookings: [],
            checklist: t('defaultPack').split(',').map((x) => ({ id: uid(), text: x, done: false })),
            inbox: [item],
            createdAt: Date.now(),
          };
          cur.unshift(tr);
          updateTrips((all) => [tr, ...all]);
          id = tr.id;
        } else {
          const tid = id;
          const i = cur.findIndex((x) => x.id === tid);
          if (i >= 0) cur[i] = { ...cur[i], inbox: [item, ...(cur[i].inbox ?? [])] };
          updateTrip(tid, (tr) => (tr.inbox?.some((x) => x.id === item.id) ? tr : { ...tr, inbox: [item, ...(tr.inbox ?? [])] }));
        }
        target = id;
        added++;
        await ackMail(m.id);
      }
      if (added && target) {
        const go = target;
        Alert.alert(t('mailArrived', { n: added }), t('mailArrivedSub'), [
          { text: t('close'), style: 'cancel' },
          { text: t('mailOpenTrip'), onPress: () => setOpenId(go) },
        ]);
      }
    } finally {
      pulling.current = false;
    }
  };
  useEffect(() => {
    if (!ready) return;
    pullMail();
    const iv = setInterval(() => AppState.currentState === 'active' && pullMail(), 60000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && pullMail());
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [ready]);
  const [undo, setUndo] = useState<UndoSnap | null>(null);
  useEffect(() => {
    undoBus.push = (u) => setUndo({ ...u, at: Date.now() });
    return () => {
      undoBus.push = undefined;
    };
  }, []);
  useEffect(() => {
    if (!undo) return;
    const tm = setTimeout(() => setUndo((x) => (x === undo ? null : x)), 12000);
    return () => clearTimeout(tm);
  }, [undo]);
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

  updateTripsRef.current = updateTrips;
  useEffect(() => { setSyncPlus(plusApi.plus); }, [plusApi.plus]);
  // Plus の人が共有している旅は、一緒に編集しているメンバーも有料機能を使えるようにする
  useEffect(() => {
    if (plusApi.plus && trips.some((x) => x.share && !x.pass)) updateTrips((all) => all.map((x) => (x.share && !x.pass ? { ...x, pass: Date.now() } : x)));
  }, [plusApi.plus, trips]);
  const plusCtx = useMemo(() => ({ api: plusApi, open: (tripId?: string) => setPaywall({ tripId }) }), [plusApi]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <PlusCtx.Provider value={plusCtx}>
    <View key={(dark ? 'dark' : 'light') + settings.lang} style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {!!paywall && <PaywallSheet tripId={paywall.tripId} trips={trips} api={plusApi} onClose={() => setPaywall(null)} />}
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
          onDna={() => setDnaIn('')}
          onMail={() => setMailOpen(true)}
          onDemo={() =>
            updateTrips((all) => (all.some((tr) => tr.id.startsWith('tpl_')) ? all.filter((tr) => !tr.id.startsWith('tpl_')) : [...makeDemoTrips(todayStr()), ...all]))
          }
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

      <Sheet visible={mailOpen} onClose={() => setMailOpen(false)}>
        {mailOpen && <MailSheet onCheck={pullMail} />}
      </Sheet>

      <Sheet visible={dnaIn !== null} onClose={() => setDnaIn(null)}>
        <View style={{ paddingHorizontal: 4, paddingBottom: 8 }}>{dnaIn !== null && <DnaView trips={trips} rate={rate} friendCode={dnaIn || undefined} />}</View>
      </Sheet>
      {!!pubIn && (
        <ImportPubSheet
          pub={pubIn}
          onClose={() => setPubIn(null)}
          onCopy={(start) => {
            const p = pubIn.trip;
            const tr: Trip = {
              id: uid(),
              name: (!(getLang() === 'ja') && p.nameEn) || p.name,
              emoji: p.emoji && COVERS.includes(p.emoji) ? p.emoji : COVERS[Math.floor(Math.random() * COVERS.length)],
              members: [{ id: 'me', name: settings.myName || t('me') }],
              bookings: p.items.map((it, i) => ({
                id: uid(),
                type: (TYPES.some((x) => x.id === it.type) ? it.type : 'plan') as BookingType,
                title: (!(getLang() === 'ja') && it.en) || it.title,
                start: shiftDate(start, it.day - 1),
                startTime: it.time,
                end: it.endDay ? shiftDate(start, it.endDay - 1) : undefined,
                endTime: it.endTime,
                // 公式しおりは英語の名前と都市を「場所」に入れて、地図で見つかりやすくする
                from: it.from ?? (it.en && p.cities[0] ? `${it.en}, ${p.cities[0]}` : undefined),
                to: it.to,
                memo: it.tip ? ((getLang() === 'ja') ? it.tip.ja : it.tip.en) || undefined : undefined,
                createdAt: Date.now() + i,
              })),
              checklist: t('defaultPack').split(',').map((x) => ({ id: uid(), text: x, done: false })),
              createdAt: Date.now(),
            };
            updateTrips((all) => [tr, ...all]);
            setPubIn(null);
            setOpenId(tr.id);
          }}
        />
      )}

      {sharing && trips.some((x) => x.id === sharing) && (
        <ShareSheet
          trip={trips.find((x) => x.id === sharing)!}
          stat={syncStat[sharing]}
          rate={rate}
          onSyncNow={syncAll}
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
            const tr0 = trips.find((x) => x.id === adding.tripId);
            const old = tr0?.bookings.find((x) => x.id === b.id);
            const inboxItem = inboxId ? tr0?.inbox?.find((x) => x.id === inboxId) : undefined;
            pushUndo(adding.tripId, old ? t('undoSaved') : t('undoAdded', { n: 1 }), [
              old ? { key: 'bookings', put: [old] } : { key: 'bookings', remove: [b.id] },
              ...(inboxItem ? [{ key: 'inbox' as const, put: [inboxItem] }] : []),
            ]);
            updateTrip(adding.tripId, (tr) => ({
              ...tr,
              bookings: tr.bookings.some((x) => x.id === b.id) ? tr.bookings.map((x) => (x.id === b.id ? b : x)) : [...tr.bookings, b],
              inbox: inboxId ? (tr.inbox ?? []).filter((x) => x.id !== inboxId) : tr.inbox,
            }));
            setAdding(null);
          }}
          onSaveMany={(list) => {
            // 2回押しても同じ予定が二重にならないように
            const have = trips.find((x) => x.id === adding.tripId)?.bookings ?? [];
            const fresh = list.filter((x) => !have.some((y) => y.id === x.id));
            pushUndo(adding.tripId, t('undoAdded', { n: fresh.length }), [{ key: 'bookings', remove: fresh.map((x) => x.id) }]);
            updateTrip(adding.tripId, (tr) => ({ ...tr, bookings: [...tr.bookings, ...list.filter((x) => !tr.bookings.some((y) => y.id === x.id))] }));
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
            pushUndo(detailTrip.id, t('undoDeleted', { n: 1 }), [{ key: 'bookings', put: [detailBooking] }]);
            updateTrip(detailTrip.id, (tr) => ({ ...tr, bookings: tr.bookings.filter((x) => x.id !== detailBooking.id) }));
            setDetail(null);
          }}
          onUpdate={(nb) => {
            // 写真・ファイルを長押しで消したときは元に戻せるように
            if ((nb.photos?.length ?? 0) < (detailBooking.photos?.length ?? 0) || (nb.files?.length ?? 0) < (detailBooking.files?.length ?? 0))
              pushUndo(detailTrip.id, t('undoDeleted', { n: 1 }), [{ key: 'bookings', put: [detailBooking] }]);
            updateTrip(detailTrip.id, (tr) => ({ ...tr, bookings: tr.bookings.map((x) => (x.id === nb.id ? nb : x)) }));
          }}
        />
      )}

      {!!undo && (
        <View style={[s.undoBar, { bottom: insets.bottom + 96 }]}>
          <Text style={s.undoText} numberOfLines={1}>{undo.label}</Text>
          <Pressable
            hitSlop={10}
            onPress={() => {
              const u = undo;
              setUndo(null);
              updateTrip(u.tripId, (tr) => applyUndo(tr, u.ops));
            }}
          >
            <Text style={s.undoBtn}>{t('undoBtn')}</Text>
          </Pressable>
        </View>
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
    </PlusCtx.Provider>
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
  onDemo,
  onDna,
  onMail,
}: {
  trips: Trip[];
  rate: RateInfo;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDna: () => void;
  onMail: () => void;
  onSettings: () => void;
  onOpenBooking: (tripId: string, id: string) => void;
  onDemo?: () => void;
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
      <Inspire trips={trips} />
      {/* みんなのしおり（Web）の紹介。購入の案内ではなく、公開されている旅程を見る入口 */}
      <Pressable style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }]} onPress={() => Linking.openURL(`${SITE}/t`)}>
        <Icon name="globe-outline" size={22} color={C.pink} />
        <View style={{ flex: 1 }}>
          <Text style={[s.hint, { color: C.ink, fontWeight: '800', fontSize: 15 }]}>{t('pubHomeTitle')}</Text>
          <Text style={s.hint}>{t('pubHomeSub')}</Text>
        </View>
        <Icon name="open-outline" size={18} color={C.sub} />
      </Pressable>
      {/* 旅のDNA（これまでの旅から旅のタイプを分析。友達と相性も見られる） */}
      <Pressable style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }]} onPress={onDna}>
        <Icon name="color-filter-outline" size={22} color={C.pink} />
        <View style={{ flex: 1 }}>
          <Text style={[s.hint, { color: C.ink, fontWeight: '800', fontSize: 15 }]}>{t('dnaTitle')}</Text>
          <Text style={s.hint}>{t('dnaHomeSub')}</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={C.sub} />
      </Pressable>
      {/* メールを転送して予定を取り込む */}
      <Pressable style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }]} onPress={onMail}>
        <Icon name="mail-unread-outline" size={22} color={C.pink} />
        <View style={{ flex: 1 }}>
          <Text style={[s.hint, { color: C.ink, fontWeight: '800', fontSize: 15 }]}>{t('mailHomeTitle')}</Text>
          <Text style={s.hint}>{t('mailHomeSub')}</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={C.sub} />
      </Pressable>
      <Memories trips={sorted.filter((tr) => isPast(tr))} onOpen={onOpen} />
      <YearSummary trips={trips} rate={rate} />
      {Platform.OS === 'web' && onDemo && (
        // Web確認版だけ：おすすめのしおり4つ（実在の場所・合計100件）を入れる・消す
        <Pressable style={[s.ghostBtn, { alignSelf: 'center', marginTop: 24 }]} onPress={onDemo}>
          <Icon name="flask-outline" size={16} />
          <Text style={s.ghostBtnText}>{trips.some((tr) => tr.id.startsWith('tpl_')) ? 'テスト用のしおりを消す' : 'おすすめのしおり4つ（100件）を入れる'}</Text>
        </Pressable>
      )}
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

function WorldMap({ visited }: { visited: Set<string> }) {
  // 行った国を色付けした世界地図。小さすぎて見えない国は点で示す
  const dots = [...visited].filter((cc) => !WORLD[cc] && SMALL_CC[cc]).map((cc) => projectNE(...SMALL_CC[cc]));
  return (
    <View style={{ marginTop: 14, aspectRatio: WORLD_W / WORLD_H }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}>
        <Path d={WORLD_SPHERE} fill="rgba(255,255,255,0.04)" />
        {Object.entries(WORLD).map(([cc, d]) => (
          <Path key={cc} d={d} fill={visited.has(cc) ? '#FF8FB1' : 'rgba(255,255,255,0.16)'} stroke="rgba(0,0,0,0.25)" strokeWidth={0.6} />
        ))}
        {dots.map(([x, y], k) => (
          <Circle key={k} cx={x} cy={y} r={7} fill="#FF8FB1" stroke="#fff" strokeWidth={1.5} />
        ))}
      </Svg>
    </View>
  );
}

function YearSummary({ trips }: { trips: Trip[]; rate: RateInfo }) {
  const y = todayStr().slice(0, 4);
  const mine = trips.filter((tr) => (tripRange(tr).start ?? '').startsWith(y));
  if (!mine.length) return null;
  // 泊数：旅の日数-1。ホテルの入力が一部だけでも（連泊を1件で入れていない等）少なく数えないよう、多いほうを使う
  const nights = mine.reduce((a, tr) => {
    const h = hotelNights(tr);
    const { start, end } = tripRange(tr);
    const d = isDate(start) && isDate(end) ? daysBetween(start!, end!) : 0;
    return a + Math.max(h, Math.max(0, isFinite(d) ? d : 0));
  }, 0);
  const countries = new Set<string>();
  const cities = new Map<string, { ja: string; en: string }>();
  mine.forEach((tr) => {
    const p = tripPlaces(tr);
    p.countries.forEach((c) => countries.add(c));
    p.cities.forEach((v, k) => cities.set(k, v));
    tripCountries(tr).forEach((c) => countries.add(c));
  });
  const cityNames = [...cities.values()].map((c) => (getLang() === 'ja' ? c.ja : c.en));
  const msg = `${t('yearTitle', { y })}\n${t('ysTrips')} ${mine.length} / ${t('ysCountries')} ${countries.size} / ${t('ysPlaces')} ${cities.size} / ${t('ysNights')} ${nights}${countries.size ? `\n${[...countries].map(flag).join('')}` : ''}${cityNames.length ? `\n${cityNames.join('・')}` : ''}\n— Tripfold`;
  return (
    <>
      <Text style={[s.sec, { marginTop: 14 }]}>{t('yearTitle', { y }).toUpperCase()}</Text>
      <View style={s.yearCard}>
        <View style={{ flexDirection: 'row' }}>
          {[
            [t('ysTrips'), mine.length],
            [t('ysCountries'), countries.size],
            [t('ysPlaces'), cities.size],
            [t('ysNights'), nights],
          ].map(([k, v]) => (
            <View key={String(k)} style={{ flex: 1, paddingVertical: 6 }}>
              <Text style={[s.yearNum, { fontSize: 30 }]}>{v}</Text>
              <Text style={s.passK} numberOfLines={1}>
                {String(k).toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
        <WorldMap visited={countries} />
        {cityNames.length > 0 && (
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: '700', marginTop: 10, lineHeight: 19 }}>
            {[...countries].map(flag).join(' ')}
            {'  '}
            {cityNames.join('・')}
          </Text>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
          <Pressable onPress={() => shareSafe({ message: msg })} style={s.yearShare}>
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
  const selOn = !!useSelFloat();
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
            {start ? `${prettyDate(start)}${end && end !== start ? range() + prettyDate(end) : ''}` : t('undated')}
            {total > 0 ? `  ${dot()}  ${fmtMoney(Math.round(total), rate.base)}` : ''}
          </Text>
        </Pressable>
        <Pressable onPress={onShare} hitSlop={12} style={s.back}>
          <Icon name="share-outline" size={19} />
        </Pressable>
      </View>
      <View style={s.tabs}>
        {(['plan', 'bookings', 'map', 'money', 'pack'] as Tab[]).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={s.tab}>
            <Text style={[s.tabText, tab === k && { color: C.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
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
        {tab === 'plan' && <PlanTab trip={trip} wx={wx} onOpen={onOpen} onJournal={setJournalDay} onAddPlan={onAddPlan} onChange={onChange} />}
        {tab === 'bookings' && (
          <BookingsTab trip={trip} rate={rate} onOpen={onOpen} onChange={onChange} onInbox={onInbox} onDropInbox={(id) => {
            const it = trip.inbox?.find((x) => x.id === id);
            if (it) pushUndo(trip.id, t('undoDeleted', { n: 1 }), [{ key: 'inbox', put: [it] }]);
            onChange((tr) => ({ ...tr, inbox: (tr.inbox ?? []).filter((x) => x.id !== id) }));
          }} />
        )}
        {tab === 'map' && <MapTab trip={trip} onOpen={onOpen} />}
        {tab === 'money' && <MoneyTab trip={trip} rate={rate} onChange={onChange} onShare={onShare} />}
        {tab === 'pack' && <PackTab trip={trip} onChange={onChange} />}
        <Pressable onPress={() => (sure ? onDelete() : setSure(true))} style={{ alignSelf: 'center', marginTop: 30 }}>
          <Text style={{ color: sure ? C.pink : C.sub, fontWeight: '700' }}>{sure ? t('deleteSure') : t('deleteTrip')}</Text>
        </Pressable>
      </ScrollView>
      <FloatingSelBar />
      {(tab === 'plan' || tab === 'bookings') && !selOn && (
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
/** みんなのしおりに公開する（共有画面の中） */
function PublishBlock({ trip, defaultName, onChange }: { trip: Trip; defaultName: string; onChange: (t: Trip) => void }) {
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState(defaultName);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const places = () => {
    const ja = getLang() === 'ja';
    const pl = tripPlaces(trip);
    return { cities: [...pl.cities.values()].map((c) => (ja ? c.ja : c.en)), countries: [...new Set([...pl.countries, ...tripCountries(trip)])] };
  };
  const dated = trip.bookings.filter((b) => !b.cancelled && isDate(b.start)).length;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch {
      setMsg(t('syncErrNet'));
    }
    setBusy(false);
  };
  const url = trip.pub ? pubUrl(trip.pub.id) : '';
  return (
    <>
      <Text style={[s.kicker, { marginTop: 22, marginBottom: 8 }]}>{t('pubKicker').toUpperCase()}</Text>
      {trip.pub ? (
        <View style={s.card}>
          <Text style={[s.hint, { lineHeight: 20 }]}>{t('pubLive')}</Text>
          <Pressable onPress={() => Linking.openURL(url)}>
            <Text style={[s.hint, { color: C.ink, textDecorationLine: 'underline', marginTop: 6 }]} numberOfLines={1}>{url}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => shareSafe({ message: `${trip.name}\n${url}` })}>
              <Icon name="share-outline" size={16} />
              <Text style={s.secondaryText}>{t('pubShare')}</Text>
            </Pressable>
            <Pressable
              style={[s.secondary, { flex: 1 }, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={() => run(async () => {
                const p = places();
                await updatePub(trip, author.trim(), note.trim(), p.cities, p.countries, getLang());
                setMsg(t('pubUpdated'));
              })}
            >
              <Icon name="refresh-outline" size={16} />
              <Text style={s.secondaryText}>{t('pubUpdate')}</Text>
            </Pressable>
          </View>
          <Pressable
            disabled={busy}
            onPress={() =>
              Alert.alert(t('pubStopQ'), '', [
                { text: t('cancel'), style: 'cancel' },
                { text: t('pubStop'), style: 'destructive', onPress: () => run(async () => {
                  await unpublishTrip(trip).catch((e) => { if (e?.status !== 404) throw e; });
                  onChange({ ...trip, pub: undefined });
                }) },
              ])
            }
          >
            <Text style={[s.hint, { color: C.pink, textAlign: 'center', marginTop: 12 }]}>{t('pubStop')}</Text>
          </Pressable>
        </View>
      ) : !open ? (
        <Pressable style={s.secondary} onPress={() => setOpen(true)} disabled={dated < 2}>
          <Icon name="globe-outline" size={17} />
          <Text style={s.secondaryText}>{dated < 2 ? t('pubNeedMore') : t('pubOpen')}</Text>
        </Pressable>
      ) : (
        <View style={s.card}>
          <Text style={[s.hint, { lineHeight: 20 }]}>{t('pubHint')}</Text>
          <Text style={s.label}>{t('pubAuthor')}</Text>
          <TextInput style={s.input} value={author} onChangeText={setAuthor} placeholder={t('pubAuthorPh')} placeholderTextColor={C.sub} maxLength={30} />
          <Text style={s.label}>{t('pubNote')}</Text>
          <TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} placeholder={t('pubNotePh')} placeholderTextColor={C.sub} multiline maxLength={600} />
          <Pressable
            style={[s.primary, { marginTop: 12 }, busy && { opacity: 0.5 }]}
            disabled={busy}
            onPress={() => run(async () => {
              const p = places();
              const r = await publishTrip(trip, author.trim(), note.trim(), p.cities, p.countries, getLang());
              onChange({ ...trip, pub: { id: r.id, key: r.key } });
              setOpen(false);
            })}
          >
            {busy ? <ActivityIndicator color={C.onInk} /> : <Text style={s.primaryText}>{t('pubGo')}</Text>}
          </Pressable>
        </View>
      )}
      {!!msg && <Text style={[s.hint, { marginTop: 6 }]}>{msg}</Text>}
    </>
  );
}

/** みんなのしおりを自分の旅にコピーする */
function ImportPubSheet({ pub, onClose, onCopy }: { pub: PubTrip; onClose: () => void; onCopy: (start: string) => void }) {
  const [start, setStart] = useState(shiftDate(todayStr(), 14));
  const p = pub.trip;
  return (
    <Sheet visible onClose={onClose}>
      <Text style={s.kicker}>{t('pubKicker').toUpperCase()}</Text>
      <Text style={s.sheetTitle}>{(p.emoji ? p.emoji + ' ' : '') + p.name}</Text>
      <Text style={[s.hint, { marginBottom: 12 }]}>
        {[p.countries.map(flag).join(''), p.cities.join(' · '), t('pubDays', { n: p.days }), pub.author ? `by ${pub.author}` : ''].filter(Boolean).join('  ')}
      </Text>
      <Text style={[s.hint, { lineHeight: 20 }]}>{t('pubCopyHint', { n: p.items.length })}</Text>
      <DateField label={t('pubStart')} value={start} onChange={setStart} />
      <Pressable style={[s.primary, { marginTop: 14 }]} disabled={!isDate(start)} onPress={() => onCopy(start)}>
        <Text style={s.primaryText}>{t('pubCopy')}</Text>
      </Pressable>
    </Sheet>
  );
}

function PlusBadge() {
  return (
    <View style={{ backgroundColor: C.pink, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 4 }}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>PLUS</Text>
    </View>
  );
}

/** 購入画面：トリップパス（この旅だけ）と Tripfold Plus（年額） */
function PaywallSheet({ tripId, trips, api, onClose }: { tripId?: string; trips: Trip[]; api: PlusApi; onClose: () => void }) {
  const trip = trips.find((x) => x.id === tripId);
  const hasPass = !!trip?.pass;
  // 買えたら閉じる
  const was = useRef({ plus: api.plus, pass: hasPass });
  useEffect(() => {
    if ((!was.current.plus && api.plus) || (!was.current.pass && hasPass)) onClose();
  }, [api.plus, hasPass]);
  const benefits: [string, string][] = [
    ['images-outline', t('plusB1')],
    ['book-outline', t('plusB2')],
    ['people-outline', t('plusB3')],
    ['heart-outline', t('plusB4')],
  ];
  return (
    <Sheet visible onClose={onClose}>
      <Text style={s.kicker}>TRIPFOLD PLUS</Text>
      <Text style={s.sheetTitle}>{t('plusTitle')}</Text>
      {api.plus ? (
        <View style={s.card}>
          <Text style={[s.hint, { color: C.ink, fontWeight: '700' }]}>{t('plusActive')}</Text>
          <Pressable onPress={api.manage}>
            <Text style={[s.hint, { textDecorationLine: 'underline', marginTop: 6 }]}>{t('plusManage')}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[s.card, { gap: 10 }]}>
        {benefits.map(([ic, txt]) => (
          <View key={txt} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name={ic as any} size={18} color={C.pink} />
            <Text style={[s.hint, { color: C.ink, flex: 1, lineHeight: 20 }]}>{txt}</Text>
          </View>
        ))}
      </View>
      {!api.plus && (
        <>
          {!!trip && !hasPass && (
            <Pressable style={[s.primary, { marginTop: 12 }, api.busy && { opacity: 0.5 }]} disabled={api.busy || !api.storeAvailable} onPress={() => api.buyPass(trip.id)}>
              <Text style={s.primaryText}>{t('plusPassBtn', { p: api.prices.pass ?? '¥500' })}</Text>
              <Text style={[s.primaryText, { fontSize: 12, fontWeight: '600', opacity: 0.8 }]}>{t('plusPassSub', { name: trip.name })}</Text>
            </Pressable>
          )}
          <Pressable style={[trip && !hasPass ? s.secondary : s.primary, { marginTop: 10, flexDirection: 'column' }, api.busy && { opacity: 0.5 }]} disabled={api.busy || !api.storeAvailable} onPress={api.buyPlus}>
            <Text style={trip && !hasPass ? s.secondaryText : s.primaryText}>{t('plusYearBtn', { p: api.prices.plus ?? '¥3,000' })}</Text>
            <Text style={[trip && !hasPass ? s.hint : s.primaryText, { fontSize: 12, fontWeight: '600', opacity: 0.8 }]}>{t('plusYearSub')}</Text>
          </Pressable>
          {api.busy && <ActivityIndicator style={{ marginTop: 10 }} color={C.ink} />}
          {!!api.error && <Text style={[s.hint, { color: C.pink, marginTop: 8 }]}>{t('plusBuyErr')}</Text>}
          {!api.storeAvailable && process.env.EXPO_PUBLIC_PAYWALL_DEMO !== '1' && <Text style={[s.hint, { marginTop: 8 }]}>{t('plusNoStore')}</Text>}
          <Pressable onPress={api.restore} disabled={api.busy}>
            <Text style={[s.hint, { textAlign: 'center', textDecorationLine: 'underline', marginTop: 14 }]}>{t('plusRestore')}</Text>
          </Pressable>
        </>
      )}
      <Text style={[s.hint, { fontSize: 11, lineHeight: 16, marginTop: 14 }]}>{t('plusLegal')}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 }}>
        <Pressable onPress={() => Linking.openURL(TERMS_URL)}><Text style={[s.hint, { fontSize: 11, textDecorationLine: 'underline' }]}>{t('plusTerms')}</Text></Pressable>
        <Pressable onPress={() => Linking.openURL(`${SITE}/privacy`)}><Text style={[s.hint, { fontSize: 11, textDecorationLine: 'underline' }]}>{t('privacyPolicy')}</Text></Pressable>
        <Pressable onPress={() => Linking.openURL(`${SITE}/legal`)}><Text style={[s.hint, { fontSize: 11, textDecorationLine: 'underline' }]}>{t('legalNotice')}</Text></Pressable>
      </View>
    </Sheet>
  );
}

function ShareSheet({ trip, stat, rate, onSyncNow, onClose, onShared, onStop }: { trip: Trip; stat?: { ok: number; err?: string }; rate: RateInfo; onSyncNow: () => Promise<void>; onClose: () => void; onShared: (t: Trip) => void; onStop: () => void }) {
  const [syncBusy, setSyncBusy] = useState(false);
  // 「今日 14:05」「11/21(土) 9:30」のように日付も出す
  const hhmm = (ms: number) => {
    const d = new Date(ms);
    const p2 = (n: number) => String(n).padStart(2, '0');
    const day = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    const time = `${d.getHours()}:${p2(d.getMinutes())}`;
    const n = new Date();
    const today = `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}`;
    return `${day === today ? t('todayShort') : prettyDate(day)} ${time}`;
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);
  const code = trip.share?.code;
  const meId = trip.myId ?? trip.members.find((m) => m.id === 'me')?.id ?? trip.members[0]?.id;
  const meName = trip.members.find((m) => m.id === meId)?.name ?? '';
  const generic = (n: string) => !n.trim() || n === '自分' || n.toLowerCase() === 'me';
  const [myName, setMyName] = useState(generic(meName) ? '' : meName);
  const invite = code ? t('inviteText', { name: trip.name, code: prettyCode(code), link: `${SITE}/j/${code}` }) : '';
  const [pdfBusy, setPdfBusy] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const plusCtx = useContext(PlusCtx);
  return (
    <Sheet visible onClose={onClose}>
      <Text style={s.sheetTitle}>{t('shareTitle')}</Text>
      {!!code && photoLimited[trip.id] && !unlocked(trip, !!plusCtx.api?.plus) && (
        <Pressable style={[s.card, { borderWidth: 1, borderColor: C.pink, marginBottom: 12 }]} onPress={() => plusCtx.open(trip.id)}>
          <Text style={[s.hint, { color: C.ink, lineHeight: 20 }]}>{t('plusPhotoLimit')}</Text>
          <Text style={[s.hint, { color: C.pink, fontWeight: '700', marginTop: 4 }]}>{t('plusSee')}</Text>
        </Pressable>
      )}
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
            {stat?.ok ? t('checkedAt', { t: hhmm(stat.ok) }) : trip.share?.syncedAt ? `${t('synced')} ${hhmm(trip.share.syncedAt)}` : ''}
            {trip.share?.dirty ? `  ${dot()}  ${t('pending')}` : ''}
          </Text>
          {!!stat?.err && <Text style={[s.hint, { fontSize: 12, marginTop: 6, color: C.pink, textAlign: 'center' }]}>{t(stat.err as any)}</Text>}
          <Pressable
            disabled={syncBusy}
            onPress={async () => {
              setSyncBusy(true);
              await onSyncNow().catch(() => {});
              setSyncBusy(false);
            }}
            style={{ marginTop: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            {syncBusy ? <ActivityIndicator size="small" color={C.sub} /> : <Icon name="refresh" size={14} color={C.sub} />}
            <Text style={[s.hint, { fontSize: 12 }]}>{t('syncNow')}</Text>
          </Pressable>
          <Pressable style={[s.primary, { alignSelf: 'stretch' }]} onPress={() => shareSafe({ message: invite })}>
            <Text style={s.primaryText}>{t('sendCode')}</Text>
          </Pressable>
          <Pressable onPress={() => (sure ? (onStop(), onClose()) : setSure(true))} style={{ marginTop: 14 }}>
            <Text style={{ color: sure ? C.pink : C.sub, fontWeight: '700' }}>{sure ? t('stopShareSure') : t('stopShare')}</Text>
          </Pressable>
        </View>
      )}
      {!!err && <Text style={[s.hint, { color: C.pink, marginTop: 8 }]}>{err}</Text>}
      <PublishBlock trip={trip} defaultName={myName} onChange={onShared} />
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
      <Pressable style={[s.secondary]} onPress={() => shareSafe({ message: itineraryText(trip) })}>
        <Icon name="document-text-outline" size={17} />
        <Text style={s.secondaryText}>{t('sendItinerary')}</Text>
      </Pressable>
      {trip.bookings.some((b) => !b.cancelled && isDate(b.start)) && (
        <>
          <Pressable style={[s.secondary, { marginTop: 8 }]} onPress={() => shareIcs(trip)}>
            <Icon name="calendar-outline" size={17} />
            <Text style={s.secondaryText}>{t('addTripToCal')}</Text>
          </Pressable>
          <Text style={[s.hint, { fontSize: 11, marginTop: 4 }]}>{t('calHint')}</Text>
        </>
      )}
      {/* 家計簿アプリ World Budget Book に旅費を送る（入っていなければ App Store を開く） */}
      {(trip.bookings.some((b) => b.price && b.currency && !b.cancelled) || (trip.expenses ?? []).length > 0) && (
        <Pressable
          style={[s.secondary, { marginTop: 8 }]}
          onPress={() => {
            const items = [
              ...trip.bookings.filter((b) => !b.cancelled && b.price && b.currency && isDate(b.start)).map((b) => ({ id: b.id, date: b.start, amount: Number(b.price), cur: b.currency, kind: b.type, title: b.title || typeName(b.type) })),
              ...(trip.expenses ?? []).map((e) => ({ id: e.id, date: e.date, amount: e.amount, cur: e.currency, kind: e.cat, title: e.title })),
            ].slice(0, 300);
            const url = `worldbudgetbook://import?d=${encodeURIComponent(JSON.stringify({ v: 1, trip: { id: trip.id, name: trip.name }, items }))}`;
            Linking.openURL(url).catch(() => Linking.openURL('https://apps.apple.com/app/id6832550941'));
          }}
        >
          <Icon name="wallet-outline" size={17} />
          <Text style={s.secondaryText}>{t('toWbb')}</Text>
        </Pressable>
      )}
      <Pressable style={[s.secondary, { marginTop: 8 }]} onPress={() => setCardOpen(true)}>
        <Icon name="images-outline" size={17} />
        <Text style={s.secondaryText}>{t('memoryCard')}</Text>
      </Pressable>
      <Sheet visible={cardOpen} onClose={() => setCardOpen(false)}>
        <View style={{ paddingHorizontal: 4, paddingBottom: 8 }}>
          <Text style={{ color: C.ink, fontWeight: '900', fontSize: 20, marginBottom: 4 }}>{t('memoryCard')}</Text>
          <Text style={[s.hint, { marginBottom: 12 }]}>{t('memoryCardSub')}</Text>
          {cardOpen && <MemoryCard trip={trip} />}
        </View>
      </Sheet>
      {Object.values(trip.journal ?? {}).some((j) => j?.text || j?.photos?.length) && (
        <Pressable
          style={[s.secondary, { marginTop: 8 }, pdfBusy && { opacity: 0.5 }]}
          disabled={pdfBusy}
          onPress={async () => {
            if (!unlocked(trip, !!plusCtx.api?.plus)) return plusCtx.open(trip.id);
            setPdfBusy(true);
            try {
              await exportMemoryBook(trip, toDataUri);
            } catch {}
            setPdfBusy(false);
          }}
        >
          <Icon name="book-outline" size={17} />
          <Text style={s.secondaryText}>{t('memoryBookMake')}</Text>
          {!unlocked(trip, !!plusCtx.api?.plus) && <PlusBadge />}
        </Pressable>
      )}
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
      {list.length === 0 ? null : (
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
                      ♥ {w.likes.map((i) => trip.members.find((m) => m.id === i)?.name ?? '').filter(Boolean).join(dot())}
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
              const txt = await readClipboard();
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

function PlanTab({ trip, wx, onOpen, onJournal, onAddPlan, onChange }: { trip: Trip; wx?: TripWx | null; onOpen: (b: Booking) => void; onJournal?: (d: string) => void; onAddPlan?: (d: string) => void; onChange?: (fn: (t: Trip) => Trip) => void }) {
  const [sel, setSel] = useState<string[] | null>(null);
  const [stayOpen, setStayOpen] = useState<string | null>(null);
  const dups = useMemo(() => findDups(trip), [trip.bookings]);
  const tl = timeline(trip);
  const today = todayStr();
  const days = tripDays(trip).map((date) => ({ date, items: tl.find((d) => d.date === date)?.items ?? [] }));
  const { start } = tripRange(trip);
  const lastDay = days.length ? days[days.length - 1].date : '';
  if (!days.length)
    return (
      <View style={[s.card, { alignItems: 'center', paddingVertical: 30 }]}>
        <Icon name="document-text-outline" size={34} color={C.sub} />
        <Text style={[s.hint, { textAlign: 'center', marginTop: 10, lineHeight: 19 }]}>{t('noBookings')}</Text>
      </View>
    );
  const toggle = (id: string) => sel && setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <>
      {!!onChange && trip.bookings.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <SelBar
            sel={sel}
            setSel={setSel}
            all={trip.bookings.map((b) => b.id)}
            onDelete={(ids) => {
              pushUndo(trip.id, t('undoDeleted', { n: ids.length }), [{ key: 'bookings', put: trip.bookings.filter((b) => ids.includes(b.id)) }]);
              onChange((tr) => ({ ...tr, bookings: tr.bookings.filter((b) => !ids.includes(b.id)) }));
            }}
          />
        </View>
      )}
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
          {(() => {
            // その日の夜に泊まる宿（連泊の2泊目以降も、毎日わかるように出す）
            const stays = trip.bookings.filter((h) => h.type === 'hotel' && !h.cancelled && isDate(h.start) && isDate(h.end) && h.start <= date && date < h.end! && h.start !== date);
            if (!stays.length && noStay(trip, date, lastDay, today)) {
              const city = nightCity(trip, date);
              if (!city) return null;
              const next = new Date(date + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
              const out = next.toISOString().slice(0, 10);
              return (
                <View key={'nostay' + date} style={{ marginLeft: 52, marginBottom: 10 }}>
                  <Pressable onPress={() => setStayOpen(stayOpen === date ? null : date)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="bed-outline" size={14} color={C.pink} />
                    <Text style={[s.hint, { flex: 1, color: C.pink, fontWeight: '700' }]} numberOfLines={1}>
                      {t('noStayNight', { city })}
                    </Text>
                    <Icon name={stayOpen === date ? 'chevron-up' : 'chevron-down'} size={14} color={C.pink} />
                  </Pressable>
                  {stayOpen === date && <FindRow title={t('noStayFind', { city })} links={hotelLinks(city, date, out, /[぀-ヿ一-鿿]/.test(city), arrivalCC(trip))} />}
                </View>
              );
            }
            return stays.map((h) => (
              <Pressable key={'stay' + h.id} onPress={() => onOpen(h)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 52, marginBottom: 8 }}>
                <Icon name="bed-outline" size={14} color={C.sub} />
                <Text style={[s.hint, { flex: 1 }]} numberOfLines={1}>
                  {t('stayNight', { name: h.title || typeName('hotel'), n: daysBetween(h.start, date) + 1, m: daysBetween(h.start, h.end!) })}
                </Text>
              </Pressable>
            ));
          })()}
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
                <Pressable
                  onPress={() => (sel ? toggle(b.id) : onOpen(b))}
                  onLongPress={() => onChange && !sel && setSel([b.id])}
                  style={({ pressed }) => [s.tlCard, pressed && { opacity: 0.85 }, !!sel?.includes(b.id) && { borderColor: C.pink, borderWidth: 1.5 }]}
                >
                  {sel ? <SelDot on={sel.includes(b.id)} /> : <TypeBadge type={b.type} size={34} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tlTitle, b.cancelled && s.cancelled]} numberOfLines={2}>
                      {b.title || typeName(b.type)}
                    </Text>
                    {!!b.cancelled && <Text style={[s.tlEdge, { color: C.pink }]}>{t('cancelled')}</Text>}
                    <DupTag b={b} twins={dups.get(b.id)} />
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
              <Text style={s.addPlanText}>{items.length ? t('addPlan') : `${t('freeDay')} ${dot()} ${t('addPlan')}`}</Text>
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

/** メールの転送先（この端末専用の住所）と使い方 */
function MailSheet({ onCheck }: { onCheck: () => Promise<void> }) {
  const [addr, setAddr] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const load = () => {
    setAddr(undefined);
    mailAddress().then(setAddr);
  };
  useEffect(load, []);
  return (
    <View style={{ paddingHorizontal: 4, paddingBottom: 12 }}>
      <Text style={[s.sheetTitle, { marginBottom: 6 }]}>{t('mailSheetTitle')}</Text>
      <Text style={[s.hint, { marginBottom: 14 }]}>{t('mailSheetLead')}</Text>
      <View style={[s.card, { alignItems: 'center', paddingVertical: 18 }]}>
        {addr === undefined ? (
          <ActivityIndicator />
        ) : addr === null ? (
          <Pressable onPress={load}>
            <Text style={[s.hint, { textAlign: 'center' }]}>{t('mailErr')}</Text>
          </Pressable>
        ) : (
          <>
            <Text selectable style={{ fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: 0.3 }}>
              {addr}
            </Text>
            <Pressable
              style={[s.secondary, { marginTop: 12, alignSelf: 'stretch' }]}
              onPress={async () => {
                await Clipboard.setStringAsync(addr).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Icon name={copied ? 'checkmark' : 'copy-outline'} size={17} />
              <Text style={s.secondaryText}>{copied ? t('copied') : t('mailCopy')}</Text>
            </Pressable>
          </>
        )}
      </View>
      {[t('mailStep1'), t('mailStep2'), t('mailStep3')].map((x, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Text style={{ fontWeight: '800', color: C.pink, width: 18 }}>{i + 1}</Text>
          <Text style={[s.hint, { flex: 1, color: C.ink }]}>{x}</Text>
        </View>
      ))}
      <Pressable
        style={[s.secondary, { marginTop: 16 }]}
        disabled={checking || !addr}
        onPress={async () => {
          setChecking(true);
          await onCheck();
          setChecking(false);
        }}
      >
        {checking ? <ActivityIndicator /> : <Icon name="refresh" size={17} />}
        <Text style={s.secondaryText}>{t('mailCheckNow')}</Text>
      </Pressable>
      <Text style={[s.hint, { fontSize: 11, marginTop: 12 }]}>{t('mailPrivacy')}</Text>
    </View>
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

/** 選んで消すときの操作バー。選んでいる間は画面の下に浮かせて、スクロールしてもついてくる */
type SelFloat = { n: number; total: number; toggleAll: () => void; cancel: () => void; del: () => void } | null;
let selFloat: SelFloat = null;
const selSubs = new Set<() => void>();
const setSelFloat = (v: SelFloat) => {
  selFloat = v;
  selSubs.forEach((f) => f());
};
function useSelFloat() {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((x) => x + 1);
    selSubs.add(cb);
    return () => {
      selSubs.delete(cb);
    };
  }, []);
  return selFloat;
}
function SelBar({ sel: raw, setSel, all, onDelete }: { sel: string[] | null; setSel: (v: string[] | null) => void; all: string[]; onDelete: (ids: string[]) => void }) {
  // 共有中に相手が消した項目は、選んだ数から外す
  const sel = raw ? raw.filter((id) => all.includes(id)) : null;
  const ref = useRef({ sel, all, setSel, onDelete });
  ref.current = { sel, all, setSel, onDelete };
  useEffect(() => {
    if (!sel) {
      setSelFloat(null);
      return;
    }
    setSelFloat({
      n: sel.length,
      total: all.length,
      toggleAll: () => ref.current.setSel(ref.current.sel && ref.current.sel.length === ref.current.all.length ? [] : ref.current.all),
      cancel: () => ref.current.setSel(null),
      del: () => {
        const c = ref.current;
        if (!c.sel?.length) return;
        c.onDelete(c.sel);
        c.setSel(null);
      },
    });
  }, [sel?.join(','), all.join(',')]);
  useEffect(() => () => setSelFloat(null), []);
  if (sel) return <View style={{ height: 4 }} />;
  return (
    <View style={s.selBar}>
      <Pressable hitSlop={8} onPress={() => setSel([])}>
        <Text style={s.selLink}>☑︎ {t('selMode')}</Text>
      </Pressable>
    </View>
  );
}
/** 画面の下に浮かぶ「全部選ぶ・やめる・選んだものを削除」 */
function FloatingSelBar() {
  const f = useSelFloat();
  if (!f) return null;
  return (
    <View style={[s.selFloat]}>
      <Pressable hitSlop={8} onPress={f.toggleAll}>
        <Text style={s.selLink}>{t('selAll')}</Text>
      </Pressable>
      <Pressable hitSlop={8} onPress={f.cancel}>
        <Text style={s.selLink}>{t('selCancel')}</Text>
      </Pressable>
      <Pressable
        disabled={!f.n}
        style={[s.smallBtn, { width: undefined, paddingHorizontal: 14, backgroundColor: C.pink }, !f.n && { opacity: 0.35 }]}
        onPress={f.del}
      >
        <Text style={[s.smallBtnText, { fontSize: 13 }]}>{t('delSelected', { n: f.n })}</Text>
      </Pressable>
    </View>
  );
}
const SelDot = ({ on }: { on: boolean }) => (
  <View style={{ marginRight: 10 }}>
    <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? C.pink : C.sub} />
  </View>
);

function BookingsTab({ trip, rate, onOpen, onInbox, onDropInbox, onChange }: { trip: Trip; rate: RateInfo; onOpen: (b: Booking) => void; onInbox: (it: InboxItem) => void; onDropInbox: (id: string) => void; onChange: (fn: (t: Trip) => Trip) => void }) {
  const dups = useMemo(() => findDups(trip), [trip.bookings]);
  const [sel, setSel] = useState<string[] | null>(null);
  const inbox = <InboxBox items={trip.inbox ?? []} onOpen={onInbox} onDrop={onDropInbox} />;
  if (!trip.bookings.length)
    return (
      <>
        {inbox}
        <PlanTab trip={trip} onOpen={onOpen} />
      </>
    );
  const { start: rs, end: re } = tripRange(trip);
  const city = tripCity(trip.bookings) ?? arrivalCity(trip);
  const noHotel = !trip.bookings.some((b) => b.type === 'hotel' && !b.cancelled) && rs && re && rs !== re && rs >= todayStr();
  return (
    <>
      {inbox}
      {noHotel && !!city && (
        <AdHero
          photo={city}
          kicker={t('adHotelKicker')}
          title={t('adHotelTitle', { city })}
          sub={t('adHotelSub', { n: daysBetween(rs!, re!) })}
          links={hotelLinks(city, rs, re, /[぀-ヿ一-鿿]/.test(city), arrivalCC(trip))}
          actionOf={(l) => t('adHotelBtn', { site: l.name })}
        />
      )}
      <Suggest trip={trip} city={city} />
      <SelBar
        sel={sel}
        setSel={setSel}
        all={trip.bookings.map((b) => b.id)}
        onDelete={(ids) => {
          pushUndo(trip.id, t('undoDeleted', { n: ids.length }), [{ key: 'bookings', put: trip.bookings.filter((b) => ids.includes(b.id)) }]);
          onChange((tr) => ({ ...tr, bookings: tr.bookings.filter((b) => !ids.includes(b.id)) }));
        }}
      />
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
                <Pressable
                  key={b.id}
                  onPress={() => (sel ? setSel(sel.includes(b.id) ? sel.filter((x) => x !== b.id) : [...sel, b.id]) : onOpen(b))}
                  onLongPress={() => !sel && setSel([b.id])}
                  style={[s.tlRow, i > 0 && s.tlLine, { alignItems: 'center' }]}
                >
                  {!!sel && <SelDot on={sel.includes(b.id)} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tlTitle, b.cancelled && s.cancelled]} numberOfLines={2}>
                      {b.title || typeName(b.type)}
                    </Text>
                    {!!b.cancelled && <Text style={[s.tlEdge, { color: C.pink }]}>{t('cancelled')}</Text>}
                    <DupTag b={b} twins={dups.get(b.id)} />
                    <Text style={s.hint}>
                      {isDate(b.start) ? prettyDate(b.start) : ''} {b.startTime ?? ''}
                      {isDate(b.end) && b.end !== b.start ? `${range()}${prettyDate(b.end!)}` : ''}
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

function MoneyTab({ trip, rate, onChange, onShare }: { trip: Trip; rate: RateInfo; onChange: (fn: (t: Trip) => Trip) => void; onShare: () => void }) {
  const total = tripTotal(trip, rate);
  const [name, setName] = useState('');
  const [delM, setDelM] = useState<string | null>(null);
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

      <Pressable style={[s.secondary, { marginTop: 10 }]} onPress={() => exportBudgetCsv(trip).catch(() => {})}>
        <Icon name="wallet-outline" size={16} />
        <Text style={s.secondaryText}>{t('toBudgetApp')}</Text>
      </Pressable>
      <Text style={[s.hint, { fontSize: 11, marginTop: 4 }]}>{t('toBudgetHint')}</Text>

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
              // 長押し → もう一度押すと削除（すぐ消えないように）。払った分は「自分」の支払いに移す
              onLongPress={() => m.id !== 'me' && m.id !== trip.myId && setDelM(m.id)}
              onPress={() => {
                if (delM !== m.id) return setDelM(null);
                setDelM(null);
                const rest = trip.members.filter((x) => x.id !== m.id);
                const to = rest.find((x) => x.id === (trip.myId ?? 'me'))?.id ?? rest[0]?.id;
                const fix = <T extends { paidBy?: string; splitWith?: string[] }>(x: T): T => ({
                  ...x,
                  paidBy: x.paidBy === m.id ? to : x.paidBy,
                  splitWith: x.splitWith?.includes(m.id) ? x.splitWith.filter((i) => i !== m.id) : x.splitWith,
                });
                const touched = (x: { paidBy?: string; splitWith?: string[] }) => x.paidBy === m.id || !!x.splitWith?.includes(m.id);
                pushUndo(trip.id, t('undoDeleted', { n: 1 }), [
                  { key: 'members', put: [m] },
                  { key: 'bookings', put: trip.bookings.filter(touched) },
                  { key: 'expenses', put: (trip.expenses ?? []).filter(touched) },
                ]);
                onChange((tr) => ({ ...tr, members: tr.members.filter((x) => x.id !== m.id), bookings: tr.bookings.map(fix), expenses: tr.expenses?.map(fix) }));
              }}
              style={[s.chip, delM === m.id && { backgroundColor: C.pinkSoft, borderColor: C.pink }]}
            >
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(Array.from(m.name)[0] ?? '?').toUpperCase()}</Text>
              </View>
              <Text style={[s.chipText, delM === m.id && { color: C.pink }]}>{delM === m.id ? t('deleteSure') : m.name}</Text>
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
        <Pressable
          style={[s.secondary, { marginTop: 12 }]}
          onPress={() =>
            trip.share
              ? shareSafe({ message: `${t('askPayMsg', { name: bracket(trip.name) })}\n${SITE}/s/${trip.share.code}?c=${rate.base}` })
              : onShare()
          }
        >
          <Icon name="link-outline" size={17} />
          <Text style={s.secondaryText}>{t('askPayLink')}</Text>
        </Pressable>
        <Text style={[s.hint, { fontSize: 11, marginTop: 4, lineHeight: 16 }]}>{trip.share ? t('askPayHint') : `${t('askPayHint')} ${t('askPayNeedShare')}`}</Text>
      </View>

      {trip.members.length > 1 && (
        <>
          <Text style={s.sec}>{t('settle').toUpperCase()}</Text>
          <View style={s.card}>
            {trip.members.map((m) => (
              <View key={m.id} style={s.rowBetween}>
                <Text style={s.tlTitle}>{m.name}</Text>
                <Text style={s.hint}>
                  {t('paidTotal')} {fmtMoney(Math.round(st.paid[m.id] ?? 0), rate.base)} {dot()} {t('oweTotal')} {fmtMoney(Math.round(st.owe[m.id] ?? 0), rate.base)}
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
                    const link = trip.share ? `${SITE}/s/${trip.share.code}?c=${rate.base}` : `tripfold://settle?d=${encodeURIComponent(JSON.stringify(data))}`;
                    const lines = st.pay.map((p) => `${dot()} ${nameOf(p.from)} → ${nameOf(p.to)}  ${fmtMoney(Math.round(p.amount), rate.base)}`);
                    shareSafe({ message: `${bracket(trip.name)} ${t('settle')}\n${lines.join('\n')}\n\n${t('openInApp')}\n${link}` });
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
  const [sel, setSel] = useState<string[] | null>(null);
  const autoRate = cur !== rate.base ? toHome(1, cur, rate) : 1;
  const add = () => {
    const v = parseFloat(amt);
    // 0やマイナス、打ち間違いのような大きすぎる金額（10億以上）は入れない
    if (!v || !(v > 0) || v >= 1e9) return;
    const r = parseFloat(rateTxt);
    // 手で直したレートが自動のレートから桁違い（50倍以上ずれる）なら、打ち間違いとして使わない
    const okRate = r > 0 && cur !== rate.base && (!(autoRate > 0) || (r / autoRate < 50 && autoRate / r < 50));
    const e: Expense = { id: uid(), title: title.trim() || catName(cat), cat, amount: v, currency: cur, date: todayStr(), paidBy: payer, rate: okRate ? r : undefined, photo };
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
          <SelBar
            sel={sel}
            setSel={setSel}
            all={list.slice(0, 30).map((e) => e.id)}
            onDelete={(ids) => {
              pushUndo(trip.id, t('undoDeleted', { n: ids.length }), [{ key: 'expenses', put: (trip.expenses ?? []).filter((x) => ids.includes(x.id)) }]);
              onChange((tr) => ({ ...tr, expenses: (tr.expenses ?? []).filter((x) => !ids.includes(x.id)) }));
            }}
          />
          {list.slice(0, 30).map((e) => (
            <Pressable
              key={e.id}
              onLongPress={() => !sel && setSel([e.id])}
              onPress={() => sel && setSel(sel.includes(e.id) ? sel.filter((x) => x !== e.id) : [...sel, e.id])}
              style={[s.expRow, { alignItems: 'center' }]}
            >
              {!!sel && <SelDot on={sel.includes(e.id)} />}
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
      onLongPress={() => {
        pushUndo(trip.id, t('undoDeleted', { n: 1 }), [{ key: 'checklist', put: [c] }]);
        onChange((tr) => ({ ...tr, checklist: tr.checklist.filter((x) => x.id !== c.id) }));
      }}
    >
      <View style={[s.check, c.done && { backgroundColor: C.ink, borderColor: C.ink }]}>{c.done && <Icon name="checkmark" size={15} color={C.onInk} />}</View>
      <Text style={[s.tlTitle, { flex: 1 }, c.done && { color: C.sub, textDecorationLine: 'line-through' }]}>{c.text}</Text>
      {mode === 'pack' && !c.done && /esim|sim/i.test(c.text) && (
        <Pressable hitSlop={8} onPress={() => Linking.openURL(esimLinks()[0].url)} style={[s.typeChip, { paddingVertical: 4 }]}>
          <Text style={[s.chipText, { fontSize: 11 }]}>{t('findEsim')}</Text>
        </Pressable>
      )}
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
        {mode === 'gift' ? t('giftHint') : t('packHint')} {dot()} {done}/{list.length}
      </Text>
      {groups.filter((g) => g.items.length > 0).map((g) => (
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
/** 予約の流れで次に必要になりそうなもの（航空券・空港の送迎・レンタカー・荷物預け・遅延の補償） */
function Suggest({ trip, city }: { trip: Trip; city?: string }) {
  const { start, end } = tripRange(trip);
  if (!start || (end ?? start) < todayStr()) return null;
  const has = (ty: string) => trip.bookings.some((b) => b.type === ty && !b.cancelled);
  const days = end ? daysBetween(start, end) + 1 : 1;
  const hotels = trip.bookings.filter((b) => b.type === 'hotel' && !b.cancelled);
  // チェックアウトした日に、あとで電車・飛行機で出発する → 荷物を預ける
  const luggage = hotels.some((h) => h.end && trip.bookings.some((b) => (b.type === 'flight' || b.type === 'train' || b.type === 'bus') && b.start === h.end && (b.startTime ?? '00:00') >= '14:00'));
  const tiles: AdTile[] = [];
  if (!has('flight') && !has('train')) tiles.push({ key: 'fl', icon: 'airplane', bg: '#2F6BFF', title: t('adFlightT'), sub: t('adFlightS'), links: flightLinks(city, start, end) });
  if (city) tiles.push({ key: 'act', icon: 'ticket', bg: '#FF5B3A', title: t('adActT', { city }), sub: t('adActS'), links: activityLinks('', city) });
  if (has('flight')) tiles.push({ key: 'tr', icon: 'car-sport', bg: '#00A86B', title: t('adTransferT'), sub: t('adTransferS'), links: transferLinks() });
  if (!has('car') && days >= 3) tiles.push({ key: 'car', icon: 'key', bg: '#7B2FF7', title: t('adCarT', { n: days }), sub: t('adCarS'), links: carLinks() });
  if (luggage) tiles.push({ key: 'lug', icon: 'briefcase', bg: '#F59F00', title: t('adLuggageT'), sub: t('adLuggageS'), links: luggageLinks(city) });
  if (has('flight')) tiles.push({ key: 'air', icon: 'shield-checkmark', bg: '#15171C', title: t('adAirhelpT'), sub: t('adAirhelpS'), links: [airhelpLink()] });
  if (!tiles.length) return null;
  return (
    <View style={{ marginTop: 6, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={[s.tlTitle, { flex: 1 }]}>{t('sugTitle')}</Text>
        <Text style={s.prTag}>PR</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
        {tiles.map((x) => (
          <Pressable key={x.key} onPress={() => x.links[0] && Linking.openURL(x.links[0].url)} style={({ pressed }) => [s.adTile, { backgroundColor: x.bg, opacity: pressed ? 0.85 : 1 }]}>
            <View style={s.adTileIcon}>
              <Icon name={x.icon} size={22} color="#fff" />
            </View>
            <Text style={s.adTileTitle} numberOfLines={2}>{x.title}</Text>
            <Text style={s.adTileSub} numberOfLines={2}>{x.sub}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 'auto', gap: 4 }}>
              <Text style={s.adTileBrand} numberOfLines={1}>{x.links.map((l) => l.name).slice(0, 2).join(' · ')}</Text>
              <Icon name="arrow-forward" size={14} color="#fff" />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
type AdTile = { key: string; icon: string; bg: string; title: string; sub: string; links: FindLink[] };

/** 写真つきの大きな広告カード（宿がない旅・おすすめの行き先） */
function AdHero({ photo, kicker, title, sub, links, badge, onClose, top, actions, actionOf }: {
  photo?: string; kicker: string; title: string; sub: string; links: FindLink[]; badge?: string; onClose?: () => void; top?: number; actions?: string[]; actionOf?: (l: FindLink) => string;
}) {
  const url = useCityPhoto(photo);
  if (!links.length) return null;
  return (
    <View style={[s.adHero, { marginTop: top ?? 0 }]}>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Image source={COVER_FALLBACK} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,12,18,0.18)' }]} />
      <View style={s.adHeroShade} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {!!badge && <Text style={{ fontSize: 18 }}>{badge}</Text>}
        <Text style={s.adHeroKicker}>{kicker}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[s.prTag, s.prTagOnPhoto]}>PR</Text>
        {!!onClose && (
          <Pressable hitSlop={12} onPress={onClose} style={s.adHeroClose}>
            <Icon name="close" size={15} color="#fff" />
          </Pressable>
        )}
      </View>
      <View style={{ marginTop: 'auto' }}>
        <Text style={s.adHeroTitle}>{title}</Text>
        <Text style={s.adHeroSub}>{sub}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {links.slice(0, 2).map((l, i) => (
            <Pressable key={l.id} onPress={() => Linking.openURL(l.url)} style={({ pressed }) => [i === 0 ? s.adBtn : s.adBtn2, pressed && { opacity: 0.8 }]}>
              <Text style={i === 0 ? s.adBtnText : s.adBtn2Text} numberOfLines={1}>{actions?.[i] ?? (actionOf ? actionOf(l) : l.name)}</Text>
              {i === 0 && <Icon name="arrow-forward" size={14} color="#15171C" />}
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
const COVER_FALLBACK = require('./assets/covers/window.jpg');

/** 最初の便の到着空港の国（同じ名前の都市が別の国にもあるとき、宿の検索を正しい国にするため） */
function arrivalCC(trip: Trip): string | undefined {
  const fl = trip.bookings.filter((b) => b.type === 'flight' && !b.cancelled && b.to).sort((a, b) => (a.start + (a.startTime ?? '')).localeCompare(b.start + (b.startTime ?? '')));
  const code = fl[0]?.to?.trim().toUpperCase() ?? '';
  return /^[A-Z]{3}$/.test(code) ? TZ_CC[AIRPORT_TZ[code] ?? ''] : undefined;
}
/** その夜の宿が入っていないか（最終日・過ぎた日・夜行の便や列車に乗っている夜は除く） */
function noStay(trip: Trip, date: string, lastDay: string, today: string): boolean {
  if (!lastDay || date >= lastDay || date < today) return false;
  const live = trip.bookings.filter((b) => !b.cancelled);
  if (live.some((h) => h.type === 'hotel' && isDate(h.start) && h.start <= date && (isDate(h.end) ? date < h.end! : h.start === date))) return false;
  if (live.some((b) => ['flight', 'train', 'bus'].includes(b.type) && b.start <= date && isDate(b.end) && b.end! > date)) return false;
  return true;
}
/** その夜にいる都市：その日までに乗った最後の便の到着地、または都市名がわかる列車・バスの到着地（地下鉄の駅などは飛ばす）。なければ宿の住所や最初の到着地 */
const CITY_NAMES: string[] = PLACES.flatMap(([, , cs]) => cs.flatMap(([en, ja]) => [en, ja])).sort((a, b) => b.length - a.length);
const cityIn = (text: string): string | undefined => {
  const low = text.toLowerCase();
  return CITY_NAMES.find((c) => (/^[\x00-\x7f]+$/.test(c) ? new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text) : low.includes(c)));
};
function nightCity(trip: Trip, date: string): string | undefined {
  const moves = trip.bookings
    .filter((b) => ['flight', 'train', 'bus'].includes(b.type) && !b.cancelled && b.to && b.start <= date)
    .sort((a, b) => (a.start + (a.startTime ?? '')).localeCompare(b.start + (b.startTime ?? '')));
  for (let i = moves.length - 1; i >= 0; i--) {
    const to = moves[i].to!.trim();
    const code = to.toUpperCase();
    if (moves[i].type === 'flight' && /^[A-Z]{3}$/.test(code) && AIRPORT_CITY[code]) return AIRPORT_CITY[code];
    const hit = cityIn(to);
    if (hit) return hit;
  }
  // 住所に一番よく出てくる都市名（前日までの宿や予定を優先）
  const count = new Map<string, number>();
  for (const b of trip.bookings) {
    if (b.cancelled) continue;
    for (const a of [b.from, b.to]) {
      const c = a && cityIn(a);
      if (c) count.set(c, (count.get(c) ?? 0) + (b.start <= date ? 3 : 1));
    }
  }
  const best = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  return best ?? arrivalCity(trip) ?? tripCity(trip.bookings);
}
/** 宿がないとき、どの都市で探すか：最初の便の到着空港の都市（帰りの便の到着地＝自宅側は使わない） */
function arrivalCity(trip: Trip): string | undefined {
  const fl = trip.bookings.filter((b) => b.type === 'flight' && !b.cancelled && b.to).sort((a, b) => (a.start + (a.startTime ?? '')).localeCompare(b.start + (b.startTime ?? '')));
  const to = fl[0]?.to?.trim();
  if (!to) return undefined;
  const code = to.toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) return AIRPORT_CITY[code];
  return to.replace(/\s*(International\s*)?Airport.*$/i, '').replace(/\s*\([A-Z]{3}\)$/, '').trim() || undefined;
}

// ホームの「〇〇に行きませんか？」：行ったことのある国に近い地域の、まだ行っていない国を日ごとに選ぶ（100か国・500都市）
let inspireClosed = false; // × で閉じたら、次にアプリを開くまで出さない
let inspirePick: { cc: string; city: [string, string]; near: boolean } | null = null; // 開いている間は同じ行き先
function Inspire({ trips }: { trips: Trip[] }) {
  const [closed, setClosed] = useState(inspireClosed);
  const [pick, setPick] = useState<{ cc: string; city: [string, string]; near: boolean } | null>(inspirePick);
  useEffect(() => {
    if (inspirePick) return;
    (async () => {
      // アプリを開くたびに新しい行き先。一巡するまで同じ都市は出さないので、全部の都市が必ず一度は出る
      const recent: string[] = JSON.parse((await AsyncStorage.getItem('ts.inspire.seen').catch(() => null)) || '[]');
      const been = new Set([...countriesOf(trips, myTz()), TZ_HOME()]);
      const regions = new Set(PLACES.filter((p) => been.has(p[0])).map((p) => p[1]));
      const near = new Set([...regions].flatMap((r) => NEAR[r]));
      // 重み：行った地域の近く×3、行った地域×2、そのほか×1（行った国・自分の国は出さない）
      const all = PLACES.filter((p) => !been.has(p[0])).flatMap((p) => p[2].map((city) => ({ cc: p[0], city, near: regions.size > 0 && near.has(p[1]), w: regions.size ? (near.has(p[1]) ? 3 : regions.has(p[1]) ? 2 : 1) : 1 })));
      if (!all.length) return;
      const fresh = all.filter((x) => !recent.includes(x.city[0]));
      // 一巡したら最初から（直前の都市だけは続けて出さない）
      const pool = fresh.length ? fresh : all.filter((x) => x.city[0] !== recent[0]);
      const cycle = fresh.length ? recent : recent.slice(0, 1);
      let r = Math.random() * pool.reduce((n, x) => n + x.w, 0);
      const c = pool.find((x) => (r -= x.w) < 0) ?? pool[0];
      inspirePick = { cc: c.cc, city: c.city as [string, string], near: c.near };
      setPick(inspirePick);
      AsyncStorage.setItem('ts.inspire.seen', JSON.stringify([c.city[0], ...cycle.filter((x) => x !== c.city[0])])).catch(() => {});
    })();
  }, [trips]);
  if (!pick || closed) return null;
  const ja = getLang() === 'ja';
  const name = ja ? pick.city[1] : pick.city[0];
  let country = pick.cc;
  try {
    country = new (Intl as any).DisplayNames([localeOf(getLang())], { type: 'region' }).of(pick.cc) ?? pick.cc;
  } catch {}
  return (
    <AdHero
      top={18}
      photo={pick.city[0]}
      badge={flag(pick.cc)}
      kicker={pick.near ? t('inspireNear') : t('inspireSub')}
      title={t('inspireTitle', { city: name })}
      sub={t('inspireLine', { country })}
      actions={[t('inspireBtnDo'), t('inspireBtnFly')]}
      links={inspireLinks(pick.city[0], pick.cc)}
      onClose={() => {
        inspireClosed = true;
        setClosed(true);
      }}
    />
  );
}
/** 通貨名を、選んでいる言語で（日本語以外で日本語名が出ないように） */
const curName = (code: string, fallback: string) => {
  if (getLang() === 'ja') return fallback;
  try {
    return new (Intl as any).DisplayNames([localeOf(getLang())], { type: 'currency' }).of(code) ?? fallback;
  } catch {
    return fallback;
  }
};
const TZ_HOME = () => TZ_CC[myTz() ?? ''] ?? '';

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
  const winH = useWindowDimensions().height;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, tall && { height: '92%' }, { paddingBottom: insets.bottom + 12, maxHeight: winH - insets.top - 12 }]}>
          <View style={s.sheetTop}>
            <View style={s.grabber} />
            <Pressable onPressIn={onClose} hitSlop={18} style={s.closeBtn}>
              <Icon name="close" size={18} />
            </Pressable>
          </View>
          {tall ? (
            children
          ) : (
            // 中身が長いとき（設定など）は画面の上にはみ出さずにスクロールする
            <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          )}
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
  // 同じ予約番号の予約を上書きするとき、前と変わったところ（色付きで見せて、1つずつ戻せる）
  const [diff, setDiff] = useState<{ k: keyof Booking; old: any; now: any }[]>([]);
  const [busy, setBusy] = useState(false);
  const [b, setB] = useState<Booking>(
    edit ??
      (initial?.planDate
        ? { id: uid(), type: 'plan', title: initial.planTitle ?? '', start: initial.planDate, memo: initial.planMemo, from: initial.planFrom, currency: home, paidBy: trip.myId, createdAt: Date.now() }
        : { id: uid(), type: 'flight', title: '', start: tripRange(trip).start ?? todayStr(), currency: home, paidBy: trip.myId, createdAt: Date.now() }),
  );
  const set = (p: Partial<Booking>) => setB((x) => ({ ...x, ...p }));
  const [priceTxt, setPriceTxt] = useState(b.price != null ? String(b.price) : '');
  // 読み取りなどで金額が外から変わったら、入力欄も合わせる
  useEffect(() => {
    if ((b.price ?? NaN) !== parseFloat(priceTxt) && !(b.price == null && priceTxt === '')) setPriceTxt(b.price != null ? String(b.price) : '');
  }, [b.price]);
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
      const keys: (keyof Booking)[] = ['title', 'start', 'startTime', 'end', 'endTime', 'from', 'to', 'seat', 'price', 'currency'];
      setDiff(
        p.cancelled
          ? []
          : keys
              .filter((k) => (p as any)[k] != null && String((p as any)[k]).trim() !== '' && String((p as any)[k]) !== String((hit as any)[k] ?? ''))
              .map((k) => ({ k, old: (hit as any)[k], now: (p as any)[k] })),
      );
      if (p.cancelled) {
        setB({ ...hit, ...keep, photos: photo ? [...(hit.photos ?? []), photo] : hit.photos, files: addFile(hit.files) });
        setNote(t('readCancel'));
      } else {
        // 前の予約は消さず・上書きせず、新しい予約として残す（違うところは色で見せる）
        setB((x) => ({ ...x, ...p, type: hit.type, cancelled: undefined, currency: p.currency ?? hit.currency ?? x.currency, photos: photo ? [...(x.photos ?? []), photo] : x.photos, files: addFile(x.files) }));
        setNote(t('dupKept'));
      }
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
                const c = await readClipboard();
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
            <Pressable style={[s.secondary, { flex: 1 }]} onPress={async () => { const c = await readClipboard(); if (c) (setText(c), setDrafts(null)); }}>
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
          {diff.length > 0 && (
            <View style={[s.note, { backgroundColor: C.pinkSoft }]}>
              <Text style={[s.noteText, { color: C.pink, fontWeight: '700', marginBottom: 6 }]}>{t('diffTitle', { n: diff.length })}</Text>
              {diff.map((d) => {
                const lab: Record<string, string> = { title: t('title'), start: t('startDate'), startTime: t('time'), end: t('endDate'), endTime: t('endTime'), from: placeLabels(b.type)[0], to: placeLabels(b.type)[1] ?? t('to'), seat: t('seat'), price: t('price'), currency: t('price') };
                const show = (v: any) => (v == null || v === '' ? t('diffNone') : String(v));
                return (
                  <View key={String(d.k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.noteText, { fontSize: 11, opacity: 0.7 }]}>{lab[d.k as string] ?? String(d.k)}</Text>
                      <Text style={s.noteText}>
                        <Text style={{ textDecorationLine: 'line-through', opacity: 0.55 }}>{show(d.old)}</Text>
                        {'  →  '}
                        <Text style={{ color: C.pink, fontWeight: '700' }}>{show(d.now)}</Text>
                      </Text>
                    </View>

                  </View>
                );
              })}

            </View>
          )}
          {!!b.cancelled && (
            <Pressable onPress={() => set({ cancelled: undefined })} style={[s.note, { backgroundColor: C.pinkSoft }]}>
              <Text style={[s.noteText, { color: C.pink }]}>{t('cancelled')} {dot()} {t('undoCancel')}</Text>
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
                  <Text style={[s.chipText, b.start === d && { color: C.onInk }]}>{`${t('dayN', { n: i + 1 })} ${dot()} ${prettyDate(d)}`}</Text>
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
              value={priceTxt}
              onChangeText={(v) => {
                // 入力中の文字はそのまま持つ（数字だけを持つと「12.」の「.」が消えて小数が打てない）
                const c = cleanNum(v, cur.decimals);
                setPriceTxt(c);
                const n = parseFloat(c);
                set({ price: isFinite(n) ? n : undefined });
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
                        if (!next.length) return; // 最後の1人は外せない（0人にすると「全員」に戻ってしまう）
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
          <Pressable style={[s.primary, !normDate(b.start) && { opacity: 0.4 }]} disabled={!normDate(b.start)} onPress={() => onSave(tidyBooking(b))}>
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

/** 保存する前に、手で打った日付・時刻をそろえる（2026/12/3 → 2026-12-03、9:30 → 09:30）。終わりが始まりより前なら入れ替える */
function tidyBooking(b: Booking): Booking {
  const out: Booking = { ...b, start: normDate(b.start) ?? b.start, end: normDate(b.end), startTime: normTime(b.startTime), endTime: normTime(b.endTime), title: b.title.trim() };
  if (out.end && out.end < out.start) {
    [out.start, out.end] = [out.end, out.start];
    [out.startTime, out.endTime] = [out.endTime, out.startTime];
  }
  return out;
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
      {normDate(value) ? (
        <Text style={[s.hint, { marginTop: 2, textAlign: 'center' }]}>{prettyDate(normDate(value)!)}</Text>
      ) : (
        !!value && <Text style={[s.hint, { marginTop: 2, textAlign: 'center', color: C.pink }]}>YYYY-MM-DD</Text>
      )}
    </View>
  );
}

function CurrencyPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const c = findCurrency(value);
  const qq = q.trim().toLowerCase();
  const list = qq
    ? CURRENCIES.filter((x) => `${x.code} ${x.name} ${curName(x.code, x.name)} ${x.symbol} ${CUR_COUNTRIES[x.code] ?? ''}`.toLowerCase().includes(qq))
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
                  <Text style={[s.hint, { flex: 1 }]} numberOfLines={1}>{`${x.symbol.trim()}  ${curName(x.code, x.name)}`}</Text>
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
  // タップでコピー（ホテル名・住所・日時など）
  const [toast, setToast] = useState('');
  const toastTm = useRef<any>(null);
  const copyTxt = async (txt: string) => {
    if (!txt) return;
    await Clipboard.setStringAsync(txt).catch(() => undefined);
    setToast(t('copiedX', { x: txt.length > 28 ? txt.slice(0, 28) + '…' : txt }));
    clearTimeout(toastTm.current);
    toastTm.current = setTimeout(() => setToast(''), 1600);
  };
  const allText = () => {
    const L: string[] = [b.title || typeName(b.type)];
    const lab = (x: string) => x.replace(/（.*）| \(.*\)/, '');
    L.push(`${b.type === 'hotel' ? t('checkin') : b.type === 'car' ? t('pickup') : t('startDate')}: ${prettyDate(b.start)} ${b.startTime ?? ''}`.trim());
    if (isDate(b.end)) L.push(`${b.type === 'hotel' ? t('checkout') : b.type === 'car' ? t('dropoff') : t('endDate')}: ${prettyDate(b.end!)} ${b.endTime ?? ''}`.trim());
    if (b.from) L.push(`${lab(placeLabels(b.type)[0])}: ${b.from}`);
    if (b.to) L.push(`${lab(placeLabels(b.type)[1] ?? t('to'))}: ${b.to}`);
    if (b.code) L.push(`${t('code')}: ${b.code}`);
    if (b.seat) L.push(`${t('seat')}: ${b.seat}`);
    if (b.price) L.push(`${t('price')}: ${fmtMoney(b.price, b.currency || rate.base)}`);
    if (b.memo) L.push(b.memo);
    return L.join('\n');
  };
  return (
    <Sheet visible onClose={onClose} tall>
      <CopyCtx.Provider value={copyTxt}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={s.detailHead}>
          <TypeBadge type={b.type} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[s.kicker, { color: ty.color }]}>
              {typeName(b.type).toUpperCase()} · {trip.name}
            </Text>
            <Pressable onPress={() => copyTxt(b.title || typeName(b.type))} onLongPress={() => copyTxt(b.title || typeName(b.type))}>
              <Text style={s.detailTitle}>
                {b.title || typeName(b.type)}
                {'  '}
                <Icon name="copy-outline" size={16} color={C.sub} />
              </Text>
            </Pressable>
          </View>
        </View>
        {(() => {
          const twins = findDups(trip).get(b.id);
          if (!twins?.length) return null;
          return (
            <View style={[s.note, { backgroundColor: C.pinkSoft, marginTop: 12 }]}>
              <Text style={[s.noteText, { color: C.pink, fontWeight: '700' }]}>{t('dupHere', { n: twins.length + 1 })}</Text>
              {twins.map((o) => {
                const ks = diffKeys(b, o);
                return (
                  <View key={o.id} style={{ marginTop: 6 }}>
                    {ks.length === 0 ? (
                      <Text style={[s.noteText, { color: C.pink }]}>{t('dupNoDiff')}</Text>
                    ) : (
                      ks.map((k) => (
                        <Text key={String(k)} style={[s.noteText, { color: C.ink }]}>
                          <Text style={{ opacity: 0.6 }}>{dupLabel(k, b.type)}：</Text>
                          <Text style={{ color: C.pink, fontWeight: '700' }}>{String((b as any)[k] ?? t('diffNone'))}</Text>
                          <Text style={{ opacity: 0.6 }}>{'  /  '}{t('dupOther')} </Text>
                          <Text style={{ fontWeight: '700' }}>{String((o as any)[k] ?? t('diffNone'))}</Text>
                        </Text>
                      ))
                    )}
                  </View>
                );
              })}
            </View>
          );
        })()}
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
              await Clipboard.setStringAsync(b.code!).catch(() => undefined);
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
        <Text style={[s.hint, { fontSize: 11, marginTop: 8 }]}>{t('tapToCopy')}</Text>
        {(() => {
          // 周辺を探す（ホテル・観光・お店・レンタカーなど、場所がわかる予定）
          if (!['hotel', 'ticket', 'food', 'plan', 'car', 'other'].includes(b.type)) return null;
          const q = placeQuery(b, 'from', tripCity(trip.bookings));
          if (!q) return null;
          const cats: ('nbFood' | 'nbCafe' | 'nbConv' | 'nbAtm' | 'nbPharm' | 'nbPark')[] = ['nbFood', 'nbCafe', 'nbConv', 'nbAtm', 'nbPharm', ...(b.type === 'car' || b.type === 'hotel' ? (['nbPark'] as const) : [])];
          return (
            <>
              <Text style={[s.sec, { marginTop: 16 }]}>{t('nearby').toUpperCase()}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
                {cats.map((k) => (
                  <Pressable key={k} onPress={() => openMap(`${t(k)} near ${q}`)} style={[s.secondary, { paddingHorizontal: 14, minHeight: 40 }]}>
                    <Text style={s.secondaryText}>{t(k)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          );
        })()}
        <Pressable style={[s.secondary, { marginTop: 12 }]} onPress={() => copyTxt(allText())}>
          <Icon name="copy-outline" size={17} />
          <Text style={s.secondaryText}>{t('copyAll')}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {isDate(b.start) && !b.cancelled && (
            <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => shareIcs(trip, b)}>
              <Icon name="calendar-outline" size={17} />
              <Text style={s.secondaryText}>{t('addToCal')}</Text>
            </Pressable>
          )}
          <Pressable
            style={[s.secondary, { flex: 1 }]}
            onPress={() => {
              const q = placeQuery(b, 'from', tripCity(trip.bookings));
              shareSafe({ message: q ? `${allText()}\nhttps://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : allText() });
            }}
          >
            <Icon name="share-outline" size={17} />
            <Text style={s.secondaryText}>{t('sendThis')}</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
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
      </CopyCtx.Provider>
      {!!toast && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: 40, alignItems: 'center' }}>
          <View style={{ backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="checkmark" size={15} color={C.bg} />
            <Text style={{ color: C.bg, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{toast}</Text>
          </View>
        </View>
      )}
      <Modal visible={!!zoom} transparent onRequestClose={() => setZoom(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }} onPress={() => setZoom(null)}>
          {zoom && <Image source={imgSrc(zoom)} style={{ width: '100%', height: '85%' }} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </Sheet>
  );
}

/** 大事な書類（Face ID で開いたあと） */
function VaultSheet({ onClose }: { onClose: () => void }) {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [title, setTitle] = useState('');
  const [view, setView] = useState<string[] | null>(null);
  useEffect(() => {
    loadVault().then(setDocs);
  }, []);
  const save = (v: VaultDoc[]) => (setDocs(v), saveVault(v));
  return (
    <Sheet visible onClose={onClose} tall>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
        <Text style={s.sheetTitle}>{t('vault')}</Text>
        <Text style={[s.hint, { lineHeight: 18, marginBottom: 10 }]}>{t('vaultHint')}</Text>
        {docs.map((d) => (
          <View key={d.id} style={[s.card, { marginBottom: 8 }]}>
            <View style={s.rowBetween}>
              <Text style={s.tlTitle}>{d.title}</Text>
              <Pressable
                hitSlop={8}
                onLongPress={() => {
                  d.photos.forEach(dropVaultImage);
                  save(docs.filter((x) => x.id !== d.id));
                }}
              >
                <Icon name="trash-outline" size={16} color={C.sub} />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
              {d.photos.map((p, i) => (
                <Pressable key={p} onPress={() => setView(d.photos.slice(i).concat(d.photos.slice(0, i)))}>
                  <Image source={{ uri: p }} style={s.ticketThumb} />
                </Pressable>
              ))}
              <Pressable
                style={s.ticketAdd}
                onPress={async () => {
                  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
                  if (!r.canceled) save(docs.map((x) => (x.id === d.id ? { ...x, photos: [...x.photos, ...r.assets.map((a) => keepVaultImage(a.uri))] } : x)));
                }}
              >
                <Icon name="add" size={22} color={C.sub} />
              </Pressable>
            </ScrollView>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <TextInput style={[s.input, { flex: 1 }]} value={title} onChangeText={setTitle} placeholder={t('vaultPh')} placeholderTextColor={C.sub} />
          <Pressable
            style={[s.smallBtn, !title.trim() && { opacity: 0.4 }]}
            disabled={!title.trim()}
            onPress={async () => {
              const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
              const photos = r.canceled ? [] : r.assets.map((a) => keepVaultImage(a.uri));
              save([...docs, { id: uid(), title: title.trim(), photos, at: Date.now() }]);
              setTitle('');
            }}
          >
            <Icon name="add" size={20} color={C.onInk} />
          </Pressable>
        </View>
        <Text style={[s.hint, { fontSize: 11, marginTop: 10 }]}>{t('vaultNote')}</Text>
      </ScrollView>
      {view && <TicketViewer photos={view} onClose={() => setView(null)} />}
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
      const a = await locate(fromQ);
      const b = a ? await locate(toQ, a) : null;
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
/** 詳細画面の中では、値をタップするとコピーできる */
// 有料機能（トリップパス・Plus）の状態と、購入画面を開く関数
const PlusCtx = createContext<{ api: PlusApi | null; open: (tripId?: string) => void }>({ api: null, open: () => {} });
const CopyCtx = createContext<((txt: string) => void) | null>(null);
const Info = ({ k, v, q }: { k: string; v: string; q?: string }) => {
  const copy = useContext(CopyCtx);
  return (
  <View style={[s.infoRow, { alignItems: 'center' }]}>
    <Text style={s.infoK}>{k}</Text>
    {copy ? (
      <Pressable style={{ flex: 1 }} onPress={() => copy(v.trim())} onLongPress={() => copy(v.trim())}>
        <Text style={s.infoV}>{v}</Text>
      </Pressable>
    ) : (
      <Text style={s.infoV} selectable>
        {v}
      </Text>
    )}
    {!!q && (
      <Pressable onPress={() => openMap(q)} hitSlop={8} style={s.mapBtn}>
        <Icon name="navigate" size={14} color={C.onInk} />
      </Pressable>
    )}
  </View>
  );
};

/* ---------------- 設定・ようこそ ---------------- */
function PlusRow({ onOpen }: { onOpen: () => void }) {
  const { api, open } = useContext(PlusCtx);
  return (
    <Pressable
      style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }]}
      onPress={() => {
        onOpen();
        setTimeout(() => open(), 350);
      }}
    >
      <Icon name="sparkles" size={20} color={C.pink} />
      <View style={{ flex: 1 }}>
        <Text style={[s.hint, { color: C.ink, fontWeight: '800', fontSize: 15 }]}>Tripfold Plus</Text>
        <Text style={s.hint}>{api?.plus ? t('plusActive') : t('plusRowSub')}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={C.sub} />
    </Pressable>
  );
}

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
  const [vault, setVault] = useState(false);
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
      {IAP_AVAILABLE && <PlusRow onOpen={onClose} />}
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
      <Text style={s.label}>{t('vault')}</Text>
      <Pressable
        style={s.secondary}
        onPress={async () => {
          if (await unlock(t('vault'))) setVault(true);
        }}
      >
        <Icon name="lock-closed-outline" size={16} />
        <Text style={s.secondaryText}>{t('vaultOpen')}</Text>
      </Pressable>
      {vault && <VaultSheet onClose={() => setVault(false)} />}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 20 }}>
        <Pressable hitSlop={8} onPress={() => Linking.openURL(`${SITE}/privacy`)}>
          <Text style={[s.hint, { textDecorationLine: 'underline' }]}>{t('privacyPolicy')}</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={() => Linking.openURL(`${SITE}/legal`)}>
          <Text style={[s.hint, { textDecorationLine: 'underline' }]}>{t('legalNotice')}</Text>
        </Pressable>
      </View>
      <Text style={[s.hint, { textAlign: 'center', marginTop: 10 }]}>v{Constants.expoConfig?.version ?? '1.0'}</Text>
    </Sheet>
  );
}
function SettingsBody({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  return (
    <>
      <Text style={s.label}>{t('language')}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {LANGS.map((l) => (
          <Pressable key={l.id} onPress={() => onChange({ ...settings, lang: l.id })} style={[s.typeChip, settings.lang === l.id && { backgroundColor: C.pinkSoft, borderColor: C.pink }]}>
            <Text style={s.chipText}>{l.name}</Text>
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
      { id: uid(), type: 'train', title: ja ? 'のぞみ 21号' : 'Nozomi 21', start: a, startTime: '08:00', endTime: '10:15', from: ja ? '東京駅' : 'Tokyo Station', to: ja ? '京都駅' : 'Kyoto Station', price: 14170, currency: 'JPY', createdAt: 1 },
      { id: uid(), type: 'hotel', title: ja ? '町家レジデンスイン 祇園南 万花' : 'Machiya Residence Inn Gion-minami Banka', start: a, startTime: '15:00', end: shiftDate(a, 2), endTime: '10:00', from: ja ? '京都府京都市東山区小松町563-7' : '563-7 Komatsucho, Higashiyama-ku, Kyoto', price: 38000, currency: 'JPY', createdAt: 2 },
      { id: uid(), type: 'plan', title: ja ? '伏見稲荷大社' : 'Fushimi Inari Taisha', start: shiftDate(a, 1), startTime: '07:00', endTime: '09:00', from: ja ? '京都府京都市伏見区深草藪之内町68' : '68 Fukakusa Yabunouchicho, Fushimi-ku, Kyoto', createdAt: 3 },
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
      { id: uid(), type: 'hotel', title: 'The Hoxton, Holborn', start: a, startTime: '15:00', end: shiftDate(a, 3), endTime: '12:00', from: '199-206 High Holborn, London WC1V 7BD', price: 540, currency: 'GBP', createdAt: 2 },
      { id: uid(), type: 'plan', title: ja ? '大英博物館' : 'British Museum', start: shiftDate(a, 1), startTime: '10:00', endTime: '13:00', from: 'Great Russell St, London WC1B 3DG', createdAt: 3 },
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
      { id: uid(), type: 'train', title: 'Eurostar', start: d(0), startTime: '08:31', endTime: '11:47', from: 'London St Pancras International', to: 'Paris Gare du Nord', code: 'QXK7PL', seat: 'Coach 7 / 63, 64', price: 208, currency: 'GBP', paidBy: 'me', photos: ['asset:ticket'], createdAt: 1 },
      { id: uid(), type: 'hotel', title: 'Hôtel du Petit Moulin', start: d(0), startTime: '15:00', end: d(3), endTime: '11:00', from: '29-31 Rue de Poitou, 75003 Paris', code: '4821.339.112', price: 420, currency: 'EUR', paidBy: 'm2', createdAt: 2 },
      { id: uid(), type: 'ticket', title: ja ? 'ルーヴル美術館' : 'Louvre Museum', start: d(1), startTime: '10:00', from: 'Musée du Louvre, Rue de Rivoli, 75001 Paris', code: 'LV-55219', price: 44, currency: 'EUR', paidBy: 'me', createdAt: 3 },
      { id: uid(), type: 'food', title: 'Le Comptoir du Relais', start: d(1), startTime: '19:30', from: "9 Carrefour de l'Odéon, 75006 Paris", memo: ja ? '2名・窓側' : 'Table for 2', createdAt: 4 },
      { id: uid(), type: 'plan', title: ja ? 'セーヌ川クルーズ' : 'Seine river cruise', start: d(1), startTime: '16:00', endTime: '17:00', from: 'Bateaux Parisiens, Port de la Bourdonnais, 75007 Paris', createdAt: 7 },
      { id: uid(), type: 'car', title: 'Europcar', start: d(2), startTime: '09:00', end: d(2), endTime: '18:00', from: '193 Rue de Bercy, 75012 Paris', to: '193 Rue de Bercy, 75012 Paris', code: 'EC9921034', price: 89, currency: 'EUR', paidBy: 'm2', createdAt: 5 },
      { id: uid(), type: 'train', title: 'Eurostar', start: d(3), startTime: '17:13', endTime: '18:30', from: 'Paris Gare du Nord', to: 'London St Pancras International', code: 'QXK7PL', price: 196, currency: 'GBP', paidBy: 'me', createdAt: 6 },
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
  undoBar: { position: 'absolute', left: 16, right: 16, zIndex: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: C.ink, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, ...shadow, shadowOpacity: 0.25 },
  undoText: { color: C.onInk, fontWeight: '700', flexShrink: 1 },
  undoBtn: { color: '#FFC94D', fontWeight: '900' },
  selBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14, marginTop: 10 },
  selLink: { color: C.sub, fontWeight: '800', fontSize: 13 },
  selFloat: { position: 'absolute', bottom: 34, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 12, borderWidth: 1, borderColor: C.line, ...shadow, shadowOpacity: 0.18 },
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
  prTag: { fontSize: 10, fontWeight: '900', color: C.sub, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  prTagOnPhoto: { color: '#fff', borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(0,0,0,0.25)' },
  adHero: { height: 236, borderRadius: 22, overflow: 'hidden', padding: 16, marginBottom: 10, backgroundColor: '#22252B' },
  adHeroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%', backgroundColor: 'rgba(8,10,15,0.48)' },
  adHeroKicker: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  adHeroClose: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  adHeroTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5, lineHeight: 33, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 8 },
  adHeroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '600', marginTop: 4 },
  adBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11, flexShrink: 1 },
  adBtnText: { color: '#15171C', fontWeight: '900', fontSize: 15 },
  adBtn2: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)', flexShrink: 1 },
  adBtn2Text: { color: '#fff', fontWeight: '800', fontSize: 15 },
  adTile: { width: 168, height: 168, borderRadius: 20, padding: 14 },
  adTileIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  adTileTitle: { color: '#fff', fontSize: 16, fontWeight: '900', lineHeight: 20 },
  adTileSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '600', marginTop: 3, lineHeight: 16 },
  adTileBrand: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', flexShrink: 1 },
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
