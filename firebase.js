// ============================================================
// INVESTPRO GH — Firebase Config
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, query, where, orderBy, serverTimestamp, onSnapshot, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAIGRbPClcuZBbVV4-xcbKi8zzA4y1VxHc",
  authDomain: "investprogh.firebaseapp.com",
  projectId: "investprogh",
  storageBucket: "investprogh.firebasestorage.app",
  messagingSenderId: "483511383796",
  appId: "1:483511383796:web:8bb44ee92926683dd450a1"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

export { db, collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, query, where, orderBy, serverTimestamp, onSnapshot, increment };
