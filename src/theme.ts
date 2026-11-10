// 色・影・共通の小さな関数（落ち着いた紙の白＋墨色＋ひとつだけのアクセント）
export const C = {
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
};

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
