import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Query } from "firebase-admin/firestore";
// gateway integrations removed
// compat import removed
import { mirrorJournalToEntries } from "./lib/mirrorJournalEntries.js";
import { postPayment } from "./lib/postPayment.js";
import * as logger from "firebase-functions/logger";
// import { defineSecret } from "firebase-functions/params";

initializeApp();
const db = getFirestore();
// No gateway secrets

// ------------------------- tiny utils -------------------------
const TZ = "Asia/Manila";
const S = (v: any) => String(v ?? "");

function ymd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfYear(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

// --------------- common helpers (names, settings, sequences) ---------------
function buildMemberDisplayName(v: any): string {
  const first = String(v?.firstName || "").trim();
  const mid = String(v?.middleName || "").trim();
  const last = String(v?.lastName || "").trim();
  const dn = String(v?.displayName || "").trim();
  if (first && last) {
    const mi = mid ? `${mid[0].toUpperCase()}.` : "";
    return [first, mi, last].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  if (dn) return dn;
  return [first, last].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

async function getAccountingSettings(): Promise<any> {
  const snap = await db.doc("settings/accounting").get();
  return snap.exists ? snap.data() : {};
}

async function nextSequence(key: "receipts" | "journals") {
  const ref = db.doc(`sequences/${key}`);
  const res = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const v = cur.exists ? (cur.data() as any) : { next: 1 };
    const next = Number(v.next || 1);
    tx.set(ref, { next: next + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  return res;
}

async function resolveMainAccountByName(mainName: "Share Capital" | "Loan Receivable") {
  // Prefer a canonical main row where individual == ""
  const q1 = await db
    .collection("accounts")
    .where("main", "==", mainName)
    .where("individual", "==", "")
    .limit(1)
    .get();
  if (!q1.empty) return { id: q1.docs[0].id, ...(q1.docs[0].data() as any) };
  // Fallback: any row under the main
  const q2 = await db.collection("accounts").where("main", "==", mainName).limit(1).get();
  if (!q2.empty) return { id: q2.docs[0].id, ...(q2.docs[0].data() as any) };
  throw new Error(`Main account not found: ${mainName}`);
}

async function getOrCreateMemberSubaccount(params: {
  mainName: "Share Capital" | "Loan Receivable";
  memberUid: string;
  memberName: string;
}) {
  const { mainName, memberUid, memberName } = params;
  const main = await resolveMainAccountByName(mainName);

  // Try by ownerUid
  const byOwner = await db
    .collection("accounts")
    .where("main", "==", mainName)
    .where("ownerUid", "==", memberUid)
    .limit(1)
    .get();
  if (!byOwner.empty) return { id: byOwner.docs[0].id, ...(byOwner.docs[0].data() as any) };

  // Try by exact individual name
  const byName = await db
    .collection("accounts")
    .where("main", "==", mainName)
    .where("individual", "==", memberName)
    .limit(1)
    .get();
  if (!byName.empty) return { id: byName.docs[0].id, ...(byName.docs[0].data() as any) };

  // Determine next code among siblings
  let nextCode: number | undefined = undefined;
  try {
    const sibs = await db
      .collection("accounts")
      .where("main", "==", mainName)
      .orderBy("code", "desc")
      .limit(25)
      .get();
    let max = 0;
    let saw = false;
    for (const d of sibs.docs) {
      const c = (d.data() as any).code;
      if (c != null) {
        saw = true;
        const n = typeof c === "number" ? c : parseInt(String(c).replace(/\D+/g, ""), 10);
        if (!Number.isNaN(n)) max = Math.max(max, n);
      }
    }
    if (saw) nextCode = max + 1;
  } catch {}

  const payload = {
    code: nextCode,
    main: mainName,
    individual: memberName,
    type: main.type || (mainName === "Share Capital" ? "Equity" : "Asset"),
    description: "",
    archived: false,
    ownerUid: memberUid || null,
    createdAt: FieldValue.serverTimestamp(),
  } as any;
  const ref = await db.collection("accounts").add(payload);
  return { id: ref.id, ...payload };
}

async function getAccounts() {
  const snap = await db.collection("accounts").orderBy("code").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
}

async function getEntriesByDateRange(from?: string | null, to?: string | null) {
  const col = db.collection("journalEntries");
  // try indexed range
  try {
    let q: Query = col as unknown as Query;
    if (from) q = q.where("date", ">=", from);
    if (to) q = q.where("date", "<=", to);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  } catch {
    // fall back to local filter
    const snap = await col.orderBy("date", "asc").get();
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    return all.filter((j) => {
      const d = S(j.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }
}

function money(n: any) {
  return Number(n || 0);
}

// ------------------------- TRIAL BALANCE -------------------------
async function rebuildTB(today: string) {
  const periodStart = startOfYear();
  const periodEnd = today;

  const accounts = await getAccounts();
  const entries = await getEntriesByDateRange(periodStart, periodEnd);

  // sum per accountId
  const sums = new Map<string, { debit: number; credit: number }>();
  entries.forEach((e) => {
    (e.lines || []).forEach((l: any) => {
      const s = sums.get(l.accountId) || { debit: 0, credit: 0 };
      s.debit += money(l.debit);
      s.credit += money(l.credit);
      sums.set(l.accountId, s);
    });
  });

  const rows = accounts.map((acc) => {
    const s = sums.get(acc.id) || { debit: 0, credit: 0 };
    return {
      id: acc.id,
      code: acc.code,
      name: acc.main + (acc.individual ? " / " + acc.individual : ""),
      debit: s.debit,
      credit: s.credit,
    };
  });

  const totals = rows.reduce(
    (t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }),
    { debit: 0, credit: 0 }
  );

  await db.doc("financialReports/auto_TB").set(
    {
      id: "auto_TB",
      type: "trial_balance",
      label: "Trial Balance",
      periodStart,
      periodEnd,
      createdAt: FieldValue.serverTimestamp(),
      payload: { rows, totals },
    },
    { merge: true }
  );
  return { periodStart, periodEnd, totals };
}

// ------------------------- INCOME STATEMENT -------------------------
function isRevenueType(t: any) {
  const v = S(t).toLowerCase();
  return v === "revenue" || v === "income";
}
function isExpenseType(t: any) {
  return S(t).toLowerCase() === "expense";
}
function isCOGSAccount(acc: any) {
  return S(acc.main).trim().toLowerCase() === "cogs";
}

async function rebuildIS(today: string) {
  // open-begin → today (we’ll label “as of” using from==to)
  const from = today;
  const to = today;

  const accounts = await getAccounts();
  const entries = await getEntriesByDateRange(undefined, to);

  const revenueAcc = accounts.filter((a) => isRevenueType(a.type));
  const expenseAcc = accounts.filter((a) => isExpenseType(a.type));
  const cogsAcc = expenseAcc.filter(isCOGSAccount);
  const opExAcc = expenseAcc.filter((a) => !isCOGSAccount(a));

  // fast lookup
  const groupAmount = (accList: any[]) => {
    return accList.map((acc) => {
      let debit = 0,
        credit = 0;
      entries.forEach((e) =>
        (e.lines || []).forEach((l: any) => {
          if (l.accountId === acc.id) {
            debit += money(l.debit);
            credit += money(l.credit);
          }
        })
      );
      const isRev = isRevenueType(acc.type);
      const amount = isRev ? credit - debit : debit - credit;
      return {
        code: acc.code,
        name: acc.main + (acc.individual ? " / " + acc.individual : ""),
        amount,
      };
    });
  };

  const revenues = groupAmount(revenueAcc);
  const cogs = groupAmount(cogsAcc);
  const expenses = groupAmount(opExAcc);

  const totalRevenue = revenues.reduce((s, a) => s + a.amount, 0);
  const totalCOGS = cogs.reduce((s, a) => s + a.amount, 0);
  const grossProfit = totalRevenue - totalCOGS;
  const totalExpense = expenses.reduce((s, a) => s + a.amount, 0);
  const netIncome = grossProfit - totalExpense;

  await db.doc("financialReports/auto_IS").set(
    {
      id: "auto_IS",
      type: "income_statement",
      label: "Income Statement",
      from,
      to, // from==to ⇒ “as of …” in your UI
      createdAt: FieldValue.serverTimestamp(),
      payload: {
        sections: { revenues, cogs, expenses },
        totals: { totalRevenue, totalCOGS, grossProfit, totalExpense, netIncome },
      },
    },
    { merge: true }
  );

  return { netIncome, to };
}

// ------------------------- BALANCE SHEET -------------------------
async function rebuildBS(today: string, netIncome: number) {
  const asOf = today;
  const accounts = await getAccounts();
  const entries = await getEntriesByDateRange(undefined, asOf);

  function sumAsOf(acc: any) {
    let debit = 0,
      credit = 0;
    entries.forEach((e) =>
      (e.lines || []).forEach((l: any) => {
        if (l.accountId === acc.id) {
          debit += money(l.debit);
          credit += money(l.credit);
        }
      })
    );
    if (S(acc.type).toLowerCase() === "asset") return debit - credit;
    if (["liability", "equity"].includes(S(acc.type).toLowerCase()))
      return credit - debit;
    return 0;
  }

  const viewRow = (acc: any) => ({
    id: acc.id,
    code: acc.code,
    name: acc.main + (acc.individual ? " / " + acc.individual : ""),
    amount: sumAsOf(acc),
  });

  const assets = accounts.filter((a) => S(a.type).toLowerCase() === "asset").map(viewRow);
  const liabilities = accounts.filter((a) => S(a.type).toLowerCase() === "liability").map(viewRow);
  const equityBase = accounts.filter((a) => S(a.type).toLowerCase() === "equity").map(viewRow);

  const totalsBase = {
    assets: assets.reduce((s, r) => s + r.amount, 0),
    liabilities: liabilities.reduce((s, r) => s + r.amount, 0),
    equityExRetained: equityBase.reduce((s, r) => s + r.amount, 0),
  };

  // previous saved BS retained (periodic, not auto)
  let prevRetained = 0;
  try {
    const snap = await db
      .collection("financialReports")
      .where("type", "in", ["balance_sheet", "balanceSheet"])
      .get();
    const list = snap.docs
      .filter((d) => d.id !== "auto_BS")
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .map((r) => ({
        asOf: r.asOf || r.to || r.from || "",
        retained:
          Number(r?.report?.retainedIncomeEnding ?? r?.payload?.retainedIncomeEnding ?? 0) || 0,
      }))
      .filter((r) => r.asOf && r.asOf < asOf)
      .sort((a, b) => a.asOf.localeCompare(b.asOf));
    if (list.length) prevRetained = list[list.length - 1].retained;
  } catch {}

  const retainedIncomeEnding = prevRetained + Number(netIncome || 0);
  const equity = [...equityBase, { id: "_retained", code: "", name: "Retained Income / Loss", amount: retainedIncomeEnding }];
  const totalEquity = totalsBase.equityExRetained + retainedIncomeEnding;
  const liabPlusEquity = totalsBase.liabilities + totalEquity;

  await db.doc("financialReports/auto_BS").set(
    {
      id: "auto_BS",
      type: "balance_sheet",
      label: "Balance Sheet",
      from: asOf,
      to: asOf,
      createdAt: FieldValue.serverTimestamp(),
      payload: {
        sections: { assets, liabilities, equity },
        totals: {
          assets: totalsBase.assets,
          liabilities: totalsBase.liabilities,
          equityExRetained: totalsBase.equityExRetained,
          equity: totalEquity,
          liabPlusEquity,
        },
        retainedIncomeEnding,
      },
    },
    { merge: true }
  );

  return {
    beginCash: 0, // filled by CF step using prior BS
    endCash: assets.reduce((s, r) =>
      S(r.name).toLowerCase().includes("cash") ? s + r.amount : s, 0),
  };
}

// ------------------------- CASH FLOW -------------------------
function sumByName(rows: any[] = [], needles: string[] = []) {
  const ns = needles.map((x) => x.toLowerCase());
  return rows.reduce((sum, r) => {
    const nm = S(r.name).toLowerCase();
    return sum + (ns.some((n) => nm.includes(n)) ? Number(r.amount || 0) : 0);
  }, 0);
}

async function rebuildCF(today: string, netIncome: number) {
  // END from auto_BS
  const endSnap = await db.doc("financialReports/auto_BS").get();
  const end = endSnap.exists ? (endSnap.data() as any) : null;
  if (!end?.payload?.sections) throw new Error("auto_BS not ready");

  const endAsOf = end.to || today;
  const assetsE = end.payload.sections.assets || [];
  const equityE = end.payload.sections.equity || [];
  const endVals = {
    cash: sumByName(assetsE, ["cash"]),
    loanRecv: sumByName(assetsE, ["loan receivable"]),
    inventory: sumByName(assetsE, ["inventory", "rice inventory"]),
    shareCap: sumByName(equityE, ["share capital"]),
  };

  // BEGIN = latest saved (periodic) BS before today
  let beginVals = { cash: 0, loanRecv: 0, inventory: 0, shareCap: 0 };
  let beginAsOf = "";
  try {
    const snap = await db
      .collection("financialReports")
      .where("type", "in", ["balance_sheet", "balanceSheet"])
      .get();
    const list = snap.docs
      .filter((d) => d.id !== "auto_BS")
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .map((r) => ({
        asOf: r.asOf || r.to || r.from || "",
        assets: r?.report?.assets || r?.payload?.sections?.assets || [],
        equity: r?.report?.equity || r?.payload?.sections?.equity || [],
      }))
      .filter((r) => r.asOf && r.asOf < today)
      .sort((a, b) => a.asOf.localeCompare(b.asOf));
    if (list.length) {
      const b = list[list.length - 1];
      beginAsOf = b.asOf;
      beginVals = {
        cash: sumByName(b.assets, ["cash"]),
        loanRecv: sumByName(b.assets, ["loan receivable"]),
        inventory: sumByName(b.assets, ["inventory", "rice inventory"]),
        shareCap: sumByName(b.equity, ["share capital"]),
      };
    }
  } catch {}

  const dLoan = endVals.loanRecv - beginVals.loanRecv;
  const dInv = endVals.inventory - beginVals.inventory;
  const dWC = dLoan + dInv;
  const dSC = endVals.shareCap - beginVals.shareCap;

  const CFO = Number(netIncome || 0) - dWC;
  const CFI = 0;
  const CFF = dSC;

  const payload = {
    method: "vbaStyle",
    inputs: { begin: beginVals, end: endVals, netIncome },
    deltas: {
      loanReceivable: dLoan,
      inventory: dInv,
      workingCapital: dWC,
      shareCapital: dSC,
    },
    sections: {
      operating: { netIncome, net: CFO },
      investing: { net: CFI },
      financing: { net: CFF },
    },
    summary: {
      startCash: beginVals.cash,
      endCash: endVals.cash,
      netChangeCash: endVals.cash - beginVals.cash,
    },
  };

  await db.doc("financialReports/auto_CF").set(
    {
      id: "auto_CF",
      type: "cash_flow",
      label: "Cash Flow",
      from: beginAsOf || "—",
      to: endAsOf || today,
      createdAt: FieldValue.serverTimestamp(),
      payload,
    },
    { merge: true }
  );
}

// ------------------------- orchestrator -------------------------
async function runAllAutos() {
  const today = ymd(new Date());
  await rebuildTB(today);
  const is = await rebuildIS(today);
  await rebuildBS(today, is.netIncome);
  await rebuildCF(today, is.netIncome);
}

// basic role helper used by some callables
async function isAdminLike(uid: string): Promise<boolean> {
  try {
    const prof = await db.doc(`profiles/${uid}`).get();
    const roles = Array.isArray((prof.data() as any)?.roles) ? (prof.data() as any).roles : [];
    if (roles.includes("admin") || roles.includes("staff") || roles.includes("treasurer")) return true;
    const u = await db.doc(`users/${uid}`).get();
    const r2 = Array.isArray((u.data() as any)?.roles) ? (u.data() as any).roles : [];
    return r2.includes("admin") || r2.includes("staff") || r2.includes("treasurer");
  } catch {
    return false;
  }
}

// 1) Scheduled: every 1:00 AM Asia/Manila
export const scheduledDailyAutoReports = onSchedule(
  { schedule: "0 1 * * *", timeZone: TZ, region: "asia-southeast1" },
  async () => {
    await runAllAutos();
  }
);

// 2) Optional manual trigger (useful while testing)
export const rebuildAutosNow = onCall({ region: "asia-southeast1" }, async (_req) => {
  await runAllAutos();
  return { ok: true };
});

// 3) Payments → Journal posting
export const onPaymentStatusPaid = onDocumentWritten(
  { region: "asia-east1", document: "payments/{paymentId}" },
  async (event) => {
    const before = event.data?.before?.data() as any;
    const after = event.data?.after?.data() as any;
    const paymentId = event.params?.paymentId as string;

    if (!after) return; // deleted
    const prevStatus = before?.status || "";
    const nextStatus = after?.status || "";
    if (prevStatus === "paid" || nextStatus !== "paid") return; // not our transition

    await postPayment(paymentId).catch((e) => logger.error("onPaymentStatusPaid error", { paymentId, error: e?.message || String(e) }));
  }
);

// 4) Admin-triggered retry posting for a payment
export const repostPayment = onCall({ region: "asia-east1" }, async (req) => {
  const uid = req.auth?.uid || "";
  if (!uid) throw new Error("auth required");
  const paymentId = String((req.data as any)?.paymentId || "").trim();
  if (!paymentId) throw new Error("paymentId required");

  // basic role check: admin or staff
  try {
    const prof = await db.doc(`profiles/${uid}`).get();
    const roles = Array.isArray((prof.data() as any)?.roles) ? (prof.data() as any).roles : [];
    if (!roles.includes("admin") && !roles.includes("staff") && !roles.includes("treasurer")) {
      const u = await db.doc(`users/${uid}`).get();
      const r2 = Array.isArray((u.data() as any)?.roles) ? (u.data() as any).roles : [];
      if (!r2.includes("admin") && !r2.includes("staff") && !r2.includes("treasurer")) throw new Error("permission denied");
    }
  } catch {
    throw new Error("permission denied");
  }

  const res = await postPayment(paymentId).catch((e) => {
    logger.error("repostPayment failed", { paymentId, error: e?.message || String(e) });
    return { ok: false } as any;
  });
  return res || { ok: false };
});

// Scheduled sweeper to retry failed/stuck postings every 10 minutes
export const scheduledPostingSweeper = onSchedule(
  { schedule: "*/10 * * * *", timeZone: TZ, region: "asia-southeast1" },
  async () => {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;
    const snap = await db
      .collection("payments")
      .where("status", "==", "paid")
      .limit(500)
      .get();
    let scanned = 0,
      retried = 0;
    for (const d of snap.docs) {
      scanned++;
      const p = d.data() as any;
      const posting = p.posting || {};
      const attempts = Number(posting.attempts || 0);
      if (attempts >= 5) continue;
      const st = String(posting.status || "");
      const lastStartedAt = (posting.lastStartedAt as any)?.toDate?.() as Date | undefined;
      const lastStartedMs = lastStartedAt ? lastStartedAt.getTime() : 0;
      const shouldRetry = st === "failed" || st === "" || (st === "posting" && lastStartedMs && lastStartedMs < fiveMinAgo);
      if (shouldRetry) {
        await postPayment(d.id).catch(() => {});
        retried++;
      }
    }
    logger.info("scheduledPostingSweeper done", { scanned, retried });
  }
);

// Online payment integrations removed (PayMongo/Xendit).

// Journal entry mirror remains
export const onJournalEntryCreated = onDocumentCreated(
  { region: "asia-east1", document: "journalEntries/{journalId}" },
  async (event) => {
  const data = event.data?.data() as any;
  const journalId = String(event.params?.journalId || "");
  if (!data || !journalId) return;
  // Enforce Timestamp date + zero-padded IDs via helper
  await mirrorJournalToEntries(db, journalId, data);
  }
);

// 6) Backfill: generate journalEntryLines for existing journalEntries headers
export const backfillJournalEntryLines = onCall({ region: "asia-east1" }, async (req) => {
  const uid = req.auth?.uid || "";
  if (!uid) throw new Error("auth required");

  // Optional basic role check (profiles/{uid}.roles contains 'admin' or 'staff')
  try {
    const prof = await db.doc(`profiles/${uid}`).get();
    const roles = Array.isArray((prof.data() as any)?.roles) ? (prof.data() as any).roles : [];
    if (!roles.includes("admin") && !roles.includes("staff")) {
      // fallback: allow if user doc has admin
      const u = await db.doc(`users/${uid}`).get();
      const r2 = Array.isArray((u.data() as any)?.roles) ? (u.data() as any).roles : [];
      if (!r2.includes("admin") && !r2.includes("staff")) {
        throw new Error("permission denied");
      }
    }
  } catch (e) {
    throw new Error("permission denied");
  }

  // Optional days filter (not strictly needed; we process all for simplicity)
  const days = Number((req.data as any)?.days || 0);
  const cutoffDate = days > 0 ? new Date(Date.now() - days * 86400000) : null;
  let scanned = 0;
  let wrote = 0;

  // Cache for accounts denorm
  const accCache = new Map<string, { code?: any; main?: any; individual?: any }>();
  async function getAcc(accId?: string) {
    const id = String(accId || "");
    if (!id) return null;
    if (accCache.has(id)) return accCache.get(id)!;
    try {
      const snap = await db.doc(`accounts/${id}`).get();
      const v = snap.exists ? (snap.data() as any) : null;
      const denorm = v ? { code: v.code, main: v.main, individual: v.individual } : {};
      accCache.set(id, denorm);
      return denorm;
    } catch {
      const denorm = {} as any;
      accCache.set(id, denorm);
      return denorm;
    }
  }

  // Read all headers (could be optimized with pagination if needed)
  const snap = await db.collection("journalEntries").get();
  for (const docSnap of snap.docs) {
    const h = docSnap.data() as any;
    scanned++;
    if (cutoffDate) {
      const createdAt = (h?.createdAt as any)?.toDate?.() || null;
      if (createdAt && createdAt < cutoffDate) continue;
    }
    if (Array.isArray(h?.lines) && h.lines.length) {
      await mirrorJournalToEntries(db, docSnap.id, h);
      wrote += h.lines.length;
    }
  }
  return { ok: true, scanned, wrote };
});

// 7) Optional: Remirror recent journals with Timestamp date normalization
export const remirrorRecentJournals = onCall({ region: "asia-east1" }, async (req) => {
  const uid = req.auth?.uid || "";
  if (!uid) throw new Error("auth required");

  // basic role check
  try {
    const prof = await db.doc(`profiles/${uid}`).get();
    const roles = Array.isArray((prof.data() as any)?.roles) ? (prof.data() as any).roles : [];
    if (!roles.includes("admin") && !roles.includes("staff")) {
      const u = await db.doc(`users/${uid}`).get();
      const r2 = Array.isArray((u.data() as any)?.roles) ? (u.data() as any).roles : [];
      if (!r2.includes("admin") && !r2.includes("staff")) throw new Error("permission denied");
    }
  } catch {
    throw new Error("permission denied");
  }

  const limit = Number((req.data as any)?.limit || 200);
  const sinceDays = Number((req.data as any)?.sinceDays || 30);
  const sinceMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

  // Prefer createdAt range when available; fall back to all and local filter
  let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [] as any;
  try {
    const q = db
      .collection("journalEntries")
      .where("createdAt", ">=", (FieldValue as any).serverTimestamp() as any); // placeholder; will fail
    await q.get();
  } catch {
    // We’ll just read all and filter locally due to lack of a stable serverTimestamp compare in code
  }
  const snap = await db.collection("journalEntries").orderBy("createdAt", "desc").limit(limit).get().catch(async () => {
    // Fallback if index/order missing
    return await db.collection("journalEntries").get();
  });
  docs = snap.docs;

  let processed = 0;
  for (const d of docs) {
    const j = d.data() as any;
    const createdAt = (j?.createdAt as any)?.toDate?.() as Date | undefined;
    if (createdAt && createdAt.getTime() < sinceMs) continue;
    if (Array.isArray(j?.lines) && j.lines.length) {
      await mirrorJournalToEntries(db, d.id, j);
      processed++;
    }
  }
  return { ok: true, scanned: docs.length, processed };
});

// ------------------------- Settlements posting -------------------------
export const postSettlement = onCall({ region: "asia-southeast1" }, async (req) => {
  const uid = req.auth?.uid || "";
  if (!uid) throw new Error("auth required");
  // basic admin check
  const isAdmin = await isAdminLike(uid);
  if (!isAdmin) throw new Error("permission denied");

  const settlementId = String((req.data as any)?.settlementId || "").trim();
  if (!settlementId) throw new Error("settlementId required");

  const sref = db.doc(`settlements/${settlementId}`);
  const ss = await sref.get();
  if (!ss.exists) throw new Error("settlement not found");
  const stl = ss.data() as any;

  const settings = await getAccountingSettings();
  const bankId = stl.bankAccountId || settings?.gateway?.defaultSettlementBankId || settings?.cashAccounts?.bankDefaultId || settings?.cashAccountId || "";
  const clearingId = settings?.gateway?.clearingAccountId || "";
  const feesId = settings?.gateway?.feesExpenseId || "";
  const taxesId = settings?.gateway?.taxesExpenseId || "";
  if (!bankId || !clearingId) throw new Error("Missing bank or clearing account in settings");

  const gross = Number(stl.gross || 0);
  const fees = Number(stl.fees || 0);
  const taxes = Number(stl.taxes || 0);
  const net = Number(stl.net || gross - fees - taxes);
  if (net <= 0 || gross <= 0) throw new Error("Invalid settlement amounts");

  const journalId = `stl_${settlementId}`;
  const jref = db.doc(`journalEntries/${journalId}`);
  const existing = await jref.get();
  if (existing.exists) {
    await sref.set({ posted: true, journalId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, journalId, alreadyPosted: true };
  }

  const date = stl.date ? (stl.date as any) : FieldValue.serverTimestamp();
  const dateStr = typeof (date as any)?.toDate === "function" ? (date as any).toDate().toISOString().slice(0, 10) : ymd(new Date());

  const lines: any[] = [];
  // DR Bank (net)
  lines.push({ accountId: bankId, debit: net, credit: 0, memo: "Settlement net" });
  // DR Fees
  if (fees > 0) {
    if (!feesId) throw new Error("feesExpenseId not set in settings");
    lines.push({ accountId: feesId, debit: fees, credit: 0, memo: "Gateway fees" });
  }
  // DR Taxes on Fees (optional)
  if (taxes > 0) {
    if (!taxesId) throw new Error("taxesExpenseId not set in settings");
    lines.push({ accountId: taxesId, debit: taxes, credit: 0, memo: "Taxes on fees" });
  }
  // CR Clearing (gross)
  lines.push({ accountId: clearingId, debit: 0, credit: gross, memo: "Clear gross" });

  await db.runTransaction(async (tx) => {
    tx.set(jref, {
      date: dateStr,
      description: `Settlement ${stl.provider || "gateway"} ${stl.reference || settlementId}`,
      lines,
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: uid,
    });
    tx.set(sref, { posted: true, journalId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  return { ok: true, journalId };
});
