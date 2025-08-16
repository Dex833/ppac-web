// src/pages/Admin.jsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { createPortal } from "react-dom";
import PageBackground from "../components/PageBackground";
import useUserProfile from "../hooks/useUserProfile";
import { ensurePaymentsSettings } from "../lib/settings/payments";
import { ensureAccountingSettings } from "../lib/settings/accounting";
import { ensureQrSettings } from "../lib/settings/qr";

const adminBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

function AdminNavItem({ to, children, onClick }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        [
          "px-3 py-2 rounded-lg text-sm font-medium transition text-left",
          isActive
            ? "bg-brand-600 text-white shadow-sm"
            : "text-ink/70 hover:bg-brand-50 hover:text-ink",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}

/* ---------- Mobile drawer (ported to <body>) ---------- */
function MobileAdminMenu({ open, onClose }) {
  // lock body scroll
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
          <span className="font-semibold">Admin Menu</span>
          <button className="p-2 rounded hover:bg-gray-100" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <nav className="px-2 flex-1 overflow-auto">
          <ul className="space-y-1">
            <li>
              <AdminNavItem to="/admin/users" onClick={onClose}>Users</AdminNavItem>
            </li>
            <li>
              <AdminNavItem to="/admin/edit-home" onClick={onClose}>Edit Home</AdminNavItem>
            </li>
            <li>
              <AdminNavItem to="/admin/membership-status" onClick={onClose}>Membership Status</AdminNavItem>
            </li>
            <li>
              <AdminNavItem to="/admin/payments" onClick={onClose}>Payments</AdminNavItem>
            </li>
            <li>
              <AdminNavItem to="/admin/products" onClick={onClose}>Products</AdminNavItem>
            </li>
            <li>
              <AdminNavItem to="/admin/orders" onClick={onClose}>Orders</AdminNavItem>
            </li>
            <li>
              <AdminNavItem to="/admin/settings/accounting" onClick={onClose}>Accounting Settings</AdminNavItem>
            </li>
            <li>
              <AdminNavItem to="/admin/ops" onClick={onClose}>Ops</AdminNavItem>
            </li>
          </ul>
        </nav>
      </div>
    </div>,
    document.body
  );
}

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { profile } = useUserProfile();
  const isAdmin = Array.isArray(profile?.roles)
    ? profile.roles.includes("admin")
    : (profile?.role === "admin");

  // Ensure payments settings exist when an admin opens Admin
  const ensuredRef = React.useRef(false);
  React.useEffect(() => {
    if (!isAdmin || ensuredRef.current) return;
    ensuredRef.current = true;
    ensurePaymentsSettings().catch(() => {});
  ensureAccountingSettings().catch(() => {});
  ensureQrSettings().catch(() => {});
  }, [isAdmin]);

  // removed init button/state

  // Close on Escape
  React.useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    if (mobileOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Listen for global header trigger to open the Admin drawer on mobile
  React.useEffect(() => {
    function onOpen() {
      setMobileOpen(true);
    }
    window.addEventListener("open-admin-menu", onOpen);
    return () => window.removeEventListener("open-admin-menu", onOpen);
  }, []);

  return (
    <PageBackground
      image={adminBg}
      boxed
      boxedWidth="max-w-7xl"     // show more background on the sides
      overlayClass="bg-white/85 backdrop-blur"
      className="page-gutter"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin</h1>
        {/* Mobile menu button moved to global header; keep a11y-only fallback hidden visually */}
        <button
          type="button"
          className="sr-only"
          aria-label="Open admin menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          Menu
        </button>
      </div>

      {/* Layout */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left nav (desktop) */}
        <aside className="hidden md:block w-56 shrink-0 md:sticky md:top-4">
          <div className="card p-3">
            <nav className="flex md:flex-col gap-2">
              <AdminNavItem to="/admin/users">Users</AdminNavItem>
              <AdminNavItem to="/admin/edit-home">Edit Home</AdminNavItem>
              <AdminNavItem to="/admin/membership-status">Membership Status</AdminNavItem>
              <AdminNavItem to="/admin/payments">Payments</AdminNavItem>
              <AdminNavItem to="/admin/products">Products</AdminNavItem>
              <AdminNavItem to="/admin/orders">Orders</AdminNavItem>
              <AdminNavItem to="/admin/settings/accounting">Accounting Settings</AdminNavItem>
              <AdminNavItem to="/admin/ops">Ops</AdminNavItem>
            </nav>
          </div>
        </aside>

  {/* Mobile nav drawer (portaled) */}
  <MobileAdminMenu open={mobileOpen} onClose={() => setMobileOpen(false)} />

        {/* Main content (nested admin routes render here) */}
        <section className="flex-1 min-w-0">
          <Outlet />
        </section>
      </div>
    </PageBackground>
  );
}
