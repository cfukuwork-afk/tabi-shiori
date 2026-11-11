// 都市の写真を Wikipedia の要約 API から取る（キー不要）。端末に保存して、2回目からは通信しない
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const mem: Record<string, string | null> = {};
const KEY = 'ts.cityphoto.v1:';

async function fetchPhoto(name: string): Promise<string | null> {
  for (const host of ['en', 'ja']) {
    try {
      const q = `https://${host}.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=1000&redirects=1&format=json&titles=${encodeURIComponent(name)}`;
      const r = await fetch(q);
      if (!r.ok) continue;
      const j = await r.json();
      const pg: any = Object.values(j?.query?.pages ?? {})[0];
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
