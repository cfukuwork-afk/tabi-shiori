// ファイルの書き出し（PDF・CSV・バックアップ）と読み込み
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File as FSFile, Paths } from 'expo-file-system';

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'tripfold';

function webDownload(name: string, data: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** 文字のファイルを作って共有メニューを開く（CSV・バックアップ） */
export async function shareTextFile(name: string, text: string, mime: string) {
  const file = safeName(name.replace(/\.[a-z]+$/i, '')) + (name.match(/\.[a-z]+$/i)?.[0] ?? '');
  if (Platform.OS === 'web') return webDownload(file, text, mime);
  const dir = new Directory(Paths.cache, 'out');
  if (!dir.exists) dir.create();
  const f = new FSFile(dir, file);
  if (f.exists) f.delete();
  f.create();
  await f.write(text);
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: file });
}

/** HTML を PDF にして共有（印刷・LINE・メール） */
export async function sharePdf(name: string, html: string) {
  if (Platform.OS === 'web') return Print.printAsync({ html });
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  // 分かりやすい名前に付け替える
  let out = uri;
  try {
    const dir = new Directory(Paths.cache, 'out');
    if (!dir.exists) dir.create();
    const dest = new FSFile(dir, safeName(name) + '.pdf');
    if (dest.exists) dest.delete();
    new FSFile(uri).move(dest);
    out = dest.uri;
  } catch {}
  await Sharing.shareAsync(out, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
}

/** ファイルを1つ選んで中身の文字を読む */
export async function pickTextFile(types: string[] = ['application/json', 'text/plain', '*/*']): Promise<{ name: string; text: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  if (Platform.OS === 'web') {
    const text = a.file ? await a.file.text() : await (await fetch(a.uri)).text();
    return { name: a.name, text };
  }
  return { name: a.name, text: await new FSFile(a.uri).text() };
}

/** ファイルを1つ選んで、アプリの中にコピーした場所を返す（搭乗券・PDFチケット） */
export async function pickAnyFile(types: string[]): Promise<{ name: string; uri: string; mime?: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { name: a.name, uri: a.uri, mime: a.mimeType ?? undefined };
}

export const esc = (x: unknown) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const csvCell = (x: unknown) => {
  let s = String(x ?? '');
  // 「=」「+」「-」「@」で始まる文字は表計算ソフトで数式として動くので、先頭に ' をつける（数値はそのまま）
  if (typeof x !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
