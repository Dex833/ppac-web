// src/App.jsx
import React from "react";
import { Routes, Route, Link, NavLink, Navigate, useNavigate } from "react-router-dom";

import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Verify from "./pages/Verify.jsx";
import Reset from "./pages/Reset.jsx";

import AdminLayout from "./pages/Admin.jsx";
import AdminUsers from "./pages/admin/Users.jsx";

// Lazy load accounting pages
import { Suspense, lazy } from "react";
const Accounting = lazy(() => import("./pages/accounting/index.jsx"));
const ChartOfAccounts = lazy(() => import("./pages/accounting/ChartOfAccounts.jsx"));
const JournalEntries = lazy(() => import("./pages/accounting/JournalEntries.jsx"));
const GeneralJournal = lazy(() => import("./pages/accounting/GeneralJournal.jsx"));
const Ledger = lazy(() => import("./pages/accounting/Ledger.jsx"));
const TrialBalance = lazy(() => import("./pages/accounting/TrialBalance.jsx"));
const FinancialStatements = lazy(() => import("./pages/accounting/FinancialStatements.jsx"));

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import GuestRoute from "./components/GuestRoute.jsx";
import RequireRole from "./components/RequireRole.jsx";
import useUserProfile from "./hooks/useUserProfile";
import Profile from "./pages/Profile.jsx";
import LoginModal from "./components/LoginModal.jsx";
import { useAuth } from "./AuthContext";

// import the transparent PNG from src/assets
import ppacLogo from "./assets/ppac-logo.png";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
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

export default function App() {
  const { loading, profile } = useUserProfile();
  const [loginOpen, setLoginOpen] = React.useState(false);
  const nav = useNavigate();
  const { user, signout } = useAuth();

  // Normalize roles to an array; backward-compatible with single 'role'
  const roles = Array.isArray(profile?.roles)
    ? profile.roles
    : profile?.role
    ? [profile.role]
    : [];

  const isAdmin = roles.includes("admin");
  const isTreasurer = roles.includes("treasurer");
  const isManager = roles.includes("manager");
  const notSuspended = profile?.suspended !== true;

  return (
    <div className="min-h-screen text-ink">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={ppacLogo}
              alt="Puerto Princesa Agriculture Cooperative"
              className="h-9 w-auto rounded-full"
              style={{ maxHeight: "36px" }}
            />
            <span className="text-lg sm:text-xl font-semibold">
              Puerto Princesa Agriculture Cooperative
            </span>
          </Link>

          <nav className="flex gap-1 items-center flex-1 justify-end">
            <NavItem to="/">Home</NavItem>
            {!profile && (
              <>
                <button
                  className="px-3 py-2 rounded-lg text-sm font-medium transition text-ink/70 hover:bg-brand-50 hover:text-ink"
                  style={{ background: loginOpen ? '#e0f2fe' : undefined }}
                  onClick={() => setLoginOpen(true)}
                >
                  Login
                </button>
                <NavItem to="/signup">Signup</NavItem>
              </>
            )}
            <NavItem to="/dashboard">Dashboard</NavItem>
            {/* Show Admin tab only when user is admin and not suspended */}
            {isAdmin && notSuspended && <NavItem to="/admin/users">Admin</NavItem>}
            {/* Show Accounting tab only for admin, treasurer, or manager and not suspended */}
            {(notSuspended && (isAdmin || isTreasurer || isManager)) && (
              <NavItem to="/accounting">Accounting</NavItem>
            )}
            {profile && (
              <>
                <span className="ml-4 px-2 text-sm text-ink/80 font-medium whitespace-nowrap">Welcome, {profile.displayName || profile.email || "User"}</span>
                <button
                  className="ml-2 px-3 py-2 rounded-lg text-sm font-medium transition text-rose-700 hover:bg-rose-50 hover:text-rose-900"
                  onClick={async () => {
                    if (window.confirm("Are you sure you want to sign out?")) {
                      await signout();
                      nav("/", { replace: true });
                    }
                  }}
                >
                  Sign out
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onSuccess={() => { setLoginOpen(false); nav("/", { replace: true }); }} />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Routes>
          <Route
            path="/"
            element={
              <div className="max-w-2xl card p-6">
                <h2 className="text-2xl font-bold mb-3">Welcome 👋</h2>
                <p className="text-ink/70">
                  Use the navigation to log in, create an account, or open your dashboard.
                </p>
              </div>
            }
          />

          {/* Guest-only (no /login route) */}
          <Route path="/signup" element={<GuestRoute><Signup openLoginModal={() => setLoginOpen(true)} /></GuestRoute>} />
          <Route path="/reset" element={<GuestRoute><Reset /></GuestRoute>} />

          {/* Auth-only */}
          <Route path="/verify" element={<ProtectedRoute><Verify /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute requireVerified={true}><Profile /></ProtectedRoute>} />

          {/* Admin-only (nested) */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                {/* Require 'admin' role; suspended users are blocked inside RequireRole */}
                <RequireRole allowed={["admin"]}>
                  <AdminLayout />
                </RequireRole>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>

          {/* Accounting-only (nested) */}
          <Route
            path="/accounting"
            element={
              <ProtectedRoute>
                <RequireRole allowed={["admin", "treasurer", "manager"]}>
                  <Suspense fallback={<div className="p-6">Loading…</div>}>
                    <Accounting />
                  </Suspense>
                </RequireRole>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="journal-entries" replace />} />
            <Route path="chart-of-accounts" element={<Suspense fallback={<div className="p-6">Loading…</div>}><ChartOfAccounts /></Suspense>} />
            <Route path="journal-entries" element={<Suspense fallback={<div className="p-6">Loading…</div>}><JournalEntries /></Suspense>} />
            <Route path="general-journal" element={<Suspense fallback={<div className="p-6">Loading…</div>}><GeneralJournal /></Suspense>} />
            <Route path="ledger" element={<Suspense fallback={<div className="p-6">Loading…</div>}><Ledger /></Suspense>} />
            <Route path="trial-balance" element={<Suspense fallback={<div className="p-6">Loading…</div>}><TrialBalance /></Suspense>} />
            <Route path="financial-statements" element={<Suspense fallback={<div className="p-6">Loading…</div>}><FinancialStatements /></Suspense>} />
          </Route>

          {/* 404 */}
          <Route
            path="*"
            element={
              <div className="text-center py-20">
                <h2 className="text-3xl font-bold mb-2">404 — Page Not Found</h2>
                <p className="text-ink/70">Check the URL or use the navigation above.</p>
              </div>
            }
          />
        </Routes>
      </main>

      <footer className="border-t border-border bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-ink/60">
          © {new Date().getFullYear()} Puerto Princesa Agriculture Cooperative
        </div>
      </footer>
    </div>
  );
}
