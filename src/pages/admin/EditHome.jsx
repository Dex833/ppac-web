// src/pages/admin/EditHome.jsx
import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// Simple rich text editor (uses contenteditable)
function RichTextEditor({ value, onChange, label }) {
  const ref = React.useRef(null);

  useEffect(() => {
    // keep the DOM in sync with the controlled value
    if (ref.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  return (
    <div className="mb-4">
      <label className="block font-semibold mb-1">{label}</label>
      <div
        ref={ref}
        className="border rounded bg-white p-2 min-h-[80px] focus:outline-none"
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        style={{ minHeight: 80 }}
      />
    </div>
  );
}

export default function EditHome() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  // Editable fields
  const [announcement, setAnnouncement] = useState("");
  const [body, setBody] = useState("");
  const [featuredEvent, setFeaturedEvent] = useState("");
  const [resources, setResources] = useState("");
  const [news, setNews] = useState(["", "", "", ""]);

  // Editable image slider array
  const [sliderImages, setSliderImages] = useState([]); // [{url, link, label}]

  function addSliderImage() {
    setSliderImages((arr) => [...arr, { url: "", link: "", label: "" }]);
  }
  function updateSliderImage(idx, field, value) {
    setSliderImages((arr) => arr.map((img, i) => i === idx ? { ...img, [field]: value } : img));
  }
  function removeSliderImage(idx) {
    setSliderImages((arr) => arr.filter((_, i) => i !== idx));
  }

  function createNewPage(link) {
    // Placeholder: you can implement page creation logic here
    alert(`Create new page for: ${link}`);
  }

  const successTimer = React.useRef(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "siteContent", "home"));
        if (snap.exists()) {
          const d = snap.data();
          setAnnouncement(d.announcement || "");
          setBody(d.body || "");
          setFeaturedEvent(d.featuredEvent || "");
          setResources(d.resources || "");
          setNews(Array.isArray(d.news) ? d.news.slice(0, 4).concat(Array(4).fill("")).slice(0, 4) : ["", "", "", ""]);
          setSliderImages(Array.isArray(d.sliderImages) ? d.sliderImages : []);
        }
      } catch (e) {
        setErr("Failed to load: " + (e?.message || String(e)));
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  async function save() {
    setSaving(true);
    setErr("");
    setSuccess("");
    try {
      await setDoc(
        doc(db, "siteContent", "home"),
        {
          announcement,
          body,
          featuredEvent,
          resources,
          news,
          sliderImages,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSuccess("Saved!");
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(""), 2000);
    } catch (e) {
      setErr("Failed to save: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }

  function setNewsItem(idx, val) {
    setNews((n) => n.map((item, i) => (i === idx ? val : item)));
  }

  return (
    <div className="max-w-2xl mx-auto card p-6">
      <h2 className="text-2xl font-bold mb-4">Edit Home Page Content</h2>
      {loading ? (
        <div>Loading…</div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          {/* Image Slider Editor */}
          <div>
            <label className="block font-semibold mb-1">Image Slider</label>
            {sliderImages.map((img, idx) => (
              <div key={idx} className="border rounded p-3 mb-2 flex flex-col gap-2 bg-gray-50">
                <div className="flex gap-2">
                  <input
                    className="border rounded px-2 py-1 w-1/2"
                    placeholder="Image URL"
                    value={img.url}
                    onChange={e => updateSliderImage(idx, "url", e.target.value)}
                  />
                  <input
                    className="border rounded px-2 py-1 w-1/2"
                    placeholder="Link (e.g. /becomemember)"
                    value={img.link}
                    onChange={e => updateSliderImage(idx, "link", e.target.value)}
                  />
                </div>
                <input
                  className="border rounded px-2 py-1 w-full"
                  placeholder="Label/Description"
                  value={img.label}
                  onChange={e => updateSliderImage(idx, "label", e.target.value)}
                />
                <div className="flex gap-2">
                  <button type="button" className="btn btn-outline" onClick={() => createNewPage(img.link)}>
                    Create Page for Link
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => removeSliderImage(idx)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-primary" onClick={addSliderImage}>
              + Add Image
            </button>
          </div>

          <RichTextEditor label="Announcement" value={announcement} onChange={setAnnouncement} />
          <RichTextEditor label="Main Body" value={body} onChange={setBody} />
          <RichTextEditor label="Featured Event" value={featuredEvent} onChange={setFeaturedEvent} />
          <RichTextEditor label="Resources" value={resources} onChange={setResources} />

          <div>
            <label className="block font-semibold mb-1">News Items</label>
            {news.map((item, idx) => (
              <RichTextEditor
                key={idx}
                label={`News #${idx + 1}`}
                value={item}
                onChange={(val) => setNewsItem(idx, val)}
              />
            ))}
          </div>

          {err && <div className="text-rose-600">{err}</div>}
          {success && <div className="text-green-700">{success}</div>}

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      )}
    </div>
  );
}
