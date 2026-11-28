// SkyLab の計算（端末上）
// 天文計算は astronomy-engine（MIT, VSOP87/ELP 系の精密計算）。気象条件はサーバーの /api/sky（3モデルの平均と幅）
// 判定の目安は docs/conditions.md に根拠と一緒に書く。検証前のものは exp=true（実験中）として表示する
import * as A from 'astronomy-engine';

// 予測ロジックの版。判定を変えたら必ず上げる（報告・予測ログに記録し、版ごとに精度を比べる）
export const ENGINE_VERSION = 'sky-1.1.0';

// 晴れ間の確率の較正表（サーバーが配る。過去の予報と空港観測から作ったもの）。無いときは雲量から素朴に出し、信頼度を下げる
export type Calib = { by_lead: Record<string, { table: { lo: number; hi: number; n: number; p: number }[] }> } | null;
export type Conf = 'high' | 'mid' | 'low';
export type Factor = { key: string; v: number }; // 0〜1
export function pClear(cloud: number | null, leadH: number, cal: Calib): { p: number | null; calibrated: boolean } {
  if (cloud == null) return { p: null, calibrated: false };
  const leads = cal ? Object.keys(cal.by_lead).map(Number).sort((a, b) => a - b) : [];
  if (leads.length) {
    const day = Math.max(1, Math.round(leadH / 24));
    const L = leads.reduce((a, b) => (Math.abs(b - day) < Math.abs(a - day) ? b : a));
    const tab = cal!.by_lead[String(L)].table;
    const row = tab[Math.min(tab.length - 1, Math.floor(cloud / 10))];
    return { p: row.p, calibrated: true };
  }
  return { p: Math.max(0, Math.min(1, 1 - cloud / 100)), calibrated: false };
}

export type Level = 3 | 2 | 1 | 0 | -1; // 3 良い / 2 まあまあ / 1 見込み薄 / 0 見えない / -1 データなし
export type Hour = {
  t: string;
  cloud_cover: V; cloud_cover_low: V; cloud_cover_mid: V; cloud_cover_high: V;
  precipitation: V; showers: V; visibility: V; temperature_2m: V;
};
type V = { mean: number; min: number; max: number; n: number } | null;
export type SkyData = {
  calibration?: Calib;
  weather: { hours: Hour[]; models: string[] } | null;
  aurora: { overhead: number; visible_max: number; visible_km: number | null; visible_dir: number | null; reach_km: number; observed: string; valid: string } | null;
  kp_forecast: { t: string; kp: number; kind: string; scale: string | null }[] | null;
};
export type Item = {
  key: string;
  level: Level;
  exp: boolean;          // 実験中（精度未検証）
  start?: Date; peak?: Date; end?: Date;
  dir?: number;          // 方位（北=0, 東=90）
  facts: string[];       // 根拠（表示用、言語ごとに組み立て）
  p?: number | null;     // 確率（0〜1）。exp のものは研究段階の推定
  conf?: Conf;           // 信頼度
  factors?: Factor[];    // 内訳（0〜1）
  extra?: any;
};

const obsOf = (lat: number, lon: number) => new A.Observer(lat, lon, 0);
export function sunPos(lat: number, lon: number, d: Date) {
  const o = obsOf(lat, lon);
  const eq = A.Equator(A.Body.Sun, d, o, true, true);
  const h = A.Horizon(d, o, eq.ra, eq.dec, 'normal');
  return { alt: h.altitude, az: h.azimuth };
}
export function moonPos(lat: number, lon: number, d: Date) {
  const o = obsOf(lat, lon);
  const eq = A.Equator(A.Body.Moon, d, o, true, true);
  const h = A.Horizon(d, o, eq.ra, eq.dec, 'normal');
  const ill = A.Illumination(A.Body.Moon, d);
  return { alt: h.altitude, az: h.azimuth, frac: ill.phase_fraction, phase: A.MoonPhase(d) };
}
// 太陽が高度 alt を通る時刻（dir=+1 昇るとき, -1 沈むとき）
function crossing(lat: number, lon: number, dir: 1 | -1, from: Date, alt: number): Date | null {
  const t = A.SearchAltitude(A.Body.Sun, obsOf(lat, lon), dir, from, 1.2, alt);
  return t ? t.date : null;
}

function hourAt(w: SkyData['weather'], d: Date): Hour | null {
  if (!w) return null;
  let best: Hour | null = null, bd = Infinity;
  for (const h of w.hours) {
    const dd = Math.abs(Date.parse(h.t) - d.getTime());
    if (dd < bd) { bd = dd; best = h; }
  }
  return bd <= 45 * 60e3 ? best : null;
}
const m = (v: V) => (v ? v.mean : null);

// 夕焼け・朝焼け（実験）：色づくのは中・上層の雲に低い角度の光が当たるとき。地平線側の低い雲・雨は光を遮る
function glow(kind: 'sunset' | 'sunrise', lat: number, lon: number, w: SkyData['weather'], now: Date): Item | null {
  const dir = kind === 'sunset' ? -1 : 1;
  const t0 = crossing(lat, lon, dir, now, -0.833);
  if (!t0) return null;
  const h = hourAt(w, t0);
  const sp = sunPos(lat, lon, t0);
  const it: Item = { key: kind, level: -1, exp: true, peak: t0, start: new Date(t0.getTime() - 20 * 60e3), end: new Date(t0.getTime() + 25 * 60e3), dir: sp.az, facts: [] };
  if (!h) return it;
  const low = m(h.cloud_cover_low) ?? 0, mid = m(h.cloud_cover_mid) ?? 0, high = m(h.cloud_cover_high) ?? 0, pr = m(h.precipitation) ?? 0, tot = m(h.cloud_cover) ?? 0;
  const upper = Math.max(mid, high);
  if (low >= 70 || pr >= 0.5) it.level = 1;
  else if (tot < 10) it.level = 2; // 雲がほぼない：空は色づくが、雲が焼ける夕焼けにはならない
  else if (upper >= 20 && upper <= 80 && low < 40 && pr < 0.2) it.level = 3;
  else it.level = 2;
  it.extra = { low, mid, high, pr, tot };
  return it;
}

export function goldenBlue(lat: number, lon: number, w: SkyData['weather'], now: Date) {
  // ゴールデンアワー：太陽高度 -4°〜6°、ブルーアワー：-6°〜-4°（写真の分野で広く使われる定義）。2 分刻みで 40 時間先まで調べる
  const out: Item[] = [];
  const kindOf = (alt: number) => (alt >= -4 && alt <= 6 ? 'goldenhour' : alt >= -6 && alt < -4 ? 'bluehour' : null);
  let cur: { key: string; start: Date } | null = null;
  const step = 2 * 60e3, t0 = now.getTime() - 90 * 60e3;
  const close = (end: Date) => {
    if (!cur) return;
    if (end.getTime() > now.getTime()) {
      const mid = new Date((cur.start.getTime() + end.getTime()) / 2);
      const h = hourAt(w, mid);
      const c = h ? m(h.cloud_cover) : null;
      out.push({ key: cur.key, level: c == null ? -1 : c < 40 ? 3 : c < 75 ? 2 : 1, exp: false, start: cur.start, end, peak: mid, dir: sunPos(lat, lon, mid).az, facts: [], extra: { cloud: c } });
    }
    cur = null;
  };
  for (let t = t0; t <= now.getTime() + 40 * 3600e3; t += step) {
    const d = new Date(t), k = kindOf(sunPos(lat, lon, d).alt);
    if (cur && k !== cur.key) close(d);
    if (k && !cur) cur = { key: k, start: d };
  }
  close(new Date(now.getTime() + 40 * 3600e3));
  return out;
}

// 虹（実験）：太陽の反対側、太陽高度 42° 未満で、にわか雨があり、太陽が出ている（低い雲が少ない）時間
export function rainbow(lat: number, lon: number, w: SkyData['weather'], now: Date): Item {
  const it: Item = { key: 'rainbow', level: -1, exp: true, facts: [] };
  if (!w) return it;
  const hits: { t: Date; alt: number; az: number; sh: number; low: number }[] = [];
  for (const h of w.hours) {
    const t = new Date(h.t);
    if (t.getTime() < now.getTime() - 30 * 60e3 || t.getTime() > now.getTime() + 36 * 3600e3) continue;
    const sp = sunPos(lat, lon, t);
    if (sp.alt <= 0 || sp.alt >= 42) continue;
    const sh = Math.max(m(h.showers) ?? 0, m(h.precipitation) ?? 0), low = m(h.cloud_cover_low) ?? 100, tot = m(h.cloud_cover) ?? 100;
    if (sh >= 0.1 && low < 80 && tot < 95) hits.push({ t, alt: sp.alt, az: sp.az, sh, low });
  }
  if (!hits.length) { it.level = 0; return it; }
  const best = hits.reduce((a, b) => (b.sh * (100 - b.low) > a.sh * (100 - a.low) ? b : a));
  it.level = best.low < 50 ? 3 : 2;
  it.peak = best.t; it.start = hits[0].t; it.end = hits[hits.length - 1].t;
  it.dir = (best.az + 180) % 360;
  it.extra = { top: 42 - best.alt, hours: hits.length };
  return it;
}

// 星空・天の川：天文薄明の終わり（太陽 -18°）以降、月が沈んでいるか細いとき、雲が少ない時間
// 月明かりの空の明るさ（Krisciunas & Schaefer 1991, PASP 103:1033。誤差 8〜23%）と
// 肉眼の限界等級（Schaefer 1990 系の換算）。天頂の空で計算。k は大気の減光係数（等級/エアマス）。
// 光害はまだ入れていない（自然の夜空 21.6 等/平方秒角を基準）＝実際の街中では暗く出る。
export function nightSky(lat: number, lon: number, t: Date, k = 0.2) {
  const rad = Math.PI / 180;
  const mp = moonPos(lat, lon, t);
  const nl = (v: number) => 34.08 * Math.exp(20.7233 - 0.92104 * v);
  const B0 = nl(21.6);
  let Bm = 0;
  if (mp.alt > 0) {
    const a = Math.acos(Math.max(-1, Math.min(1, 2 * mp.frac - 1))) / rad; // 位相角（満月 0°）
    const rho = 90 - mp.alt; // 月と天頂の離角
    const X = (z: number) => 1 / Math.sqrt(1 - 0.96 * Math.sin(z * rad) ** 2);
    const I = Math.pow(10, -0.4 * (3.84 + 0.026 * a + 4e-9 * a ** 4));
    const f = Math.pow(10, 5.36) * (1.06 + Math.cos(rho * rad) ** 2) + Math.pow(10, 6.15 - Math.max(rho, 10) / 40);
    Bm = f * I * Math.pow(10, -0.4 * k * X(90 - mp.alt)) * (1 - Math.pow(10, -0.4 * k * X(0)));
  }
  const sb = (20.7233 - Math.log((B0 + Bm) / 34.08)) / 0.92104; // 等/平方秒角
  const nelm = 7.93 - 5 * Math.log10(Math.pow(10, 4.316 - sb / 5) + 1);
  return { sb: Math.round(sb * 100) / 100, nelm: Math.round(nelm * 10) / 10, moonAlt: mp.alt, moonFrac: mp.frac };
}

export function stars(lat: number, lon: number, w: SkyData['weather'], now: Date) {
  const res: { t: Date; cloud: number | null; moonUp: boolean; moonFrac: number }[] = [];
  for (let k = 0; k < 30; k++) {
    const t = new Date(Math.ceil(now.getTime() / 3600e3) * 3600e3 + k * 3600e3);
    if (sunPos(lat, lon, t).alt > -18) continue;
    const mp = moonPos(lat, lon, t);
    const h = hourAt(w, t);
    res.push({ t, cloud: h ? m(h.cloud_cover) : null, moonUp: mp.alt > 0, moonFrac: mp.frac });
  }
  const score = (r: (typeof res)[0]) => (r.cloud == null ? -1 : r.cloud < 20 ? 3 : r.cloud < 50 ? 2 : 1);
  const night = res.filter((r) => r.t.getTime() < now.getTime() + 20 * 3600e3);
  const star: Item = { key: 'stars', level: -1, exp: false, facts: [] };
  const milky: Item = { key: 'milkyway', level: -1, exp: false, facts: [] };
  if (!night.length) { star.level = 0; milky.level = 0; return [star, milky]; }
  const good = night.filter((r) => score(r) >= 2);
  const bestS = night.reduce((a, b) => (score(b) > score(a) ? b : a));
  star.level = score(bestS) as Level; star.peak = bestS.t;
  if (good.length) { star.start = good[0].t; star.end = new Date(good[good.length - 1].t.getTime() + 3600e3); }
  star.extra = { cloud: bestS.cloud, nightHours: night.length, ...(() => { const n = nightSky(lat, lon, bestS.t); return { nelm: n.nelm, sb: n.sb }; })() };
  const dark = night.filter((r) => !r.moonUp || r.moonFrac < 0.15);
  if (!dark.length) { milky.level = 0; milky.extra = { reason: 'moon' }; }
  else {
    const bm = dark.reduce((a, b) => (score(b) > score(a) ? b : a));
    milky.level = score(bm) as Level; milky.peak = bm.t; milky.extra = { cloud: bm.cloud };
    const g = dark.filter((r) => score(r) >= 2);
    if (g.length) { milky.start = g[0].t; milky.end = new Date(g[g.length - 1].t.getTime() + 3600e3); }
  }
  return [star, milky];
}

// オーロラ：今（OVATION は 30〜90 分先までの短時間予報）＋ 今夜の雲・暗さ・Kp 予報
export function aurora(lat: number, lon: number, d: SkyData, now: Date): Item {
  const it: Item = { key: 'aurora', level: -1, exp: false, facts: [] };
  const a = d.aurora;
  const darkNow = sunPos(lat, lon, now).alt < -10;
  const h = hourAt(d.weather, now);
  const cloud = h ? m(h.cloud_cover) : null;
  const tonightKp = (d.kp_forecast || []).filter((k) => Date.parse(k.t) >= now.getTime() - 3 * 3600e3 && Date.parse(k.t) <= now.getTime() + 24 * 3600e3);
  const maxKp = tonightKp.length ? Math.max(...tonightKp.map((k) => k.kp)) : null;
  it.extra = { ovation: a?.visible_max ?? null, overhead: a?.overhead ?? null, km: a?.visible_km, cloud, darkNow, maxKp, valid: a?.valid };
  if (!a) return it;
  it.dir = a.visible_dir ?? undefined;
  if (!darkNow) { it.level = 1; it.extra.waitDark = true; }
  else if (a.visible_max >= 30) it.level = 3;
  else if (a.visible_max >= 10) it.level = 2;
  else if (a.visible_max >= 3) it.level = 1;
  else it.level = 0;
  if (darkNow && it.level > 0 && cloud != null) { if (cloud >= 80) it.level = 1; else if (cloud >= 50 && it.level > 1) it.level = (it.level - 1) as Level; }
  // 次に暗くなる時刻
  if (!darkNow) { const t = crossing(lat, lon, -1, now, -10); if (t) it.start = t; }
  return it;
}

// 月：月齢、次の満月・新月、スーパームーン（満月の地心距離 36 万 km 未満を目安とする。定義は団体により異なる）
export function moonInfo(lat: number, lon: number, now: Date) {
  const mp = moonPos(lat, lon, now);
  const full = A.SearchMoonPhase(180, now, 40)!.date, nw = A.SearchMoonPhase(0, now, 40)!.date;
  const dist = (t: Date) => A.GeoMoon(t).Length() * A.KM_PER_AU;
  const fulls: { t: Date; km: number }[] = [];
  let t = now;
  for (let i = 0; i < 14; i++) { const f = A.SearchMoonPhase(180, t, 40)!.date; fulls.push({ t: f, km: dist(f) }); t = new Date(f.getTime() + 5 * 86400e3); }
  const rise = A.SearchRiseSet(A.Body.Moon, obsOf(lat, lon), 1, now, 1.5)?.date ?? null;
  return { ...mp, full, newMoon: nw, fullKm: dist(full), supermoons: fulls.filter((f) => f.km < 360000), rise };
}

// 流星群：極大は太陽黄経で決まる（IMO 流星群カレンダーの値, J2000）。日付は毎年この計算で出す
export const SHOWERS = [
  { id: 'QUA', ja: 'しぶんぎ座流星群', en: 'Quadrantids', lam: 283.15, zhr: 80, ra: 230, dec: 49.5 },
  { id: 'LYR', ja: 'こと座流星群', en: 'Lyrids', lam: 32.32, zhr: 18, ra: 271, dec: 34 },
  { id: 'ETA', ja: 'みずがめ座η流星群', en: 'Eta Aquariids', lam: 45.5, zhr: 50, ra: 338, dec: -1 },
  { id: 'PER', ja: 'ペルセウス座流星群', en: 'Perseids', lam: 140.0, zhr: 100, ra: 48, dec: 58 },
  { id: 'ORI', ja: 'オリオン座流星群', en: 'Orionids', lam: 208, zhr: 20, ra: 95, dec: 16 },
  { id: 'LEO', ja: 'しし座流星群', en: 'Leonids', lam: 235.27, zhr: 15, ra: 152, dec: 22 },
  { id: 'GEM', ja: 'ふたご座流星群', en: 'Geminids', lam: 262.2, zhr: 150, ra: 112, dec: 33 },
  { id: 'URS', ja: 'こぐま座流星群', en: 'Ursids', lam: 270.7, zhr: 10, ra: 217, dec: 75 },
];
export function meteorShowers(lat: number, lon: number, now: Date) {
  const o = obsOf(lat, lon);
  return SHOWERS.map((s) => {
    // SearchSunLongitude は開始日が目標の直前だと見落とすことがあるため、40 日前から探して、過ぎていれば翌年を探す
    let peak = A.SearchSunLongitude(s.lam, new Date(now.getTime() - 40 * 86400e3), 370)!.date;
    if (peak.getTime() < now.getTime() - 2 * 86400e3) peak = A.SearchSunLongitude(s.lam, new Date(peak.getTime() + 300 * 86400e3), 120)!.date;
    // 極大の夜の、放射点が最も高い時刻（暗い時間のうち）と、そのときの月
    let best = { t: peak, alt: -90 };
    for (let k = -14; k <= 14; k++) {
      const t = new Date(peak.getTime() + k * 3600e3);
      if (sunPos(lat, lon, t).alt > -12) continue;
      const hz = A.Horizon(t, o, s.ra / 15, s.dec, 'normal');
      if (hz.altitude > best.alt) best = { t, alt: hz.altitude };
    }
    const mp = moonPos(lat, lon, best.t);
    // 見える数の目安：ZHR × sin(放射点高度)（限界等級 6.5 等の空での理論値。街明かり・月明かりで減る）
    const rate = best.alt > 0 ? Math.round(s.zhr * Math.sin((best.alt * Math.PI) / 180)) : 0;
    return { ...s, peak, best: best.t, radiantAlt: best.alt, rate, moonFrac: mp.frac, moonUp: mp.alt > 0 };
  }).sort((a, b) => a.peak.getTime() - b.peak.getTime());
}

// 日食・月食（この先 3 年）
export function eclipses(lat: number, lon: number, now: Date) {
  const out: { kind: 'lunar' | 'solar'; type: string; peak: Date; visible: boolean; obscuration?: number; alt?: number }[] = [];
  const until = now.getTime() + 3 * 365 * 86400e3;
  let le = A.SearchLunarEclipse(now);
  while (le.peak.date.getTime() < until) {
    const mp = moonPos(lat, lon, le.peak.date);
    if (le.kind !== 'penumbral') out.push({ kind: 'lunar', type: le.kind, peak: le.peak.date, visible: mp.alt > 0, alt: mp.alt });
    le = A.NextLunarEclipse(le.peak);
  }
  let se = A.SearchLocalSolarEclipse(now, obsOf(lat, lon));
  while (se.peak.time.date.getTime() < until) {
    out.push({ kind: 'solar', type: se.kind, peak: se.peak.time.date, visible: se.peak.altitude > 0, obscuration: se.obscuration, alt: se.peak.altitude });
    se = A.NextLocalSolarEclipse(se.peak.time, obsOf(lat, lon));
  }
  return out.sort((a, b) => a.peak.getTime() - b.peak.getTime());
}

export function today(lat: number, lon: number, d: SkyData, now = new Date()) {
  const items: Item[] = [];
  const ss = glow('sunset', lat, lon, d.weather, now); if (ss) items.push(ss);
  items.push(rainbow(lat, lon, d.weather, now));
  items.push(...stars(lat, lon, d.weather, now));
  items.push(aurora(lat, lon, d, now));
  const sr = glow('sunrise', lat, lon, d.weather, now); if (sr) items.push(sr);
  return items;
}

export function compass(deg: number | undefined, ja: boolean) {
  if (deg == null) return '';
  const J = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'], E = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return (ja ? J : E)[Math.round(deg / 45) % 8];
}

// ---- 確率と内訳を付ける（判定の後段）。exp（研究段階）のものは推定式で、信頼度は低
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export function withProb(items: Item[], lat: number, lon: number, d: SkyData, now = new Date()): Item[] {
  const cal = d.calibration ?? null;
  for (const it of items) {
    const at = it.peak || it.start;
    if (!at) { it.p = it.level === 0 ? 0 : null; it.conf = 'low'; it.factors = []; continue; }
    const h = hourAt(d.weather, at);
    const leadH = Math.max(0, (at.getTime() - now.getTime()) / 3600e3);
    const cloud = h ? m(h.cloud_cover) : null;
    const pc = pClear(cloud, leadH, cal);
    const confOf = (base: Conf): Conf => (pc.calibrated ? base : 'low');
    const F: Factor[] = [];
    if (pc.p != null) F.push({ key: 'clear', v: pc.p });
    switch (it.key) {
      case 'stars':
        it.p = pc.p; it.conf = confOf('mid');
        F.push({ key: 'dark', v: 1 });
        break;
      case 'milkyway': {
        if (it.level === 0) { it.p = 0; it.conf = 'mid'; break; }
        const mp = moonPos(lat, lon, at);
        const moonDark = mp.alt <= 0 ? 1 : 1 - mp.frac;
        F.push({ key: 'dark', v: 1 }, { key: 'moon', v: moonDark });
        it.p = pc.p; it.conf = confOf('mid');
        break;
      }
      case 'goldenhour': case 'bluehour':
        it.p = pc.p; it.conf = confOf('mid');
        break;
      case 'aurora': {
        const a = d.aurora;
        const ov = a ? a.visible_max / 100 : 0; // NOAA OVATION の値（その場所でオーロラが出る確率として配信される値）
        const dark = it.extra?.darkNow ? 1 : 0;
        F.push({ key: 'aurora', v: ov }, { key: 'dark', v: dark });
        it.p = pc.p == null ? null : ov * pc.p * (dark || 1); // 明るい時間は「暗くなったら」の見込みとして出す
        it.conf = pc.calibrated ? 'mid' : 'low';
        break;
      }
      case 'sunset': case 'sunrise': {
        const x = it.extra || {};
        if (x.low == null) { it.p = null; it.conf = 'low'; break; }
        const lowOK = 1 - x.low / 100, upper = Math.max(x.mid, x.high) / 100, dry = 1 - clamp01(x.pr);
        const canvas = 1 - Math.abs(upper - 0.5) / 0.5; // 中・上層の雲が半分くらいのとき最も色づきやすいとする（研究段階の仮定）
        F.push({ key: 'lowcloud', v: lowOK }, { key: 'canvas', v: canvas });
        it.p = clamp01(lowOK * (0.25 + 0.75 * canvas) * dry); it.conf = 'low';
        break;
      }
      case 'rainbow': {
        if (it.level === 0 || !h) { it.p = it.level === 0 ? 0.02 : null; it.conf = 'low'; break; }
        const sh = Math.max(m(h.showers) ?? 0, m(h.precipitation) ?? 0), low = m(h.cloud_cover_low) ?? 100;
        const pShower = clamp01(sh / 0.5), pSun = 1 - low / 100;
        F.push({ key: 'shower', v: pShower }, { key: 'sun', v: pSun });
        it.p = clamp01(pShower * pSun); it.conf = 'low';
        break;
      }
      default:
        it.p = pc.p; it.conf = confOf('mid');
    }
    it.factors = F;
  }
  return items;
}
