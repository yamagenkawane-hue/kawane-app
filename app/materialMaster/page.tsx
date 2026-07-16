"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { MaterialMaster } from "@/app/type";
import styles from "../masterCommon.module.css";

const MATERIAL_SELECT_COLUMNS =
  "id,material_code,material_name,size,remaining_amount";

export default function MaterialMasterPage() {
  const [items, setItems] = useState<MaterialMaster[]>([]);
  const [form, setForm] = useState({
    materialCode: "",
    materialName: "",
    size: "",
    remainingAmount: "",
  });

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("material_master")
      .select(MATERIAL_SELECT_COLUMNS)
      .order("material_code", { ascending: true });
    if (error) {
      alert("材料マスタの取得に失敗しました");
      return;
    }
    setItems(
      (data || []).map((row) => ({
        id: row.id,
        materialCode: row.material_code || "",
        materialName: row.material_name || "",
        size: row.size || "",
        remainingAmount: Number(row.remaining_amount || 0),
      })),
    );
  };

  useEffect(() => {
    const loadItems = async () => {
      const { data, error } = await supabase
        .from("material_master")
        .select(MATERIAL_SELECT_COLUMNS)
        .order("material_code", {
          ascending: true,
        });

      if (error) {
        alert("材料マスタの取得に失敗しました");
        return;
      }

      const mappedItems: MaterialMaster[] = (data || []).map((row) => ({
        id: row.id,
        materialCode: row.material_code || "",
        materialName: row.material_name || "",
        size: row.size || "",
        remainingAmount: Number(row.remaining_amount || 0),
      }));

      setItems(mappedItems);
    };

    void loadItems();
  }, []);

  const handleAdd = async () => {
    if (!form.materialCode || !form.materialName) {
      alert("材番と材料名を入力してください");
      return;
    }
    await supabase.from("material_master").insert({
      material_code: form.materialCode,
      material_name: form.materialName,
      size: form.size,
      remaining_amount: Number(form.remainingAmount || 0),
    });
    setForm({
      materialCode: "",
      materialName: "",
      size: "",
      remainingAmount: "",
    });
    await fetchItems();
  };

  const updateItem = (
    id: string,
    field: keyof MaterialMaster,
    value: string | number,
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const handleSave = async (item: MaterialMaster) => {
    await supabase
      .from("material_master")
      .update({
        material_code: item.materialCode,
        material_name: item.materialName,
        size: item.size,
        remaining_amount: Number(item.remainingAmount || 0),
      })
      .eq("id", item.id);
    await fetchItems();
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/masterSettings" className={styles.backButton}>
          ← マスタ設定に戻る
        </Link>
        <h1 className={styles.title}>材料マスタ</h1>
      </div>
      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            placeholder="材番"
            value={form.materialCode}
            onChange={(e) => setForm({ ...form, materialCode: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="材料名"
            value={form.materialName}
            onChange={(e) => setForm({ ...form, materialName: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="サイズ"
            value={form.size}
            onChange={(e) => setForm({ ...form, size: e.target.value })}
          />
          <input
            className={styles.input}
            inputMode="decimal"
            placeholder="残量"
            value={form.remainingAmount}
            onChange={(e) =>
              setForm({ ...form, remainingAmount: e.target.value })
            }
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
              <th>材番</th>
              <th>材料名</th>
              <th>サイズ</th>
              <th>残量</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                {(
                  [
                    "materialCode",
                    "materialName",
                    "size",
                    "remainingAmount",
                  ] as const
                ).map((field) => (
                  <td key={field}>
                    <input
                      className={styles.tableInput}
                      value={item[field]}
                      onChange={(e) =>
                        updateItem(
                          item.id,
                          field,
                          field === "remainingAmount"
                            ? Number(e.target.value || 0)
                            : e.target.value,
                        )
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
                        .from("material_master")
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
