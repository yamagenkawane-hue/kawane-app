"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { CustomerMaster, ProductMaster } from "@/app/type";
import styles from "../masterCommon.module.css";

export default function ProductMasterPage() {
  const [items, setItems] = useState<ProductMaster[]>([]);
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    productCode: "",
    productName: "",
    customerName: "",
    standard: "",
    unit: "個",
  });

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("v_product_master_with_customer")
      .select("*")
      .order("product_code", { ascending: true });
    if (error) {
      setMessage("製品マスタの取得に失敗しました");
      return;
    }
    setItems(
      (data || []).map((row) => ({
        id: row.id,
        productCode: row.product_code || "",
        productName: row.product_name || "",
        customerName: row.customer_name || "",
        standard: row.standard || "",
        unit: row.unit || "",
      })),
    );
  };

  useEffect(() => {
    const loadItems = async () => {
      const [productResult, customerResult] = await Promise.all([
        supabase
          .from("v_product_master_with_customer")
          .select("*")
          .order("product_code", { ascending: true }),
        supabase
          .from("customer_master")
          .select("*")
          .order("customer_name", { ascending: true }),
      ]);

      const { data, error } = productResult;

      if (error) {
        setMessage("製品マスタの取得に失敗しました");
        return;
      }

      const mappedItems: ProductMaster[] = (data || []).map((row) => ({
        id: row.id,
        productCode: row.product_code || "",
        productName: row.product_name || "",
        customerName: row.customer_name || "",
        standard: row.standard || "",
        unit: row.unit || "",
      }));

      const mappedCustomers: CustomerMaster[] = (customerResult.data || []).map(
        (row) => ({
          id: row.id,
          customerName: row.customer_name || "",
          shippingOffsetDays: row.shipping_offset_days || 0,
          note: row.note || "",
        }),
      );

      setItems(mappedItems);
      setCustomers(mappedCustomers);
    };

    void loadItems();
  }, []);

  const handleAdd = async () => {
    if (!form.productCode || !form.productName || !form.customerName) {
      setMessage("製品コード、製品名、得意先名を入力してください");
      return;
    }
    const { error } = await supabase.from("product_master").insert({
      product_code: form.productCode,
      product_name: form.productName,
      customer_name: form.customerName,
      standard: form.standard,
      unit: form.unit,
    });

    if (error) {
      setMessage(`追加に失敗しました: ${error.message}`);
      return;
    }

    setForm({
      productCode: "",
      productName: "",
      customerName: "",
      standard: "",
      unit: "個",
    });
    await fetchItems();
    setMessage("製品を追加しました");
  };

  const handleBulkSave = async () => {
    const invalid = items.find(
      (item) => !item.productCode || !item.productName || !item.customerName,
    );
    if (invalid) {
      setMessage("未入力の製品コード、製品名、得意先名があります");
      return;
    }

    for (const item of items) {
      const { error } = await supabase
        .from("product_master")
        .update({
          product_code: item.productCode,
          product_name: item.productName,
          customer_name: item.customerName,
          standard: item.standard,
          unit: item.unit,
        })
        .eq("id", item.id);

      if (error) {
        setMessage(`${item.productCode} の保存に失敗しました: ${error.message}`);
        return;
      }
    }

    await fetchItems();
    setMessage("製品マスタを一括保存しました");
  };

  const updateItem = (
    id: string,
    field: keyof ProductMaster,
    value: string,
  ) => {
    setMessage("未保存の変更があります。一括保存を押してください");
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/masterSettings" className={styles.backButton}>
          ← マスタ設定に戻る
        </Link>
        <h1 className={styles.title}>製品マスタ</h1>
      </div>
      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            placeholder="製品コード"
            value={form.productCode}
            onChange={(e) => setForm({ ...form, productCode: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="製品名"
            value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })}
          />
          <select
            className={styles.select}
            value={form.customerName}
            onChange={(e) =>
              setForm({ ...form, customerName: e.target.value })
            }
          >
            <option value="">得意先を選択</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.customerName}>
                {customer.customerName}
              </option>
            ))}
          </select>
          <input
            className={styles.input}
            placeholder="規格"
            value={form.standard}
            onChange={(e) => setForm({ ...form, standard: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="単位"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
        </div>
        <div className={styles.buttonRow}>
          <button className={styles.addButton} onClick={handleAdd}>
            追加
          </button>
          <button className={styles.saveButton} onClick={handleBulkSave}>
            一括保存
          </button>
        </div>
      </div>
      {message && <div className={styles.message}>{message}</div>}
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>製品コード</th>
              <th>製品名</th>
              <th>得意先名</th>
              <th>規格</th>
              <th>単位</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    className={styles.tableInput}
                    value={item.productCode}
                    onChange={(e) =>
                      updateItem(item.id, "productCode", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={item.productName}
                    onChange={(e) =>
                      updateItem(item.id, "productName", e.target.value)
                    }
                  />
                </td>
                <td>
                  <select
                    className={styles.select}
                    value={item.customerName}
                    onChange={(e) =>
                      updateItem(item.id, "customerName", e.target.value)
                    }
                  >
                    <option value="">得意先を選択</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.customerName}>
                        {customer.customerName}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={item.standard}
                    onChange={(e) =>
                      updateItem(item.id, "standard", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={item.unit}
                    onChange={(e) =>
                      updateItem(item.id, "unit", e.target.value)
                    }
                  />
                </td>
                <td className={styles.actionArea}>
                  <button
                    className={styles.deleteButton}
                    onClick={async () => {
                      if (!confirm("削除しますか？")) return;
                      const { error } = await supabase
                        .from("product_master")
                        .delete()
                        .eq("id", item.id);
                      if (error) {
                        setMessage(`削除に失敗しました: ${error.message}`);
                        return;
                      }
                      await fetchItems();
                      setMessage("製品を削除しました");
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
