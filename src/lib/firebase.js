import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, setLogLevel, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// --- Firebase web config (from Firebase Console) ---
const firebaseConfig = {
  apiKey: "AIzaSyD8rRf_X_zyaav6OZmnauPjnRWJ6hr3TW8",
  authDomain: "ppac-web.firebaseapp.com",
  projectId: "ppac-web",
  storageBucket: "ppac-web.firebasestorage.app", // If uploads fail, switch to "ppac-web.appspot.com"
  messagingSenderId: "702419735324",
  appId: "1:702419735324:web:688939e74ad7b8aa9820d9",
};

// Initialize Firebase (single app instance)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Export initialized services (used across the app)
export const auth = getAuth(app);
// Prefer initializeFirestore to allow long polling in flaky networks/ad-blockers
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  // Prefer Fetch streams when available in the SDK/runtime
  useFetchStreams: true,
  // Optional offline cache and multi-tab coordination
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Reduce noisy networking logs in dev while still surfacing warnings/errors
try {
  if (import.meta?.env?.DEV) setLogLevel("warn");
} catch (_) {}
export const storage = getStorage(app);
// Functions default region is us-central1; lock to asia-southeast1 per backend deploy
export const functions = getFunctions(app, "asia-southeast1");
