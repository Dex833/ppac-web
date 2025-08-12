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
  getDocs
} from "firebase/firestore";
// Helper: fetch all share capital accounts
async function fetchAllShareCapitalAccounts() {
  const q = query(
    collection(db, "accounts"),
    where("main", "==", "Share Capital")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Helper: sum share capital for accountIds
async function fetchShareCapitalBalance(accountIds) {
  if (!accountIds.length) return 0;
  // Get all journal entries with lines for these accountIds
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

    // Ensure the doc exists with safe default fields
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

    // Live listener
    const unsub = onSnapshot(
      ref,
      (s) => {
        const data = s.exists() ? s.data() : null;
        setProfile(data);
        setMemberIdField(
          typeof data?.memberId === "string" ? data.memberId : (data?.memberId ?? "")
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

  // Share Capital state
  const [shareCapital, setShareCapital] = useState(null);
  const [loadingShareCap, setLoadingShareCap] = useState(true);

  // Fetch share capital when member is loaded
  useEffect(() => {
    async function loadShareCapital() {
      setLoadingShareCap(true);
      setShareCapital(null);
      if (!member) {
        setLoadingShareCap(false);
        return;
      }
      // Construct "Dexter M. Acantilado" style name
      const firstName = member.firstName?.trim() || "";
      const middleName = member.middleName?.trim() || "";
      const lastName = member.lastName?.trim() || "";
      const middleInitial = middleName ? middleName[0].toUpperCase() + "." : "";
      const constructedName = [firstName, middleInitial, lastName].filter(Boolean).join(" ").replace(/ +/g, " ");
      try {
        const allAccounts = await fetchAllShareCapitalAccounts();
        // Match by constructed name (case-insensitive, trimmed)
        const accounts = allAccounts.filter(a => (a.individual || "").trim().toLowerCase() === constructedName.trim().toLowerCase());
        const accountIds = accounts.map((a) => a.id);
        const balance = await fetchShareCapitalBalance(accountIds);
        setShareCapital({ balance, accounts });
      } catch (e) {
        setShareCapital(null);
      } finally {
        setLoadingShareCap(false);
      }
    }
    loadShareCapital();
  }, [member]);
  if (loadingUserDoc || loadingMemberDoc) {
    return (
      <div className="min-h-screen bg-surface text-ink">
        <main className="max-w-3xl mx-auto p-6">
          <div className="card p-8">
            <p className="text-ink/70">Loading…</p>
          </div>
        </main>
      </div>
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
    ? [member.firstName, member.middleName, member.lastName]
        .filter(Boolean)
        .join(" ")
    : "";

  /* ---------------- layout ---------------- */
  return (
    <div className="min-h-screen bg-surface text-ink">
      <main className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col md:flex-row gap-8">
          {/* ---------- Center: Share Capital / Loan / Balik Tangkilik ---------- */}
          <div className="flex-1">
            <div className="card p-8 mb-6">
              <h2 className="text-2xl font-bold tracking-tight mb-4">
                Member Dashboard
              </h2>

              {!isVerified && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Your account is not verified yet. Please verify your email or
                  wait for admin verification.{" "}
                  <Link
                    to="/verify"
                    className="underline decoration-amber-600 hover:text-amber-700"
                  >
                    Go to verification
                  </Link>
                </div>
              )}

              {!memberComplete && (
                <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Help us know you better. Please complete your member profile.{" "}
                  {isVerified && (
                    <Link
                      to="/profile"
                      className="underline decoration-blue-600 hover:text-blue-700"
                    >
                      Go to Profile
                    </Link>
                  )}
                </div>
              )}

              {/* Reserved content area: only show if verified */}
              {isVerified && (
                <div className="grid grid-cols-1 gap-6">
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-6">
                    <h3 className="font-semibold text-lg mb-2">Share Capital</h3>
                    <div className="text-ink/70">
                      {loadingShareCap ? (
                        <span>Loading…</span>
                      ) : shareCapital && shareCapital.accounts.length ? (
                        <>
                          <div className="mb-2">
                            <span className="font-semibold">Balance:</span>{" "}
                            <span className="font-mono">₱{Math.abs(shareCapital.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className="text-xs text-ink/50">Account(s): {shareCapital.accounts.map(a => a.individual || a.id).join(", ")}</div>
                        </>
                      ) : (
                        <span>No Share Capital account found for your name.</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-6">
                    <h3 className="font-semibold text-lg mb-2">Loan</h3>
                    <div className="text-ink/70">
                      {/* TODO: inject Loan summary & actions */}
                      [Loan summary and actions here]
                    </div>
                  </div>

                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-6">
                    <h3 className="font-semibold text-lg mb-2">Balik Tangkilik</h3>
                    <div className="text-ink/70">
                      {/* TODO: inject Balik Tangkilik summary & actions */}
                      [Balik Tangkilik summary and actions here]
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ---------- Right: Profile summary (single column) ---------- */}
          <aside className="w-full md:w-80">
            <div className="card p-6">
              <h3 className="font-semibold mb-4">Profile</h3>

              <dl className="grid grid-cols-1 gap-y-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">
                    Email
                  </dt>
                  <dd className="text-sm">{emailToShow}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">
                    Role
                  </dt>
                  <dd className="text-sm">{profile?.role || "member"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">
                    Phone
                  </dt>
                  <dd className="text-sm">{profile?.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">
                    Member ID
                  </dt>
                  <dd className="text-sm">{memberIdField || "—"}</dd>
                </div>
              </dl>

              {member && (
                <div className="mt-6">
                  <h4 className="font-semibold mb-2">Member Profile</h4>
                  <dl className="grid grid-cols-1 gap-y-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink/50">
                        Name
                      </dt>
                      <dd className="text-sm">{fullName || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink/50">
                        Birth
                      </dt>
                      <dd className="text-sm">
                        {member.birthdate || "—"}
                        {member.birthplace ? ` • ${member.birthplace}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink/50">
                        Sex / Status
                      </dt>
                      <dd className="text-sm">
                        {member.sex || "—"}
                        {member.civilStatus ? ` • ${member.civilStatus}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink/50">
                        Current Address
                      </dt>
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
      </main>
    </div>
  );
}
