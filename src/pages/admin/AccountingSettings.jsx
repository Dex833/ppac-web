import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

function OptionLabel({ acc }) {
  const name = `${acc.main}${acc.individual ? " / " + acc.individual : ""}`;
  return (
    <>
      {acc.code ? `${acc.code} • ` : ""}{name}
    </>
  );
}

export default function AccountingSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const sref = doc(db, "settings", "accounting");
        const ss = await getDoc(sref);
        setSettings(ss.exists() ? ss.data() : {});
      } catch {}
      try {
        const qAcc = query(collection(db, "accounts"), orderBy("code"));
        const snap = await getDocs(qAcc);
        setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const cashCandidates = useMemo(() => {
    const needles = ["cash", "bank", "gcash"];
    return accounts.filter((a) => {
      const t = String(a.type || "").toLowerCase();
      const n = `${a.main} ${a.individual || ""}`.toLowerCase();
      return t === "asset" || needles.some((x) => n.includes(x));
    });
  }, [accounts]);

  const incomeCandidates = useMemo(() => {
    return accounts.filter((a) => String(a.type || "").toLowerCase() === "income" || String(a.type || "").toLowerCase() === "revenue");
  }, [accounts]);

  const shareCapMain = useMemo(() => accounts.filter((a) => String(a.main).trim().toLowerCase() === "share capital"), [accounts]);
  const loanRecvMain = useMemo(() => accounts.filter((a) => String(a.main).trim().toLowerCase() === "loan receivable"), [accounts]);

  function onChange(field, val) {
    setSettings((s) => ({ ...(s || {}), [field]: val }));
  }

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const ref = doc(db, "settings", "accounting");
      await updateDoc(ref, { ...(settings || {}), updatedAt: serverTimestamp() });
      setMsg("Saved.");
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Accounting Settings</h2>
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <div className="text-xs text-ink/60">Cash account (legacy fallback)</div>
          <select className="input" value={settings?.cashAccountId || ""} onChange={(e) => onChange("cashAccountId", e.target.value)}>
            <option value="">— Select —</option>
            {cashCandidates.map((a) => (
              <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2 text-sm text-ink/60">Grouped cash defaults</div>
        <label className="block">
          <div className="text-xs text-ink/60">Cash on Hand</div>
          <select className="input" value={settings?.cashAccounts?.onHandId || ""} onChange={(e) => onChange("cashAccounts", { ...(settings?.cashAccounts || {}), onHandId: e.target.value })}>
            <option value="">— Select —</option>
            {cashCandidates.map((a) => (
              <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Cash in Bank (default)</div>
          <select className="input" value={settings?.cashAccounts?.bankDefaultId || ""} onChange={(e) => onChange("cashAccounts", { ...(settings?.cashAccounts || {}), bankDefaultId: e.target.value })}>
            <option value="">— Select —</option>
            {cashCandidates.map((a) => (
              <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Cash in GCash</div>
          <select className="input" value={settings?.cashAccounts?.gcashId || ""} onChange={(e) => onChange("cashAccounts", { ...(settings?.cashAccounts || {}), gcashId: e.target.value })}>
            <option value="">— Select —</option>
            {cashCandidates.map((a) => (
              <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Membership Fee Income (required)</div>
          <select className="input" value={settings?.membershipFeeIncomeId || ""} onChange={(e) => onChange("membershipFeeIncomeId", e.target.value)}>
            <option value="">— Select —</option>
            {incomeCandidates.map((a) => (
              <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Sales Revenue (required)</div>
          <select className="input" value={settings?.salesRevenueId || ""} onChange={(e) => onChange("salesRevenueId", e.target.value)}>
            <option value="">— Select —</option>
            {incomeCandidates.map((a) => (
              <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Interest Income (required)</div>
          <select className="input" value={settings?.interestIncomeId || ""} onChange={(e) => onChange("interestIncomeId", e.target.value)}>
            <option value="">— Select —</option>
            {incomeCandidates.map((a) => (
              <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Share Capital (main) (optional)</div>
          <select className="input" value={settings?.shareCapitalMainId || ""} onChange={(e) => onChange("shareCapitalMainId", e.target.value)}>
            <option value="">— Select —</option>
            {shareCapMain.map((a) => (
              <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Loan Receivable (main) (optional)</div>
          <select className="input" value={settings?.loanReceivableMainId || ""} onChange={(e) => onChange("loanReceivableMainId", e.target.value)}>
            <option value="">— Select —</option>
            {loanRecvMain.map((a) => (
              <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
            ))}
          </select>
        </label>
      </div>

      <div className="card p-4 space-y-3">
        <div className="font-semibold">Per-method cash mapping (optional overrides)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-xs text-ink/60">bank_transfer →</div>
            <select className="input" value={settings?.cashAccountMap?.bank_transfer || ""} onChange={(e) => onChange("cashAccountMap", { ...(settings?.cashAccountMap || {}), bank_transfer: e.target.value })}>
              <option value="">— Default to Cash in Bank —</option>
              {cashCandidates.map((a) => (
                <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-ink/60">gcash_manual →</div>
            <select className="input" value={settings?.cashAccountMap?.gcash_manual || ""} onChange={(e) => onChange("cashAccountMap", { ...(settings?.cashAccountMap || {}), gcash_manual: e.target.value })}>
              <option value="">— Default to Cash in GCash —</option>
              {cashCandidates.map((a) => (
                <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-ink/60">static_qr →</div>
            <select className="input" value={settings?.cashAccountMap?.static_qr || ""} onChange={(e) => onChange("cashAccountMap", { ...(settings?.cashAccountMap || {}), static_qr: e.target.value })}>
              <option value="">— Default to Cash in Bank —</option>
              {cashCandidates.map((a) => (
                <option key={a.id} value={a.id}><OptionLabel acc={a} /></option>
              ))}
            </select>
          </label>
        </div>
        <div className="text-xs text-ink/60">Leave blank to use grouped defaults. Legacy fallback “Cash account” is used only if grouped defaults are blank.</div>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={save} disabled={busy}>Save</button>
        {msg && <span className="text-sm text-ink/60">{msg}</span>}
      </div>
    </div>
  );
}
