"use client";

import React, { useState } from "react";

import { LockKeyhole, User, LogIn } from "lucide-react";

import styles from "./page.module.css";

import { LoginFormProps } from "@/app/type";

const LoginForm: React.FC<LoginFormProps> = ({ posts, onLoginSuccess }) => {
  const [user, setUser] = useState("");

  const [pass, setPass] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    setErrorMessage(null);

    if (!user || !pass) {
      setErrorMessage("ユーザー名とパスワードを入力してください");

      return;
    }

    const foundUser = posts.find(
      (post) => post.name === user && post.pass === pass,
    );

    if (foundUser) {
      localStorage.setItem("loggedInUser", JSON.stringify(foundUser));

      const isManager = !!foundUser.manager;

      localStorage.setItem("isManagerIn", String(isManager));

      onLoginSuccess(isManager);
    } else {
      setErrorMessage("ユーザー名またはパスワードが違います");
    }

    setUser("");

    setPass("");
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.loginCard}>
        {/* Header */}
        <div className={styles.header}>
          <p className={styles.subTitle}>Manufacturing System</p>

          <h2 className={styles.title}>ログイン</h2>
        </div>

        {/* Error */}
        {errorMessage && <div className={styles.errorBox}>{errorMessage}</div>}

        {/* Form */}
        <div className={styles.form}>
          {/* User */}
          <div className={styles.formGroup}>
            <label className={styles.label}>ユーザーID</label>

            <div className={styles.inputArea}>
              <User size={20} />

              <input
                className={styles.input}
                value={user}
                placeholder="ユーザーIDを入力"
                onChange={(e) => setUser(e.target.value)}
              />
            </div>
          </div>

          {/* Password */}
          <div className={styles.formGroup}>
            <label className={styles.label}>パスワード</label>

            <div className={styles.inputArea}>
              <LockKeyhole size={20} />

              <input
                type="password"
                className={styles.input}
                value={pass}
                placeholder="パスワードを入力"
                onChange={(e) => setPass(e.target.value)}
              />
            </div>
          </div>

          {/* Button */}
          <button
            type="button"
            className={styles.signinButton}
            onClick={handleClick}
          >
            <LogIn size={20} />
            サインイン
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
