import React from "react";
import styles from "./page.module.css";
import Link from "next/link";

const SigninManager = () => {
  return (
    <div className={styles.managerMenu}>
      <Link href="newRegistration/" className={styles.link}>
        <button className={styles.newRegistration}>新規登録</button>
      </Link>
      <Link href="managerMenu/" className={styles.link}>
        <button className={styles.newRegistration}> ID管理</button>
      </Link>
      <Link href="confirmation/" className={styles.link}>
              <button className={styles.newRegistration}> 月別一覧</button>
            </Link>
    </div>
  );
};

export default SigninManager;
