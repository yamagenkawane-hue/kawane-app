"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import { MaterialMaster } from "@/app/type";
import styles from "../masterCommon.module.css";

const MATERIAL_SELECT_COLUMNS =
  "id,material_code,material_number,material_name,size,remaining_amount";

const emptyForm = {
  materialCode: "",
  materialNumber: "",
  materialName: "",
  size: "",
  remainingAmount: "",
};

const mapMaterial = (row: any): MaterialMaster => ({
  id: row.id,
  materialCode: row.material_code || "",
  materialNumber: row.material_number || "",
  materialName: row.material_name || "",
  size: row.size || "",
  remainingAmount: Number(row.remaining_amount || 0),
});

export default function MaterialMasterPage() {
  const [items, setItems] = useState<MaterialMaster[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [activeRemainingInput, setActiveRemainingInput] = useState<
    "form" | string | null
  >(null);

  const numpadValue =
    activeRemainingInput === "form"
      ? form.remainingAmount
      : activeRemainingInput
        ? String(
            items.find((item) => item.id === activeRemainingInput)
              ?.remainingAmount || "",
          )
        : "";

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("material_master")
      .select(MATERIAL_SELECT_COLUMNS)
      .order("material_code", { ascending: true });

    if (error) {
      alert("材料マスタの取得に失敗しました");
      return;
    }

    setItems((data || []).map(mapMaterial));
  };

  useEffect(() => {
    void fetchItems();
  }, []);

  const handleAdd = async () => {
    if (!form.materialCode || !form.materialName) {
      alert("材料コードと材料名を入力してください");
      return;
    }

    const { error } = await supabase.from("material_master").insert({
      material_code: form.materialCode,
      material_number: form.materialNumber,
      material_name: form.materialName,
      size: form.size,
      remaining_amount: Number(form.remainingAmount || 0),
    });

    if (error) {
      alert(`材料の追加に失敗しました: ${error.message}`);
      return;
    }

    setForm(emptyForm);
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
    const { error } = await supabase
      .from("material_master")
      .update({
        material_code: item.materialCode,
        material_number: item.materialNumber,
        material_name: item.materialName,
        size: item.size,
        remaining_amount: Number(item.remainingAmount || 0),
      })
      .eq("id", item.id);

    if (error) {
      alert(`材料の保存に失敗しました: ${error.message}`);
      return;
    }

    await fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;

    const { error } = await supabase.from("material_master").delete().eq("id", id);

    if (error) {
      alert(`材料の削除に失敗しました: ${error.message}`);
      return;
    }

    await fetchItems();
  };

  const handleNumpadChange = (value: string) => {
    if (activeRemainingInput === "form") {
      setForm({ ...form, remainingAmount: value });
      return;
    }

    if (activeRemainingInput) {
      updateItem(activeRemainingInput, "remainingAmount", Number(value || 0));
    }
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
            placeholder="材料コード"
            value={form.materialCode}
            onChange={(e) => setForm({ ...form, materialCode: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="材番"
            value={form.materialNumber}
            onChange={(e) =>
              setForm({ ...form, materialNumber: e.target.value })
            }
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
            onFocus={() => setActiveRemainingInput("form")}
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
              <th>材料コード</th>
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
                    "materialNumber",
                    "materialName",
                    "size",
                    "remainingAmount",
                  ] as const
                ).map((field) => (
                  <td key={field}>
                    <input
                      className={styles.tableInput}
                      value={item[field]}
                      onFocus={() => {
                        if (field === "remainingAmount") {
                          setActiveRemainingInput(item.id);
                        }
                      }}
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

      <Numpad
        open={activeRemainingInput !== null}
        value={numpadValue}
        onChange={handleNumpadChange}
        onClose={() => setActiveRemainingInput(null)}
      />
    </div>
  );
}
