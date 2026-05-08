import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import "firebase/compat/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBeTRgAJEIsc0jXwM2L5lZ1XDns5oHuJCo",
  authDomain: "kawane-app.firebaseapp.com",
  projectId: "kawane-app",
  storageBucket: "kawane-app.firebasestorage.app",
  messagingSenderId: "23253229052",
  appId: "1:23253229052:web:48786aa9f6175fd1c5e679"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export default db;
export { auth };