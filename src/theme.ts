// 色・影・共通の小さな関数
export const C = {
  bg: '#FFF7EE',
  card: '#FFFFFF',
  ink: '#3D2C3E',
  sub: '#9A8A99',
  pink: '#FF7FA3',
  pinkSoft: '#FFE3EC',
  mint: '#5CC9A7',
  mintSoft: '#DDF6EE',
  yellow: '#FFD36E',
  line: '#F2E6DD',
};

export const shadow = {
  shadowColor: '#C9A99B',
  shadowOpacity: 0.18,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

export const cleanNum = (t: string, decimals: number) => {
  let v = t.replace(decimals > 0 ? /[^0-9.]/g : /[^0-9]/g, '');
  const i = v.indexOf('.');
  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, decimals);
  return v;
};
