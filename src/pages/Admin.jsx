// src/pages/Admin.jsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import PageBackground from "../components/PageBackground";

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

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Close on Escape
  React.useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    if (mobileOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

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

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium shadow-sm"
          aria-label="Open admin menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="i-hamburger" aria-hidden>☰</span>
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
            </nav>
          </div>
        </aside>

        {/* Mobile nav drawer (overlay + panel) */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40">
            {/* Dim background */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            {/* Panel */}
            <div className="absolute left-4 right-4 top-20 rounded-2xl border border-gray-200 bg-white shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="font-semibold">Admin Menu</div>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 hover:bg-gray-100"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                >
                  ✕
                </button>
              </div>
              <nav className="p-3 flex flex-col gap-2">
                <AdminNavItem
                  to="/admin/users"
                  onClick={() => setMobileOpen(false)}
                >
                  Users
                </AdminNavItem>
                <AdminNavItem
                  to="/admin/edit-home"
                  onClick={() => setMobileOpen(false)}
                >
                  Edit Home
                </AdminNavItem>
              </nav>
            </div>
          </div>
        )}

        {/* Main content (nested admin routes render here) */}
        <section className="flex-1 min-w-0">
          <Outlet />
        </section>
      </div>
    </PageBackground>
  );
}
