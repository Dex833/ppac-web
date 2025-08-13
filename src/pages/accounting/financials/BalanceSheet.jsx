import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// --- tiny helpers ---
const fmt = (d) => new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD
const peso = (n) =>
  (Number(n) || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" });

// Try to read net income from an IS report payload in a few common shapes
function extractNetIncome(isReport) {
  const p = isReport?.payload || {};
  return (
    p?.totals?.netIncome ??
    p?.totals?.net ??
    p?.sections?.find?.((s) => /net income/i.test(s?.label))?.amount ??
    0
  );
}

// Try to read retained earnings from a BS report payload
function extractRetained(bsReport) {
  const p = bsReport?.payload || {};
  return (
    p?.totals?.retainedEarnings ??
    p?.totals?.equity?.retainedEarnings ??
    p?.sections?.find?.((s) => /retained/i.test(s?.label))?.amount ??
    0
  );
}

// Live list of generated IS reports, newest first
function useIncomeStatements() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const qIS = query(
      collection(db, "financialReports"),
      where("type", "==", "income_statement"),
      where("status", "==", "generated"),
      orderBy("periodEnd", "desc"),
      limit(25)
    );
    const unsub = onSnapshot(qIS, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  return items;
}

// Get the latest prior BS before a given date (no range filter to avoid new index)
async function getPriorBS(beforeDate) {
  const qBS = query(
    collection(db, "financialReports"),
    where("type", "==", "balance_sheet"),
    where("status", "==", "generated"),
    orderBy("periodEnd", "desc"),
    limit(20)
  );
  const snap = await getDocs(qBS);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return rows.find((r) => r.periodEnd < beforeDate) || null;
}

export default function BalanceSheet() {
  const incomeStatements = useIncomeStatements();

  const [selectedISId, setSelectedISId] = useState(null);
  const selectedIS = useMemo(
    () => incomeStatements.find((r) => r.id === selectedISId) || null,
    [incomeStatements, selectedISId]
  );

  // When IS list loads, auto-pick the newest one if none selected
  useEffect(() => {
    if (!selectedISId && incomeStatements.length) {
      setSelectedISId(incomeStatements[0].id); // newest due to orderBy desc
    }
  }, [incomeStatements, selectedISId]);

  // “As of” date is ALWAYS the selected IS periodEnd (fixes the 01-01 bug)
  const asOf = selectedIS ? fmt(selectedIS.periodEnd) : "";

  const [retainedPrev, setRetainedPrev] = useState(0);
  const [netIncome, setNetIncome] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [html, setHtml] = useState(""); // render-ready HTML snapshot

  // Whenever IS changes, recompute the dependent numbers
  useEffect(() => {
    (async () => {
      if (!selectedIS) return;
      setNetIncome(extractNetIncome(selectedIS));
      const prior = await getPriorBS(selectedIS.periodEnd);
      setRetainedPrev(extractRetained(prior));
    })();
  }, [selectedIS]);

  // TODO: Replace with your existing BS builder if you already have one.
  // Here we only demonstrate the header/retained/net wiring that was wrong.
  async function generate() {
    if (!selectedIS) return alert("Select an Income Statement first.");
    setGenerating(true);

    // --- Build a minimal HTML snapshot using your computed numbers.
    // Replace this section with your full BS computation if you have it.
    const body = `
      <div style="font-family: ui-sans-serif, system-ui; max-width: 880px; margin: 0 auto;">
        <h2 style="margin:0 0 4px 0;">Balance Sheet</h2>
        <div style="opacity:.75; margin-bottom:16px;">As of ${asOf}</div>
        <table style="width:100%; border-collapse:collapse;">
          <tbody>
            <tr><td style="padding:6px 0;">Retained income (prior)</td><td style="text-align:right;">${peso(retainedPrev)}</td></tr>
            <tr><td style="padding:6px 0;">Plus: Net income (selected IS)</td><td style="text-align:right;">${peso(netIncome)}</td></tr>
            <tr><td style="padding:6px 0; border-top:1px solid #ddd;"><strong>Ending retained earnings</strong></td><td style="text-align:right; border-top:1px solid #ddd;"><strong>${peso(retainedPrev + netIncome)}</strong></td></tr>
          </tbody>
        </table>
        <div style="margin-top:16px; font-size:12px; opacity:.7;">
          Linked IS: ${selectedIS.label || selectedIS.periodStart + " → " + selectedIS.periodEnd}
        </div>
      </div>
    `;
    setHtml(body);

    setGenerating(false);
  }

  async function saveReport() {
    if (!selectedIS) return alert("Select an Income Statement first.");
    const docBody = {
      type: "balance_sheet",
      status: "generated",
      label: `As of ${asOf}`,
      periodStart: asOf, // BS is a point-in-time statement; start=end for convenience
      periodEnd: asOf,
      createdAt: serverTimestamp(),
      createdByUid: "system", // fill with real user if you track it
      payload: {
        html, // full render snapshot for exact reproduction
        totals: {
          retainedEarnings: retainedPrev + netIncome,
          retainedPrev,
          netIncome,
        },
      },
      // keep a backlink to the IS we used (this fixes wrong references later)
      linkedIncomeStatementId: selectedIS.id,
      linkedIncomeStatementPeriodEnd: selectedIS.periodEnd,
    };
    await addDoc(collection(db, "financialReports"), docBody);
    alert("Balance Sheet saved to Reports.");
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold">Balance Sheet</h1>

      {/* IS selector */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <label className="text-sm text-gray-600">Select Income Statement</label>
        <select
          className="border rounded px-3 py-2"
          value={selectedISId || ""}
          onChange={(e) => setSelectedISId(e.target.value || null)}
        >
          {/* Keep a blank option so user explicitly sees nothing is auto-picked only once */}
          <option value="" disabled>
            -- choose an Income Statement --
          </option>
          {incomeStatements.map((r) => {
            const label =
              r.label ||
              `${fmt(r.periodStart)} → ${fmt(r.periodEnd)} (Net: ${peso(
                extractNetIncome(r)
              )})`;
            return (
              <option key={r.id} value={r.id}>
                {label}
              </option>
            );
          })}
        </select>
      </div>

      {/* Summary of linkage */}
      <div className="mt-3 text-sm text-gray-700">
        {selectedIS ? (
          <>
            <div>
              <span className="font-medium">As of:</span> {asOf}
            </div>
            <div>
              <span className="font-medium">Net income (from selected IS):</span>{" "}
              {peso(netIncome)}
            </div>
            <div>
              <span className="font-medium">Retained (prior BS):</span>{" "}
              {peso(retainedPrev)}
            </div>
          </>
        ) : (
          <div className="text-red-600">Please select an Income Statement.</div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          onClick={generate}
          disabled={!selectedIS || generating}
        >
          {generating ? "Generating…" : "Generate"}
        </button>
        <button
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
          onClick={saveReport}
          disabled={!html}
        >
          Save to Reports
        </button>
      </div>

      {/* Render preview */}
      {html ? (
        <div
          className="mt-6 border rounded-lg"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
    </div>
  );
}