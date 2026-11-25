// メールを転送して予定を取り込む（アプリ側）
//  - この端末専用の転送先「<10文字>@tripfold.net」を作る（アカウント不要）
//  - 届いたメールを取りに行き、日付が合う旅行の「読み取り待ち」に入れる
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER } from './sync';
import { parseBooking } from './parse';
import { isDate, isPast, tripRange, type Trip } from './data';

const KEY = 'ts.mail.v1';
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export type MailItem = { id: string; at: number; from: string; subject: string; text: string; confirm?: string };

function newToken() {
  const bytes = new Uint8Array(10);
  const g: any = globalThis as any;
  if (g.crypto?.getRandomValues) g.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 10; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => ALPHA[b % ALPHA.length]).join('');
}
async function readTok(): Promise<{ token?: string; ok?: boolean }> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) || '{}');
  } catch {
    return {};
  }
}
/** 転送先の住所（なければ作ってサーバーに登録する）。失敗したら null */
export async function mailAddress(): Promise<string | null> {
  const st = await readTok();
  const token = st.token || newToken();
  if (!st.token) await AsyncStorage.setItem(KEY, JSON.stringify({ token, ok: false }));
  if (!st.ok) {
    try {
      const r = await fetch(`${SERVER}/v1/mail/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      if (!r.ok) return null;
      await AsyncStorage.setItem(KEY, JSON.stringify({ token, ok: true }));
    } catch {
      return null;
    }
  }
  return `${token}@tripfold.net`;
}
/** 届いているメール（住所をまだ作っていなければ空） */
export async function fetchMail(): Promise<MailItem[]> {
  const st = await readTok();
  if (!st.token || !st.ok) return [];
  try {
    const r = await fetch(`${SERVER}/v1/mail/${st.token}`);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.items) ? j.items.filter((x: any) => x && typeof x.id === 'string' && typeof x.text === 'string') : [];
  } catch {
    return [];
  }
}
export async function ackMail(id: string) {
  const st = await readTok();
  if (!st.token) return;
  await fetch(`${SERVER}/v1/mail/${st.token}/${id}`, { method: 'DELETE' }).catch(() => undefined);
}

const shift = (d: string, n: number) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** メールの中身から、入れる旅行を選ぶ。合う旅行がなければ null（新しい旅行を作る） */
export function pickTripFor(trips: Trip[], text: string, today: string): string | null {
  const start = parseBooking(text, new Date(today + 'T12:00:00')).start;
  const live = trips.filter((t) => !isPast(t, today));
  if (start && isDate(start)) {
    // 予定の日が旅行の期間（前後2日まで）に入る旅行
    const hit = trips.find((t) => {
      const r = tripRange(t);
      return r.start && r.end && start >= shift(r.start, -2) && start <= shift(r.end, 2);
    });
    if (hit) return hit.id;
    if (start < today) return null;
    // 期間のまだ決まっていない、これからの旅行（予約がまだ入っていない）
    const empty = live.find((t) => !tripRange(t).start);
    return empty ? empty.id : null;
  }
  // 日付が読めないときは、いちばん近いこれからの旅行
  const next = live
    .map((t) => ({ t, s: tripRange(t).start ?? '9999' }))
    .sort((a, b) => (a.s < b.s ? -1 : 1))[0];
  return next ? next.t.id : null;
}
/** 受信箱に入れる文字（1行目は件名） */
export const mailText = (m: MailItem) => `${m.subject ? m.subject + '\n' : ''}${m.text}`.slice(0, 20000);
