// 日ごとの天気予報（Open-Meteo：キー不要・無料）。最後に取れた予報は保存して圏外でも出す
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Trip, tripRange, todayStr, daysBetween } from './data';
import { AIRPORT_NAME } from './airports';
import { tripCity } from './maps';
import { geocode } from './geo';

export type DayWx = { code: number; max: number; min: number; rain?: number };
export type TripWx = { place: string; days: Record<string, DayWx>; at: number };

const KEY = 'ts.wx.v1';
const FRESH = 3 * 3600 * 1000;
let mem: Record<string, TripWx> | null = null;

async function load() {
  if (mem) return mem;
  try {
    mem = JSON.parse((await AsyncStorage.getItem(KEY)) || '{}');
  } catch {
    mem = {};
  }
  return mem!;
}
const save = () => AsyncStorage.setItem(KEY, JSON.stringify(mem ?? {})).catch(() => {});

/** 旅行先の場所の候補（ホテルの街 → 到着空港 → 予定の場所 → 旅行名） */
export function wxPlaces(trip: Trip): string[] {
  const out: string[] = [];
  const city = tripCity(trip.bookings);
  if (city) out.push(city);
  const hotel = trip.bookings.find((b) => b.type === 'hotel' && b.from);
  if (hotel?.from) out.push(hotel.from);
  const fl = [...trip.bookings].filter((b) => b.type === 'flight' && b.to).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (fl?.to) {
    const name = AIRPORT_NAME[fl.to.trim().toUpperCase()];
    if (name) out.push(name.replace(/\s*(International\s*)?Airport.*$/i, '').replace(/空港.*$/, '') || name);
  }
  trip.bookings.filter((b) => b.from && b.type !== 'flight').forEach((b) => out.push(b.from!));
  out.push(trip.name.replace(/(旅|旅行|週末|弾丸|家族|trip|weekend|\d+泊\d*日?|\d+日間)/gi, '').trim());
  return [...new Set(out.filter((x) => x && x.length >= 2))];
}

async function openMeteoGeo(q: string): Promise<{ lat: number; lng: number } | null> {
  const name = q.split(/[,、]/)[0].trim();
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=ja&name=${encodeURIComponent(name)}`);
    const j = await r.json();
    const g = j?.results?.[0];
    return g ? { lat: g.latitude, lng: g.longitude } : null;
  } catch {
    return null;
  }
}

async function locate(trip: Trip) {
  for (const q of wxPlaces(trip).slice(0, 4)) {
    const g = (Platform.OS !== 'web' ? await geocode(q) : null) ?? (await openMeteoGeo(q));
    if (g) return { q, ...g };
  }
  return null;
}

/** 旅行の日の予報（16日先まで）。予報の範囲外なら null */
export async function tripWeather(trip: Trip, force = false): Promise<TripWx | null> {
  const { start, end } = tripRange(trip);
  const today = todayStr();
  if (!start) return null;
  const last = end ?? start;
  if (last < today || daysBetween(today, start) > 15) return null;
  const c = await load();
  const hit = c[trip.id];
  if (hit && !force && Date.now() - hit.at < FRESH) return hit;
  const loc = await locate(trip);
  if (!loc) return hit ?? null;
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`,
    );
    const j = await r.json();
    const d = j?.daily;
    if (!d?.time) return hit ?? null;
    const days: Record<string, DayWx> = {};
    d.time.forEach((day: string, i: number) => {
      days[day] = { code: d.weather_code[i], max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]), rain: d.precipitation_probability_max?.[i] ?? undefined };
    });
    const out: TripWx = { place: loc.q, days, at: Date.now() };
    c[trip.id] = out;
    save();
    return out;
  } catch {
    return hit ?? null;
  }
}

/** 天気コード → アイコンと短い言葉 */
export function wxIcon(code: number): { icon: string; key: 'wxClear' | 'wxPartly' | 'wxCloudy' | 'wxFog' | 'wxRain' | 'wxSnow' | 'wxStorm' } {
  if (code === 0) return { icon: 'sunny-outline', key: 'wxClear' };
  if (code <= 2) return { icon: 'partly-sunny-outline', key: 'wxPartly' };
  if (code === 3) return { icon: 'cloudy-outline', key: 'wxCloudy' };
  if (code <= 48) return { icon: 'cloudy-outline', key: 'wxFog' };
  if (code <= 67 || (code >= 80 && code <= 82)) return { icon: 'rainy-outline', key: 'wxRain' };
  if (code <= 77 || code === 85 || code === 86) return { icon: 'snow-outline', key: 'wxSnow' };
  return { icon: 'thunderstorm-outline', key: 'wxStorm' };
}
