// ChatGPT などで作った旅程の文章 → 日ごとの予定にまとめる（端末の中だけで）
import { shiftDate } from './data';

export type PlanDraft = { day: number; date?: string; time?: string; endTime?: string; title: string; memo?: string; place?: string };

const DAY_RE = /^(?:[#*\s>-]*)(?:【|\[|\*\*)?\s*(?:day\s*(\d{1,2})|(\d{1,2})\s*日目|第\s*(\d{1,2})\s*日|(\d{1,2})(?:st|nd|rd|th)\s+day)(?![0-9a-z])/i;
const DATE_HEAD = /^(?:[#*\s>-]*)(?:\*\*)?\s*(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/;
const TIME_RE = /^(?:[-*•・\s]*)(?:\*\*)?\s*(?:(午前|午後|朝|昼|夕方|夜|morning|afternoon|evening|night|lunch|dinner|breakfast)\s*[:：]?\s*)?(?:(\d{1,2})[:：時](\d{2})?\s*(?:分)?)?\s*(?:(?:[-–~〜〜]|to)\s*(\d{1,2})[:：時](\d{2})?)?\s*(?:\*\*)?\s*[:：\-–|｜]?\s*(.*)$/i;
const SLOT: Record<string, string> = { 朝: '08:00', 午前: '10:00', morning: '09:00', breakfast: '08:00', 昼: '12:00', lunch: '12:00', 午後: '14:00', afternoon: '14:00', 夕方: '17:00', evening: '18:00', dinner: '19:00', 夜: '19:30', night: '20:00' };
const pad = (n: number) => String(n).padStart(2, '0');
const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/^[-*•・\s]+/, '').replace(/\s+/g, ' ').trim();
// 場所らしい部分（「〇〇へ」「at 〇〇」「〇〇で」）
const placeOf = (s: string) => s.match(/(?:at|in|visit|@)\s+([A-Z][^,.;()]{2,40})/)?.[1]?.trim() ?? s.match(/^([^、。,]{2,30}?)(?:へ|に行く|を観光|を散策|で昼食|でランチ|で夕食|でディナー)/)?.[1]?.trim();

/** 旅程の文章を予定の下書きに。日付の見出しがなければ1日目として扱う */
export function parseItinerary(text: string, start?: string): PlanDraft[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: PlanDraft[] = [];
  let day = 1;
  let date: string | undefined = start;
  let sawDay = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const dm = line.match(DAY_RE);
    if (dm) {
      day = +(dm[1] || dm[2] || dm[3] || dm[4]);
      date = start ? shiftDate(start, day - 1) : undefined;
      sawDay = true;
      continue;
    }
    const dh = line.match(DATE_HEAD);
    if (dh && line.length < 24 && !/\d[:：]\d/.test(line)) {
      if (sawDay || out.length) day += 1;
      sawDay = true;
      const y = (start ?? new Date().toISOString()).slice(0, 4);
      date = `${y}-${pad(+dh[1])}-${pad(+dh[2])}`;
      continue;
    }
    const tm = line.match(TIME_RE);
    const slot = tm?.[1]?.toLowerCase();
    const hasTime = !!tm?.[2];
    const body = clean(tm?.[6] ?? '');
    if ((hasTime || slot) && body) {
      const time = hasTime ? `${pad(+tm![2])}:${tm![3] ?? '00'}` : SLOT[slot!] ?? SLOT[tm![1]];
      const endTime = tm![4] ? `${pad(+tm![4])}:${tm![5] ?? '00'}` : undefined;
      const [title, ...rest] = body.split(/[。．.]\s|：|: /);
      out.push({ day, date, time, endTime, title: clean(title).slice(0, 60), memo: rest.length ? clean(rest.join(' ')) : undefined, place: placeOf(body) });
      continue;
    }
    // 箇条書きの予定（時刻なし）
    if (/^[-*•・]\s*/.test(line) && clean(line).length >= 2 && sawDay) {
      const b = clean(line);
      out.push({ day, date, title: b.slice(0, 60), place: placeOf(b) });
      continue;
    }
    // 説明の行は直前の予定のメモへ
    const last = out[out.length - 1];
    if (last && last.day === day && clean(line).length > 0 && !/^#/.test(line)) last.memo = [last.memo, clean(line)].filter(Boolean).join('\n').slice(0, 400);
  }
  return out;
}
