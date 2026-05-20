import React from "react";

import Link from "next/link";

import { UserPlus, Settings, PackagePlus } from "lucide-react";

import styles from "./page.module.css";

const menus = [
  {
    title: "新規登録",
    href: "/newRegistration",
    icon: <UserPlus size={28} />,
  },
  {
    title: "設定",
    href: "/settings",
    icon: <Settings size={28} />,
  },
  {
    title: "製品登録",
    href: "/create",
    icon: <PackagePlus size={28} />,
  },
];

const SigninManager = () => {
  return (
    <div className={styles.managerMenu}>
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
  );
};

export default SigninManager;
