"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { MaterialMaster } from "@/app/type";
import styles from "../masterCommon.module.css";

export default function MaterialMasterPage() {
  const [items, setItems] = useState<MaterialMaster[]>([]);
  const [form, setForm] = useState({
    materialCode: "",
    materialName: "",
    supplierName: "",
    unit: "kg",
  });

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("material_master")
      .select("*")
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
        supplierName: row.supplier_name || "",
        unit: row.unit || "",
      })),
    );
  };

  useEffect(() => {
    const loadItems = async () => {
      const { data, error } = await supabase
        .from("material_master")
        .select("*")
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
        supplierName: row.supplier_name || "",
        unit: row.unit || "",
      }));

      setItems(mappedItems);
    };

    void loadItems();
  }, []);

  const handleAdd = async () => {
    if (!form.materialCode || !form.materialName) {
      alert("材料コードと材料名を入力してください");
      return;
    }
    await supabase.from("material_master").insert({
      material_code: form.materialCode,
      material_name: form.materialName,
      supplier_name: form.supplierName,
      unit: form.unit,
    });
    setForm({
      materialCode: "",
      materialName: "",
      supplierName: "",
      unit: "kg",
    });
    await fetchItems();
  };

  const updateItem = (
    id: string,
    field: keyof MaterialMaster,
    value: string,
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
        supplier_name: item.supplierName,
        unit: item.unit,
      })
      .eq("id", item.id);
    await fetchItems();
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/settings" className={styles.backButton}>
          ← 設定へ戻る
        </Link>
        <h1 className={styles.title}>材料マスタ</h1>
      </div>
      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            placeholder="材料コード"
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
            placeholder="仕入先"
            value={form.supplierName}
            onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
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
              <th>材料コード</th>
              <th>材料名</th>
              <th>仕入先</th>
              <th>単位</th>
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
                    "supplierName",
                    "unit",
                  ] as const
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
