export function formatPeso(n) {
  const num = Number(n || 0);
  if (!isFinite(num)) return "₱0.00";
  return `₱${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function toISO(v) {
  try {
    if (!v) return "";
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    return new Date(v).toISOString();
  } catch {
    return "";
  }
}

export function yyyymmdd_hhmm() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
