// src/pages/admin/MembershipReview.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function MembershipReview() {
  const { uid } = useParams();
  const nav = useNavigate();
  const [userDoc, setUserDoc] = useState(null);
  const [memberDoc, setMemberDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const u = await getDoc(doc(db, "users", uid));
        const m = await getDoc(doc(db, "members", uid));
        setUserDoc(u.exists() ? { id: u.id, ...u.data() } : null);
        setMemberDoc(m.exists() ? { id: m.id, ...m.data() } : null);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  async function approve() {
    if (!uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", uid), { membershipStatus: "full", updatedAt: serverTimestamp() });
      await updateDoc(doc(db, "members", uid), { membershipStatus: "full", updatedAt: serverTimestamp() });
      alert("Member validated successfully.");
      nav("/admin/membership-status", { replace: true });
    } catch (e) {
      console.error(e);
      alert(`Failed to approve: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  async function reject() {
    if (!uid) return;
    if (!note.trim()) {
      alert("Please provide a note describing what to re-upload.");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", uid), {
        membershipStatus: "pending",
        reviewNote: note.trim(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "members", uid), {
        membershipStatus: "pending",
        updatedAt: serverTimestamp(),
      });
      alert("Sent back to member with note.");
      nav("/admin/membership-status", { replace: true });
    } catch (e) {
      console.error(e);
      alert(`Failed to reject: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  function Row({ label, value }) {
    return (
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="text-ink/60">{label}</div>
        <div className="col-span-2">{value || "—"}</div>
      </div>
    );
  }

  function FileLink({ url, text }) {
    if (!url) return <span className="text-ink/50">—</span>;
    return (
      <a className="text-blue-700 underline" href={url} target="_blank" rel="noreferrer">
        {text}
      </a>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/admin/membership-status" className="btn btn-outline">Back</Link>
        <h2 className="text-xl font-semibold">Membership Review</h2>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : !userDoc ? (
        <div className="text-rose-700">User not found.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-4">
            <h3 className="font-semibold mb-2">User</h3>
            <Row label="Email" value={userDoc.email} />
            <Row label="Name" value={userDoc.displayName} />
            <Row label="Member Type" value={userDoc.memberType} />
            <Row label="Status" value={userDoc.membershipStatus} />
            {userDoc.reviewNote && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 text-sm">
                Last Note: {userDoc.reviewNote}
              </div>
            )}
          </div>

          <div className="card p-4">
            <h3 className="font-semibold mb-2">Profile</h3>
            <Row label="First Name" value={memberDoc?.firstName} />
            <Row label="Middle Name" value={memberDoc?.middleName} />
            <Row label="Last Name" value={memberDoc?.lastName} />
            <Row label="Birthdate" value={memberDoc?.birthdate} />
            <Row label="Birthplace" value={memberDoc?.birthplace} />
            <Row label="Sex" value={memberDoc?.sex} />
            <Row label="Civil Status" value={memberDoc?.civilStatus} />
            <Row label="Phone" value={memberDoc?.phone} />
            <Row label="Address" value={memberDoc?.address} />
          </div>

          <div className="card p-4 lg:col-span-2">
            <h3 className="font-semibold mb-2">Requirements</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row label="Valid ID" value={<FileLink url={memberDoc?.idPhotoURL} text="View" />} />
              <Row label="Paid-up Proof" value={<FileLink url={memberDoc?.paidUpProofURL} text="View" />} />
              <Row label="CAO Certification" value={<FileLink url={memberDoc?.caoCertificationURL} text="View" />} />
              <Row label="Residency Proof" value={<FileLink url={memberDoc?.residencyProofURL} text="View" />} />
              <Row label="Authorization Letter" value={<FileLink url={memberDoc?.authorizationLetterURL} text="View" />} />
              <Row label="Farm Location" value={memberDoc?.farmLocation} />
              <Row label="Organization Name" value={memberDoc?.organizationName} />
              <Row label="Authorized Rep" value={memberDoc?.authorizedRepName} />
            </div>
          </div>

          <div className="card p-4 lg:col-span-2">
            <h3 className="font-semibold mb-2">Decision</h3>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Add a note for the member (required when rejecting)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
            <div className="mt-3 flex gap-2">
              <button className="btn btn-primary" onClick={approve} disabled={saving}>Approve (Validate)</button>
              <button className="btn btn-outline" onClick={reject} disabled={saving}>Reject & Notify</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
