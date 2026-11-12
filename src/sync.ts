// 旅行の共有（共同編集）：サーバーとのやりとり・写真の送受信
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Trip, normalizeTrip } from './data';

// サーバーから来た旅行を、アプリが落ちない形に（壊れていたら同期しない）
const safe = (x: any): Trip => {
  const t = normalizeTrip(x);
  if (!t) throw new Error('bad trip');
  return t;
};

export const SERVER = process.env.EXPO_PUBLIC_TF_SERVER || 'https://tripfold.160-251-171-249.sslip.io';
const K_PHOTOS = 'ts.photomap.v1';

/** 共有コードの表示（XXXX-XXXX） */
export const prettyCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
export const normCode = (c: string) => c.toUpperCase().replace(/[^0-9A-Z]/g, '');

/* ---------- 写真：サーバーの写真 ⇄ 端末の写真 の対応表（オフラインでも見られるように） ---------- */
let photoMap: Record<string, string> = {};
export async function loadPhotoMap() {
  try {
    photoMap = JSON.parse((await AsyncStorage.getItem(K_PHOTOS)) || '{}');
  } catch {
    photoMap = {};
  }
}
const savePhotoMap = () => AsyncStorage.setItem(K_PHOTOS, JSON.stringify(photoMap)).catch(() => {});
/** サーバーの写真を、端末に保存済みならその場所に置き換える */
export const localPhoto = (u: string) => photoMap[u] ?? u;

const isLocalUri = (u?: string) => !!u && !/^https?:/.test(u) && !u.startsWith('asset:');
const isServerUri = (u?: string) => !!u && u.startsWith(SERVER);

/** 旅行の中の写真すべてに fn をかける */
function mapPhotos(trip: Trip, fn: (u: string) => string): Trip {
  const arr = (a?: string[]) => (a ? a.map(fn) : a);
  return {
    ...trip,
    cover: trip.cover ? fn(trip.cover) : trip.cover,
    bookings: trip.bookings.map((b) => (b.photos ? { ...b, photos: arr(b.photos) } : b)),
    wishes: trip.wishes?.map((w) => (w.photos ? { ...w, photos: arr(w.photos) } : w)),
    journal: trip.journal
      ? Object.fromEntries(Object.entries(trip.journal).map(([d, v]) => [d, v?.photos ? { ...v, photos: arr(v.photos) } : v]))
      : trip.journal,
  };
}
function allPhotos(trip: Trip): string[] {
  const out: string[] = [];
  mapPhotos(trip, (u) => (out.push(u), u));
  return out;
}

async function uploadOne(code: string, uri: string): Promise<string | null> {
  try {
    let body: any;
    if (Platform.OS === 'web') body = await (await fetch(uri)).blob();
    else {
      const { File } = require('expo-file-system');
      body = new File(uri);
    }
    const ext = uri.toLowerCase().split('?')[0].split('.').pop();
    const type = ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
    const r = await fetch(`${SERVER}/v1/trips/${code}/photos`, { method: 'POST', headers: { 'Content-Type': type }, body });
    if (!r.ok) return null;
    const j = await r.json();
    const url = `${SERVER}${j.path}`;
    photoMap[url] = uri;
    savePhotoMap();
    return url;
  } catch {
    return null;
  }
}

/** 端末にしかない写真をサーバーへ送り、URLに置き換えた旅行を返す（送れなかった写真はそのまま） */
async function uploadPhotos(trip: Trip, code: string): Promise<Trip> {
  const local = [...new Set(allPhotos(trip).filter(isLocalUri))];
  if (!local.length) return trip;
  const done: Record<string, string> = {};
  for (const u of local) {
    const url = await uploadOne(code, u);
    if (url) done[u] = url;
  }
  return mapPhotos(trip, (u) => done[u] ?? u);
}

/** 相手が足した写真を端末に保存しておく（電波がなくても見られるように） */
async function downloadPhotos(trip: Trip) {
  if (Platform.OS === 'web') return;
  const need = [...new Set(allPhotos(trip).filter((u) => isServerUri(u) && !photoMap[u]))];
  if (!need.length) return;
  try {
    const { File, Directory, Paths } = require('expo-file-system');
    const dir = new Directory(Paths.document, 'photos');
    if (!dir.exists) dir.create();
    for (const u of need) {
      try {
        const name = u.split('/').pop()!;
        const dest = new File(dir, `shared-${name}`);
        if (!dest.exists) await File.downloadFileAsync(u, dest);
        photoMap[u] = dest.uri;
      } catch {}
    }
    savePhotoMap();
  } catch {}
}

/* ---------- サーバーとのやりとり ---------- */
const strip = (t: Trip) => {
  const { share: _s, myId: _m, ...rest } = t;
  return rest;
};
async function call(path: string, init?: RequestInit) {
  const r = await fetch(`${SERVER}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}

/** 共有を始める：コードを作ってサーバーに置く */
export async function startShare(trip: Trip): Promise<Trip> {
  const res = await call('/v1/share', { method: 'POST', body: JSON.stringify({ trip: strip({ ...trip, bookings: trip.bookings }) }) });
  const code: string = res.code;
  const withPhotos = await uploadPhotos(trip, code);
  const res2 = await call(`/v1/trips/${code}`, { method: 'PUT', body: JSON.stringify({ trip: strip(withPhotos) }) });
  const myId = trip.myId ?? trip.members.find((m) => m.id === 'me')?.id ?? trip.members[0]?.id;
  return { ...(res2.trip as Trip), share: { code, rev: res2.rev, syncedAt: Date.now() }, myId };
}

/** 共有コードで旅行を取りに行く（参加するとき） */
export async function fetchShared(code: string): Promise<{ trip: Trip; rev: number }> {
  const res = await call(`/v1/trips/${normCode(code)}`);
  res.trip = safe(res.trip);
  await downloadPhotos(res.trip);
  return { trip: res.trip, rev: res.rev };
}

/**
 * 1つの旅行をサーバーと合わせる。
 * 手元に送っていない変更があれば送り、なければ新しい版があるかだけ聞く。
 * 戻り値はサーバーの版（変わっていなければ null）
 */
export async function syncTrip(trip: Trip): Promise<{ trip: Trip; rev: number; pushed: boolean } | null> {
  const sh = trip.share;
  if (!sh) return null;
  if (sh.dirty) {
    const up = await uploadPhotos(trip, sh.code);
    const res = await call(`/v1/trips/${sh.code}`, { method: 'PUT', body: JSON.stringify({ trip: strip(up) }) });
    res.trip = safe(res.trip);
    await downloadPhotos(res.trip);
    return { trip: res.trip, rev: res.rev, pushed: true };
  }
  const res = await call(`/v1/trips/${sh.code}?rev=${sh.rev}`);
  if (res.unchanged) return null;
  res.trip = safe(res.trip);
  await downloadPhotos(res.trip);
  return { trip: res.trip, rev: res.rev, pushed: false };
}
