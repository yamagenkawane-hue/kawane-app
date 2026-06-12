"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "../../lib/supabase";
import styles from "./page.module.css";
import { CustomerMaster, ProductMaster } from "../type";

const Create = () => {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);
  const [orderNo, setOrderNo] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productName, setProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderAmount, setOrderAmount] = useState("");
  const [completionScheduledDate, setCompletionScheduledDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [remark, setRemark] = useState("");
  const [orderAmountNumpadOpen, setOrderAmountNumpadOpen] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      const [productResult, customerResult] = await Promise.all([
        supabase
          .from("product_master")
          .select("*")
          .order("product_code", { ascending: true }),
        supabase
          .from("customer_master")
          .select("*")
          .order("customer_name", { ascending: true }),
      ]);

      const { data, error } = productResult;

      if (error) {
        alert("製品マスタの取得に失敗しました");
        return;
      }

      if (customerResult.error) {
        alert("得意先マスタの取得に失敗しました");
        return;
      }

      setProducts(
        (data || []).map((row) => ({
          id: row.id,
          productCode: row.product_code || "",
          productName: row.product_name || "",
          customerName: row.customer_name || "",
          standard: row.standard || "",
          unit: row.unit || "",
        })),
      );

      setCustomers(
        (customerResult.data || []).map((row) => ({
          id: row.id,
          customerName: row.customer_name || "",
          shippingOffsetDays: row.shipping_offset_days || 0,
          note: row.note || "",
        })),
      );
    };

    void fetchProducts();
  }, []);

  const calculateCompletionScheduledDate = (
    nextDeliveryDate: string,
    nextCustomerName: string,
  ) => {
    if (!nextDeliveryDate || !nextCustomerName) return "";

    const customer = customers.find(
      (item) => item.customerName === nextCustomerName,
    );
    const offsetDays = Number(customer?.shippingOffsetDays || 0);
    const date = new Date(`${nextDeliveryDate}T00:00:00`);
    date.setDate(date.getDate() - offsetDays);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const handleProductCodeChange = (value: string) => {
    const selectedProduct = products.find(
      (product) => product.productCode === value,
    );
    applySelectedProduct(selectedProduct);
  };

  const handleProductNameChange = (value: string) => {
    const selectedProduct = products.find(
      (product) => product.id === value || product.productName === value,
    );
    applySelectedProduct(selectedProduct);
  };

  const applySelectedProduct = (selectedProduct?: ProductMaster) => {
    if (!selectedProduct) {
      setProductCode("");
      setProductName("");
      setCustomerName("");
      return;
    }

    setProductCode(selectedProduct.productCode);
    setProductName(selectedProduct.productName);
    setCustomerName(selectedProduct.customerName);
    setCompletionScheduledDate(
      calculateCompletionScheduledDate(
        deliveryDate,
        selectedProduct.customerName,
      ),
    );
  };

  const handleDeliveryDateChange = (value: string) => {
    setDeliveryDate(value);
    setCompletionScheduledDate(
      calculateCompletionScheduledDate(value, customerName),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedOrderAmount = Number(orderAmount);
    const normalizedOrderNo = orderNo.trim();

    if (
      !normalizedOrderNo ||
      !productCode ||
      !productName ||
      !customerName ||
      !completionScheduledDate ||
      !deliveryDate ||
      orderAmount === "" ||
      !Number.isInteger(normalizedOrderAmount) ||
      normalizedOrderAmount <= 0
    ) {
      alert("必須項目を入力してください");
      return;
    }

    const now = new Date().toISOString();

    const { data: existingOrder, error: existingOrderError } = await supabase
      .from("posts")
      .select("id")
      .eq("order_no", normalizedOrderNo)
      .maybeSingle();

    if (existingOrderError) {
      console.error("Supabase duplicate check error:", existingOrderError);
      alert("注番の重複確認に失敗しました");
      return;
    }

    if (existingOrder) {
      alert("同じ注番がすでに登録されています");
      return;
    }

    const { error } = await supabase.from("posts").insert({
      order_no: normalizedOrderNo,
      lot_no: lotNo,
      product_code: productCode,
      product_name: productName,
      customer_name: customerName,
      order_amount: normalizedOrderAmount,
      completion_scheduled_date: completionScheduledDate,
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
      if (error.code === "23505") {
        alert("同じ注番がすでに登録されています");
        return;
      }

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
    setLotNo("");
    setProductCode("");
    setProductName("");
    setCustomerName("");
    setOrderAmount("");
    setCompletionScheduledDate("");
    setDeliveryDate("");
    setRemark("");
  };

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
        </Link>

        <h1 className={styles.title}>受注登録</h1>
      </div>

      {/* フォーム */}
      <form className={styles.formCard} onSubmit={handleSubmit}>
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
          <label>ロットNo</label>
          <input
            type="text"
            value={lotNo}
            onChange={(e) => setLotNo(e.target.value)}
            placeholder="0001 / T-0001 / S-0001"
          />
        </div>

        {/* 製品コード */}
        <div className={styles.formGroup}>
          <label>製品コード</label>
          <select
            value={productCode}
            onChange={(e) => handleProductCodeChange(e.target.value)}
            required
          >
            <option value="">製品コードを選択</option>
            {products.map((product) => (
              <option key={product.id} value={product.productCode}>
                {product.productCode}
              </option>
            ))}
          </select>
        </div>

        {/* 製品名 */}
        <div className={styles.formGroup}>
          <label>製品名</label>
          <select
            value={productName}
            onChange={(e) => handleProductNameChange(e.target.value)}
            required
          >
            <option value="">製品名を選択</option>
            {products.map((product) => (
              <option key={product.id} value={product.productName}>
                {product.productName}
              </option>
            ))}
          </select>
        </div>

        {/* 客先名 */}
        <div className={styles.formGroup}>
          <label>得意先名</label>
          <input
            type="text"
            value={customerName}
            readOnly
            placeholder="株式会社○○"
            required
          />
        </div>

        {/* 受注数量 */}
        <div className={styles.formGroup}>
          <label>受注数量</label>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            type="text"
            value={orderAmount}
            onFocus={() => setOrderAmountNumpadOpen(true)}
            onChange={(e) => setOrderAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="1000"
            required
          />
        </div>

        {/* 完了予定日 */}
        <div className={styles.formGroup}>
          <label>完了予定日</label>
          <input
            type="date"
            value={completionScheduledDate}
            readOnly
            required
          />
        </div>

        {/* 納期 */}
        <div className={styles.formGroup}>
          <label>納期</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => handleDeliveryDateChange(e.target.value)}
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

      <Numpad
        open={orderAmountNumpadOpen}
        value={orderAmount}
        onChange={(value) => setOrderAmount(value.replace(/\D/g, ""))}
        onClose={() => setOrderAmountNumpadOpen(false)}
      />
    </div>
  );
};

export default Create;
