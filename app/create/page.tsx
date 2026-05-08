"use client";

import { collection, addDoc } from "firebase/firestore";
import db from "../../../lib/firebase";
import React, { useEffect, useState } from "react";
import firebase from "firebase/compat/app";
import { v4 as uuidv4 } from "uuid";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import CreateForm from "../components/CreateForm/CreateForm";
import { useCreateAuthentication } from "../utills/useCreateAuthentication";
import { useHandleChange } from "../utills/useHandleChange";
import { useSendMessage } from "../utills/useSendMessage";

const CreatePage = () => {
  const router = useRouter();
  const [childName, setChildName] = useState("");
  const [childClass, setChildClass] = useState("");
  const { user, idToken } = useCreateAuthentication();
  const { handleChange, ...days } = useHandleChange();
  const { sendMessage, isSubmitting } = useSendMessage();

  useEffect(() => {
    if (user) {
      localStorage.setItem("userId", user);
    }
  }, [user]);

  if (idToken === null) {
    return <div>Loading...</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !idToken) return console.error("ユーザー情報が見つかりません");

    const filteredDays = Object.values(days)
      .map((day) => ({
        id: uuidv4(),
        name: childName,
        class: childClass,
        realStartTime: "",
        realEndTime: "",
        userId: user,
        ...day,
      }))
      .filter((day) => day.date?.trim());

    if (!filteredDays.length) return console.log("保存するデータがありません");

    for (const day of filteredDays) {
      if (day.endTime <= day.startTime) {
        alert(
          `日にち ${day.date} のお迎え時間は延長開始時間以降に設定してください`
        );
        return;
      }
    }

    try {
      await Promise.all(
        filteredDays.map((day) => {
          return addDoc(collection(db, "posts"), {
            days: [day],
            firstDate: day.date,
            timeStamp: firebase.firestore.FieldValue.serverTimestamp(),
          });
        })
      );

      await sendMessage(user, filteredDays);
      router.push("/thanks");
    } catch (error) {
      console.error("エラーが発生しました:", error);
    }
  };

  return (
    <div className={styles.createCenter}>
      <form onSubmit={handleSubmit}>
        <h1 className={styles.createTitle}>預かり保育申し込み</h1>
        <p className={styles.createChildName}>園児名</p>
        <input
          className={styles.createChildInput}
          placeholder="園児名を入力してください"
          onChange={(e) => setChildName(e.target.value)}
        />
        <div>
          <p className={styles.classTitle}>クラス</p>
          <select
            name="selectedClass"
            className={styles.classInput}
            onChange={(e) => setChildClass(e.target.value)}
          >
            <option value="">クラスを選択してください</option>
            {["ばら", "すみれ", "ひまわり", "未就園児", "小学生"].map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
        </div>
        <div>
          {["firstDay", "secondDay", "thirdDay", "fourthDay", "fifthDay"].map(
            (day, index) => (
              <CreateForm
                key={index}
                day={day}
                index={index}
                onChange={(field) => handleChange(index, field)}
              />
            )
          )}
        </div>
        {/* <button type="submit" className={styles.submitButton}>
          {isSubmitting ? "送信中..." : "送信"}
        </button> */}
        <button
  type="submit"
  className={`${styles.submitButton} ${isSubmitting ? styles.submitting : ""}`}
  disabled={isSubmitting}
>
  {isSubmitting ? "送信中..." : "送信"}
</button>
      </form>
    </div>
  );
};

export default CreatePage;
