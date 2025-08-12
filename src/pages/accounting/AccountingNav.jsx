import React from "react";
import { NavLink } from "react-router-dom";

export default function AccountingNav() {
  return (
    <nav className="flex flex-wrap gap-2 mb-6">
  <NavLink to="/accounting/journal-entries" className="btn btn-sm btn-outline">Journal Entries</NavLink>
  <NavLink to="/accounting/general-journal" className="btn btn-sm btn-outline">General Journal</NavLink>
  <NavLink to="/accounting/ledger" className="btn btn-sm btn-outline">Ledger</NavLink>
  <NavLink to="/accounting/trial-balance" className="btn btn-sm btn-outline">Trial Balance</NavLink>
  <NavLink to="/accounting/financial-statements" className="btn btn-sm btn-outline">Financial Statements</NavLink>
  <NavLink to="/accounting/sales-invoice" className="btn btn-sm btn-outline">Sales &amp; Invoice</NavLink>
  <NavLink to="/accounting/chart-of-accounts" className="btn btn-sm btn-outline">Chart of Accounts</NavLink>
    </nav>
  );
}
