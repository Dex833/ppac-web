// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import { db, storage } from "../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
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

  // Additional requirements fields
  // Common
  const [paidUpProofURL, setPaidUpProofURL] = useState("");
  const [paidUpProofFile, setPaidUpProofFile] = useState(null);
  // Farmer
  const [farmLocation, setFarmLocation] = useState("");
  const [caoCertificationURL, setCaoCertificationURL] = useState("");
  const [caoCertificationFile, setCaoCertificationFile] = useState(null);
  const [uploadingCao, setUploadingCao] = useState(false);
  // Consumer/Associate
  const [residencyProofURL, setResidencyProofURL] = useState("");
  const [residencyProofFile, setResidencyProofFile] = useState(null);
  // Institution
  const [organizationName, setOrganizationName] = useState("");
  const [authorizedRepName, setAuthorizedRepName] = useState("");
  const [authorizationLetterURL, setAuthorizationLetterURL] = useState("");
  const [authorizationLetterFile, setAuthorizationLetterFile] = useState(null);

  // Member type state (move to top level)
  const [memberType, setMemberType] = useState("");
  const memberTypeLabels = {
    farmer: "Farmer",
    consumer: "Consumer",
    associate: "Associate",
    institution: "Institution"
  };
  // users/{uid}.membershipStatus (admin may set to "full")
  const [userMembershipStatus, setUserMembershipStatus] = useState("");

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
          setMemberType(v.memberType || "");
          // requirements fields
          setPaidUpProofURL(v.paidUpProofURL || "");
          setFarmLocation(v.farmLocation || "");
          setCaoCertificationURL(v.caoCertificationURL || "");
          setResidencyProofURL(v.residencyProofURL || "");
          setOrganizationName(v.organizationName || "");
          setAuthorizedRepName(v.authorizedRepName || "");
          setAuthorizationLetterURL(v.authorizationLetterURL || "");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user?.uid]);

  // subscribe to users/{uid} to reflect admin-set full status
  useEffect(() => {
    if (!user?.uid) return;
    const r = doc(db, "users", user.uid);
    let unsub = () => {};
    try {
      unsub = onSnapshot(
        r,
        (s) => {
          const d = s.exists() ? s.data() : null;
          setUserMembershipStatus(typeof d?.membershipStatus === "string" ? d.membershipStatus : "");
        },
        () => {}
      );
    } catch {}
    return () => unsub();
  }, [user?.uid]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" replace />;
  // Email verification is enforced by the ProtectedRoute wrapper.

  /* ---------------- helpers ---------------- */
  // Compress image files to <= 2MB (JPEG) before upload
  async function compressImageToMax(file, maxBytes = 2 * 1024 * 1024, maxDimension = 2000) {
    if (!file || !file.type?.startsWith("image/")) return file;
    if (file.size <= maxBytes) return file;

    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(file);
    });

    // initial scale based on byte ratio heuristic
    let scale = Math.min(1, Math.sqrt(maxBytes / file.size) * 0.95);
    const origW = img.width;
    const origH = img.height;
    let targetW = Math.min(Math.round(origW * scale), maxDimension);
    let targetH = Math.round((origH / origW) * targetW);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Fallback if width got to 0
    targetW = Math.max(1, targetW);
    targetH = Math.max(1, targetH);
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const qualities = [0.8, 0.7, 0.6, 0.5, 0.4];
    for (let q of qualities) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (!blob) continue;
      if (blob.size <= maxBytes || q === qualities[qualities.length - 1]) {
        const name = (file.name || "upload").replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], name, { type: "image/jpeg" });
      }
    }
    return file; // fallback
  }

  // Validate a file against folder policy (type/size constraints matching Storage rules)
  function validateFileForFolder(file, folder) {
    if (!file) return null;
    const ct = (file.type || "").toLowerCase();
    const isImage = ct.startsWith("image/");
    const isPdf = ct === "application/pdf";
    const maxBytes = 2 * 1024 * 1024; // 2MB

    // profile/id: images only
    if (folder === "profile" || folder === "id") {
      if (!isImage) return "Only image files (JPG/PNG/WebP/HEIC/HEIF) are allowed.";
      // image size will be compressed later; no need to pre-check
      return null;
    }

    // requirement folders: image or PDF
    const allowedReq = ["paidUpProof", "caoCertification", "residencyProof", "authorizationLetter"];
    if (allowedReq.includes(folder)) {
      if (!(isImage || isPdf)) return "Only images or PDF files are allowed.";
      if (isPdf && file.size > maxBytes) return "PDF is larger than 2MB. Please upload a smaller PDF.";
      return null;
    }

    return "Invalid upload destination.";
  }

  function mapStorageError(e) {
    const code = e?.code || "";
    if (code.includes("unauth")) return "Upload not allowed. Please sign in or contact admin.";
    if (code === "storage/canceled") return "Upload was canceled.";
    if (code === "size-too-large") return "File is larger than 2MB. Please upload a smaller file.";
    if (code === "type-not-allowed") return "File type not allowed by policy.";
    return e?.message || "Upload failed. Please try again.";
  }

  // Upload to Storage path that matches typical rules: members/{uid}/{folder}/{filename}
  async function uploadIfNeeded(file, folder) {
    if (!file) return null;
    // validate first (type/size)
    const v = validateFileForFolder(file, folder);
    if (v) {
      const err = new Error(v);
      err.code = v.includes("2MB") ? "size-too-large" : "type-not-allowed";
      throw err;
    }

    // compress images; PDFs pass-through
    const maybeCompressed = file.type?.startsWith("image/") ? await compressImageToMax(file) : file;
    if ((maybeCompressed?.size || 0) > 2 * 1024 * 1024) {
      const e = new Error("File is larger than 2MB after compression.");
      e.code = "size-too-large";
      throw e;
    }

    const safeName = `${Date.now()}-${(maybeCompressed.name || file.name || "upload").replace(/\s+/g, "_")}`;
    const r = ref(storage, `members/${user.uid}/${folder}/${safeName}`);
    try {
      await uploadBytes(r, maybeCompressed, { contentType: maybeCompressed.type || file.type || "application/octet-stream" });
      return await getDownloadURL(r);
    } catch (e) {
      throw e;
    }
  }

  // Immediate upload for CAO certification (farmer)
  async function uploadCaoNow() {
    if (!caoCertificationFile) return;
    setUploadingCao(true);
    try {
  const url = await uploadIfNeeded(caoCertificationFile, "caoCertification");
      if (url) {
        setCaoCertificationURL(url);
        setCaoCertificationFile(null);
      }
    } catch (e) {
      setErr(mapStorageError(e));
    } finally {
      setUploadingCao(false);
    }
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
      // common requirement: proof of paid-up share capital
      paidUpProofURL?.trim() || (paidUpProofFile ? "1" : ""),
    ];
    // memberType-specific requirements
    if (memberType === "farmer") {
      required.push(
        farmLocation?.trim(),
        caoCertificationURL?.trim() || (caoCertificationFile ? "1" : "")
      );
    }
    if (memberType === "consumer" || memberType === "associate") {
      required.push(residencyProofURL?.trim() || (residencyProofFile ? "1" : ""));
    }
    if (memberType === "institution") {
      required.push(
        organizationName?.trim(),
        authorizedRepName?.trim(),
        authorizationLetterURL?.trim() || (authorizationLetterFile ? "1" : "")
      );
    }
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
    // requirements
    paidUpProofURL,
    paidUpProofFile,
    farmLocation,
    caoCertificationURL,
    caoCertificationFile,
    residencyProofURL,
    residencyProofFile,
    organizationName,
    authorizedRepName,
    authorizationLetterURL,
    authorizationLetterFile,
    memberType,
  ]);

    // Derive membership status: pending (missing fields) | validating (all filled)
    const derivedStatus = useMemo(
      () => (completion === 100 ? "validating" : "pending"),
      [completion]
    );
    // Display/persist status prefers admin-set "full"
    const displayStatus = useMemo(
      () => (userMembershipStatus === "full" ? "full" : derivedStatus),
      [userMembershipStatus, derivedStatus]
    );

  /* ---------------- save ---------------- */
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      // Pre-validate files for clear messages
      const validations = [
        profilePhotoFile ? validateFileForFolder(profilePhotoFile, "profile") : null,
        idPhotoFile ? validateFileForFolder(idPhotoFile, "id") : null,
        paidUpProofFile ? validateFileForFolder(paidUpProofFile, "paidUpProof") : null,
        caoCertificationFile ? validateFileForFolder(caoCertificationFile, "caoCertification") : null,
        residencyProofFile ? validateFileForFolder(residencyProofFile, "residencyProof") : null,
        authorizationLetterFile ? validateFileForFolder(authorizationLetterFile, "authorizationLetter") : null,
      ].filter(Boolean);
      if (validations.length) {
        // show the first validation error
        setErr(validations[0]);
        setSaving(false);
        return;
      }

      const refDoc = doc(db, "members", user.uid);

      const uploadedProfileURL =
        (await uploadIfNeeded(profilePhotoFile, "profile")) || profilePhotoURL;
      const uploadedIdURL = (await uploadIfNeeded(idPhotoFile, "id")) || idPhotoURL;
      const uploadedPaidUpURL =
        (await uploadIfNeeded(paidUpProofFile, "paidUpProof")) || paidUpProofURL;
      const uploadedCaoURL =
        (await uploadIfNeeded(caoCertificationFile, "caoCertification")) || caoCertificationURL;
      const uploadedResidencyURL =
        (await uploadIfNeeded(residencyProofFile, "residencyProof")) || residencyProofURL;
      const uploadedAuthLetterURL =
        (await uploadIfNeeded(authorizationLetterFile, "authorizationLetter")) || authorizationLetterURL;

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
    // requirements saved
    paidUpProofURL: uploadedPaidUpURL || "",
    farmLocation: farmLocation.trim(),
    caoCertificationURL: uploadedCaoURL || "",
    residencyProofURL: uploadedResidencyURL || "",
    organizationName: organizationName.trim(),
    authorizedRepName: authorizedRepName.trim(),
    authorizationLetterURL: uploadedAuthLetterURL || "",
    memberType,
  membershipStatus: displayStatus,
        updatedAt: serverTimestamp(),
      };

      const exists = (await getDoc(refDoc)).exists();
      if (!exists) {
        await setDoc(refDoc, { ...payload, createdAt: serverTimestamp() });
      } else {
        await updateDoc(refDoc, payload);
      }

      // Reflect status in users/{uid} for admin listing
      try {
        await updateDoc(doc(db, "users", user.uid), {
      membershipStatus: displayStatus,
          memberType,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        // ignore best-effort
      }

    alert("Profile saved successfully!");
      nav("/dashboard", { replace: true });
    } catch (e) {
      console.error(e);
      const msg = mapStorageError(e);
      setErr(msg);
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
              {/* Member Type (read-only) and Membership Class (side by side) */}
              {/* Member Type (read-only) / Class / Status */}
              {memberType && (
                <div className="mb-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold">Member Type</label>
                    <div className="bg-gray-100 border border-gray-200 rounded px-3 py-2 text-base">
                      {memberTypeLabels[memberType] || memberType}
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold">membership status:</label>
                    <div
                      className={`rounded px-3 py-2 text-base border ${
                        displayStatus === "pending"
                          ? "bg-amber-50 border-amber-200 text-amber-800"
                          : displayStatus === "validating"
                          ? "bg-blue-50 border-blue-200 text-blue-800"
                          : "bg-emerald-50 border-emerald-200 text-emerald-800"
                      }`}
                    >
                      {displayStatus}
                    </div>
                  </div>
                </div>
              )}

              {/* Requirements helper (read-only guidance) */}
              {memberType && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="font-semibold mb-2">Requirements for {memberTypeLabels[memberType] || memberType}</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-ink/80">
                    {memberType === "farmer" && (
                      <>
                        <li>Farm in Puerto Princesa</li>
                        <li>City Agriculture Office certification</li>
                        <li>Legal age</li>
                        <li>Residency in Puerto Princesa</li>
                        <li>Valid ID</li>
                        <li>₱2,000 paid-up share capital</li>
                        <li>Additional ₱2,000 within 3 months</li>
                      </>
                    )}
                    {memberType === "consumer" && (
                      <>
                        <li>Residency in Puerto Princesa</li>
                        <li>Legal age</li>
                        <li>Valid ID</li>
                        <li>₱2,000 paid-up share capital</li>
                        <li>Additional ₱2,000 within 3 months</li>
                      </>
                    )}
                    {memberType === "associate" && (
                      <>
                        <li>Non-resident</li>
                        <li>Legal age</li>
                        <li>Valid ID</li>
                        <li>₱2,000 paid-up share capital</li>
                        <li>Additional ₱2,000 within 3 months</li>
                      </>
                    )}
                    {memberType === "institution" && (
                      <>
                        <li>Puerto Princesa-based</li>
                        <li>Legal age (authorized representative)</li>
                        <li>Valid ID (authorized representative)</li>
                        <li>₱2,000 paid-up share capital</li>
                        <li>Additional ₱2,000 within 3 months</li>
                      </>
                    )}
                  </ul>
                  <p className="text-xs text-ink/60 mt-2">Status becomes <b>validating</b> when all profile fields are filled. Admin sets <b>full</b> after verification.</p>
                </div>
              )}
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

              <div className="grid grid-cols-1 gap-3">
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
              </div>

              {/* Requirements fields */}
              <div className="mt-2 rounded-lg border border-gray-200 p-4 bg-white">
                <h3 className="font-semibold mb-3">Requirements</h3>
                {/* Common: Proof of paid-up share capital */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-sm">Proof of ₱2,000 paid-up share capital (receipt/photo)</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setPaidUpProofFile(e.target.files?.[0] || null)}
                    />
                    {paidUpProofURL && (
                      <p className="text-xs text-ink/60 mt-1 truncate">Uploaded</p>
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

                {/* Farmer-specific */}
                {memberType === "farmer" && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-sm">Farm Location (Barangay, City)</span>
                      <input
                        className="input"
                        value={farmLocation}
                        onChange={(e) => setFarmLocation(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm">City Agriculture Office certification (that you are a farmer and have a farm in the city)</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setCaoCertificationFile(e.target.files?.[0] || null)}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="btn"
                          disabled={!caoCertificationFile || uploadingCao}
                          onClick={uploadCaoNow}
                        >
                          {uploadingCao ? "Uploading…" : "Upload"}
                        </button>
                        {caoCertificationURL && (
                          <span className="text-xs text-emerald-700">Uploaded</span>
                        )}
                      </div>
                    </label>
                  </div>
                )}

                {/* Consumer/Associate */}
                {(memberType === "consumer" || memberType === "associate") && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-sm">Residency proof (e.g., barangay cert, billing)</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setResidencyProofFile(e.target.files?.[0] || null)}
                      />
                      {residencyProofURL && (
                        <p className="text-xs text-ink/60 mt-1 truncate">Uploaded</p>
                      )}
                    </label>
                  </div>
                )}

                {/* Institution */}
                {memberType === "institution" && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-sm">Organization Name</span>
                      <input
                        className="input"
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm">Authorized Representative Name</span>
                      <input
                        className="input"
                        value={authorizedRepName}
                        onChange={(e) => setAuthorizedRepName(e.target.value)}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-sm">Authorization Letter (upload)</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setAuthorizationLetterFile(e.target.files?.[0] || null)}
                      />
                      {authorizationLetterURL && (
                        <p className="text-xs text-ink/60 mt-1 truncate">Uploaded</p>
                      )}
                    </label>
                  </div>
                )}
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
