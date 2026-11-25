// Nowmoji：親しい人のロック画面に、いまの気分を顔文字で
import './src/push';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, useWindowDimensions, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from './src/api';
import type { Group, Post, Sync, User } from './src/api';
import { ago, LANG, t } from './src/i18n';
import { ART, fitFont, KAO, ltr, MOOD_IDS, type MoodId, tint } from './src/kao';
import { usePlus, EULA_URL, SKU_MONTH, SKU_YEAR, type PlusApi } from './src/plus';
import { loadTheme, registerPush, saveTheme } from './src/push';
import { THEMES, updateWidgets } from './src/widgetSync';

const C = { bg: '#FFF6EE', card: '#FFFFFF', ink: '#2B2633', sub: '#8A8396', line: 'rgba(43,38,51,.09)', accent: '#F27A5E', soft: '#F3ECE2', danger: '#D0453A' };
const FREE_DAYS = 7;
const PENS_FREE = ['#2B2633', '#F27A5E', '#6C9BD2'];
const PENS_PLUS = ['#2B2633', '#F27A5E', '#6C9BD2', '#E8546B', '#F2B233', '#5AA39B', '#7C6BC4', '#C98BB5', '#8C9A5B', '#B08455', '#4FA0B8', '#FFFFFF'];
const WIDTHS = [4, 8, 14];
const K_FAV = 'nm.fav.v1';
const K_STY = 'nm.sty.v1';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const [ready, setReady] = useState(false);
  const [s, setS] = useState<Sync | null>(null);
  const [authed, setAuthed] = useState(false);
  const [theme, setTheme] = useState('paper');
  const pendingCode = useRef<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [focusGroup, setFocusGroup] = useState<string | null>(null);
  const plusApi = usePlus((on) => api.hasAuth() && api.updateMe({ plus: on }).then(setS).catch(() => {}));

  const apply = useCallback((n: Sync) => {
    setS(n);
    loadTheme().then((th) => updateWidgets(n, th));
  }, []);
  const refresh = useCallback(async () => {
    if (!api.hasAuth()) return;
    try {
      apply(await api.sync());
    } catch (e: any) {
      if (e?.status === 401) {
        await api.deleteMe().catch(() => {});
        setAuthed(false);
      }
    }
  }, [apply]);

  // 起動
  useEffect(() => {
    (async () => {
      setTheme(await loadTheme());
      const a = await api.loadAuth();
      if (a) {
        setAuthed(true);
        const c = await api.cachedSync();
        if (c) setS(c);
        setReady(true);
        await refresh();
        registerPush(false);
      } else setReady(true);
    })();
  }, [refresh]);

  // 招待リンク（nowmoji://join/<code>）とウィジェット（nowmoji://g/<id>）
  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      if (!url) return;
      const j = url.match(/join\/([a-z0-9]{4,16})/i);
      if (j) {
        if (api.hasAuth()) setJoinCode(j[1].toLowerCase());
        else pendingCode.current = j[1].toLowerCase();
      }
      const g = url.match(/\/\/g\/([A-Za-z0-9_-]+)/);
      if (g) setFocusGroup(g[1]);
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && refresh());
    const iv = setInterval(() => AppState.currentState === 'active' && refresh(), 30000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, [refresh]);

  // Plus の状態をサーバーにも伝える（グループ数の上限のため）
  useEffect(() => {
    if (s && s.me.plus !== plusApi.plus && api.hasAuth()) api.updateMe({ plus: plusApi.plus }).then(apply).catch(() => {});
  }, [plusApi.plus, s?.me.plus]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>;
  if (!authed || !s)
    return (
      <Welcome
        onDone={(n) => {
          setAuthed(true);
          apply(n);
          if (pendingCode.current) setJoinCode(pendingCode.current);
        }}
      />
    );
  return (
    <Main
      s={s}
      apply={apply}
      refresh={refresh}
      plusApi={plusApi}
      theme={theme}
      setTheme={(v) => {
        setTheme(v);
        saveTheme(v);
        updateWidgets(s, v);
      }}
      joinCode={joinCode}
      clearJoin={() => setJoinCode(null)}
      focusGroup={focusGroup}
      onSignedOut={() => {
        setAuthed(false);
        setS(null);
      }}
    />
  );
}

/* ---------- はじめに ---------- */
function Welcome({ onDone }: { onDone: (s: Sync) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setErr('');
    try {
      onDone(await api.register(n));
    } catch {
      setErr(t.network);
    }
    setBusy(false);
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 50, gap: 18 }} keyboardShouldPersistTaps="handled">
          <Image source={require('./assets/icon.png')} style={{ width: 92, height: 92, borderRadius: 22 }} />
          <Text style={{ fontSize: 34, fontWeight: '900', color: C.ink }}>Nowmoji</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink, lineHeight: 30 }}>{t.tagline}</Text>
          <Text style={{ fontSize: 15, color: C.sub, lineHeight: 23 }}>{t.welcomeBody}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 6 }}>
            {(['happy', 'miss', 'sleepy', 'work'] as MoodId[]).map((m) => (
              <Image key={m} source={ART[m]} style={{ width: 64, height: 64 }} />
            ))}
          </View>
          <Text style={st.label}>{t.yourName}</Text>
          <TextInput value={name} onChangeText={setName} placeholder={t.namePh} placeholderTextColor="#B5AEBB" maxLength={12} style={st.input} returnKeyType="done" onSubmitEditing={go} />
          {err ? <Text style={{ color: C.danger }}>{err}</Text> : null}
          <Btn label={t.start} onPress={go} disabled={!name.trim() || busy} busy={busy} />
          <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
            {t.agree}{' '}
            <Text style={st.link} onPress={() => Linking.openURL(`${api.SERVER}/terms?lang=${LANG}`)}>{t.terms}</Text>
            {'  '}
            <Text style={st.link} onPress={() => Linking.openURL(`${api.SERVER}/privacy?lang=${LANG}`)}>{t.privacy}</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------- メイン ---------- */
type Sheet = null | { k: 'group' } | { k: 'new' } | { k: 'cal' } | { k: 'plus'; why?: string } | { k: 'settings' } | { k: 'person'; u: User; post?: Post } | { k: 'join'; code: string };

function Main(props: { s: Sync; apply: (s: Sync) => void; refresh: () => Promise<void>; plusApi: PlusApi; theme: string; setTheme: (v: string) => void; joinCode: string | null; clearJoin: () => void; focusGroup: string | null; onSignedOut: () => void }) {
  const { s, apply, plusApi } = props;
  const plus = plusApi.plus;
  const [gid, setGid] = useState<string | null>(s.groups[0]?.id || null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState('');
  const [fav, setFav] = useState<Post | null>(null);
  const insets = useSafeAreaInsets();
  const g = s.groups.find((x) => x.id === gid) || s.groups[0] || null;

  useEffect(() => {
    if (!g && s.groups[0]) setGid(s.groups[0].id);
  }, [s.groups.length]);
  useEffect(() => {
    if (props.focusGroup && s.groups.some((x) => x.id === props.focusGroup)) setGid(props.focusGroup);
  }, [props.focusGroup]);
  useEffect(() => {
    if (props.joinCode) {
      setSheet({ k: 'join', code: props.joinCode });
      props.clearJoin();
    }
  }, [props.joinCode]);
  useEffect(() => {
    AsyncStorage.getItem(K_FAV).then((v) => v && setFav(JSON.parse(v))).catch(() => {});
  }, []);
  useEffect(() => {
    if (plusApi.error) say(t.buyError);
  }, [plusApi.error]);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast((x) => (x === m ? '' : x)), 2200);
  };
  const others = g ? g.members.filter((m) => m.id !== s.me.id) : [];
  const blocked = new Set(s.blocked.map((b) => b.id));
  const ordered = g ? [...others].sort((a, b) => (blocked.has(b.id) ? 0 : g.latest[b.id]?.at || 0) - (blocked.has(a.id) ? 0 : g.latest[a.id]?.at || 0)) : [];
  const { width } = useWindowDimensions();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: C.ink, flex: 1 }}>Nowmoji</Text>
          <Pressable onPress={() => setSheet({ k: 'plus' })} style={[st.pill, { backgroundColor: plus ? C.soft : '#FFD3B8' }]} accessibilityRole="button">
            <Text style={{ fontWeight: '900', color: plus ? C.sub : '#9A4A21', fontSize: 13 }}>{plus ? t.plusOn : 'Plus'}</Text>
          </Pressable>
          {g ? (
            <Pressable onPress={() => setSheet({ k: 'cal' })} style={st.iconBtn} accessibilityLabel={t.calendar}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round"><Rect x={3.5} y={5} width={17} height={15.5} rx={3} /><Path d="M3.5 10h17M8 3v4M16 3v4" /></Svg>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setSheet({ k: 'settings' })} style={st.iconBtn} accessibilityLabel={t.settings}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round"><Circle cx={12} cy={12} r={3} /><Path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></Svg>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }} style={{ flexGrow: 0, flex: 1 }}>
          {s.groups.map((x) => (
            <Pressable key={x.id} onPress={() => (x.id === g?.id ? setSheet({ k: 'group' }) : setGid(x.id))} style={[st.chip, x.id === g?.id && st.chipOn]}>
              <Text style={[st.chipT, x.id === g?.id && { color: '#fff' }]} numberOfLines={1}>{x.name}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setSheet({ k: 'new' })} style={[st.chip, { borderStyle: 'dashed', borderColor: '#D8CDBF', backgroundColor: 'transparent' }]}>
            <Text style={[st.chipT, { color: C.sub }]}>{t.addGroup}</Text>
          </Pressable>
        </ScrollView>
        {g ? (
          <View style={[st.meChip, { backgroundColor: tint(s.me.color), marginRight: 14 }]}>
            <MoodTile p={g.latest[s.me.id]} color={s.me.color} size={28} bare />
            <Text style={{ fontSize: 11, fontWeight: '900', color: C.ink }}>{t.you}</Text>
          </View>
        ) : null}
        </View>

        {!g ? (
          <NoGroup onNew={() => setSheet({ k: 'new' })} />
        ) : (
          <>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}>
              {others.length === 0 ? (
                <Pressable onPress={() => setSheet({ k: 'group' })} style={[st.mem, { width: '100%', paddingVertical: 22 }]}>
                  <Text style={{ fontSize: 26, color: C.ink, fontWeight: '800' }}>{ltr('(´ω`)')}</Text>
                  <Text style={{ color: C.ink, fontWeight: '800', marginTop: 6 }}>{t.invite}</Text>
                </Pressable>
              ) : null}
              {/* 友だちは最近送った順に、4人まで大きく。5人目からは小さく */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ordered.map((m, i) => {
                  const p = blocked.has(m.id) ? undefined : g.latest[m.id];
                  const big = i < 4;
                  return (
                    <Pressable key={m.id} style={[st.mem, big ? { width: (width - 36) / 2, paddingVertical: 9 } : { width: (width - 48) / 3 }]} onLongPress={() => setSheet({ k: 'person', u: m, post: p })} delayLongPress={350}>
                      <MoodTile p={p} color={m.color} size={big ? Math.min(104, (width - 38) / 2 - 30) : 52} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                        <View style={{ width: big ? 9 : 7, height: big ? 9 : 7, borderRadius: 5, backgroundColor: m.color }} />
                        <Text style={{ fontWeight: '900', fontSize: big ? 15 : 12, color: C.ink }} numberOfLines={1}>{m.name}</Text>
                      </View>
                      <Text style={{ fontSize: big ? 14 : 12, color: C.ink, textAlign: 'center' }} numberOfLines={1}>{label(p) || t.nothingYet}</Text>
                      {p ? <Text style={{ fontSize: big ? 12 : 11, color: C.sub }}>{ago(p.at)}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 11, color: C.sub, textAlign: 'center', marginTop: 14, lineHeight: 16 }}>{t.widgetTip}</Text>
            </ScrollView>
            <Composer
              g={g}
              plus={plus}
              say={say}
              onSent={(n) => {
                apply(n);
                registerPush(true);
              }}
              needPlus={(why) => setSheet({ k: 'plus', why })}
              bottom={insets.bottom}
            />
          </>
        )}
      </KeyboardAvoidingView>

      {toast ? (
        <View pointerEvents="none" style={[st.toast, { top: insets.top + 54 }]}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={st.dim} onPress={() => setSheet(null)} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 18 }]}>
          {sheet?.k === 'group' && g ? <GroupSheet g={g} me={s.me} apply={apply} close={() => setSheet(null)} say={say} onPerson={(u) => setSheet({ k: 'person', u, post: g.latest[u.id] })} /> : null}
          {sheet?.k === 'new' ? <NewGroupSheet s={s} plus={plus} apply={apply} close={() => setSheet(null)} say={say} onMade={(id) => setGid(id)} needPlus={() => setSheet({ k: 'plus', why: t.groupsPlus })} /> : null}
          {sheet?.k === 'join' ? <JoinSheet code={sheet.code} plus={plus} s={s} apply={apply} close={() => setSheet(null)} say={say} onJoined={(id) => setGid(id)} needPlus={() => setSheet({ k: 'plus', why: t.groupsPlus })} /> : null}
          {sheet?.k === 'cal' && g ? <CalendarSheet g={g} me={s.me} plus={plus} fav={fav} needPlus={() => setSheet({ k: 'plus', why: t.olderPlus })} close={() => setSheet(null)} /> : null}
          {sheet?.k === 'plus' ? <PlusSheet api={plusApi} why={sheet.why} close={() => setSheet(null)} say={say} /> : null}
          {sheet?.k === 'settings' ? <SettingsSheet s={s} apply={apply} plusApi={plusApi} theme={props.theme} setTheme={props.setTheme} close={() => setSheet(null)} say={say} needPlus={(why) => setSheet({ k: 'plus', why })} onSignedOut={props.onSignedOut} /> : null}
          {sheet?.k === 'person' ? (
            <PersonSheet
              u={sheet.u}
              post={sheet.post}
              plus={plus}
              isBlocked={blocked.has(sheet.u.id)}
              apply={apply}
              close={() => setSheet(null)}
              say={say}
              onFav={(p) => {
                setFav(p);
                AsyncStorage.setItem(K_FAV, JSON.stringify(p)).catch(() => {});
                say(t.favorited);
                setSheet(null);
              }}
              needPlus={() => setSheet({ k: 'plus' })}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const label = (p?: Post | null) => {
  if (!p) return '';
  if (p.word) return p.word;
  if (p.kind === 'doodle') return t.doodleGot;
  if (p.kind === 'stamp') return t.stampGot;
  return (p.mood && t.moods[p.mood]) || '';
};

function MoodTile({ p, color, size, bare }: { p?: Post | null; color: string; size: number; bare?: boolean }) {
  const box = { width: size, height: size, borderRadius: size * 0.24, backgroundColor: bare ? 'transparent' : tint(color), alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const };
  if (!p)
    return (
      <View style={box}>
        <View style={{ width: size * 0.56, height: size * 0.56, borderRadius: size, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#CFC6D8' }} />
      </View>
    );
  if (p.kind === 'art' && p.mood && ART[p.mood as MoodId]) return <View style={box}><Image source={ART[p.mood as MoodId]} style={{ width: size * 0.9, height: size * 0.9 }} /></View>;
  if (p.img) return <View style={box}><Image source={{ uri: api.imgUrl(p.img) }} style={{ width: size * (p.kind === 'stamp' ? 0.84 : 0.92), height: size * (p.kind === 'stamp' ? 0.84 : 0.92), borderRadius: p.kind === 'stamp' ? size * 0.1 : 0 }} /></View>;
  const k = p.kao || (p.mood ? KAO[p.mood as MoodId] : '');
  return (
    <View style={box}>
      <Text style={{ fontSize: fitFont(k, size - 8, size * 0.26), fontWeight: '800', color: C.ink }} numberOfLines={1}>{ltr(k)}</Text>
    </View>
  );
}

function NoGroup({ onNew }: { onNew: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center', gap: 14 }}>
      <Image source={ART.happy} style={{ width: 140, height: 140 }} />
      <Text style={{ fontSize: 20, fontWeight: '900', color: C.ink, textAlign: 'center' }}>{t.noGroupTitle}</Text>
      <Text style={{ fontSize: 14, color: C.sub, lineHeight: 21, textAlign: 'center' }}>{t.noGroupBody}</Text>
      <Btn label={t.makeGroup} onPress={onNew} />
      <Btn label={t.joinByCode} onPress={onNew} light />
    </ScrollView>
  );
}

/* ---------- 送る ---------- */
function Composer({ g, plus, say, onSent, needPlus, bottom }: { g: Group; plus: boolean; say: (m: string) => void; onSent: (s: Sync) => void; needPlus: (why: string) => void; bottom: number }) {
  const [tab, setTab] = useState<'mood' | 'doodle' | 'pic'>('mood');
  const [sty, setSty] = useState<'kao' | 'art'>('kao');
  const [mood, setMood] = useState<MoodId>('happy');
  const [own, setOwn] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState<{ uri: string; b64: string } | null>(null);
  const pad = useRef<DoodleHandle>(null);
  const n = [...word].length;
  const cellW = (useWindowDimensions().width - 28) / 4;
  useEffect(() => {
    AsyncStorage.getItem(K_STY).then((v) => (v === 'art' || v === 'kao') && setSty(v)).catch(() => {});
  }, []);

  const send = async () => {
    if (busy) return;
    if (n > 20) return say(t.over20(n));
    let body: Parameters<typeof api.post>[1];
    if (tab === 'mood') {
      const o = own.trim();
      body = sty === 'kao' ? (o ? { kind: 'kao', kao: o } : { kind: 'kao', mood }) : { kind: 'art', mood };
    } else if (tab === 'doodle') {
      if (!pad.current?.dirty()) return say(t.drawFirst);
      const b64 = await pad.current.capture();
      if (!b64) return;
      body = { kind: 'doodle', image: b64 };
    } else {
      if (!stamp) return say(t.chooseFirst);
      body = { kind: 'stamp', image: stamp.b64 };
    }
    if (word.trim()) body.word = word.trim();
    setBusy(true);
    try {
      const r = await api.post(g.id, body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setWord('');
      setOwn('');
      if (tab === 'doodle') pad.current?.clear();
      if (tab === 'pic') setStamp(null);
      onSent(r);
      say(t.sentTo(g.name));
    } catch {
      say(t.network);
    }
    setBusy(false);
  };
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [1, 1] });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const side = Math.min(a.width, a.height);
    const ctx = ImageManipulator.manipulate(a.uri);
    if (a.width !== a.height) ctx.crop({ originX: (a.width - side) / 2, originY: (a.height - side) / 2, width: side, height: side });
    ctx.resize({ width: 512, height: 512 });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
    if (out.base64) setStamp({ uri: out.uri, b64: out.base64 });
  };

  return (
    <View style={[st.comp, { paddingBottom: Math.max(bottom, 10) }]}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['mood', 'doodle', 'pic'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && st.tabOn]}>
            <Text style={[st.tabT, tab === k && { color: '#fff' }]}>{k === 'mood' ? t.mood : k === 'doodle' ? t.doodle : t.picture}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'mood' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['kao', 'art'] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => {
                  setSty(k);
                  AsyncStorage.setItem(K_STY, k).catch(() => {});
                }}
                style={[st.seg, sty === k && st.segOn]}
              >
                <Text style={[st.segT, sty === k && { color: '#fff' }]}>{k === 'kao' ? t.kaomoji : t.chara}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {MOOD_IDS.map((m) => {
              const on = mood === m && !(sty === 'kao' && own.trim());
              return (
                <Pressable
                  key={m}
                  onPress={() => {
                    setMood(m);
                    setOwn('');
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={[st.mood, on && { backgroundColor: C.soft }]}
                  accessibilityLabel={t.moods[m]}
                >
                  {sty === 'art' ? (
                    <Image source={ART[m]} style={{ width: 40, height: 40 }} />
                  ) : (
                    <Text style={{ fontSize: fitFont(KAO[m], cellW - 10, 14), fontWeight: '800', color: C.ink, height: 40, lineHeight: 40 }} numberOfLines={1}>{ltr(KAO[m])}</Text>
                  )}
                  <Text style={{ fontSize: 11, fontWeight: '800', color: on ? C.ink : C.sub }} numberOfLines={1}>{t.moods[m]}</Text>
                </Pressable>
              );
            })}
          </View>
          {sty === 'kao' ? <TextInput value={own} onChangeText={setOwn} placeholder={t.ownKao} placeholderTextColor="#B5AEBB" maxLength={14} autoCapitalize="none" autoCorrect={false} style={[st.input, { paddingVertical: 8, fontSize: 15 }]} /> : null}
        </>
      ) : tab === 'doodle' ? (
        <DoodlePad ref={pad} plus={plus} needPlus={() => needPlus(t.penPlus)} />
      ) : (
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          {stamp ? <Image source={{ uri: stamp.uri }} style={{ width: 120, height: 120, borderRadius: 16 }} /> : null}
          <Btn label={t.pickImage} onPress={pick} light />
          <Text style={{ fontSize: 12, color: C.sub }}>{t.pickNote}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          {n > 20 ? <Text style={{ position: 'absolute', top: -20, left: 4, color: C.danger, fontSize: 12, fontWeight: '800' }}>{t.over20(n)}</Text> : null}
          <TextInput value={word} onChangeText={setWord} placeholder={t.word} placeholderTextColor="#B5AEBB" style={[st.input, { paddingVertical: 11 }]} returnKeyType="send" onSubmitEditing={send} />
        </View>
        <Pressable onPress={send} disabled={busy || n > 20} style={[st.send, (busy || n > 20) && { opacity: 0.4 }]} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{t.send}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

/* ---------- 落書き ---------- */
type DoodleHandle = { dirty: () => boolean; capture: () => Promise<string | null>; clear: () => void };
const DoodlePad = React.forwardRef<DoodleHandle, { plus: boolean; needPlus: () => void }>(function DoodlePad({ plus, needPlus }, ref) {
  const [lines, setLines] = useState<{ d: string; c: string; w: number }[]>([]);
  const cur = useRef<{ d: string; c: string; w: number } | null>(null);
  const [, force] = useState(0);
  const [pen, setPen] = useState(PENS_FREE[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const shot = useRef<any>(null);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          cur.current = { d: `M${x.toFixed(1)} ${y.toFixed(1)} L${(x + 0.1).toFixed(1)} ${y.toFixed(1)}`, c: penRef.current, w: widthRef.current };
          force((n) => n + 1);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          if (cur.current) cur.current.d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
          force((n) => n + 1);
        },
        onPanResponderRelease: () => {
          const c = cur.current;
          cur.current = null;
          if (c) setLines((l) => [...l, c]);
        },
      }),
    [],
  );
  const penRef = useRef(pen);
  penRef.current = pen;
  const widthRef = useRef(width);
  widthRef.current = width;
  React.useImperativeHandle(ref, () => ({
    dirty: () => lines.length > 0,
    clear: () => setLines([]),
    capture: async () => {
      try {
        return await captureRef(shot, { format: 'png', quality: 1, result: 'base64', width: 512, height: 512 });
      } catch {
        return null;
      }
    },
  }));
  const pens = plus ? PENS_PLUS : PENS_PLUS.slice(0, 6);
  return (
    <View style={{ gap: 8 }}>
      <View ref={shot} collapsable={false} style={{ aspectRatio: 1.9, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, overflow: 'hidden' }} {...responder.panHandlers}>
        <Svg width="100%" height="100%">
          {[...lines, ...(cur.current ? [cur.current] : [])].map((l, i) => (
            <Path key={i} d={l.d} stroke={l.c} strokeWidth={l.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
        </Svg>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        {pens.map((c, i) => {
          const locked = !plus && i >= PENS_FREE.length;
          return (
            <Pressable key={c} onPress={() => (locked ? needPlus() : setPen(c))} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: pen === c ? 3 : 1, borderColor: pen === c ? C.accent : C.line, opacity: locked ? 0.35 : 1 }} accessibilityLabel={t.pen} />
          );
        })}
        <View style={{ width: 1, height: 22, backgroundColor: C.line }} />
        {WIDTHS.map((w, i) => (
          <Pressable key={w} onPress={() => (!plus && i !== 1 ? needPlus() : setWidth(w))} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: width === w ? C.soft : 'transparent', opacity: !plus && i !== 1 ? 0.35 : 1 }}>
            <View style={{ width: w + 2, height: w + 2, borderRadius: w, backgroundColor: C.ink }} />
          </Pressable>
        ))}
        <Pressable onPress={() => setLines([])} style={[st.pill, { backgroundColor: C.soft }]}>
          <Text style={{ fontWeight: '800', color: C.sub }}>{t.clear}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
});

/* ---------- グループ ---------- */
function GroupSheet({ g, me, apply, close, say, onPerson }: { g: Group; me: User; apply: (s: Sync) => void; close: () => void; say: (m: string) => void; onPerson: (u: User) => void }) {
  const [name, setName] = useState(g.name);
  const [muted, setMuted] = useState(false);
  const save = async () => {
    const n = name.trim();
    if (!n || n === g.name) return close();
    try {
      apply(await api.renameGroup(g.id, n));
      close();
    } catch {
      say(t.network);
    }
  };
  const invite = () => Share.share({ message: t.inviteMsg(g.name, api.inviteUrl(g.code), g.code) });
  return (
    <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
      <Text style={st.h3}>{t.groupSettings}</Text>
      <Text style={st.label}>{t.groupName}</Text>
      <TextInput value={name} onChangeText={setName} maxLength={12} style={st.input} />
      <Text style={st.note}>{t.renameNote}</Text>
      <Btn label={t.save} onPress={save} />
      <Text style={st.label}>{`${t.members}（${g.members.length}/6）`}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {g.members.map((m) => (
          <Pressable key={m.id} disabled={m.id === me.id} onPress={() => onPerson(m)} style={[st.pill, { backgroundColor: tint(m.color) }]}>
            <Text style={{ fontWeight: '800', color: C.ink }}>{m.id === me.id ? `${m.name}（${t.you}）` : m.name}</Text>
          </Pressable>
        ))}
      </View>
      {g.members.length < 6 ? (
        <View style={{ gap: 8 }}>
          <Btn label={t.invite} onPress={invite} />
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(g.code);
              say(t.copied);
            }}
            style={{ alignItems: 'center' }}
          >
            <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 20, fontWeight: '800', letterSpacing: 3, color: C.ink }}>{g.code}</Text>
            <Text style={st.note}>{t.copyCode}</Text>
          </Pressable>
        </View>
      ) : null}
      <Btn
        light
        label={muted ? t.unmute : t.mute}
        onPress={async () => {
          await api.muteGroup(g.id, !muted).catch(() => {});
          setMuted(!muted);
        }}
      />
      <Btn
        light
        danger
        label={t.leave}
        onPress={() =>
          Alert.alert(t.leaveConfirm, g.name, [
            { text: t.cancel, style: 'cancel' },
            {
              text: t.leave,
              style: 'destructive',
              onPress: async () => {
                try {
                  apply(await api.leaveGroup(g.id));
                  close();
                } catch {
                  say(t.network);
                }
              },
            },
          ])
        }
      />
    </ScrollView>
  );
}

function NewGroupSheet({ s, plus, apply, close, say, onMade, needPlus }: { s: Sync; plus: boolean; apply: (s: Sync) => void; close: () => void; say: (m: string) => void; onMade: (id: string) => void; needPlus: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const limit = !plus && s.groups.length >= 2;
  const make = async () => {
    if (limit) return needPlus();
    setBusy(true);
    try {
      const r = await api.createGroup(name.trim());
      apply(r);
      onMade(r.group.id);
      close();
      registerPush(true);
    } catch (e: any) {
      if (e?.status === 402) needPlus();
      else say(t.network);
    }
    setBusy(false);
  };
  const join = async () => {
    if (limit) return needPlus();
    setBusy(true);
    try {
      const r = await api.joinGroup(code.trim());
      apply(r);
      onMade(r.group.id);
      say(t.joined(r.group.name));
      close();
      registerPush(true);
    } catch (e: any) {
      say(e?.status === 404 ? t.badCode : e?.status === 409 ? t.full : e?.status === 402 ? t.groupsPlus : t.network);
    }
    setBusy(false);
  };
  return (
    <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
      <Text style={st.h3}>{t.makeGroup}</Text>
      <TextInput value={name} onChangeText={setName} placeholder={t.groupNamePh} placeholderTextColor="#B5AEBB" maxLength={12} style={st.input} />
      <Btn label={t.create} onPress={make} disabled={!name.trim() || busy} />
      <Text style={[st.h3, { marginTop: 14 }]}>{t.joinByCode}</Text>
      <TextInput value={code} onChangeText={setCode} placeholder={t.code} placeholderTextColor="#B5AEBB" autoCapitalize="none" autoCorrect={false} maxLength={16} style={st.input} />
      <Btn label={t.join} onPress={join} disabled={code.trim().length < 4 || busy} light />
      {limit ? <Text style={st.note}>{t.groupsPlus}</Text> : null}
    </ScrollView>
  );
}

function JoinSheet({ code, s, plus, apply, close, say, onJoined, needPlus }: { code: string; s: Sync; plus: boolean; apply: (s: Sync) => void; close: () => void; say: (m: string) => void; onJoined: (id: string) => void; needPlus: () => void }) {
  const [info, setInfo] = useState<{ name: string; count: number; full: boolean; joined: boolean } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.inviteInfo(code).then(setInfo).catch((e) => setErr(e?.status === 404 ? t.badCode : t.network));
  }, [code]);
  const join = async () => {
    if (!plus && s.groups.length >= 2) return needPlus();
    try {
      const r = await api.joinGroup(code);
      apply(r);
      onJoined(r.group.id);
      say(t.joined(r.group.name));
      close();
      registerPush(true);
    } catch (e: any) {
      say(e?.status === 409 ? t.full : e?.status === 402 ? t.groupsPlus : t.network);
    }
  };
  return (
    <View style={{ gap: 12, alignItems: 'center' }}>
      <Image source={ART.miss} style={{ width: 110, height: 110 }} />
      {err ? <Text style={{ color: C.danger }}>{err}</Text> : !info ? <ActivityIndicator color={C.accent} /> : (
        <>
          <Text style={[st.h3, { textAlign: 'center' }]}>{LANG === 'ja' ? `「${info.name}」に参加しますか？` : `Join “${info.name}”?`}</Text>
          <Text style={st.note}>{`${info.count}/6`}</Text>
          {info.joined ? <Btn label={t.close} onPress={close} /> : info.full ? <Text style={{ color: C.danger }}>{t.full}</Text> : <Btn label={t.join} onPress={join} />}
        </>
      )}
      <Btn label={t.cancel} onPress={close} light />
    </View>
  );
}

/* ---------- カレンダー ---------- */
function CalendarSheet({ g, me, plus, fav, needPlus, close }: { g: Group; me: User; plus: boolean; fav: Post | null; needPlus: () => void; close: () => void }) {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [days, setDays] = useState<Set<string>>(new Set());
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [users, setUsers] = useState<Record<string, User>>({});
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  useEffect(() => {
    setPosts(null);
    const from = day.getTime();
    api
      .history(g.id, from, from + 86400e3)
      .then((r) => {
        setPosts(r.posts);
        setUsers(r.users);
        // サーバーの日付はUTCなので、前後の日も含めて点を打つ
        setDays(new Set(r.days));
      })
      .catch(() => setPosts([]));
  }, [day.getTime(), g.id]);
  const old = (d: Date) => (Date.now() - d.getTime()) / 86400e3 > FREE_DAYS;
  const first = month.getDay();
  const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const utcKey = (d: Date) => new Date(d.getTime() + 12 * 3600e3).toISOString().slice(0, 10);
  return (
    <ScrollView contentContainerStyle={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={st.iconBtn}><Text style={st.h3}>‹</Text></Pressable>
        <Text style={[st.h3, { flex: 1, textAlign: 'center' }]}>{t.monthTitle(month.getFullYear(), month.getMonth() + 1)}</Text>
        <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={st.iconBtn}><Text style={st.h3}>›</Text></Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {t.week.map((w) => (
          <Text key={w} style={{ width: '14.28%', textAlign: 'center', fontSize: 11, color: C.sub, fontWeight: '800' }}>{w}</Text>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={'e' + i} style={{ width: '14.28%', height: 40 }} />;
          const on = key(d) === key(day);
          const future = d.getTime() > today.getTime();
          return (
            <Pressable key={i} disabled={future} onPress={() => (old(d) && !plus ? needPlus() : setDay(d))} style={{ width: '14.28%', height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.ink : 'transparent' }}>
                <Text style={{ color: on ? '#fff' : future ? '#CFC6D8' : old(d) && !plus ? '#B5AEBB' : C.ink, fontWeight: '800' }}>{d.getDate()}</Text>
              </View>
              {days.has(utcKey(d)) ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.accent, marginTop: -2 }} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={st.label}>{t.dayTitle(day.getMonth() + 1, day.getDate(), t.week[day.getDay()])}</Text>
      {posts === null ? <ActivityIndicator color={C.accent} /> : posts.length === 0 ? <Text style={st.note}>{t.noPosts}</Text> : (
        posts.map((p) => {
          const mine = p.from === me.id;
          const u = users[p.from] || g.members.find((m) => m.id === p.from);
          return (
            <View key={p.id} style={{ flexDirection: mine ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
              <MoodTile p={p} color={u?.color || '#ccc'} size={52} />
              <View style={{ maxWidth: '70%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <Text style={{ fontSize: 11, color: C.sub }}>{`${mine ? t.you : u?.name || '?'} · ${new Date(p.at).getHours()}:${String(new Date(p.at).getMinutes()).padStart(2, '0')}`}</Text>
                <Text style={{ fontSize: 15, color: C.ink }}>{label(p)}</Text>
              </View>
            </View>
          );
        })
      )}
      {fav && plus ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          <Text style={st.label}>{t.yourFav}</Text>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <MoodTile p={fav} color="#F27A5E" size={56} />
            <Text style={{ color: C.ink }}>{label(fav)}</Text>
          </View>
        </View>
      ) : null}
      <Text style={st.note}>{t.calNote}</Text>
      <Btn label={t.close} onPress={close} light />
    </ScrollView>
  );
}

/* ---------- 人（通報・ブロック・お気に入り） ---------- */
function PersonSheet({ u, post, plus, isBlocked, apply, close, say, onFav, needPlus }: { u: User; post?: Post; plus: boolean; isBlocked: boolean; apply: (s: Sync) => void; close: () => void; say: (m: string) => void; onFav: (p: Post) => void; needPlus: () => void }) {
  const [reporting, setReporting] = useState(false);
  return (
    <ScrollView contentContainerStyle={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MoodTile p={post} color={u.color} size={56} />
        <Text style={st.h3}>{u.name}</Text>
      </View>
      {post ? <Btn light label={`${t.favorite}${plus ? '' : '（Plus）'}`} onPress={() => (plus ? onFav(post) : needPlus())} /> : null}
      {!reporting ? (
        <>
          <Btn light danger label={t.report} onPress={() => setReporting(true)} />
          <Btn
            light
            label={isBlocked ? t.unblock : t.block}
            onPress={async () => {
              try {
                apply(isBlocked ? await api.unblock(u.id) : await api.block(u.id));
                if (!isBlocked) say(t.blocked);
                close();
              } catch {
                say(t.network);
              }
            }}
          />
          {!isBlocked ? <Text style={st.note}>{t.blockNote}</Text> : null}
        </>
      ) : (
        <>
          <Text style={st.note}>{t.reportNote}</Text>
          {t.reportReasons.map((r) => (
            <Btn
              key={r}
              light
              label={r}
              onPress={async () => {
                try {
                  await api.report(post ? { post: post.id, reason: r } : { uid: u.id, reason: r });
                  say(t.reported);
                  close();
                } catch {
                  say(t.network);
                }
              }}
            />
          ))}
        </>
      )}
      <Btn label={t.close} onPress={close} light />
    </ScrollView>
  );
}

/* ---------- Plus ---------- */
function PlusSheet({ api: p, why, close, say }: { api: PlusApi; why?: string; close: () => void; say: (m: string) => void }) {
  const [sel, setSel] = useState<'year' | 'month'>('year');
  const was = useRef(p.plus);
  useEffect(() => {
    if (p.plus && !was.current) {
      say(t.plusThanks);
      close();
    }
    was.current = p.plus;
  }, [p.plus]);
  return (
    <ScrollView contentContainerStyle={{ gap: 10 }}>
      {why ? <Text style={{ color: '#B4632B', fontWeight: '800' }}>{why}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image source={require('./assets/icon.png')} style={{ width: 44, height: 44, borderRadius: 11 }} />
        <Text style={[st.h3, { fontSize: 22 }]}>{t.plusTitle}</Text>
      </View>
      <Text style={{ color: C.sub, lineHeight: 21 }}>{t.plusLead}</Text>
      {t.plusF.map(([a, b]) => (
        <View key={a} style={{ backgroundColor: C.soft, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontWeight: '900', color: C.ink }}>{a}</Text>
          <Text style={{ color: C.sub, fontSize: 13 }}>{b}</Text>
        </View>
      ))}
      {p.plus ? (
        <Btn label={t.manageSub} onPress={p.manage} light />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['year', 'month'] as const).map((k) => (
              <Pressable key={k} onPress={() => setSel(k)} style={[st.plan, sel === k && { borderColor: C.accent, backgroundColor: '#FFF1EA' }]}>
                <Text style={{ fontWeight: '900', color: C.ink }}>{k === 'year' ? t.yearly : t.monthly}</Text>
                <Text style={{ color: C.ink }}>{k === 'year' ? (p.prices.year ? t.perYear(p.prices.year) : '—') : p.prices.month ? t.perMonth(p.prices.month) : '—'}</Text>
                {k === 'year' && p.prices.trial ? <Text style={{ color: C.accent, fontSize: 12, fontWeight: '800' }}>{t.trial}</Text> : null}
              </Pressable>
            ))}
          </View>
          <Btn label={sel === 'year' && p.prices.trial ? t.trial : 'Nowmoji Plus'} busy={p.busy} disabled={p.busy || !p.storeAvailable} onPress={() => p.buy(sel === 'year' ? SKU_YEAR : SKU_MONTH)} />
          <Btn label={t.restore} onPress={p.restore} light disabled={p.busy} />
        </>
      )}
      <Text style={[st.note, { lineHeight: 17 }]}>{t.subNote}</Text>
      <Text style={st.note}>
        <Text style={st.link} onPress={() => Linking.openURL(`${api.SERVER}/terms?lang=${LANG}`)}>{t.terms}</Text>
        {'  ·  '}
        <Text style={st.link} onPress={() => Linking.openURL(`${api.SERVER}/privacy?lang=${LANG}`)}>{t.privacy}</Text>
        {'  ·  '}
        <Text style={st.link} onPress={() => Linking.openURL(EULA_URL)}>EULA</Text>
      </Text>
      <Btn label={t.close} onPress={close} light />
    </ScrollView>
  );
}

/* ---------- 設定 ---------- */
function SettingsSheet({ s, apply, plusApi, theme, setTheme, close, say, needPlus, onSignedOut }: { s: Sync; apply: (s: Sync) => void; plusApi: PlusApi; theme: string; setTheme: (v: string) => void; close: () => void; say: (m: string) => void; needPlus: (why: string) => void; onSignedOut: () => void }) {
  const [name, setName] = useState(s.me.name);
  return (
    <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
      <Text style={st.h3}>{t.settings}</Text>
      <Text style={st.label}>{t.name}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={name} onChangeText={setName} maxLength={12} style={[st.input, { flex: 1 }]} />
        <Btn
          label={t.save}
          disabled={!name.trim() || name.trim() === s.me.name}
          onPress={async () => {
            try {
              apply(await api.updateMe({ name: name.trim() }));
              say(t.save);
            } catch {
              say(t.network);
            }
          }}
        />
      </View>
      <Text style={st.label}>{`${t.theme}${plusApi.plus ? '' : '（Plus）'}`}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {Object.entries(THEMES).map(([k, c]) => (
          <Pressable key={k} onPress={() => (plusApi.plus || k === 'paper' ? setTheme(k) : needPlus(t.theme))} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c, borderWidth: theme === k ? 3 : 1, borderColor: theme === k ? C.accent : C.line }} accessibilityLabel={k} />
        ))}
      </View>
      <Text style={st.note}>{t.widgetTip}</Text>
      <Text style={st.label}>{t.blockedList}</Text>
      {s.blocked.length === 0 ? <Text style={st.note}>{t.none}</Text> : s.blocked.map((b) => (
        <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, color: C.ink, fontWeight: '800' }}>{b.name}</Text>
          <Btn light label={t.unblock} onPress={async () => apply(await api.unblock(b.id).catch(() => s))} />
        </View>
      ))}
      <Btn light label={plusApi.plus ? t.manageSub : 'Nowmoji Plus'} onPress={() => (plusApi.plus ? plusApi.manage() : needPlus(''))} />
      <Btn light label={t.restore} onPress={plusApi.restore} />
      <Btn light label={t.terms} onPress={() => Linking.openURL(`${api.SERVER}/terms?lang=${LANG}`)} />
      <Btn light label={t.privacy} onPress={() => Linking.openURL(`${api.SERVER}/privacy?lang=${LANG}`)} />
      <Btn light label={t.contact} onPress={() => Linking.openURL(`${api.SERVER}/support?lang=${LANG}`)} />
      <Btn
        light
        danger
        label={t.deleteData}
        onPress={() =>
          Alert.alert(t.deleteData, t.deleteConfirm, [
            { text: t.cancel, style: 'cancel' },
            {
              text: t.delete,
              style: 'destructive',
              onPress: async () => {
                try {
                  await api.deleteMe();
                  close();
                  onSignedOut();
                } catch {
                  say(t.network);
                }
              },
            },
          ])
        }
      />
      <Btn label={t.close} onPress={close} light />
    </ScrollView>
  );
}

/* ---------- 部品 ---------- */
function Btn({ label, onPress, disabled, busy, light, danger }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; light?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => [st.btn, light && { backgroundColor: C.soft }, (disabled || pressed) && { opacity: disabled ? 0.4 : 0.8 }]}>
      {busy ? <ActivityIndicator color={light ? C.ink : '#fff'} /> : <Text style={{ color: danger ? C.danger : light ? C.ink : '#fff', fontWeight: '900', fontSize: 15 }}>{label}</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '900', color: C.sub, marginTop: 4 },
  note: { fontSize: 12, color: C.sub, lineHeight: 18 },
  link: { color: C.accent, fontWeight: '800' },
  h3: { fontSize: 19, fontWeight: '900', color: C.ink },
  input: { backgroundColor: '#F3ECE2', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink },
  btn: { backgroundColor: C.ink, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  pill: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#fff', maxWidth: 180 },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  chipT: { fontWeight: '900', color: C.ink, fontSize: 14 },
  mem: { width: '31.9%', backgroundColor: '#fff', borderRadius: 20, padding: 8, alignItems: 'center', gap: 2 },
  meChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingVertical: 3, paddingLeft: 4, paddingRight: 12, maxWidth: '70%' },
  comp: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 14, paddingTop: 12, gap: 9, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: -4 } },
  tab: { flex: 1, borderRadius: 14, paddingVertical: 9, alignItems: 'center', backgroundColor: C.soft },
  tabOn: { backgroundColor: C.ink },
  tabT: { fontWeight: '900', color: C.sub, fontSize: 14 },
  seg: { flex: 1, borderRadius: 999, paddingVertical: 5, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  segOn: { backgroundColor: C.ink, borderColor: C.ink },
  segT: { fontWeight: '800', color: C.sub, fontSize: 13 },
  mood: { width: '25%', alignItems: 'center', borderRadius: 14, paddingVertical: 3 },
  send: { backgroundColor: C.ink, borderRadius: 16, paddingHorizontal: 20, height: 48, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(43,38,51,.92)', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,.3)' },
  sheet: { maxHeight: '88%', backgroundColor: C.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20 },
  plan: { flex: 1, borderWidth: 2, borderColor: C.line, borderRadius: 16, padding: 12, gap: 2, backgroundColor: '#fff' },
});
