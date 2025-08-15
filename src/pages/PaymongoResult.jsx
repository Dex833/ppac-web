import React from "react";

export function PaymongoSuccess() {
  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="card p-6">
        <h2 className="text-xl font-semibold mb-2">Payment Success</h2>
        <p>Thanks! Your payment was received. We’ll post it automatically. You can view your receipt from Payment History shortly.</p>
      </div>
    </div>
  );
}

export function PaymongoCancel() {
  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="card p-6">
        <h2 className="text-xl font-semibold mb-2">Payment Canceled</h2>
        <p>Payment was canceled. You can try again from the Payments page.</p>
      </div>
    </div>
  );
}
