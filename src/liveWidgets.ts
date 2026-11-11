// ウィジェットとライブアクティビティを今の予定に合わせる（App Store 版だけ。Expo Go・Web では何もしない）
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Trip, timeline, daysBetween, dateStr, isPast } from './data';
import { localToDate } from './airports';
import { bookingTz } from './geo';
import { prettyDate, t, typeName } from './i18n';

const HAS = Platform.OS === 'ios' && !!requireOptionalNativeModule('ExpoWidgets');
let W: any = null;
let A: any = null;
function load() {
  if (!HAS) return false;
  try {
    if (!W) W = require('./widgets/NextWidget').default;
    if (!A) A = require('./widgets/TripActivity').default;
    return true;
  } catch {
    return false;
  }
}
export const widgetsAvailable = HAS;

type Up = { trip: Trip; b: Trip['bookings'][number]; date: string; time?: string; at: Date; edge: string };

/** これからの予定を時刻順に */
function upcoming(trips: Trip[], from: Date): Up[] {
  const out: Up[] = [];
  trips.forEach((trip) => {
    if (isPast(trip)) return;
    timeline(trip).forEach(({ date, items }) =>
      items.forEach((it) => {
        if (it.booking.cancelled) return;
        const at = localToDate(date, it.time ?? '23:59', bookingTz(it.booking, trip));
        // 時刻がある予定は始まって30分たったら次へ
        if (at.getTime() + (it.time ? 30 * 60000 : 0) < from.getTime()) return;
        out.push({ trip, b: it.booking, date, time: it.time, at, edge: it.edge });
      }),
    );
  });
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function propsFor(u: Up | undefined, now: Date) {
  const empty = { kicker: '', type: '', title: '', sub: '', when: '', code: '', codeLabel: '', trip: '', empty: t('widgetEmpty') };
  if (!u) return empty;
  const d = daysBetween(dateStr(now), u.date);
  const kicker = d <= 0 ? t('wToday') : d === 1 ? t('wTomorrow') : t('inDays', { n: d });
  const b = u.b;
  const edge = u.edge === 'start' ? (b.type === 'hotel' ? t('checkin') : t('pickup')) : u.edge === 'end' ? (b.type === 'hotel' ? t('checkout') : t('dropoff')) : '';
  return {
    kicker,
    type: typeName(b.type) + (edge ? ` · ${edge}` : ''),
    title: b.title || typeName(b.type),
    sub: [b.from, b.type !== 'car' ? b.to : undefined].filter(Boolean).join(' → '),
    when: `${prettyDate(u.date)} ${u.time ?? ''}`.trim(),
    code: b.code ?? '',
    codeLabel: t('code'),
    trip: u.trip.name,
    empty: t('widgetEmpty'),
  };
}

/** ホーム画面ウィジェット：予定が切り替わる時刻と毎日0時に表示が進むように予定を組む */
export function updateNextWidget(trips: Trip[]) {
  if (!load()) return;
  try {
    const now = new Date();
    const times = new Set<number>([now.getTime()]);
    for (let i = 1; i <= 7; i++) {
      const m = new Date(now);
      m.setHours(0, 0, 5, 0);
      m.setDate(m.getDate() + i);
      times.add(m.getTime());
    }
    upcoming(trips, now)
      .slice(0, 10)
      .forEach((u) => u.time && times.add(u.at.getTime() + 30 * 60000 + 1000));
    const entries = [...times]
      .sort((a, b) => a - b)
      .slice(0, 20)
      .map((ms) => {
        const at = new Date(ms);
        return { date: at, props: propsFor(upcoming(trips, at)[0], at) };
      });
    W.updateTimeline(entries);
  } catch {}
}

const ICON: Record<string, string> = { flight: 'airplane', train: 'tram.fill', bus: 'bus.fill', car: 'car.fill' };

/** 出発の6時間前からロック画面に「出発まで◯分」を出す。出発して1時間たったら消す */
export async function syncTripActivity(trips: Trip[]) {
  if (!load()) return;
  try {
    const now = Date.now();
    const next = upcoming(trips, new Date(now - 60 * 60000)).find(
      (u) => ['flight', 'train', 'bus'].includes(u.b.type) && u.time && u.at.getTime() - now < 6 * 3600000 && u.at.getTime() - now > -60 * 60000,
    );
    const live: any[] = A.getInstances?.() ?? [];
    if (!next) {
      for (const inst of live) await inst.end?.('immediate');
      return;
    }
    const props = {
      icon: ICON[next.b.type] ?? 'airplane',
      title: next.b.title || typeName(next.b.type),
      from: next.b.from ?? '',
      to: next.b.to ?? '',
      at: next.at.getTime(),
      time: next.time ?? '',
      seatLabel: t('seat'),
      seat: next.b.seat ?? '',
      codeLabel: t('code'),
      code: next.b.code ?? '',
      leftLabel: t('leaveIn'),
    };
    // 出ていれば中身を入れ替える（別の便になっても同じ枠を使う）
    if (live.length) {
      await live[0].update(props, new Date(next.at.getTime() + 60 * 60000));
      for (const extra of live.slice(1)) await extra.end?.('immediate');
      return;
    }
    A.start(props, 'tripfold://', new Date(next.at.getTime() + 60 * 60000));
  } catch {}
}
