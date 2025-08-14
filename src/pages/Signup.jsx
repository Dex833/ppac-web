// src/pages/Signup.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { generateMemberId } from "../lib/memberId";
import PageBackground from "../components/PageBackground";

const authBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";


function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [memberType, setMemberType] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const memberTypeOptions = [
    {
      value: "farmer",
      label: "Farmer",
      descList: [
        "May farm sa Puerto Princesa",
        "May City Agriculture Office certification",
        "Pwedeng maging Board of Directors o Chairperson",
      ],
      reqList: [
        "Farm in Puerto Princesa",
        "City Agriculture Office certification",
        "Legal age",
        "Residency in Puerto Princesa",
        "Valid ID",
        "₱300 membership fee",
        "₱2,000 paid-up share capital",
        "Additional ₱2,000 within 3 months",
      ],
    },
    {
      value: "consumer",
      label: "Consumer",
      descList: [
        "Residente ng Puerto Princesa",
        "Pwedeng mag-avail ng lahat ng benepisyo",
        "Hindi pwedeng maging Board of Directors o Chairperson",
      ],
      reqList: [
        "Residency in Puerto Princesa",
        "Legal age",
        "Valid ID",
        "₱300 membership fee",
        "₱2,000 paid-up share capital",
        "Additional ₱2,000 within 3 months",
      ],
    },
    {
      value: "associate",
      label: "Associate",
      descList: [
        "Non-resident (outside Puerto Princesa)",
        "Walang voting rights",
        "May discounts at benepisyo",
      ],
      reqList: [
        "Non-resident",
        "Legal age",
        "Valid ID",
        "₱300 membership fee",
        "₱2,000 paid-up share capital",
        "Additional ₱2,000 within 3 months",
      ],
    },
    {
      value: "institution",
      label: "Institution",
      descList: [
        "Establishment o institution sa Puerto Princesa",
        "May benepisyo ayon sa coop programs",
      ],
      reqList: [
        "Puerto Princesa-based",
        "Legal age (authorized representative)",
        "Valid ID (authorized representative)",
        "₱300 membership fee",
        "₱2,000 paid-up share capital",
        "Additional ₱2,000 within 3 months",
      ],
    },
  ];

  // Simple password strength estimator
  function getPasswordStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score; // 0..5
  }

  function handlePasswordChange(e) {
    const val = e.target.value;
    setPassword(val);
    setPasswordStrength(getPasswordStrength(val));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    if (!firstName.trim() || !middleName.trim() || !lastName.trim()) {
      setErr("First name, middle name, and last name are required.");
      setBusy(false);
      return;
    }
    if (!memberType) {
      setErr("Please select your member type.");
      setBusy(false);
      return;
    }
    if (!agreed) {
      setErr("You must agree to the Terms of Service and Privacy Policy.");
      setBusy(false);
      return;
    }
    if (passwordStrength < 3) {
      setErr(
        "Password is too weak. Use at least 8 characters, with upper/lowercase, numbers, and symbols."
      );
      setBusy(false);
      return;
    }

    try {
      // 1) Create Auth user
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

      // 2) Set display name as "First M. Last"
      const middleInitial = middleName.trim()[0]?.toUpperCase() || "";
      const displayName = `${firstName.trim()}${middleInitial ? " " + middleInitial + "." : ""} ${lastName
        .trim()
        .replace(/ +/g, " ")}`.replace(/ +/g, " ");

      await updateProfile(cred.user, { displayName });

      // 3) Generate next memberId (string to preserve zeros)
      const memberId = await generateMemberId(db);

      // 4) Create users/{uid}
      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          uid: cred.user.uid,
          email: cred.user.email || email.trim(),
          displayName,
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim(),
          memberType,
          membershipStatus: "pending", // derived later based on profile completeness and admin verification
          role: "member", // legacy
          roles: ["member"],
          verifiedByAdmin: false,
          suspended: false,
          memberId, // string
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 4b) members/{uid}
      await setDoc(
        doc(db, "members", cred.user.uid),
        {
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim(),
          email: cred.user.email || email.trim(),
          memberType,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 5) Public lookup (non-blocking)
      try {
        await setDoc(doc(db, "memberLookup", memberId), {
          uid: cred.user.uid,
          email: cred.user.email || email.trim(),
        });
      } catch (e) {
        console.warn("[memberLookup] create failed (email login still works):", e);
      }

      // 6) Go to dashboard
      nav("/dashboard", { replace: true });
    } catch (e) {
      const msg =
        e?.code === "auth/email-already-in-use"
          ? "That email is already in use."
          : e?.code === "auth/weak-password"
          ? "Password should be at least 6 characters."
          : e?.code || "Failed to create account";
      setErr(msg);
      setBusy(false);
    }
  }


  const strengthLabel =
    passwordStrength >= 4 ? "Strong" : passwordStrength === 3 ? "Medium" : "Weak";


  // Selected member type details for display
  const selectedType = memberTypeOptions.find(opt => opt.value === memberType);

  // Render signup form
  return (
    <PageBackground image={authBg} boxed boxedWidth="max-w-md" overlayClass="bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-md w-full p-6 card">
        <h2 className="text-2xl font-bold mb-4">Sign Up</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold">Email</label>
            <input
              type="email"
              className="input w-full"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-semibold">Password</label>
            <input
              type="password"
              className="input w-full"
              value={password}
              onChange={handlePasswordChange}
              required
            />
            <div className="text-xs mt-1 text-gray-500">Strength: {strengthLabel}</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              className="input"
              placeholder="First Name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Middle Name"
              value={middleName}
              onChange={e => setMiddleName(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Last Name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold">Membership Class</label>
            <select
              className="input w-full"
              value={memberType}
              onChange={e => setMemberType(e.target.value)}
              required
            >
              <option value="">— Select class —</option>
              {memberTypeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {selectedType && (
              <div className="mt-2 text-sm text-gray-700">
                <div className="font-semibold mb-1">About:</div>
                <ul className="list-disc pl-5 space-y-1">
                  {selectedType.descList.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
                <div className="font-semibold mt-3 mb-1">
                  Requirements (to follow — signup first and complete the requirements later):
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  {selectedType.reqList.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              required
            />
            <span className="text-xs">I agree to the <a href="/RequirementsMembership" className="underline text-brand-700" target="_blank" rel="noopener noreferrer">Membership Requirements</a> and <a href="/privacy" className="underline text-brand-700" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>
          </label>
          {err && <div className="text-sm text-rose-600">{err}</div>}
          <button
            type="submit"
            className="btn btn-primary w-full mt-2 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Creating account…" : "Sign Up"}
          </button>
        </form>
      </div>
    </PageBackground>
  );
}
export default Signup;
