// 大事な書類（パスポート・保険証書の写しなど）：Face ID で開く。旅行の共有やバックアップには入れない
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Directory, File as FSFile, Paths } from 'expo-file-system';

export type VaultDoc = { id: string; title: string; photos: string[]; at: number };
const KEY = 'ts.vault.v1';

export async function loadVault(): Promise<VaultDoc[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]');
  } catch {
    return [];
  }
}
export const saveVault = (v: VaultDoc[]) => AsyncStorage.setItem(KEY, JSON.stringify(v)).catch(() => {});

/** Face ID・Touch ID・パスコードで確認。仕組みがない端末（Web）はそのまま通す */
export async function unlock(prompt: string): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const has = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!has || !enrolled) return true;
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false });
    return r.success;
  } catch {
    return false;
  }
}

/** 写真を書類用の場所にコピー（ほかの写真とは別の場所） */
export function keepVaultImage(uri: string) {
  if (Platform.OS === 'web') return uri;
  try {
    const dir = new Directory(Paths.document, 'vault');
    if (!dir.exists) dir.create();
    const dest = new FSFile(dir, `v${Date.now()}${Math.random().toString(36).slice(2, 6)}.jpg`);
    new FSFile(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}
export function dropVaultImage(uri: string) {
  if (Platform.OS === 'web') return;
  try {
    const f = new FSFile(uri);
    if (f.exists) f.delete();
  } catch {}
}
