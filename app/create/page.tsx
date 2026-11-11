"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "../../lib/supabase";
import styles from "./page.module.css";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { completionDateForCustomer, plannedStartDateError, productsForCustomer } from "@/lib/orderEntry";
import { CustomerMaster, ProductMaster } from "../type";

const PRODUCT_SELECT_COLUMNS =
  "id,customer_id,product_code,product_name,customer_name,standard,unit,unit_weight";

const CUSTOMER_SELECT_COLUMNS = "id,customer_name,shipping_offset_days,note";

const Create = () => {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);
  const [orderNo, setOrderNo] = useState("");
  const [plannedStartDate, setPlannedStartDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [orderAmount, setOrderAmount] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [remark, setRemark] = useState("");
  const [orderAmountNumpadOpen, setOrderAmountNumpadOpen] = useState(false);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const customerProducts = productsForCustomer(products, customers, customerId);
  const selectedProduct = customerProducts.find((product) => product.id === productId);
  const productCode = selectedProduct?.productCode || "";
  const completionScheduledDate = completionDateForCustomer(deliveryDate, selectedCustomer);

  useEffect(() => {
    let active = true;
    const fetchMasters = async () => {
      try {
        const [productResult, customerResult] = await Promise.all([
          fetchAllRows((from, to) => supabase.from("v_product_master_with_customer").select(PRODUCT_SELECT_COLUMNS)
            .order("product_code").order("id").range(from, to)),
          fetchAllRows((from, to) => supabase.from("customer_master").select(CUSTOMER_SELECT_COLUMNS)
            .order("customer_name").order("id").range(from, to)),
        ]);
        if (productResult.error) throw productResult.error;
        if (customerResult.error) throw customerResult.error;
        if (!active) return;
        setProducts((productResult.data || []).map((row) => ({
          id: row.id, customerId: row.customer_id || "", productCode: row.product_code || "",
          productName: row.product_name || "", customerName: row.customer_name || "", standard: row.standard || "",
          unit: row.unit || "", unitWeight: Number(row.unit_weight || 0),
        })));
        setCustomers((customerResult.data || []).map((row) => ({
          id: row.id, customerName: row.customer_name || "", shippingOffsetDays: Number(row.shipping_offset_days || 0), note: row.note || "",
        })));
      } catch (error) {
        console.error(error);
        if (active) alert("得意先・製品マスタの取得に失敗しました");
      } finally {
        if (active) setMastersLoading(false);
      }
    };
    void fetchMasters();
    return () => { active = false; };
  }, []);

  const handleCustomerChange = (value: string) => {
    setCustomerId(value);
    setProductId("");
  };
  const handleCsvImportClick = () => alert("CSV入力機能は今後追加予定です。");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || mastersLoading) return;
    const normalizedOrderAmount = Number(orderAmount);
    const normalizedOrderNo = orderNo.trim();
    if (!normalizedOrderNo || !selectedCustomer || !selectedProduct || !productCode || !completionScheduledDate
      || !deliveryDate || !orderAmount || !Number.isInteger(normalizedOrderAmount) || normalizedOrderAmount <= 0) {
      alert("必須項目を入力してください");
      return;
    }
    const dateError = plannedStartDateError(plannedStartDate, completionScheduledDate, deliveryDate);
    if (dateError) { alert(dateError); return; }
    try {
      setSaving(true);
      const { data: existingOrder, error: duplicateError } = await supabase.from("posts").select("id")
        .eq("order_no", normalizedOrderNo).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (existingOrder) { alert("同じ注番がすでに登録されています"); return; }
      const now = new Date().toISOString();
      const { data: insertedPost, error } = await supabase.from("posts").insert({
        order_no: normalizedOrderNo,
        planned_start_date: plannedStartDate || null,
        product_code: selectedProduct.productCode, product_name: selectedProduct.productName, product_id: selectedProduct.id,
        customer_name: selectedCustomer.customerName, customer_id: selectedCustomer.id,
        order_amount: normalizedOrderAmount, completion_scheduled_date: completionScheduledDate, delivery_date: deliveryDate,
        remark, status: "未着手", delete: false, created_at: now, updated_at: now,
      }).select("id").single();
      if (error) throw error;
      if (insertedPost?.id) {
        const { error: processError } = await supabase.rpc("create_order_processes_for_post", { p_post_id: insertedPost.id });
        if (processError) {
          console.error(processError);
          alert("受注は登録しましたが、工程予定の自動作成に失敗しました。受注別工程管理で確認してください。");
          return;
        }
      }
      alert("受注を登録しました");
      setOrderNo(""); setPlannedStartDate(""); setCustomerId(""); setProductId("");
      setOrderAmount(""); setDeliveryDate(""); setRemark("");
    } catch (error) {
      console.error(error);
      const fields = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
      alert(fields.code === "23505" ? "同じ注番がすでに登録されています" : "受注の登録に失敗しました。入力内容を確認してください。");
    } finally { setSaving(false); }
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
      <div className={styles.csvImportArea}>
        <button
          type="button"
          className={styles.csvImportButton}
          onClick={handleCsvImportClick}
        >
          CSV入力
        </button>
      </div>

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

        <div className={styles.formGroup}>
          <label htmlFor="planned-start-date">開始予定日</label>
          <input id="planned-start-date" type="date" value={plannedStartDate}
            max={completionScheduledDate || deliveryDate || undefined}
            onChange={(e) => setPlannedStartDate(e.target.value)} disabled={saving} />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="customer-id">得意先名</label>
          <select id="customer-id" value={customerId} onChange={(e) => handleCustomerChange(e.target.value)}
            required disabled={mastersLoading || saving}>
            <option value="">得意先名を選択</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customerName}</option>)}
          </select>
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="product-id">製品名</label>
          <select id="product-id" value={productId} onChange={(e) => setProductId(e.target.value)}
            required disabled={!selectedCustomer || mastersLoading || saving}>
            <option value="">{!selectedCustomer ? "先に得意先名を選択" : customerProducts.length ? "製品名を選択" : "該当する製品がありません"}</option>
            {customerProducts.map((product) => <option key={product.id} value={product.id}>{product.productName} / {product.productCode}</option>)}
          </select>
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="product-code">製品コード</label>
          <input id="product-code" type="text" value={productCode} readOnly placeholder="製品を選択すると自動入力" />
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
        <button type="submit" className={styles.submitButton} disabled={saving || mastersLoading || !selectedProduct}>
          {saving ? "登録中…" : "登録"}
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
