// ChatGPT・Claude・Gemini・Copilot などで作った旅程の文章 → 日ごとの予定にまとめる（端末の中だけで）
// 見出し（Day 1・1日目・12月2日・Dec 2）、表（| 時間 | 予定 |）、時刻（9:00・9am・午後2時・14h）、
// 時間帯（午前・Morning）、箇条書き・入れ子の説明、など色々な書き方に対応する
import { shiftDate } from './data';

export type PlanDraft = { day: number; date?: string; time?: string; endTime?: string; title: string; memo?: string; place?: string };

const pad = (n: number) => String(n).padStart(2, '0');

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, janvier: 1, enero: 1, januar: 1, gennaio: 1, janeiro: 1,
  feb: 2, february: 2, février: 2, fevrier: 2, febrero: 2, februar: 2, febbraio: 2, fevereiro: 2,
  mar: 3, march: 3, mars: 3, marzo: 3, märz: 3, marz: 3, março: 3,
  apr: 4, april: 4, avril: 4, abril: 4, aprile: 4,
  may: 5, mai: 5, mayo: 5, maggio: 5, maio: 5,
  jun: 6, june: 6, juin: 6, junio: 6, juni: 6, giugno: 6, junho: 6,
  jul: 7, july: 7, juillet: 7, julio: 7, juli: 7, luglio: 7, julho: 7,
  aug: 8, august: 8, août: 8, aout: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septembre: 9, septiembre: 9, settembre: 9, setembro: 9,
  oct: 10, october: 10, octobre: 10, octubre: 10, oktober: 10, ottobre: 10, outubro: 10,
  nov: 11, november: 11, novembre: 11, noviembre: 11, novembro: 11,
  dec: 12, december: 12, décembre: 12, decembre: 12, diciembre: 12, dezember: 12, dicembre: 12, dezembro: 12,
};
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7 };
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

// 時間帯の言葉 → 目安の時刻
const SLOTS: [RegExp, string][] = [
  [/^(早朝|early morning)/i, '07:00'],
  [/^(朝食|breakfast|petit[- ]déjeuner|desayuno|frühstück|colazione|café da manhã)/i, '08:00'],
  [/^(朝|午前中?|morning|matin|mañana|vormittag|morgen|mattina|manhã|오전|아침|上午|早上)/i, '09:30'],
  [/^(昼食|ランチ|お昼|lunch|déjeuner|almuerzo|mittagessen|pranzo|almoço|점심|午餐|午饭)/i, '12:00'],
  [/^(昼|midday|noon|正午)/i, '12:00'],
  [/^(午後|afternoon|après[- ]midi|tarde|nachmittag|pomeriggio|오후|下午)/i, '14:00'],
  [/^(夕方|late afternoon|夕刻|傍晚)/i, '17:00'],
  [/^(夕食|ディナー|晩ごはん|dinner|dîner|cena|abendessen|jantar|저녁 ?식사|晚餐|晚饭)/i, '19:00'],
  [/^(夜|晩|evening|night|soir|soirée|noche|abend|sera|notte|noite|저녁|밤|晚上)/i, '19:30'],
];

/** 全角の数字・記号を半角に、飾り（太字・絵文字・番号）を外す */
function normalize(s: string) {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/[〜～]/g, '~')
    .replace(/[－−―–—]/g, '-')
    .replace(/ /g, ' ');
}
const stripDeco = (s: string) =>
  s
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$)/g, '$1$2')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** 行頭の記号（見出し・引用・箇条書き・番号）を外す */
const stripLead = (s: string) =>
  s
    .replace(/^[#>\s]+/, '')
    .replace(/^(?:[-*•・●○◆◇■□▶▷►→✓✔└├┗┣]+\s*)+/, '')
    .replace(new RegExp(`^[${CIRCLED}]\\s*`), '')
    .replace(/^\d{1,2}[.)]\s+(?=\D)/, '')
    .replace(/^\(\d{1,2}\)\s*/, '')
    .trim();

/** 見出しから「何日目か」と日付を読む */
function readDayHead(s: string, year: number): { day?: number; date?: string; rest: string } | null {
  let m = s.match(/^[\[【(（]?\s*(?:day|jour|día|dia|tag|giorno|dag)\s*(\d{1,2}|[a-z]+)\s*[\]】)）]?(?![0-9a-z])/i);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : WORD_NUM[m[1].toLowerCase()];
    if (n) return { day: n, ...withDate(s.slice(m[0].length), year) };
  }
  m = s.match(/^[\[【(（]?\s*(?:(\d{1,2})\s*日目|第\s*(\d{1,2})\s*日|(\d{1,2})\s*일차|第\s*(\d{1,2})\s*天|(\d{1,2})(?:st|nd|rd|th)\s+day|(first|second|third|fourth|fifth|sixth|seventh)\s+day)\s*[\]】)）]?/i);
  if (m) {
    const n = +(m[1] || m[2] || m[3] || m[4] || m[5]) || WORD_NUM[(m[6] || '').toLowerCase()];
    if (n) return { day: n, ...withDate(s.slice(m[0].length), year) };
  }
  // 日付だけの見出し（12/2(水)・12月2日・Dec 2・2 December・Tuesday, December 2・2026-12-02）
  const d = dateAtStart(s, year);
  if (d && !/\d{1,2}[:時h]\d{0,2}/i.test(d.rest.slice(0, 8))) return { date: d.date, rest: d.rest };
  return null;
}
function withDate(rest: string, year: number) {
  const r = rest.replace(/^[\s:.\-–—|,]+/, '');
  const inner = r.match(/^[(（]([^)）]+)[)）]\s*/) ?? r.match(/^()/);
  const d = dateAtStart(inner?.[1] || r, year) ?? null;
  if (d) return { date: d.date, rest: (inner?.[1] ? r.slice(inner[0].length) : d.rest).replace(/^[\s:.\-–—|,]+/, '') };
  return { rest: r };
}
function dateAtStart(s0: string, year: number): { date: string; rest: string } | null {
  const s = s0.replace(/^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)/i, '');
  const mk = (y: number, mo: number, d: number, len: number) =>
    mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? { date: `${y}-${pad(mo)}-${pad(d)}`, rest: s.slice(len).replace(/^\s*[(（][^)）]{1,6}[)）]/, '').replace(/^[\s:.\-–—|,]+/, '') } : null;
  let m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (m) return mk(+m[1], +m[2], +m[3], m[0].length);
  m = s.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return mk(year, +m[1], +m[2], m[0].length);
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?![\d/:])/);
  if (m) return mk(year, +m[1], +m[2], m[0].length);
  m = s.match(/^([a-zéûäç]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b,?(?:\s+(\d{4}))?/i);
  if (m && MONTHS[m[1].toLowerCase()]) return mk(m[3] ? +m[3] : year, MONTHS[m[1].toLowerCase()], +m[2], m[0].length);
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th|er|\.)?\s+(?:de\s+)?([a-zéûäç]+)\.?(?:\s+(?:de\s+)?(\d{4}))?\b/i);
  if (m && MONTHS[m[2].toLowerCase()]) return mk(m[3] ? +m[3] : year, MONTHS[m[2].toLowerCase()], +m[1], m[0].length);
  return null;
}

// 時刻：9:00 / 9.30am / 9am / 9 a.m. / 14h30 / 21時 / 9時半 / 午後2時 / 오후 2시
const T = String.raw`(?:(午前|午後|오전|오후|上午|下午|晚上)\s*)?(\d{1,2})(?:\s*[:h時시点]\s*(\d{2}|半)?\s*[分분]?|(?=\s*[ap]\.?\s*m\b))\s*([ap])?\.?\s*(?:m\b\.?)?`;
const TIME_AT = new RegExp(`^[~約]?\\s*${T}(?:\\s*(?:-|~|to|à|a|bis|until|から|부터|至)\\s*${T})?`, 'i');
function toHHMM(pre: string | undefined, h: string, mi: string | undefined, ap: string | undefined, bare: boolean) {
  let hh = +h;
  const mm = mi === '半' ? 30 : mi ? +mi : 0;
  if (bare && !ap && !pre) return null; // 「9」だけは時刻とみなさない
  if (/午後|오후|下午|晚上/.test(pre ?? '') || (ap && /p/i.test(ap))) hh = hh < 12 ? hh + 12 : hh;
  if (ap && /a/i.test(ap) && hh === 12) hh = 0;
  if (hh > 24 || mm > 59) return null;
  return `${pad(hh % 24)}:${pad(mm)}`;
}
function readTime(s: string): { time?: string; endTime?: string; rest: string } | null {
  const m = s.match(TIME_AT);
  if (!m || !m[2]) return null;
  const bare1 = m[3] === undefined && !/[:h時시点]/i.test(m[0].slice(0, m[0].indexOf(m[2]) + m[2].length + 2));
  // 終わりだけ am/pm のとき（9-11am）は始まりにも当てる
  const ap1 = m[4] || (m[8] && !m[1] && +m[2] <= +(m[6] ?? 0) ? m[8] : undefined);
  const time = toHHMM(m[1], m[2], m[3], ap1, bare1 && !ap1);
  if (!time) return null;
  const endTime = m[6] ? toHHMM(m[5], m[6], m[7], m[8], false) ?? undefined : undefined;
  return { time, endTime, rest: s.slice(m[0].length).replace(/^[\s:.\-–—|,)）\]]+/, '') };
}
/** 行の終わりのかっこ内の時刻（Louvre (10:00-12:00)） */
function trailingTime(s: string) {
  const m = s.match(/[(（]\s*([^()（）]*\d{1,2}\s*[:h時][^()（）]*)[)）]\s*$/i);
  if (!m) return null;
  const t = readTime(m[1].trim());
  return t ? { ...t, rest: s.slice(0, m.index).trim() } : null;
}
function readSlot(s: string): { time: string; rest: string } | null {
  for (const [re, time] of SLOTS) {
    const m = s.match(re);
    if (m) {
      const rest = s.slice(m[0].length);
      // 「朝食をとる」のように文の一部なら時間帯の見出しとはみなさない（区切りか終わりが必要）
      if (rest && !/^\s*(?:[:\-–—|)）\]】]|[(（][^)）]*[)）]|$)/.test(rest)) {
        // 日本語・韓国語・中国語の「午前 〇〇」は区切りなしでも時間帯。英語などの「Lunch near…」は文の一部
        if (!(/^\s/.test(rest) && /[^\x00-\x7f]/.test(m[0]) && !/^[a-zà-ÿ]/i.test(m[0]))) continue;
      }
      const inner = rest.match(/^\s*[(（]([^)）]*)[)）]/);
      const t2 = inner ? readTime(inner[1].trim()) : null;
      return { time: t2?.time ?? time, rest: rest.slice(inner ? inner[0].length : 0).replace(/^[\s:.\-–—|)）\]】]+/, '') };
    }
  }
  return null;
}

const PLACE_LABEL = /^(?:場所|住所|所在地|最寄り?駅?|アクセス|location|address|where|venue|adresse|lieu|dirección|ubicación|indirizzo|luogo|endereço|local|ort|주소|장소|地址|地点)\s*[:]\s*/i;
const MEMO_LABEL = /^(?:料金|費用|予算|値段|入場料|所要時間|ポイント|ヒント|メモ|備考|注意|cost|price|budget|fee|tip|tips|note|notes|why|duration|prix|coût|precio|kosten|preis|prezzo|preço|비용|요금|팁|费用|价格|提示)\s*[:]\s*/i;
const TIPS_HEAD = /^(?:tips?|notes?|budget|cost|summary|packing|getting around|transport(?:ation)?|before you go|general|extra|bonus|持ち物|予算|費用|注意|ポイント|まとめ|補足|移動|交通|おすすめ|준비물|예산|팁|小贴士|预算|注意事项)(?=$|[\s:(（\-&、,])/i;

// 場所らしい部分（「〇〇へ」「at 〇〇」「〇〇で」）
const placeOf = (s: string) =>
  s.match(/(?:\b[Aa]t|\b[Ii]n|\b[Vv]isit|\b[Ee]xplore|\b[Tt]o|@)\s+(?:the\s+)?([A-ZÀ-Ý][^,.;()!?]{2,40})/)?.[1]?.trim() ??
  s.match(/^([^、。,]{2,30}?)(?:へ移動|へ|に行く|を観光|を散策|を見学|を訪れる|で昼食|でランチ|で夕食|でディナー|で朝食)/)?.[1]?.trim();

/** 表の1行をセルに */
const cells = (line: string) =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => stripDeco(c.trim()));

/** 旅程の文章を予定の下書きに。日付の見出しがなければ1日目として扱う */
export function parseItinerary(text: string, start?: string): PlanDraft[] {
  const year = Number((start ?? new Date().toISOString()).slice(0, 4));
  const lines = normalize(text.replace(/\r/g, '')).split('\n');
  const out: PlanDraft[] = [];
  let day = 1;
  let date: string | undefined = start;
  let sawDay = false;
  let inTips = false;
  let slot: string | undefined; // 「午前」の見出しの下にある、時刻のない予定に使う
  let table: { day: number; time: number; title: number; place: number; memo: number } | null = null;
  let lastDate: string | undefined;

  const setDay = (h: { day?: number; date?: string }) => {
    if (h.day) {
      day = h.day;
      date = h.date ?? (start ? shiftDate(start, h.day - 1) : undefined);
    } else if (h.date) {
      if (sawDay || out.length) day += h.date !== lastDate ? 1 : 0;
      date = h.date;
    }
    lastDate = date;
    sawDay = true;
    inTips = false;
    slot = undefined;
  };
  const guessed = new WeakSet<PlanDraft>();
  const push = (p: Omit<PlanDraft, 'day' | 'date'> & { day?: number; date?: string }) => {
    let title = stripDeco(p.title).replace(/^[:\-–—|,.\s]+/, '').replace(/[:\-–—|,\s]+$/, '');
    let memo = p.memo;
    let place = p.place;
    // 「ルーヴル美術館 - 世界最大の…」「Louvre: …」はタイトルと説明に分ける
    const sp = title.match(/^(.{2,40}?)(?:\s+[-–—|]\s+|:\s+|。|\.\s+(?=[A-Z]))(.{4,})$/);
    if (sp) {
      title = sp[1].trim();
      memo = [sp[2].trim(), memo].filter(Boolean).join('\n');
    }
    const pl = title.match(/^(.*?)\s*(?:@|📍)\s*(.+)$/);
    if (pl && pl[1]) {
      title = pl[1].trim();
      place = place ?? pl[2].trim();
    }
    if (!title || title.length < 2) return;
    const d: PlanDraft = { day: p.day ?? day, date: p.date ?? date, time: p.time, endTime: p.endTime, title: title.slice(0, 60), memo: memo ? memo.slice(0, 400) : undefined, place: place ?? placeOf(title) ?? (memo ? placeOf(memo) : undefined) };
    if (!place && d.place) guessed.add(d); // タイトルから推測した場所（あとで「場所：」の行があればそちらを優先）
    out.push(d);
  };
  const addMemo = (txt: string) => {
    const last = out[out.length - 1];
    if (!last) return;
    const t = stripDeco(txt);
    if (!t) return;
    if (PLACE_LABEL.test(t)) {
      // 「場所：」「住所：」と書いてあれば、タイトルから推測した場所より優先する
      if (!last.place || guessed.has(last)) {
        last.place = t.replace(PLACE_LABEL, '').trim().slice(0, 120);
        guessed.delete(last);
      }
      return;
    }
    last.memo = [last.memo, t.replace(MEMO_LABEL, (m) => m.replace(/\s*:\s*$/, ': '))].filter(Boolean).join('\n').slice(0, 400);
  };

  for (const raw of lines) {
    if (!raw.trim()) {
      table = null;
      continue;
    }
    // ---------- 表（Markdown の | 区切り） ----------
    if (/^\s*\|.*\|/.test(raw)) {
      const c = cells(raw);
      if (c.every((x) => /^:?-{2,}:?$/.test(x) || !x)) continue; // 区切りの行
      const head = c.map((x) => x.toLowerCase());
      const col = (re: RegExp) => head.findIndex((h) => re.test(h));
      if (!table && col(/時間|時刻|time|hora|heure|uhrzeit|orario|시간|时间|^day$|^日$|日付|date|日程|予定|activity|activities|plan|what|内容|スポット|場所|place|location/) >= 0 && !c.some((x) => readTime(x))) {
        table = {
          day: col(/^(day|日|日目|日付|date|日程|day ?\/ ?date|giorno|tag|jour|día|일차|날짜|日期)$/),
          time: col(/時間|時刻|time|hora|heure|uhrzeit|orario|시간|时间/),
          title: col(/予定|内容|activity|activities|plan|what|スポット|やること|観光|itinerary|programme|actividad|aktivität|attività|atividade|일정|활동|活动|行程/),
          place: col(/場所|place|location|where|lieu|lugar|ort|luogo|local|장소|地点/),
          memo: col(/メモ|備考|ポイント|詳細|notes?|details?|tips?|cost|費用|料金|説明|description|remarques|notas|hinweise|note|비고|备注|说明/),
        };
        if (table.title < 0) table.title = table.place >= 0 ? table.place : c.findIndex((_, i) => i !== table!.time && i !== table!.day);
        continue;
      }
      if (table) {
        if (table.day >= 0 && c[table.day]) {
          const h = readDayHead(c[table.day], year);
          if (h && (h.day ? h.day !== day || !sawDay : h.date !== date)) setDay(h);
        }
        const tt = table.time >= 0 ? (readTime(c[table.time]) ?? readSlot(c[table.time])) : null;
        const title = c[table.title] ?? '';
        if (title) {
          push({
            title,
            time: tt?.time,
            endTime: tt && 'endTime' in tt ? (tt as any).endTime : undefined,
            place: table.place >= 0 && table.place !== table.title ? c[table.place] || undefined : undefined,
            memo: table.memo >= 0 ? c[table.memo] || undefined : undefined,
          });
        }
        continue;
      }
      // 見出しのない表：「時刻 | 予定」のような形
      const tt = readTime(c[0]);
      if (tt && c[1]) {
        push({ title: c[1], time: tt.time, endTime: tt.endTime, memo: c.slice(2).filter(Boolean).join(' / ') || undefined });
        continue;
      }
    } else table = null;

    const indent = (raw.match(/^(\s*)/)?.[1] ?? '').replace(/\t/g, '    ').length;
    const isBullet = /^\s*(?:[-*•・●○◆◇■□▶▷►→✓✔]|\d{1,2}[.)]\s|[①-⑳])/.test(raw);
    const isHeading = /^\s*#/.test(raw) || /^\s*\*\*[^*]+\*\*\s*:?\s*$/.test(raw) || /^\s*【[^】]+】\s*$/.test(raw);
    const line = stripDeco(stripLead(raw));
    if (!line) continue;

    // ---------- 日の見出し ----------
    const dh = line.length <= 80 && !(indent >= 2 && isBullet) ? readDayHead(line, year) : null;
    if (dh) {
      setDay(dh);
      // 「Day 1: 10:00 ルーヴル」のように同じ行に予定があるとき
      const tr = dh.rest ? readTime(dh.rest) : null;
      if (tr && tr.rest) push({ title: tr.rest, time: tr.time, endTime: tr.endTime });
      continue;
    }
    // 旅程以外のまとめ（持ち物・予算・ヒント）は読み飛ばす
    if (!(indent >= 2 && isBullet) && !/:\s*\S/.test(line) && (isHeading || /:\s*$/.test(line) || line.length <= 14) && TIPS_HEAD.test(line.replace(/^[^\p{L}]+/u, ''))) {
      if (sawDay || out.length) inTips = true;
      continue;
    }
    if (inTips) continue;

    // ---------- 入れ子の説明（字下げされた箇条書き）は直前の予定のメモ ----------
    if (indent >= 2 && isBullet && out.length && !readTime(line)) {
      addMemo(line);
      continue;
    }

    // ---------- 時刻のある予定 ----------
    const tm = readTime(line) ?? trailingTime(line);
    if (tm && tm.rest) {
      const sl = readSlot(tm.rest);
      push({ title: sl && sl.rest ? sl.rest : tm.rest, time: tm.time, endTime: tm.endTime });
      continue;
    }
    // ---------- 時間帯（午前・Morning） ----------
    const sl = readSlot(line);
    if (sl) {
      if (!sl.rest) {
        slot = sl.time; // 見出しだけ：下の予定に使う
        continue;
      }
      const t2 = readTime(sl.rest);
      push({ title: t2?.rest || sl.rest, time: t2?.time ?? sl.time, endTime: t2?.endTime });
      continue;
    }
    if (isHeading) {
      // 日の見出しでも時間帯でもない見出し（例：「パリ到着」）は、その日の予定がまだなければ説明として残す
      continue;
    }
    // ---------- 時刻のない箇条書きの予定 ----------
    if (isBullet && (sawDay || slot)) {
      if (PLACE_LABEL.test(line) || MEMO_LABEL.test(line)) {
        addMemo(line);
        continue;
      }
      push({ title: line, time: slot });
      continue;
    }
    // ---------- 説明の文は直前の予定のメモへ ----------
    const last = out[out.length - 1];
    if (last && last.day === day) addMemo(line);
  }
  return out;
}
