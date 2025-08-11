import React, { useState } from "react";
import IncomeStatement from "./financials/IncomeStatement";
import BalanceSheet from "./financials/BalanceSheet";
import CashFlowStatement from "./financials/CashFlowStatement";

const TABS = [
  { key: "income", label: "Income Statement" },
  { key: "balance", label: "Balance Sheet" },
  { key: "cashflow", label: "Cash Flow Statement" },
];

export default function FinancialStatements() {
  const [tab, setTab] = useState("income");
  return (
    <div className="overflow-x-auto">
      <h2 className="text-2xl font-bold mb-6">Financial Statements</h2>
      <div className="mb-4 flex gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`px-4 py-2 rounded ${tab === t.key ? "bg-green-600 text-white" : "bg-gray-200"}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "income" && <IncomeStatement />}
      {tab === "balance" && <BalanceSheet />}
      {tab === "cashflow" && <CashFlowStatement />}
    </div>
  );
}
