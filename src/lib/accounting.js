// src/lib/accounting.js
import { collection, doc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * @typedef {"asset"|"liability"|"equity"|"income"|"expense"} AccountType
 *
 * @typedef {Object} Account
 * @property {string} code - unique like "1000" or "1010"
 * @property {string} name - e.g. "Cash on Hand"
 * @property {AccountType} type
 * @property {boolean} [isActive]
 * @property {import("firebase/firestore").Timestamp} createdAt
 * @property {import("firebase/firestore").Timestamp} updatedAt
 */

/**
 * @typedef {Object} JournalLine
 * @property {string} accountId
 * @property {string} accountCode
 * @property {string} accountName
 * @property {number} dr
 * @property {number} cr
 */

/**
 * @typedef {Object} Journal
 * @property {import("firebase/firestore").Timestamp} date
 * @property {string|number} ref
 * @property {string} description
 * @property {JournalLine[]} lines
 * @property {number} totalDr
 * @property {number} totalCr
 * @property {string} [createdBy]
 * @property {import("firebase/firestore").Timestamp} createdAt
 * @property {import("firebase/firestore").Timestamp} updatedAt
 */

// Collection references
export const accountsCol = collection(db, "accounts");
export const journalsCol = collection(db, "journals");

/**
 * Reference to a sequence counter document.
 * @param {string} name
 */
export function sequenceDoc(name) {
  return doc(db, "sequences", name);
}
