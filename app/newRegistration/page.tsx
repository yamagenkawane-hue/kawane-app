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
    userName, displayName, setDisplayName,
    passWord,
    setUserName,
    setPassWord,
  } = useNewRegistration();

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <Link href="/settings" className={styles.backButton}>
          ← 設定へ戻る
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

        <div className={styles.formGroup}>
          <label htmlFor="new-display-name" className={styles.label}>表示名</label>
          <input id="new-display-name" className={styles.input} value={displayName} maxLength={100}
            placeholder="履歴に表示する名前（未登録時はログインID）" onChange={e => setDisplayName(e.target.value)} />
        </div>
        {/* Password */}
        <div className={styles.formGroup}>
          <label className={styles.label}>
            <Lock size={20} />
            パスワード
          </label>

          <p className={styles.helpText}>※6文字以上</p>

          <input
            type="password"
            className={styles.input}
            value={passWord}
            minLength={6}
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

          <Link href="/settings" className={styles.cancelButton}>
            戻る
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NewRegistration;
