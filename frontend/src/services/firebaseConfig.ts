import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "vibe-4f8c6.firebaseapp.com",
  projectId: "vibe-4f8c6",
  storageBucket: "vibe-4f8c6.firebasestorage.app",
  messagingSenderId: "569533089062",
  appId: "1:569533089062:web:4a9cf111b04236aaf96de7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
