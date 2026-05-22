"use client";

import React, { useState } from "react";
import Link from "next/link";
import supabase from "../../lib/supabase";
import styles from "./page.module.css";

const Create = () => {
  const [orderNo, setOrderNo] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productName, setProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderAmount, setOrderAmount] = useState<number | "">("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [remark, setRemark] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    const now = new Date().toISOString();

    const { error } = await supabase.from("posts").insert({
      order_no: orderNo,
      product_code: productCode,
      product_name: productName,
      customer_name: customerName,
      order_amount: Number(orderAmount),
      manufacturing_date: null,
      cleaning_date: null,
      inspection_date: null,
      measurement_date: null,
      packaging_date: null,
      delivery_date: deliveryDate,
      remark,
      status: "未着手",
      manufacturing_logs: [],
      cleaning_logs: [],
      inspection_logs: [],
      measurement_logs: [],
      packaging_logs: [],
      delete: false,
      created_at: now,
      updated_at: now,
    });

    if (error) {
      console.error("Supabase insert error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      alert(
        `登録に失敗しました\n\ncode: ${error.code}\nmessage: ${error.message}`,
      );
      return;
    }

    alert("製品を登録しました");

    setOrderNo("");
    setProductCode("");
    setProductName("");
    setCustomerName("");
    setOrderAmount("");
    setDeliveryDate("");
    setRemark("");
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
