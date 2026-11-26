// ウィジェットに最新の気分を渡す（アプリを開いたとき・通知が届いたとき）
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { Asset } from 'expo-asset';
import { Directory, File as FSFile } from 'expo-file-system';
import type { Sync } from './api';
import { SERVER } from './api';
import { hhmm, t } from './i18n';
import { ART, KAO, MOOD_IDS, type MoodId, tint } from './kao';
import type { GroupWidgetProps, WPerson } from './widgets/GroupWidget';
import type { FriendWidgetProps, FPerson } from './widgets/FriendWidget';

export const widgetsAvailable = Platform.OS === 'ios' && !!requireOptionalNativeModule('ExpoWidgets');
/* eslint-disable @typescript-eslint/no-var-requires */
let GW: any = null;
let FW: any = null;
let dir: string | null = null;
function load() {
  if (!widgetsAvailable) return false;
  if (!GW) {
    GW = require('./widgets/GroupWidget').default;
    FW = require('./widgets/FriendWidget').default;
    dir = require('expo-widgets').widgetsDirectory || null;
  }
  return true;
}

// キャラの絵を共有フォルダへ（1回だけ）
let artReady = false;
async function ensureArt() {
  if (artReady || !dir) return;
  for (const id of MOOD_IDS) {
    const dest = new FSFile(dir, `m_${id}.png`);
    if (dest.exists) continue;
    const a = Asset.fromModule(ART[id]);
    await a.downloadAsync();
    if (a.localUri) new FSFile(a.localUri).copy(dest);
  }
  artReady = true;
}
// 落書き・画像を共有フォルダへ（なければ取ってくる）
async function remote(path: string) {
  if (!dir) return '';
  const name = 'r_' + path.replace(/^.*\//, '');
  const f = new FSFile(dir, name);
  try {
    if (!f.exists) await FSFile.downloadFileAsync(SERVER + path, f);
    return f.uri;
  } catch {
    return '';
  }
}
// 使わなくなった画像を消す
function cleanup(keep: Set<string>) {
  if (!dir) return;
  try {
    for (const it of new Directory(dir).list()) {
      if (it instanceof FSFile && it.name.startsWith('r_') && !keep.has(it.uri)) it.delete();
    }
  } catch {}
}

export const THEMES: Record<string, string> = { paper: '#FFFDF8', night: '#2F3550', lavender: '#EEE8FB', mint: '#E4F4EE', peach: '#FFE9DE', sky: '#E5F0FB' };

export async function updateWidgets(s: Sync | null, theme = 'paper') {
  if (!s || !load()) return;
  try {
    await ensureArt();
  } catch {}
  const used = new Set<string>();
  const person = async (u: { id: string; name: string; color: string }, p: any, me: boolean): Promise<WPerson> => {
    let k = '';
    let img = '';
    if (p) {
      if (p.kind === 'kao') k = p.kao || (p.mood ? KAO[p.mood as MoodId] : '');
      else if (p.kind === 'art' && p.mood && dir) img = new FSFile(dir, `m_${p.mood}.png`).uri;
      else if (p.img) {
        img = await remote(p.img);
        if (img) used.add(img);
      }
    }
    // まだ気分を送っていない（または画像を読み込めない）ときは「・」だけにせず、待っている顔と一言を出す
    if (!k && !img) return { n: me ? t.you : u.name, c: u.color, bg: tint(u.color), k: '( ˘ω˘ )', img: '', t: '', w: p ? p.word || '' : me ? t.wNoPostMe : t.wNoPost, me, np: !p };
    return { n: me ? t.you : u.name, c: u.color, bg: tint(u.color), k, img, t: p ? hhmm(p.at) : '', w: p?.word || '', me };
  };
  const groups: GroupWidgetProps['groups'] = {};
  const people: FriendWidgetProps['people'] = {};
  const personOrder: string[] = [];
  for (const g of s.groups) {
    const list: (WPerson & { at: number })[] = [];
    for (const u of g.members) {
      const p = g.latest[u.id];
      const w = await person(u, p, u.id === s.me.id);
      list.push({ ...w, at: p?.at || 0 });
      if (u.id !== s.me.id) {
        const key = `${g.id}_${u.id}`;
        const fp: FPerson = { ...w, g: g.id };
        people[key] = fp;
        personOrder.push(key);
      }
    }
    list.sort((a, b) => b.at - a.at);
    groups[g.id] = { name: g.name, people: list.map(({ at, ...x }) => x) };
  }
  // 1人ウィジェットの「おまかせ」は、いちばん最近送ってきた人
  personOrder.sort((a, b) => {
    const [ga, ua] = a.split('_');
    const [gb, ub] = b.split('_');
    const pa = s.groups.find((x) => x.id === ga)?.latest[ua]?.at || 0;
    const pb = s.groups.find((x) => x.id === gb)?.latest[ub]?.at || 0;
    return pb - pa;
  });
  const order = s.groups.map((g) => g.id);
  const bg = THEMES[theme] || THEMES.paper;
  try {
    GW.updateSnapshot({ groups, order, empty: t.widgetEmpty, hint: t.widgetHint, theme: bg } as GroupWidgetProps);
    FW.updateSnapshot({ people, order: personOrder, empty: t.widgetEmpty, theme: bg } as FriendWidgetProps);
    GW.setConfigurationParameterEnum?.('group', s.groups.map((g) => ({ name: g.name, value: g.id })));
    FW.setConfigurationParameterEnum?.(
      'person',
      personOrder.map((k) => {
        const [gid, uid] = k.split('_');
        const g = s.groups.find((x) => x.id === gid);
        const u = g?.members.find((m) => m.id === uid);
        return { name: `${u?.name || '?'}（${g?.name || ''}）`, value: k };
      }),
    );
  } catch {}
  cleanup(used);
}
