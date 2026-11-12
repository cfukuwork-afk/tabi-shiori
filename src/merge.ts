// 共有した旅行のまとめ方（サーバーと同じ考え方）：項目ごとに、あとから変えた方を採用する
import { Trip } from './data';

const COLLECTIONS = ['bookings', 'expenses', 'checklist', 'members', 'wishes', 'inbox'] as const;
const META = ['name', 'emoji', 'cover', 'budget'] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 前と後を比べて、変わった項目に時刻を、消えた項目に「消した記録」をつける */
export function stamp(prev: Trip | undefined, next: Trip, at = Date.now()): Trip {
  if (!prev || prev === next) return next;
  const out: any = { ...next };
  const tomb = { ...(next.tomb ?? prev.tomb ?? {}) };
  let changed = false;
  for (const key of COLLECTIONS) {
    const before = new Map(((prev as any)[key] ?? []).filter((x: any) => x?.id).map((x: any) => [x.id, x]));
    const after: any[] = ((next as any)[key] ?? []).filter((x: any) => x?.id);
    const ids = new Set(after.map((x) => x.id));
    out[key] = after.map((x) => {
      const old: any = before.get(x.id);
      const { u: _u1, ...a } = x;
      const { u: _u2, ...b } = old ?? {};
      if (!old || !same(a, b)) {
        changed = true;
        return { ...x, u: at };
      }
      return x;
    });
    for (const id of before.keys()) {
      if (!ids.has(id as string)) {
        tomb[id as string] = at;
        changed = true;
      }
    }
    if (!(next as any)[key] && !(prev as any)[key]) delete out[key];
  }
  const jp = prev.journal ?? {};
  const jn = next.journal ?? {};
  if (!same(jp, jn)) {
    const j: any = {};
    for (const [d, v] of Object.entries(jn)) {
      const { u: _a, ...x } = (v ?? {}) as any;
      const { u: _b, ...y } = ((jp as any)[d] ?? {}) as any;
      j[d] = same(x, y) && (jp as any)[d] ? v : { ...v, u: at };
    }
    out.journal = j;
    changed = true;
  }
  if (META.some((k) => !same((prev as any)[k], (next as any)[k]))) {
    out.metaU = at;
    changed = true;
  }
  if (!changed) return next;
  out.tomb = tomb;
  if (out.share) out.share = { ...out.share, dirty: true };
  return out;
}

/** 2つの版をまとめる（a=サーバー、b=手元。同じ時刻なら手元を優先） */
export function mergeTrip(a: Trip, b: Trip): Trip {
  const out: any = { ...a };
  const tomb: Record<string, number> = { ...(a.tomb ?? {}) };
  for (const [id, at] of Object.entries(b.tomb ?? {})) tomb[id] = Math.max(tomb[id] ?? 0, at);
  out.tomb = tomb;
  for (const key of COLLECTIONS) {
    const map = new Map<string, any>();
    const order: string[] = [];
    const put = (x: any) => {
      if (!x?.id) return;
      const cur = map.get(x.id);
      if (!cur) {
        map.set(x.id, x);
        order.push(x.id);
      } else if ((x.u ?? 0) >= (cur.u ?? 0)) map.set(x.id, x);
    };
    ((a as any)[key] ?? []).forEach(put);
    const bIds = ((b as any)[key] ?? []).map((x: any) => x?.id).filter(Boolean);
    ((b as any)[key] ?? []).forEach(put);
    const rest = order.filter((id) => !bIds.includes(id));
    out[key] = [...bIds.filter((id: string, i: number) => bIds.indexOf(id) === i), ...rest]
      .map((id) => map.get(id))
      .filter((x) => x && !(tomb[x.id] && tomb[x.id] >= (x.u ?? 0)));
  }
  const j: any = { ...(a.journal ?? {}) };
  for (const [d, v] of Object.entries(b.journal ?? {})) if (!j[d] || ((v as any)?.u ?? 0) >= (j[d].u ?? 0)) j[d] = v;
  out.journal = j;
  if ((b.metaU ?? 0) >= (a.metaU ?? 0)) {
    for (const k of META) out[k] = (b as any)[k];
    out.metaU = b.metaU;
  }
  out.id = b.id;
  out.share = b.share;
  out.myId = b.myId;
  return out as Trip;
}
