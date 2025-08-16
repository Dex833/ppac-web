// MobileMenu component for mobile drawer navigation
function MobileMenu({
  open,
  onClose,
  isAdmin,
  isTreasurer,
  isManager,
  notSuspended,
  profile,
  onLogin,
  onSignup,
  onSignout,
}) {
  React.useEffect(() => {
    // lock scroll
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      {/* Drawer */}
      <div
        className="
          absolute right-0 top-0 h-full w-[82vw] max-w-[320px]
          bg-white shadow-2xl
          pt-[max(env(safe-area-inset-top),0.75rem)] pb-[max(env(safe-area-inset-bottom),0.75rem)]
          flex flex-col
        "
      >
        <div className="px-4 pb-3 flex items-center justify-between">
          <span className="font-semibold">Menu</span>
          <button className="p-2 rounded hover:bg-gray-100" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <nav className="px-2 flex-1 overflow-auto">
          <ul className="space-y-1">
            <li>
              <Link className="block px-3 py-2 rounded hover:bg-brand-50" to="/" onClick={onClose}>
                Home
              </Link>
            </li>

            {!profile && (
              <>
                <li>
                  <button
                    className="block w-full text-left px-3 py-2 rounded hover:bg-brand-50"
                    onClick={() => {
                      onLogin();
                      onClose();
                    }}
                  >
                    Login
                  </button>
                </li>
                <li>
                  <Link className="block px-3 py-2 rounded hover:bg-brand-50" to="/signup" onClick={onClose}>
                    Signup
                  </Link>
                </li>
              </>
            )}

            <li>
              <Link className="block px-3 py-2 rounded hover:bg-brand-50" to="/dashboard" onClick={onClose}>
                Dashboard
              </Link>
            </li>

            {/* NEW: Reports (signed-in, not suspended) */}
            {profile && notSuspended && (
              <li>
                <Link className="block px-3 py-2 rounded hover:bg-brand-50" to="/reports" onClick={onClose}>
                  Reports
                </Link>
              </li>
            )}

            {/* Store (visible even when logged out; access enforced by route) */}
            <li>
              <Link className="block px-3 py-2 rounded hover:bg-brand-50" to="/store" onClick={onClose}>
                Store
              </Link>
            </li>

            {isAdmin && notSuspended && (
              <li>
                <Link className="block px-3 py-2 rounded hover:bg-brand-50" to="/admin/users" onClick={onClose}>
                  Admin
                </Link>
              </li>
            )}

            {(notSuspended && (isAdmin || isTreasurer || isManager)) && (
              <li>
                <Link className="block px-3 py-2 rounded hover:bg-brand-50" to="/accounting" onClick={onClose}>
                  Accounting
                </Link>
              </li>
            )}
          </ul>

          {profile && (
            <div className="mt-4 border-t pt-3 px-1">
              <div className="px-2 text-xs text-ink/60 mb-2">
                Signed in as
                <br />
                <span className="font-medium text-ink">{profile.displayName || profile.email}</span>
              </div>
              <button
                className="w-full px-3 py-2 rounded text-rose-700 hover:bg-rose-50 text-left"
                onClick={async () => {
                  await onSignout();
                  onClose();
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}

// src/App.jsx
import BecomeMember from "./pages/BecomeMember.jsx";
import React, { Suspense, lazy } from "react";
import { Routes, Route, Link, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext";
import useUserProfile from "./hooks/useUserProfile";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RequireFullMemberOrRole from "./components/RequireFullMemberOrRole.jsx";
import GuestRoute from "./components/GuestRoute.jsx";
import RequireRole from "./components/RequireRole.jsx";
import LoginModal from "./components/LoginModal.jsx";

import Home from "./pages/Home.jsx"; // <-- new: renders Firestore-driven home content
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Verify from "./pages/Verify.jsx";
import Reset from "./pages/Reset.jsx";
import Profile from "./pages/Profile.jsx";

import RequirementsMembership from "./pages/RequirementsMembership.jsx";

import AdminLayout from "./pages/Admin.jsx";
import AdminUsers from "./pages/admin/Users.jsx";
import EditHome from "./pages/admin/EditHome.jsx";
import MembershipStatusAdmin from "./pages/admin/MembershipStatus.jsx";
import MembershipReview from "./pages/admin/MembershipReview.jsx";
import AdminPayments from "./pages/admin/Payments.jsx";
import AccountingSettingsPage from "./pages/admin/AccountingSettings.jsx";
import OpsDashboard from "./pages/admin/OpsDashboard.jsx";
import PaymentsPage from "./pages/Payments.jsx";
import ReceiptPage from "./pages/Receipt.jsx";
// removed gateway result routes
import Store from "./pages/store/Store.jsx";
import Cart from "./pages/store/Cart.jsx";
import Checkout from "./pages/store/Checkout.jsx";
import Product from "./pages/store/Product.jsx";
import AdminProducts from "./pages/admin/AdminProducts.jsx";
import AdminOrders from "./pages/admin/AdminOrders.jsx";

// Lazy load accounting pages
const Accounting = lazy(() => import("./pages/accounting/index.jsx"));
const ChartOfAccounts = lazy(() => import("./pages/accounting/ChartOfAccounts.jsx"));
const JournalEntries = lazy(() => import("./pages/accounting/JournalEntries.jsx"));
const GeneralJournal = lazy(() => import("./pages/accounting/GeneralJournal.jsx"));
const Ledger = lazy(() => import("./pages/accounting/Ledger.jsx"));
const TrialBalance = lazy(() => import("./pages/accounting/TrialBalance.jsx"));
const FinancialStatements = lazy(() => import("./pages/accounting/FinancialStatements.jsx"));

// NEW: lazy load reports pages
const Reports = lazy(() => import("./pages/reports/Reports.jsx"));
const ReportView = lazy(() => import("./pages/reports/ReportView.jsx"));

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
  const location = useLocation();
  const { signout } = useAuth();

  const roles = Array.isArray(profile?.roles) ? profile.roles : profile?.role ? [profile.role] : [];
  const isAdmin = roles.includes("admin");
  const isTreasurer = roles.includes("treasurer");
  // Treat both 'manager' and 'general manager' as managers for UI access
  const isManager = roles.includes("manager") || roles.includes("general manager");
  const notSuspended = profile?.suspended !== true;

  const [menuOpen, setMenuOpen] = React.useState(false);
  const onAdminRoute = location.pathname.startsWith("/admin");
  const onAccountingRoute = location.pathname.startsWith("/accounting");

  return (
    <div className="min-h-screen text-ink">
      {/* Top info bar (desktop only) */}
      <div className="hidden sm:flex w-full bg-brand-50 border-b border-brand-100 text-xs text-ink/70 py-1 px-2 items-center justify-between gap-2">
        <div className="flex gap-6">
          <span>📍 Agri Trading Center, Brgy. Irawan, Puerto Princesa City, Palawan 5300</span>
          <span>☎️ 0950-468-6668</span>
        </div>
        <div>
          <a
            href="https://facebook.com/ppac.coop"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 hover:underline flex items-center gap-1"
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22.675 0h-21.35C.595 0 0 .592 0 1.326v21.348C0 23.406.595 24 1.325 24h11.495v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.797.143v3.24l-1.918.001c-1.504 0-1.797.715-1.797 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.406 24 24 23.406 24 22.674V1.326C24 .592 23.406 0 22.675 0" />
            </svg>
            Facebook
          </a>
        </div>
      </div>

      {/* Responsive header with mobile hamburger */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-border">
        <div className="mx-auto page-boxed page-gutter h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={ppacLogo} alt="Puerto Princesa Agriculture Cooperative" className="h-9 w-auto rounded-full" />
            <span className="text-lg sm:text-xl font-semibold">Puerto Princesa Agriculture Cooperative</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex gap-1 items-center">
            <NavItem to="/">Home</NavItem>
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
            <NavItem to="/dashboard">Dashboard</NavItem>

            {/* Reports tab visible to any signed-in not-suspended member; access enforced inside route */}
            {profile && notSuspended && <NavItem to="/reports">Reports</NavItem>}
            {profile && notSuspended && <NavItem to="/store">Store</NavItem>}

            {isAdmin && notSuspended && <NavItem to="/admin/users">Admin</NavItem>}
            {(notSuspended && (isAdmin || isTreasurer || isManager)) && <NavItem to="/accounting">Accounting</NavItem>}
            {profile && (
              <>
                <span className="ml-2 px-2 text-sm text-ink/80 whitespace-nowrap">
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
              </>
            )}
          </nav>

          {/* Mobile actions: optional Admin menu + main hamburger */}
          <div className="md:hidden flex items-center gap-2">
            {onAdminRoute && (
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium shadow-sm"
                aria-label="Open admin menu"
                onClick={() => {
                  // Notify Admin layout to open its drawer
                  window.dispatchEvent(new Event("open-admin-menu"));
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>Menu</span>
              </button>
            )}

            {onAccountingRoute && (
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium shadow-sm"
                aria-label="Open accounting menu"
                onClick={() => {
                  window.dispatchEvent(new Event("open-accounting-menu"));
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>Menu</span>
              </button>
            )}

            <button
              className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-brand-50"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* MobileMenu rendered outside header for full viewport coverage */}
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isAdmin={isAdmin}
        isTreasurer={isTreasurer}
  isManager={isManager}
        notSuspended={notSuspended}
        profile={profile}
        onLogin={() => setLoginOpen(true)}
        onSignup={() => nav("/signup")}
        onSignout={async () => {
          await signout();
          nav("/", { replace: true });
        }}
      />

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => {
          setLoginOpen(false);
          nav("/", { replace: true });
        }}
      />

  <main className="py-8 sm:py-10">
        <Routes>
          {/* Home (driven by Firestore via pages/Home.jsx) */}
          <Route path="/" element={<Home />} />

          {/* Standalone pages */}
          <Route path="/BecomeMember" element={<BecomeMember />} />
          <Route path="/RequirementsMembership" element={<RequirementsMembership />} />

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
          {/* Store */}
          <Route
            path="/store"
            element={
              <ProtectedRoute>
                <Store />
              </ProtectedRoute>
            }
          />
          <Route
            path="/store/product/:id"
            element={
              <ProtectedRoute>
                <Product />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cart"
            element={
              <ProtectedRoute>
                <Cart />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checkout"
            element={
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <ProtectedRoute>
                <PaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/receipt/:paymentId"
            element={
              <ProtectedRoute>
                <ReceiptPage />
              </ProtectedRoute>
            }
          />
          {/* gateway routes removed */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute requireVerified={true}>
                <Profile />
              </ProtectedRoute>
            }
          />

          {/* NEW: Reports (full members only, except admin + treasurer always allowed) */}
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <RequireFullMemberOrRole rolesAllowed={["admin", "treasurer"]}>
                  <Suspense fallback={<div className="p-6">Loading…</div>}>
                    <Reports />
                  </Suspense>
                </RequireFullMemberOrRole>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/:id"
            element={
              <ProtectedRoute>
                <RequireFullMemberOrRole rolesAllowed={["admin", "treasurer"]}>
                  <Suspense fallback={<div className="p-6">Loading…</div>}>
                    <ReportView />
                  </Suspense>
                </RequireFullMemberOrRole>
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
            <Route path="membership-status" element={<MembershipStatusAdmin />} />
            <Route path="membership-status/:uid" element={<MembershipReview />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="settings/accounting" element={<AccountingSettingsPage />} />
            <Route path="ops" element={<OpsDashboard />} />
          </Route>

          {/* Accounting-only (nested) */}
          <Route
      path="/accounting"
            element={
              <ProtectedRoute>
        <RequireRole allowed={["admin", "treasurer", "manager", "general manager"]}>
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
        {/* Info bar moved to footer on mobile */}
        <div className="sm:hidden bg-brand-50 border-b border-brand-100 text-xs text-ink/70">
          <div className="mx-auto max-w-5xl px-4 py-2 space-y-1">
            <div>📍 Agri Trading Center, Brgy. Irawan, Puerto Princesa City, Palawan 5300</div>
            <div>☎️ 0950-468-6668</div>
            <div>
              <a
                href="https://facebook.com/ppac.coop"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:underline inline-flex items-center gap-1"
              >
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22.675 0h-21.35C.595 0 0 .592 0 1.326v21.348C0 23.406.595 24 1.325 24h11.495v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.797.143v3.24l-1.918.001c-1.504 0-1.797.715-1.797 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.406 24 24 23.406 24 22.674V1.326C24 .592 23.406 0 22.675 0" />
                </svg>
                Facebook
              </a>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-ink/60">
          © {new Date().getFullYear()} Puerto Princesa Agriculture Cooperative
        </div>
      </footer>
    </div>
  );
}