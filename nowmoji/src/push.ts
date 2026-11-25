// 通知：許可をもらってサーバーに通知先を登録する。届いたらウィジェットを更新する
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { hasAuth, loadAuth, sync, updateMe } from './api';
import { updateWidgets } from './widgetSync';

export const BG_TASK = 'nowmoji-background-notification';
const K_THEME = 'nm.theme.v1';

// 通知が届いたら（アプリが閉じていても）最新を取ってウィジェットを書きかえる
if (Platform.OS !== 'web') TaskManager.defineTask(BG_TASK, async () => {
  try {
    await loadAuth();
    if (!hasAuth()) return;
    const s = await sync();
    const theme = (await AsyncStorage.getItem(K_THEME).catch(() => null)) || 'paper';
    await updateWidgets(s, theme);
  } catch {}
});

if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

let registered = false;
export async function registerPush(ask: boolean) {
  if (Platform.OS !== 'ios' || registered) return;
  try {
    Notifications.registerTaskAsync(BG_TASK).catch(() => {});
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId;
    const tok = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (tok?.data) {
      await updateMe({ pushToken: tok.data });
      registered = true;
    }
  } catch {}
}
export const saveTheme = (v: string) => AsyncStorage.setItem(K_THEME, v).catch(() => {});
export const loadTheme = async () => (await AsyncStorage.getItem(K_THEME).catch(() => null)) || 'paper';
