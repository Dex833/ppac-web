import { Timestamp } from "firebase/firestore";

// Accepts "YYYY-MM-DD" string OR Firestore Timestamp → returns JS Date at local midnight
export function normalizeToDate(d) {
  if (!d) return null;
  if (typeof d?.toDate === "function") return d.toDate();        // firestore Timestamp
  if (typeof d?.seconds === "number") return new Date(d.seconds * 1000);
  if (typeof d === "string") {
    // guard: YYYY-MM-DD → as local day start
    const [y, m, day] = d.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !day) return new Date(d); // fallback
    return new Date(y, m - 1, day, 0, 0, 0, 0);
  }
  if (d instanceof Date) return d;
  return null;
}

// Inclusive end-of-day of a "YYYY-MM-DD" string (Asia/Manila semantics done at string-level)
export function endOfDayIso(dateStr) {
  // keep as "YYYY-MM-DD 23:59:59.999" for string/ts compares if needed
  return `${dateStr}T23:59:59.999`;
}

// Extract posting lines from a journal doc.
// Adjust this mapping if your schema differs.
export function extractLines(j) {
  // Preferred shape: { lines: [{accountId, accountCode, accountName, debit, credit}, ...] }
  if (Array.isArray(j.lines)) return j.lines;

  // Fallback shape example: { debitAccountId, creditAccountId, amount }
  if (j.debitAccountId && j.creditAccountId && (j.amount || j.debit || j.credit)) {
    const amt = Number(j.amount || j.debit || j.credit || 0);
    return [
      { accountId: j.debitAccountId, accountCode: j.debitAccountCode, accountName: j.debitAccountName, debit: amt, credit: 0 },
      { accountId: j.creditAccountId, accountCode: j.creditAccountCode, accountName: j.creditAccountName, debit: 0, credit: amt },
    ];
  }

  // If single-row with {accountId, debit, credit}
  if (j.accountId && (j.debit || j.credit)) {
    return [{ accountId: j.accountId, accountCode: j.accountCode, accountName: j.accountName, debit: Number(j.debit || 0), credit: Number(j.credit || 0) }];
  }

  return [];
}

// Build rows [{code, name, debit, credit}] and totals from journals + (optional) accounts map
export function buildTrialBalanceRows(journals, accountsById = new Map()) {
  const acc = new Map(); // key: accountId → { code, name, debit, credit }

  for (const j of journals) {
    const lines = extractLines(j) || [];
    for (const ln of lines) {
      const id = ln.accountId || ln.account || ln.accId;
      if (!id) continue;

      const exist = acc.get(id) || { code: "", name: "", debit: 0, credit: 0 };
      // fill code/name from line or accounts lookup
      exist.code = ln.accountCode || exist.code || accountsById.get(id)?.code || "";
      exist.name = ln.accountName || exist.name || accountsById.get(id)?.name || "";
      exist.debit += Number(ln.debit || 0);
      exist.credit += Number(ln.credit || 0);
      acc.set(id, exist);
    }
  }

  // Convert to array and sort by code then name
  const rows = Array.from(acc.values()).sort((a, b) => {
    const ca = (a.code || "").toString();
    const cb = (b.code || "").toString();
    if (ca && cb && ca !== cb) return ca < cb ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  const totals = rows.reduce(
    (t, r) => {
      t.debit += r.debit;
      t.credit += r.credit;
      return t;
    },
    { debit: 0, credit: 0 }
  );

  return { rows, totals };
}