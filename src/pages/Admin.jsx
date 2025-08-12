// src/pages/Admin.jsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import PageBackground from "../components/PageBackground";

const adminBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

function AdminNavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        [
          "px-3 py-2 rounded-lg text-sm font-medium transition",
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
  return (
    <PageBackground
      image={adminBg}
      boxed
      boxedWidth="max-w-7xl"         // show more background on the sides
      overlayClass="bg-white/85 backdrop-blur"
    >
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left nav */}
        <aside className="w-full md:w-56 shrink-0">
          <div className="card p-3">
            <nav className="flex md:flex-col gap-2">
              <AdminNavItem to="/admin/users">Users</AdminNavItem>
              <AdminNavItem to="/admin/edit-home">Edit Home</AdminNavItem>
            </nav>
          </div>
        </aside>

        {/* Main content (nested admin routes render here) */}
        <section className="flex-1 min-w-0">
          <Outlet />
        </section>
      </div>
    </PageBackground>
  );
}
