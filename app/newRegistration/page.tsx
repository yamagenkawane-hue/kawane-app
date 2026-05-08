"use client";

import React from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { useNewRegistration } from "../utills/useNewRegistration";

const NewRegistration = () => {
  const {
    handleClick,
    handleInputChange,
    validateInput,
    errors,
    userName,
    passWord,
    setUserName,
    setPassWord,
  } = useNewRegistration();

  return (
    <>
      <div className={styles.titleform}>
        <h1 className={styles.maintext}>新規登録</h1>
        <h3 className={styles.titletext}>ユーザーID</h3>
        <div className={styles.inputcenter}>
          <input
            className={styles.inputBox}
            value={userName}
            placeholder="ユーザーIDを入力してください"
            onChange={handleInputChange("userName", setUserName, (value) =>
              validateInput(value, "userName")
            )}
          />
          {errors.userName && (
            <p className={styles.errorText}>{errors.userName}</p>
          )}
        </div>
        <div className={styles.passTitle}>
          <h3 className={styles.passWordtitle}>パスワード</h3>
          <p className={styles.text}>※半角英数字</p>
        </div>
        <div className={styles.inputcenter}>
          <input
            className={styles.inputBox}
            value={passWord}
            pattern="[a-zA-Z0-9]*"
            placeholder="パスワードを入力してください"
            onChange={handleInputChange("passWord", setPassWord, (value) =>
              validateInput(value, "passWord")
            )}
          />
          {errors.passWord && (
            <p className={styles.errorText}>{errors.passWord}</p>
          )}
        </div>
        <button className={styles.buttonText} onClick={handleClick}>
          登録
        </button>
        <div>
          <Link href="/">
            <button className={styles.backButton}>戻る</button>
          </Link>
        </div>
      </div>
    </>
  );
};

export default NewRegistration;
