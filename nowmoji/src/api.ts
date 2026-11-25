// サーバーとのやりとり
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANG } from './i18n';

export const SERVER = process.env.EXPO_PUBLIC_SERVER || 'https://nowmoji.160-251-171-249.sslip.io';
const K_AUTH = 'nm.auth.v1';
const K_SYNC = 'nm.sync.v1';

export type User = { id: string; name: string; color: string };
export type Post = { id: string; g: string; from: string; kind: 'kao' | 'art' | 'doodle' | 'stamp'; mood: string | null; kao: string | null; word: string; img: string | null; at: number };
export type Group = { id: string; name: string; code: string; owner: string; members: User[]; latest: Record<string, Post>; createdAt: number };
export type Sync = { me: User & { lang: string; plus: boolean }; groups: Group[]; blocked: User[]; serverTime: number };

let auth: string | null = null;
export async function loadAuth() {
  if (auth) return auth;
  auth = await AsyncStorage.getItem(K_AUTH).catch(() => null);
  return auth;
}
export const hasAuth = () => !!auth;

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const a = await loadAuth();
  let r: Response;
  try {
    r = await fetch(SERVER + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(a ? { Authorization: 'Bearer ' + a } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j?.error || 'server');
  return j as T;
}
async function keep(s: Sync) {
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
  const r = await call<Sync & { uid: string; token: string }>('POST', '/v1/register', { name, lang: LANG });
  auth = `${r.uid}.${r.token}`;
  await AsyncStorage.setItem(K_AUTH, auth);
  return keep(r);
}
export const sync = async () => keep(await call<Sync>('GET', '/v1/sync'));
export const updateMe = async (b: { name?: string; pushToken?: string | null; plus?: boolean; lang?: string }) => keep(await call<Sync>('PUT', '/v1/me', b));
export async function deleteMe() {
  await call('DELETE', '/v1/me');
  auth = null;
  await AsyncStorage.multiRemove([K_AUTH, K_SYNC]).catch(() => {});
}
export const createGroup = async (name: string) => {
  const r = await call<Sync & { group: Group }>('POST', '/v1/groups', { name });
  await keep(r);
  return r;
};
export const joinGroup = async (code: string) => {
  const r = await call<Sync & { group: Group }>('POST', '/v1/join', { code });
  await keep(r);
  return r;
};
export const inviteInfo = (code: string) => call<{ name: string; count: number; full: boolean; joined: boolean }>('GET', '/v1/invite/' + encodeURIComponent(code));
export const renameGroup = async (g: string, name: string) => keep(await call<Sync>('PATCH', `/v1/groups/${g}`, { name }));
export const leaveGroup = async (g: string) => keep(await call<Sync>('POST', `/v1/groups/${g}/leave`));
export const muteGroup = (g: string, mute: boolean) => call('POST', `/v1/groups/${g}/mute`, { mute });
export const post = async (g: string, b: { kind: Post['kind']; mood?: string; kao?: string; word?: string; image?: string }) => {
  const r = await call<Sync & { post: Post }>('POST', `/v1/groups/${g}/posts`, b);
  await keep(r);
  return r;
};
export const history = (g: string, from: number, to: number) => call<{ posts: Post[]; days: string[]; users: Record<string, User> }>('GET', `/v1/groups/${g}/history?from=${from}&to=${to}`);
export const block = async (uid: string) => keep(await call<Sync>('POST', '/v1/block', { uid }));
export const unblock = async (uid: string) => keep(await call<Sync>('DELETE', '/v1/block/' + uid));
export const report = (b: { post?: string; uid?: string; reason: string }) => call('POST', '/v1/report', b);
export const imgUrl = (p: string | null) => (p ? SERVER + p : '');
export const inviteUrl = (code: string) => `${SERVER}/j/${code}`;
