"use client";

import React from "react";
import styles from "./page.module.css";

const Thanks = () => {
  return (
    <div className={styles.thanks}>
      <h1>送信完了しました!</h1>
      <div>
        <p>
          ご予約内容はLINE公式アカウントの
          <br />
          予約確認からご確認できます。
        </p>
      </div>
    </div>
  );
};

export default Thanks;
