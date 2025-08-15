import React from "react";
import { Link } from "react-router-dom";

export default function PostingResultDialog({ open, variant = "success", receiptNo, journalNo, message = "", onClose, paymentId }) {
  if (!open) return null;
  const isError = variant === "error";

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[480px] max-w-[95vw] p-5">
        <div className="flex items-start gap-3">
          <div className={`text-3xl ${isError ? "text-amber-600" : "text-emerald-600"}`} aria-hidden>
            {isError ? "⚠️" : "✅"}
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold mb-1">
              {isError ? "Posting failed" : "Payment posted"}
            </div>
            {!isError ? (
              <div className="space-y-1 text-sm">
                {receiptNo ? (
                  <div>
                    <span className="text-ink/60">Receipt #</span> <b>{receiptNo}</b>
                  </div>
                ) : null}
                {journalNo ? (
                  <div>
                    <span className="text-ink/60">Journal #</span> <b>{journalNo}</b>
                  </div>
                ) : null}
                {!receiptNo && !journalNo ? (
                  <div className="text-ink/60">Processing… numbers will appear shortly.</div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm whitespace-pre-wrap break-words">{String(message || "").trim() || "Unknown error"}</div>
                <div className="flex gap-2">
                  <Link className="btn btn-sm btn-outline" to="/admin/settings/accounting" onClick={onClose}>
                    Open Accounting Settings
                  </Link>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => navigator.clipboard?.writeText(String(message || "").trim())}
                  >
                    Copy error
                  </button>
                </div>
              </div>
            )}
          </div>
          <button className="rounded p-1 hover:bg-gray-100" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {!isError ? (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-ink/60">You’ll be redirected to the Payments list.</div>
            {receiptNo && paymentId ? (
              <Link className="btn btn-sm btn-outline" to={`/receipt/${paymentId}`} onClick={onClose}>
                Open Receipt
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
