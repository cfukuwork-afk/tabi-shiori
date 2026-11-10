import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
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

const TRIP_EMOJI = ['✈️', '🗼', '🏝', '🏔', '🎡', '🏰', '🌸', '🍜', '🗽', '🐨'];

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
  const [adding, setAdding] = useState<{ tripId: string; edit?: Booking } | null>(null);
  const [detail, setDetail] = useState<{ tripId: string; id: string } | null>(null);

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
        onCreate={(name, emoji) => {
          const tr: Trip = {
            id: uid(),
            name,
            emoji,
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

      {adding && (
        <AddBookingSheet
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

      <SettingsSheet visible={showSettings} settings={settings} onClose={() => setShowSettings(false)} onChange={changeSettings} />

      <WelcomeSheet
        visible={!settings.onboarded}
        settings={settings}
        onDone={(s, sample) => {
          changeSettings({ ...s, onboarded: true });
          if (sample) updateTrips((all) => [sampleTrip(s), ...all]);
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
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 }}>
      <View style={s.headRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={s.logo}>
            <Text style={{ fontSize: 24 }}>🧳</Text>
          </View>
          <Text style={s.appTitle}>{t('appName')}</Text>
        </View>
        <Pressable onPress={onSettings} hitSlop={12} style={s.gear}>
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </Pressable>
      </View>

      <Text style={s.sec}>{t('nextUp')}</Text>
      {next ? (
        <NextCard next={next} onPress={() => onOpenBooking(next.trip.id, next.item.booking.id)} />
      ) : (
        <View style={[s.card, { alignItems: 'center', paddingVertical: 22 }]}>
          <Text style={s.hint}>{t('noNext')}</Text>
        </View>
      )}

      <View style={[s.headRow, { marginTop: 22 }]}>
        <Text style={[s.sec, { marginTop: 0 }]}>{t('trips')}</Text>
        <Pressable onPress={onNew} style={s.smallBtn}>
          <Text style={s.smallBtnText}>＋ {t('newTrip')}</Text>
        </Pressable>
      </View>
      {sorted.length === 0 && (
        <View style={[s.card, { alignItems: 'center', paddingVertical: 28 }]}>
          <Text style={{ fontSize: 40 }}>🗺</Text>
          <Text style={[s.hint, { textAlign: 'center', marginTop: 8 }]}>{t('noTrips')}</Text>
        </View>
      )}
      {sorted.map((tr) => (
        <TripCard key={tr.id} trip={tr} rate={rate} onPress={() => onOpen(tr.id)} />
      ))}
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

function TripCard({ trip, rate, onPress }: { trip: Trip; rate: RateInfo; onPress: () => void }) {
  const { start, end } = tripRange(trip);
  const st = statusOf(trip);
  const total = tripTotal(trip, rate);
  return (
    <Pressable style={({ pressed }) => [s.tripCard, pressed && { opacity: 0.85 }]} onPress={onPress}>
      <View style={s.tripEmoji}>
        <Text style={{ fontSize: 30 }}>{trip.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.tripName} numberOfLines={1}>
          {trip.name}
        </Text>
        <Text style={s.hint}>
          {start ? `${prettyDate(start)}${end && end !== start ? ' 〜 ' + prettyDate(end) : ''}` : t('undated')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center' }}>
          <View style={[s.pill, st.tone === 'pink' ? { backgroundColor: C.pinkSoft } : st.tone === 'mint' ? { backgroundColor: C.mintSoft } : {}]}>
            <Text style={[s.pillText, st.tone === 'pink' ? { color: C.pink } : st.tone === 'mint' ? { color: C.mint } : {}]}>{st.label}</Text>
          </View>
          <Text style={s.hint}>
            {TYPES.filter((ty) => trip.bookings.some((b) => b.type === ty.id))
              .map((ty) => ty.emoji)
              .join(' ')}
          </Text>
        </View>
      </View>
      {total > 0 && <Text style={s.tripTotal}>{fmtMoney(Math.round(total), rate.base)}</Text>}
    </Pressable>
  );
}

function NextCard({ next, onPress }: { next: NonNullable<ReturnType<typeof nextUp>>; onPress: () => void }) {
  const b = next.item.booking;
  const ty = typeOf(b.type);
  const today = todayStr();
  const n = daysBetween(today, next.date);
  const edgeLabel =
    next.item.edge === 'start' ? (b.type === 'hotel' ? t('checkin') : t('pickup')) : next.item.edge === 'end' ? (b.type === 'hotel' ? t('checkout') : t('dropoff')) : '';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.nextCard, { backgroundColor: ty.color }, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.nextWhen}>
          {n === 0 ? t('today') : t('daysLeft', { n })} ・ {prettyDate(next.date)} {next.item.time ?? ''}
        </Text>
        <Text style={s.nextTrip} numberOfLines={1}>
          {next.trip.emoji} {next.trip.name}
        </Text>
      </View>
      <Text style={s.nextTitle} numberOfLines={1}>
        {ty.emoji} {b.title || typeName(b.type)} {edgeLabel ? `・${edgeLabel}` : ''}
      </Text>
      {(b.from || b.to) && (
        <Text style={s.nextRoute} numberOfLines={1}>
          {b.from}
          {b.to ? `  →  ${b.to}` : ''}
        </Text>
      )}
      {!!b.code && (
        <View style={s.nextCodeBox}>
          <Text style={s.nextCodeLabel}>{t('code')}</Text>
          <Text style={s.nextCode} selectable>
            {b.code}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

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
}: {
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
  const [sure, setSure] = useState(false);
  const { start, end } = tripRange(trip);
  const total = tripTotal(trip, rate);
  return (
    <View style={{ flex: 1 }}>
      <View style={s.tripHead}>
        <Pressable onPress={onBack} hitSlop={14} style={s.back}>
          <Text style={{ fontSize: 22, color: C.ink }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.tripHeadName} numberOfLines={1}>
            {trip.emoji} {trip.name}
          </Text>
          <Text style={s.hint}>
            {start ? `${prettyDate(start)}${end && end !== start ? ' 〜 ' + prettyDate(end) : ''}` : t('undated')}
            {total > 0 ? `  ・  ${fmtMoney(Math.round(total), rate.base)}` : ''}
          </Text>
        </View>
      </View>
      <View style={s.tabs}>
        {(['plan', 'bookings', 'money', 'pack'] as Tab[]).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]}>
            <Text style={[s.tabText, tab === k && { color: C.ink }]}>
              {k === 'plan' ? t('tabPlan') : k === 'bookings' ? t('tabBookings') : k === 'money' ? t('tabMoney') : t('tabPack')}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {tab === 'plan' && <PlanTab trip={trip} onOpen={onOpen} />}
        {tab === 'bookings' && <BookingsTab trip={trip} rate={rate} onOpen={onOpen} />}
        {tab === 'money' && <MoneyTab trip={trip} rate={rate} onChange={onChange} />}
        {tab === 'pack' && <PackTab trip={trip} onChange={onChange} />}
        <Pressable onPress={() => (sure ? onDelete() : setSure(true))} style={{ alignSelf: 'center', marginTop: 30 }}>
          <Text style={{ color: sure ? C.pink : C.sub, fontWeight: '700' }}>{sure ? t('deleteSure') : `🗑 ${t('delete')}`}</Text>
        </Pressable>
      </ScrollView>
      {(tab === 'plan' || tab === 'bookings') && (
        <Pressable style={({ pressed }) => [s.fab, pressed && { transform: [{ scale: 0.97 }] }]} onPress={onAdd}>
          <Text style={s.fabText}>{t('addBooking')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function PlanTab({ trip, onOpen }: { trip: Trip; onOpen: (b: Booking) => void }) {
  const days = timeline(trip);
  const { start } = tripRange(trip);
  if (!days.length)
    return (
      <View style={[s.card, { alignItems: 'center', paddingVertical: 30 }]}>
        <Text style={{ fontSize: 40 }}>📮</Text>
        <Text style={[s.hint, { textAlign: 'center', marginTop: 8 }]}>{t('noBookings')}</Text>
      </View>
    );
  return (
    <>
      {days.map(({ date, items }) => (
        <View key={date} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <Text style={s.dayN}>{start ? t('dayN', { n: daysBetween(start, date) + 1 }) : ''}</Text>
            <Text style={s.dayDate}>{prettyDate(date)}</Text>
          </View>
          <View style={s.card}>
            {items.map((it, i) => {
              const b = it.booking;
              const ty = typeOf(b.type);
              const edge =
                it.edge === 'start' ? (b.type === 'hotel' ? t('checkin') : t('pickup')) : it.edge === 'end' ? (b.type === 'hotel' ? t('checkout') : t('dropoff')) : '';
              return (
                <Pressable key={b.id + it.edge} onPress={() => onOpen(b)} style={[s.tlRow, i > 0 && s.tlLine]}>
                  <Text style={s.tlTime}>{it.time ?? '—'}</Text>
                  <View style={[s.tlDot, { backgroundColor: ty.soft }]}>
                    <Text style={{ fontSize: 18 }}>{ty.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tlTitle} numberOfLines={1}>
                      {b.title || typeName(b.type)}
                      {edge ? <Text style={{ color: ty.color }}>{`  ${edge}`}</Text> : null}
                    </Text>
                    {(b.from || b.to) && it.edge !== 'end' ? (
                      <Text style={s.hint} numberOfLines={1}>
                        {b.from}
                        {b.to && b.type !== 'car' ? ` → ${b.to}` : ''}
                      </Text>
                    ) : null}
                    {!!b.code && <Text style={s.tlCode}># {b.code}</Text>}
                  </View>
                  {!!b.photos?.length && <Text style={{ fontSize: 14 }}>🖼</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </>
  );
}

function BookingsTab({ trip, rate, onOpen }: { trip: Trip; rate: RateInfo; onOpen: (b: Booking) => void }) {
  if (!trip.bookings.length) return <PlanTab trip={trip} onOpen={onOpen} />;
  return (
    <>
      {TYPES.filter((ty) => trip.bookings.some((b) => b.type === ty.id)).map((ty) => (
        <View key={ty.id} style={{ marginBottom: 14 }}>
          <Text style={s.sec}>
            {ty.emoji} {typeName(ty.id)}
          </Text>
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
                    {!!b.code && <Text style={s.tlCode}># {b.code}</Text>}
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
      </View>

      {byType.length > 0 && (
        <>
          <Text style={s.sec}>{t('byType')}</Text>
          <View style={s.card}>
            {byType.map(({ ty, v }) => (
              <View key={ty.id} style={{ marginVertical: 5 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.tlTitle}>
                    {ty.emoji} {typeName(ty.id)}
                  </Text>
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

      <Text style={s.sec}>{t('members')}</Text>
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
              <Text style={s.chipText}>
                {m.id === 'me' ? '🙂' : '👤'} {m.name}
              </Text>
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
          <Text style={s.sec}>{t('settle')}</Text>
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
              st.pay.map((p, i) => (
                <View key={i} style={[s.rowBetween, { paddingVertical: 6 }]}>
                  <Text style={s.tlTitle}>{t('pays', { a: nameOf(p.from), b: nameOf(p.to) })}</Text>
                  <Text style={[s.price, { color: C.pink }]}>{fmtMoney(Math.round(p.amount), rate.base)}</Text>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </>
  );
}

function PackTab({ trip, onChange }: { trip: Trip; onChange: (fn: (t: Trip) => Trip) => void }) {
  const [text, setText] = useState('');
  const done = trip.checklist.filter((c) => c.done).length;
  return (
    <>
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
            <View style={[s.check, c.done && { backgroundColor: C.mint, borderColor: C.mint }]}>{c.done && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}</View>
            <Text style={[s.tlTitle, c.done && { color: C.sub, textDecorationLine: 'line-through' }]}>{c.text}</Text>
          </Pressable>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TextInput style={[s.input, { flex: 1 }]} value={text} onChangeText={setText} placeholderTextColor={C.sub} />
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
              <Text style={{ fontSize: 16, fontWeight: '900', color: C.ink }}>✕</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function NewTripSheet({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: (name: string, emoji: string) => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(TRIP_EMOJI[0]);
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={s.sheetTitle}>{t('newTrip')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {TRIP_EMOJI.map((e) => (
          <Pressable key={e} onPress={() => setEmoji(e)} style={[s.emojiBtn, emoji === e && { borderColor: C.pink, backgroundColor: C.pinkSoft }]}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t('tripName')} placeholderTextColor={C.sub} />
      <Pressable
        style={[s.primary, !name.trim() && { opacity: 0.4 }]}
        disabled={!name.trim()}
        onPress={() => {
          onCreate(name.trim(), emoji);
          setName('');
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
}: {
  trip: Trip;
  edit?: Booking;
  home: string;
  onClose: () => void;
  onSave: (b: Booking) => void;
}) {
  const [mode, setMode] = useState<'choose' | 'text' | 'form'>(edit ? 'form' : 'choose');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [b, setB] = useState<Booking>(
    edit ?? { id: uid(), type: 'flight', title: '', start: tripRange(trip).start ?? todayStr(), currency: home, createdAt: Date.now() },
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
    const uri = r.assets[0].uri;
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
    if (!r.canceled && r.assets?.[0]) set({ photos: [...(b.photos ?? []), r.assets[0].uri] });
  };
  const cur = findCurrency(b.currency || home);

  return (
    <Sheet visible onClose={onClose} tall={mode === 'form'}>
      {mode === 'choose' && (
        <>
          <Text style={s.sheetTitle}>{t('howAdd')}</Text>
          <AddOption emoji="📷" title={t('fromShot')} sub={busy ? t('ocrBusy') : t('fromShotSub')} onPress={pickShot} />
          <AddOption emoji="📋" title={t('fromText')} sub={t('fromTextSub')} onPress={() => setMode('text')} />
          <AddOption emoji="✏️" title={t('manual')} sub={t('manualSub')} onPress={() => setMode('form')} />
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
              <Text style={s.secondaryText}>📋 {t('copy') === 'Copy' ? 'Paste' : '貼り付け'}</Text>
            </Pressable>
            <Pressable style={[s.primary, { flex: 1, marginTop: 0 }, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim()} onPress={() => applyParsed(text)}>
              <Text style={s.primaryText}>{t('read')}</Text>
            </Pressable>
          </View>
        </>
      )}
      {mode === 'form' && (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          <Text style={s.sheetTitle}>{edit ? t('edit') : t('addTitle')}</Text>
          {!!note && (
            <View style={s.note}>
              <Text style={s.noteText}>{note}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {TYPES.map((ty) => (
              <Pressable key={ty.id} onPress={() => set({ type: ty.id as BookingType })} style={[s.typeChip, b.type === ty.id && { backgroundColor: ty.soft, borderColor: ty.color }]}>
                <Text style={[s.chipText, b.type === ty.id && { color: C.ink }]}>
                  {ty.emoji} {typeName(ty.id)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field label={t('title')} value={b.title} onChange={(v) => set({ title: v })} />
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
                <Image source={{ uri: p }} style={s.thumb} />
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

function AddOption({ emoji, title, sub, onPress }: { emoji: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.option, pressed && { opacity: 0.8 }]} onPress={onPress}>
      <Text style={{ fontSize: 28 }}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.tlTitle}>{title}</Text>
        <Text style={s.hint}>{sub}</Text>
      </View>
      <Text style={{ color: C.sub, fontSize: 18 }}>›</Text>
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
          <Text style={s.dateBtnText}>‹</Text>
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
          <Text style={s.dateBtnText}>›</Text>
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
        <Text style={s.chipText}>
          {c.flag} {c.code}
        </Text>
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
                  <Text style={s.tlTitle}>
                    {x.flag} {x.code}
                  </Text>
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
        <View style={[s.detailHead, { backgroundColor: ty.soft }]}>
          <Text style={{ fontSize: 34 }}>{ty.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.hint, { color: ty.color, fontWeight: '800' }]}>
              {typeName(b.type)} ・ {trip.emoji} {trip.name}
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
            <Text style={[s.hint, { color: C.pink, fontWeight: '800' }]}>{copied ? t('copied') : t('copy')}</Text>
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
          {!!b.from && <Info k={t('from')} v={b.from} />}
          {!!b.to && <Info k={t('to')} v={b.to} />}
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
                <Image source={{ uri: p }} style={s.photoBig} />
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <Pressable style={[s.secondary, { flex: 1 }]} onPress={onEdit}>
            <Text style={s.secondaryText}>✏️ {t('edit')}</Text>
          </Pressable>
          <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => (sure ? onDelete() : setSure(true))}>
            <Text style={[s.secondaryText, sure && { color: C.pink }]}>{sure ? t('deleteSure') : `🗑 ${t('delete')}`}</Text>
          </Pressable>
        </View>
      </ScrollView>
      <Modal visible={!!zoom} transparent onRequestClose={() => setZoom(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }} onPress={() => setZoom(null)}>
          {zoom && <Image source={{ uri: zoom }} style={{ width: '100%', height: '85%' }} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </Sheet>
  );
}

const Info = ({ k, v }: { k: string; v: string }) => (
  <View style={s.infoRow}>
    <Text style={s.infoK}>{k}</Text>
    <Text style={s.infoV} selectable>
      {v}
    </Text>
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
        <View style={[s.logo, { width: 90, height: 90, borderRadius: 30, alignSelf: 'center' }]}>
          <Text style={{ fontSize: 50 }}>🧳</Text>
        </View>
        <Text style={[s.appTitle, { textAlign: 'center', fontSize: 28, marginTop: 14 }]}>{t('appName')}</Text>
        <Text style={[s.hint, { textAlign: 'center', fontSize: 15, lineHeight: 23, marginTop: 10 }]}>{t('welcomeText')}</Text>
        <View style={{ marginTop: 20 }}>
          <SettingsBody settings={st} onChange={setSt} />
        </View>
        <Pressable style={s.primary} onPress={() => onDone(st, false)}>
          <Text style={s.primaryText}>{t('start')}</Text>
        </Pressable>
        <Pressable style={[s.secondary, { marginTop: 10 }]} onPress={() => onDone(st, true)}>
          <Text style={s.secondaryText}>✨ {t('sample')}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

/* ---------------- お試し用の旅行 ---------------- */
function sampleTrip(st: Settings): Trip {
  const base = shiftDate(todayStr(), 20);
  const d = (n: number) => shiftDate(base, n);
  const ja = st.lang === 'ja';
  return {
    id: uid(),
    name: ja ? 'パリ 3泊' : 'Paris, 3 nights',
    emoji: '🗼',
    members: [
      { id: 'me', name: st.myName || t('me') },
      { id: 'm2', name: ja ? 'ゆき' : 'Yuki' },
    ],
    bookings: [
      { id: uid(), type: 'train', title: 'Eurostar', start: d(0), startTime: '08:31', endTime: '11:47', from: 'London St Pancras', to: 'Paris Gare du Nord', code: 'QXK7PL', seat: 'Coach 7 / 63, 64', price: 208, currency: 'GBP', paidBy: 'me', createdAt: 1 },
      { id: uid(), type: 'hotel', title: 'Hotel Le Marais', start: d(0), startTime: '15:00', end: d(3), endTime: '11:00', from: '12 Rue de Rivoli, Paris', code: '4821.339.112', price: 420, currency: 'EUR', paidBy: 'm2', createdAt: 2 },
      { id: uid(), type: 'ticket', title: ja ? 'ルーヴル美術館' : 'Louvre Museum', start: d(1), startTime: '10:00', code: 'LV-55219', price: 44, currency: 'EUR', paidBy: 'me', createdAt: 3 },
      { id: uid(), type: 'food', title: 'Le Comptoir', start: d(1), startTime: '19:30', memo: ja ? '2名・窓側' : 'Table for 2', createdAt: 4 },
      { id: uid(), type: 'car', title: 'Europcar', start: d(2), startTime: '09:00', end: d(2), endTime: '18:00', from: 'Paris Gare de Lyon', code: 'EC9921034', price: 89, currency: 'EUR', paidBy: 'm2', createdAt: 5 },
      { id: uid(), type: 'train', title: 'Eurostar', start: d(3), startTime: '17:13', endTime: '18:30', from: 'Paris Gare du Nord', to: 'London St Pancras', code: 'QXK7PL', price: 196, currency: 'GBP', paidBy: 'me', createdAt: 6 },
    ],
    checklist: t('defaultPack')
      .split(',')
      .map((x) => ({ id: uid(), text: x, done: false })),
    createdAt: Date.now(),
  };
}

const s = StyleSheet.create({
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 44, height: 44, borderRadius: 15, backgroundColor: C.pinkSoft, alignItems: 'center', justifyContent: 'center' },
  appTitle: { fontSize: 22, fontWeight: '900', color: C.ink },
  gear: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  sec: { fontSize: 15, fontWeight: '900', color: C.ink, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, ...shadow },
  hint: { fontSize: 12, color: C.sub, fontWeight: '600' },
  smallBtn: { backgroundColor: C.ink, borderRadius: 14, paddingHorizontal: 16, minWidth: 48, alignItems: 'center', paddingVertical: 10, justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  tripCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14, marginBottom: 10, ...shadow },
  tripEmoji: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#FFF1E2', alignItems: 'center', justifyContent: 'center' },
  tripName: { fontSize: 17, fontWeight: '900', color: C.ink },
  tripTotal: { fontSize: 14, fontWeight: '900', color: C.ink },
  pill: { backgroundColor: '#F1EAF0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '800', color: C.sub },
  nextCard: { borderRadius: 26, padding: 18, ...shadow },
  nextWhen: { color: '#fff', fontWeight: '800', fontSize: 13, opacity: 0.95 },
  nextTrip: { color: '#fff', fontWeight: '700', fontSize: 12, opacity: 0.85, maxWidth: '45%' },
  nextTitle: { color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 6 },
  nextRoute: { color: '#fff', fontWeight: '700', fontSize: 14, marginTop: 4, opacity: 0.95 },
  nextCodeBox: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 14, padding: 10, marginTop: 12 },
  nextCodeLabel: { color: '#fff', fontSize: 11, fontWeight: '800', opacity: 0.9 },
  nextCode: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 1.5 },
  tripHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  tripHeadName: { fontSize: 20, fontWeight: '900', color: C.ink },
  tabs: { flexDirection: 'row', marginHorizontal: 18, marginTop: 8, backgroundColor: '#F1E7DF', borderRadius: 16, padding: 4 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center' },
  tabOn: { backgroundColor: C.card, ...shadow },
  tabText: { fontWeight: '800', color: C.sub, fontSize: 13 },
  dayN: { fontSize: 18, fontWeight: '900', color: C.pink },
  dayDate: { fontSize: 14, fontWeight: '800', color: C.ink },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  tlLine: { borderTopWidth: 1, borderTopColor: C.line },
  tlTime: { width: 44, fontWeight: '800', color: C.ink, fontSize: 13 },
  tlDot: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tlTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  tlCode: { fontSize: 12, fontWeight: '800', color: C.pink, marginTop: 2 },
  price: { fontSize: 14, fontWeight: '900', color: C.ink },
  barBg: { height: 8, borderRadius: 4, backgroundColor: '#F4EDE7', marginTop: 5, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
  chip: { backgroundColor: '#F6EFEA', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontWeight: '800', color: C.ink, fontSize: 13 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: '#DCCFC6', alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 34, alignSelf: 'center', backgroundColor: C.pink, borderRadius: 26, paddingHorizontal: 28, paddingVertical: 16, ...shadow },
  fabText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(61,44,62,0.35)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10 },
  sheetTop: { height: 40, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#DCCFC6' },
  closeBtn: { position: 'absolute', right: -6, top: 0, width: 42, height: 42, borderRadius: 21, backgroundColor: '#F1E7DF', alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: C.ink, marginBottom: 12 },
  input: { backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink, fontWeight: '700', borderWidth: 1, borderColor: C.line },
  label: { fontSize: 12, fontWeight: '800', color: C.sub, marginTop: 12, marginBottom: 6 },
  primary: { backgroundColor: C.pink, borderRadius: 18, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondary: { backgroundColor: C.card, borderRadius: 18, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  secondaryText: { color: C.ink, fontWeight: '800', fontSize: 14 },
  emojiBtn: { width: 48, height: 48, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 10, ...shadow },
  note: { backgroundColor: C.mintSoft, borderRadius: 14, padding: 10, marginBottom: 10 },
  noteText: { color: '#2F8F72', fontWeight: '800', fontSize: 13 },
  typeChip: { borderRadius: 14, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 10, paddingVertical: 7 },
  two: { flexDirection: 'row', gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  dateBtn: { paddingHorizontal: 6, paddingVertical: 10 },
  dateBtnText: { fontSize: 18, fontWeight: '900', color: C.pink },
  dateInput: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 13, fontWeight: '800', color: C.ink, paddingVertical: 10 },
  curBtn: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, justifyContent: 'center', minHeight: 46 },
  curWrap: { flex: 1, backgroundColor: 'rgba(61,44,62,0.35)', justifyContent: 'center', padding: 40 },
  curList: { backgroundColor: C.bg, borderRadius: 22, maxHeight: '70%', padding: 8 },
  curRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12 },
  thumb: { width: 76, height: 110, borderRadius: 12, backgroundColor: '#eee' },
  thumbAdd: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 16, marginBottom: 12 },
  detailTitle: { fontSize: 22, fontWeight: '900', color: C.ink },
  codeBig: { backgroundColor: C.card, borderRadius: 22, padding: 16, alignItems: 'center', marginBottom: 12, borderWidth: 2, borderColor: C.pinkSoft, borderStyle: 'dashed' },
  codeBigText: { fontSize: 30, fontWeight: '900', color: C.ink, letterSpacing: 2, marginVertical: 4 },
  infoRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line, gap: 10 },
  infoK: { width: 96, fontSize: 12, fontWeight: '800', color: C.sub },
  infoV: { flex: 1, fontSize: 14, fontWeight: '800', color: C.ink },
  photoBig: { width: 150, height: 230, borderRadius: 14, backgroundColor: '#eee' },
});
