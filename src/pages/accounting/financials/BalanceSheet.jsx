import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  where,
  limit,
  serverTimestamp,
} from "firebase/firestore";

/* -------------------- hooks -------------------- */
function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      setAccounts(
        snap.docs
          .filter((d) => !d.data().archived)
          .map((d) => ({ id: d.id, ...d.data() }))
      );
    });
    return () => unsub();
  }, []);
  return accounts;
}

function useJournalEntries() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);
  return { entries, loading };
}

function useIncomeStatementReports() {
  const [isReports, setIsReports] = useState([]);
  useEffect(() => {
    const qIS = query(
      collection(db, "incomeStatementReports"),
      orderBy("to", "desc")
    );
    const unsub = onSnapshot(qIS, (snap) => {
      setIsReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  return isReports;
}

function useBalanceSheetReports() {
  const [bsReports, setBsReports] = useState([]);
  useEffect(() => {
    const qBS = query(
      collection(db, "balanceSheetReports"),
      orderBy("asOf", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(qBS, (snap) => {
      setBsReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  return bsReports;
}

/* -------------------- utils -------------------- */
function formatRange(from, to) {
  if (!from && !to) return "-";
  if (from && !to) return from;
  if (!from && to) return to;
  return `${from} → ${to}`;
}
const typeOf = (acc) => (acc.type || "").toLowerCase();

function filterEntriesUpTo(entries, asOf) {
  if (!asOf) return [];
  return entries.filter((e) => {
    const d = e.date || "";
    return d && d <= asOf; // YYYY-MM-DD compare
  });
}

function getAccountBalanceAsOf(acc, entriesUpTo) {
  let debit = 0,
    credit = 0;
  entriesUpTo.forEach((entry) => {
    (entry.lines || []).forEach((line) => {
      if (line.accountId === acc.id) {
        debit += parseFloat(line.debit) || 0;
        credit += parseFloat(line.credit) || 0;
      }
    });
  });
  // Asset: debit - credit; Liability/Equity: credit - debit
  const t = typeOf(acc);
  if (t === "asset") return debit - credit;
  return credit - debit;
}

/* -------------------- main -------------------- */
export default function BalanceSheet() {
  const accounts = useAccounts();
  const { entries, loading } = useJournalEntries();
  const isReports = useIncomeStatementReports();
  const bsReports = useBalanceSheetReports();

  const [selectedISId, setSelectedISId] = useState("");
  const [selectedIS, setSelectedIS] = useState(null); // { id, from, to, report:{ netIncome, ... } }
  const [asOf, setAsOf] = useState("");               // YYYY-MM-DD (IS 'to')
  const [prevNotice, setPrevNotice] = useState("");
  const [previousBS, setPreviousBS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showReport, setShowReport] = useState(null); // when viewing a saved BS

  // set selected IS
  useEffect(() => {
    const found = isReports.find((r) => r.id === selectedISId) || null;
    setSelectedIS(found || null);
    setAsOf(found?.to || "");
    setShowReport(null); // leave view mode when choosing a new IS
  }, [selectedISId, isReports]);

  // pull previous BS (asOf < selected asOf)
  useEffect(() => {
    async function fetchPrev() {
      setPrevNotice("");
      setPreviousBS(null);
      if (!asOf) return;
      try {
        const qPrev = query(
          collection(db, "balanceSheetReports"),
          where("asOf", "<", asOf),
          orderBy("asOf", "desc"),
          limit(1)
        );
        const snap = await getDocs(qPrev);
        if (!snap.empty) {
          const d = snap.docs[0];
          setPreviousBS({ id: d.id, ...d.data() });
        } else {
          setPrevNotice(
            'No prior Balance Sheet, this will be your first period. Beginning balances are 0. Ending balances are as of the selected IS end date.'
          );
        }
      } catch (e) {
        setPrevNotice(
          'No prior Balance Sheet, this will be your first period. Beginning balances are 0. Ending balances are as of the selected IS end date.'
        );
      }
    }
    fetchPrev();
  }, [asOf]);

  // compute balances only when IS chosen or when showing a saved report
  const entriesUpTo = useMemo(
    () => filterEntriesUpTo(entries, asOf),
    [entries, asOf]
  );

  const assets = useMemo(
    () => accounts.filter((a) => typeOf(a) === "asset"),
    [accounts]
  );
  const liabilities = useMemo(
    () => accounts.filter((a) => typeOf(a) === "liability"),
    [accounts]
  );
  const equityAccounts = useMemo(
    () => accounts.filter((a) => typeOf(a) === "equity"),
    [accounts]
  );

  const assetRows = useMemo(
    () =>
      assets.map((acc) => ({
        acc,
        amount: selectedIS ? getAccountBalanceAsOf(acc, entriesUpTo) : 0,
      })),
    [assets, entriesUpTo, selectedIS]
  );
  const liabilityRows = useMemo(
    () =>
      liabilities.map((acc) => ({
        acc,
        amount: selectedIS ? getAccountBalanceAsOf(acc, entriesUpTo) : 0,
      })),
    [liabilities, entriesUpTo, selectedIS]
  );
  const equityRows = useMemo(
    () =>
      equityAccounts.map((acc) => ({
        acc,
        amount: selectedIS ? getAccountBalanceAsOf(acc, entriesUpTo) : 0,
      })),
    [equityAccounts, entriesUpTo, selectedIS]
  );

  const totalAssets = useMemo(
    () => assetRows.reduce((s, r) => s + r.amount, 0),
    [assetRows]
  );
  const totalLiabilities = useMemo(
    () => liabilityRows.reduce((s, r) => s + r.amount, 0),
    [liabilityRows]
  );

  const prevRetained =
    previousBS?.report?.retainedIncomeEnding != null
      ? Number(previousBS.report.retainedIncomeEnding) || 0
      : 0;
  const isNetIncome = selectedIS?.report?.netIncome ?? 0;
  const retainedIncomeEnding = prevRetained + isNetIncome;

  const totalEquityExRetained = useMemo(
    () => equityRows.reduce((s, r) => s + r.amount, 0),
    [equityRows]
  );
  const totalEquity = totalEquityExRetained + (selectedIS ? retainedIncomeEnding : 0);
  const totalLiabEquity = totalLiabilities + totalEquity;

  async function handleGenerateAndSave() {
    if (!selectedIS) return;
    setSaving(true);
    try {
      const report = {
        asOf,
        sourceIS: {
          id: selectedIS.id,
          from: selectedIS.from || "",
          to: selectedIS.to || "",
          netIncome: isNetIncome,
        },
        prevRetained,
        retainedIncomeEnding,
        totals: {
          assets: totalAssets,
          liabilities: totalLiabilities,
          equityExRetained: totalEquityExRetained,
          equity: totalEquity,
          liabPlusEquity: totalLiabEquity,
        },
        // optional detail lines (handy if you want to review later)
        assets: assetRows.map(({ acc, amount }) => ({
          code: acc.code,
          name: acc.main + (acc.individual ? " / " + acc.individual : ""),
          amount,
        })),
        liabilities: liabilityRows.map(({ acc, amount }) => ({
          code: acc.code,
          name: acc.main + (acc.individual ? " / " + acc.individual : ""),
          amount,
        })),
        equity: equityRows.map(({ acc, amount }) => ({
          code: acc.code,
          name: acc.main + (acc.individual ? " / " + acc.individual : ""),
          amount,
        })),
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "balanceSheetReports"), {
        asOf,
        report,
      });

      // after save: clear prior notice state (list will refresh via onSnapshot)
      alert("Balance Sheet saved.");
    } catch (e) {
      console.error(e);
      alert("Failed to save Balance Sheet.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBS(id) {
    if (!id) return;
    if (!window.confirm("Delete this saved Balance Sheet?")) return;
    await deleteDoc(doc(db, "balanceSheetReports", id));
  }

  function handleShowSavedBS(r) {
    setShowReport(r);          // show saved report
    setSelectedISId("");       // clear IS picker to emphasize we're viewing a saved one
  }

  /* -------------------- render -------------------- */
  // If viewing a saved report, take values from it
  const view = showReport?.report;
  const viewAsOf = showReport?.asOf;

  const showSaved = Boolean(view);

  const viewTotals = showSaved
    ? view.totals
    : {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equityExRetained: totalEquityExRetained,
        equity: totalEquity,
        liabPlusEquity: totalLiabEquity,
      };

  const viewRetained = showSaved ? view.retainedIncomeEnding : retainedIncomeEnding;
  const viewAssets = showSaved ? view.assets : assetRows.map(({ acc, amount }) => ({
    code: acc.code,
    name: acc.main + (acc.individual ? " / " + acc.individual : ""),
    amount,
  }));
  const viewLiabs = showSaved ? view.liabilities : liabilityRows.map(({ acc, amount }) => ({
    code: acc.code,
    name: acc.main + (acc.individual ? " / " + acc.individual : ""),
    amount,
  }));
  const viewEquity = showSaved ? view.equity : equityRows.map(({ acc, amount }) => ({
    code: acc.code,
    name: acc.main + (acc.individual ? " / " + acc.individual : ""),
    amount,
  }));

  return (
    <div className="flex gap-8">
      <div className="flex-1">
        <h3 className="text-xl font-semibold mb-3">Balance Sheet</h3>

        {/* Selector + actions */}
        <div className="mb-4 p-3 border rounded bg-gray-50">
          <label className="block text-sm font-medium mb-1">
            Select Income Statement (sets Balance Sheet period)
          </label>
          <div className="flex gap-2 items-center">
            <select
              className="border rounded px-2 py-1 min-w-[280px]"
              value={selectedISId}
              onChange={(e) => setSelectedISId(e.target.value)}
            >
              <option value="">— Choose an Income Statement report —</option>
              {isReports.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatRange(r.from, r.to)} • Net Income:{" "}
                  {(r.report?.netIncome ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </option>
              ))}
            </select>

            {selectedIS && (
              <>
                <span className="text-sm text-gray-700">
                  As of: <strong>{asOf}</strong>
                </span>
                <button
                  onClick={handleGenerateAndSave}
                  disabled={saving || loading}
                  className="ml-2 bg-green-600 text-white px-3 py-2 rounded font-semibold"
                >
                  {saving ? "Saving…" : "Generate & Save"}
                </button>
              </>
            )}

            {showSaved && (
              <span className="text-sm text-gray-700">
                Viewing saved BS • as of <strong>{viewAsOf}</strong>
              </span>
            )}
          </div>

          {!selectedIS && !showSaved && (
            <p className="mt-2 text-xs text-gray-600">
              Pick an Income Statement to generate a Balance Sheet as of that end date,
              then click <em>Generate &amp; Save</em>.
            </p>
          )}
        </div>

        {/* Show BS only after IS is picked OR when viewing a saved one */}
        {!selectedIS && !showSaved ? (
          <div className="text-gray-500 text-sm">No report selected.</div>
        ) : loading ? (
          <div>Loading…</div>
        ) : (
          <>
            {!showSaved && prevNotice && (
              <div className="mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm text-yellow-900">
                {prevNotice}
              </div>
            )}

            <div className="mb-3 text-sm text-gray-700">
              <div>
                <span className="font-semibold">Period (as of):</span>{" "}
                {showSaved ? viewAsOf : asOf}
              </div>
              <div>
                <span className="font-semibold">Retained Income/Loss:</span>{" "}
                {viewRetained.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                {!showSaved && (
                  <span className="text-gray-500">
                    {" "}
                    (Prior retained{" "}
                    {(previousBS?.report?.retainedIncomeEnding || 0).toLocaleString(
                      undefined,
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                    )}
                    {" + "}Net income{" "}
                    {(isNetIncome || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    )
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-8">
              {/* Assets */}
              <div className="flex-1 min-w-[300px]">
                <table className="min-w-full border border-gray-300 rounded text-sm mb-6">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 border-b">Assets</th>
                      <th className="text-right p-2 border-b">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewAssets.map((row, i) => (
                      <tr key={row.code + i}>
                        <td className="p-2 border-b border-r border-gray-200">
                          {row.code} - {row.name}
                        </td>
                        <td className="p-2 border-b text-right">
                          {Number(row.amount || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-gray-100">
                      <td className="p-2 border-t text-right">Total Assets</td>
                      <td className="p-2 border-t text-right">
                        {Number(viewTotals.assets || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Liabilities & Equity */}
              <div className="flex-1 min-w-[300px]">
                <table className="min-w-full border border-gray-300 rounded text-sm mb-6">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 border-b">Liabilities & Equity</th>
                      <th className="text-right p-2 border-b">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Liabilities */}
                    <tr>
                      <td colSpan={2} className="font-bold p-2">
                        Liabilities
                      </td>
                    </tr>
                    {viewLiabs.map((row, i) => (
                      <tr key={row.code + i}>
                        <td className="p-2 border-b border-r border-gray-200">
                          {row.code} - {row.name}
                        </td>
                        <td className="p-2 border-b text-right">
                          {Number(row.amount || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="p-2 border-t border-r border-gray-200 text-right">
                        Total Liabilities
                      </td>
                      <td className="p-2 border-t text-right">
                        {Number(viewTotals.liabilities || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>

                    {/* Equity */}
                    <tr>
                      <td colSpan={2} className="font-bold p-2">
                        Equity
                      </td>
                    </tr>
                    {viewEquity.map((row, i) => (
                      <tr key={row.code + i}>
                        <td className="p-2 border-b border-r border-gray-200">
                          {row.code} - {row.name}
                        </td>
                        <td className="p-2 border-b text-right">
                          {Number(row.amount || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}

                    {/* Retained Income/Loss */}
                    <tr className="bg-gray-50">
                      <td className="p-2 border-b border-r border-gray-200">
                        Retained Income/Loss
                      </td>
                      <td className="p-2 border-b text-right">
                        {Number(viewRetained || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>

                    <tr className="font-bold">
                      <td className="p-2 border-t border-r border-gray-200 text-right">
                        Total Equity
                      </td>
                      <td className="p-2 border-t text-right">
                        {Number(viewTotals.equity || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>

                    <tr className="font-bold bg-gray-100">
                      <td className="p-2 border-t border-r border-gray-200 text-right">
                        Total Liabilities &amp; Equity
                      </td>
                      <td className="p-2 border-t text-right">
                        {Number(viewTotals.liabPlusEquity || 0).toLocaleString(
                          undefined,
                          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right sidebar: Recent BS Reports */}
      <div className="w-80">
        <h4 className="text-lg font-semibold mb-2">Recent Reports</h4>
        <ul className="space-y-2">
          {bsReports.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between border border-gray-200 rounded px-3 py-2"
            >
              <button
                className="text-left truncate"
                onClick={() => handleShowSavedBS(r)}
                title={`as of ${r.asOf}`}
              >
                as of {r.asOf}
              </button>

              <button
                className="ml-2 px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteBS(r.id);
                }}
              >
                Delete
              </button>
            </li>
          ))}
          {bsReports.length === 0 && (
            <li className="text-sm text-gray-500">No saved balance sheets yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
