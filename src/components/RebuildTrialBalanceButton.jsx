// src/components/RebuildTrialBalanceButton.jsx
import React, { useState } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { buildTrialBalanceRows } from "../lib/bookkeeping";
import useUserProfile from "../hooks/useUserProfile";

/* --- Lightweight mobile-friendly modal (no external libs) --- */
function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* sheet/card */}
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-lg p-4 sm:p-5 m-0 sm:m-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-base sm:text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-sm"
            aria-label="Close"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function RebuildTrialBalanceButton() {
  const { profile, loading } = useUserProfile();
  const [busy, setBusy] = useState(false);

  // pop-up state
  const [open, setOpen] = useState(false);
  const [popupTitle, setPopupTitle] = useState("Trial Balance");
  const [popupBody, setPopupBody] = useState(null);

  const isAdmin =
    !loading &&
    ((Array.isArray(profile?.roles) && profile.roles.includes("admin")) ||
      profile?.role === "admin") &&
    profile?.suspended !== true;

  if (!isAdmin) return null;

  async function fetchAllEntriesOrdered() {
    // Try order by "date" (string YYYY-MM-DD used in your app)
    try {
      const snap = await getDocs(
        query(collection(db, "journalEntries"), orderBy("date", "asc"))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      // Fallbacks if ordering by "date" isn't possible
      for (const field of ["createdAt", "postedAt"]) {
        try {
          const snap2 = await getDocs(
            query(collection(db, "journalEntries"), orderBy(field, "asc"))
          );
          if (snap2.size) return snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch {}
      }
      // Final fallback (ok for small datasets)
      const snap3 = await getDocs(collection(db, "journalEntries"));
      return snap3.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  }

  function filterByRangeStringYmd(entries, startYmd, endYmd) {
    return entries.filter((j) => {
      const d = j?.date || ""; // "YYYY-MM-DD"
      if (startYmd && d < startYmd) return false;
      if (endYmd && d > endYmd) return false;
      return true;
    });
  }

  function infoFromDates(entries) {
    const dates = entries.map((j) => j?.date).filter(Boolean).sort();
    return {
      count: entries.length,
      min: dates[0] || "—",
      max: dates[dates.length - 1] || "—",
    };
  }

  function fmt(n) {
    const v = Number(n || 0);
    return v.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  async function handleRebuild() {
    try {
      setBusy(true);
      setPopupTitle("Rebuilding Trial Balance…");
      setPopupBody(
        <div className="text-sm text-ink/70">Please wait a moment…</div>
      );
      setOpen(true);

      // 1) Read daily TB period
      const tbRef = doc(db, "financialReports", "auto_TB");
      const tbSnap = await getDoc(tbRef);
      if (!tbSnap.exists()) throw new Error("auto_TB not found.");
      const tb = tbSnap.data();
      const periodStart = tb.periodStart || tb.from || null; // "YYYY-MM-DD" or null
      const periodEnd = tb.periodEnd || tb.to || null;
      if (!periodEnd) {
        throw new Error(
          'auto_TB missing "periodEnd" (or "to"). Tap "Update Daily Reports Now" first.'
        );
      }

      // 2) Fetch ALL entries once (ordered) so filtering is reliable
      const all = await fetchAllEntriesOrdered();
      const allInfo = infoFromDates(all);

      // 3) Try requested period first
      let inRange = filterByRangeStringYmd(all, periodStart, periodEnd);
      const inRangeInfo = infoFromDates(inRange);

      // 4) If empty, fall back to ALL so you still get a TB
      let used = inRange;
      let usedNote = "";
      if (inRange.length === 0 && all.length > 0) {
        used = all;
        usedNote = `No entries for ${periodStart || "start"} .. ${periodEnd}. Using ALL entries (${allInfo.min} .. ${allInfo.max}).`;
      } else if (inRange.length === 0 && all.length === 0) {
        setPopupTitle("No journal entries");
        setPopupBody(
          <div className="text-sm">
            I couldn’t find any documents in <code>journalEntries</code>. Add
            entries first, then rebuild.
          </div>
        );
        return;
      }

      // 5) Accounts lookup (for code/name)
      const accSnap = await getDocs(
        query(collection(db, "accounts"), orderBy("code"))
      );
      const accountsById = new Map(
        accSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])
      );

      // 6) Build TB
      const { rows, totals } = buildTrialBalanceRows(used, accountsById);

      // 7) Save to auto_TB.payload
      await setDoc(
        tbRef,
        { type: "trial_balance", payload: { rows, totals } },
        { merge: true }
      );

      // 8) Show results in a pop‑up
      setPopupTitle("Trial Balance Rebuilt");
      setPopupBody(
        <div className="space-y-3 text-sm">
          {usedNote && (
            <div className="rounded bg-amber-50 text-amber-900 border border-amber-200 p-2">
              {usedNote}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border p-2">
              <div className="text-ink/60 text-xs">Requested period</div>
              <div className="font-mono">
                {periodStart || "start"} → {periodEnd}
              </div>
              <div className="text-xs text-ink/60 mt-1">
                Found {inRangeInfo.count} entry(ies)
              </div>
            </div>
            <div className="rounded border p-2">
              <div className="text-ink/60 text-xs">Dataset used</div>
              <div className="font-mono">
                {used === inRange
                  ? `${periodStart || "start"} → ${periodEnd}`
                  : `${allInfo.min} → ${allInfo.max}`}
              </div>
              <div className="text-xs text-ink/60 mt-1">
                {used.length} entry(ies)
              </div>
            </div>
          </div>

          <div className="rounded border p-2">
            <div className="text-ink/60 text-xs mb-1">Totals</div>
            <div className="flex items-center justify-between font-medium">
              <span>Debit</span>
              <span className="font-mono">{fmt(totals.debit)}</span>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span>Credit</span>
              <span className="font-mono">{fmt(totals.credit)}</span>
            </div>
            {Math.abs((totals.debit || 0) - (totals.credit || 0)) > 0.005 && (
              <div className="mt-1 text-rose-700">
                ⚠️ Not balanced by {fmt((totals.debit || 0) - (totals.credit || 0))}
              </div>
            )}
          </div>

          <div className="rounded border p-2">
            <div className="text-ink/60 text-xs mb-1">
              Sample rows (first 10)
            </div>
            {rows.length === 0 ? (
              <div className="text-ink/60">No accounts aggregated.</div>
            ) : (
              <ul className="max-h-40 overflow-auto space-y-1">
                {rows.slice(0, 10).map((r, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="truncate">
                      <span className="font-mono">{r.code || "—"}</span>{" "}
                      <span className="text-ink/70">{r.name || "—"}</span>
                    </span>
                    <span className="font-mono">
                      {fmt(r.debit)} / {fmt(r.credit)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-xs text-ink/60">
            Data written to <code>financialReports/auto_TB.payload</code>.
          </div>
        </div>
      );
    } catch (err) {
      setPopupTitle("Rebuild failed");
      setPopupBody(
        <div className="text-sm">
          {String(err?.message || err)}<br />
          <div className="mt-2 text-ink/60">
            Tip: Ensure <code>auto_TB.periodStart/periodEnd</code> cover your{" "}
            <code>journalEntries.date</code> (YYYY‑MM‑DD).
          </div>
        </div>
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={[
          "px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition",
          busy ? "bg-gray-300 text-gray-600" : "bg-brand-700 text-white hover:bg-brand-800",
        ].join(" ")}
        onClick={handleRebuild}
        disabled={busy}
        title='Rebuild auto_TB.payload from "journalEntries"'
      >
        {busy ? "Rebuilding TB…" : "Rebuild Trial Balance"}
      </button>

      <Modal open={open} title={popupTitle} onClose={() => setOpen(false)}>
        {popupBody}
      </Modal>
    </>
  );
}