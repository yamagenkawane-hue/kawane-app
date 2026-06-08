"use client";

import Link from "next/link";
import {
  CalendarDays,
  Cpu,
  Database,
  Factory,
  Package,
  Settings2,
  Users,
} from "lucide-react";
import styles from "./page.module.css";

const settingsMenus = [
  {
    title: "ユーザー管理",
    text: "ユーザー編集・削除・復元を管理",
    href: "/userManager",
    icon: <Users size={34} />,
  },
  {
    title: "工程マスタ",
    text: "工程順・工程日数・使用可否を管理",
    href: "/processMaster",
    icon: <Settings2 size={34} />,
  },
  {
    title: "会社カレンダー",
    text: "休日・会社休業日・特別休業日を設定",
    href: "/calendar",
    icon: <CalendarDays size={34} />,
  },
  {
    title: "ライン能力設定",
    text: "ライン別の日産能力を管理",
    href: "/lineMaster",
    icon: <Factory size={34} />,
  },
  {
    title: "得意先マスタ",
    text: "得意先別の出荷日自動設定ルールを管理",
    href: "/customerMaster",
    icon: <Users size={34} />,
  },
  {
    title: "製品マスタ",
    text: "製品コード・製品名・規格などを管理",
    href: "/productMaster",
    icon: <Package size={34} />,
  },
  {
    title: "外注先マスタ",
    text: "外注工程で使用する取引先を管理",
    href: "/subcontractors",
    icon: <Factory size={34} />,
  },
  {
    title: "製品工程マスタ",
    text: "製品ごとの工程順と外注先を管理",
    href: "/productProcesses",
    icon: <Settings2 size={34} />,
  },
  {
    title: "材料マスタ",
    text: "製造で使用する材料情報を管理",
    href: "/materialMaster",
    icon: <Settings2 size={34} />,
  },
  {
    title: "在庫マスタ",
    text: "現在庫数と入出庫連携用の在庫情報を管理",
    href: "/inventoryMaster",
    icon: <Database size={34} />,
  },
  {
    title: "AI予測設定",
    text: "遅延予測AI・負荷予測AIを設定",
    href: "/settings",
    icon: <Cpu size={34} />,
  },
];

export default function SettingsPage() {
  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <Link href="/" className={styles.backButton}>
          ← ホームへ戻る
        </Link>
        <div>
          <p className={styles.subTitle}>Yamagen System</p>

          <h1 className={styles.title}>システム設定</h1>
        </div>
      </div>

      {/* Cards */}
      <div className={styles.grid}>
        {settingsMenus.map((menu) => (
          <Link key={menu.href} href={menu.href} className={styles.card}>
            <div className={styles.iconArea}>{menu.icon}</div>

            <div className={styles.cardBody}>
              <h2 className={styles.cardTitle}>{menu.title}</h2>

              <p className={styles.cardText}>{menu.text}</p>
            </div>

            <div className={styles.arrow}>→</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
