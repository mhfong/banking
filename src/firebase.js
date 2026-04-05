import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDK4xT9IqS2F-3WrNVtCbCKesPq3cf9JDY",
  authDomain: "login-system-7d812.firebaseapp.com",
  projectId: "login-system-7d812",
  storageBucket: "login-system-7d812.firebasestorage.app",
  messagingSenderId: "866178898192",
  appId: "1:866178898192:web:e498d830e305c9da726d95",
  measurementId: "G-8VZZNBLDR4"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export default app
