// Apple ウォレットの搭乗券・チケット（.pkpass）を読む：中の pass.json から便名・区間・座席などを取り出す
import { Platform } from 'react-native';
import { unzipSync, strFromU8 } from 'fflate';
import { Directory, File as FSFile, Paths } from 'expo-file-system';
import { Booking, BookingType } from './data';

export type TicketFile = { name: string; uri: string; mime?: string };

/** 選んだファイルをアプリの中にコピー（元が消えても見られるように） */
export function keepFile(uri: string, name: string): string {
  if (Platform.OS === 'web') return uri;
  try {
    const dir = new Directory(Paths.document, 'files');
    if (!dir.exists) dir.create();
    const ext = (name.split('.').pop() || 'bin').slice(0, 6).toLowerCase();
    const dest = new FSFile(dir, `f${Date.now()}${Math.random().toString(36).slice(2, 6)}.${ext}`);
    new FSFile(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

export const isPkpass = (name?: string, mime?: string) => /\.pkpass$/i.test(name ?? '') || /pkpass/i.test(mime ?? '');
export const isPdf = (name?: string, mime?: string) => /\.pdf$/i.test(name ?? '') || /pdf/i.test(mime ?? '');

type Field = { key?: string; label?: string; value?: unknown; dateStyle?: string; timeStyle?: string };

/** .pkpass の中身 → 予約の項目 */
export async function readPkpass(uri: string): Promise<Partial<Booking> | null> {
  try {
    let bytes: Uint8Array;
    if (Platform.OS === 'web') bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
    else bytes = await new FSFile(uri).bytes();
    return parsePkpass(bytes);
  } catch {
    return null;
  }
}

export function parsePkpass(bytes: Uint8Array): Partial<Booking> | null {
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === 'pass.json' || /^(ja|en)\.lproj\/pass\.strings$/.test(f.name) });
    if (!files['pass.json']) return null;
    const pass = JSON.parse(strFromU8(files['pass.json']).replace(/^﻿/, ''));
    // 「label のキー」を各言語の文に置き換える表
    const strings: Record<string, string> = {};
    for (const k of ['ja.lproj/pass.strings', 'en.lproj/pass.strings']) {
      if (!files[k]) continue;
      let txt = '';
      try {
        txt = new TextDecoder('utf-16').decode(files[k]);
      } catch {}
      if (!/=/.test(txt)) txt = strFromU8(files[k]);
      for (const m of txt.matchAll(/"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g)) if (!(m[1] in strings)) strings[m[1]] = m[2];
    }
    const kind: string = ['boardingPass', 'eventTicket', 'coupon', 'storeCard', 'generic'].find((k) => pass[k]) ?? 'generic';
    const body = pass[kind] ?? {};
    const all: Field[] = ['headerFields', 'primaryFields', 'secondaryFields', 'auxiliaryFields', 'backFields'].flatMap((k) => body[k] ?? []);
    const val = (f?: Field) => (f?.value == null ? '' : String(strings[String(f.value)] ?? f.value)).trim();
    const find = (re: RegExp) => all.find((f) => re.test(`${f.key ?? ''} ${strings[f.label ?? ''] ?? f.label ?? ''}`));
    const out: Partial<Booking> = {};
    const isFlight = kind === 'boardingPass' && /air|plane|flight/i.test(String(body.transitType ?? 'PKTransitTypeAir'));
    const isTrain = kind === 'boardingPass' && /train/i.test(String(body.transitType ?? ''));
    const type: BookingType = isFlight ? 'flight' : isTrain ? 'train' : kind === 'boardingPass' ? 'bus' : 'ticket';
    out.type = type;
    const prim: Field[] = body.primaryFields ?? [];
    if (kind === 'boardingPass' && prim.length >= 2) {
      out.from = val(prim[0]);
      out.to = val(prim[prim.length - 1]);
    }
    const flight = find(/flight|便名|便|flt/i);
    out.title = (flight && val(flight)) || pass.description || pass.organizationName || undefined;
    if (out.title && isFlight) out.title = out.title.replace(/^([A-Z0-9]{2})\s*(\d{1,4})$/, '$1 $2');
    const seat = find(/seat|座席/i);
    if (seat) out.seat = val(seat);
    const code = find(/pnr|confirmation|booking|record|locator|予約番号|確認番号|reservation/i);
    if (code) out.code = val(code);
    // 日付：relevantDate か、日付の項目
    const dateRaw: string | undefined = pass.relevantDate ?? (all.find((f) => f.dateStyle || /date|日付|departure|出発/i.test(f.key ?? '')) ?.value as string | undefined);
    if (dateRaw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateRaw)) {
      // 書かれている時刻は現地の時刻（タイムゾーンの部分は使わない）
      out.start = dateRaw.slice(0, 10);
      out.startTime = dateRaw.slice(11, 16);
    }
    const dep = find(/^dep|departs|departure.?time|出発時刻/i);
    if (dep && /\d{1,2}:\d{2}/.test(val(dep))) out.startTime = val(dep).match(/\d{1,2}:\d{2}/)![0].padStart(5, '0');
    const extra = ['gate|ゲート|搭乗口', 'boarding|搭乗開始', 'terminal|ターミナル', 'zone|group|グループ', 'class|クラス']
      .map((k) => find(new RegExp(k, 'i')))
      .filter((f): f is Field => !!f && !!val(f))
      .map((f) => `${strings[f.label ?? ''] ?? f.label ?? f.key}: ${val(f)}`);
    if (extra.length) out.memo = extra.join('\n');
    Object.keys(out).forEach((k) => ((out as any)[k] === '' || (out as any)[k] === undefined) && delete (out as any)[k]);
    return out;
  } catch {
    return null;
  }
}
