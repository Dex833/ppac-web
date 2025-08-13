import React from "react";
import { Link } from "react-router-dom";

export default function WhatYouHaveModal({ open, onClose, user, shareCapital, loan, balikTangkilik }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 relative"
        style={{
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          overflowY: 'auto',
        }}
      >
        <button
          className="absolute top-2 right-2 text-2xl text-ink/50 hover:text-ink"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
  <h2 className="text-xl font-bold mb-4">What You Have</h2>
        <div className="mb-3">
          <div className="font-semibold">Name:</div>
          <div className="mb-2">{user?.displayName || user?.email || "Member"}</div>
        </div>
        <div className="mb-3">
          <div className="font-semibold">Share Capital:</div>
          <div className="mb-2">{shareCapital ?? <span className="text-ink/50">—</span>}</div>
        </div>
        <div className="mb-3">
          <div className="font-semibold">Loan:</div>
          <div className="mb-2">{loan ?? <span className="text-ink/50">—</span>}</div>
        </div>
        <div className="mb-3">
          <div className="font-semibold">Balik Tangkilik:</div>
          <div className="mb-2">{balikTangkilik ?? <span className="text-ink/50">—</span>}</div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Link to="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
