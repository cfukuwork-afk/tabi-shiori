import { getLocales } from 'expo-localization';
import { OTHER } from './locales';

export type Lang = 'ja' | 'en' | 'ko' | 'zh-Hans' | 'zh-Hant' | 'es' | 'fr' | 'de' | 'it' | 'pt';
/** 選べる言語（その言語での名前） */
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'ja', name: '日本語' }, { id: 'en', name: 'English' }, { id: 'ko', name: '한국어' }, { id: 'zh-Hans', name: '简体中文' }, { id: 'zh-Hant', name: '繁體中文' },
  { id: 'es', name: 'Español' }, { id: 'fr', name: 'Français' }, { id: 'de', name: 'Deutsch' }, { id: 'it', name: 'Italiano' }, { id: 'pt', name: 'Português' },
];
/** 端末の言語から選ぶ（ないときは英語） */
export function detectLang(): Lang {
  try {
    const g = getLocales()[0];
    const l = (g?.languageTag || g?.languageCode || 'en').toLowerCase();
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('ko')) return 'ko';
    if (l.startsWith('zh')) return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
    for (const x of ['es', 'fr', 'de', 'it', 'pt'] as const) if (l.startsWith(x)) return x;
  } catch {}
  return 'en';
}
/** 日付・数字の書き方に使うロケール */
export const localeOf = (l: Lang) => (l === 'zh-Hans' ? 'zh-CN' : l === 'zh-Hant' ? 'zh-TW' : l === 'pt' ? 'pt-BR' : l === 'ja' ? 'ja-JP' : l);
/** サーバーへ渡す言語（地名検索・通知文） */
export const apiLang = () => (lang === 'zh-Hans' || lang === 'zh-Hant' ? 'zh' : lang);

const J = {
  home: 'ホーム', reportTab: '報告', recTime: 'おすすめの時間', direction: '方向', condition: '観測条件', prob: (n: string) => `${n}の可能性`,
  startT: '予想開始', peakT: 'ピーク', endT: '終了', viewDir: '観測方向', breakdown: '予測の内訳',
  conf: { high: '信頼度 高', mid: '信頼度 中', low: '信頼度 低' } as Record<string, string>,
  factor: { clear: '晴れ間', dark: '空の暗さ', moon: '月明かりの影響の少なさ', aurora: 'オーロラの強さ（NOAA）', lowcloud: '地平線付近の低い雲の少なさ', canvas: '色づく中・上層の雲', shower: 'にわか雨', sun: '日差し' } as Record<string, string>,
  probNote: '晴れ間の確率は、過去2年半の予報と空港の観測を照らし合わせて較正しています。',
  probNoteExp: 'この確率は研究段階の推定です。皆さんの報告で較正していきます。',
  probNoteRaw: '較正前の推定です（雲量から計算）。',
  reportPrompt: '空で見たもの・見えなかったものを報告してください。予報の精度を上げるために使います。',
  myReports: 'これまでの報告', noReports: 'まだ報告はありません',
  hourly: '時間ごとの晴れ間の確率', close: '閉じる', tonightChance: '今夜のチャンス',
  outcomeName: { seen: '見えた', looked_not_seen: '見えなかった', clouded: '雲で見えず', not_observed: '観測せず' } as Record<string, string>,
  monthTitle: (y: number, m: number) => `${y}年${m}月`, weekdays: ['月', '火', '水', '木', '金', '土', '日'],
  evMeteor: '流星群（極大）', evFull: '満月', evNew: '新月', evSuper: 'スーパームーン', evEclipse: '食',
  pct: (p: number) => `${Math.round(p * 100)}%`,
  today: '今日の空', pick: '今日のおすすめ', changePlace: '場所を変える', useHere: '現在地を使う', searchCity: '都市名で探す', search: '検索', noResults: '見つかりませんでした', calendar: 'カレンダー', settings: '設定',
  locating: '現在地を確認しています…', noLoc: '位置情報が使えません。設定から許可してください。', retry: 'もう一度',
  loading: '空の予報を読み込んでいます…', offline: '予報を取得できませんでした。通信状態を確認してください。',
  exp: '研究段階', expNote: '研究段階の予測で、信頼度は高くありません。報告で精度を確かめています',
  lv: { '3': '良い', '2': 'まあまあ', '1': '見込み薄', '0': '見えない', '-1': 'データなし' } as Record<string, string>,
  names: { sunset: '夕焼け', sunrise: '朝焼け', rainbow: '虹', stars: '星空', milkyway: '天の川', aurora: 'オーロラ', goldenhour: 'ゴールデンアワー', bluehour: 'ブルーアワー', meteor: '流星群', moon: '月', doublerainbow: '二重の虹', halo: '日暈・月暈', other: 'その他' } as Record<string, string>,
  dirSky: (d: string) => `${d}の空`,
  report: '報告', seen: '見えた', lookedNot: '空を見たが見えなかった', clouded: '雲に遮られて見えなかった', notObserved: '観測していない', beauty: '美しさ', thanksNo: '記録しました。ありがとうございます。', thanks: '報告ありがとうございます。予報の改善に使います。',
  reportTitle: (n: string) => `${n}は見えましたか？`, strength: '強さ', weak: '弱い', mid: '普通', strong: '強い',
  cloud: '雲', low: '低い雲', midc: '中層の雲', high: '高い雲', rain: '雨',
  why: '根拠',
  now: '今', tonight: '今夜', tomorrow: '明日',
  noRainbow: 'この先36時間、虹の条件（太陽が42°より低く、にわか雨と日差しが重なる時間）はありません',
  rainbowAt: (dir: string, top: number) => `太陽と反対の${dir}の空、高さ約${Math.round(top)}°まで`,
  auroraNow: (v: number, d: string, km: number | null) => `NOAAのオーロラ予報値 ${v}（${d}の空${km ? `・約${km}km先` : ''}）`,
  auroraDay: '空が明るい時間です。暗くなるのは',
  afterDark: '暗くなってから',
  kp: (k: number) => `今後24時間のKp予報（最大）${k}`,
  auroraNote: 'オーロラの予報値はNOAA（米国海洋大気庁）の短時間予報（30〜90分先）です',
  sunsetWhy: (l: number, u: number) => `低い雲 ${Math.round(l)}%・中〜高い雲 ${Math.round(u)}%`,
  clearSky: '雲がほとんどなく、空の色は控えめになりそうです',
  milkyMoon: '月明かりが強く、天の川は見えにくい夜です',
  nelm: (m: number) => `いちばん良い時間なら、肉眼で約${m.toFixed(1)}等星まで見える計算です（街明かりのない場所の場合）`,
  lightNote: '街明かりは計算に入れていません。暗い場所ほどよく見えます',
  starsWhy: (c: number | null) => (c == null ? '' : `雲 ${Math.round(c)}%`),
  cloudRange: (a: number, b: number) => `（モデルの幅 ${Math.round(a)}〜${Math.round(b)}%）`,
  showers: '流星群', eclipses: '日食・月食', moonTitle: '月', fullMoon: '次の満月', newMoon: '次の新月', supermoon: 'スーパームーン',
  perHour: (n: number) => `1時間に約${n}個（暗い空での目安）`, moonLit: (p: number) => `月の明るさ ${p}%`,
  lunar: { total: '皆既月食', partial: '部分月食' } as Record<string, string>, solar: { total: '皆既日食', annular: '金環日食', partial: '部分日食' } as Record<string, string>,
  visibleHere: 'ここから見えます', notHere: 'ここからは見えません', obsc: (p: number) => `太陽が欠ける割合 ${p}%`,
  eclipseSafety: '日食は絶対に肉眼や普通のサングラスで太陽を見ないでください。日食グラスなど専用の道具を使ってください。',
  smNote: '地球から36万km未満の満月をスーパームーンとしています（定義は団体により異なります）',
  notif: '通知', auroraAlert: 'オーロラのチャンス', goldenAlert: 'ゴールデンアワーの始まり', starsAlert: '星空がきれいに見える夜', eventsAlert: '流星群・満月・日食・月食', sunsetAlert: 'きれいな夕焼けの見込み（研究段階）',
  deleteData: 'サーバー上のデータを削除', deleted: '削除しました',
  privacy: 'プライバシーポリシー', terms: '利用規約', support: 'サポート・ご意見',
  about: 'SkyLab は、気象モデル・宇宙天気・天文計算から「いま、ここから何が見えるか」を予測します。「実験中」の項目は、皆さんの報告で精度を確かめながら改善しています。',
  updated: (s: string) => `更新 ${s}`, place: '場所',
  goldenWhy: (c: number | null) => (c == null ? '' : `雲 ${Math.round(c)}%`),
  notifyGolden: (n: string) => `まもなく${n}です`, notifyGoldenBody: (s: string) => `夕焼けの条件：${s}`,
  language: '言語',
};
type T = typeof J;
const E: T = {
  home: 'Home', reportTab: 'Report', recTime: 'Best time', direction: 'Direction', condition: 'Conditions', prob: (n: string) => `Chance of ${n.toLowerCase()}`,
  startT: 'Starts', peakT: 'Peak', endT: 'Ends', viewDir: 'Look toward', breakdown: 'Breakdown',
  conf: { high: 'High confidence', mid: 'Medium confidence', low: 'Low confidence' },
  factor: { clear: 'Clear sky', dark: 'Darkness', moon: 'Low moonlight', aurora: 'Aurora strength (NOAA)', lowcloud: 'Few low clouds on the horizon', canvas: 'Mid/high clouds to light up', shower: 'Showers', sun: 'Sunshine' },
  probNote: 'Clear-sky chances are calibrated against 2.5 years of past forecasts and airport observations.',
  probNoteExp: 'This chance is a research-stage estimate. Your reports help calibrate it.',
  probNoteRaw: 'Uncalibrated estimate (from cloud cover).',
  reportPrompt: 'Tell us what you saw — or didn\'t. Every report improves the forecast.',
  myReports: 'Your reports', noReports: 'No reports yet',
  hourly: 'Hourly clear-sky chance', close: 'Close', tonightChance: "Tonight's chance",
  outcomeName: { seen: 'Seen', looked_not_seen: 'Not seen', clouded: 'Clouded out', not_observed: "Didn't look" },
  monthTitle: (y: number, m: number) => new Date(y, m - 1, 1).toLocaleDateString('en', { year: 'numeric', month: 'long' }), weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  evMeteor: 'Meteor shower peak', evFull: 'Full moon', evNew: 'New moon', evSuper: 'Supermoon', evEclipse: 'Eclipse',
  pct: (p: number) => `${Math.round(p * 100)}%`,
  today: "Today's sky", pick: "Today's pick", changePlace: 'Change place', useHere: 'Use my location', searchCity: 'Search a city', search: 'Search', noResults: 'No results', calendar: 'Calendar', settings: 'Settings',
  locating: 'Finding your location…', noLoc: 'Location is unavailable. Please allow it in Settings.', retry: 'Retry',
  loading: 'Loading the sky forecast…', offline: 'Could not load the forecast. Check your connection.',
  exp: 'Research', expNote: 'Research-stage forecast with limited reliability. Your reports help us validate it',
  lv: { '3': 'Good', '2': 'Fair', '1': 'Unlikely', '0': 'Not visible', '-1': 'No data' },
  names: { sunset: 'Sunset glow', sunrise: 'Sunrise glow', rainbow: 'Rainbow', stars: 'Stars', milkyway: 'Milky Way', aurora: 'Aurora', goldenhour: 'Golden hour', bluehour: 'Blue hour', meteor: 'Meteor shower', moon: 'Moon', doublerainbow: 'Double rainbow', halo: 'Halo', other: 'Other' },
  dirSky: (d: string) => `${d} sky`,
  report: 'Report', seen: 'I saw it', lookedNot: 'Looked, but not there', clouded: 'Blocked by clouds', notObserved: "Didn't look", beauty: 'Beauty', thanksNo: 'Noted — thank you.', thanks: 'Thank you! Your report helps improve the forecast.',
  reportTitle: (n: string) => `Did you see the ${n.toLowerCase()}?`, strength: 'Strength', weak: 'Faint', mid: 'Moderate', strong: 'Strong',
  cloud: 'Cloud', low: 'Low cloud', midc: 'Mid cloud', high: 'High cloud', rain: 'Rain',
  why: 'Why',
  now: 'Now', tonight: 'Tonight', tomorrow: 'Tomorrow',
  noRainbow: 'No rainbow conditions in the next 36 hours (sun below 42° with showers and sunshine together)',
  rainbowAt: (dir: string, top: number) => `Opposite the sun, in the ${dir} sky, up to about ${Math.round(top)}°`,
  auroraNow: (v: number, d: string, km: number | null) => `NOAA aurora value ${v} (${d} sky${km ? `, ~${km} km away` : ''})`,
  auroraDay: 'The sky is still bright. Dark from',
  afterDark: 'After dark',
  kp: (k: number) => `Max Kp forecast in the next 24 h: ${k}`,
  auroraNote: 'Aurora values come from the NOAA short-term forecast (30–90 minutes ahead)',
  sunsetWhy: (l: number, u: number) => `Low cloud ${Math.round(l)}% · mid/high cloud ${Math.round(u)}%`,
  clearSky: 'Almost cloudless — colours will be subtle',
  milkyMoon: 'Bright moonlight tonight — the Milky Way will be hard to see',
  nelm: (m: number) => `At the best hour, stars down to about magnitude ${m.toFixed(1)} should be visible to the naked eye (away from city lights)`,
  lightNote: 'City lights are not included. Darker places show more',
  starsWhy: (c: number | null) => (c == null ? '' : `Cloud ${Math.round(c)}%`),
  cloudRange: (a: number, b: number) => ` (models ${Math.round(a)}–${Math.round(b)}%)`,
  showers: 'Meteor showers', eclipses: 'Eclipses', moonTitle: 'Moon', fullMoon: 'Next full moon', newMoon: 'Next new moon', supermoon: 'Supermoon',
  perHour: (n: number) => `About ${n} per hour (dark sky estimate)`, moonLit: (p: number) => `Moon ${p}% lit`,
  lunar: { total: 'Total lunar eclipse', partial: 'Partial lunar eclipse' }, solar: { total: 'Total solar eclipse', annular: 'Annular solar eclipse', partial: 'Partial solar eclipse' },
  visibleHere: 'Visible from here', notHere: 'Not visible from here', obsc: (p: number) => `${p}% of the sun covered`,
  eclipseSafety: 'Never look at the sun during an eclipse with bare eyes or sunglasses. Use certified eclipse glasses.',
  smNote: 'Full moons closer than 360,000 km are shown as supermoons (definitions vary)',
  notif: 'Notifications', auroraAlert: 'Aurora chances', goldenAlert: 'Golden hour starting', starsAlert: 'Clear, dark nights for stars', eventsAlert: 'Meteor showers, full moons, eclipses', sunsetAlert: 'Promising sunset glow (research)',
  deleteData: 'Delete my data on the server', deleted: 'Deleted',
  privacy: 'Privacy policy', terms: 'Terms', support: 'Support & feedback',
  about: 'SkyLab forecasts what you can see from where you are, using weather models, space weather and astronomy. Items marked Experimental are being validated with your reports.',
  updated: (s: string) => `Updated ${s}`, place: 'Place',
  goldenWhy: (c: number | null) => (c == null ? '' : `Cloud ${Math.round(c)}%`),
  notifyGolden: (n: string) => `${n} soon`, notifyGoldenBody: (s: string) => `Sunset glow: ${s}`,
  language: 'Language',
};
export type { T };
const DICTS: Record<Lang, T> = { ja: J, en: E, ...OTHER } as Record<Lang, T>;
export let lang: Lang = detectLang();
export let ja = lang === 'ja';
export let t: T = DICTS[lang];
export function setLang(l: Lang) { lang = l; ja = l === 'ja'; t = DICTS[l] || E; }
const COMPASS: Record<Lang, string[]> = {
  ja: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'], en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  ko: ['북', '북동', '동', '남동', '남', '남서', '서', '북서'], 'zh-Hans': ['北', '东北', '东', '东南', '南', '西南', '西', '西北'], 'zh-Hant': ['北', '東北', '東', '東南', '南', '西南', '西', '西北'],
  es: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], de: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
  it: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], pt: ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'],
};
/** 方角（8方位）を今の言語で */
export const compassL = (deg: number | undefined) => (deg == null ? '' : COMPASS[lang][Math.round((((deg % 360) + 360) % 360) / 45) % 8]);
const SHOWERS: Record<string, Partial<Record<Lang, string>>> = {
  QUA: { ko: '사분의자리 유성우', 'zh-Hans': '象限仪座流星雨', 'zh-Hant': '象限儀座流星雨', es: 'Cuadrántidas', fr: 'Quadrantides', de: 'Quadrantiden', it: 'Quadrantidi', pt: 'Quadrântidas' },
  LYR: { ko: '거문고자리 유성우', 'zh-Hans': '天琴座流星雨', 'zh-Hant': '天琴座流星雨', es: 'Líridas', fr: 'Lyrides', de: 'Lyriden', it: 'Liridi', pt: 'Líridas' },
  ETA: { ko: '물병자리 에타 유성우', 'zh-Hans': '宝瓶座η流星雨', 'zh-Hant': '寶瓶座η流星雨', es: 'Eta Acuáridas', fr: 'Êta Aquarides', de: 'Eta-Aquariiden', it: 'Eta Aquaridi', pt: 'Eta Aquáridas' },
  PER: { ko: '페르세우스자리 유성우', 'zh-Hans': '英仙座流星雨', 'zh-Hant': '英仙座流星雨', es: 'Perseidas', fr: 'Perséides', de: 'Perseiden', it: 'Perseidi', pt: 'Perseidas' },
  ORI: { ko: '오리온자리 유성우', 'zh-Hans': '猎户座流星雨', 'zh-Hant': '獵戶座流星雨', es: 'Oriónidas', fr: 'Orionides', de: 'Orioniden', it: 'Orionidi', pt: 'Oriónidas' },
  LEO: { ko: '사자자리 유성우', 'zh-Hans': '狮子座流星雨', 'zh-Hant': '獅子座流星雨', es: 'Leónidas', fr: 'Léonides', de: 'Leoniden', it: 'Leonidi', pt: 'Leónidas' },
  GEM: { ko: '쌍둥이자리 유성우', 'zh-Hans': '双子座流星雨', 'zh-Hant': '雙子座流星雨', es: 'Gemínidas', fr: 'Géminides', de: 'Geminiden', it: 'Geminidi', pt: 'Geminídeas' },
  URS: { ko: '작은곰자리 유성우', 'zh-Hans': '小熊座流星雨', 'zh-Hant': '小熊座流星雨', es: 'Úrsidas', fr: 'Ursides', de: 'Ursiden', it: 'Ursidi', pt: 'Ursídeas' },
};
/** 流星群の名前を今の言語で */
export const showerName = (s: { id: string; ja: string; en: string }) => (lang === 'ja' ? s.ja : lang === 'en' ? s.en : SHOWERS[s.id]?.[lang] || s.en);
export const fmtTime = (d?: Date) => (d ? d.toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDay = (d: Date) => d.toLocaleDateString(localeOf(lang), { month: 'short', day: 'numeric', weekday: 'short' });
export const fmtDayTime = (d: Date) => `${fmtDay(d)} ${fmtTime(d)}`;
/** 区切り・範囲・かっこ（日本語・中国語は全角、ほかは半角） */
const wide = () => lang === 'ja' || lang === 'zh-Hans' || lang === 'zh-Hant';
export const DOT = () => (wide() ? ' ・ ' : ' · ');
export const rng = (a: string, b: string) => (lang === 'ja' ? `${a}〜${b}` : `${a}–${b}`);
export const par = (x: string) => (wide() ? `（${x}）` : ` (${x})`);
