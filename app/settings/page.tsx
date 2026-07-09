"use client";

import Link from "next/link";
import { Cpu, Database, Factory, Users } from "lucide-react";
import styles from "./page.module.css";

const mainMenus = [
  {
    title: "ユーザー管理",
    text: "ユーザー編集・削除・復元を管理",
    href: "/userManager",
    icon: <Users size={34} />,
  },
  {
    title: "マスタ設定",
    text: "各種マスタ情報を管理",
    href: "/masterSettings",
    icon: <Database size={34} />,
  },
  {
    title: "ライン能力設定",
    text: "ライン別の日産能力を管理",
    href: "/lineMaster",
    icon: <Factory size={34} />,
  },
  {
    title: "AI予測設定",
    text: "遅延予測AI・負荷予測AIを設定",
    href: "/aiPredictionSettings",
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
        {mainMenus.map((menu) => (
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
