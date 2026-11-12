// 都市の写真を Wikipedia の要約 API から取る（キー不要）。端末に保存して、2回目からは通信しない
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const mem: Record<string, string | null> = {};
const KEY = 'ts.cityphoto.v2:';

// 同じ名前の別の場所（曖昧さ回避ページ）や写真のない記事になる都市は、記事名を指定する（全520都市を検証済み）
// "ja:" で始まるものは日本語版の記事
export const WIKI_TITLE: Record<string, string> = {
  "Addu": "Addu Atoll",
  "Amboseli": "ja:アンボセリ国立公園",
  "Andasibe": "Andasibe-Mantadia National Park",
  "Ayutthaya": "Ayutthaya (city)",
  "Bali": "Pura Ulun Danu Bratan",
  "Banff": "Banff, Alberta",
  "Bath": "Bath, Somerset",
  "Baños": "Baños de Agua Santa",
  "Billund": "Legoland Billund Resort",
  "Blagaj": "Blagaj Tekke",
  "Bumthang": "Jakar Dzong",
  "Cartagena": "Cartagena, Colombia",
  "Chinatown Singapore": "Chinatown, Singapore",
  "Copacabana": "Copacabana, Bolivia",
  "Cork": "Cork (city)",
  "Cotai": "Cotai Strip",
  "Cuenca": "Cuenca, Ecuador",
  "Ella": "Ella, Sri Lanka",
  "Flores": "Flores, Petén",
  "Fontvieille": "Fontvieille, Monaco",
  "Gold Coast": "Gold Coast, Queensland",
  "Hoi An": "Hoi An Ancient Town",
  "Hong Kong": "Victoria Peak",
  "Hualien": "Hualien City",
  "Húsavík": "Húsavíkurkirkja",
  "Iguazú": "Iguazu Falls",
  "Isalo": "Isalo National Park",
  "Isle of Pines": "Isle of Pines (New Caledonia)",
  "Jeju": "Jeju Island",
  "Kingston": "Kingston, Jamaica",
  "Komodo": "Komodo (island)",
  "Kratovo": "Kratovo, North Macedonia",
  "Kruger": "Kruger National Park",
  "La Fortuna": "Arenal Volcano",
  "Lake Kivu": "Gisenyi",
  "Lantau Island": "Tian Tan Buddha",
  "Macau": "Ruins of St. Paul's",
  "Madeira": "Funchal",
  "Malacca": "Malacca City",
  "Manuel Antonio": "Manuel Antonio National Park",
  "Marina Bay": "Marina Bay, Singapore",
  "Mendoza": "Mendoza, Argentina",
  "Monaco": "Port Hercules",
  "Musanze": "Volcanoes National Park",
  "New York": "New York City",
  "Nosy Be": "Andoany",
  "Okinawa": "Okinawa Island",
  "Paro": "Paro Taktsang",
  "Penang": "George Town, Penang",
  "Phobjikha": "Phobjikha Valley",
  "Plitvice": "Plitvice Lakes National Park",
  "Queenstown": "Queenstown, New Zealand",
  "Ras Al Khaimah": "Jebel Jais",
  "Rothenburg": "Rothenburg ob der Tauber",
  "Sai Kung": "Sai Kung Town",
  "Saint-Louis": "Saint-Louis, Senegal",
  "Salento": "Salento, Quindío",
  "Salvador": "Salvador, Bahia",
  "Saly": "Mbour",
  "San José": "San José, Costa Rica",
  "Serengeti": "Serengeti National Park",
  "Sigulda": "Turaida Castle",
  "Singapore": "Marina Bay Sands",
  "Sossusvlei": "Deadvlei",
  "Split": "Split, Croatia",
  "Stanley": "Stanley, Hong Kong",
  "Sur": "Sur, Oman",
  "Tahiti": "Point Venus",
  "Tamarindo": "Tamarindo, Costa Rica",
  "Tampere": "Tampere Cathedral",
  "Trinidad": "Trinidad, Cuba",
  "Turkistan": "Mausoleum of Khoja Ahmed Yasawi",
  "Tutong": "Tutong (town)",
  "Varna": "Varna, Bulgaria",
  "Wahiba Sands": "Bidiyah",
  "Zanzibar": "Stone Town",
};

async function fetchPhoto(name: string): Promise<string | null> {
  const over = WIKI_TITLE[name];
  const tries: [string, string][] = over ? [over.startsWith('ja:') ? ['ja', over.slice(3)] : ['en', over]] : [['en', name], ['ja', name]];
  for (const [host, title] of tries) {
    try {
      const q = `https://${host}.wikipedia.org/w/api.php?action=query&prop=pageimages|pageprops&ppprop=disambiguation&piprop=thumbnail&pithumbsize=1000&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
      const r = await fetch(q);
      if (!r.ok) continue;
      const j = await r.json();
      const pg: any = Object.values(j?.query?.pages ?? {})[0];
      // 曖昧さ回避ページの画像は、別の場所の写真のことがあるので使わない
      if (pg?.pageprops && 'disambiguation' in pg.pageprops) continue;
      const src: string | undefined = pg?.thumbnail?.source;
      const w: number = pg?.thumbnail?.width ?? 0;
      // 地図・旗・紋章（svg）や小さすぎる画像は写真として使わない
      if (src && w >= 400 && !/\.svg/i.test(src) && !/(map|flag|coat_of_arms|locator|seal|logo)/i.test(src)) return src;
    } catch {}
  }
  return null;
}

/** 都市名（英語）から写真の URL。取れなければ null */
export function useCityPhoto(name?: string): string | null {
  const [url, setUrl] = useState<string | null>(name ? mem[name] ?? null : null);
  useEffect(() => {
    if (!name) return;
    if (name in mem) return setUrl(mem[name]);
    let alive = true;
    (async () => {
      const saved = await AsyncStorage.getItem(KEY + name).catch(() => null);
      let u: string | null = saved || null;
      if (saved === null) {
        u = await fetchPhoto(name);
        AsyncStorage.setItem(KEY + name, u ?? '').catch(() => {});
      }
      mem[name] = u;
      if (alive) setUrl(u);
    })();
    return () => {
      alive = false;
    };
  }, [name]);
  return url;
}
