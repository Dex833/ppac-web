import { onSchedule } from "firebase-functions/v2/scheduler";
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
