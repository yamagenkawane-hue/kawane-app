"use client";

import React, { useEffect, useState } from "react";
import db, { auth } from "../../../lib/firebase";
import styles from "./page.module.css";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import SigninManager from "../SigninManager/SigninManager";
import LoginForm from "../LoginForm/LoginForm";
import { User } from "@/app/type";

const Signin = () => {
  const [posts, setPosts] = useState<User[]>([]);

  // 初期値で localStorage を読む
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return !!localStorage.getItem("loggedInUser");
  });

  const [isManagerIn, setIsManagerIn] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return localStorage.getItem("isManagerIn") === "true";
  });

  // Firestore取得のみ
  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = collection(db, "user");

        const querySnapshot = await getDocs(userData);

        const usersArray = querySnapshot.docs.map((doc) => {
          const data = doc.data() as User;

          return {
            ...data,
            id: doc.id,
          };
        });

        console.log(usersArray);
        setPosts(usersArray);
      } catch (error) {
        console.error(
          "Firestore取得エラー:",
          error
        );
      }
    };

    fetchData();
  }, []);

  // サインアウト
  const handleSignoutClick = async () => {
    try {
      await auth.signOut();

      localStorage.removeItem("loggedInUser");
      localStorage.removeItem("isManagerIn");

      setIsLoggedIn(false);
      setIsManagerIn(false);
    } catch (error) {
      console.error(
        "サインアウトエラー:",
        error
      );
    }
  };

  // ログイン成功時
  const handleLoginSuccess = (
    isManager: boolean
  ) => {
    setIsLoggedIn(true);
    setIsManagerIn(isManager);
  };

  return (
    <>
      {isLoggedIn ? (
        <div className={styles.allButton}>
          <div>
            <Link
              href="/reservation"
              className={
                styles.reservationButton
              }
            >
              予約一覧
            </Link>
          </div>

          {isManagerIn && (
            <SigninManager />
          )}

          <div>
            <button
              type="button"
              className={styles.signout}
              onClick={
                handleSignoutClick
              }
            >
              サインアウト
            </button>
          </div>
        </div>
      ) : (
        <LoginForm
          posts={posts}
          onLoginSuccess={
            handleLoginSuccess
          }
        />
      )}
    </>
  );
};

export default Signin;