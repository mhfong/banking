import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDK4xT9IqS2F-3WrNVtCbCKesPq3cf9JDY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "login-system-7d812.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "login-system-7d812",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "login-system-7d812.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "866178898192",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:866178898192:web:e498d830e305c9da726d95",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-8VZZNBLDR4"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export default app
