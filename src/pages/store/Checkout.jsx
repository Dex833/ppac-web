import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, addDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage, functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import QRCode from "qrcode";
import { useAuth } from "@/AuthContext";

const MANUAL_METHOD_LABELS = {
  bank_transfer: "Bank Transfer",
  gcash_manual: "GCash (manual)",
  static_qr: "QR (manual)",
};

export default function Checkout() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [cart, setCart] = useState({ items: [] });
  const [settings, setSettings] = useState(null);
  const [paymongo, setPaymongo] = useState(null);
  const [qr, setQr] = useState(null);
  const [method, setMethod] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  useEffect(() => { if (!checkoutUrl) return; QRCode.toDataURL(checkoutUrl).then(setQrDataUrl).catch(()=>{}); }, [checkoutUrl]);

  useEffect(() => {
    if (!user?.uid) return;
    const cartRef = doc(db, "carts", user.uid);
    const u1 = onSnapshot(cartRef, (s) => setCart(s.exists() ? (s.data() || { items: [] }) : { items: [] }));
    const u2 = onSnapshot(doc(db, "settings", "payments"), (s) => setSettings(s.data() || null));
    const u3 = onSnapshot(doc(db, "settings", "paymongo"), (s) => setPaymongo(s.data() || null));
    const u4 = onSnapshot(doc(db, "settings", "qr"), (s) => setQr(s.data() || null));
    return () => { u1(); u2(); u3(); u4(); };
  }, [user?.uid]);

  const subtotal = useMemo(() => (cart.items || []).reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0), [cart.items]);
  const manualMethods = useMemo(() => {
    const base = Array.isArray(settings?.allowedManualMethods) ? settings.allowedManualMethods : ["bank_transfer","gcash_manual","static_qr"];
    return base.filter((m) => MANUAL_METHOD_LABELS[m]);
  }, [settings]);

  function validateFile(f) {
    if (!f) return false;
    const ok = ["image/jpeg","image/png","image/webp","application/pdf"].includes(f.type);
    const small = f.size <= 2 * 1024 * 1024;
    return ok && small;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if ((cart.items || []).length === 0) return alert("Cart is empty.");
    if (!method) return alert("Choose a method.");
  if (!user?.uid) return alert("You're not signed in yet. Please try again.");

    setBusy(true);
    try {
      // 1) Create order
      const order = {
    userId: user.uid,
        items: (cart.items || []).map((it) => ({ productId: it.productId, name: it.name, price: Number(it.price), qty: Number(it.qty) })),
        subtotal: Number(subtotal.toFixed(2)),
        status: "pending",
        createdAt: serverTimestamp(),
      };
      const orderRef = await addDoc(collection(db, "orders"), order);

      if (method === "paymongo_gcash") {
        // 2) Create payment (pending) then request checkoutUrl
  const payRef = await addDoc(collection(db, "payments"), {
          userId: order.userId,
          memberName: null,
          type: "purchase",
          amount: order.subtotal,
          method: "paymongo_gcash",
          linkedId: orderRef.id,
          referenceNo: referenceNo || null,
          status: "pending",
          createdAt: serverTimestamp(),
        });
  // clear cart early to avoid duplicate checkout attempts
  await setDoc(doc(db, "carts", user.uid), { items: [] }, { merge: true });
        const call = httpsCallable(functions, "paymongoCreateGcashSource");
        const r = await call({ paymentId: payRef.id });
        setCheckoutUrl(r?.data?.checkoutUrl || "");
        const unsub = onSnapshot(doc(db, "payments", payRef.id), async (s) => {
          const v = s.data() || {};
          if (v.status === "paid") {
            unsub();
            await updateDoc(orderRef, { status: "paid", paymentId: payRef.id });
            setTimeout(() => nav(`/receipt/${payRef.id}`), 600);
          }
        });
        return;
      }

      // Manual methods: require reference and optional proof
      if (["bank_transfer","gcash_manual","static_qr"].includes(method)) {
        if (!referenceNo.trim()) {
          alert("Reference No is required.");
          return;
        }
        if (!file || !validateFile(file)) {
          alert("Valid proof file is required (JPG/PNG/WEBP/PDF up to 2MB).");
          return;
        }
        const payRef = await addDoc(collection(db, "payments"), {
          userId: order.userId,
          memberName: null,
          type: "purchase",
          amount: order.subtotal,
          method,
          linkedId: orderRef.id,
          referenceNo: referenceNo.trim(),
          status: "pending",
          createdAt: serverTimestamp(),
        });
        // upload proof
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        const safeExt = ["jpg","jpeg","png","webp","pdf"].includes(ext) ? ext : (file.type === "application/pdf" ? "pdf" : "jpg");
        const path = `members/${order.userId || "me"}/orders/${orderRef.id}/${payRef.id}.${safeExt}`;
        const sref = storageRef(storage, path);
        const task = uploadBytesResumable(sref, file, { contentType: file.type });
        await new Promise((res, rej) => task.on("state_changed", () => {}, rej, res));
        const url = await getDownloadURL(sref);
        await updateDoc(doc(db, "payments", payRef.id), { proofURL: url });
  // clear cart after manual submission
  await setDoc(doc(db, "carts", user.uid), { items: [] }, { merge: true });
        alert("Order placed. Your payment is pending verification.");
        nav("/payments");
        return;
      }
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if ((cart.items || []).length === 0) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <div className="card p-6">
          <div className="text-lg font-semibold mb-2">Your cart is empty</div>
          <button className="btn btn-primary" onClick={() => nav("/store")}>Go to Store</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-bold mb-4">Checkout</h1>
      <form className="card p-4 space-y-3" onSubmit={onSubmit}>
        <div>
          <div className="text-xs text-ink/60 mb-1">Method</div>
          <div className="flex flex-wrap gap-2 items-center">
            {manualMethods.map((m) => (
              <button key={m} type="button" className={`px-3 py-2 rounded border ${method===m?"bg-brand-600 text-white border-brand-600":"bg-white"}`} onClick={()=>setMethod(m)}>
                {MANUAL_METHOD_LABELS[m]}
              </button>
            ))}
            {paymongo?.enabled && Array.isArray(paymongo?.allowedMethods) && paymongo.allowedMethods.includes("gcash") && (
              <button type="button" className={`px-3 py-2 rounded border ${method==="paymongo_gcash"?"bg-brand-600 text-white border-brand-600":"bg-white"}`} onClick={()=>setMethod("paymongo_gcash")}>
                GCash (PayMongo)
              </button>
            )}
          </div>
        </div>

        {method === "static_qr" && (
          <div className="space-y-2">
            <p className="text-sm">Scan the QR, then upload your proof below.</p>
            <div className="flex gap-2">
              {qr?.static?.gcash?.imageUrl && <img src={qr.static.gcash.imageUrl} alt="GCash QR" className="max-w-[200px] border rounded" />}
              {qr?.static?.bank?.imageUrl && <img src={qr.static.bank.imageUrl} alt="Bank QR" className="max-w-[200px] border rounded" />}
            </div>
          </div>
        )}

        {method === "paymongo_gcash" && checkoutUrl && (
          <div className="space-y-2">
            <p className="text-sm">Scan with your GCash app or open the link.</p>
            {qrDataUrl && <img src={qrDataUrl} alt="GCash" className="max-w-[200px] border rounded" />}
            <button type="button" className="btn btn-outline btn-sm" onClick={()=>window.open(checkoutUrl, "_blank")}>Open GCash Checkout</button>
            <p className="text-xs text-ink/60">This will update automatically when paid.</p>
          </div>
        )}

        {method !== "paymongo_gcash" && (
          <>
            <label className="block">
              <div className="text-xs text-ink/60">Reference No</div>
              <input className="input" value={referenceNo} onChange={(e)=>setReferenceNo(e.target.value)} />
            </label>
            <label className="block">
              <div className="text-xs text-ink/60">Proof (JPG/PNG/WEBP/PDF ≤ 2MB)</div>
              <input type="file" onChange={(e)=>setFile(e.target.files?.[0]||null)} />
            </label>
          </>
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-lg font-semibold">Total</div>
          <div className="text-lg font-bold">₱{Number(subtotal).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        </div>
        <div>
          <button className="btn btn-primary" disabled={busy || !method} type="submit">{busy?"Processing…":"Place Order"}</button>
        </div>
      </form>
    </div>
  );
}
