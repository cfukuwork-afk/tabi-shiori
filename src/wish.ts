// 行きたい場所：リンクからサービスを見分け、ページの題名と画像をできれば取ってくる
export function platformOf(url?: string): { icon: string; name: string } {
  const u = (url ?? '').toLowerCase();
  if (u.includes('instagram.com')) return { icon: 'logo-instagram', name: 'Instagram' };
  if (u.includes('youtube.com') || u.includes('youtu.be')) return { icon: 'logo-youtube', name: 'YouTube' };
  if (u.includes('tiktok.com')) return { icon: 'logo-tiktok', name: 'TikTok' };
  if (u.includes('facebook.com') || u.includes('fb.watch')) return { icon: 'logo-facebook', name: 'Facebook' };
  if (u.includes('x.com') || u.includes('twitter.com')) return { icon: 'logo-twitter', name: 'X' };
  if (u.includes('google.') && u.includes('maps') || u.includes('goo.gl/maps') || u.includes('maps.app.goo.gl')) return { icon: 'map', name: 'Google Maps' };
  if (u.includes('tabelog.com')) return { icon: 'restaurant', name: '食べログ' };
  if (u.includes('tripadvisor')) return { icon: 'compass', name: 'Tripadvisor' };
  if (!u) return { icon: 'bookmark', name: '' };
  try {
    return { icon: 'link', name: u.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '') };
  } catch {
    return { icon: 'link', name: '' };
  }
}

export const firstUrl = (text?: string) => text?.match(/https?:\/\/[^\s<>"']+/)?.[0];

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** ページの題名と画像（取れなければ空）。5秒で諦める */
export async function fetchMeta(url: string): Promise<{ title?: string; image?: string }> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } });
    clearTimeout(timer);
    const html = (await r.text()).slice(0, 300000);
    const meta = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'))?.[1];
    let title = meta('og:title') ?? html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1];
    const image = meta('og:image');
    title = title ? decode(title).trim() : undefined;
    // ログイン画面などの題名は使わない
    if (title && /^(instagram|tiktok|facebook|log ?in|ログイン|x)$/i.test(title)) title = undefined;
    return { title: title?.slice(0, 80), image: image ? decode(image) : undefined };
  } catch {
    return {};
  }
}
