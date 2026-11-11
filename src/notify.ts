// 出発前のお知らせ（端末の中だけで予約する通知）
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Trip, timeline, todayStr, parseDate } from './data';
import { t, typeName, prettyDate } from './i18n';
import { localToDate } from './airports';
import { bookingTz, tripTz } from './geo';

export async function askPermission() {
  if (Platform.OS === 'web') return false;
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    const r = await Notifications.requestPermissionsAsync();
    return r.granted;
  } catch {
    return false;
  }
}

const at = (date: string, time: string) => {
  const d = parseDate(date);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};

/** すべての通知を作り直す（iOS は最大64件なので近いものから60件） */
export async function rescheduleAll(trips: Trip[], on: boolean) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!on) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const now = Date.now();
    const list: { when: Date; title: string; body: string }[] = [];
    const today = todayStr();
    trips.forEach((trip) =>
      timeline(trip).forEach(({ date, items }) => {
        if (date < today) return;
        // 前日の夜に「明日の予定」
        // 旅行先の夜8時（前日）。旅行先が分からなければ端末の時間
        const prev = parseDate(date);
        prev.setDate(prev.getDate() - 1);
        const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
        const eve = localToDate(prevStr, '20:00', tripTz(trip));
        list.push({
          when: eve,
          title: `${t('nTomorrow')} · ${trip.name}`,
          body: items
            .map((it) => `${it.time ?? ''} ${it.booking.title || typeName(it.booking.type)}`.trim())
            .slice(0, 4)
            .join(' / '),
        });
        // 出発の少し前
        items.forEach((it) => {
          if (!it.time || it.edge === 'end') return;
          const b = it.booking;
          const before = b.type === 'flight' ? 180 : b.type === 'train' || b.type === 'bus' ? 60 : 60;
          // 時刻は現地時間なので、その場所のタイムゾーンで実際の時刻に直す
          const w = new Date(localToDate(date, it.time, bookingTz(b, trip)).getTime() - before * 60000);
          list.push({
            when: w,
            title: `${b.title || typeName(b.type)} · ${it.time}`,
            body: [b.from && b.to ? `${b.from} → ${b.to}` : b.from, b.code ? `${t('code')} ${b.code}` : ''].filter(Boolean).join('  ·  ') || prettyDate(date),
          });
        });
      }),
    );
    const upcoming = list.filter((x) => x.when.getTime() > now + 60000).sort((a, b) => a.when.getTime() - b.when.getTime()).slice(0, 60);
    for (const x of upcoming) {
      await Notifications.scheduleNotificationAsync({
        content: { title: x.title, body: x.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: x.when },
      });
    }
  } catch {}
}

if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
  } catch {}
}
