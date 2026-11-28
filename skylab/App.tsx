import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Image, ImageBackground, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as A from 'astronomy-engine';
import * as S from './src/sky';
import { t, fmtTime, fmtDay, fmtDayTime, compassL, showerName, apiLang, setLang, lang, LANGS, Lang, DOT, rng, par } from './src/i18n';

const DEFAULT_PREFS = { aurora: true, golden: true, stars: true, events: true, sunset: false };
const SERVERS = ['https://tripfold.net/skylab', 'https://skylab.160-251-171-249.sslip.io'];
const WEB = 'https://tripfold.net/skylab';
const C = { bg: '#0C1230', card: 'rgba(255,255,255,0.06)', cardSolid: '#18204A', line: 'rgba(255,255,255,0.12)', text: '#F2F3FF', sub: '#A9B0D6', accent: '#8FB7FF', good: '#6EE7B0', fair: '#F6C76B', poor: '#9A9FC4', exp: '#C9A5FF', bar: '#6FA8FF' };
const LV_COLOR: Record<string, string> = { '3': C.good, '2': C.fair, '1': C.poor, '0': '#6B7099', '-1': '#6B7099' };
const SCENE: Record<string, any> = {
  sunset: require('./assets/scenes/sunset.jpg'), sunrise: require('./assets/scenes/sunrise.jpg'), rainbow: require('./assets/scenes/rainbow.jpg'),
  stars: require('./assets/scenes/stars.jpg'), milkyway: require('./assets/scenes/milkyway.jpg'), aurora: require('./assets/scenes/aurora.jpg'),
  goldenhour: require('./assets/scenes/goldenhour.jpg'), bluehour: require('./assets/scenes/bluehour.jpg'), moon: require('./assets/scenes/moon.jpg'),
  meteor: require('./assets/scenes/meteor.jpg'), eclipse: require('./assets/scenes/eclipse.jpg'),
};
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

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
type Tab = 'home' | 'calendar' | 'report' | 'settings';

let lastTab: 'home' | 'calendar' | 'report' | 'settings' = 'home';
export default function App() {
  const [lng, setLng] = useState<Lang | null>(null);
  useEffect(() => { AsyncStorage.getItem('lang').then((l) => { if (l && LANGS.some((x) => x.id === l)) setLang(l as Lang); setLng(lang); }); }, []);
  const change = (l: Lang) => { setLang(l); AsyncStorage.setItem('lang', l).catch(() => {}); setLng(l); };
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {lng && <Main key={lng} onLang={change} />}
    </SafeAreaProvider>
  );
}

function Main({ onLang }: { onLang: (l: Lang) => void }) {
  const [tab, setTabRaw] = useState<Tab>(lastTab);
  const setTab = (x: Tab) => { lastTab = x; setTabRaw(x); };
  const [loc, setLoc] = useState<Loc | null>(null);
  const [locErr, setLocErr] = useState(false);
  const [data, setData] = useState<S.SkyData | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<Date | null>(null);
  const [report, setReport] = useState<{ key: string; item?: S.Item } | null>(null);
  const [detail, setDetail] = useState<S.Item | null>(null);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [meta, setMeta] = useState<{ issued_at?: string }>({});
  const [picker, setPicker] = useState(false);

  useEffect(() => { AsyncStorage.getItem('prefs').then((s) => s && setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(s) })); }, []);

  const locate = useCallback(async (force = false) => {
    setLocErr(false);
    if (!force) {
      const saved = await AsyncStorage.getItem('place');
      if (saved) { setLoc(JSON.parse(saved)); return; }
    } else await AsyncStorage.removeItem('place');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocErr(true); return; }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let name = '';
      try { const g = (await Location.reverseGeocodeAsync(p.coords))[0]; name = [g?.city || g?.subregion || g?.region, g?.isoCountryCode].filter(Boolean).join(', '); } catch {}
      setLoc({ lat: p.coords.latitude, lon: p.coords.longitude, name });
    } catch { setLocErr(true); }
  }, []);
  useEffect(() => { locate(); }, [locate]);

  const load = useCallback(async () => {
    if (!loc) return;
    setBusy(true); setErr(false);
    try {
      const j = await api(`/api/sky?lat=${loc.lat.toFixed(3)}&lon=${loc.lon.toFixed(3)}`);
      setData({ weather: j.weather, aurora: j.aurora, kp_forecast: j.kp_forecast, calibration: j.calibration ?? null });
      setMeta({ issued_at: j.issued_at });
      setAt(new Date());
    } catch { setErr(true); }
    setBusy(false);
  }, [loc]);
  useEffect(() => { load(); }, [load]);
  // 開いている間は 5 分ごと（オーロラ予報の更新に合わせる）、画面に戻ったときはすぐ読み直す
  useEffect(() => {
    const i = setInterval(() => AppState.currentState === 'active' && load(), 5 * 60e3);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => { clearInterval(i); sub.remove(); };
  }, [load]);

  useEffect(() => {
    if (!loc) return;
    (async () => {
      const uid = await userId();
      let token: string | null = null;
      if (Object.values(prefs).some(Boolean)) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted' && prefs.aurora) {
          try { token = (await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig?.extra?.eas?.projectId })).data; } catch {}
        }
      }
      api('/api/register', { method: 'POST', body: JSON.stringify({ user: uid, token, lat: loc.lat, lon: loc.lon, lang: apiLang(), aurora: prefs.aurora }) }).catch(() => {});
    })();
  }, [loc, prefs.aurora]);

  const items = useMemo(() => {
    if (!loc || !data) return [];
    const now = new Date();
    return S.withProb([...S.today(loc.lat, loc.lon, data, now), ...S.goldenBlue(loc.lat, loc.lon, data.weather, now).slice(0, 2)], loc.lat, loc.lon, data, now);
  }, [loc, data]);
  useEffect(() => { if (loc && data) scheduleLocal(loc, items, prefs); }, [loc, items, prefs]);

  const savePrefs = (p: typeof prefs) => { setPrefs(p); AsyncStorage.setItem('prefs', JSON.stringify(p)); };

  return (
    <View style={st.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <Header loc={loc} onPlace={() => setPicker(true)} onBell={() => setTab('settings')} />
        <View style={{ flex: 1 }}>
          {tab === 'home' && <Home loc={loc} locErr={locErr} locate={() => locate()} openPicker={() => setPicker(true)} data={data} err={err} busy={busy} at={at} items={items} reload={load} onOpen={setDetail} />}
          {tab === 'calendar' && (loc ? <Calendar loc={loc} onReport={(key) => setReport({ key })} /> : <Center><ActivityIndicator color={C.accent} /></Center>)}
          {tab === 'report' && <ReportTab items={items} onReport={(key, item) => setReport({ key, item })} />}
          {tab === 'settings' && <Settings prefs={prefs} setPrefs={savePrefs} onLang={onLang} />}
        </View>
      </SafeAreaView>
      <TabBar tab={tab} setTab={setTab} />
      <Detail it={detail} data={data} onClose={() => setDetail(null)} onReport={(it) => { setDetail(null); setReport({ key: it.key, item: it }); }} />
      <ReportSheet r={report} loc={loc} issuedAt={meta.issued_at} onClose={() => setReport(null)} />
      <PlacePicker open={picker} onClose={() => setPicker(false)} onPick={async (l) => { setPicker(false); if (l) { await AsyncStorage.setItem('place', JSON.stringify(l)); setLoc(l); } else locate(true); }} />
    </View>
  );
}

const Center = ({ children }: any) => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>{children}</View>;

function Header({ loc, onPlace, onBell }: { loc: Loc | null; onPlace: () => void; onBell: () => void }) {
  return (
    <View style={st.header}>
      <View style={st.row}>
        <Text style={st.logo}>SkyLab</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onBell} style={st.iconBtn} hitSlop={8}><Text style={{ color: C.text, fontSize: 17 }}>🔔</Text></Pressable>
      </View>
      <Pressable onPress={onPlace} style={st.placeChip}>
        <Text style={st.placeText}>📍 {loc ? loc.name || `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}` : '…'}  ▾</Text>
      </Pressable>
    </View>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: [Tab, string, string][] = [['home', '⌂', t.home], ['calendar', '▦', t.calendar], ['report', '✎', t.reportTab], ['settings', '⚙', t.settings]];
  return (
    <SafeAreaView edges={['bottom']} style={st.tabbar}>
      {tabs.map(([k, icon, label]) => (
        <Pressable key={k} onPress={() => setTab(k)} style={st.tab}>
          <Text style={[st.tabIcon, tab === k && { color: C.accent }]}>{icon}</Text>
          <Text style={[st.tabText, tab === k && { color: C.accent }]}>{label}</Text>
        </Pressable>
      ))}
    </SafeAreaView>
  );
}

const pctText = (p?: number | null) => (p == null ? '—' : t.pct(p));
const ORDER = ['sunset', 'rainbow', 'stars', 'milkyway', 'aurora', 'sunrise', 'goldenhour', 'bluehour'];

function Home(p: { loc: Loc | null; locErr: boolean; locate: () => void; openPicker: () => void; data: S.SkyData | null; err: boolean; busy: boolean; at: Date | null; items: S.Item[]; reload: () => void; onOpen: (i: S.Item) => void }) {
  if (p.locErr && !p.loc) return <Center><Text style={st.sub}>{t.noLoc}</Text><Btn label={t.searchCity} onPress={p.openPicker} /><Btn label={t.retry} onPress={p.locate} ghost /></Center>;
  if (!p.loc) return <Center><ActivityIndicator color={C.accent} /><Text style={[st.sub, { marginTop: 12 }]}>{t.locating}</Text></Center>;
  if (!p.data && p.err) return <Center><Text style={st.sub}>{t.offline}</Text><Btn label={t.retry} onPress={p.reload} /></Center>;
  if (!p.data) return <Center><ActivityIndicator color={C.accent} /><Text style={[st.sub, { marginTop: 12 }]}>{t.loading}</Text></Center>;
  const live = p.items.filter((i) => !(i.end && i.end.getTime() < Date.now()));
  const sorted = [...live].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  // おすすめ：確率が最も高いもの（同じなら優先順）。見込みが小さいときは出さない
  // 研究段階（信頼度 低）のものは、確かなものが無いときだけ選ぶ
  const cands = [...sorted].filter((i) => (i.p ?? 0) >= 0.3).sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
  const pick = cands.find((i) => i.conf !== 'low') || cands[0];
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={p.busy} onRefresh={p.reload} tintColor={C.accent} />}>
      <Text style={st.h1}>{t.today}</Text>
      <View style={st.h1Line} />
      {pick && <Hero it={pick} onPress={() => p.onOpen(pick)} />}
      {sorted.filter((i) => i !== pick).map((it, i) => <Row key={it.key + i} it={it} onPress={() => p.onOpen(it)} />)}
      {p.at && <Text style={[st.small, { textAlign: 'center', marginTop: 14 }]}>{t.updated(fmtTime(p.at))}</Text>}
    </ScrollView>
  );
}

function when(it: S.Item) {
  const d = it.start || it.peak;
  if (!d) return '';
  const r = relDay(d);
  if (it.start && it.end && it.end.getTime() - it.start.getTime() >= 30 * 60e3) return `${r}${rng(fmtTime(it.start), fmtTime(it.end))}`;
  return `${r}${fmtTime(it.peak || it.start)}`;
}
function relDay(d: Date) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const n = Math.round((b.getTime() - a.getTime()) / 86400e3);
  return n <= 0 ? '' : n === 1 ? `${t.tomorrow} ` : `${fmtDay(d)} `;
}
function ConfTag({ it }: { it: S.Item }) {
  if (!it.exp && it.conf !== 'low') return null;
  return <View style={st.expBadge}><Text style={st.expText}>⚗ {it.exp ? t.exp : t.conf[it.conf || 'low']}</Text></View>;
}

function Hero({ it, onPress }: { it: S.Item; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={st.hero}>
      <ImageBackground source={SCENE[it.key] || SCENE.stars} style={{ flex: 1 }} imageStyle={{ borderRadius: 22 }}>
        <View style={st.heroShade}>
          <View style={st.row}>
            <Text style={st.small2}>{t.pick}</Text>
            <View style={{ flex: 1 }} />
            <ConfTag it={it} />
          </View>
          <Text style={st.heroTitle}>{t.names[it.key]}</Text>
          <View style={st.heroPanel}>
            <View style={{ flex: 1 }}>
              <Text style={st.heroLabel}>{t.recTime}</Text>
              <Text style={st.heroValue}>{when(it)}</Text>
              {it.dir != null && <><Text style={[st.heroLabel, { marginTop: 8 }]}>{t.direction}</Text><Text style={st.heroValue}>{t.dirSky(compassL(it.dir))}</Text></>}
            </View>
            <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text style={st.heroPct}>{pctText(it.p)}</Text>
              <Text style={st.small}>{t.conf[it.conf || 'low']}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

function Row({ it, onPress }: { it: S.Item; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={st.rowCard}>
      <Image source={SCENE[it.key] || SCENE.stars} style={st.thumb} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={st.row}><Text style={st.h2}>{t.names[it.key]}</Text>{it.exp && <Text style={[st.expText, { marginLeft: 6 }]}>⚗</Text>}</View>
        <Text style={st.rowSub} numberOfLines={1}>{when(it) || t.lv[String(it.level)]}{it.dir != null ? `${DOT()}${t.dirSky(compassL(it.dir))}` : ''}</Text>
      </View>
      <View style={[st.pctPill, { borderColor: LV_COLOR[String(it.level)] }]}><Text style={[st.pctPillText, { color: LV_COLOR[String(it.level)] }]}>{pctText(it.p)}</Text></View>
      <Text style={st.chev}>›</Text>
    </Pressable>
  );
}

function Bar({ v, color = C.bar }: { v: number; color?: string }) {
  return <View style={st.barBg}><View style={[st.barFg, { width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, backgroundColor: color }]} /></View>;
}

function Detail({ it, data, onClose, onReport }: { it: S.Item | null; data: S.SkyData | null; onClose: () => void; onReport: (i: S.Item) => void }) {
  if (!it) return null;
  const x = it.extra || {};
  const notes: string[] = [];
  if (it.key === 'aurora') { if (x.maxKp != null) notes.push(t.kp(x.maxKp)); notes.push(t.auroraNote); }
  if (it.key === 'stars' || it.key === 'milkyway') notes.push(t.lightNote);
  if (it.key === 'milkyway' && x.reason === 'moon') notes.unshift(t.milkyMoon);
  if (it.key === 'stars' && x.nelm != null) notes.unshift(t.nelm(x.nelm));
  if (it.key === 'rainbow' && it.level === 0) notes.unshift(t.noRainbow);
  if (it.key === 'rainbow' && it.dir != null && it.level > 0) notes.unshift(t.rainbowAt(compassL(it.dir), x.top));
  if ((it.key === 'sunset' || it.key === 'sunrise') && x.tot != null && x.tot < 10) notes.unshift(t.clearSky);
  const calibrated = !!data?.calibration;
  notes.push(it.exp ? t.probNoteExp : calibrated ? t.probNote : t.probNoteRaw);
  const hours = (data?.weather?.hours || []).filter((h) => { const d = Date.parse(h.t); return d >= Date.now() - 3600e3 && d <= Date.now() + 24 * 3600e3; });
  return (
    <Modal animationType="slide" visible onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <ImageBackground source={SCENE[it.key] || SCENE.stars} style={{ height: 220 }}>
            <View style={st.detailTop}>
              <Pressable onPress={onClose} style={st.iconBtn}><Text style={{ color: C.text, fontSize: 18 }}>✕</Text></Pressable>
              <View style={{ flex: 1 }} />
              <ConfTag it={it} />
            </View>
          </ImageBackground>
          <View style={{ padding: 18 }}>
            <Text style={st.h1}>{t.names[it.key]}</Text>
            <Text style={[st.sub, { marginTop: 10 }]}>{t.prob(t.names[it.key])}</Text>
            <View style={[st.row, { alignItems: 'flex-end' }]}>
              <Text style={st.bigPct}>{pctText(it.p)}</Text>
              <Text style={[st.small, { marginLeft: 10, marginBottom: 12 }]}>{t.conf[it.conf || 'low']}</Text>
            </View>
            <Bar v={it.p ?? 0} color={LV_COLOR[String(it.level)]} />
            <View style={[st.card, st.row, { justifyContent: 'space-between' }]}>
              {([[t.startT, it.start], [t.peakT, it.peak], [t.endT, it.end]] as [string, Date | undefined][]).map(([l, d], i) => (
                <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={st.small}>{l}</Text>
                  <Text style={[st.timeBig, i === 1 && { color: C.fair }]}>{d ? fmtTime(d) : '—'}</Text>
                </View>
              ))}
            </View>
            {it.dir != null && <View style={[st.card, st.row]}><Text style={[st.line, { flex: 1 }]}>{t.viewDir}</Text><Text style={st.h2}>{t.dirSky(compassL(it.dir))}{par(`${Math.round(it.dir)}°`)}</Text></View>}
            {!!it.factors?.length && (
              <View style={st.card}>
                <Text style={[st.h2, { marginBottom: 4 }]}>{t.breakdown}</Text>
                {it.factors.map((f) => (
                  <View key={f.key} style={{ marginTop: 10 }}>
                    <View style={st.row}><Text style={[st.line, { flex: 1 }]}>{t.factor[f.key] || f.key}</Text><Text style={st.line}>{t.pct(f.v)}</Text></View>
                    <Bar v={f.v} />
                  </View>
                ))}
              </View>
            )}
            {!!hours.length && (
              <View style={st.card}>
                <Text style={[st.h2, { marginBottom: 10 }]}>{t.hourly}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {hours.map((h) => {
                    const lead = (Date.parse(h.t) - Date.now()) / 3600e3;
                    const pc = S.pClear(h.cloud_cover?.mean ?? null, lead, data?.calibration ?? null).p;
                    return (
                      <View key={h.t} style={{ alignItems: 'center', width: 36 }}>
                        <View style={{ height: 70, justifyContent: 'flex-end' }}><View style={{ width: 12, height: Math.max(3, (pc ?? 0) * 70), backgroundColor: C.bar, borderRadius: 4 }} /></View>
                        <Text style={[st.small, { marginTop: 4 }]}>{new Date(h.t).getHours()}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            {notes.map((n, i) => <Text key={i} style={[st.small, { marginTop: 8 }]}>{n}</Text>)}
            <Btn label={t.report} onPress={() => onReport(it)} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ReportTab({ items, onReport }: { items: S.Item[]; onReport: (k: string, i?: S.Item) => void }) {
  const [mine, setMine] = useState<any[]>([]);
  useEffect(() => { const load = () => AsyncStorage.getItem('reports').then((s) => s && setMine(JSON.parse(s))); load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, []);
  const keys = ['sunset', 'sunrise', 'rainbow', 'aurora', 'stars', 'milkyway', 'meteor', 'goldenhour', 'moon', 'halo', 'other'];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
      <Text style={st.h1}>{t.reportTab}</Text>
      <View style={st.h1Line} />
      <Text style={[st.sub, { marginBottom: 8 }]}>{t.reportPrompt}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
        {keys.map((k) => (
          <Pressable key={k} onPress={() => onReport(k, items.find((i) => i.key === k))} style={st.repTile}>
            {SCENE[k] ? <Image source={SCENE[k]} style={st.repImg} /> : <View style={[st.repImg, { backgroundColor: C.cardSolid, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 26, color: C.sub }}>{k === 'halo' ? '◎' : '＋'}</Text></View>}
            <Text style={st.repLabel}>{t.names[k]}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={st.h3}>{t.myReports}</Text>
      {!mine.length && <Text style={st.small}>{t.noReports}</Text>}
      {mine.slice(0, 30).map((r, i) => (
        <View key={i} style={[st.card, st.row]}>
          <Text style={[st.line, { flex: 1 }]}>{t.names[r.k] || r.k}</Text>
          <Text style={st.small}>{t.outcomeName[r.o]}{DOT()}{fmtDayTime(new Date(r.at))}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

type Ev = { d: Date; kind: string; title: string; sub: string; img: string };
function Calendar({ loc, onReport }: { loc: Loc; onReport: (k: string) => void }) {
  const now = useMemo(() => new Date(), []);
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useState<number | null>(null);
  const events = useMemo<Ev[]>(() => {
    const out: Ev[] = [];
    for (const s of S.meteorShowers(loc.lat, loc.lon, now)) out.push({ d: s.best, kind: 'meteor', title: showerName(s), sub: `${t.evMeteor}${DOT()}${s.rate > 0 ? t.perHour(s.rate) : t.notHere}${DOT()}${t.moonLit(Math.round(s.moonFrac * 100))}`, img: 'meteor' });
    let tt = new Date(now.getTime() - 32 * 86400e3);
    for (let i = 0; i < 15; i++) {
      const f = A.SearchMoonPhase(180, tt, 40)!.date, n = A.SearchMoonPhase(0, tt, 40)!.date;
      const km = A.GeoMoon(f).Length() * A.KM_PER_AU;
      out.push({ d: f, kind: 'full', title: km < 360000 ? `${t.evFull}${par(t.supermoon)}` : t.evFull, sub: `${Math.round(km).toLocaleString()} km`, img: 'moon' });
      out.push({ d: n, kind: 'new', title: t.evNew, sub: '', img: 'stars' });
      tt = new Date(Math.max(f.getTime(), n.getTime()) + 86400e3);
    }
    for (const e of S.eclipses(loc.lat, loc.lon, now)) out.push({ d: e.peak, kind: 'eclipse', title: e.kind === 'lunar' ? t.lunar[e.type] : t.solar[e.type], sub: (e.visible ? t.visibleHere : t.notHere) + (e.kind === 'solar' ? DOT() + t.eclipseSafety : ''), img: 'eclipse' });
    return out.sort((a, b) => a.d.getTime() - b.d.getTime());
  }, [loc]);
  const first = new Date(ym.y, ym.m, 1), days = new Date(ym.y, ym.m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const inMonth = events.filter((e) => e.d.getFullYear() === ym.y && e.d.getMonth() === ym.m);
  const byDay = new Map<number, Ev[]>();
  inMonth.forEach((e) => { const k = e.d.getDate(); byDay.set(k, [...(byDay.get(k) || []), e]); });
  const list = sel ? byDay.get(sel) || [] : inMonth;
  const shift = (k: number) => { const d = new Date(ym.y, ym.m + k, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); setSel(null); };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
      <Text style={st.h1}>{t.calendar}</Text>
      <View style={st.h1Line} />
      <View style={st.card}>
        <View style={[st.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
          <Pressable onPress={() => shift(-1)} hitSlop={12}><Text style={[st.h2, { fontSize: 22 }]}>‹</Text></Pressable>
          <Text style={st.h2}>{t.monthTitle(ym.y, ym.m + 1)}</Text>
          <Pressable onPress={() => shift(1)} hitSlop={12}><Text style={[st.h2, { fontSize: 22 }]}>›</Text></Pressable>
        </View>
        <View style={st.row}>{t.weekdays.map((w) => <Text key={w} style={[st.small, st.calCell, { textAlign: 'center' }]}>{w}</Text>)}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: offset }).map((_, i) => <View key={'e' + i} style={st.calCell} />)}
          {Array.from({ length: days }).map((_, i) => {
            const d = i + 1, ev = byDay.get(d);
            const today = ym.y === now.getFullYear() && ym.m === now.getMonth() && d === now.getDate();
            return (
              <Pressable key={d} onPress={() => setSel(sel === d ? null : d)} style={st.calCell}>
                <View style={[st.calDay, today && { backgroundColor: C.accent }, sel === d && { borderColor: C.accent, borderWidth: 1 }]}>
                  <Text style={[st.line, { marginTop: 0, textAlign: 'center' }, today && { color: C.bg, fontWeight: '700' }]}>{d}</Text>
                </View>
                <View style={[st.calDot, !ev && { backgroundColor: 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>
      </View>
      {list.map((e, i) => (
        <Pressable key={i} onPress={() => onReport(e.kind === 'meteor' ? 'meteor' : 'moon')} style={st.rowCard}>
          <Image source={SCENE[e.img]} style={st.thumb} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={st.small}>{fmtDayTime(e.d)}</Text>
            <Text style={st.h2}>{e.title}</Text>
            {!!e.sub && <Text style={st.rowSub} numberOfLines={3}>{e.sub}</Text>}
          </View>
        </Pressable>
      ))}
      <Text style={[st.small, { marginTop: 10 }]}>{t.smNote}</Text>
    </ScrollView>
  );
}

function Settings({ prefs, setPrefs, onLang }: { prefs: typeof DEFAULT_PREFS; setPrefs: (p: any) => void; onLang: (l: Lang) => void }) {
  const [msg, setMsg] = useState('');
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={st.h1}>{t.settings}</Text>
      <View style={st.h1Line} />
      <Text style={st.h3}>{t.notif}</Text>
      <View style={st.card}>
        {([['golden', t.goldenAlert], ['sunset', t.sunsetAlert], ['stars', t.starsAlert], ['aurora', t.auroraAlert], ['events', t.eventsAlert]] as const).map(([k, l], i) => (
          <View key={k} style={[st.row, i > 0 && { marginTop: 10 }]}><Text style={[st.line, { flex: 1 }]}>{l}</Text><Switch value={(prefs as any)[k]} onValueChange={(v) => setPrefs({ ...prefs, [k]: v })} /></View>
        ))}
      </View>
      <Text style={st.h3}>{t.language}</Text>
      <View style={[st.card, { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
        {LANGS.map((l) => (
          <Pressable key={l.id} onPress={() => onLang(l.id)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: l.id === lang ? C.accent : 'rgba(255,255,255,0.18)', backgroundColor: l.id === lang ? 'rgba(255,255,255,0.10)' : 'transparent' }}>
            <Text style={[st.line, { color: l.id === lang ? C.accent : undefined }]}>{l.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={st.card}><Text style={st.line}>{t.about}</Text></View>
      {[[t.privacy, '/privacy'], [t.terms, '/terms'], [t.support, '/support']].map(([l, u]) => (
        <Pressable key={u} style={st.card} onPress={() => Linking.openURL(`${WEB}${u}?lang=${apiLang()}`)}><Text style={[st.line, { color: C.accent }]}>{l}</Text></Pressable>
      ))}
      <Pressable style={st.card} onPress={async () => { const uid = await userId(); await api('/api/delete', { method: 'POST', body: JSON.stringify({ user: uid }) }).catch(() => {}); await AsyncStorage.removeItem('reports'); setMsg(t.deleted); }}>
        <Text style={[st.line, { color: '#FF8A8A' }]}>{t.deleteData}</Text>
        {!!msg && <Text style={st.small}>{msg}</Text>}
      </Pressable>
      <Text style={[st.small, { textAlign: 'center', marginTop: 12 }]}>SkyLab {Constants.expoConfig?.version} ・ {S.ENGINE_VERSION}{'\n'}Weather: Open-Meteo (ECMWF, DWD ICON, NOAA GFS) ・ Aurora: NOAA SWPC</Text>
    </ScrollView>
  );
}

function ReportSheet({ r, loc, issuedAt, onClose }: { r: { key: string; item?: S.Item } | null; loc: Loc | null; issuedAt?: string; onClose: () => void }) {
  const [done, setDone] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [strength, setStrength] = useState<number | null>(null);
  const [beauty, setBeauty] = useState<number | null>(null);
  useEffect(() => { if (r) { setDone(null); setOutcome(null); setStrength(null); setBeauty(null); } }, [r]);
  if (!r) return null;
  const name = t.names[r.key] || r.key;
  const hasBeauty = ['sunset', 'sunrise', 'rainbow', 'aurora', 'goldenhour', 'bluehour', 'milkyway', 'stars', 'moon'].includes(r.key);
  const hasStrength = ['aurora', 'rainbow', 'meteor'].includes(r.key);
  const OUT: [string, string][] = [['seen', t.seen], ['looked_not_seen', t.lookedNot], ['clouded', t.clouded], ['not_observed', t.notObserved]];
  const send = async () => {
    if (!loc || !outcome) return;
    const uid = await userId();
    const it = r.item;
    const shown = it ? { level: it.level, p: it.p, conf: it.conf, exp: it.exp, factors: it.factors, extra: it.extra, start: it.start, peak: it.peak, end: it.end, dir: it.dir } : null;
    api('/api/report', { method: 'POST', body: JSON.stringify({ user: uid, phenomenon: r.key, outcome, lat: loc.lat, lon: loc.lon, at: new Date().toISOString(), strength: outcome === 'seen' ? strength : null, beauty: outcome === 'seen' ? beauty : null, app: 'ios-' + (Constants.expoConfig?.version || ''), engine: S.ENGINE_VERSION, issued_at: issuedAt, shown }) }).catch(() => {});
    const prev = JSON.parse((await AsyncStorage.getItem('reports')) || '[]');
    await AsyncStorage.setItem('reports', JSON.stringify([{ k: r.key, o: outcome, at: new Date().toISOString() }, ...prev].slice(0, 200)));
    setDone(outcome === 'seen' || outcome === 'looked_not_seen' ? t.thanks : t.thanksNo);
    setTimeout(onClose, 1400);
  };
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        {done ? <Text style={[st.h2, { textAlign: 'center', marginVertical: 24 }]}>{done}</Text> : (
          <>
            <Text style={[st.h2, { textAlign: 'center', marginBottom: 14 }]}>{t.reportTitle(name)}</Text>
            {OUT.map(([k, l]) => (
              <Pressable key={k} onPress={() => setOutcome(k)} style={[st.radio, outcome === k && st.radioOn]}>
                <View style={[st.radioDot, outcome === k && { backgroundColor: C.accent, borderColor: C.accent }]} />
                <Text style={st.line}>{l}</Text>
              </Pressable>
            ))}
            {outcome === 'seen' && hasStrength && (
              <View style={[st.row, { marginTop: 12 }]}>
                <Text style={[st.sub, { width: 64 }]}>{t.strength}</Text>
                {[t.weak, t.mid, t.strong].map((l, i) => (
                  <Pressable key={i} onPress={() => setStrength(i + 1)} style={[st.chip, strength === i + 1 && st.chipOn]}><Text style={st.chipText}>{l}</Text></Pressable>
                ))}
              </View>
            )}
            {outcome === 'seen' && hasBeauty && (
              <View style={[st.row, { marginTop: 12 }]}>
                <Text style={[st.sub, { width: 64 }]}>{t.beauty}</Text>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setBeauty(n)} hitSlop={6}><Text style={{ fontSize: 28, color: beauty != null && n <= beauty ? C.fair : 'rgba(255,255,255,0.2)', marginRight: 6 }}>★</Text></Pressable>
                ))}
              </View>
            )}
            <Btn label={t.report} onPress={send} disabled={!outcome} />
          </>
        )}
      </View>
    </Modal>
  );
}

function PlacePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (l: Loc | null) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any[] | null>(null);
  const go = async () => { try { const j = await api(`/api/geo?q=${encodeURIComponent(q)}&lang=${apiLang()}`); setRes(j.results || []); } catch { setRes([]); } };
  return (
    <Modal transparent animationType="slide" visible={open} onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={[st.sheet, { maxHeight: '75%' }]}>
        <Btn label={t.useHere} onPress={() => onPick(null)} />
        <View style={[st.row, { marginTop: 14 }]}>
          <TextInput value={q} onChangeText={setQ} onSubmitEditing={go} placeholder={t.searchCity} placeholderTextColor={C.sub} style={st.input} returnKeyType="search" />
          <Pressable onPress={go} style={[st.smallBtn, { marginLeft: 8 }]}><Text style={st.line}>{t.search}</Text></Pressable>
        </View>
        <ScrollView style={{ marginTop: 8 }}>
          {res && !res.length && <Text style={[st.sub, { marginTop: 10 }]}>{t.noResults}</Text>}
          {(res || []).map((x, i) => (
            <Pressable key={i} onPress={() => onPick({ lat: x.lat, lon: x.lon, name: [x.name, x.country].filter(Boolean).join(', ') })} style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }}>
              <Text style={st.line}>{x.name}</Text><Text style={st.small}>{[x.admin, x.country].filter(Boolean).join(', ')}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// 端末で予約する通知（天文の出来事は確実に計算できる。気象に左右されるものは、開いた時点の予報で予約し直す）
async function scheduleLocal(loc: Loc, items: S.Item[], prefs: typeof DEFAULT_PREFS) {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const now = Date.now();
    const plan: { at: Date; title: string; body: string }[] = [];
    if (prefs.golden) for (const g of items.filter((x) => x.key === 'goldenhour' && x.start && x.start.getTime() > now + 60e3)) plan.push({ at: new Date(g.start!.getTime() - 10 * 60e3), title: t.names.goldenhour, body: `${rng(fmtTime(g.start), fmtTime(g.end))}${DOT()}${t.dirSky(compassL(g.dir))}${DOT()}${pctText(g.p)}` });
    const stars = items.find((i) => i.key === 'stars');
    if (prefs.stars && (stars?.p ?? 0) >= 0.6 && stars?.start && stars.start.getTime() > now) plan.push({ at: stars.start, title: t.names.stars, body: `${pctText(stars.p)}${DOT()}${rng(fmtTime(stars.start), fmtTime(stars.end))}` });
    const ss = items.find((i) => i.key === 'sunset');
    if (prefs.sunset && (ss?.p ?? 0) >= 0.5 && ss?.peak) plan.push({ at: new Date(ss.peak.getTime() - 30 * 60e3), title: t.names.sunset, body: `${pctText(ss.p)}${par(t.exp)}${DOT()}${fmtTime(ss.peak)}${DOT()}${t.dirSky(compassL(ss.dir))}` });
    if (prefs.events) {
      for (const m of S.meteorShowers(loc.lat, loc.lon, new Date())) if (m.best.getTime() - now < 30 * 86400e3 && m.rate >= 10) plan.push({ at: new Date(m.best.getTime() - 3 * 3600e3), title: showerName(m), body: `${fmtTime(m.best)}${DOT()}${t.perHour(m.rate)}` });
      const mi = S.moonInfo(loc.lat, loc.lon, new Date());
      plan.push({ at: new Date(mi.full.getTime() - 6 * 3600e3), title: t.fullMoon, body: fmtDayTime(mi.full) });
      for (const e of S.eclipses(loc.lat, loc.lon, new Date())) if (e.visible && e.peak.getTime() - now < 60 * 86400e3) plan.push({ at: new Date(e.peak.getTime() - 24 * 3600e3), title: e.kind === 'lunar' ? t.lunar[e.type] : t.solar[e.type], body: fmtDayTime(e.peak) + (e.kind === 'solar' ? DOT() + t.eclipseSafety : '') });
    }
    for (const n of plan.filter((x) => x.at.getTime() > now + 60e3).slice(0, 40)) {
      await Notifications.scheduleNotificationAsync({ content: { title: n.title, body: n.body }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at } });
    }
  } catch {}
}

function Btn({ label, onPress, ghost, disabled }: { label: string; onPress: () => void; ghost?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={[st.btn, ghost && { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line }, disabled && { opacity: 0.4 }]}>
      <Text style={[st.btnText, ghost && { color: C.text }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },
  logo: { color: C.text, fontSize: 28, fontStyle: 'italic', fontFamily: SERIF, fontWeight: '600' },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  placeChip: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  placeText: { color: C.text, fontSize: 14 },
  h1: { color: C.text, fontSize: 30, fontWeight: '700', marginTop: 8 },
  h1Line: { width: 36, height: 2, backgroundColor: C.accent, marginTop: 6, marginBottom: 6, borderRadius: 1 },
  h2: { color: C.text, fontSize: 17, fontWeight: '600' },
  h3: { color: C.sub, fontSize: 14, fontWeight: '600', marginTop: 22, marginBottom: 4 },
  sub: { color: C.sub, fontSize: 14 },
  small: { color: C.sub, fontSize: 12, lineHeight: 17 },
  small2: { color: '#fff', fontSize: 12, fontWeight: '600', opacity: 0.9 },
  line: { color: C.text, fontSize: 14, lineHeight: 21, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  hero: { height: 300, marginTop: 12, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(200,180,255,0.35)', overflow: 'hidden' },
  heroShade: { flex: 1, padding: 16, backgroundColor: 'rgba(8,10,30,0.25)', justifyContent: 'space-between' },
  heroTitle: { color: '#fff', fontSize: 30, fontWeight: '700', textShadowColor: '#0008', textShadowRadius: 8 },
  heroPanel: { flexDirection: 'row', backgroundColor: 'rgba(12,16,44,0.72)', borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)' },
  heroLabel: { color: C.sub, fontSize: 11 },
  heroValue: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 1 },
  heroPct: { color: C.good, fontSize: 40, fontWeight: '800' },
  rowCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 10, marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  thumb: { width: 96, height: 64, borderRadius: 12 },
  rowSub: { color: C.sub, fontSize: 13, marginTop: 3 },
  pctPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, marginLeft: 6 },
  pctPillText: { fontSize: 14, fontWeight: '700' },
  chev: { color: C.sub, fontSize: 22, marginLeft: 6, marginRight: 2 },
  expBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(160,120,255,0.28)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.exp },
  expText: { color: C.exp, fontSize: 12, fontWeight: '700' },
  tabbar: { flexDirection: 'row', backgroundColor: 'rgba(16,22,56,0.96)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  tabIcon: { color: C.sub, fontSize: 20 },
  tabText: { color: C.sub, fontSize: 11, marginTop: 2, fontWeight: '600' },
  bigPct: { color: C.text, fontSize: 56, fontWeight: '800' },
  timeBig: { color: C.text, fontSize: 22, fontWeight: '700', marginTop: 2 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 6 },
  barFg: { height: 8, borderRadius: 4 },
  detailTop: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingTop: 16 },
  repTile: { width: '33.33%', padding: 5 },
  repImg: { width: '100%', height: 70, borderRadius: 12 },
  repLabel: { color: C.text, fontSize: 12, textAlign: 'center', marginTop: 4 },
  calCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  calDay: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  calDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.fair, marginTop: 1 },
  btn: { backgroundColor: '#7C6CFF', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  backdrop: { flex: 1, backgroundColor: '#0009' },
  sheet: { backgroundColor: C.cardSolid, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  radio: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, marginTop: 8 },
  radioOn: { borderColor: C.accent, backgroundColor: 'rgba(143,183,255,0.12)' },
  radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.sub, marginRight: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line, marginRight: 8 },
  chipOn: { borderColor: C.accent, backgroundColor: 'rgba(143,183,255,0.15)' },
  chipText: { color: C.text, fontSize: 13 },
  input: { flex: 1, color: C.text, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
