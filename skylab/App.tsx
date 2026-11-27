import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as S from './src/sky';
import { t, ja, fmtTime, fmtDay, fmtDayTime } from './src/i18n';

const SERVERS = ['https://tripfold.net/skylab', 'https://skylab.160-251-171-249.sslip.io'];
const WEB = 'https://tripfold.net/skylab';
const C = { bg: '#0B1026', card: '#151C3B', line: '#252E57', text: '#EEF1FF', sub: '#9AA3CC', accent: '#7FD1FF', good: '#5BE3A5', fair: '#F5C451', poor: '#8A90B5', exp: '#C69CFF' };
const LV_COLOR: Record<string, string> = { '3': C.good, '2': C.fair, '1': C.poor, '0': '#5A6088', '-1': '#5A6088' };

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

async function api(path: string, init?: RequestInit, ms = 20000) {
  let last: any;
  for (const base of SERVERS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(base + path, { ...init, signal: ac.signal, headers: { 'Content-Type': 'application/json' } });
      clearTimeout(timer);
      if (r.status >= 500) throw new Error('server ' + r.status);
      return await r.json();
    } catch (e) { clearTimeout(timer); last = e; }
  }
  throw last;
}
async function userId() {
  let id = await AsyncStorage.getItem('uid');
  if (!id) { id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); await AsyncStorage.setItem('uid', id); }
  return id;
}

type Loc = { lat: number; lon: number; name: string };

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const [tab, setTab] = useState<'today' | 'calendar' | 'settings'>('today');
  const [loc, setLoc] = useState<Loc | null>(null);
  const [locErr, setLocErr] = useState(false);
  const [data, setData] = useState<S.SkyData | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<Date | null>(null);
  const [report, setReport] = useState<{ key: string; item?: S.Item } | null>(null);
  const [prefs, setPrefs] = useState({ aurora: true, golden: false });

  useEffect(() => { AsyncStorage.getItem('prefs').then((s) => s && setPrefs(JSON.parse(s))); }, []);

  const locate = useCallback(async () => {
    setLocErr(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocErr(true); return; }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let name = '';
      try { const g = (await Location.reverseGeocodeAsync(p.coords))[0]; name = g?.city || g?.subregion || g?.region || ''; } catch {}
      setLoc({ lat: p.coords.latitude, lon: p.coords.longitude, name });
    } catch { setLocErr(true); }
  }, []);
  useEffect(() => { locate(); }, [locate]);

  const load = useCallback(async () => {
    if (!loc) return;
    setBusy(true); setErr(false);
    try {
      const j = await api(`/api/sky?lat=${loc.lat.toFixed(3)}&lon=${loc.lon.toFixed(3)}`);
      setData({ weather: j.weather, aurora: j.aurora, kp_forecast: j.kp_forecast });
      setAt(new Date());
    } catch { setErr(true); }
    setBusy(false);
  }, [loc]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 15 * 60e3); return () => clearInterval(i); }, [load]);

  // 通知の登録（オーロラはサーバーから。夕焼けの30分前は端末で予約）
  useEffect(() => {
    if (!loc) return;
    (async () => {
      const uid = await userId();
      let token: string | null = null;
      if (prefs.aurora || prefs.golden) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted' && prefs.aurora) {
          try { token = (await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig?.extra?.eas?.projectId })).data; } catch {}
        }
      }
      api('/api/register', { method: 'POST', body: JSON.stringify({ user: uid, token, lat: loc.lat, lon: loc.lon, lang: ja ? 'ja' : 'en', aurora: prefs.aurora }) }).catch(() => {});
    })();
  }, [loc, prefs.aurora]);

  const items = useMemo(() => (loc && data ? S.today(loc.lat, loc.lon, data) : []), [loc, data]);
  const gb = useMemo(() => (loc ? S.goldenBlue(loc.lat, loc.lon, data?.weather ?? null, new Date()) : []), [loc, data]);

  useEffect(() => {
    (async () => {
      await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
      if (!prefs.golden || !items.length) return;
      const ss = items.find((i) => i.key === 'sunset');
      if (!ss?.peak) return;
      const when = new Date(ss.peak.getTime() - 30 * 60e3);
      if (when.getTime() < Date.now() + 60e3) return;
      await Notifications.scheduleNotificationAsync({ content: { title: t.notifyGolden(t.names.sunset), body: t.notifyGoldenBody(t.lv[String(ss.level)]) }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when } }).catch(() => {});
    })();
  }, [prefs.golden, items]);

  const savePrefs = (p: typeof prefs) => { setPrefs(p); AsyncStorage.setItem('prefs', JSON.stringify(p)); };

  return (
    <SafeAreaView style={st.root} edges={['top']}>
      <View style={{ flex: 1 }}>
        {tab === 'today' && <Today loc={loc} locErr={locErr} locate={locate} data={data} err={err} busy={busy} at={at} items={items} gb={gb} reload={load} onReport={(key, item) => setReport({ key, item })} />}
        {tab === 'calendar' && loc && <Calendar loc={loc} onReport={(key) => setReport({ key })} />}
        {tab === 'calendar' && !loc && <Center><Text style={st.sub}>{t.locating}</Text></Center>}
        {tab === 'settings' && <Settings prefs={prefs} setPrefs={savePrefs} />}
      </View>
      <SafeAreaView edges={['bottom']} style={st.tabs}>
        {(['today', 'calendar', 'settings'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={st.tab}>
            <Text style={[st.tabText, tab === k && { color: C.accent }]}>{t[k]}</Text>
          </Pressable>
        ))}
      </SafeAreaView>
      <ReportSheet r={report} loc={loc} onClose={() => setReport(null)} />
    </SafeAreaView>
  );
}

const Center = ({ children }: any) => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>{children}</View>;

function Today(p: { loc: Loc | null; locErr: boolean; locate: () => void; data: S.SkyData | null; err: boolean; busy: boolean; at: Date | null; items: S.Item[]; gb: S.Item[]; reload: () => void; onReport: (k: string, i?: S.Item) => void }) {
  if (p.locErr) return <Center><Text style={st.sub}>{t.noLoc}</Text><Btn label={t.retry} onPress={p.locate} /></Center>;
  if (!p.loc) return <Center><ActivityIndicator color={C.accent} /><Text style={[st.sub, { marginTop: 12 }]}>{t.locating}</Text></Center>;
  if (!p.data && p.err) return <Center><Text style={st.sub}>{t.offline}</Text><Btn label={t.retry} onPress={p.reload} /></Center>;
  if (!p.data) return <Center><ActivityIndicator color={C.accent} /><Text style={[st.sub, { marginTop: 12 }]}>{t.loading}</Text></Center>;
  const order = ['aurora', 'sunset', 'rainbow', 'stars', 'milkyway', 'sunrise'];
  // オーロラは見込みがあるときだけ先頭に、ないときは星空の後ろに置く
  const au = p.items.find((i) => i.key === 'aurora');
  const sorted = [...p.items].sort((a, b) => {
    const ka = a.key === 'aurora' && (au?.level ?? 0) < 2 ? 4.5 : order.indexOf(a.key);
    const kb = b.key === 'aurora' && (au?.level ?? 0) < 2 ? 4.5 : order.indexOf(b.key);
    return ka - kb;
  });
  const nextG = p.gb.slice(0, 2);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={p.busy} onRefresh={p.reload} tintColor={C.accent} />}>
      <Text style={st.h1}>{t.today}</Text>
      <Text style={st.sub}>{p.loc.name || `${p.loc.lat.toFixed(2)}, ${p.loc.lon.toFixed(2)}`}{p.at ? ` ・ ${t.updated(fmtTime(p.at))}` : ''}</Text>
      {sorted.map((it) => <ItemCard key={it.key} it={it} data={p.data!} onReport={() => p.onReport(it.key, it)} />)}
      {nextG.map((it, i) => <ItemCard key={it.key + i} it={it} data={p.data!} onReport={() => p.onReport(it.key, it)} />)}
    </ScrollView>
  );
}

function Pill({ level, text }: { level: S.Level; text?: string }) {
  return <View style={[st.pill, { backgroundColor: LV_COLOR[String(level)] + '33', borderColor: LV_COLOR[String(level)] }]}><Text style={[st.pillText, { color: LV_COLOR[String(level)] }]}>{text || t.lv[String(level)]}</Text></View>;
}

function ItemCard({ it, data, onReport }: { it: S.Item; data: S.SkyData; onReport: () => void }) {
  const lines: string[] = [];
  const x = it.extra || {};
  const range = it.start && it.end && it.end.getTime() - it.start.getTime() >= 30 * 60e3 ? `${fmtTime(it.start)}〜${fmtTime(it.end)}` : it.peak ? fmtTime(it.peak) : '';
  const dayTag = it.start || it.peak ? relDay(it.start || it.peak!) : '';
  if (it.key === 'sunset' || it.key === 'sunrise') {
    if (x.tot != null) lines.push(x.tot < 10 ? t.clearSky : t.sunsetWhy(x.low, Math.max(x.mid, x.high)));
    if (it.dir != null) lines.push(t.dirSky(S.compass(it.dir, ja)));
  }
  if (it.key === 'rainbow') {
    if (it.level === 0) lines.push(t.noRainbow);
    else if (it.dir != null) lines.push(t.rainbowAt(S.compass(it.dir, ja), x.top));
  }
  if (it.key === 'stars' || it.key === 'milkyway') {
    if (x.reason === 'moon') lines.push(t.milkyMoon);
    else if (x.cloud != null) lines.push(t.starsWhy(x.cloud));
    if (it.key === 'milkyway' || it.key === 'stars') lines.push(t.lightNote);
  }
  if (it.key === 'aurora') {
    if (x.ovation != null) lines.push(t.auroraNow(x.ovation, S.compass(it.dir, ja) || (ja ? '真上' : 'overhead'), x.km));
    if (!x.darkNow && it.start) lines.push(`${t.auroraDay} ${fmtDayTime(it.start)}`);
    if (x.cloud != null) lines.push(`${t.cloud} ${Math.round(x.cloud)}%`);
    if (x.maxKp != null) lines.push(t.kp(x.maxKp));
    lines.push(t.auroraNote);
  }
  if (it.key === 'goldenhour' || it.key === 'bluehour') { if (x.cloud != null) lines.push(t.goldenWhy(x.cloud)); if (it.dir != null) lines.push(t.dirSky(S.compass(it.dir, ja))); }
  return (
    <View style={st.card}>
      <View style={st.row}>
        <Text style={st.h2}>{t.names[it.key]}</Text>
        {it.exp && <View style={st.expBadge}><Text style={st.expText}>{t.exp}</Text></View>}
        <View style={{ flex: 1 }} />
        <Pill level={it.level} text={it.key === 'aurora' && x.waitDark ? t.afterDark : undefined} />
      </View>
      {!!range && <Text style={st.time}>{dayTag}{range}</Text>}
      {lines.filter(Boolean).map((l, i) => <Text key={i} style={st.line}>{l}</Text>)}
      <View style={[st.row, { marginTop: 10 }]}>
        {it.exp && <Text style={[st.small, { flex: 1 }]}>{t.expNote}</Text>}
        {!it.exp && <View style={{ flex: 1 }} />}
        <Pressable onPress={onReport} style={st.reportBtn}><Text style={st.reportText}>{t.report}</Text></Pressable>
      </View>
    </View>
  );
}
function relDay(d: Date) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const n = Math.round((b.getTime() - a.getTime()) / 86400e3);
  return n === 0 ? '' : n === 1 ? `${t.tomorrow} ` : `${fmtDay(d)} `;
}

function Calendar({ loc, onReport }: { loc: Loc; onReport: (k: string) => void }) {
  const now = useMemo(() => new Date(), []);
  const showers = useMemo(() => S.meteorShowers(loc.lat, loc.lon, now), [loc]);
  const ecl = useMemo(() => S.eclipses(loc.lat, loc.lon, now), [loc]);
  const moon = useMemo(() => S.moonInfo(loc.lat, loc.lon, now), [loc]);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={st.h1}>{t.calendar}</Text>
      <Text style={st.h3}>{t.moonTitle}</Text>
      <View style={st.card}>
        <Text style={st.line}>{t.moonLit(Math.round(moon.frac * 100))}</Text>
        <Text style={st.line}>{t.fullMoon}：{fmtDayTime(moon.full)}（{Math.round(moon.fullKm / 1000) * 1000 > 0 ? `${Math.round(moon.fullKm).toLocaleString()} km` : ''}）</Text>
        <Text style={st.line}>{t.newMoon}：{fmtDayTime(moon.newMoon)}</Text>
        {moon.supermoons.slice(0, 3).map((s, i) => <Text key={i} style={st.line}>{t.supermoon}：{fmtDay(s.t)}（{Math.round(s.km).toLocaleString()} km）</Text>)}
        <Text style={st.small}>{t.smNote}</Text>
      </View>
      <Text style={st.h3}>{t.showers}</Text>
      {showers.map((s) => (
        <View key={s.id} style={st.card}>
          <View style={st.row}><Text style={st.h2}>{ja ? s.ja : s.en}</Text><View style={{ flex: 1 }} /><Pressable onPress={() => onReport('meteor')} style={st.reportBtn}><Text style={st.reportText}>{t.report}</Text></Pressable></View>
          <Text style={st.time}>{fmtDayTime(s.best)}</Text>
          <Text style={st.line}>{s.rate > 0 ? t.perHour(s.rate) : t.notHere}</Text>
          <Text style={st.line}>{t.moonLit(Math.round(s.moonFrac * 100))}{s.moonUp ? '' : ja ? '（月は沈んでいます）' : ' (moon below horizon)'}</Text>
        </View>
      ))}
      <Text style={st.h3}>{t.eclipses}</Text>
      {ecl.map((e, i) => (
        <View key={i} style={[st.card, !e.visible && { opacity: 0.55 }]}>
          <Text style={st.h2}>{e.kind === 'lunar' ? t.lunar[e.type] || e.type : t.solar[e.type] || e.type}</Text>
          <Text style={st.time}>{fmtDayTime(e.peak)}</Text>
          <Text style={st.line}>{e.visible ? t.visibleHere : t.notHere}{e.kind === 'solar' && e.visible && e.obscuration != null ? ` ・ ${t.obsc(Math.round(e.obscuration * 100))}` : ''}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Settings({ prefs, setPrefs }: { prefs: { aurora: boolean; golden: boolean }; setPrefs: (p: any) => void }) {
  const [msg, setMsg] = useState('');
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={st.h1}>{t.settings}</Text>
      <Text style={st.h3}>{t.notif}</Text>
      <View style={st.card}>
        <View style={st.row}><Text style={[st.line, { flex: 1 }]}>{t.auroraAlert}</Text><Switch value={prefs.aurora} onValueChange={(v) => setPrefs({ ...prefs, aurora: v })} /></View>
        <View style={[st.row, { marginTop: 8 }]}><Text style={[st.line, { flex: 1 }]}>{t.goldenAlert}</Text><Switch value={prefs.golden} onValueChange={(v) => setPrefs({ ...prefs, golden: v })} /></View>
      </View>
      <View style={st.card}><Text style={st.line}>{t.about}</Text></View>
      {[[t.privacy, '/privacy'], [t.terms, '/terms'], [t.support, '/support']].map(([l, u]) => (
        <Pressable key={u} style={st.card} onPress={() => Linking.openURL(WEB + u)}><Text style={[st.line, { color: C.accent }]}>{l}</Text></Pressable>
      ))}
      <Pressable style={st.card} onPress={async () => { const uid = await userId(); await api('/api/delete', { method: 'POST', body: JSON.stringify({ user: uid }) }).catch(() => {}); setMsg(t.deleted); }}>
        <Text style={[st.line, { color: '#FF8A8A' }]}>{t.deleteData}</Text>
        {!!msg && <Text style={st.small}>{msg}</Text>}
      </Pressable>
      <Text style={[st.small, { textAlign: 'center', marginTop: 12 }]}>SkyLab {Constants.expoConfig?.version} ・ Weather: Open-Meteo (ECMWF, DWD ICON, NOAA GFS) ・ Aurora: NOAA SWPC</Text>
    </ScrollView>
  );
}

function ReportSheet({ r, loc, onClose }: { r: { key: string; item?: S.Item } | null; loc: Loc | null; onClose: () => void }) {
  const [done, setDone] = useState(false);
  const [strength, setStrength] = useState<number | null>(null);
  useEffect(() => { if (r) { setDone(false); setStrength(null); } }, [r]);
  if (!r) return null;
  const name = t.names[r.key] || r.key;
  const send = async (seen: boolean) => {
    if (!loc) return;
    const uid = await userId();
    const shown = r.item ? { level: r.item.level, exp: r.item.exp, extra: r.item.extra, peak: r.item.peak } : null;
    api('/api/report', { method: 'POST', body: JSON.stringify({ user: uid, phenomenon: r.key, seen, lat: loc.lat, lon: loc.lon, at: new Date().toISOString(), strength, app: 'ios-' + (Constants.expoConfig?.version || ''), shown }) }).catch(() => {});
    setDone(true);
    setTimeout(onClose, 1400);
  };
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        {done ? <Text style={[st.h2, { textAlign: 'center', marginVertical: 24 }]}>{t.thanks}</Text> : (
          <>
            <Text style={[st.h2, { marginBottom: 14 }]}>{t.reportTitle(name)}</Text>
            {['aurora', 'sunset', 'sunrise', 'rainbow', 'meteor'].includes(r.key) && (
              <View style={[st.row, { marginBottom: 14 }]}>
                <Text style={[st.sub, { marginRight: 10 }]}>{t.strength}</Text>
                {[t.weak, t.mid, t.strong].map((l, i) => (
                  <Pressable key={i} onPress={() => setStrength(i + 1)} style={[st.chip, strength === i + 1 && { borderColor: C.accent, backgroundColor: C.accent + '22' }]}><Text style={st.chipText}>{l}</Text></Pressable>
                ))}
              </View>
            )}
            <View style={st.row}>
              <Btn label={t.seen} onPress={() => send(true)} flex />
              <View style={{ width: 10 }} />
              <Btn label={t.notSeen} onPress={() => send(false)} flex ghost />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function Btn({ label, onPress, flex, ghost }: { label: string; onPress: () => void; flex?: boolean; ghost?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[st.btn, flex && { flex: 1 }, ghost && { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line }]}>
      <Text style={[st.btnText, ghost && { color: C.text }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: 28, fontWeight: '700', marginBottom: 4 },
  h2: { color: C.text, fontSize: 18, fontWeight: '600' },
  h3: { color: C.sub, fontSize: 14, fontWeight: '600', marginTop: 22, marginBottom: 2, letterSpacing: 0.5 },
  sub: { color: C.sub, fontSize: 14, textAlign: 'left' },
  small: { color: C.sub, fontSize: 12, lineHeight: 17 },
  line: { color: C.text, fontSize: 14, lineHeight: 21, marginTop: 3, opacity: 0.92 },
  time: { color: C.accent, fontSize: 16, fontWeight: '600', marginTop: 6 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: '700' },
  expBadge: { marginLeft: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: C.exp + '22' },
  expText: { color: C.exp, fontSize: 11, fontWeight: '700' },
  reportBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line },
  reportText: { color: C.text, fontSize: 13 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: '#0E1430' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { color: C.sub, fontSize: 14, fontWeight: '600' },
  btn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#0B1026', fontSize: 16, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: '#0008' },
  sheet: { backgroundColor: C.card, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line, marginRight: 8 },
  chipText: { color: C.text, fontSize: 13 },
});
