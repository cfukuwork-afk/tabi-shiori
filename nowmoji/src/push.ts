// 通知：許可をもらってサーバーに通知先を登録する。届いたらウィジェットを更新する
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { hasAuth, loadAuth, sync, updateMe } from './api';
import { updateWidgets } from './widgetSync';
import { t } from './i18n';

export const BG_TASK = 'nowmoji-background-notification';
export const BG_REFRESH = 'nowmoji-background-refresh';
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

// 通知が届かなかったとき（通知オフ・アプリを上にスワイプして閉じた等）のために、
// iPhoneが許す間隔（15分以上・電池や使い方しだい）で、アプリを開かなくてもウィジェットを更新する
if (Platform.OS !== 'web') TaskManager.defineTask(BG_REFRESH, async () => {
  try {
    await loadAuth();
    if (!hasAuth()) return BackgroundTask.BackgroundTaskResult.Success;
    const s = await sync();
    const theme = (await AsyncStorage.getItem(K_THEME).catch(() => null)) || 'paper';
    await updateWidgets(s, theme);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
export async function registerRefresh() {
  if (Platform.OS !== 'ios') return;
  try {
    const st = await BackgroundTask.getStatusAsync();
    if (st !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (!(await TaskManager.isTaskRegisteredAsync(BG_REFRESH))) await BackgroundTask.registerTaskAsync(BG_REFRESH, { minimumInterval: 15 });
  } catch {}
}

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
    scheduleHourly();
    const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId;
    const tok = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (tok?.data) {
      await updateMe({ pushToken: tok.data });
      registered = true;
    }
  } catch {}
}
// 1時間ごとのお知らせ（7時〜23時の毎正時。0時〜6時は送らない）
const K_HOURLY = 'nm.hourly.v1';
export const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7..23
export const hourlyOn = async () => (await AsyncStorage.getItem(K_HOURLY).catch(() => null)) !== 'off';
export async function scheduleHourly(on?: boolean, words?: { body: string }) {
  if (Platform.OS !== 'ios') return;
  try {
    if (on !== undefined) await AsyncStorage.setItem(K_HOURLY, on ? 'on' : 'off');
    const enabled = on ?? (await hourlyOn());
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const mine = all.filter((n) => n.identifier.startsWith('hourly-'));
    if (!enabled) {
      for (const n of mine) await Notifications.cancelScheduledNotificationAsync(n.identifier);
      return;
    }
    if ((await Notifications.getPermissionsAsync()).status !== 'granted') return;
    if (mine.length === HOURS.length && on === undefined) return; // もう入っている
    for (const n of mine) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    const body = words?.body || t.hourlyBody;
    for (const h of HOURS) {
      await Notifications.scheduleNotificationAsync({
        identifier: `hourly-${h}`,
        content: { title: `${h}:00`, body, sound: undefined, data: { t: 'hourly' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: h, minute: 0 },
      });
    }
  } catch {}
}

/** 通知の許可の状態：'granted'（オン）/'undetermined'（まだ聞いていない）/'denied'（オフ） */
export async function pushStatus(): Promise<string> {
  if (Platform.OS !== 'ios') return 'granted';
  try {
    return (await Notifications.getPermissionsAsync()).status;
  } catch {
    return 'granted';
  }
}
export const saveTheme = (v: string) => AsyncStorage.setItem(K_THEME, v).catch(() => {});
export const loadTheme = async () => (await AsyncStorage.getItem(K_THEME).catch(() => null)) || 'paper';
