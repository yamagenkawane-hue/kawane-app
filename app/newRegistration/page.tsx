"use client";

import Link from "next/link";
import { UserPlus, User, Lock } from "lucide-react";

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
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <Link href="/" className={styles.backButton}>
          ← ホームへ戻る
        </Link>

        <div>
          <p className={styles.subTitle}>Yamagen System</p>

          <h1 className={styles.title}>新規登録</h1>
        </div>
      </div>

      {/* Form Card */}
      <div className={styles.card}>
        {/* User ID */}
        <div className={styles.formGroup}>
          <label className={styles.label}>
            <User size={20} />
            ユーザーID
          </label>

          <input
            className={styles.input}
            value={userName}
            placeholder="ユーザーIDを入力してください"
            onChange={handleInputChange("userName", setUserName, (value) =>
              validateInput(value, "userName"),
            )}
          />

          {errors.userName && (
            <p className={styles.errorText}>{errors.userName}</p>
          )}
        </div>

        {/* Password */}
        <div className={styles.formGroup}>
          <label className={styles.label}>
            <Lock size={20} />
            パスワード
          </label>

          <p className={styles.helpText}>※半角英数字</p>

          <input
            type="password"
            className={styles.input}
            value={passWord}
            pattern="[a-zA-Z0-9]*"
            placeholder="パスワードを入力してください"
            onChange={handleInputChange("passWord", setPassWord, (value) =>
              validateInput(value, "passWord"),
            )}
          />

          {errors.passWord && (
            <p className={styles.errorText}>{errors.passWord}</p>
          )}
        </div>

        {/* Buttons */}
        <div className={styles.buttonArea}>
          <button className={styles.submitButton} onClick={handleClick}>
            <UserPlus size={20} />
            登録
          </button>

          <Link href="/" className={styles.cancelButton}>
            戻る
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NewRegistration;
