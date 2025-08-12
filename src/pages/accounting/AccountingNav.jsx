import React from "react";
import { NavLink } from "react-router-dom";

function linkClass({ isActive }) {
  return [
    "px-3 py-2 rounded-lg text-sm font-medium transition",
    isActive
      ? "bg-brand-600 text-white shadow-sm"
      : "text-ink/70 hover:bg-brand-50 hover:text-ink",
  ].join(" ");
}

export default function AccountingNav() {
  return (
    <nav className="flex flex-wrap gap-2 mb-6">
      <NavLink to="/accounting/journal-entries" className={linkClass}>
        Journal Entries
      </NavLink>
      <NavLink to="/accounting/general-journal" className={linkClass}>
        General Journal
      </NavLink>
      <NavLink to="/accounting/ledger" className={linkClass}>
        Ledger
      </NavLink>
      <NavLink to="/accounting/trial-balance" className={linkClass}>
        Trial Balance
      </NavLink>
      <NavLink to="/accounting/financial-statements" className={linkClass}>
        Financial Statements
      </NavLink>
      <NavLink to="/accounting/chart-of-accounts" className={linkClass}>
        Chart of Accounts
      </NavLink>
    </nav>
  );
}
