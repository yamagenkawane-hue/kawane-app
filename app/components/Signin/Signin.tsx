"use client";

import React from "react";
import supabase from "../../../lib/supabase";
import styles from "./page.module.css";
import Link from "next/link";
import {
  CalendarCheck,
  ClipboardList,
  Handshake,
  PackageSearch,
  LogOut,
} from "lucide-react";
import SigninManager from "../SigninManager/SigninManager";
import { useAppAuth } from "../AuthProvider/AuthProvider";




const menus = [
  {
    title: "受注管理",
    href: "/orders",
    icon: <PackageSearch size={30} />,
  },
  {
    title: "進捗管理",
    href: "/reservation",
    icon: <ClipboardList size={30} />,
  },
  {
    title: "生産予定",
    href: "/productionSchedules",
    icon: <CalendarCheck size={30} />,
  },
  {
    title: "外注管理",
    href: "/outsourcing",
    icon: <Handshake size={30} />,
  },
];

const Signin = () => {
  const {profile}=useAppAuth();
  const isLoggedIn=Boolean(profile);
  const isManagerIn=Boolean(profile?.manager);
  const handleSignoutClick=async()=>{await supabase.auth.signOut();};
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
        null
      )}
    </>
  );
};

export default Signin;
