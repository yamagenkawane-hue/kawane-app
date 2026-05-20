"use client";

import React, { useEffect, useState } from "react";

import db, { auth } from "../../../lib/firebase";

import styles from "./page.module.css";

import Link from "next/link";

import { collection, getDocs } from "firebase/firestore";

import { ClipboardList, PackageSearch, LogOut } from "lucide-react";

import SigninManager from "../SigninManager/SigninManager";

import LoginForm from "../LoginForm/LoginForm";

import { User } from "@/app/type";

const menus = [
  {
    title: "進捗管理",
    href: "/reservation",
    icon: <ClipboardList size={30} />,
  },
  {
    title: "注残管理",
    href: "/orders",
    icon: <PackageSearch size={30} />,
  },
];

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

        setPosts(usersArray);
      } catch (error) {
        console.error("Firestore取得エラー:", error);
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
      console.error("サインアウトエラー:", error);
    }
  };

  // ログイン成功時
  const handleLoginSuccess = (isManager: boolean) => {
    setIsLoggedIn(true);

    setIsManagerIn(isManager);
  };

  return (
    <>
      {isLoggedIn ? (
        <div className={styles.dashboard}>
          {/* Main Menu */}
          <div className={styles.menuGrid}>
            {menus.map((menu) => (
              <Link key={menu.href} href={menu.href} className={styles.card}>
                <div className={styles.iconArea}>{menu.icon}</div>

                <div className={styles.cardBody}>
                  <h2 className={styles.cardTitle}>{menu.title}</h2>
                </div>

                <div className={styles.arrow}>→</div>
              </Link>
            ))}
          </div>

          {/* Manager */}
          {isManagerIn && <SigninManager />}

          {/* Signout */}
          <button
            type="button"
            className={styles.signoutCard}
            onClick={handleSignoutClick}
          >
            <div className={styles.signoutIcon}>
              <LogOut size={30} />
            </div>

            <div className={styles.cardBody}>
              <h2 className={styles.cardTitle}>サインアウト</h2>
            </div>

            <div className={styles.arrow}>→</div>
          </button>
        </div>
      ) : (
        <LoginForm posts={posts} onLoginSuccess={handleLoginSuccess} />
      )}
    </>
  );
};

export default Signin;
