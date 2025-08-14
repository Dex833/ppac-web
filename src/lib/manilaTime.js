// Asia/Manila date helpers

export const TZ = "Asia/Manila";

/** Returns YYYY-MM-DD in Asia/Manila */
export function ymdManila(date = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .split("-");
  return `${y}-${m}-${d}`; // e.g., 2025-08-14
}

/** Returns "YYYY-MM-DD HH:mm:ss Asia/Manila" */
export function asOfIsoManila(date = new Date()) {
  const dt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date); // "2025-08-14, 13:05:22"
  return `${dt.replace(",", "")} ${TZ}`;
}