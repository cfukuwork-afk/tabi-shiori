import { getLang } from './i18n';

export type Currency = { code: string; name: string; flag: string; symbol: string; decimals: number };

/** 留学・ワーホリでよく使う通貨。並び順はピッカーの表示順。 */
export const CURRENCIES: Currency[] = [
  { code: 'JPY', name: '日本円', flag: '🇯🇵', symbol: '¥', decimals: 0 },
  { code: 'GBP', name: 'イギリス ポンド', flag: '🇬🇧', symbol: '£', decimals: 2 },
  { code: 'USD', name: 'アメリカ ドル', flag: '🇺🇸', symbol: 'US$', decimals: 2 },
  { code: 'EUR', name: 'ユーロ', flag: '🇪🇺', symbol: '€', decimals: 2 },
  { code: 'AUD', name: 'オーストラリア ドル', flag: '🇦🇺', symbol: 'A$', decimals: 2 },
  { code: 'CAD', name: 'カナダ ドル', flag: '🇨🇦', symbol: 'C$', decimals: 2 },
  { code: 'NZD', name: 'ニュージーランド ドル', flag: '🇳🇿', symbol: 'NZ$', decimals: 2 },
  { code: 'KRW', name: '韓国 ウォン', flag: '🇰🇷', symbol: '₩', decimals: 0 },
  { code: 'CNY', name: '中国 人民元', flag: '🇨🇳', symbol: '元', decimals: 2 },
  { code: 'TWD', name: '台湾 ドル', flag: '🇹🇼', symbol: 'NT$', decimals: 0 },
  { code: 'HKD', name: '香港 ドル', flag: '🇭🇰', symbol: 'HK$', decimals: 2 },
  { code: 'SGD', name: 'シンガポール ドル', flag: '🇸🇬', symbol: 'S$', decimals: 2 },
  { code: 'THB', name: 'タイ バーツ', flag: '🇹🇭', symbol: '฿', decimals: 2 },
  { code: 'PHP', name: 'フィリピン ペソ', flag: '🇵🇭', symbol: '₱', decimals: 2 },
  { code: 'MYR', name: 'マレーシア リンギット', flag: '🇲🇾', symbol: 'RM', decimals: 2 },
  { code: 'IDR', name: 'インドネシア ルピア', flag: '🇮🇩', symbol: 'Rp', decimals: 0 },
  { code: 'VND', name: 'ベトナム ドン', flag: '🇻🇳', symbol: '₫', decimals: 0 },
  { code: 'INR', name: 'インド ルピー', flag: '🇮🇳', symbol: '₹', decimals: 2 },
  { code: 'CHF', name: 'スイス フラン', flag: '🇨🇭', symbol: 'CHF ', decimals: 2 },
  { code: 'SEK', name: 'スウェーデン クローナ', flag: '🇸🇪', symbol: 'kr ', decimals: 2 },
  { code: 'NOK', name: 'ノルウェー クローネ', flag: '🇳🇴', symbol: 'kr ', decimals: 2 },
  { code: 'DKK', name: 'デンマーク クローネ', flag: '🇩🇰', symbol: 'kr ', decimals: 2 },
  { code: 'ISK', name: 'アイスランド クローナ', flag: '🇮🇸', symbol: 'kr ', decimals: 0 },
  { code: 'PLN', name: 'ポーランド ズウォティ', flag: '🇵🇱', symbol: 'zł ', decimals: 2 },
  { code: 'CZK', name: 'チェコ コルナ', flag: '🇨🇿', symbol: 'Kč ', decimals: 2 },
  { code: 'HUF', name: 'ハンガリー フォリント', flag: '🇭🇺', symbol: 'Ft ', decimals: 0 },
  { code: 'TRY', name: 'トルコ リラ', flag: '🇹🇷', symbol: '₺', decimals: 2 },
  { code: 'AED', name: 'UAE ディルハム', flag: '🇦🇪', symbol: 'AED ', decimals: 2 },
  { code: 'ILS', name: 'イスラエル シェケル', flag: '🇮🇱', symbol: '₪', decimals: 2 },
  { code: 'ZAR', name: '南アフリカ ランド', flag: '🇿🇦', symbol: 'R ', decimals: 2 },
  { code: 'MXN', name: 'メキシコ ペソ', flag: '🇲🇽', symbol: 'MX$', decimals: 2 },
  { code: 'BRL', name: 'ブラジル レアル', flag: '🇧🇷', symbol: 'R$', decimals: 2 },
  { code: 'ARS', name: 'アルゼンチン ペソ', flag: '🇦🇷', symbol: 'AR$', decimals: 2 },
  { code: 'QAR', name: 'カタール リヤル', flag: '🇶🇦', symbol: 'QAR ', decimals: 2 },
  { code: 'SAR', name: 'サウジ リヤル', flag: '🇸🇦', symbol: 'SAR ', decimals: 2 },
  { code: 'CLP', name: 'チリ ペソ', flag: '🇨🇱', symbol: 'CLP$', decimals: 0 },
];

export const findCurrency = (code: string): Currency =>
  CURRENCIES.find((c) => c.code === code) ?? { code, name: code, flag: '🏳️', symbol: code + ' ', decimals: 2 };

/**
 * 通信できないとき用の「1米ドルあたり」のおおよその値。
 * 起動時にネットから最新レートを取れればそちらで上書きされる。
 */
export const FALLBACK_PER_USD: Record<string, number> = {
  USD: 1, QAR: 3.64, SAR: 3.75, JPY: 150, GBP: 0.77, EUR: 0.88, AUD: 1.52, CAD: 1.38, NZD: 1.68, KRW: 1380, CNY: 7.2,
  TWD: 31, HKD: 7.8, SGD: 1.32, THB: 33, PHP: 57, MYR: 4.3, IDR: 16300, VND: 26000, INR: 85,
  CHF: 0.82, SEK: 9.6, NOK: 10.2, DKK: 6.6, ISK: 125, PLN: 3.8, CZK: 22, HUF: 360, TRY: 40,
  AED: 3.67, ILS: 3.6, ZAR: 18, MXN: 18.5, BRL: 5.5, ARS: 1200, CLP: 950,
};

const EN_NAMES: Record<string, string> = {"JPY": "Japanese Yen", "GBP": "British Pound", "USD": "US Dollar", "EUR": "Euro", "AUD": "Australian Dollar", "CAD": "Canadian Dollar", "NZD": "New Zealand Dollar", "KRW": "Korean Won", "CNY": "Chinese Yuan", "TWD": "Taiwan Dollar", "HKD": "Hong Kong Dollar", "SGD": "Singapore Dollar", "THB": "Thai Baht", "PHP": "Philippine Peso", "MYR": "Malaysian Ringgit", "IDR": "Indonesian Rupiah", "VND": "Vietnamese Dong", "INR": "Indian Rupee", "CHF": "Swiss Franc", "SEK": "Swedish Krona", "NOK": "Norwegian Krone", "DKK": "Danish Krone", "ISK": "Icelandic Króna", "PLN": "Polish Złoty", "CZK": "Czech Koruna", "HUF": "Hungarian Forint", "TRY": "Turkish Lira", "AED": "UAE Dirham", "ILS": "Israeli Shekel", "ZAR": "South African Rand", "MXN": "Mexican Peso", "BRL": "Brazilian Real", "ARS": "Argentine Peso", "CLP": "Chilean Peso"};

/** 画面の言語に合わせた通貨名（日本語は手作り、英語は一覧、韓国語・中国語は端末の機能で） */
export function currencyName(code: string): string {
  const lang = getLang();
  if (lang === 'ja') return findCurrency(code).name;
  if (lang !== 'en') {
    try {
      const dn = new (Intl as any).DisplayNames([lang === 'zh' ? 'zh-Hans' : lang], { type: 'currency' });
      const n = dn.of(code);
      if (n && n !== code) return n;
    } catch {}
  }
  return EN_NAMES[code] ?? code;
}

/** 国名で通貨を探すための言葉（日本語・英語） */
export const CUR_COUNTRIES: Record<string, string> = {
  JPY: '日本 japan',
  GBP: 'イギリス 英国 ロンドン スコットランド uk united kingdom britain england scotland london',
  USD: 'アメリカ 米国 ハワイ グアム usa united states america hawaii guam エクアドル パナマ',
  EUR: 'ユーロ ヨーロッパ ドイツ フランス イタリア スペイン オランダ ベルギー オーストリア ポルトガル アイルランド フィンランド ギリシャ クロアチア スロバキア スロベニア エストニア ラトビア リトアニア ルクセンブルク マルタ キプロス モナコ euro europe germany france italy spain netherlands belgium austria portugal ireland finland greece croatia paris rome',
  AUD: 'オーストラリア australia シドニー',
  CAD: 'カナダ canada',
  NZD: 'ニュージーランド new zealand',
  KRW: '韓国 ソウル korea seoul',
  CNY: '中国 china 上海 北京',
  TWD: '台湾 taiwan 台北',
  HKD: '香港 hong kong',
  SGD: 'シンガポール singapore',
  THB: 'タイ thailand バンコク',
  PHP: 'フィリピン philippines セブ',
  MYR: 'マレーシア malaysia',
  IDR: 'インドネシア indonesia バリ bali',
  VND: 'ベトナム vietnam',
  INR: 'インド india',
  CHF: 'スイス switzerland リヒテンシュタイン',
  SEK: 'スウェーデン sweden',
  NOK: 'ノルウェー norway',
  DKK: 'デンマーク denmark',
  ISK: 'アイスランド iceland',
  PLN: 'ポーランド poland',
  CZK: 'チェコ czech プラハ',
  HUF: 'ハンガリー hungary',
  TRY: 'トルコ turkey türkiye イスタンブール',
  AED: 'アラブ首長国連邦 ドバイ uae dubai abu dhabi',
  ILS: 'イスラエル israel',
  ZAR: '南アフリカ south africa',
  MXN: 'メキシコ mexico',
  BRL: 'ブラジル brazil',
  ARS: 'アルゼンチン argentina',
  QAR: 'カタール qatar ドーハ',
  SAR: 'サウジアラビア saudi arabia',
  CLP: 'チリ chile',
};
