import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import PageBackground from "../components/PageBackground";
import { useAuth } from "../AuthContext";
import WhatYouHaveModal from "../components/WhatYouHaveModal";
import useUserShareCapitalAndLoan from "../hooks/useUserShareCapitalAndLoan";
const homeBg = "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";


export default function Home() {
  const { user } = useAuth();
  const [content, setContent] = useState({
    announcement: "",
    body: "",
    featuredEvent: "",
    resources: "",
    news: ["", "", "", ""],
  });
  const [loading, setLoading] = useState(true);
  const [showWhatYouHave, setShowWhatYouHave] = useState(false);
  const { shareCapital, loan, loading: loadingFinancial } = useUserShareCapitalAndLoan();

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "siteContent", "home"));
        if (snap.exists()) {
          const d = snap.data();
          setContent({
            announcement: d.announcement || "",
            body: d.body || "",
            featuredEvent: d.featuredEvent || "",
            resources: d.resources || "",
            news: Array.isArray(d.news) ? d.news.slice(0, 4) : ["", "", "", ""],
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PageBackground image={homeBg} boxed overlayClass="bg-white/85 backdrop-blur">
      {/* DO NOT wrap with another max-w container here; PageBackground already boxes it */}
      {loading ? (
        <div className="p-6">Loading…</div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left column: Announcement */}
            <div className="w-full md:w-72 flex flex-col gap-4">
              <div className="card p-4 bg-yellow-50 border border-yellow-200">
                <h2 className="text-xl font-bold mb-2">Announcement</h2>
                <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: content.announcement || "—" }} />
              </div>
              <div className="card p-4">
                <h3 className="font-semibold mb-2">Quick Links</h3>
                <ul className="list-disc list-inside text-ink/80 text-sm">
                  <li><Link to="/dashboard" className="underline">Dashboard</Link></li>
                  <li><Link to="/profile" className="underline">Profile</Link></li>
                  <li><Link to="/contact" className="underline">Contact Us</Link></li>
                </ul>
              </div>
              <div className="card p-4">
                <h3 className="font-semibold mb-2">Photo Gallery</h3>
                <div className="text-ink/70">[Photo carousel/spotlight here]</div>
              </div>
              <div className="card p-4">
                <h3 className="font-semibold mb-2">Contact & Support</h3>
                <div className="text-ink/70">[Email, phone, socials here]</div>
              </div>
              <div className="card p-4">
                <h3 className="font-semibold mb-2">Local Weather</h3>
                <div className="text-ink/70">[Weather widget placeholder]</div>
              </div>
            </div>

            {/* Main body */}
            <div className="flex-1 card p-6 flex flex-col gap-6">
              {/* Photo slider placeholder */}
              <div className="w-full h-48 bg-gray-200 rounded-xl flex items-center justify-center mb-4">
                <span className="text-ink/60 text-lg">[Photo Slider Placeholder]</span>
              </div>
              <h2 className="text-2xl font-bold mb-3">Welcome 👋</h2>
              <div className="prose max-w-none mb-4" dangerouslySetInnerHTML={{ __html: content.body || "" }} />
              <div className="mb-4 flex items-center gap-3">
                {!user ? (
                  <Link to="/become-member" className="btn btn-primary">Become a Member</Link>
                ) : (
                  <>
                    <span className="text-ink/80 text-lg font-semibold">Welcome, {user.displayName || user.email || "Member"}!</span>
                    <button className="btn btn-outline" onClick={() => setShowWhatYouHave(true)}>
                      What You Have
                    </button>
                  </>
                )}
                {!user && <button className="btn btn-outline">Learn More</button>}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                <h3 className="font-semibold mb-1">Featured Event</h3>
                <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: content.featuredEvent || "—" }} />
              </div>

              <div className="bg-green-50 border border-green-200 rounded p-3">
                <h3 className="font-semibold mb-1">Resources</h3>
                <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: content.resources || "—" }} />
              </div>
            </div>
          </div>

          {/* News */}
          <div className="card p-6 bg-gray-50 border border-gray-200">
            <h2 className="text-xl font-bold mb-2">News & Updates</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {content.news.map((html, i) => (
                <div key={i} className="bg-white border rounded p-3">
                  <div className="prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: html || "—" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* What You Have Modal for logged-in users */}
      {user && (
        <WhatYouHaveModal
          open={showWhatYouHave}
          onClose={() => setShowWhatYouHave(false)}
          user={user}
          shareCapital={loadingFinancial ? "Loading…" : (typeof shareCapital === "number" ? `₱${Math.abs(shareCapital).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "₱0.00")}
          loan={loadingFinancial ? "Loading…" : (typeof loan === "number" ? `₱${Math.abs(loan).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "₱0.00")}
          balikTangkilik={"[Coming soon]"}
        />
      )}
    </PageBackground>
  );
}