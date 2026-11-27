// サーバーとのやりとり
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANG } from './i18n';

// 自分のドメイン（tripfold.net）経由を先に使う。sslip.io の住所は携帯回線（4G/5G）の DNS で引けないことがあるため、予備に回す
export const SERVER = process.env.EXPO_PUBLIC_SERVER || 'https://tripfold.net/hush';
export const LEGACY = 'https://hush.160-251-171-249.sslip.io';
let base = SERVER; // 直近につながった方を覚えておく
// 通信：つながらない・時間切れのときは、もう一方の住所で 1 回だけやり直す
async function fetchAny(path: string, init: RequestInit, ms = 20000): Promise<Response> {
  const order = base === SERVER ? [SERVER, LEGACY] : [LEGACY, SERVER];
  let last: unknown;
  for (const b of order) {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(b + path, { ...init, signal: ctl.signal });
      clearTimeout(tm);
      base = b;
      return r;
    } catch (e) { clearTimeout(tm); last = e; }
  }
  throw last;
}
const K_AUTH = 'hs.auth.v1';
const K_SYNC = 'hs.sync.v1';

export type Live = { what: string; start: number; pausedMs: number; pausedAt: number | null; say: string };
export type Member = { id: string; name: string; color: string; live: Live | null; today: number };
export type Room = { id: string; name: string; code: string; owner: string; members: Member[]; totalMs: number; stepMs: number; createdAt: number };
export type Sync = { me: { id: string; name: string; color: string; lang: string; live: Live | null; today: number }; rooms: Room[]; blocked: { id: string; name: string; color: string }[]; serverTime: number };
export type Session = { id: string; what: string; start: number; end: number; ms: number; msg: string };

let auth: string | null = null;
export async function loadAuth() {
  if (auth) return auth;
  auth = await AsyncStorage.getItem(K_AUTH).catch(() => null);
  return auth;
}
export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
const tz = () => -new Date().getTimezoneOffset();
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const a = await loadAuth();
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 20000);
  let r: Response;
  try {
    r = await fetchAny(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(a ? { Authorization: 'Bearer ' + a } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network');
  } finally {
    clearTimeout(tm);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j?.error || 'server');
  return j as T;
}
async function keep<T extends Sync>(s: T) {
  await AsyncStorage.setItem(K_SYNC, JSON.stringify(s)).catch(() => {});
  return s;
}
export async function cachedSync(): Promise<Sync | null> {
  try {
    const s = await AsyncStorage.getItem(K_SYNC);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
export async function register(name: string) {
  const r = await call<Sync & { uid: string; token: string }>('POST', '/v1/register', { name, lang: LANG, tz: tz() });
  auth = `${r.uid}.${r.token}`;
  await AsyncStorage.setItem(K_AUTH, auth);
  return keep(r);
}
export const sync = async () => keep(await call<Sync>('GET', '/v1/sync'));
export const updateMe = async (b: { name?: string; pushToken?: string | null; lang?: string; notify?: boolean }) => keep(await call<Sync>('PUT', '/v1/me', { ...b, tz: tz() }));
export async function deleteMe() {
  await call('DELETE', '/v1/me');
  auth = null;
  await AsyncStorage.clear().catch(() => {});
}
export const createRoom = async (name: string) => keep(await call<Sync & { room: Room }>('POST', '/v1/rooms', { name }));
export const joinRoom = async (code: string) => keep(await call<Sync & { room: Room }>('POST', '/v1/join', { code }));
export const renameRoom = async (id: string, name: string) => keep(await call<Sync>('PATCH', `/v1/rooms/${id}`, { name }));
export const leaveRoom = async (id: string) => keep(await call<Sync>('POST', `/v1/rooms/${id}/leave`));
export const muteRoom = (id: string, mute: boolean) => call('POST', `/v1/rooms/${id}/mute`, { mute });
export const startWork = async (what: string) => keep(await call<Sync>('POST', '/v1/work/start', { what }));
export const pauseWork = async () => keep(await call<Sync>('POST', '/v1/work/pause'));
export const resumeWork = async () => keep(await call<Sync>('POST', '/v1/work/resume'));
export const sayWork = async (say: string) => keep(await call<Sync>('POST', '/v1/work/say', { say }));
export const stopWork = async (msg: string) => keep(await call<Sync & { session: Session | null }>('POST', '/v1/work/stop', { msg }));
export const history = () => call<{ sessions: Session[] }>('GET', '/v1/history');
export const block = async (uid: string) => keep(await call<Sync>('POST', '/v1/block', { uid }));
export const unblock = async (uid: string) => keep(await call<Sync>('DELETE', '/v1/block/' + uid));
export const report = (uid: string, reason: string) => call('POST', '/v1/report', { uid, reason });

/** 休憩を除いた作業時間 */
export const worked = (l: Live, at = Date.now()) => Math.max(0, (l.pausedAt || at) - l.start - (l.pausedMs || 0));
export const inviteInfo = (code: string) => call<{ name: string; count: number; full: boolean; joined: boolean }>('GET', '/v1/invite/' + encodeURIComponent(code));
