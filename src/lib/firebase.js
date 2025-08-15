import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export initialized services (used across the app)
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
// Functions default region is us-central1; our callables run in asia-east1
export const functions = getFunctions(app, "asia-east1");
