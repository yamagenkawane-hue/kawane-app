import Signin from "./components/Signin/Signin";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Background */}
      <div className={styles.backgroundCircle1}></div>

      <div className={styles.backgroundCircle2}></div>

      {/* Header */}
      <div className={styles.header}>
        <p className={styles.subTitle}>Yamagen System</p>

        <h1 className={styles.mainTitle}>生産管理システム</h1>

        <p className={styles.description}>
          進捗管理・注残管理・工程管理を 一元化する生産管理プラットフォーム
        </p>
      </div>

      {/* Login / Menu */}
      <div className={styles.card}>
        <Signin />
      </div>
    </main>
  );
}
