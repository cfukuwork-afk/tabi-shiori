// 2地点の移動時間の目安（端末の中だけで計算・無料・圏外でも出る）
import { Geo } from './geo';

export function distKm(a: Geo, b: Geo) {
  const R = 6371;
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 直線距離から：1.5km までは徒歩、それより遠いと電車・車。道の曲がりを見込んで少し長めに */
export function estimate(a: Geo, b: Geo): { mode: 'walk' | 'ride' | 'far'; min: number; km: number } | null {
  const km = distKm(a, b);
  if (km < 0.05) return null;
  if (km > 300) return { mode: 'far', min: 0, km };
  if (km <= 1.5) return { mode: 'walk', min: Math.max(1, Math.round(((km * 1.3) / 4.5) * 60)), km };
  return { mode: 'ride', min: Math.round(((km * 1.3) / 28) * 60 + 8), km };
}

export const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)}m` : `${km < 10 ? km.toFixed(1) : Math.round(km)}km`);
