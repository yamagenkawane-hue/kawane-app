import React from "react";
import styles from "./page.module.css";
import Link from "next/link";

const SigninManager = () => {
  return (
    <div className={styles.managerMenu}>
      <Link href="newRegistration/" className={styles.link}>
        <button className={styles.newRegistration}>新規登録</button>
      </Link>
      <Link href="/settings" className={styles.link}>
        <button className={styles.newRegistration}> 設定</button>
      </Link>
      <Link href="create/" className={styles.link}>
        <button className={styles.newRegistration}>製品登録</button>
      </Link>
    </div>
  );
};

export default SigninManager;
