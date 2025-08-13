// src/pages/accounting/index.jsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import AccountingNav from "./AccountingNav";            // desktop nav
import PageBackground from "../../components/PageBackground";

const accountingBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

/* ---------- Mobile sticky bar (no drawer) ---------- */
function MobileStickyAccountingNav() {
  const base = "px-3 py-2 rounded-lg text-sm font-medium transition-colors";
  const active = "bg-brand-600 text-white shadow-sm";
  const idle = "text-ink/80 hover:bg-brand-50";

  return (
    <nav
      className="
        md:hidden sticky top-[var(--app-header-h,56px)] z-40
        bg-white/95 backdrop-blur border-b
      "
      aria-label="Accounting"
    >
      <div className="mx-auto max-w-7xl px-3 py-2">
        {/* Wraps to multiple rows on small screens — no horizontal scroll */}
        <div className="flex flex-wrap gap-2">
          <NavLink to="/accounting/journal-entries" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
            Journal Entries
          </NavLink>
          <NavLink to="/accounting/general-journal" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
            General Journal
          </NavLink>
          <NavLink to="/accounting/ledger" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
            Ledger
          </NavLink>
          <NavLink to="/accounting/trial-balance" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
          Trial Balance
          </NavLink>
          <NavLink to="/accounting/financial-statements" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
            Financial Statements
          </NavLink>
          <NavLink to="/accounting/chart-of-accounts" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
            Chart of Accounts
          </NavLink>
        </div>
      </div>
    </nav>
  );
}

/* ---------- Page ---------- */
export default function Accounting() {
  return (
    <PageBackground
      image={accountingBg}
      boxed
      boxedWidth="max-w-7xl"
      overlayClass="bg-white/85 backdrop-blur"
      className="page-gutter"
    >
      {/* Title */}
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-2xl font-bold">Accounting</h2>
      </div>

      {/* Mobile sticky nav just below main header */}
      <MobileStickyAccountingNav />

      {/* Desktop tabs */}
      <div className="hidden md:block mb-6">
        <AccountingNav />
      </div>

      {/* Child routes */}
      <Outlet />
    </PageBackground>
  );
}
