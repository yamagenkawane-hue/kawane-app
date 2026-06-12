"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { InventoryItem } from "@/app/type";
import styles from "../masterCommon.module.css";

export default function WeighingReportPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [keyword, setKeyword] = useState("");

  const weighingDate = new Date().toLocaleString("ja-JP");

  useEffect(() => {
    const loadItems = async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        alert("在庫データの取得に失敗しました");
        return;
      }

      const mappedItems: InventoryItem[] = (data || []).map((row) => ({
        id: row.id,
        productCode: row.product_code || "",
        productName: row.product_name || "",
        lotNo: row.lot_no || "",
        currentStock: row.current_stock || 0,
        allocatedStock: row.allocated_stock || 0,
        updatedAt: row.updated_at || "",
      }));

      setItems(mappedItems);
    };

    void loadItems();
  }, []);

  const visibleItems = useMemo(() => {
    const lower = keyword.toLowerCase();

    return items.filter(
      (item) =>
        !keyword ||
        item.productCode.toLowerCase().includes(lower) ||
        item.productName.toLowerCase().includes(lower) ||
        item.lotNo.toLowerCase().includes(lower),
    );
  }, [items, keyword]);

  const downloadCsv = () => {
    const header = ["製品コード", "製品名", "数量", "ロット番号", "計量日"];

    const rows = visibleItems.map((item) => [
      item.productCode,
      item.productName,
      String(item.currentStock),
      item.lotNo,
      weighingDate,
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `weighing-report-${new Date().toISOString().slice(0, 10)}.csv`;

    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
        </Link>

        <h1 className={styles.title}>計量表出力</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            placeholder="製品コード・製品名・ロットNoで検索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />

          <input className={styles.input} value={weighingDate} readOnly />
        </div>

        <div className={styles.buttonRow}>
          <button className={styles.printButton} onClick={() => window.print()}>
            印刷
          </button>

          <button className={styles.csvButton} onClick={downloadCsv}>
            CSV出力
          </button>
        </div>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>製品コード</th>
              <th>製品名</th>
              <th>数量</th>
              <th>ロット番号</th>
              <th>計量日</th>
            </tr>
          </thead>

          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td>{item.productCode}</td>
                <td>{item.productName}</td>
                <td>{item.currentStock}</td>
                <td>{item.lotNo || "-"}</td>
                <td>{weighingDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
