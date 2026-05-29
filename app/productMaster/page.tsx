"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { ProductMaster } from "@/app/type";
import styles from "../masterCommon.module.css";

export default function ProductMasterPage() {
  const [items, setItems] = useState<ProductMaster[]>([]);
  const [form, setForm] = useState({
    productCode: "",
    productName: "",
    standard: "",
    unit: "個",
  });

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("product_master")
      .select("*")
      .order("product_code", { ascending: true });
    if (error) {
      alert("製品マスタの取得に失敗しました");
      return;
    }
    setItems(
      (data || []).map((row) => ({
        id: row.id,
        productCode: row.product_code || "",
        productName: row.product_name || "",
        standard: row.standard || "",
        unit: row.unit || "",
      })),
    );
  };

  useEffect(() => {
    const loadItems = async () => {
      const { data, error } = await supabase
        .from("product_master")
        .select("*")
        .order("product_code", { ascending: true });

      if (error) {
        alert("製品マスタの取得に失敗しました");
        return;
      }

      const mappedItems: ProductMaster[] = (data || []).map((row) => ({
        id: row.id,
        productCode: row.product_code || "",
        productName: row.product_name || "",
        standard: row.standard || "",
        unit: row.unit || "",
      }));

      setItems(mappedItems);
    };

    void loadItems();
  }, []);

  const handleAdd = async () => {
    if (!form.productCode || !form.productName) {
      alert("製品コードと製品名を入力してください");
      return;
    }
    await supabase.from("product_master").insert({
      product_code: form.productCode,
      product_name: form.productName,
      standard: form.standard,
      unit: form.unit,
    });
    setForm({ productCode: "", productName: "", standard: "", unit: "個" });
    await fetchItems();
  };

  const handleSave = async (item: ProductMaster) => {
    await supabase
      .from("product_master")
      .update({
        product_code: item.productCode,
        product_name: item.productName,
        standard: item.standard,
        unit: item.unit,
      })
      .eq("id", item.id);
    await fetchItems();
  };

  const updateItem = (
    id: string,
    field: keyof ProductMaster,
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/settings" className={styles.backButton}>
          ← 設定へ戻る
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
        </div>
      </div>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>製品コード</th>
              <th>製品名</th>
              <th>規格</th>
              <th>単位</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                {(
                  ["productCode", "productName", "standard", "unit"] as const
                ).map((field) => (
                  <td key={field}>
                    <input
                      className={styles.tableInput}
                      value={item[field]}
                      onChange={(e) =>
                        updateItem(item.id, field, e.target.value)
                      }
                    />
                  </td>
                ))}
                <td className={styles.actionArea}>
                  <button
                    className={styles.saveButton}
                    onClick={() => handleSave(item)}
                  >
                    保存
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={async () => {
                      if (!confirm("削除しますか？")) return;
                      await supabase
                        .from("product_master")
                        .delete()
                        .eq("id", item.id);
                      await fetchItems();
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
