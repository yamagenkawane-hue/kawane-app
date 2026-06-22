"use client";

import React, { useEffect, useSyncExternalStore, useState } from "react";
import supabase from "../../../lib/supabase";
import styles from "./page.module.css";
import Link from "next/link";
import {
  CalendarCheck,
  ClipboardList,
  ClipboardPen,
  Factory,
  Handshake,
  PackageSearch,
  LogOut,
  Scale,
  Truck,
} from "lucide-react";
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
  {
    title: "生産予定",
    href: "/productionSchedules",
    icon: <CalendarCheck size={30} />,
  },
  {
    title: "実績登録",
    href: "/productionResults",
    icon: <ClipboardPen size={30} />,
  },
  {
    title: "外注管理",
    href: "/outsourcing",
    icon: <Handshake size={30} />,
  },
  {
    title: "計量実績登録",
    href: "/manufacturing",
    icon: <Factory size={30} />,
  },
  {
    title: "出荷管理",
    href: "/shipping",
    icon: <Truck size={30} />,
  },
  {
    title: "計量表出力",
    href: "/weighingReport",
    icon: <Scale size={30} />,
  },
];

const authChangeEventName = "auth-state-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(authChangeEventName, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(authChangeEventName, callback);
  };
}

function getLoggedInUser() {
  return localStorage.getItem("loggedInUser");
}

function getManagerIn() {
  return localStorage.getItem("isManagerIn");
}

function getServerSnapshot() {
  return null;
}

const Signin = () => {
  const [posts, setPosts] = useState<User[]>([]);

  const loggedInUser = useSyncExternalStore(
    subscribe,
    getLoggedInUser,
    getServerSnapshot,
  );

  const managerInValue = useSyncExternalStore(
    subscribe,
    getManagerIn,
    getServerSnapshot,
  );

  const isLoggedIn = loggedInUser !== null;
  const isManagerIn = managerInValue === "true";

  // Supabaseからユーザー取得
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase.from("user").select("*");

        if (error) throw error;

        const usersArray: User[] = (data || []).map((row) => ({
          id: row.id,
          name: row.name,
          pass: row.pass,
          manager: row.manager,
          delete: row.delete,
        }));

        setPosts(usersArray);
      } catch (error) {
        console.error("ユーザー取得エラー:", error);
      }
    };

    fetchData();
  }, []);

  // サインアウト（localStorageをクリアしてstorageイベントを発火）
  const handleSignoutClick = async () => {
    try {
      localStorage.removeItem("loggedInUser");
      localStorage.removeItem("isManagerIn");
      window.dispatchEvent(new Event(authChangeEventName));
    } catch (error) {
      console.error("サインアウトエラー:", error);
    }
  };

  // ログイン成功時
  const handleLoginSuccess = (isManager: boolean) => {
    localStorage.setItem("loggedInUser", "true");
    localStorage.setItem("isManagerIn", String(isManager));
    window.dispatchEvent(new Event(authChangeEventName));
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
