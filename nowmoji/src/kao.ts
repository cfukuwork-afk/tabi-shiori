// 気分（顔文字とキャラの絵）
export const MOOD_IDS = ['sleepy', 'miss', 'work', 'eat', 'move', 'free', 'down', 'happy'] as const;
export type MoodId = (typeof MOOD_IDS)[number];
export const KAO: Record<MoodId, string> = {
  sleepy: '(´-ω-`)zz',
  miss: '(っ´ω`c)♡',
  work: '(ง`ω´)ง',
  eat: '(*´ч`*)',
  move: 'ε=┌(・_・)┘',
  free: '(´ー`)',
  down: '(´・ω・`)',
  happy: '(*´▽`*)',
};
/* eslint-disable @typescript-eslint/no-var-requires */
export const ART: Record<MoodId, number> = {
  sleepy: require('../assets/m/sleepy.png'),
  miss: require('../assets/m/miss.png'),
  work: require('../assets/m/work.png'),
  eat: require('../assets/m/eat.png'),
  move: require('../assets/m/move.png'),
  free: require('../assets/m/free.png'),
  down: require('../assets/m/down.png'),
  happy: require('../assets/m/happy.png'),
};
// 顔文字の並びが右から左に入れ替わらないように（アラビア文字などが混ざっても）
export const ltr = (s: string) => '‭' + s + '‬';
// 人の色を薄くした背景色
export function tint(hex: string, a = 0.17) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#F3ECE2';
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c * a + 255 * (1 - a));
  const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// 顔文字が枠に収まる文字の大きさ（全角は1文字ぶん、半角は0.62文字ぶんとして見積もる）
const WIDE = /[ᄀ-ᅟ←-⇿①-➿─-╿☀-⛿⺀-鿿가-힣豈-﫿︰-﹏＀-｠￠-￦∀-⋿■-◿♠-♧]/;
export function fitFont(s: string, width: number, max: number, min = 7) {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) || ch.codePointAt(0)! > 0xffff ? 1 : 0.62;
  if (!w) return max;
  return Math.max(min, Math.min(max, Math.floor(((width * 0.94) / w) * 2) / 2));
}
