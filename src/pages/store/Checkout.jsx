import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageBackground from "@/components/PageBackground";
import { useCart } from "@/contexts/CartContext.jsx";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  setDoc,
  runTransaction,
  increment,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/AuthContext";

const MANUAL_METHOD_LABELS = {
  bank_transfer: "Bank Transfer",
  gcash_manual: "GCash (manual)",
  static_qr: "QR (manual)",
};

export default function Checkout() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { clear: clearLocalCart } = useCart();

  const [cart, setCart] = useState({ items: [] });
  const [settings, setSettings] = useState(null);
  const [qr, setQr] = useState(null);

  const [method, setMethod] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!user?.uid) return;
    const cartRef = doc(db, "carts", user.uid);
    const u1 = onSnapshot(cartRef, (s) =>
      setCart(s.exists() ? s.data() || { items: [] } : { items: [] })
    );
    const u2 = onSnapshot(doc(db, "settings", "payments"), (s) =>
      setSettings(s.data() || null)
    );
    const u3 = onSnapshot(doc(db, "settings", "qr"), (s) =>
      setQr(s.data() || null)
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [user?.uid]);

  const subtotal = useMemo(
    () =>
      (cart.items || []).reduce(
        (sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0),
        0
      ),
    [cart.items]
  );

  const manualMethods = useMemo(() => {
    const base = Array.isArray(settings?.allowedManualMethods)
      ? settings.allowedManualMethods
      : ["bank_transfer", "gcash_manual", "static_qr"];
    return base.filter((m) => MANUAL_METHOD_LABELS[m]);
  }, [settings]);

  const isManual = ["bank_transfer", "gcash_manual", "static_qr"].includes(method);

  // Reset manual-only fields when switching methods
  useEffect(() => {
    setUploadProgress(0);
    setFileError("");
    setErrorMsg("");
    if (!isManual) {
      setReferenceNo("");
      setFile(null);
    }
  }, [isManual]);

  function validateFile(f) {
    if (!f) return false;
    const okTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    const ok = okTypes.includes(f.type);
    const small = f.size <= 2 * 1024 * 1024; // 2MB
    return ok && small;
  }

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (!method) return false;
    if (!isManual) return true;
    const valid = referenceNo.trim() && file && validateFile(file);
    return Boolean(valid);
  }, [busy, method, isManual, referenceNo, file]);

  async function onSubmit(e) {
    e.preventDefault();
  setErrorMsg("");
  if (!user?.uid) { setErrorMsg("You're not signed in. Please sign in and try again."); return; }
  if ((cart.items || []).length === 0) { setErrorMsg("Cart is empty."); return; }
  if (!method) { setErrorMsg("Choose a payment method."); return; }

    // For manual methods, validate BEFORE creating any records
    if (isManual) {
      if (!referenceNo.trim()) {
        setErrorMsg("Reference No is required for this payment method.");
        return;
      }
      if (!file || !validateFile(file)) {
        setErrorMsg("Valid proof file is required (JPG/PNG/WEBP/PDF up to 2MB).");
        return;
      }
    }

    setBusy(true);
  let manualProofPath = null;
  try {
      const cleanItems = (cart.items || []).map((it) => ({
        productId: it.productId || it.id, // support both cart shapes
        name: it.name,
        price: Number(it.price),
        qty: Number(it.qty),
      }));

      // Create base order payload (used in both manual and non-manual flows)
      const order = {
        userId: user.uid,
        buyerName: user?.displayName || user?.email || user?.uid || "",
        items: cleanItems,
        subtotal: Number(subtotal.toFixed(2)),
        method, // keep the chosen method on the order
        status: isManual ? "pending" : "pending", // same for now
        createdAt: serverTimestamp(),
      };

      // If manual, upload proof first (to get URL), then run a transaction that:
      // - validates & decrements stock
      // - creates payment doc (pending) with proofURL
      // - creates order doc linked to payment
      if (isManual) {
        // 1) Pre-generate refs so we can upload proof to a deterministic path
        const payRef = doc(collection(db, "payments"));
        const orderRef = doc(collection(db, "orders"));

        // 2) Upload proof with progress UI
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        const safeExt = ["jpg", "jpeg", "png", "webp", "pdf"].includes(ext)
          ? ext
          : file.type === "application/pdf"
          ? "pdf"
          : "jpg";
  manualProofPath = `members/${order.userId}/payments/${payRef.id}/proof.${safeExt}`;
  const sref = storageRef(storage, manualProofPath);
        const task = uploadBytesResumable(sref, file, { contentType: file.type });
        await new Promise((res, rej) =>
          task.on(
            "state_changed",
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setUploadProgress(pct);
            },
            rej,
            res
          )
        );
        const proofURL = await getDownloadURL(sref);

        // 3) Transaction: validate/decrement stock, create payment & order atomically
        await runTransaction(db, async (tx) => {
          // Stock checks and decrements
          for (const it of cleanItems) {
            const pRef = doc(db, "products", it.productId);
            const pSnap = await tx.get(pRef);
            if (!pSnap.exists()) throw new Error(`Product not found: ${it.name || it.productId}`);
            const pdata = pSnap.data();
            const available = Number(pdata.stock || 0);
            const need = Number(it.qty || 0);
            if (available < need) {
              throw new Error(`Insufficient stock for ${pdata.name || it.productId}. Available: ${available}, needed: ${need}`);
            }
          }
          // All good; decrement now
          for (const it of cleanItems) {
            const pRef = doc(db, "products", it.productId);
            tx.update(pRef, { stock: increment(-Number(it.qty || 0)) });
          }

          // Create payment (pending)
          tx.set(payRef, {
            userId: order.userId,
            memberName: null,
            type: "purchase",
            amount: order.subtotal,
            method,
            linkedId: orderRef.id, // link to order
            referenceNo: referenceNo.trim(),
            status: "pending",
            proofURL,
            createdAt: serverTimestamp(),
          });

          // Create order linked to payment
          tx.set(orderRef, { ...order, paymentId: payRef.id });
        });

        // 4) Clear cart
  await setDoc(doc(db, "carts", user.uid), { items: [] }, { merge: true });
  try { clearLocalCart(); } catch {}

        nav("/payments");
        return;
      }

      // Non-manual methods: still validate and decrement stock via transaction, then create order
      const orderRef = doc(collection(db, "orders"));
      await runTransaction(db, async (tx) => {
        // Validate stock
        for (const it of cleanItems) {
          const pRef = doc(db, "products", it.productId);
          const pSnap = await tx.get(pRef);
          if (!pSnap.exists()) throw new Error(`Product not found: ${it.name || it.productId}`);
          const pdata = pSnap.data();
          const available = Number(pdata.stock || 0);
          const need = Number(it.qty || 0);
          if (available < need) {
            throw new Error(`Insufficient stock for ${pdata.name || it.productId}. Available: ${available}, needed: ${need}`);
          }
        }
        // Decrement stock
        for (const it of cleanItems) {
          const pRef = doc(db, "products", it.productId);
          tx.update(pRef, { stock: increment(-Number(it.qty || 0)) });
        }
        // Create order
        tx.set(orderRef, order);
      });
  await setDoc(doc(db, "carts", user.uid), { items: [] }, { merge: true });
  try { clearLocalCart(); } catch {}
      nav("/store");
    } catch (e) {
      // Best-effort cleanup for orphaned proof files when manual flow fails after upload
      if (isManual && manualProofPath) {
        try { await deleteObject(storageRef(storage, manualProofPath)); } catch {}
      }
  setErrorMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if ((cart.items || []).length === 0) {
    return (
      <PageBackground
        image="https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80"
        boxed
        boxedWidth="max-w-7xl"
        overlayClass="bg-white/85 backdrop-blur"
      >
        <div className="p-2 sm:p-4">
          <div className="card p-6">
            <div className="text-lg font-semibold mb-2">Your cart is empty</div>
            <button className="btn btn-primary" onClick={() => nav("/store")}>
              Go to Store
            </button>
          </div>
        </div>
      </PageBackground>
    );
  }

  return (
    <PageBackground
      image="https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80"
      boxed
      boxedWidth="max-w-7xl"
      overlayClass="bg-white/85 backdrop-blur"
    >
      <div className="p-2 sm:p-4">
        <h1 className="text-2xl font-bold mb-4">Checkout</h1>

        <form className="card p-4 space-y-3" onSubmit={onSubmit}>
          {/* Order summary */}
          {errorMsg && (
            <div className="p-2 rounded bg-rose-50 text-rose-700 text-sm border border-rose-200">
              {errorMsg}
            </div>
          )}
          <div>
            <div className="text-xs text-ink/60 mb-1">Items</div>
            <div className="divide-y">
              {(cart.items || []).map((it) => (
                <div key={it.productId || it.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="text-sm truncate">
                    <span className="font-medium">{it.qty}×</span> {it.name}
                  </div>
                  <div className="text-sm font-semibold">
                    ₱{(Number(it.price || 0) * Number(it.qty || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink/60 mb-1">Method</div>
            <div className="flex flex-wrap gap-2 items-center">
              {manualMethods.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`px-3 py-2 rounded border ${
                    method === m
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white"
                  }`}
                  onClick={() => !busy && setMethod(m)}
                  disabled={busy}
                >
                  {MANUAL_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {method === "static_qr" && (
            <div className="space-y-2">
              <p className="text-sm">
                Scan the QR, then upload your proof below.
              </p>
              <div className="flex gap-2">
                {qr?.static?.gcash?.imageUrl && (
                  <img
                    src={qr.static.gcash.imageUrl}
                    alt="GCash QR"
                    className="max-w-[200px] border rounded"
                  />
                )}
                {qr?.static?.bank?.imageUrl && (
                  <img
                    src={qr.static.bank.imageUrl}
                    alt="Bank QR"
                    className="max-w-[200px] border rounded"
                  />
                )}
              </div>
            </div>
          )}

          {/* Show manual inputs only when method is one of the manual ones */}
          {isManual && (
            <>
              <label className="block">
                <div className="text-xs text-ink/60">Reference No</div>
                <input
                  className="input"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                />
              </label>
              <label className="block">
                <div className="text-xs text-ink/60">
                  Proof (JPG/PNG/WEBP/PDF ≤ 2MB)
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                    if (!f) { setFileError(""); return; }
                    if (!validateFile(f)) {
                      setFileError("Must be JPG/PNG/WEBP/PDF up to 2MB.");
                    } else {
                      setFileError("");
                    }
                  }}
                />
                {fileError && <div className="text-sm text-rose-700 mt-1">{fileError}</div>}
              </label>
              {busy && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="w-full bg-gray-200 rounded h-2 overflow-hidden">
                  <div
                    className="bg-brand-600 h-2"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-lg font-semibold">Total</div>
            <div className="text-lg font-bold">
              ₱
              {Number(subtotal).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>

          <div>
            <button className="btn btn-primary" disabled={!canSubmit} type="submit">
              {busy ? "Processing…" : "Place Order"}
            </button>
          </div>
        </form>
      </div>
    </PageBackground>
  );
}
