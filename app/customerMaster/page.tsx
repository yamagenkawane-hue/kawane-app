"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { CustomerMaster } from "@/app/type";
import styles from "../masterCommon.module.css";

export default function CustomerMasterPage() {
  const [items, setItems] = useState<CustomerMaster[]>([]);
  const [form, setForm] = useState({
    customerName: "",
    shippingOffsetDays: 0,
    note: "",
  });
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("customer_master")
        .select("*")
        .order("customer_name", { ascending: true });
      if (error) throw error;
      setItems(
        (data || []).map((row) => ({
          id: row.id,
          customerName: row.customer_name || "",
          shippingOffsetDays: row.shipping_offset_days || 0,
          note: row.note || "",
        })),
      );
    } catch (error) {
      console.error(error);
      alert("得意先マスタの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadItems = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("customer_master")
          .select("*")
          .order("customer_name", {
            ascending: true,
          });

        if (error) {
          throw error;
        }

        const mappedItems: CustomerMaster[] = (data || []).map((row) => ({
          id: row.id,
          customerName: row.customer_name || "",
          shippingOffsetDays: row.shipping_offset_days || 0,
          note: row.note || "",
        }));

        setItems(mappedItems);
      } catch (error) {
        console.error(error);
        alert("得意先マスタの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };

    void loadItems();
  }, []);

  const handleAdd = async () => {
    if (!form.customerName) {
      alert("得意先名を入力してください");
      return;
    }

    const { error } = await supabase.from("customer_master").insert({
      customer_name: form.customerName,
      shipping_offset_days: Number(form.shippingOffsetDays),
      note: form.note,
    });
    if (error) {
      alert("登録に失敗しました");
      return;
    }
    setForm({ customerName: "", shippingOffsetDays: 0, note: "" });
    await fetchItems();
  };

  const handleSave = async (item: CustomerMaster) => {
    const { error } = await supabase
      .from("customer_master")
      .update({
        customer_name: item.customerName,
        shipping_offset_days: Number(item.shippingOffsetDays),
        note: item.note,
      })
      .eq("id", item.id);
    if (error) alert("保存に失敗しました");
    await fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    await supabase.from("customer_master").delete().eq("id", id);
    await fetchItems();
  };

  const updateItem = (
    id: string,
    field: keyof CustomerMaster,
    value: string | number,
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
        <h1 className={styles.title}>得意先マスタ</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            placeholder="得意先名"
            value={form.customerName}
            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
          />
          <input
            className={styles.input}
            type="number"
            placeholder="納期の何日前に出荷"
            value={form.shippingOffsetDays}
            onChange={(e) =>
              setForm({ ...form, shippingOffsetDays: Number(e.target.value) })
            }
          />
          <input
            className={styles.input}
            placeholder="備考"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <div className={styles.buttonRow}>
          <button className={styles.addButton} onClick={handleAdd}>
            追加
          </button>
        </div>
      </div>

      {loading && <div className={styles.loading}>読み込み中...</div>}
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>得意先名</th>
              <th>出荷日ルール</th>
              <th>備考</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    className={styles.tableInput}
                    value={item.customerName}
                    onChange={(e) =>
                      updateItem(item.id, "customerName", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    type="number"
                    value={item.shippingOffsetDays}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "shippingOffsetDays",
                        Number(e.target.value),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={item.note}
                    onChange={(e) =>
                      updateItem(item.id, "note", e.target.value)
                    }
                  />
                </td>
                <td className={styles.actionArea}>
                  <button
                    className={styles.saveButton}
                    onClick={() => handleSave(item)}
                  >
                    保存
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={() => handleDelete(item.id)}
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
