// src/pages/Home.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

export default function Home() {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ref = doc(db, "siteContent", "home");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setContent(snap.exists() ? snap.data() : {});
        setLoading(false);
      },
      (e) => {
        setErr(e?.message || String(e));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  if (loading) {
    return <div className="max-w-3xl mx-auto p-6">Loading…</div>;
  }
  if (err) {
    return <div className="max-w-3xl mx-auto p-6 text-rose-600">Failed to load: {err}</div>;
  }

  const {
    announcement = "",
    body = "",
    featuredEvent = "",
    resources = "",
    news = [],
  } = content || {};

  const newsItems = Array.isArray(news) ? news.slice(0, 4) : [];

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      {/* Announcement (rich text) */}
      <div className="card p-4 bg-yellow-50 border border-yellow-200 mb-2">
        <h2 className="text-xl font-bold mb-2">Announcement</h2>
        <div className="prose prose-sm max-w-none text-ink/80"
             dangerouslySetInnerHTML={{ __html: announcement || "<em>No announcements.</em>" }} />
      </div>

      {/* Main body + side blocks */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Main Body */}
        <div className="flex-1 card p-6">
          <h2 className="text-2xl font-bold mb-3">Welcome 👋</h2>

          <div className="prose max-w-none text-ink/80 mb-4"
               dangerouslySetInnerHTML={{ __html: body || "<p>[Add your mission/vision in Edit Home]</p>" }} />

          <div className="mb-4">
            <Link to="/become-member" className="btn btn-primary">Become a Member</Link>
            <button className="btn btn-outline ml-2">Learn More</button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
            <h3 className="font-semibold mb-1">Featured Event</h3>
            <div className="prose prose-sm max-w-none text-ink/80"
                 dangerouslySetInnerHTML={{ __html: featuredEvent || "<em>[Add featured event]</em>" }} />
          </div>

          <div className="bg-green-50 border border-green-200 rounded p-3">
            <h3 className="font-semibold mb-1">Resources</h3>
            <div className="prose prose-sm max-w-none text-ink/80"
                 dangerouslySetInnerHTML={{ __html: resources || "<em>[Add resource links]</em>" }} />
          </div>
        </div>

        {/* Right column */}
        <div className="w-full md:w-72 flex flex-col gap-4">
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
      </div>

      {/* News & Updates (rich text tiles) */}
      <div className="card p-6 bg-gray-50 border border-gray-200 mt-4">
        <h2 className="text-xl font-bold mb-2">News & Updates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {newsItems.length ? newsItems.map((html, i) => (
            <div key={i} className="bg-white border rounded p-3">
              <div className="prose prose-sm max-w-none text-ink/80"
                   dangerouslySetInnerHTML={{ __html: html || "<em>—</em>" }} />
            </div>
          )) : (
            <>
              <div className="bg-white border rounded p-3"><em>No news yet.</em></div>
              <div className="bg-white border rounded p-3"><em>—</em></div>
              <div className="bg-white border rounded p-3"><em>—</em></div>
              <div className="bg-white border rounded p-3"><em>—</em></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
