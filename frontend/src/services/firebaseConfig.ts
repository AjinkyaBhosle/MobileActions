import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Read Firebase config from EXPO_PUBLIC_* env (see .env.example).
// Firebase web apiKey is a public client identifier (not a secret), but we still
// load it from env so it's not committed alongside the source.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

if (!firebaseConfig.apiKey) {
  console.warn(
    '[Firebase] EXPO_PUBLIC_FIREBASE_API_KEY is empty. ' +
    'Add it to frontend/.env (see .env.example) and rebuild.'
  );
}

// Avoid "Firebase App named '[DEFAULT]' already exists" on Fast Refresh
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
