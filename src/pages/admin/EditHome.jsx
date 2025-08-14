// src/pages/admin/EditHome.jsx
import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/* ---------------- Rich text editor (with tiny toolbar) ---------------- */
function ToolbarButton({ onClick, title, children }) {
  return (
    <button
      type="button"
      className="px-2 py-1 text-sm rounded hover:bg-gray-100 border border-transparent hover:border-gray-200"
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

function RichTextEditor({ value, onChange, label }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const cmd = (command, arg = null) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const setBlock = (tag) => cmd("formatBlock", tag);
  const makeLink = () => {
    const url = window.prompt("Enter URL (https://…):", "https://");
    if (!url) return;
    cmd("createLink", url);
  };
  const unlink = () => cmd("unlink");
  const clear = () => {
    cmd("removeFormat");
    unlink();
  };

  const onPaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  return (
    <div className="mb-4">
      <label className="block font-semibold mb-1">{label}</label>

      <div className="flex flex-wrap gap-1 mb-2">
        <ToolbarButton title="Bold" onClick={() => cmd("bold")}><b>B</b></ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => cmd("italic")}><i>I</i></ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => cmd("underline")}><u>U</u></ToolbarButton>

        <span className="mx-1 w-px bg-gray-300" />

        <ToolbarButton title="Heading 1" onClick={() => setBlock("H1")}>H1</ToolbarButton>
        <ToolbarButton title="Heading 2" onClick={() => setBlock("H2")}>H2</ToolbarButton>
        <ToolbarButton title="Paragraph" onClick={() => setBlock("P")}>P</ToolbarButton>
        <ToolbarButton title="Quote" onClick={() => setBlock("BLOCKQUOTE")}>❝ Quote</ToolbarButton>

        <span className="mx-1 w-px bg-gray-300" />

        <ToolbarButton title="Bulleted list" onClick={() => cmd("insertUnorderedList")}>• List</ToolbarButton>
        <ToolbarButton title="Numbered list" onClick={() => cmd("insertOrderedList")}>1. List</ToolbarButton>

        <span className="mx-1 w-px bg-gray-300" />

        <ToolbarButton title="Insert link" onClick={makeLink}>🔗 Link</ToolbarButton>
        <ToolbarButton title="Remove link" onClick={unlink}>⛔ Unlink</ToolbarButton>

        <span className="mx-1 w-px bg-gray-300" />

        <ToolbarButton title="Clear formatting" onClick={clear}>🧹 Clear</ToolbarButton>
        <ToolbarButton title="Undo" onClick={() => cmd("undo")}>↶ Undo</ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => cmd("redo")}>↷ Redo</ToolbarButton>
      </div>

      <div
        ref={ref}
        className="border rounded bg-white p-2 min-h-[100px] focus:outline-none prose prose-sm max-w-none"
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onPaste={onPaste}
        style={{ minHeight: 100 }}
      />
      <div className="text-xs text-ink/60 mt-1">
        Tip: select text then click buttons. Paste is plain text to keep styling clean.
      </div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */
const toSlug = (path) =>
  (path || "")
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase() || "page";

export default function EditHome() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const successTimer = useRef(null);

  const [announcement, setAnnouncement] = useState(
    `<b>Website Launch!</b> <br>We are excited to announce the launch of our cooperative's official website this August! Explore member services, accounting, news, and more.`
  );
  const [body, setBody] = useState("");
  const [featuredEvent, setFeaturedEvent] = useState("");
  const [resources, setResources] = useState("");
  const [news, setNews] = useState([
    `<b>Great New Start for the Cooperative</b><br>We are off to a strong start this year, with new members joining and exciting plans ahead!`,
    `<b>Financial System Online</b><br>Our website now features a full accounting system for members to view their share capital, loans, and more.`,
    `<b>Agri Trading Center Sales</b><br>Sales every Tuesday and Friday night are going strong. Thank you for supporting our agri trading center!`,
    `<b>Rice Stall Update</b><br>Our rice stall is seeing more customers every day. Thank you for your continued patronage!<br><br><b>CDA Papers</b><br>We are making progress on getting our papers done with the CDA.<br><br><b>Accepting New Members</b><br>Invite your friends and family to join our cooperative!`,
  ]);

  const [sliderImages, setSliderImages] = useState([
    {
      url: "https://images.unsplash.com/photo-1506806732259-39c2d0268443?auto=format&fit=crop&w=1600&q=80",
      link: "/",
      label: "Kadiwa · Fresh Vegetables",
    },
    {
      url: "https://images.unsplash.com/photo-1441123285228-1448e608f3d5?auto=format&fit=crop&w=1600&q=80",
      link: "/",
      label: "Kadiwa · Market Produce",
    },
    {
      url: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1600&q=80",
      link: "/",
      label: "Kadiwa · Fruits",
    },
    {
      url: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&w=1600&q=80",
      link: "/",
      label: "Kadiwa · Bananas",
    },
    {
      url: "https://images.unsplash.com/photo-1478145046317-39f10e56b5e9?auto=format&fit=crop&w=1600&q=80",
      link: "/",
      label: "Kadiwa · Veggie Stall",
    },
    {
      url: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=1600&q=80",
      link: "/",
      label: "Kadiwa · Tomatoes & Peppers",
    },
    {
      url: "https://images.unsplash.com/photo-1506801310323-534be5e7f48f?auto=format&fit=crop&w=1600&q=80",
      link: "/",
      label: "Kadiwa · Fruit Stand",
    },
    {
      url: "https://images.unsplash.com/photo-1464454709131-ffd692591ee5?auto=format&fit=crop&w=1600&q=80",
      link: "/",
      label: "Kadiwa · Mangoes",
    },
  ]);

  // Bulk import helper state
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const snap = await getDoc(doc(db, "siteContent", "home"));
        if (snap.exists()) {
          const d = snap.data();
          if (!alive) return;
          setAnnouncement(d.announcement || "");
          setBody(d.body || "");
          setFeaturedEvent(d.featuredEvent || "");
          setResources(d.resources || "");
          setNews(
            Array.isArray(d.news)
              ? d.news.slice(0, 4).concat(Array(4).fill("")).slice(0, 4)
              : ["", "", "", ""]
          );
          setSliderImages(Array.isArray(d.sliderImages) ? d.sliderImages : []);
        }
      } catch (e) {
        if (alive) setErr("Failed to load: " + (e?.message || String(e)));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  function addSliderImage() {
    setSliderImages((arr) => [
      ...arr,
      { url: "", link: "/", label: "New Slide" },
    ]);
  }

  function updateSliderImage(index, key, value) {
    setSliderImages((arr) =>
      arr.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );
  }

  function bulkAddImages() {
    const lines = (bulkText || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) return;
    const items = [];
    for (const line of lines) {
      const parts = line.split("|").map((s) => s.trim());
      const url = parts[0];
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const label = parts[1] || "Kadiwa Produce";
      const link = parts[2] || "/";
      items.push({ url, label, link });
    }
    if (items.length) {
      setSliderImages((arr) => [...arr, ...items]);
      setBulkText("");
      setShowBulk(false);
    }
  }

  function removeSliderImage(index) {
    setSliderImages((arr) => arr.filter((_, i) => i !== index));
  }

  async function createNewPage(linkPath) {
    try {
      const slug = toSlug(linkPath);
      await setDoc(
        doc(db, "pages", slug),
        {
          path: `/${slug}`,
          title: slug.replace(/[-_/]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
          body: `<p>Welcome to <b>/${slug}</b>. Edit this page in the admin later.</p>`,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSuccess(`Created/updated page: /${slug}`);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(""), 2000);
    } catch (e) {
      setErr("Failed to create page: " + (e?.message || String(e)));
    }
  }

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
  <div className="max-w-3xl mx-auto card p-6">
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
              <div
                key={idx}
                className="border rounded p-3 mb-2 flex flex-col gap-2 bg-gray-50"
              >
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    className="border rounded px-2 py-1 w-full sm:w-1/2"
                    placeholder="Image URL"
                    value={img.url}
                    onChange={(e) =>
                      updateSliderImage(idx, "url", e.target.value)
                    }
                  />
                  <input
                    className="border rounded px-2 py-1 w-full sm:w-1/2"
                    placeholder="Link (e.g. /BecomeMember)"
                    value={img.link}
                    onChange={(e) =>
                      updateSliderImage(idx, "link", e.target.value)
                    }
                  />
                </div>
                <input
                  className="border rounded px-2 py-1 w-full"
                  placeholder="Label/Description"
                  value={img.label}
                  onChange={(e) =>
                    updateSliderImage(idx, "label", e.target.value)
                  }
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => createNewPage(img.link)}
                  >
                    Create Page for Link
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => removeSliderImage(idx)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-primary"
              onClick={addSliderImage}
            >
              + Add Image
            </button>
            <button
              type="button"
              className="btn btn-outline ml-2"
              onClick={() => setShowBulk((v) => !v)}
            >
              {showBulk ? "Hide Bulk Import" : "Bulk Import"}
            </button>

            {showBulk && (
              <div className="mt-3 border rounded p-3 bg-white">
                <div className="text-sm mb-2">
                  Paste one per line. Format: URL | Label (optional) | Link (optional)
                </div>
                <textarea
                  className="border rounded w-full min-h-[120px] p-2 font-mono text-xs"
                  placeholder={`https://...jpg | Fruits & Vegetables | /\nhttps://...jpg | Kadiwa Stall | /BecomeMember`}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button type="button" className="btn btn-primary" onClick={bulkAddImages}>
                    Import
                  </button>
                  <a
                    href="https://unsplash.com/s/photos/fruits-vegetables-philippines"
                    className="text-sm underline"
                    target="_blank"
                    rel="noreferrer"
                    title="Open Unsplash search in a new tab"
                  >
                    Open Unsplash search (royalty‑free)
                  </a>
                </div>
                <div className="text-xs text-ink/60 mt-1">
                  Tip: Prefer images you have rights to use (e.g., Unsplash, your own photos). Avoid copyrighted images.
                </div>
              </div>
            )}
          </div>

          {/* Editors with toolbar */}
          <RichTextEditor
            label="Announcement"
            value={announcement}
            onChange={setAnnouncement}
          />

          <RichTextEditor
            label="Main Body"
            value={body}
            onChange={setBody}
          />

          <RichTextEditor
            label="Featured Event"
            value={featuredEvent}
            onChange={setFeaturedEvent}
          />

          <RichTextEditor
            label="Resources"
            value={resources}
            onChange={setResources}
          />

          <div>
            <label className="block font-semibold mb-1">News Items</label>
            {news.map((item, idx) => (
              <div key={idx}>
                <RichTextEditor
                  label={`News #${idx + 1}`}
                  value={item}
                  onChange={(val) => setNewsItem(idx, val)}
                />
              </div>
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
