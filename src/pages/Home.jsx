// src/pages/Home.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import PageBackground from "../components/PageBackground";
import { useAuth } from "../AuthContext";
import WhatYouHaveModal from "../components/WhatYouHaveModal";
import useUserShareCapitalAndLoan from "../hooks/useUserShareCapitalAndLoan";
import Html from "../components/Html"; // ⟵ NEW

const homeBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

export default function Home() {
  const { user } = useAuth();
  const [content, setContent] = useState({
    announcement: "",
    body: "",
    featuredEvent: "",
    resources: "",
    news: ["", "", "", ""],
    sliderImages: [],
  });
  const [loading, setLoading] = useState(true);
  const [showWhatYouHave, setShowWhatYouHave] = useState(false);
  const {
    shareCapital,
    loan,
    loading: loadingFinancial,
  } = useUserShareCapitalAndLoan();

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
            sliderImages: Array.isArray(d.sliderImages) ? d.sliderImages : [],
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PageBackground
      image={homeBg}
      boxed
      overlayClass="bg-white/85 backdrop-blur"
      className="page-gutter"
    >
      <div className="flex flex-col items-center gap-6 py-8">
        {/* Image Banner / Photo Slider - always on top, full width */}
        <div className="w-full h-48 sm:h-64 bg-gray-200 rounded-xl flex items-center justify-center mb-2 overflow-hidden">
          {content.sliderImages && content.sliderImages.length > 0 ? (
            <div className="w-full h-full flex items-center justify-center gap-2 overflow-x-auto">
              {content.sliderImages.map((img, idx) =>
                img.url ? (
                  img.link ? (
                    <Link
                      key={idx}
                      to={img.link}
                      className="block h-full"
                      style={{ minWidth: 180 }}
                      title={img.label}
                    >
                      <img
                        src={img.url}
                        alt={img.label || `Slide ${idx + 1}`}
                        className="h-full object-cover rounded-xl shadow"
                        loading="lazy"
                      />
                      {img.label && (
                        <div className="text-center text-xs mt-1 text-ink/70">
                          {img.label}
                        </div>
                      )}
                    </Link>
                  ) : (
                    <div
                      key={idx}
                      className="block h-full"
                      style={{ minWidth: 180 }}
                    >
                      <img
                        src={img.url}
                        alt={img.label || `Slide ${idx + 1}`}
                        className="h-full object-cover rounded-xl shadow"
                        loading="lazy"
                      />
                      {img.label && (
                        <div className="text-center text-xs mt-1 text-ink/70">
                          {img.label}
                        </div>
                      )}
                    </div>
                  )
                ) : null
              )}
            </div>
          ) : (
            <span className="text-ink/60 text-lg">[Photo Slider Placeholder]</span>
          )}
        </div>

        {/* Welcome and Name + Buttons */}
        <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-3">
          <h2 className="text-2xl font-bold mb-1">Welcome 👋</h2>
          {user ? (
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <span className="text-ink/80 text-lg font-semibold">
                {user.displayName || user.email || "Member"}
              </span>
              <button
                className="btn btn-outline"
                onClick={() => setShowWhatYouHave(true)}
              >
                What You Have
              </button>
              <Link to="/reports" className="btn btn-primary">Reports</Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-2 mt-2">
              <Link to="/BecomeMember" className="btn btn-primary w-full sm:w-auto text-center">Become a Member</Link>
              <Link to="/RequirementsMembership" className="btn btn-outline w-full sm:w-auto text-center">See Requirements</Link>
            </div>
          )}
        </div>
      </div>

      {/* Other Home Contents (original layout, below banner/welcome) */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left column: Announcement */}
        <div className="w-full md:w-72 flex flex-col gap-4">
          <div className="card p-4 bg-yellow-50 border border-yellow-200">
            <h2 className="text-xl font-bold mb-2">Announcement</h2>
            <Html
              html={content.announcement || "—"}
              className="prose max-w-none"
            />
          </div>

          <div className="card p-4">
            <h3 className="font-semibold mb-2">Quick Links</h3>
            <ul className="list-disc list-inside text-ink/80 text-sm">
              <li>
                <Link to="/dashboard" className="underline">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/profile" className="underline">
                  Profile
                </Link>
              </li>
              <li>
                <Link to="/contact" className="underline">
                  Contact Us
                </Link>
              </li>
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
          <Html html={content.body || ""} className="prose max-w-none mb-4" />

          <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
            <h3 className="font-semibold mb-1">Featured Event</h3>
            <Html
              html={content.featuredEvent || "—"}
              className="prose max-w-none"
            />
          </div>

          <div className="bg-green-50 border border-green-200 rounded p-3">
            <h3 className="font-semibold mb-1">Resources</h3>
            <Html
              html={content.resources || "—"}
              className="prose max-w-none"
            />
          </div>
        </div>
      </div>

      {/* News */}
      <div className="card p-6 bg-gray-50 border border-gray-200 mt-8">
        <h2 className="text-xl font-bold mb-2">News & Updates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {content.news.map((html, i) => (
            <div key={i} className="bg-white border rounded p-3">
              <Html html={html || "—"} className="prose max-w-none text-sm" />
            </div>
          ))}
        </div>
      </div>

      {/* What You Have Modal for logged-in users */}
      {user && (
        <WhatYouHaveModal
          open={showWhatYouHave}
          onClose={() => setShowWhatYouHave(false)}
          user={user}
          shareCapital={
            loadingFinancial
              ? "Loading…"
              : typeof shareCapital === "number"
              ? `₱${Math.abs(shareCapital).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "₱0.00"
          }
          loan={
            loadingFinancial
              ? "Loading…"
              : typeof loan === "number"
              ? `₱${Math.abs(loan).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "₱0.00"
          }
          balikTangkilik={"[Coming soon]"}
        />
      )}
    </PageBackground>
  );
}
