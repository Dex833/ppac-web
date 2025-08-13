// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import { db, storage } from "../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Navigate, useNavigate } from "react-router-dom";
import PageBackground from "../components/PageBackground";

const profileBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

export default function Profile() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // form state
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [birthplace, setBirthplace] = useState("");
  const [sex, setSex] = useState(""); // "female" | "male"
  const [civilStatus, setCivilStatus] = useState(""); // "single" | "married" | "widow" | "separated"
  const [pwd, setPwd] = useState(false);
  const [senior, setSenior] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  const [profilePhotoURL, setProfilePhotoURL] = useState("");
  const [idPhotoURL, setIdPhotoURL] = useState("");

  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [idPhotoFile, setIdPhotoFile] = useState(null);

  /* ---------------- load existing ---------------- */
  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const refDoc = doc(db, "members", user.uid);
        const snap = await getDoc(refDoc);
        if (snap.exists()) {
          const v = snap.data();
          setFirstName(v.firstName || "");
          setMiddleName(v.middleName || "");
          setLastName(v.lastName || "");
          setBirthdate(v.birthdate || "");
          setBirthplace(v.birthplace || "");
          setSex(v.sex || "");
          setCivilStatus(v.civilStatus || "");
          setPwd(!!v.pwd);
          setSenior(!!v.senior);
          setAddress(v.address || "");
          setPhone(v.phone || "");
          setProfilePhotoURL(v.profilePhotoURL || "");
          setIdPhotoURL(v.idPhotoURL || "");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user?.uid]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" replace />;
  if (!user.emailVerified) return <Navigate to="/verify" replace />;

  /* ---------------- helpers ---------------- */
  // Upload to Storage path that matches typical rules: members/{uid}/{folder}/{filename}
  async function uploadIfNeeded(file, folder) {
    if (!file) return null;
    const safeName = `${Date.now()}-${(file.name || "upload").replace(/\s+/g, "_")}`;
    const r = ref(storage, `members/${user.uid}/${folder}/${safeName}`);
    await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
    return await getDownloadURL(r);
  }

  // Completion meter
  const completion = useMemo(() => {
    const required = [
      firstName?.trim(),
      lastName?.trim(),
      birthdate?.trim(),
      birthplace?.trim(),
      sex?.trim(),
      civilStatus?.trim(),
      address?.trim(),
      profilePhotoURL?.trim() || (profilePhotoFile ? "1" : ""), // treat new file as filled
      idPhotoURL?.trim() || (idPhotoFile ? "1" : ""),
    ];
    const done = required.filter(Boolean).length;
    return Math.round((done / required.length) * 100);
  }, [
    firstName,
    lastName,
    birthdate,
    birthplace,
    sex,
    civilStatus,
    address,
    profilePhotoURL,
    idPhotoURL,
    profilePhotoFile,
    idPhotoFile,
  ]);

  /* ---------------- save ---------------- */
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const refDoc = doc(db, "members", user.uid);

      const uploadedProfileURL =
        (await uploadIfNeeded(profilePhotoFile, "profile")) || profilePhotoURL;
      const uploadedIdURL = (await uploadIfNeeded(idPhotoFile, "id")) || idPhotoURL;

      const payload = {
        uid: user.uid,
        email: user.email || "",
        firstName: firstName.trim(),
        middleName: middleName.trim(),
        lastName: lastName.trim(),
        birthdate, // YYYY-MM-DD
        birthplace: birthplace.trim(),
        sex,
        civilStatus,
        pwd: !!pwd,
        senior: !!senior,
        address: address.trim(),
        phone: phone.trim(),
        profilePhotoURL: uploadedProfileURL || "",
        idPhotoURL: uploadedIdURL || "",
        updatedAt: serverTimestamp(),
      };

      const exists = (await getDoc(refDoc)).exists();
      if (!exists) {
        await setDoc(refDoc, { ...payload, createdAt: serverTimestamp() });
      } else {
        await updateDoc(refDoc, payload);
      }

      alert("Profile saved successfully!");
      nav("/dashboard", { replace: true });
    } catch (e) {
      console.error(e);
      setErr(e?.code || e?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- UI ---------------- */
  return (
    <PageBackground
      image={profileBg}
      boxed
      boxedWidth="max-w-7xl"
      overlayClass="bg-white/85 backdrop-blur"
      className="page-gutter"
    >
      <div className="mx-auto max-w-3xl">
        <div className="card p-6 flex flex-col gap-6">
          <div className="mb-4">
            <h2 className="text-2xl font-bold">Complete Your Member Profile</h2>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-ink/60 mb-1">
                <span>Profile completion</span>
                <span>{completion}%</span>
              </div>
              <div className="h-2 rounded bg-gray-200 overflow-hidden">
                <div
                  className="h-2 bg-brand-600 transition-all"
                  style={{ width: `${completion}%` }}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3" />
              <div className="h-10 bg-gray-200 rounded" />
              <div className="h-10 bg-gray-200 rounded" />
              <div className="h-10 bg-gray-200 rounded" />
              <div className="h-40 bg-gray-200 rounded" />
            </div>
          ) : (
            <form onSubmit={save} className="grid gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-sm">First Name</span>
                  <input
                    className="input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm">Middle Name</span>
                  <input
                    className="input"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm">Last Name</span>
                  <input
                    className="input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-sm">Birthdate</span>
                  <input
                    type="date"
                    className="input"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                    required
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm">Birthplace</span>
                  <input
                    className="input"
                    value={birthplace}
                    onChange={(e) => setBirthplace(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-sm">Sex</span>
                  <select
                    className="input"
                    value={sex}
                    onChange={(e) => setSex(e.target.value)}
                    required
                  >
                    <option value="">— Select —</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm">Civil Status</span>
                  <select
                    className="input"
                    value={civilStatus}
                    onChange={(e) => setCivilStatus(e.target.value)}
                    required
                  >
                    <option value="">— Select —</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="widow">Widow</option>
                    <option value="separated">Separated</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm">Phone Number</span>
                  <input
                    type="tel"
                    className="input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm">Current Address</span>
                <input
                  className="input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pwd}
                    onChange={(e) => setPwd(e.target.checked)}
                  />
                  <span className="text-sm">PWD</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={senior}
                    onChange={(e) => setSenior(e.target.checked)}
                  />
                  <span className="text-sm">Senior</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm">Profile Picture</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setProfilePhotoFile(e.target.files?.[0] || null)}
                  />
                  {profilePhotoURL && (
                    <img
                      src={profilePhotoURL}
                      alt="Profile"
                      className="mt-2 h-24 w-24 object-cover rounded"
                    />
                  )}
                </label>
                <label className="block">
                  <span className="text-sm">Valid ID (photo)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setIdPhotoFile(e.target.files?.[0] || null)}
                  />
                  {idPhotoURL && (
                    <img
                      src={idPhotoURL}
                      alt="Valid ID"
                      className="mt-2 h-24 w-24 object-cover rounded"
                    />
                  )}
                </label>
              </div>

              {err && <p className="text-sm text-rose-600">{err}</p>}

              <div className="pt-2">
                <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-60">
                  {saving ? "Saving…" : "Save Profile"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </PageBackground>
  );
}
