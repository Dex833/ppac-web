// src/pages/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { db } from "../lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import PageBackground from "../components/PageBackground";

const dashboardBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

/* ---------------- Helpers ---------------- */

// Generic: fetch all accounts with a specific "main" name
async function fetchAccountsByMain(mainName) {
  const q = query(collection(db, "accounts"), where("main", "==", mainName));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Generic: sum (debit - credit) for any set of accountIds across all journal entries
async function sumBalanceForAccountIds(accountIds) {
  if (!accountIds.length) return 0;
  const q = query(collection(db, "journalEntries"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  let total = 0;
  snap.forEach((doc) => {
    const entry = doc.data();
    if (Array.isArray(entry.lines)) {
      entry.lines.forEach((line) => {
        if (accountIds.includes(line.accountId)) {
          total += (parseFloat(line.debit) || 0) - (parseFloat(line.credit) || 0);
        }
      });
    }
  });
  return total;
}

// For convenience (kept for share capital)
async function fetchAllShareCapitalAccounts() {
  return fetchAccountsByMain("Share Capital");
}
async function fetchShareCapitalBalance(accountIds) {
  return sumBalanceForAccountIds(accountIds);
}

/* ---------------------------------------------------- */

export default function Dashboard() {
  const { user } = useAuth();

  // users/{uid}
  const [profile, setProfile] = useState(null);
  const [loadingUserDoc, setLoadingUserDoc] = useState(true);
  const [memberIdField, setMemberIdField] = useState("");

  // members/{uid}
  const [member, setMember] = useState(null);
  const [loadingMemberDoc, setLoadingMemberDoc] = useState(true);

  /* ---------------- users/{uid} live (create-if-missing) ---------------- */
  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      setMemberIdField("");
      setLoadingUserDoc(false);
      return;
    }

    setLoadingUserDoc(true);
    const ref = doc(db, "users", user.uid);

    (async () => {
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(
            ref,
            {
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || "",
              phone: "",
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (e) {
        console.warn("[dashboard] init users doc:", e);
      }
    })();

    const unsub = onSnapshot(
      ref,
      (s) => {
        const data = s.exists() ? s.data() : null;
        setProfile(data);
        setMemberIdField(
          typeof data?.memberId === "string" ? data.memberId : data?.memberId ?? ""
        );
        setLoadingUserDoc(false);
      },
      (e) => {
        console.warn("[dashboard] users onSnapshot:", e);
        setLoadingUserDoc(false);
      }
    );

    return () => unsub();
  }, [user?.uid, user?.email, user?.displayName]);

  /* ---------------- members/{uid} one-shot load ---------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!user?.uid) {
        if (alive) {
          setMember(null);
          setLoadingMemberDoc(false);
        }
        return;
      }

      setLoadingMemberDoc(true);
      try {
        const ref = doc(db, "members", user.uid);
        const snap = await getDoc(ref);
        if (alive) setMember(snap.exists() ? snap.data() : null);
      } catch (e) {
        console.warn("[dashboard] members doc read failed:", e);
        if (alive) setMember(null);
      } finally {
        if (alive) setLoadingMemberDoc(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.uid]);

  /* ---------------- Share Capital ---------------- */
  const [shareCapital, setShareCapital] = useState(null);
  const [loadingShareCap, setLoadingShareCap] = useState(true);

  /* ---------------- Loan (NEW) ---------------- */
  const [loanInfo, setLoanInfo] = useState(null);
  const [loadingLoan, setLoadingLoan] = useState(true);

  // Load both Share Capital and Loan once member is available
  useEffect(() => {
    async function loadBalances() {
      // Reset
      setLoadingShareCap(true);
      setLoadingLoan(true);
      setShareCapital(null);
      setLoanInfo(null);

      if (!member) {
        setLoadingShareCap(false);
        setLoadingLoan(false);
        return;
      }

      // Construct standardized display name: "First M. Last"
      const firstName = member.firstName?.trim() || "";
      const middleName = member.middleName?.trim() || "";
      const lastName = member.lastName?.trim() || "";
      const middleInitial = middleName ? middleName[0].toUpperCase() + "." : "";
      const constructedName = [firstName, middleInitial, lastName]
        .filter(Boolean)
        .join(" ")
        .replace(/ +/g, " ")
        .trim();

      try {
        // --- Share Capital ---
        const allSC = await fetchAllShareCapitalAccounts();
        const mySC = allSC.filter(
          (a) => (a.individual || "").trim().toLowerCase() === constructedName.toLowerCase()
        );
        const scIds = mySC.map((a) => a.id);
        const scBal = await fetchShareCapitalBalance(scIds);
        setShareCapital({ balance: scBal, accounts: mySC });
      } catch (e) {
        setShareCapital(null);
      } finally {
        setLoadingShareCap(false);
      }

      try {
        // --- Loans (Loan Receivable) ---
        const allLoans = await fetchAccountsByMain("Loan Receivable");
        const myLoans = allLoans.filter(
          (a) => (a.individual || "").trim().toLowerCase() === constructedName.toLowerCase()
        );
        const loanIds = myLoans.map((a) => a.id);
        const loanBal = await sumBalanceForAccountIds(loanIds);
        setLoanInfo({ balance: loanBal, accounts: myLoans });
      } catch (e) {
        setLoanInfo(null);
      } finally {
        setLoadingLoan(false);
      }
    }

    loadBalances();
  }, [member]);

  if (loadingUserDoc || loadingMemberDoc) {
    return (
      <PageBackground image={dashboardBg} boxed boxedWidth="max-w-5xl" overlayClass="bg-white/85 backdrop-blur">
        <div className="card p-8">
          <p className="text-ink/70">Loading…</p>
        </div>
      </PageBackground>
    );
  }

  const emailToShow = profile?.email || user?.email || "";
  const adminVerified = profile?.verifiedByAdmin === true;
  const emailVerified = user?.emailVerified === true;
  const isVerified = emailVerified || adminVerified;

  const memberComplete =
    member &&
    [
      "firstName",
      "lastName",
      "birthdate",
      "birthplace",
      "sex",
      "civilStatus",
      "address",
      "profilePhotoURL",
      "idPhotoURL",
    ].every((k) =>
      typeof member[k] === "string" ? member[k].trim().length > 0 : !!member[k]
    );

  const fullName = member
    ? [member.firstName, member.middleName, member.lastName].filter(Boolean).join(" ")
    : "";

  // Membership status display: prefer users/{uid}.membershipStatus (admin can set "full")
  const derivedStatus = memberComplete ? "validating" : "pending";
  const membershipStatus =
    typeof profile?.membershipStatus === "string" && profile.membershipStatus
      ? profile.membershipStatus
      : derivedStatus;

  /* ---------------- layout ---------------- */
  return (
    <PageBackground
      image={dashboardBg}
      boxed
      boxedWidth="max-w-7xl"
      overlayClass="bg-white/85 backdrop-blur"
      className="page-gutter"
    >
      <div className="flex flex-col md:flex-row gap-8">
        {/* ---------- Center: Share Capital / Loan / Balik Tangkilik ---------- */}
        <div className="flex-1">
          <div className="card p-8 mb-6">
            <h2 className="text-2xl font-bold tracking-tight mb-4">Member Dashboard</h2>

            {!isVerified && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Your account is not verified yet. Please verify your email or wait for admin verification.{" "}
                <Link to="/verify" className="underline decoration-amber-600 hover:text-amber-700">
                  Go to verification
                </Link>
              </div>
            )}

            {!memberComplete && (
              <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                Help us know you better. Please complete your member profile.{" "}
                {isVerified && (
                  <Link to="/profile" className="underline decoration-blue-600 hover:text-blue-700">
                    Go to Profile
                  </Link>
                )}
              </div>
            )}

            {/* Reserved content area: only show if verified */}
            {isVerified && (
              <div className="grid grid-cols-1 gap-6">
                {/* Share Capital */}
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-6">
                  <h3 className="font-semibold text-lg mb-2">Share Capital</h3>
                  <div className="text-ink/70">
                    {loadingShareCap ? (
                      <span>Loading…</span>
                    ) : shareCapital && shareCapital.accounts.length ? (
                      <>
                        <div className="mb-2">
                          <span className="font-semibold">Balance:</span>{" "}
                          <span className="font-mono">
                            ₱
                            {Math.abs(shareCapital.balance).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-ink/50">
                          Account(s): {shareCapital.accounts.map((a) => a.individual || a.id).join(", ")}
                        </div>
                      </>
                    ) : (
                      <span>No Share Capital account found for your name.</span>
                    )}
                  </div>
                </div>

                {/* Loan */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-6">
                  <h3 className="font-semibold text-lg mb-2">Loan</h3>
                  <div className="text-ink/70">
                    {loadingLoan ? (
                      <span>Loading…</span>
                    ) : loanInfo && loanInfo.accounts.length ? (
                      <>
                        <div className="mb-2">
                          <span className="font-semibold">Outstanding:</span>{" "}
                          <span className="font-mono">
                            ₱
                            {Math.abs(loanInfo.balance).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-ink/50">
                          Account(s): {loanInfo.accounts.map((a) => a.individual || a.id).join(", ")}
                        </div>
                      </>
                    ) : (
                      <span>No Loan Receivable account found for your name.</span>
                    )}
                  </div>
                </div>

                {/* Balik Tangkilik (placeholder) */}
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-6">
                  <h3 className="font-semibold text-lg mb-2">Balik Tangkilik</h3>
                  <div className="text-ink/70">[Coming soon]</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---------- Right: Profile summary ---------- */}
        <aside className="w-full md:w-80">
          <div className="card p-6">
            <h3 className="font-semibold mb-4">Profile</h3>

            <dl className="grid grid-cols-1 gap-y-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink/50">Email</dt>
                <dd className="text-sm">{emailToShow}</dd>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <dt className="text-xs uppercase tracking-wide text-ink/50">Role</dt>
                  <dd className="text-sm">{profile?.role || "member"}</dd>
                </div>
                {profile?.memberType && (
                  <div className="flex-1">
                    <dt className="text-xs uppercase tracking-wide text-ink/50">Membership Class</dt>
                    <dd className="text-sm">{profile.memberType}</dd>
                  </div>
                )}
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink/50">membership status:</dt>
                <dd className="text-sm">
                  <span
                    className={`inline-block rounded px-2 py-0.5 border text-xs ${
                      membershipStatus === "pending"
                        ? "bg-amber-50 border-amber-200 text-amber-800"
                        : membershipStatus === "validating"
                        ? "bg-blue-50 border-blue-200 text-blue-800"
                        : "bg-emerald-50 border-emerald-200 text-emerald-800"
                    }`}
                  >
                    {membershipStatus}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink/50">Phone</dt>
                <dd className="text-sm">{profile?.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink/50">Member ID</dt>
                <dd className="text-sm">{memberIdField || "—"}</dd>
              </div>
            </dl>

            {member && (
              <div className="mt-6">
                <h4 className="font-semibold mb-2">Member Profile</h4>
                <dl className="grid grid-cols-1 gap-y-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink/50">Name</dt>
                    <dd className="text-sm">{fullName || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink/50">Birth</dt>
                    <dd className="text-sm">
                      {member.birthdate || "—"}
                      {member.birthplace ? ` • ${member.birthplace}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink/50">Sex / Status</dt>
                    <dd className="text-sm">
                      {member.sex || "—"}
                      {member.civilStatus ? ` • ${member.civilStatus}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink/50">Current Address</dt>
                    <dd className="text-sm">{member.address || "—"}</dd>
                  </div>
                </dl>
              </div>
            )}

            <div className="mt-8 flex items-center gap-3">
              {isVerified && (
                <Link to="/profile" className="btn btn-primary">
                  {memberComplete ? "Edit Profile" : "Complete Member Profile"}
                </Link>
              )}
            </div>
          </div>
        </aside>
      </div>
    </PageBackground>
  );
}
