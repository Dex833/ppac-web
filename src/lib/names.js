// src/lib/names.js
// Tiny helper to format member names like: FirstName M. LastName

export function buildMemberDisplayName(p = {}) {
  const firstName = (p.firstName || "").trim();
  const middleName = (p.middleName || "").trim();
  const lastName = (p.lastName || "").trim();
  const displayName = (p.displayName || "").trim();

  if (firstName && lastName) {
    const mi = (middleName[0] || "").toUpperCase();
    const name = mi ? `${firstName} ${mi}. ${lastName}` : `${firstName} ${lastName}`;
    return name.replace(/\s+/g, " ").trim();
  }
  return displayName;
}
