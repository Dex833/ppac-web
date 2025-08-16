// src/pages/accounting/index.jsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { createPortal } from "react-dom";
import AccountingNav from "./AccountingNav";            // desktop nav
import PageBackground from "../../components/PageBackground";

const accountingBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

/* ---------- Mobile drawer (ported to <body>) ---------- */
function MobileAccountingMenu({ open, onClose }) {
  // lock scroll while open
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // esc to close
  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const linkBase =
    "block px-3 py-2 rounded-lg text-sm font-medium transition hover:bg-brand-50";

  return createPortal(
    <div className="fixed inset-0 z-[1000] md:hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      {/* Drawer */}
      <div
        className="
          absolute right-0 top-0 h-full w-[82vw] max-w-[320px]
          bg-white shadow-2xl flex flex-col
          pt-[max(env(safe-area-inset-top),0.75rem)]
          pb-[max(env(safe-area-inset-bottom),0.75rem)]
        "
      >
        <div className="px-4 pb-3 flex items-center justify-between">
          <span className="font-semibold">Accounting Menu</span>
          <button className="p-2 rounded hover:bg-gray-100" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <nav className="px-2 flex-1 overflow-auto">
          <ul className="space-y-1">
            <li>
              <NavLink
                to="/accounting/journal-entries"
                className={({ isActive }) =>
                  isActive ? `${linkBase} bg-brand-600 text-white shadow-sm` : `${linkBase} text-ink/80`
                }
                onClick={onClose}
              >
                Journal Entries
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/accounting/general-journal"
                className={({ isActive }) =>
                  isActive ? `${linkBase} bg-brand-600 text-white shadow-sm` : `${linkBase} text-ink/80`
                }
                onClick={onClose}
              >
                General Journal
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/accounting/ledger"
                className={({ isActive }) =>
                  isActive ? `${linkBase} bg-brand-600 text-white shadow-sm` : `${linkBase} text-ink/80`
                }
                onClick={onClose}
              >
                Ledger
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/accounting/trial-balance"
                className={({ isActive }) =>
                  isActive ? `${linkBase} bg-brand-600 text-white shadow-sm` : `${linkBase} text-ink/80`
                }
                onClick={onClose}
              >
                Trial Balance
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/accounting/financial-statements"
                className={({ isActive }) =>
                  isActive ? `${linkBase} bg-brand-600 text-white shadow-sm` : `${linkBase} text-ink/80`
                }
                onClick={onClose}
              >
                Financial Statements
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/accounting/chart-of-accounts"
                className={({ isActive }) =>
                  isActive ? `${linkBase} bg-brand-600 text-white shadow-sm` : `${linkBase} text-ink/80`
                }
                onClick={onClose}
              >
                Chart of Accounts
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>
    </div>,
    document.body
  );
}

/* ---------- Page ---------- */
export default function Accounting() {
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Listen for global header trigger
  React.useEffect(() => {
    function onOpen() {
      setMenuOpen(true);
    }
    window.addEventListener("open-accounting-menu", onOpen);
    return () => window.removeEventListener("open-accounting-menu", onOpen);
  }, []);

  return (
    <PageBackground
      image={accountingBg}
      boxed
      boxedWidth="max-w-7xl"
      overlayClass="bg-white/85 backdrop-blur"
      className="page-gutter"
    >
      {/* Sticky title row on mobile: sits directly under the main app header */}
      <div
        className="
          sticky md:static top-[var(--app-header-h,56px)] z-40
          -mx-4 px-4 md:mx-0 md:px-0
          bg-white/95 backdrop-blur border-b
        "
      >
        <div className="flex items-center gap-3 py-2">
          <h2 className="text-2xl font-bold">Accounting</h2>
          {/* Mobile trigger moved to global header; keep an a11y fallback */}
          <button className="sr-only" onClick={() => setMenuOpen(true)} aria-label="Open accounting menu">Menu</button>
        </div>
      </div>

      {/* Desktop tabs */}
      <div className="hidden md:block mb-6">
        <AccountingNav />
      </div>

      {/* Mobile drawer (now portaled to body) */}
      <MobileAccountingMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Child routes */}
      <Outlet />
    </PageBackground>
  );
}
