import React, { useEffect, useMemo, useRef, useState } from "react";
import PageBackground from "../components/PageBackground";
import { useAuth } from "../AuthContext";
import { db, storage } from "../lib/firebase";
import { buildMemberDisplayName } from "../lib/names";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const paymentsBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

const TYPE_OPTIONS = [
  { value: "membership_fee", label: "Membership Fee" },
  { value: "share_capital", label: "Share Capital" },
  { value: "purchase", label: "Purchase" },
  { value: "loan_repayment", label: "Loan Repayment" },
  { value: "other", label: "Other" },
];

const METHOD_LABELS = {
  bank_transfer: "Bank Transfer",
  gcash_manual: "GCash (manual)",
  static_qr: "Static QR",
};

const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "pdf"];
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_MB = 2;

function TabButton({ active, onClick, children }) {
  return (
    <button
      className={
        "px-3 py-2 text-sm rounded-lg border " +
        (active ? "bg-brand-600 text-white border-brand-600" : "bg-white text-ink/80 hover:bg-brand-50")
      }
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function WarningBanner({ children }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-sm">{children}</div>
  );
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const uid = user?.uid || "";

  const [tab, setTab] = useState("make");
  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsErr, setSettingsErr] = useState("");

  // Load settings/payments (one-shot + watch)
  useEffect(() => {
    const ref = doc(db, "settings", "payments");
    const unsub = onSnapshot(
      ref,
      (s) => {
        setSettings(s.exists() ? s.data() : null);
        setLoadingSettings(false);
      },
      (e) => {
        console.warn("settings/payments read:", e);
        setSettingsErr(e?.message || String(e));
        setLoadingSettings(false);
      }
    );
    return () => unsub();
  }, []);

  return (
    <PageBackground image={paymentsBg} boxed boxedWidth="max-w-5xl" overlayClass="bg-white/85 backdrop-blur" className="page-gutter">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-2xl font-bold flex-1">Payments</h1>
        <TabButton active={tab === "make"} onClick={() => setTab("make")}>Make a Payment</TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>Payment History</TabButton>
      </div>

      {tab === "make" ? (
        <MakePayment uid={uid} settings={settings} loadingSettings={loadingSettings} />
      ) : (
        <PaymentHistory uid={uid} />
      )}
    </PageBackground>
  );
}

function MakePayment({ uid, settings, loadingSettings }) {
  const [type, setType] = useState("membership_fee");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [file, setFile] = useState(null);
  const [fileErr, setFileErr] = useState("");
  const [uploadPct, setUploadPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  // Membership one-time and share capital first-time detection
  const [alreadyPaidMembership, setAlreadyPaidMembership] = useState(false);
  const [firstShareCapital, setFirstShareCapital] = useState(false);

  // Loans for loan_repayment
  const [loans, setLoans] = useState([]);
  const [loanId, setLoanId] = useState("");

  // Detect membership paid and first share capital
  useEffect(() => {
    if (!uid) return;
    const qPaidMem = query(
      collection(db, "payments"),
      where("userId", "==", uid),
      where("type", "==", "membership_fee"),
      where("status", "==", "paid"),
      limit(1)
    );
    const unsub1 = onSnapshot(qPaidMem, (s) => setAlreadyPaidMembership(!s.empty));

    const qPaidSC = query(
      collection(db, "payments"),
      where("userId", "==", uid),
      where("type", "==", "share_capital"),
      where("status", "==", "paid"),
      limit(1)
    );
    const unsub2 = onSnapshot(qPaidSC, (s) => setFirstShareCapital(s.empty));
    return () => {
      unsub1();
      unsub2();
    };
  }, [uid]);

  // Prefill amount when settings or type change
  useEffect(() => {
    if (!settings) return;
    if (type === "membership_fee") {
      setAmount(settings.membershipFee != null ? String(settings.membershipFee) : "");
    } else if (type === "share_capital") {
      if (firstShareCapital && settings.initialShareCapitalMin != null) {
        setAmount(String(settings.initialShareCapitalMin));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, settings, firstShareCapital]);

  // Load open loans for user
  useEffect(() => {
    if (!uid) return;
    const qLoans = query(
      collection(db, "loans"),
      where("userId", "==", uid),
      where("status", "in", ["open", "active"]) // best-effort; adjust to your schema
    );
    getDocs(qLoans)
      .then((snap) => setLoans(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => setLoans([]));
  }, [uid]);

  const allowedMethods = useMemo(() => {
    // Fallback so users can still submit before settings are seeded
    const arr = Array.isArray(settings?.allowedManualMethods)
      ? settings.allowedManualMethods
      : ["bank_transfer", "gcash_manual", "static_qr"]; // safe defaults
    return arr.filter((m) => METHOD_LABELS[m]);
  }, [settings]);

  const criticalMissing = useMemo(() => {
    if (!settings) return true;
    const missMembership = settings.membershipFee == null;
    const missSCMin = settings.initialShareCapitalMin == null;
    return missMembership || missSCMin;
  }, [settings]);

  function validateFile(f) {
    setFileErr("");
    if (!f) return false;
    if (f.size > MAX_MB * 1024 * 1024) {
      setFileErr(`File too large. Max ${MAX_MB} MB.`);
      return false;
    }
    if (!ALLOWED_MIME.includes(f.type)) {
      setFileErr("Invalid file type. Use JPG, PNG, WEBP, or PDF.");
      return false;
    }
    return true;
  }

  function onFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) {
      setFile(null);
      setFileErr("");
      return;
    }
    if (validateFile(f)) setFile(f);
    else setFile(null);
  }

  const membershipLocked = (settings?.oneTimeMembership === true) && alreadyPaidMembership;
  const showLoanSelect = type === "loan_repayment" && loans.length > 0;

  const selectedMethod = method || allowedMethods[0] || "";
  const instructions = selectedMethod === "bank_transfer"
    ? settings?.instructionsBank
    : selectedMethod === "gcash_manual"
    ? settings?.instructionsGCash
    : selectedMethod === "static_qr"
    ? (settings?.staticQrUrl ? "Scan the QR code and pay via your app. Upload your proof below." : "")
    : "";

  async function submit(e) {
    e.preventDefault();
    if (!uid) return;
    if (!selectedMethod) return alert("Please choose a method.");
    if (!referenceNo.trim()) return alert("Reference No is required.");
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) return alert("Enter a valid amount > 0.");
    if (!file) return alert("Proof file is required.");
    if (type === "membership_fee" && settings?.membershipFee != null && Number(settings.membershipFee) !== amt) {
      return alert("Membership fee amount is fixed.");
    }

    setBusy(true);
    setUploadPct(0);
    try {
      // Load a snapshot of the current user's profile/users doc for the name
      let profileSnap = null;
      try {
        profileSnap = await onGetProfile(uid);
      } catch {}
      const memberName = buildMemberDisplayName(profileSnap || {});

      // 1) Create payment doc (pending)
      const payload = {
        userId: uid,
        memberName: memberName || null,
        type,
        amount: Number(amt.toFixed(2)),
        method: selectedMethod,
        referenceNo: referenceNo.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      };
      if (type === "loan_repayment" && loanId) payload.linkedId = loanId;
      if (note.trim()) payload.notes = note.trim();

      const created = await addDoc(collection(db, "payments"), payload);

      // 2) Upload proof
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const safeExt = ALLOWED_EXT.includes(ext) ? ext : (file.type === "application/pdf" ? "pdf" : "jpg");
      const path = `members/${uid}/paidUpProof/${created.id}.${safeExt}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, file, { contentType: file.type });
      await new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setUploadPct(pct);
          },
          (err) => reject(err),
          () => resolve()
        );
      });
      const url = await getDownloadURL(sref);

      // 3) Update payment with proofUrl
      await updateDoc(doc(db, "payments", created.id), { proofURL: url });

      alert("Payment submitted. You can track it under Payment History.");
      // Reset form
      if (type !== "membership_fee") setAmount("");
      setReferenceNo("");
      setFile(null);
      setUploadPct(0);
      setNote("");
    } catch (err) {
      console.error("submit payment:", err);
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2">
        <form className="card p-4 space-y-3" onSubmit={submit}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Make a Payment</h2>
          </div>

          {loadingSettings ? (
            <div className="text-sm text-ink/60">Loading settings…</div>
          ) : !settings ? (
            <WarningBanner>
              Payment settings are not configured yet. You can still submit, but some validations are relaxed.
            </WarningBanner>
          ) : null}

          {settings && (settings.membershipFee == null || settings.initialShareCapitalMin == null) && (
            <WarningBanner>
              Some settings are missing (membership fee or initial share capital minimum). Amount defaults may be blank.
            </WarningBanner>
          )}

          {/* Type */}
          <label className="block">
            <div className="text-xs text-ink/60">Payment Type</div>
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value} disabled={t.value === "membership_fee" && (settings?.oneTimeMembership === true) && alreadyPaidMembership}>
                  {t.label}
                  {t.value === "membership_fee" && (settings?.oneTimeMembership === true) && alreadyPaidMembership ? " (Already paid)" : ""}
                </option>
              ))}
            </select>
          </label>

          {/* Amount */}
          <label className="block">
            <div className="text-xs text-ink/60">Amount</div>
            <input
              className="input"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={type === "membership_fee"}
              placeholder={type === "share_capital" && firstShareCapital ? `Suggested min: ${settings?.initialShareCapitalMin ?? ""}` : "Enter amount"}
            />
            {type === "share_capital" && firstShareCapital && (
              <div className="text-xs text-emerald-700 mt-1">First contribution</div>
            )}
          </label>

          {/* Method */}
          <div>
            <div className="text-xs text-ink/60 mb-1">Method</div>
            {allowedMethods.length === 0 ? (
              <div className="text-sm text-ink/60">No manual methods configured.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allowedMethods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={
                      "px-3 py-2 rounded-lg border text-sm " +
                      (selectedMethod === m ? "bg-brand-600 text-white border-brand-600" : "bg-white hover:bg-brand-50")
                    }
                    onClick={() => setMethod(m)}
                  >
                    {METHOD_LABELS[m] || m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Loan selection */}
          {type === "loan_repayment" && (
            <label className="block">
              <div className="text-xs text-ink/60">Loan (optional)</div>
              <select className="input" value={loanId} onChange={(e) => setLoanId(e.target.value)}>
                <option value="">— None —</option>
                {loans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.accountName || l.id}
                  </option>
                ))}
              </select>
              {loans.length === 0 && (
                <div className="text-xs text-ink/60 mt-1">No open loans found for your account.</div>
              )}
            </label>
          )}

          {/* Reference */}
          <label className="block">
            <div className="text-xs text-ink/60">Reference No</div>
            <input className="input" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
          </label>

          {/* Proof */}
          <div>
            <div className="text-xs text-ink/60 mb-1">Proof (JPG/PNG/WEBP/PDF, ≤ {MAX_MB}MB)</div>
            <input type="file" accept={ALLOWED_EXT.map((e) => "." + e).join(",")} onChange={onFileChange} />
            {fileErr && <div className="text-sm text-rose-700 mt-1">{fileErr}</div>}
            {uploadPct > 0 && (
              <div className="h-2 bg-gray-200 rounded mt-2 overflow-hidden">
                <div className="h-2 bg-brand-600" style={{ width: `${uploadPct}%` }} />
              </div>
            )}
          </div>

          {/* Note */}
          <label className="block">
            <div className="text-xs text-ink/60">Notes (optional)</div>
            <textarea className="w-full border rounded px-2 py-1" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button className="btn btn-primary" disabled={busy || !selectedMethod} type="submit">
              {busy ? "Submitting…" : "Submit Payment"}
            </button>
            {membershipLocked && (
              <span className="text-sm text-ink/60">Membership fee already paid.</span>
            )}
          </div>
        </form>
      </div>
      <aside>
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold">Instructions</h3>
          {selectedMethod === "bank_transfer" && (
            <p className="text-sm whitespace-pre-wrap">{settings?.instructionsBank || "Bank transfer instructions not set."}</p>
          )}
          {selectedMethod === "gcash_manual" && (
            <p className="text-sm whitespace-pre-wrap">{settings?.instructionsGCash || "GCash instructions not set."}</p>
          )}
          {selectedMethod === "static_qr" && (
            <div className="space-y-2">
              <p className="text-sm">Pay using the static QR then upload your proof below.</p>
              {settings?.staticQrUrl ? (
                <img src={settings.staticQrUrl} alt="Static QR" className="max-w-full h-auto rounded border" />
              ) : (
                <div className="text-sm text-ink/60">No static QR set.</div>
              )}
            </div>
          )}
          <div className="text-xs text-ink/60">Fixed fees and reminders may be shown here.</div>
        </div>
      </aside>
    </div>
  );
}

// Helper: fetches users/{uid} then profiles/{uid} (fallback) to build display name
async function onGetProfile(uid) {
  try {
    const uref = doc(db, "users", uid);
    const us = await getDoc(uref);
    if (us.exists()) return us.data();
  } catch {}
  try {
    const pref = doc(db, "profiles", uid);
    const ps = await getDoc(pref);
    if (ps.exists()) return ps.data();
  } catch {}
  return {};
}

function StatusBadge({ s }) {
  const cls =
    s === "paid"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : s === "rejected"
      ? "bg-rose-50 text-rose-800 border-rose-200"
      : "bg-amber-50 text-amber-800 border-amber-200";
  return <span className={`inline-block text-xs px-2 py-0.5 rounded border ${cls}`}>{s}</span>;
}

function fmtDT(v) {
  try {
    if (!v) return "—";
    if (typeof v.toDate === "function") return v.toDate().toLocaleString();
    return new Date(v).toLocaleString();
  } catch {
    return String(v || "—");
  }
}

function PaymentHistory({ uid }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!uid) return;
    let qBase = query(collection(db, "payments"), where("userId", "==", uid));
    if (status) qBase = query(qBase, where("status", "==", status));
    if (type) qBase = query(qBase, where("type", "==", type));
    if (from) qBase = query(qBase, where("createdAt", ">=", new Date(`${from}T00:00:00`)));
    if (to) qBase = query(qBase, where("createdAt", "<=", new Date(`${to}T23:59:59`)));
    qBase = query(qBase, orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(
      qBase,
      (s) => {
        setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        console.warn("history read:", e);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid, status, type, from, to]);

  return (
    <div className="space-y-3">
      <div className="card p-3 grid grid-cols-2 sm:grid-cols-6 gap-2">
        <label className="block">
          <div className="text-xs text-ink/60">Status</div>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Type</div>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">From</div>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">To</div>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Date</th>
              <th className="text-left p-2 border-b">Type</th>
              <th className="text-left p-2 border-b">Method</th>
              <th className="text-right p-2 border-b">Amount</th>
              <th className="text-left p-2 border-b">Ref No</th>
              <th className="text-left p-2 border-b">Status</th>
              <th className="text-left p-2 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="p-3" colSpan={7}>Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td className="p-3 text-ink/60" colSpan={7}>No payments yet.</td></tr>
            )}
            {!loading && rows.map((p) => (
              <tr key={p.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b">{fmtDT(p.createdAt)}</td>
                <td className="p-2 border-b">{p.type || "—"}</td>
                <td className="p-2 border-b">{p.method || "—"}</td>
                <td className="p-2 border-b text-right font-mono">{Number(p.amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="p-2 border-b">{p.referenceNo || p.refNo || "—"}</td>
                <td className="p-2 border-b"><StatusBadge s={p.status || "pending"} /></td>
                <td className="p-2 border-b">
                  <div className="flex items-center gap-2">
                    <button className="btn btn-sm btn-outline" onClick={() => setActive(p)}>View</button>
                    {p.status === "paid" && p.receiptNo && (
                      <button className="btn btn-sm btn-primary" onClick={() => window.print()}>Print Receipt</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active && (
        <PaymentDetailModal p={active} onClose={() => setActive(null)} />)
      }
    </div>
  );
}

function PaymentDetailModal({ p, onClose }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-white shadow-2xl p-4 overflow-auto">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-lg font-semibold">{p.type || "Payment"}</div>
            <div className="text-sm text-ink/60">{p.method || "—"}</div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge s={p.status || "pending"} />
            <button className="rounded px-2 py-1 hover:bg-gray-100" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <div className="card p-3 mb-3">
          <div className="text-sm text-ink/60">Amount</div>
          <div className="text-2xl font-bold">₱{Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="mt-2 text-sm">
            <span className="mr-4">Ref: <b>{p.referenceNo || p.refNo || "—"}</b></span>
            {p.receiptNo && <span>Receipt: <b>{p.receiptNo}</b></span>}
          </div>
        </div>

        <div className="card p-3 mb-3">
          <div className="text-sm font-semibold mb-2">Proof</div>
          {p.proofURL ? (
            <div className="space-y-2">
              {String(p.proofURL).match(/\.(png|jpe?g|webp|gif)$/i) ? (
                <img src={p.proofURL} alt="Proof" className="max-h-80 w-auto rounded border" />
              ) : String(p.proofURL).match(/\.(pdf)$/i) ? (
                <iframe title="Proof" src={p.proofURL} className="w-full h-80 border rounded" />
              ) : (
                <a className="underline" href={p.proofURL} target="_blank" rel="noreferrer">Open proof</a>
              )}
              <div>
                <a className="btn btn-sm btn-outline" href={p.proofURL} target="_blank" rel="noreferrer">Open in new tab</a>
              </div>
            </div>
          ) : (
            <div className="text-sm text-ink/60">No proof.</div>
          )}
        </div>
      </div>
    </div>
  );
}
