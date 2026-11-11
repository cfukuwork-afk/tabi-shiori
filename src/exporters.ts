// しおりPDF・割り勘のPDF/CSV
import { Trip, RateInfo, timeline, tripRange, daysBetween, fmtMoney, settle, expHome, toHome, tripTotal } from './data';
import { prettyDate, t, typeName, getLang } from './i18n';
import { csvCell, esc, sharePdf, shareTextFile } from './files';
import { TripWx, wxIcon } from './weather';

const CSS = `
@page{margin:14mm 12mm}*{box-sizing:border-box}body{font-family:-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif;color:#15171C;font-size:11pt;line-height:1.5;margin:0}
h1{font-size:22pt;margin:0 0 2pt;letter-spacing:-.3pt}.range{color:#8C9099;font-weight:700;margin-bottom:14pt}
.day{break-inside:avoid;margin:0 0 12pt;border-top:2pt solid #15171C;padding-top:6pt}.dh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4pt}
.dn{font-weight:900;font-size:13pt}.wx{color:#8C9099;font-size:9.5pt;font-weight:700}
.it{display:flex;gap:10pt;padding:5pt 0;border-bottom:.5pt solid #E8E5DF}.tm{width:42pt;font-weight:800;font-variant-numeric:tabular-nums}.ty{font-size:8.5pt;color:#8C9099;font-weight:800;letter-spacing:.5pt}
.ti{font-weight:800}.sm{color:#555;font-size:9.5pt}.code{font-family:Menlo,monospace;font-weight:800}.x{text-decoration:line-through;color:#aaa}
table{width:100%;border-collapse:collapse;margin:6pt 0 14pt}td,th{padding:5pt 4pt;border-bottom:.5pt solid #E8E5DF;text-align:left;font-size:10pt}th{color:#8C9099;font-size:8.5pt}.r{text-align:right;font-variant-numeric:tabular-nums}
h2{font-size:13pt;margin:16pt 0 4pt}.foot{margin-top:18pt;color:#aaa;font-size:8.5pt}`;

const wrap = (title: string, body: string) =>
  `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}<div class="foot">Tripfold</div></body></html>`;

export function shioriHtml(trip: Trip, wx?: TripWx | null) {
  const { start, end } = tripRange(trip);
  const days = timeline(trip)
    .map(({ date, items }) => {
      const w = wx?.days[date];
      const wtxt = w ? `${t(wxIcon(w.code).key)} ${w.max}° / ${w.min}°${w.rain != null ? ` · ☂ ${w.rain}%` : ''}` : '';
      const rows = items
        .map((it) => {
          const b = it.booking;
          const edge = it.edge === 'start' ? (b.type === 'hotel' ? t('checkin') : t('pickup')) : it.edge === 'end' ? (b.type === 'hotel' ? t('checkout') : t('dropoff')) : '';
          const place = it.edge !== 'end' && (b.from || b.to) ? `<div class="sm">${esc(b.from ?? '')}${b.to ? ' → ' + esc(b.to) : ''}</div>` : '';
          const code = b.code ? `<div class="sm">${esc(t('code'))}: <span class="code">${esc(b.code)}</span>${b.seat ? ` · ${esc(t('seat'))} ${esc(b.seat)}` : ''}</div>` : '';
          const memo = b.memo && it.edge !== 'end' ? `<div class="sm">${esc(b.memo).replace(/\n/g, '<br>')}</div>` : '';
          return `<div class="it"><div class="tm">${esc(it.time ?? '')}</div><div style="flex:1"><div class="ty">${esc(typeName(b.type))}${edge ? ' · ' + esc(edge) : ''}</div><div class="ti ${b.cancelled ? 'x' : ''}">${esc(b.title || '')}</div>${place}${code}${memo}</div></div>`;
        })
        .join('');
      const n = start ? t('dayN', { n: daysBetween(start, date) + 1 }) + ' · ' : '';
      return `<div class="day"><div class="dh"><div class="dn">${esc(n + prettyDate(date))}</div><div class="wx">${esc(wtxt)}</div></div>${rows}</div>`;
    })
    .join('');
  const pack = trip.checklist.filter((c) => c.kind !== 'gift');
  const packHtml = pack.length ? `<h2>${esc(t('tabPack'))}</h2><div class="sm">${pack.map((c) => `${c.done ? '☑' : '☐'} ${esc(c.text)}`).join('　')}</div>` : '';
  return wrap(
    trip.name,
    `<h1>${esc(trip.name)}</h1><div class="range">${start ? esc(prettyDate(start)) : ''}${end && end !== start ? ' – ' + esc(prettyDate(end)) : ''}</div>${days || `<p>${esc(t('emptyPlan'))}</p>`}${packHtml}`,
  );
}

export const exportShioriPdf = (trip: Trip, wx?: TripWx | null) => sharePdf(trip.name, shioriHtml(trip, wx));

/** 割り勘の明細（予約＋出費） */
function lines(trip: Trip, r: RateInfo) {
  const name = (id?: string) => trip.members.find((m) => m.id === (id ?? trip.members[0]?.id))?.name ?? '';
  return [
    ...trip.bookings.filter((b) => b.price && !b.cancelled).map((b) => ({ date: b.start, title: b.title, amount: b.price!, cur: b.currency || r.base, home: toHome(b.price!, b.currency || r.base, r), by: name(b.paidBy), split: (b.splitWith?.length ? b.splitWith : trip.members.map((m) => m.id)).map(name).join(' / ') })),
    ...(trip.expenses ?? []).map((e) => ({ date: e.date, title: e.title, amount: e.amount, cur: e.currency, home: expHome(e, r), by: name(e.paidBy), split: (e.splitWith?.length ? e.splitWith : trip.members.map((m) => m.id)).map(name).join(' / ') })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function settleHtml(trip: Trip, r: RateInfo) {
  const st = settle(trip, r);
  const name = (id: string) => esc(trip.members.find((m) => m.id === id)?.name ?? '');
  const pay = st.pay.length ? st.pay.map((p) => `<tr><td>${name(p.from)} → ${name(p.to)}</td><td class="r"><b>${fmtMoney(Math.round(p.amount * 100) / 100, r.base)}</b></td></tr>`).join('') : `<tr><td>${esc(t('settled'))}</td><td></td></tr>`;
  const per = trip.members.map((m) => `<tr><td>${esc(m.name)}</td><td class="r">${fmtMoney(st.paid[m.id] ?? 0, r.base)}</td><td class="r">${fmtMoney(st.owe[m.id] ?? 0, r.base)}</td></tr>`).join('');
  const rows = lines(trip, r).map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(l.title)}</td><td class="r">${fmtMoney(l.amount, l.cur)}</td><td class="r">${fmtMoney(l.home, r.base)}</td><td>${esc(l.by)}</td><td class="sm">${esc(l.split)}</td></tr>`).join('');
  return wrap(
    trip.name + ' ' + t('settle'),
    `<h1>${esc(trip.name)}</h1><div class="range">${esc(t('settle'))} · ${esc(t('total'))} ${fmtMoney(tripTotal(trip, r), r.base)}</div>
<h2>${esc(t('whoPays'))}</h2><table>${pay}</table>
<h2>${esc(t('perPerson'))}</h2><table><tr><th></th><th class="r">${esc(t('paidCol'))}</th><th class="r">${esc(t('shareCol'))}</th></tr>${per}</table>
<h2>${esc(t('details'))}</h2><table><tr><th>${esc(t('date'))}</th><th></th><th class="r">${esc(t('price'))}</th><th class="r">${esc(r.base)}</th><th>${esc(t('paidBy'))}</th><th>${esc(t('splitWith'))}</th></tr>${rows}</table>`,
  );
}

export const exportSettlePdf = (trip: Trip, r: RateInfo) => sharePdf(`${trip.name}-${t('settle')}`, settleHtml(trip, r));

export function exportSettleCsv(trip: Trip, r: RateInfo) {
  const head = [t('date'), t('title'), t('price'), 'currency', r.base, t('paidBy'), t('splitWith')];
  const body = lines(trip, r).map((l) => [l.date, l.title, l.amount, l.cur, Math.round(l.home * 100) / 100, l.by, l.split]);
  const csv = '﻿' + [head, ...body].map((row) => row.map(csvCell).join(',')).join('\n');
  return shareTextFile(`${trip.name}-${t('settle')}.csv`, csv, 'text/csv');
}

/** 思い出を1冊に：日ごとの写真と文（写真は小さくしてPDFの中に入れる） */
export async function exportMemoryBook(trip: Trip, toDataUri: (u: string) => Promise<string | null>) {
  const { start, end } = tripRange(trip);
  const days = Object.entries(trip.journal ?? {})
    .filter(([, j]) => j?.text || j?.photos?.length)
    .sort(([a], [b]) => a.localeCompare(b));
  const cover = trip.cover ? await toDataUri(trip.cover) : null;
  let body = `<div style="page-break-after:always;min-height:240mm;display:flex;flex-direction:column;justify-content:flex-end">${
    cover ? `<img src="${cover}" style="width:100%;height:150mm;object-fit:cover;border-radius:10pt;margin-bottom:14pt">` : ''
  }<h1 style="font-size:30pt">${esc(trip.name)}</h1><div class="range">${start ? esc(prettyDate(start)) : ''}${end && end !== start ? ' – ' + esc(prettyDate(end)) : ''}</div></div>`;
  for (const [date, j] of days) {
    const imgs: string[] = [];
    for (const p of (j.photos ?? []).slice(0, 6)) {
      const d = await toDataUri(p);
      if (d) imgs.push(d);
    }
    const n = start ? t('dayN', { n: daysBetween(start, date) + 1 }) + ' · ' : '';
    const grid = imgs.length
      ? `<div style="display:grid;grid-template-columns:${imgs.length === 1 ? '1fr' : '1fr 1fr'};gap:6pt;margin:8pt 0">${imgs
          .map((d) => `<img src="${d}" style="width:100%;height:${imgs.length === 1 ? '120mm' : '62mm'};object-fit:cover;border-radius:6pt">`)
          .join('')}</div>`
      : '';
    body += `<div style="break-inside:avoid;margin-bottom:18pt"><div class="dn" style="border-top:2pt solid #15171C;padding-top:6pt">${esc(n + prettyDate(date))}</div>${grid}${
      j.text ? `<p style="font-size:12pt;line-height:1.8;white-space:pre-wrap">${esc(j.text)}</p>` : ''
    }</div>`;
  }
  if (!days.length) body += `<p>${esc(t('noMemories'))}</p>`;
  return sharePdf(`${trip.name}-${t('memoryBook')}`, wrap(trip.name, body));
}

/** World Budget Book（家計簿アプリ）へ：自分が払った分を CSV で */
export function exportBudgetCsv(trip: Trip) {
  const me = trip.myId ?? trip.members[0]?.id;
  const mine = (by?: string) => trip.members.length <= 1 || (by ?? trip.members[0]?.id) === me;
  const rows = [
    ...trip.bookings.filter((b) => b.price && !b.cancelled && mine(b.paidBy)).map((b) => [b.id, b.start, b.price, b.currency || 'JPY', b.type, `${trip.name} ${b.title || typeName(b.type)}`]),
    ...(trip.expenses ?? []).filter((e) => mine(e.paidBy)).map((e) => [e.id, e.date, e.amount, e.currency, e.cat, `${trip.name} ${e.title}`]),
  ];
  const csv = '﻿' + [['tripfold_id', 'date', 'amount', 'currency', 'category', 'memo'], ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  return shareTextFile(`${trip.name}-tripfold.csv`, csv, 'text/csv');
}
