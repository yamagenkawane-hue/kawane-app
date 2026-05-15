"use client";

import React, { useState } from "react";

import { addDoc, collection } from "firebase/firestore";

import Link from "next/link";

import db from "../../lib/firebase";

import styles from "./page.module.css";

const Create = () => {
  // 注番
  const [orderNo, setOrderNo] = useState("");

  // 製品コード
  const [productCode, setProductCode] = useState("");

  // 製品名
  const [productName, setProductName] = useState("");

  // 客先名
  const [customerName, setCustomerName] = useState("");

  // 受注数量
  const [orderAmount, setOrderAmount] = useState<number | "">("");

  // 納期
  const [deliveryDate, setDeliveryDate] = useState("");

  // 備考
  const [remark, setRemark] = useState("");

  // 登録
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 必須チェック
    if (
      !orderNo ||
      !productCode ||
      !productName ||
      !customerName ||
      !deliveryDate ||
      orderAmount === ""
    ) {
      alert("必須項目を入力してください");

      return;
    }

    try {
      const now = new Date().toISOString();

      await addDoc(collection(db, "posts"), {
        // 注番
        orderNo,

        // 製品情報
        productCode,
        productName,

        // 客先
        customerName,

        // =========================
        // 受注数量
        // =========================
        orderAmount: Number(orderAmount),

        // =========================
        // 製造
        // =========================
        manufacturingDate: "",
        manufacturingAmount: 0,

        // =========================
        // 洗浄
        // =========================
        cleaningDate: "",
        cleaningAmount: 0,

        // =========================
        // 検査
        // =========================
        inspectionDate: "",
        inspectionAmount: 0,

        // =========================
        // 測量
        // =========================
        measurementDate: "",
        measurementAmount: 0,

        // =========================
        // 梱包
        // =========================
        packagingDate: "",
        packagingAmount: 0,

        // 注残
        remainingAmount: Number(orderAmount),

        // 状態
        status: "未着手",

        // 納期
        deliveryDate,

        // 備考
        remark,

        // 日別実績
        manufacturingLogs: [],

        cleaningLogs: [],

        inspectionLogs: [],

        measurementLogs: [],

        packagingLogs: [],

        // 論理削除
        delete: false,

        // 作成情報
        createdBy: "admin",
        updatedBy: "admin",

        createdAt: now,
        updatedAt: now,
      });

      alert("製品を登録しました");

      // リセット
      setOrderNo("");

      setProductCode("");

      setProductName("");

      setCustomerName("");

      setOrderAmount("");

      setDeliveryDate("");

      setRemark("");
    } catch (error) {
      console.error("登録に失敗しました", error);

      alert("登録に失敗しました");
    }
  };

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.headerArea}>
        <Link href="/">
          <button className={styles.backButton}>トップへ戻る</button>
        </Link>

        <h1 className={styles.title}>受注登録</h1>
      </div>

      {/* フォーム */}
      <form className={styles.form} onSubmit={handleSubmit}>
        {/* 注番 */}
        <div className={styles.formGroup}>
          <label>注番</label>

          <input
            type="text"
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            placeholder="J250001"
            required
          />
        </div>

        {/* 製品コード */}
        <div className={styles.formGroup}>
          <label>製品コード</label>

          <input
            type="text"
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            placeholder="A001"
            required
          />
        </div>

        {/* 製品名 */}
        <div className={styles.formGroup}>
          <label>製品名</label>

          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="製品A"
            required
          />
        </div>

        {/* 客先名 */}
        <div className={styles.formGroup}>
          <label>客先名</label>

          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="株式会社○○"
            required
          />
        </div>

        {/* 受注数量 */}
        <div className={styles.formGroup}>
          <label>受注数量</label>

          <input
            type="number"
            value={orderAmount}
            onChange={(e) =>
              setOrderAmount(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
            placeholder="1000"
            required
          />
        </div>

        {/* 納期 */}
        <div className={styles.formGroup}>
          <label>納期</label>

          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            required
          />
        </div>

        {/* 備考 */}
        <div className={styles.formGroup}>
          <label>備考</label>

          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={4}
          />
        </div>

        {/* 登録ボタン */}
        <button type="submit" className={styles.submitButton}>
          登録
        </button>
      </form>
    </div>
  );
};

export default Create;
