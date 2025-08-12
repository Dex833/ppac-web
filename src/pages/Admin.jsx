// src/pages/Admin.jsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div className="card p-6">
      <h1 className="text-3xl font-bold mb-4">Admin</h1>

      {/* simple tabs */}
      <div className="mb-6 flex gap-3">
        <NavLink
          to="/admin/users"
          className={({ isActive }) =>
            [
              "px-3 py-2 rounded-lg text-sm font-medium transition",
              isActive
                ? "bg-brand-600 text-white shadow-sm"
                : "text-ink/70 hover:bg-brand-50 hover:text-ink",
            ].join(" ")
          }
        >
          Users
        </NavLink>
        <NavLink
          to="/admin/edit-home"
          className={({ isActive }) =>
            [
              "px-3 py-2 rounded-lg text-sm font-medium transition",
              isActive
                ? "bg-brand-600 text-white shadow-sm"
                : "text-ink/70 hover:bg-brand-50 hover:text-ink",
            ].join(" ")
          }
        >
          Edit Home
        </NavLink>
      </div>

      {/* child route renders here */}
      <Outlet />
    </div>
  );
}
