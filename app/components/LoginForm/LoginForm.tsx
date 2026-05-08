import React, { useState } from "react";
import { Button } from "@mui/material";
import styles from "./page.module.css";
import { LoginFormProps } from "@/app/type";

const LoginForm: React.FC<LoginFormProps> = ({ posts, onLoginSuccess }) => {
  const [user, setUser] = useState<string>("");
  const [pass, setPass] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = () => {
    setErrorMessage(null);
    if (!user || !pass) {
      setErrorMessage("ユーザー名とパスワードを入力してください");
      return;
    }

    const foundUser = posts.find(
      (post) => post.name === user && post.pass === pass
    );

    if (foundUser) {
      console.log("ログイン成功");
      localStorage.setItem("loggedInUser", JSON.stringify(foundUser));

      if (foundUser.manager) {
        localStorage.setItem("isManagerIn", "true");
        onLoginSuccess(true);
      } else {
        localStorage.setItem("isManagerIn", "false");
        onLoginSuccess(false);
      }
    } else {
      setErrorMessage("ユーザー名またはパスワードが違います");
    }

    setUser("");
    setPass("");
  };

  return (
    <div className={styles.loginBox}>
      {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
      <h2 className={styles.logButton}>ログイン画面</h2>
      <form>
        <div className={styles.formGroup}>
          <label className={styles.label}>ユーザーID</label>
          <input
            className={styles.input}
            value={user}
            placeholder="ユーザーIDを入力してください"
            onChange={(e) => setUser(e.target.value)}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>パスワード</label>
          <input
            className={styles.input}
            value={pass}
            placeholder="パスワードを入力してください"
            onChange={(e) => setPass(e.target.value)}
            required
          />
        </div>
        <div className={styles.signin}>
          <Button className={styles.signinButton} onClick={handleClick}>
            サインイン
          </Button>
        </div>
      </form>
    </div>
  );
};

export default LoginForm;
