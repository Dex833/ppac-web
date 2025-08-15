import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Query } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

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

    // Idempotency: existing journal linked to this payment?
    const existing = await db
      .collection("journalEntries")
      .where("linkedPaymentId", "==", paymentId)
      .limit(1)
      .get();
    if (!existing.empty) return;

    // Optional soft lock
    const lockRef = db.doc(`locks/payments_${paymentId}`);
    try {
      await db.runTransaction(async (tx) => {
        const l = await tx.get(lockRef);
        if (l.exists) throw new Error("locked");
        tx.set(lockRef, { at: FieldValue.serverTimestamp() });
      });
    } catch (e) {
      // another worker is handling
      return;
    }

    // Load member profile/name
    const userId = after.userId || after.uid || after.memberUid;
    let memberName = "";
    try {
      const m = await db.doc(`members/${userId}`).get();
      if (m.exists) memberName = buildMemberDisplayName(m.data());
      if (!memberName) {
        const u = await db.doc(`users/${userId}`).get();
        if (u.exists) memberName = buildMemberDisplayName(u.data());
      }
    } catch {}
    memberName = memberName || "Member";

    // Settings
    const settings = await getAccountingSettings();
    const cashId = settings?.cashAccountId;
    const membershipFeeIncomeId = settings?.membershipFeeIncomeId;
    const salesRevenueId = settings?.salesRevenueId;
    const interestIncomeId = settings?.interestIncomeId;

    // Build journal lines based on type
    const type = String(after.type || "").toLowerCase();
    const method = after.method || "cash";
    const referenceNo = after.referenceNo || after.refNo || "";
    const confirmedAt = after.confirmedAt || FieldValue.serverTimestamp();
    const dateStr = after.confirmedAt ? ymd((after.confirmedAt as any).toDate?.() || new Date()) : ymd(new Date());
    const amount = Number(after.amount || 0);

    const lines: any[] = [];

    // Ensure cash account
    if (!cashId) {
      await db.doc(`payments/${paymentId}`).set({ postingError: { at: FieldValue.serverTimestamp(), message: "Missing cashAccountId in settings/accounting" } }, { merge: true });
      return;
    }

    function addDebit(accountId: string, value: number, memo?: string) {
      if (value && value !== 0) lines.push({ accountId, debit: value, credit: 0, memo: memo || undefined });
    }
    function addCredit(accountId: string, value: number, memo?: string) {
      if (value && value !== 0) lines.push({ accountId, debit: 0, credit: value, memo: memo || undefined });
    }

    try {
      if (type === "membership_fee") {
        if (!membershipFeeIncomeId) throw new Error("Missing membershipFeeIncomeId in settings/accounting");
        addDebit(cashId, amount, `method: ${method}, ref: ${referenceNo}`);
        addCredit(membershipFeeIncomeId, amount, "membership fee");
      } else if (type === "share_capital") {
        const sub = await getOrCreateMemberSubaccount({ mainName: "Share Capital", memberUid: userId, memberName });
        addDebit(cashId, amount, `method: ${method}, ref: ${referenceNo}`);
        addCredit(sub.id, amount, "share capital contribution");
      } else if (type === "purchase") {
        if (!salesRevenueId) throw new Error("Missing salesRevenueId in settings/accounting");
        addDebit(cashId, amount, `method: ${method}, ref: ${referenceNo}`);
        addCredit(salesRevenueId, amount, "sales");
      } else if (type === "loan_repayment") {
        const principal = Number(after.principalPortion ?? after.amount ?? 0);
        const interest = Number(after.interestPortion ?? 0);
        const total = principal + interest;
        if (total <= 0) throw new Error("Loan repayment total is zero");
        if (interest > 0 && !interestIncomeId) throw new Error("Missing interestIncomeId in settings/accounting");
        const sub = await getOrCreateMemberSubaccount({ mainName: "Loan Receivable", memberUid: userId, memberName });
        addDebit(cashId, total, `method: ${method}, ref: ${referenceNo}`);
        addCredit(sub.id, principal, "loan principal repayment");
        if (interest > 0) addCredit(interestIncomeId, interest, "loan interest");
      } else {
        // Other payments can be configured later
        throw new Error(`Unsupported payment type: ${type}`);
      }

      const sumD = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const sumC = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
      if (Math.abs(sumD - sumC) > 0.0001) throw new Error("Unbalanced journal");

      // Create journal with sequences and optional server-issued receiptNo
      await db.runTransaction(async (tx) => {
        const journalNo = await nextSequence("journals");
        const receiptNo = await nextSequence("receipts");
        const jRef = db.collection("journalEntries").doc();
        tx.set(jRef, {
          journalNo,
          date: dateStr,
          description: `Payment: ${type} | ref ${referenceNo} | user ${memberName} | method ${method}`,
          linkedPaymentId: paymentId,
          lines,
          createdAt: FieldValue.serverTimestamp(),
          createdByUid: after.confirmedBy || null,
          confirmedAt: confirmedAt,
        });
        tx.set(db.doc(`payments/${paymentId}`), {
          receiptNo: String(receiptNo),
          postingError: FieldValue.delete(),
        }, { merge: true });
      });
    } catch (e: any) {
      await db.doc(`payments/${paymentId}`).set(
        { postingError: { at: FieldValue.serverTimestamp(), message: e?.message || String(e) } },
        { merge: true }
      );
    } finally {
      // release lock
      try { await db.recursiveDelete ? (db as any).recursiveDelete(lockRef) : lockRef.delete(); } catch {}
    }
  }
);
