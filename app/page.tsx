import Signin from "./components/Signin/Signin";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.mainTitle}>預かり保育予約管理システム</h1>
      <div>
        <Signin />
      </div>
    </main>
  );
}