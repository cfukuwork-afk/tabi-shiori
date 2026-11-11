// 住所・駅名 → 緯度経度とタイムゾーン（端末の地図機能を使う。結果は保存して何度も調べない）
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Booking, Trip } from './data';
import { AIRPORT_TZ } from './airports';
import { placeQuery } from './maps';

export type Geo = { lat: number; lng: number; tz?: string };
const KEY = 'ts.geo.v1';
let cache: Record<string, Geo | null> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse((await AsyncStorage.getItem(KEY)) || '{}');
  } catch {
    cache = {};
  }
  return cache!;
}
const saveCache = () => AsyncStorage.setItem(KEY, JSON.stringify(cache ?? {})).catch(() => {});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 1件ずつ順番に調べる（たくさん同時に聞くと止められるため） */
export function geocode(q: string): Promise<Geo | null> {
  const job = queue.then(async () => {
    const c = await loadCache();
    if (q in c) return c[q];
    if (Platform.OS === 'web') return null;
    let out: Geo | null = null;
    let failed = false;
    try {
      const Location = require('expo-location');
      const r = await Location.geocodeAsync(q);
      if (r?.[0]) {
        out = { lat: r[0].latitude, lng: r[0].longitude };
        try {
          const rev = await Location.reverseGeocodeAsync({ latitude: out.lat, longitude: out.lng });
          if (rev?.[0]?.timezone) out.tz = rev[0].timezone;
        } catch {}
      }
    } catch {
      failed = true; // 圏外などで調べられなかったときは覚えない（あとでもう一度調べる）
    }
    if (!failed) {
      c[q] = out;
      saveCache();
    }
    await sleep(250);
    return out;
  });
  queue = job.catch(() => null);
  return job;
}

/** 予約の現地タイムゾーン。飛行機は空港から、ほかは調べた結果、なければ旅行先のもの */
export function bookingTz(b: Booking, trip?: Trip): string | undefined {
  if (b.type === 'flight' && b.from) {
    const z = AIRPORT_TZ[b.from.trim().toUpperCase()];
    if (z) return z;
  }
  if (b.tz) return b.tz;
  return trip ? tripTz(trip) : undefined;
}
export function arrivalTz(b: Booking, trip?: Trip): string | undefined {
  if (b.type === 'flight' && b.to) {
    const z = AIRPORT_TZ[b.to.trim().toUpperCase()];
    if (z) return z;
  }
  return bookingTz(b, trip);
}

/** 旅行先のタイムゾーン（いちばん多いもの。飛行機の到着地も数える） */
export function tripTz(trip: Trip): string | undefined {
  const n: Record<string, number> = {};
  trip.bookings.forEach((b) => {
    const z = b.type === 'flight' ? (b.to ? AIRPORT_TZ[b.to.trim().toUpperCase()] : undefined) : b.tz;
    if (z) n[z] = (n[z] ?? 0) + 1;
  });
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** タイムゾーンが分かっていない予約を調べて埋める。変わったものだけ返す */
export async function fillTimezones(trip: Trip): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const b of trip.bookings) {
    if (b.tz || b.type === 'flight') continue;
    // 住所も駅名もない予定は、旅行先のタイムゾーンを使う（名前だけだと別の国が出ることがあるため）
    if (!b.from && b.type !== 'train' && b.type !== 'bus') continue;
    const q = placeQuery(b, 'from');
    if (!q) continue;
    const g = await geocode(q);
    if (g?.tz) out[b.id] = g.tz;
  }
  return out;
}
