// src/lib/bookkeeping.js

/** Parse "YYYY-MM-DD" (or other common types) into JS Date */
export function normalizeToDate(d) {
  if (!d) return null;
  if (typeof d?.toDate === "function") return d.toDate();           // Firestore Timestamp
  if (typeof d?.seconds === "number") return new Date(d.seconds * 1000);
  if (d instanceof Date) return d;
  if (typeof d === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

export function endOfDayIso(dateStr) {
  return `${dateStr}T23:59:59.999`;
}

/** Your journal entry shape: lines[] with { accountId, debit, credit } */
export function extractLines(j) {
  const arr = j?.lines;
  if (!Array.isArray(arr)) return [];
  return arr.map((ln) => ({
    accountId: ln.accountId,
    debit: Number(ln.debit || 0),
    credit: Number(ln.credit || 0),
  }));
}

/** Build TB rows/totals. Name uses accounts.main + optional " / " + individual */
export function buildTrialBalanceRows(journals, accountsById = new Map()) {
  const agg = new Map(); // accountId -> { code, name, debit, credit }

  for (const j of journals) {
    const lines = extractLines(j);
    for (const ln of lines) {
      const id = ln.accountId;
      if (!id) continue;

      const cur = agg.get(id) || { code: "", name: "", debit: 0, credit: 0 };
      const acc = accountsById.get(id) || {};

      // code (from accounts)
      cur.code = cur.code || acc.code || "";

      // name = main + optional " / individual"
      const displayName =
        acc.main ? acc.main + (acc.individual ? ` / ${acc.individual}` : "") : "";
      cur.name = cur.name || displayName;

      cur.debit += Number(ln.debit || 0);
      cur.credit += Number(ln.credit || 0);
      agg.set(id, cur);
    }
  }

  const rows = Array.from(agg.values()).sort((a, b) => {
    const ca = String(a.code || "");
    const cb = String(b.code || "");
    if (ca && cb && ca !== cb) return ca < cb ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  const totals = rows.reduce(
    (t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }),
    { debit: 0, credit: 0 }
  );

  return { rows, totals };
}