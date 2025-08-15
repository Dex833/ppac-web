import { formatMemberAccountName } from "./subaccounts";

/**
 * buildMemberDisplayName: normalizes common shapes of user/profile docs to a display name
 * Supports: { firstName, middleName, lastName } or { displayName }
 */
export function buildMemberDisplayName(userOrProfile = {}) {
  return formatMemberAccountName(userOrProfile);
}
