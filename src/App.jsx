// src/App.jsx
import React, { Suspense, lazy } from "react";
import { Routes, Route, Link, NavLink, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "./AuthContext";
import useUserProfile from "./hooks/useUserProfile";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import GuestRoute from "./components/GuestRoute.jsx";
import RequireRole from "./components/RequireRole.jsx";
import LoginModal from "./components/LoginModal.jsx";

import Home from "./pages/Home.jsx";                 // <-- new: renders Firestore-driven home content
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Verify from "./pages/Verify.jsx";
import Reset from "./pages/Reset.jsx";
import Profile from "./pages/Profile.jsx";
import BecomeMember from "./pages/BecomeMember.jsx";

import AdminLayout from "./pages/Admin.jsx";
import AdminUsers from "./pages/admin/Users.jsx";
import EditHome from "./pages/admin/EditHome.jsx";

// Lazy load accounting pages
const Accounting = lazy(() => import("./pages/accounting/index.jsx"));
const ChartOfAccounts = lazy(() => import("./pages/accounting/ChartOfAccounts.jsx"));
const JournalEntries = lazy(() => import("./pages/accounting/JournalEntries.jsx"));
const GeneralJournal = lazy(() => import("./pages/accounting/GeneralJournal.jsx"));
const Ledger = lazy(() => import("./pages/accounting/Ledger.jsx"));
const TrialBalance = lazy(() => import("./pages/accounting/TrialBalance.jsx"));
const FinancialStatements = lazy(() => import("./pages/accounting/FinancialStatements.jsx"));
const SalesInvoice = lazy(() => import("./pages/accounting/SalesInvoice.jsx"));

import ppacLogo from "./assets/ppac-logo.png";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "px-3 py-2 rounded-lg text-sm font-medium transition",
          isActive ? "bg-brand-600 text-white shadow-sm" : "text-ink/70 hover:bg-brand-50 hover:text-ink",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}

export default function App() {
  const { profile } = useUserProfile();
  const [loginOpen, setLoginOpen] = React.useState(false);
  const nav = useNavigate();
  const { signout } = useAuth();

  const roles = Array.isArray(profile?.roles) ? profile.roles : profile?.role ? [profile.role] : [];
  const isAdmin = roles.includes("admin");
  const isTreasurer = roles.includes("treasurer");
  const isManager = roles.includes("manager");
  const notSuspended = profile?.suspended !== true;

  // Palawan farm/nature background image (Unsplash, free to use)
  // Example: https://unsplash.com/photos/green-grass-field-near-mountain-under-white-clouds-during-daytime-1K6IQsQbizI
  const bgUrl = 'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80'; // Palawan rice field

  return (
    <div
      className="min-h-screen text-ink"
      style={{
        backgroundImage: `url(${bgUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Top info bar */}
      <div className="w-full bg-brand-50 border-b border-brand-100 text-xs text-ink/70 py-1 px-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
          <span>📍 123 Rizal Ave, Puerto Princesa City, Palawan</span>
          <span>☎️ (048) 433-1234</span>
        </div>
        <div>
          <a href="https://facebook.com/ppac.coop" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline flex items-center gap-1">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M22.675 0h-21.35C.595 0 0 .592 0 1.326v21.348C0 23.406.595 24 1.325 24h11.495v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.797.143v3.24l-1.918.001c-1.504 0-1.797.715-1.797 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.406 24 24 23.406 24 22.674V1.326C24 .592 23.406 0 22.675 0"/></svg>
            Facebook
          </a>
        </div>
      </div>

      {/* Title bar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center sm:justify-between py-4">
          <div className="flex items-center gap-3 w-full">
            <Link to="/" className="flex items-center gap-3 flex-1 min-w-0">
              <img src={ppacLogo} alt="Puerto Princesa Agriculture Cooperative" className="h-9 w-auto rounded-full shrink-0" />
              <span className="text-lg sm:text-xl font-semibold truncate">
                Puerto Princesa Agriculture Cooperative
              </span>
            </Link>
          </div>
        </div>
        {/* Nav bar below title */}
        <nav className="w-full border-t border-border bg-white flex items-center py-2 relative">
          <div className="flex gap-1 items-center justify-center flex-1">
            <NavItem to="/">Home</NavItem>
            {profile && <NavItem to="/dashboard">Dashboard</NavItem>}
            {isAdmin && notSuspended && <NavItem to="/admin/users">Admin</NavItem>}
            {notSuspended && (isAdmin || isTreasurer || isManager) && <NavItem to="/accounting">Accounting</NavItem>}
            {!profile && (
              <>
                <button
                  className="px-3 py-2 rounded-lg text-sm font-medium transition text-ink/70 hover:bg-brand-50 hover:text-ink"
                  style={{ background: loginOpen ? "#e0f2fe" : undefined }}
                  onClick={() => setLoginOpen(true)}
                >
                  Login
                </button>
                <NavItem to="/signup">Signup</NavItem>
              </>
            )}
          </div>
          {/* Right-aligned Become Member or Welcome/Sign out */}
          {!profile ? (
            <div className="absolute right-4">
              <Link to="/become-member" className="btn btn-primary">Become Member</Link>
            </div>
          ) : (
            <div className="absolute right-4 flex items-center">
              <span className="px-2 text-sm text-ink/80 font-medium whitespace-nowrap">
                Welcome, {profile.displayName || profile.email || "User"}
              </span>
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
            </div>
          )}
        </nav>
      </header>

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => {
          setLoginOpen(false);
          nav("/", { replace: true });
        }}
      />

      <main className="mx-auto max-w-5xl px-4 py-10">
        <Routes>
          {/* Home (driven by Firestore via pages/Home.jsx) */}
          <Route path="/" element={<Home />} />

          {/* Standalone pages */}
          <Route path="/become-member" element={<BecomeMember />} />

          {/* Guest-only */}
          <Route
            path="/signup"
            element={
              <GuestRoute>
                <Signup openLoginModal={() => setLoginOpen(true)} />
              </GuestRoute>
            }
          />
          <Route
            path="/reset"
            element={
              <GuestRoute>
                <Reset />
              </GuestRoute>
            }
          />

          {/* Auth-only */}
          <Route
            path="/verify"
            element={
              <ProtectedRoute>
                <Verify />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute requireVerified={true}>
                <Profile />
              </ProtectedRoute>
            }
          />

          {/* Admin-only (nested) */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <RequireRole allowed={["admin"]}>
                  <AdminLayout />
                </RequireRole>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="edit-home" element={<EditHome />} />
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
            <Route
              path="chart-of-accounts"
              element={
                <Suspense fallback={<div className="p-6">Loading…</div>}>
                  <ChartOfAccounts />
                </Suspense>
              }
            />
            <Route
              path="journal-entries"
              element={
                <Suspense fallback={<div className="p-6">Loading…</div>}>
                  <JournalEntries />
                </Suspense>
              }
            />
            <Route
              path="general-journal"
              element={
                <Suspense fallback={<div className="p-6">Loading…</div>}>
                  <GeneralJournal />
                </Suspense>
              }
            />
            <Route
              path="ledger"
              element={
                <Suspense fallback={<div className="p-6">Loading…</div>}>
                  <Ledger />
                </Suspense>
              }
            />
            <Route
              path="trial-balance"
              element={
                <Suspense fallback={<div className="p-6">Loading…</div>}>
                  <TrialBalance />
                </Suspense>
              }
            />
            <Route
              path="financial-statements"
              element={
                <Suspense fallback={<div className="p-6">Loading…</div>}>
                  <FinancialStatements />
                </Suspense>
              }
            />
            <Route
              path="sales-invoice"
              element={
                <Suspense fallback={<div className="p-6">Loading…</div>}>
                  <SalesInvoice />
                </Suspense>
              }
            />
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
