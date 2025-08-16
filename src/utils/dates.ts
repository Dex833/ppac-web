// Safe helpers for Firestore Timestamp | Date | string | number
export function tsToDate(v: any): Date | null {
  if (!v) return null;
  if (v?.toDate) return v.toDate(); // Firestore Timestamp
  if (typeof v === "object" && v !== null && "seconds" in v) return new Date((v as any).seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDT(v: any, opts: Intl.DateTimeFormatOptions = {}) {
  const d = tsToDate(v);
  if (!d) return "—";
  const df = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...opts,
  });
  return df.format(d);
}

export function formatD(v: any) {
  return formatDT(v, { dateStyle: "medium", timeStyle: undefined });
}

// Render any value safely for React (never pass raw objects/Timestamps)
export function safeText(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  if (typeof v === "object") {
    // Firestore Timestamp-like
    if ((v as any)?.toDate || (typeof v === "object" && "seconds" in (v as any)))
      return formatDT(v);
    try {
      return JSON.stringify(v);
    } catch {
      return "[object]";
    }
  }
  return String(v);
}
