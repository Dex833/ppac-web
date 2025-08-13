import React from "react";

export default function ReportsToUser() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Reports for Members</h1>
      <img src="https://images.unsplash.com/photo-1464983953574-0892a716854b?auto=format&fit=crop&w=800&q=80" alt="Reports" className="rounded-xl mb-4 w-full h-64 object-cover" />
      <p className="mb-4 text-lg">Access your cooperative reports here. Stay updated on your share capital, loan status, and cooperative performance. Our new website makes it easy for you to track your financials and stay informed.</p>
      <ul className="list-disc pl-6 mb-4">
        <li>View your share capital and loan balances</li>
        <li>Check transaction history</li>
        <li>Download statements and reports</li>
      </ul>
      <p className="text-ink/70">For more details, contact our office or visit the dashboard.</p>
    </div>
  );
}
