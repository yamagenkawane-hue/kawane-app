import { useState } from "react";
import { authFetch } from "@/lib/auth/client";

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
    if (type === "passWord" && value.length < 6) {
      return "※パスワードは6文字以上で入力してください";
    }
    return "";
  };

  const handleInputChange =
    (
      field: "userName" | "passWord",
      setter: React.Dispatch<React.SetStateAction<string>>,
      validator: (value: string) => string,
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
      const response=await authFetch("/api/auth/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:userName,password:passWord})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||"登録できません");
      setUserName("");
      setPassWord("");
      setErrors({ userName: "", passWord: "" });
    } catch (error) {
      alert(error instanceof Error?error.message:"登録できません");
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
