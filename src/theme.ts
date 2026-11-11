// 色・影・共通の小さな関数（落ち着いた紙の白＋墨色＋ひとつだけのアクセント）
const LIGHT = {
  bg: '#F4F3EF',
  card: '#FFFFFF',
  ink: '#15171C',
  sub: '#8C9099',
  pink: '#FF5B3A', // アクセント
  pinkSoft: '#FFE9E3',
  mint: '#1F9D74',
  mintSoft: '#E3F3EC',
  yellow: '#F2C94C',
  line: '#E8E5DF',
  chip: '#F1EFEA',
  onInk: '#FFFFFF', // C.ink の上に置く文字の色
  night: '#15171C', // いつも暗い札（搭乗券・合計・思い出）
};
const DARK: typeof LIGHT = {
  bg: '#0F1013',
  card: '#1B1D22',
  ink: '#F2F1EC',
  sub: '#8E929B',
  pink: '#FF6A4D',
  pinkSoft: '#3A211B',
  mint: '#3CC594',
  mintSoft: '#16302A',
  yellow: '#F2C94C',
  line: '#2C2F36',
  chip: '#24272D',
  onInk: '#15171C',
  night: '#24262D',
};
/** 今の色（ダークモードの切り替えで中身を入れ替える） */
export const C = { ...LIGHT };
let dark = false;
export const isDark = () => dark;
export function applyTheme(d: boolean) {
  dark = d;
  Object.assign(C, d ? DARK : LIGHT);
}

export const shadow = {
  shadowColor: '#1B1B1B',
  shadowOpacity: 0.06,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
};

export const cleanNum = (t: string, decimals: number) => {
  let v = t.replace(decimals > 0 ? /[^0-9.]/g : /[^0-9]/g, '');
  const i = v.indexOf('.');
  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, decimals);
  return v;
};
