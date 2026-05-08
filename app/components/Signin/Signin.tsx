"use client";

import React, { useEffect, useState } from "react";
import db, { auth } from "../../../../lib/firebase";
import styles from "./page.module.css";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import SigninManager from "../SigninManager/SigninManager";
import LoginForm from "../LoginForm/LoginForm";
import { User } from "@/app/type";

const Signin = () => {
  const [posts, setPosts] = useState<User[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isManagerIn, setIsManagerIn] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    const fetchData = async () => {
      const userData = collection(db, "user");
      const querySnapshot = await getDocs(userData);

      const usersArray = querySnapshot.docs.map((doc) => {
        const data = doc.data() as User;
        return { ...data, id: doc.id };
      });
      setPosts(usersArray);
    };
    fetchData();
    const savedUser = localStorage.getItem("loggedInUser");
    const isManager = localStorage.getItem("isManagerIn");
    if (savedUser) {
      setIsLoggedIn(true);
      if (isManager === "true") {
        setIsManagerIn(true);
      } else {
        setIsManagerIn(false);
      }
    }
  }, []);

  const handleSignoutClick = async () => {
    await auth.signOut();
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("isManagerIn");
    setIsLoggedIn(false);
    setIsManagerIn(false);
  };

  const handleLoginSuccess = (isManager: boolean) => {
    setIsLoggedIn(true);
    setIsManagerIn(isManager);
  };

  if (!isMounted) {
    return null;
  }

  return (
    <>
      {isLoggedIn ? (
        <form className={styles.allButton}>
          <div>
            <Link href="reservation/" className={styles.link}>
              <button className={styles.reservationButton}> 予約一覧</button>
            </Link>
          </div>
          {isManagerIn ? <SigninManager /> : null}
          <div>
            <button className={styles.signout} onClick={handleSignoutClick}>
              サインアウト
            </button>
          </div>
        </form>
      ) : (
        <LoginForm posts={posts} onLoginSuccess={handleLoginSuccess} />
      )}
    </>
  );
};

export default Signin;
