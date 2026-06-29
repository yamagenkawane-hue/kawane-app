"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import { InventoryItem } from "@/app/type";
import styles from "../masterCommon.module.css";

type NumpadTarget =
  | { kind: "form"; field: "currentStock" | "allocatedStock" }
  | { kind: "item"; id: string; field: "currentStock" | "allocatedStock" }
  | null;

const INVENTORY_SELECT_COLUMNS =
  "id,product_code,product_name,lot_no,current_stock,allocated_stock,updated_at";

const mapInventoryItem = (row: Record<string, unknown>): InventoryItem => ({
  id: String(row.id || ""),
  productCode: String(row.product_code || ""),
  productName: String(row.product_name || ""),
  lotNo: String(row.lot_no || ""),
  currentStock: Number(row.current_stock || 0),
  allocatedStock: Number(row.allocated_stock || 0),
  updatedAt: String(row.updated_at || ""),
});

export default function InventoryMasterPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [form, setForm] = useState({
    productCode: "",
    productName: "",
    lotNo: "",
    currentStock: 0,
    allocatedStock: 0,
  });
  const [numpadTarget, setNumpadTarget] = useState<NumpadTarget>(null);

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("v_inventory_items_with_master")
      .select(INVENTORY_SELECT_COLUMNS)
      .order("updated_at", { ascending: false });

    if (error) {
      alert("在庫マスタの取得に失敗しました");
      return;
    }

    setItems((data || []).map(mapInventoryItem));
  };

  useEffect(() => {
    const loadItems = async () => {
      const { data, error } = await supabase
        .from("v_inventory_items_with_master")
        .select(INVENTORY_SELECT_COLUMNS)
        .order("updated_at", { ascending: false });

      if (error) {
        alert("在庫マスタの取得に失敗しました");
        return;
      }

      setItems((data || []).map(mapInventoryItem));
    };

    void loadItems();
  }, []);

  const validateStock = (currentStock: number, allocatedStock: number) => {
    if (currentStock < 0 || allocatedStock < 0) {
      alert("現在庫数と引き当て済み数は0以上で入力してください");
      return false;
    }

    if (allocatedStock > currentStock) {
      alert("引き当て済み数は現在庫数以下で入力してください");
      return false;
    }

    return true;
  };

  const handleAdd = async () => {
    if (!form.productName) {
      alert("製品名を入力してください");
      return;
    }

    const currentStock = Number(form.currentStock);
    const allocatedStock = Number(form.allocatedStock);
    if (!validateStock(currentStock, allocatedStock)) return;

    const { error } = await supabase.from("inventory_items").insert({
      product_code: form.productCode,
      product_name: form.productName,
      lot_no: form.lotNo,
      current_stock: currentStock,
      allocated_stock: allocatedStock,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      alert("在庫の追加に失敗しました");
      return;
    }

    setForm({
      productCode: "",
      productName: "",
      lotNo: "",
      currentStock: 0,
      allocatedStock: 0,
    });
    await fetchItems();
    alert("在庫を追加しました");
  };

  const updateItem = (
    id: string,
    field: keyof InventoryItem,
    value: string | number,
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const handleSave = async (item: InventoryItem) => {
    const currentStock = Number(item.currentStock);
    const allocatedStock = Number(item.allocatedStock);
    if (!validateStock(currentStock, allocatedStock)) return;

    const { error } = await supabase
      .from("inventory_items")
      .update({
        product_code: item.productCode,
        product_name: item.productName,
        lot_no: item.lotNo,
        current_stock: currentStock,
        allocated_stock: allocatedStock,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      alert("在庫の保存に失敗しました");
      return;
    }

    await fetchItems();
    alert("在庫を保存しました");
  };

  const handleDelete = async (item: InventoryItem) => {
    const label = item.productName || item.productCode || item.lotNo || "この在庫";
    const allocationNote =
      Number(item.allocatedStock) > 0
        ? "\n引き当て済み数がある在庫です。削除すると引当情報から参照できなくなる可能性があります。"
        : "";

    if (!confirm(`${label} を削除しますか？${allocationNote}`)) return;

    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", item.id);

    if (error) {
      alert("在庫の削除に失敗しました");
      return;
    }

    if (numpadTarget?.kind === "item" && numpadTarget.id === item.id) {
      setNumpadTarget(null);
    }

    await fetchItems();
    alert("在庫を削除しました");
  };

  const currentNumpadValue = () => {
    if (!numpadTarget) return "";
    if (numpadTarget.kind === "form") {
      return String(form[numpadTarget.field] || "");
    }

    const item = items.find((row) => row.id === numpadTarget.id);
    return item ? String(item[numpadTarget.field] || "") : "";
  };

  const handleNumpadChange = (value: string) => {
    const nextValue = Number(value || 0);
    if (!numpadTarget) return;

    if (numpadTarget.kind === "form") {
      setForm((prev) => ({ ...prev, [numpadTarget.field]: nextValue }));
      return;
    }

    updateItem(numpadTarget.id, numpadTarget.field, nextValue);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/masterSettings" className={styles.backButton}>
          ← マスタ設定に戻る
        </Link>
        <h1 className={styles.title}>在庫マスタ</h1>
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
            placeholder="ロットNo"
            value={form.lotNo}
            onChange={(e) => setForm({ ...form, lotNo: e.target.value })}
          />
          <input
            className={styles.input}
            inputMode="numeric"
            placeholder="現在庫数"
            value={form.currentStock}
            onFocus={() =>
              setNumpadTarget({ kind: "form", field: "currentStock" })
            }
            onChange={(e) =>
              setForm({ ...form, currentStock: Number(e.target.value) })
            }
          />
          <input
            className={styles.input}
            inputMode="numeric"
            placeholder="引き当て済み数"
            value={form.allocatedStock}
            onFocus={() =>
              setNumpadTarget({ kind: "form", field: "allocatedStock" })
            }
            onChange={(e) =>
              setForm({ ...form, allocatedStock: Number(e.target.value) })
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
              <th>製品コード</th>
              <th>製品名</th>
              <th>ロットNo</th>
              <th>現在庫数</th>
              <th>引き当て済み数</th>
              <th>引き当て可能数</th>
              <th>更新日時</th>
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
                  <input
                    className={styles.tableInput}
                    value={item.lotNo}
                    onChange={(e) =>
                      updateItem(item.id, "lotNo", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    inputMode="numeric"
                    value={item.currentStock}
                    onFocus={() =>
                      setNumpadTarget({
                        kind: "item",
                        id: item.id,
                        field: "currentStock",
                      })
                    }
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "currentStock",
                        Number(e.target.value),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    inputMode="numeric"
                    value={item.allocatedStock}
                    onFocus={() =>
                      setNumpadTarget({
                        kind: "item",
                        id: item.id,
                        field: "allocatedStock",
                      })
                    }
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "allocatedStock",
                        Number(e.target.value),
                      )
                    }
                  />
                </td>
                <td>
                  {Math.max(
                    0,
                    Number(item.currentStock) - Number(item.allocatedStock),
                  )}
                </td>
                <td>{item.updatedAt ? item.updatedAt.slice(0, 16) : "-"}</td>
                <td className={styles.actionArea}>
                  <button
                    className={styles.saveButton}
                    onClick={() => handleSave(item)}
                  >
                    保存
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={() => handleDelete(item)}
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
        open={numpadTarget !== null}
        value={currentNumpadValue()}
        onChange={handleNumpadChange}
        onClose={() => setNumpadTarget(null)}
      />
    </div>
  );
}
