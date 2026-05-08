import { addDoc, collection } from "firebase/firestore";
import { useEffect, useState } from "react";
import db from "../../../lib/firebase";

export const useNewRegistration = () => {
  const [userName, setUserName] = useState("");
  const [passWord, setPassWord] = useState("");
  const [errors, setErrors] = useState({
    userName: "",
    passWord: "",
  });

  const validateInput = (value: string, type: "userName" | "passWord") => {
    if (value.length < 1) {
      return `※${
        type === "userName" ? "ユーザーID" : "パスワード"
      }を入力してください`;
    }
    if (type === "passWord" && /[^a-zA-Z0-9]/.test(value)) {
      return "※パスワードは半角英数字のみです";
    }
    return "";
  };

  const handleInputChange =
    (
      field: "userName" | "passWord",
      setter: React.Dispatch<React.SetStateAction<string>>,
      validator: (value: string) => string
    ) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setter(value);
      setErrors((prev) => ({ ...prev, [field]: validator(value) }));
    };
  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    const userNameError = validateInput(userName, "userName");
    const passWordError = validateInput(passWord, "passWord");

    if (userNameError || passWordError) {
      setErrors({ userName: userNameError, passWord: passWordError });
      return;
    }

    try {
      await addDoc(collection(db, "user"), {
        name: userName,
        pass: passWord,
        manager: false,
        delete: false,
      });
      setUserName("");
      setPassWord("");
      setErrors({ userName: "", passWord: "" });
    } catch (error) {
      console.error("エラーが発生しました: ", error);
    }
  };

  return {
    handleClick,
    handleInputChange,
    validateInput,
    errors,
    userName,
    passWord,
    setUserName,
    setPassWord,
  };
};
