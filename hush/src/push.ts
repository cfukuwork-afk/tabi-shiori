// 通知：許可をもらって、サーバーに通知先を登録する
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { updateMe } from './api';

if (Platform.OS !== 'web')
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });

let registered = false;
/** 通知の状態：granted / denied / undetermined */
export async function pushStatus() {
  if (Platform.OS !== 'ios') return 'denied';
  try {
    return (await Notifications.getPermissionsAsync()).status;
  } catch {
    return 'denied';
  }
}
export async function registerPush(ask: boolean) {
  if (Platform.OS !== 'ios' || registered) return;
  try {
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
