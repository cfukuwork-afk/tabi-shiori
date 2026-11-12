// バックアップ：旅行と写真を1つのファイルに書き出す／読み込む（機種変更・アプリの削除に備える）
import { Platform } from 'react-native';
import { Directory, File as FSFile, Paths } from 'expo-file-system';
import { Trip, normalizeTrip } from './data';
import { pickTextFile, shareTextFile } from './files';

type BackupFile = { app: 'tripfold'; v: 1; at: number; trips: Trip[]; files: Record<string, string> };

/** 旅行の中に出てくる端末内の写真の場所をすべて集める */
function localUris(trips: Trip[]): string[] {
  const out = new Set<string>();
  const add = (u?: string) => u && u.startsWith('file:') && out.add(u);
  trips.forEach((t) => {
    add(t.cover);
    t.bookings.forEach((b) => (b.photos?.forEach(add), b.files?.forEach((f) => add(f.uri))));
    Object.values(t.journal ?? {}).forEach((j) => j.photos?.forEach(add));
    t.wishes?.forEach((w) => (add(w.image), w.photos?.forEach(add)));
    t.expenses?.forEach((e) => add(e.photo));
    t.checklist.forEach((c) => add(c.photo));
    t.inbox?.forEach((i) => add(i.image));
  });
  return [...out];
}

export async function exportBackup(trips: Trip[], withPhotos = true) {
  const files: Record<string, string> = {};
  if (withPhotos && Platform.OS !== 'web') {
    for (const u of localUris(trips)) {
      try {
        const f = new FSFile(u);
        if (f.exists) files[u] = await f.base64();
      } catch {}
    }
  }
  const data: BackupFile = { app: 'tripfold', v: 1, at: Date.now(), trips, files };
  const d = new Date();
  const name = `Tripfold-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  await shareTextFile(name, JSON.stringify(data), 'application/json');
  return { trips: trips.length, photos: Object.keys(files).length };
}

/** バックアップを選んで読み込む。写真は端末に戻し、旅行の中の場所を付け替える */
export async function importBackup(): Promise<Trip[] | null> {
  const f = await pickTextFile(['application/json', 'text/plain', '*/*']);
  if (!f) return null;
  let data: BackupFile;
  try {
    data = JSON.parse(f.text);
  } catch {
    throw new Error('bad');
  }
  if (data?.app !== 'tripfold' || !Array.isArray(data.trips)) throw new Error('bad');
  let json = JSON.stringify(data.trips);
  if (Platform.OS !== 'web' && data.files) {
    const dir = new Directory(Paths.document, 'photos');
    if (!dir.exists) dir.create();
    for (const [old, b64] of Object.entries(data.files)) {
      try {
        const ext = (old.split('?')[0].split('.').pop() || 'jpg').slice(0, 4);
        const dest = new FSFile(dir, `r${Date.now()}${Math.random().toString(36).slice(2, 7)}.${ext}`);
        dest.create();
        await dest.write(b64, { encoding: 'base64' });
        json = json.split(JSON.stringify(old).slice(1, -1)).join(dest.uri);
      } catch {}
    }
  }
  const trips = (JSON.parse(json) as any[]).map(normalizeTrip).filter(Boolean) as Trip[];
  if (!trips.length && data.trips.length) throw new Error('bad');
  return trips;
}

/** 読み込んだ旅行を今の旅行と合わせる（同じ旅行は読み込んだ方で置き換え） */
export function mergeBackup(now: Trip[], incoming: Trip[]): Trip[] {
  const ids = new Set(incoming.map((t) => t.id));
  return [...incoming, ...now.filter((t) => !ids.has(t.id))];
}
