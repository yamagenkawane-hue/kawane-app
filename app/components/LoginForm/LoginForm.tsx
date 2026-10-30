"use client";

import React, { useState } from "react";
import { LockKeyhole, User, LogIn } from "lucide-react";
import styles from "./page.module.css";
import supabase from "@/lib/supabase";

const LoginForm = ({ onLoginSuccess }: { onLoginSuccess: () => void }) => {
  const [loading,setLoading]=useState(false);
  const [user, setUser] = useState("");

  const [pass, setPass] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if(loading) return;
    setLoading(true);setErrorMessage(null);
    try {
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({loginId:user,password:pass})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||"ログインできません");
      const {error}=await supabase.auth.setSession(result);
      if(error) throw error;
      setPass("");onLoginSuccess();
    } catch(cause) {setErrorMessage(cause instanceof Error?cause.message:"ログインできません");}
    finally {setLoading(false);}
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
        <form className={styles.form} onSubmit={handleClick}>
          {/* User */}
          <div className={styles.formGroup}>
            <label className={styles.label}>ユーザーID</label>

            <div className={styles.inputArea}>
              <User size={20} />

              <input
                className={styles.input}
                value={user}
                placeholder="ユーザーIDを入力"
                autoComplete="username" required
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
                type="password" autoComplete="current-password" required
                className={styles.input}
                value={pass}
                placeholder="パスワードを入力"
                onChange={(e) => setPass(e.target.value)}
              />
            </div>
          </div>

          {/* Button */}
          <button
            type="submit"
            className={styles.signinButton}
            disabled={loading}
          >
            <LogIn size={20} />
            {loading?"確認中…":"サインイン"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
