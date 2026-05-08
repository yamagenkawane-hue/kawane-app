import liff from "@line/liff";
import { useEffect, useState } from "react";

export const useAuthentication = () => {
  const [user, setUser] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({
          liffId: process.env.NEXT_PUBLIC_LIFF_USER_ID as string,
        });
        console.log("LIFFの初期化に成功しました");

        if (liff.isLoggedIn()) {
          const token = liff.getIDToken();
          setIdToken(token);
        } else {
          liff.login();
        }

        const userProfile = await liff.getProfile();
        setUser(userProfile.userId);
        setName(userProfile.displayName);
      } catch (e) {
        console.error("LIFFの初期化に失敗しました", e);
        setIdToken("");
      } finally {
        setLoading(false);
      }
    };
    initializeLiff();
  }, []);

  return { user, name, idToken, loading };
};
