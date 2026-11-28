// Hush：友だちと机を並べて作業する、静かな作業部屋
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as ExpoLinking from 'expo-linking';
import * as A from './src/api';
import type { Member, Room, Session, Sync } from './src/api';
import { LANG, LANGS, setLang, t, type Lang } from './src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ITEM_COUNT, RoomView } from './src/room';
import { pushStatus, registerPush } from './src/push';

const C = { night: '#1B1A26', card: 'rgba(255,255,255,.08)', lamp: '#FFC77A', paper: '#F6F0E6', ink: '#2B2633', sub: '#8A8396', chip: '#EFE7DC', soft: '#cfc8dc' };
const K_ROOM = 'hs.room.v1';
const K_MINE = 'hs.mine.v1';
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const hm = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m}${t.min}` : `${Math.floor(m / 60)}${t.h}${m % 60 ? pad(m % 60) + t.min : ''}`;
};
const hours1 = (ms: number) => (Math.round(ms / 360000) / 10).toString();
const errText = (e: any) => (e?.code === 'code' ? t.codeErr : e?.code === 'full' ? t.fullErr : e?.code === 'too_many' ? t.tooMany : t.netErr);
const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const LangCtx = React.createContext<(l: Lang) => void>(() => {});
export default function App() {
  const [lng, setLng] = useState<Lang | null>(null);
  useEffect(() => {
    AsyncStorage.getItem('hush_lang').then((l) => { if (l && LANGS.some((x) => x.id === l)) setLang(l as Lang); setLng(LANG); }).catch(() => setLng(LANG));
  }, []);
  const change = useCallback((l: Lang) => {
    setLang(l);
    AsyncStorage.setItem('hush_lang', l).catch(() => {});
    A.updateMe({ lang: l }).catch(() => {});
    setLng(l);
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <LangCtx.Provider value={change}>{lng && <Main key={lng} />}</LangCtx.Provider>
    </SafeAreaProvider>
  );
}

function Main() {
  const [ready, setReady] = useState(false);
  const [s, setS] = useState<Sync | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [tab, setTab] = useState<'room' | 'log' | 'set'>('room');
  const [now, setNow] = useState(Date.now());
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const skew = useRef(0);

  const apply = useCallback((x: Sync) => {
    skew.current = x.serverTime - Date.now();
    setS(x);
  }, []);
  const refresh = useCallback(async () => {
    if (!(await A.loadAuth())) return;
    try {
      apply(await A.sync());
    } catch (e: any) {
      if (e?.status === 401) {
        await AsyncStorage.clear().catch(() => {});
        setS(null);
      }
    }
  }, [apply]);

  useEffect(() => {
    (async () => {
      const a = await A.loadAuth();
      const c = await A.cachedSync();
      const r = await AsyncStorage.getItem(K_ROOM).catch(() => null);
      if (a && c) setS(c);
      if (r) setRoomId(r);
      setReady(true);
      if (a) {
        refresh();
        registerPush(false);
      }
    })();
    const url = (u: string | null) => {
      const m = u?.match(/join\/([a-z0-9]+)/i);
      if (m) setPendingCode(m[1].toLowerCase());
    };
    ExpoLinking.getInitialURL().then(url);
    const sub = ExpoLinking.addEventListener('url', (e) => url(e.url));
    return () => sub.remove();
  }, []);
  // アプリを開いている間は、変更があれば数秒以内に反映する（Wi-Fi・4G・5G どれでも動く普通の HTTPS）
  useEffect(() => {
    let stop = false;
    let v = -1;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      while (!stop) {
        if (AppState.currentState !== 'active') { await sleep(1500); continue; }
        try {
          const r = await A.waitChange(v);
          if (stop) break;
          if (r.changed && v >= 0) await refresh();
          v = r.v;
        } catch {
          await sleep(4000);
        }
      }
    })();
    return () => { stop = true; };
  }, [refresh]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => AppState.currentState === 'active' && refresh(), 60000); // 予備（ロングポーリングが止まったとき）
    const st = AppState.addEventListener('change', (x) => x === 'active' && refresh());
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      st.remove();
    };
  }, [refresh]);
  useEffect(() => {
    if (roomId) AsyncStorage.setItem(K_ROOM, roomId).catch(() => {});
  }, [roomId]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.night }} />;
  if (!s) return <Onboard onDone={(x) => (apply(x), registerPush(true))} />;
  const room = s.rooms.find((r) => r.id === roomId) || s.rooms[0] || null;
  const serverNow = now + skew.current;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tab === 'room' ? C.night : C.paper }} edges={['top']}>
      {pendingCode ? <JoinPrompt code={pendingCode} onClose={() => setPendingCode(null)} onJoined={(x, id) => (apply(x), setRoomId(id), setTab('room'))} /> : null}
      <View style={{ flex: 1 }}>
        {tab === 'room' ? (
          room ? (
            <RoomScreen s={s} room={room} now={serverNow} apply={apply} setRoomId={setRoomId} />
          ) : (
            <FirstRoom apply={apply} setRoomId={setRoomId} />
          )
        ) : tab === 'log' ? (
          <LogScreen s={s} />
        ) : (
          <SettingsScreen s={s} apply={apply} reset={() => setS(null)} />
        )}
      </View>
      <View style={{ flexDirection: 'row', backgroundColor: tab === 'room' ? '#15141E' : '#fff', paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 8 }}>
        {(['room', 'log', 'set'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={{ fontSize: 18 }}>{k === 'room' ? '🪴' : k === 'log' ? '📒' : '⚙️'}</Text>
            <Text style={{ fontSize: 11, fontWeight: '800', color: tab === k ? (tab === 'room' ? '#fff' : C.ink) : C.sub }}>{k === 'room' ? t.tabRoom : k === 'log' ? t.tabLog : t.tabSet}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

/* ---------- はじめて ---------- */
function Onboard({ onDone }: { onDone: (s: Sync) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.night }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 6 }}>Hush</Text>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 10 }}>{t.hello}</Text>
        <Text style={{ color: C.soft, fontSize: 14, lineHeight: 21, marginBottom: 28 }}>{t.helloSub}</Text>
        <Text style={{ color: C.soft, fontSize: 12, fontWeight: '800', marginBottom: 6 }}>{t.yourName}</Text>
        <TextInput value={name} onChangeText={(v) => setName([...v].slice(0, 5).join(''))} style={inputDark} placeholderTextColor="#777" autoFocus />
        <Btn
          label={t.start}
          busy={busy}
          disabled={!name.trim()}
          onPress={async () => {
            setBusy(true);
            setErr('');
            try {
              onDone(await A.register(name.trim()));
            } catch (e) {
              setErr(errText(e));
            }
            setBusy(false);
          }}
        />
        {err ? <Text style={{ color: '#FF9C8A', marginTop: 10 }}>{err}</Text> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const inputDark = { backgroundColor: 'rgba(255,255,255,.1)', color: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, marginBottom: 14 } as const;
const inputLight = { backgroundColor: C.chip, color: C.ink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 } as const;

function Btn({ label, onPress, busy, disabled, kind, grow }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; kind?: 'stop' | 'soft' | 'light'; grow?: boolean }) {
  const bg = kind === 'stop' ? C.lamp : kind === 'soft' ? C.chip : kind === 'light' ? '#fff' : C.ink;
  const fg = kind === 'stop' ? '#4A2E10' : kind === 'soft' || kind === 'light' ? C.ink : '#fff';
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} style={{ backgroundColor: bg, borderRadius: 18, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, opacity: disabled ? 0.4 : 1, flex: grow ? 1 : undefined }} accessibilityRole="button">
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 17, fontWeight: '900' }}>{label}</Text>}
    </Pressable>
  );
}

/* ---------- 最初の部屋 ---------- */
function FirstRoom({ apply, setRoomId }: { apply: (s: Sync) => void; setRoomId: (id: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (f: () => Promise<Sync & { room: Room }>) => {
    setBusy(true);
    setErr('');
    try {
      const r = await f();
      apply(r);
      setRoomId(r.room.id);
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  };
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 8 }}>{t.firstRoom}</Text>
      <Text style={{ color: C.soft, fontSize: 14, lineHeight: 21, marginBottom: 22 }}>{t.firstRoomSub}</Text>
      <Btn label={t.makeRoom} kind="light" busy={busy} onPress={() => run(() => A.createRoom(t.defaultRoom))} />
      <Text style={{ color: C.soft, fontSize: 12, fontWeight: '800', marginTop: 28, marginBottom: 6 }}>{t.code}</Text>
      <TextInput value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} style={inputDark} placeholder="abcd2345" placeholderTextColor="#666" />
      <Btn label={t.join} disabled={code.trim().length < 4} busy={busy} onPress={() => run(() => A.joinRoom(code.trim()))} />
      {err ? <Text style={{ color: '#FF9C8A', marginTop: 10 }}>{err}</Text> : null}
    </KeyboardAvoidingView>
  );
}

function JoinPrompt({ code, onClose, onJoined }: { code: string; onClose: () => void; onJoined: (s: Sync, id: string) => void }) {
  const [info, setInfo] = useState<{ name: string; count: number; full: boolean; joined: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      if (!(await A.loadAuth())) return;
      try {
        setInfo(await A.inviteInfo(code));
      } catch (e) {
        setErr(errText(e));
      }
    })();
  }, [code]);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: C.paper, borderRadius: 22, padding: 20, gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: C.ink }}>{info ? info.name : t.joinCode}</Text>
          <Text style={{ color: C.sub }}>{err || (info ? `${info.count}/5` : code)}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn grow label={t.cancel} kind="soft" onPress={onClose} />
            <Btn
              grow
              label={t.join}
              busy={busy}
              disabled={!info || info.full}
              onPress={async () => {
                setBusy(true);
                try {
                  const r = await A.joinRoom(code);
                  onJoined(r, r.room.id);
                  onClose();
                } catch (e) {
                  setErr(errText(e));
                }
                setBusy(false);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- 部屋 ---------- */
function RoomScreen({ s, room, now, apply, setRoomId }: { s: Sync; room: Room; now: number; apply: (s: Sync) => void; setRoomId: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<Member | null>(null);
  // 自分を0番の席に。ほかの人は入った順
  const seats: (Member | null)[] = useMemo(() => {
    const me = room.members.find((m) => m.id === s.me.id) || null;
    const others = room.members.filter((m) => m.id !== s.me.id && !s.blocked.some((b) => b.id === m.id));
    return [me, ...others, null, null, null, null].slice(0, 5);
  }, [room, s.me.id, s.blocked]);
  const workingN = room.members.filter((m) => m.live && !m.live.pausedAt).length;
  const stepH = room.stepMs / 3600e3;
  const grownH = room.totalMs / 3600e3;
  const items = Math.min(ITEM_COUNT, 1 + Math.floor(grownH / stepH));
  const next = Math.ceil(stepH - (grownH % stepH));
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 0, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 8 }}>
        <Text style={{ color: '#fff', fontSize: 21, fontWeight: '900', flex: 1 }} numberOfLines={1}>
          {room.name}
        </Text>
        <Pressable
          onPress={() => Share.share({ message: t.inviteMsg(room.name, `${A.SERVER}/j/${room.code}`, room.code) })}
          style={{ backgroundColor: C.lamp, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7 }}
          accessibilityRole="button"
        >
          <Text style={{ fontWeight: '900', color: '#5A3A12', fontSize: 13 }}>＋ {t.invite}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' }}>
        {s.rooms.map((r) => (
          <Pressable key={r.id} onPress={() => setRoomId(r.id)} style={{ borderRadius: 99, paddingHorizontal: 13, minHeight: 34, justifyContent: 'center', backgroundColor: r.id === room.id ? '#fff' : 'rgba(255,255,255,.1)' }}>
            <Text style={{ fontWeight: '900', fontSize: 13, color: r.id === room.id ? C.night : '#d9d3e6' }}>{r.name}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setAdding(true)} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.35)', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={t.makeRoom}>
          <Text style={{ color: '#fff', fontSize: 16 }}>＋</Text>
        </Pressable>
      </ScrollView>
      <View style={{ marginHorizontal: 12 }}>
        <RoomView seats={seats} items={items} party={workingN >= 3} onDesk={(i) => seats[i] && i > 0 && setMenu(seats[i])} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 }}>
        <Text style={{ color: '#b9b2c8', fontSize: 12, fontWeight: '700' }}>{workingN >= 3 ? t.together : workingN ? t.working(workingN) : t.nobody}</Text>
        <Text style={{ color: '#b9b2c8', fontSize: 12 }}>{items >= ITEM_COUNT ? t.roomFull : t.roomGrow(Math.floor(grownH), next)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingTop: 8 }}>
        {seats.map((m, i) => (
          <Pressable key={i} onLongPress={() => m && i > 0 && setMenu(m)} style={{ flex: 1, backgroundColor: C.card, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 3, alignItems: 'center', opacity: m?.live ? 1 : 0.5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: m?.color || '#555', marginBottom: 3 }} />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }} numberOfLines={1}>
              {m ? (i === 0 ? t.me : m.name) : t.empty}
            </Text>
            <Text style={{ color: C.soft, fontSize: 9.5 }} numberOfLines={1}>
              {m?.live ? (m.live.pausedAt ? t.resting : m.live.what) : m ? hm(m.today) : ' '}
            </Text>
            <Text style={{ color: C.lamp, fontWeight: '900', fontSize: 11, fontVariant: ['tabular-nums'] }}>{m?.live ? clock(A.worked(m.live, now)).slice(0, -3) : ' '}</Text>
          </Pressable>
        ))}
      </View>
      <Dock s={s} now={now} apply={apply} />
      {adding ? <AddRoom onClose={() => setAdding(false)} apply={apply} setRoomId={setRoomId} /> : null}
      {menu ? <MemberMenu m={menu} onClose={() => setMenu(null)} apply={apply} /> : null}
    </ScrollView>
  );
}

function Dock({ s, now, apply }: { s: Sync; now: number; apply: (s: Sync) => void }) {
  const me = s.me;
  const [pick, setPick] = useState(t.whats[0]);
  const [mine, setMine] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newW, setNewW] = useState('');
  const [say, setSay] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    AsyncStorage.getItem(K_MINE)
      .then((v) => v && setMine(JSON.parse(v)))
      .catch(() => {});
  }, []);
  const saveMine = (l: string[]) => (setMine(l), AsyncStorage.setItem(K_MINE, JSON.stringify(l)).catch(() => {}));
  const act = async (f: () => Promise<Sync>) => {
    setBusy(true);
    setErr('');
    try {
      apply(await f());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  };
  const live = me.live;
  return (
    <View style={{ marginTop: 14, backgroundColor: C.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 14, gap: 10, flexGrow: 1 }}>
      {live ? (
        <>
          <Text style={{ textAlign: 'center', color: C.ink, fontSize: 34, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{clock(A.worked(live, now))}</Text>
          <Text style={{ textAlign: 'center', color: C.sub, fontSize: 13, fontWeight: '700', marginTop: -6 }}>{live.pausedAt ? t.resting : live.what}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TextInput value={say} onChangeText={(v) => setSay([...v].slice(0, 10).join(''))} placeholder={live.say || t.sayPh} placeholderTextColor={C.sub} style={[inputLight, { flex: 1, paddingVertical: 10 }]} returnKeyType="send" onSubmitEditing={() => say.trim() && act(() => A.sayWork(say.trim())).then(() => setSay(''))} />
            <Pressable onPress={() => act(() => A.sayWork(say.trim())).then(() => setSay(''))} style={{ backgroundColor: C.chip, borderRadius: 14, paddingHorizontal: 14, justifyContent: 'center' }} accessibilityRole="button">
              <Text style={{ fontWeight: '900', color: C.ink }}>{t.put}</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flexBasis: '34%' }}>
              <Btn label={live.pausedAt ? t.resume : t.rest} kind="soft" busy={busy} onPress={() => act(live.pausedAt ? A.resumeWork : A.pauseWork)} />
            </View>
            <Btn grow label={t.stop} kind="stop" onPress={() => (setMsg(''), setDone(true))} />
          </View>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 13, fontWeight: '900', color: C.ink }}>{t.what}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[...t.whats, ...mine].map((w) => (
              <Pressable
                key={w}
                onPress={() => setPick(w)}
                onLongPress={() => mine.includes(w) && (saveMine(mine.filter((x) => x !== w)), pick === w && setPick(t.whats[0]))}
                style={{ borderRadius: 99, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', backgroundColor: pick === w ? C.ink : C.chip }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: pick === w ? '#fff' : '#6E6577' }}>{w}</Text>
              </Pressable>
            ))}
            {adding ? (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <TextInput
                  value={newW}
                  onChangeText={(v) => setNewW([...v].slice(0, 6).join(''))}
                  placeholder={t.addWhat}
                  placeholderTextColor={C.sub}
                  autoFocus
                  style={{ width: 100, borderRadius: 99, borderWidth: 1.5, borderColor: '#C9BFB2', paddingHorizontal: 10, minHeight: 34, backgroundColor: '#fff', color: C.ink }}
                  onSubmitEditing={() => {
                    const v = newW.trim();
                    setAdding(false);
                    setNewW('');
                    if (v && !t.whats.includes(v) && !mine.includes(v)) saveMine([...mine, v].slice(-8));
                    if (v) setPick(v);
                  }}
                />
              </View>
            ) : (
              <Pressable onPress={() => setAdding(true)} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9BFB2', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={t.add}>
                <Text style={{ color: '#8A8194' }}>＋</Text>
              </Pressable>
            )}
          </View>
          {mine.length ? <Text style={{ fontSize: 11, color: C.sub, textAlign: 'center' }}>{t.holdToRemove}</Text> : null}
          <Btn label={t.work} busy={busy} onPress={() => act(() => A.startWork(pick))} />
          <Text style={{ fontSize: 12, color: C.sub, textAlign: 'center' }}>{t.startHint}</Text>
        </>
      )}
      {err ? <Text style={{ color: '#C0453A', textAlign: 'center' }}>{err}</Text> : null}
      <Modal visible={done} transparent animationType="slide" onRequestClose={() => setDone(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.45)' }}>
          <View style={{ backgroundColor: C.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 36, gap: 12 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>{t.doneTitle}</Text>
            <Text style={{ color: C.sub }}>{live ? t.doneSub(hm(A.worked(live, now))) : ''}</Text>
            <TextInput value={msg} onChangeText={(v) => setMsg([...v].slice(0, 40).join(''))} placeholder={t.doneMsgPh} placeholderTextColor={C.sub} style={inputLight} autoFocus />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn grow label={t.cancel} kind="soft" onPress={() => setDone(false)} />
              <Btn
                grow
                label={t.save}
                busy={busy}
                onPress={async () => {
                  await act(() => A.stopWork(msg.trim()));
                  setDone(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function AddRoom({ onClose, apply, setRoomId }: { onClose: () => void; apply: (s: Sync) => void; setRoomId: (id: string) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (f: () => Promise<Sync & { room: Room }>) => {
    setBusy(true);
    setErr('');
    try {
      const r = await f();
      apply(r);
      setRoomId(r.room.id);
      onClose();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.45)' }}>
        <View style={{ backgroundColor: C.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 36, gap: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: C.ink }}>{t.roomName}</Text>
          <TextInput value={name} onChangeText={(v) => setName([...v].slice(0, 12).join(''))} placeholder={t.defaultRoom} placeholderTextColor={C.sub} style={inputLight} />
          <Btn label={t.makeRoom} busy={busy} onPress={() => run(() => A.createRoom(name.trim() || t.defaultRoom))} />
          <Text style={{ fontSize: 13, fontWeight: '900', color: C.ink, marginTop: 10 }}>{t.code}</Text>
          <TextInput value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} placeholder="abcd2345" placeholderTextColor={C.sub} style={inputLight} />
          <Btn label={t.join} kind="soft" busy={busy} disabled={code.trim().length < 4} onPress={() => run(() => A.joinRoom(code.trim()))} />
          {err ? <Text style={{ color: '#C0453A', textAlign: 'center' }}>{err}</Text> : null}
          <Pressable onPress={onClose} style={{ alignItems: 'center', padding: 8 }}>
            <Text style={{ color: C.sub, fontWeight: '800' }}>{t.cancel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MemberMenu({ m, onClose, apply }: { m: Member; onClose: () => void; apply: (s: Sync) => void }) {
  useEffect(() => {
    Alert.alert(t.memberMenu(m.name), m.live?.say ? `「${m.live.say}」` : undefined, [
      {
        text: t.reportIt,
        onPress: () =>
          Alert.alert(t.reportIt, t.reportQ, [
            { text: t.cancel, style: 'cancel', onPress: onClose },
            {
              text: t.reportIt,
              style: 'destructive',
              onPress: async () => {
                try {
                  await A.report(m.id, m.live?.say || '');
                  Alert.alert(t.reported);
                } catch (e) {
                  Alert.alert(errText(e));
                }
                onClose();
              },
            },
          ]),
      },
      {
        text: t.blockIt,
        style: 'destructive',
        onPress: async () => {
          try {
            apply(await A.block(m.id));
          } catch (e) {
            Alert.alert(errText(e));
          }
          onClose();
        },
      },
      { text: t.cancel, style: 'cancel', onPress: onClose },
    ]);
  }, []);
  return null;
}

/* ---------- 記録 ---------- */
function LogScreen({ s }: { s: Sync }) {
  const [list, setList] = useState<Session[] | null>(null);
  useEffect(() => {
    A.history()
      .then((r) => setList(r.sessions))
      .catch(() => setList([]));
  }, [s.me.live?.start, s.me.today]);
  const byDay = useMemo(() => {
    const d: Record<string, number> = {};
    for (const x of list || []) d[dayKey(x.start)] = (d[dayKey(x.start)] || 0) + x.ms;
    return d;
  }, [list]);
  const stats = useMemo(() => {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 400; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      if (byDay[dayKey(d.getTime())]) streak++;
      else if (i > 0) break;
    }
    const wk = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7)).getTime();
    const week = (list || []).filter((x) => x.start >= wk).reduce((a, x) => a + x.ms, 0);
    const total = (list || []).reduce((a, x) => a + x.ms, 0);
    return { streak, week, total };
  }, [byDay, list]);
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>{t.tabLog}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          [t.streak, `${stats.streak}${t.days}`],
          [t.thisWeek, `${hours1(stats.week)}${t.hours}`],
          [t.total, `${hours1(stats.total)}${t.hours}`],
        ].map(([k, v]) => (
          <View key={k} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.sub, fontWeight: '800' }}>{k}</Text>
            <Text style={{ fontSize: 22, color: C.ink, fontWeight: '900' }}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12 }}>
        <Text style={{ fontWeight: '900', color: C.ink, marginBottom: 8 }}>
          {now.getFullYear()}/{now.getMonth() + 1}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: lead }).map((_, i) => (
            <View key={'e' + i} style={{ width: '14.28%', aspectRatio: 1 }} />
          ))}
          {Array.from({ length: dim }).map((_, i) => {
            const ms = byDay[dayKey(new Date(now.getFullYear(), now.getMonth(), i + 1).getTime())] || 0;
            const lv = ms >= 3 * 3600e3 ? 3 : ms >= 3600e3 ? 2 : ms > 0 ? 1 : 0;
            return (
              <View key={i} style={{ width: '14.28%', aspectRatio: 1, padding: 2 }}>
                <View style={{ flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: ['#F3EEE6', '#FFE2B8', '#FFC77A', '#F0A23E'][lv], borderWidth: i + 1 === now.getDate() ? 1.5 : 0, borderColor: C.ink }}>
                  <Text style={{ fontSize: 11, color: C.ink, fontWeight: lv ? '800' : '500' }}>{i + 1}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <Btn label={t.share} kind="stop" onPress={() => Share.share({ message: t.shareMsg(stats.streak, `${hours1(stats.week)}${t.hours}`, `${hours1(stats.total)}${t.hours}`) })} />
      <Text style={{ fontWeight: '900', color: C.ink }}>{t.recent}</Text>
      {list === null ? <ActivityIndicator /> : !list.length ? <Text style={{ color: C.sub }}>{t.noLog}</Text> : null}
      {(list || [])
        .slice(-30)
        .reverse()
        .map((x) => (
          <View key={x.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: C.ink }}>
                {x.what}
                {x.msg ? `　${x.msg}` : ''}
              </Text>
              <Text style={{ fontSize: 12, color: C.sub }}>
                {new Date(x.start).toLocaleDateString(LANG === 'ja' ? 'ja-JP' : LANG === 'zh-Hans' ? 'zh-CN' : LANG === 'zh-Hant' ? 'zh-TW' : LANG === 'pt' ? 'pt-BR' : LANG === 'en' ? 'en-GB' : LANG, { month: 'short', day: 'numeric' })} {pad(new Date(x.start).getHours())}:{pad(new Date(x.start).getMinutes())}
              </Text>
            </View>
            <Text style={{ fontWeight: '900', color: C.ink }}>{hm(x.ms)}</Text>
          </View>
        ))}
    </ScrollView>
  );
}

/* ---------- 設定 ---------- */
function SettingsScreen({ s, apply, reset }: { s: Sync; apply: (s: Sync) => void; reset: () => void }) {
  const [name, setName] = useState(s.me.name);
  const [perm, setPerm] = useState('granted');
  const [notify, setNotify] = useState(true);
  const setLangNow = React.useContext(LangCtx);
  useEffect(() => {
    pushStatus().then(setPerm);
  }, []);
  const row = { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 };
  const link = (label: string, path: string) => (
    <Pressable key={path} onPress={() => Linking.openURL(`${A.SERVER}${path}?lang=${LANG === 'ja' ? 'ja' : 'en'}`)} style={row}>
      <Text style={{ flex: 1, color: C.ink, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: C.sub }}>›</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>{t.tabSet}</Text>
      <Text style={{ fontSize: 12, fontWeight: '800', color: C.sub, marginTop: 6 }}>{t.language}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {LANGS.map((l) => (
          <Pressable key={l.id} onPress={() => setLangNow(l.id)} accessibilityRole="button" accessibilityState={{ selected: l.id === LANG }} style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: 16, backgroundColor: l.id === LANG ? C.ink : '#fff' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: l.id === LANG ? '#fff' : C.ink }}>{l.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ fontSize: 12, fontWeight: '800', color: C.sub, marginTop: 6 }}>{t.name}</Text>
      <View style={row}>
        <TextInput value={name} onChangeText={(v) => setName([...v].slice(0, 5).join(''))} style={{ flex: 1, fontSize: 16, color: C.ink }} />
        <Pressable
          disabled={!name.trim() || name.trim() === s.me.name}
          onPress={async () => {
            try {
              apply(await A.updateMe({ name: name.trim() }));
            } catch (e) {
              Alert.alert(errText(e));
            }
          }}
        >
          <Text style={{ fontWeight: '900', color: !name.trim() || name.trim() === s.me.name ? C.sub : C.ink }}>{t.change}</Text>
        </Pressable>
      </View>
      <View style={row}>
        <Text style={{ flex: 1, color: C.ink, fontWeight: '700' }}>{t.notify}</Text>
        <Switch
          value={perm === 'granted' && notify}
          onValueChange={async (v) => {
            if (v && perm !== 'granted') {
              await registerPush(true);
              const st = await pushStatus();
              setPerm(st);
              if (st !== 'granted') Alert.alert(t.notifyOff);
            }
            setNotify(v);
            A.updateMe({ notify: v }).then(apply).catch(() => {});
          }}
        />
      </View>
      {perm === 'denied' ? <Text style={{ fontSize: 12, color: C.sub }}>{t.notifyOff}</Text> : null}
      <Text style={{ fontSize: 12, fontWeight: '800', color: C.sub, marginTop: 10 }}>{t.rooms}</Text>
      {s.rooms.map((r) => (
        <View key={r.id} style={[row, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
          <Text style={{ fontWeight: '900', color: C.ink }}>
            {r.name}　<Text style={{ color: C.sub, fontWeight: '600' }}>{r.code}</Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Pressable
              onPress={() =>
                Alert.prompt?.(t.rename, undefined, async (v) => {
                  const n = [...(v || '')].slice(0, 12).join('').trim();
                  if (!n) return;
                  try {
                    apply(await A.renameRoom(r.id, n));
                  } catch (e) {
                    Alert.alert(errText(e));
                  }
                }, 'plain-text', r.name)
              }
            >
              <Text style={{ color: C.ink, fontWeight: '800' }}>{t.rename}</Text>
            </Pressable>
            <Pressable onPress={() => A.muteRoom(r.id, true).then(() => Alert.alert(t.mute)).catch((e) => Alert.alert(errText(e)))}>
              <Text style={{ color: C.ink, fontWeight: '800' }}>{t.mute}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                Alert.alert(t.leaveQ, r.name, [
                  { text: t.cancel, style: 'cancel' },
                  {
                    text: t.leave,
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        apply(await A.leaveRoom(r.id));
                      } catch (e) {
                        Alert.alert(errText(e));
                      }
                    },
                  },
                ])
              }
            >
              <Text style={{ color: '#C0453A', fontWeight: '800' }}>{t.leave}</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Text style={{ fontSize: 12, fontWeight: '800', color: C.sub, marginTop: 10 }}>{t.blocked}</Text>
      {s.blocked.length ? (
        s.blocked.map((b) => (
          <View key={b.id} style={row}>
            <Text style={{ flex: 1, color: C.ink }}>{b.name}</Text>
            <Pressable onPress={async () => apply(await A.unblock(b.id).catch(() => s))}>
              <Text style={{ fontWeight: '900', color: C.ink }}>{t.unblock}</Text>
            </Pressable>
          </View>
        ))
      ) : (
        <Text style={{ color: C.sub }}>{t.none}</Text>
      )}
      <View style={{ height: 10 }} />
      {link(t.terms, '/terms')}
      {link(t.privacy, '/privacy')}
      {link(t.support, '/support')}
      <Pressable
        onPress={() =>
          Alert.alert(t.deleteAll, t.deleteQ, [
            { text: t.cancel, style: 'cancel' },
            {
              text: t.del,
              style: 'destructive',
              onPress: async () => {
                try {
                  await A.deleteMe();
                  reset();
                } catch (e) {
                  Alert.alert(errText(e));
                }
              },
            },
          ])
        }
        style={[row, { marginTop: 10 }]}
      >
        <Text style={{ color: '#C0453A', fontWeight: '800' }}>{t.deleteAll}</Text>
      </Pressable>
      <Text style={{ textAlign: 'center', color: C.sub, fontSize: 11, marginTop: 8 }}>Hush 1.0</Text>
    </ScrollView>
  );
}
