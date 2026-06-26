"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import styles from "../masterCommon.module.css";

type WeighingResultRow = {
  id?: string | null;
  post_id?: string | null;
  order_no?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  customer_name?: string | null;
  process_name?: string | null;
  date?: string | null;
  amount?: number | string | null;
  created_at?: string | null;
};

type PostLotRow = {
  id?: string | null;
  lot_no?: string | null;
};

type WeighingResultItem = {
  id: string;
  postId: string;
  orderNo: string;
  productCode: string;
  productName: string;
  customerName: string;
  lotNo: string;
  amount: number;
  weighingDate: string;
  createdAt: string;
};

const formatDateTime = (value: string) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ja-JP");
};

export default function WeighingReportPage() {
  const [items, setItems] = useState<WeighingResultItem[]>([]);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    const loadItems = async () => {
      const [resultResponse, postResponse] = await Promise.all([
        supabase
          .from("v_production_results_with_master")
          .select(
            "id,post_id,order_no,product_code,product_name,customer_name,process_name,date,amount,created_at",
          )
          .order("created_at", { ascending: false }),
        supabase.from("posts").select("id,lot_no"),
      ]);

      if (resultResponse.error) {
        alert("計量実績データの取得に失敗しました");
        return;
      }

      if (postResponse.error) {
        alert("受注データの取得に失敗しました");
        return;
      }

      const lotNoMap = new Map(
        ((postResponse.data || []) as PostLotRow[]).map((row) => [
          String(row.id || ""),
          String(row.lot_no || ""),
        ]),
      );

      const mappedItems: WeighingResultItem[] = (
        (resultResponse.data || []) as WeighingResultRow[]
      )
        .filter((row) => String(row.process_name || "").includes("計量"))
        .map((row) => {
          const postId = String(row.post_id || "");

          return {
            id: String(row.id || ""),
            postId,
            orderNo: String(row.order_no || ""),
            productCode: String(row.product_code || ""),
            productName: String(row.product_name || ""),
            customerName: String(row.customer_name || ""),
            lotNo: lotNoMap.get(postId) || "",
            amount: Number(row.amount || 0),
            weighingDate: String(row.date || ""),
            createdAt: String(row.created_at || ""),
          };
        });

      setItems(mappedItems);
    };

    void loadItems();
  }, []);

  const visibleItems = useMemo(() => {
    const lower = keyword.toLowerCase();

    return items.filter(
      (item) =>
        !keyword ||
        item.orderNo.toLowerCase().includes(lower) ||
        item.customerName.toLowerCase().includes(lower) ||
        item.productCode.toLowerCase().includes(lower) ||
        item.productName.toLowerCase().includes(lower) ||
        item.lotNo.toLowerCase().includes(lower),
    );
  }, [items, keyword]);

  const downloadCsv = () => {
    const header = [
      "注番",
      "得意先",
      "製品コード",
      "製品名",
      "数量",
      "ロット番号",
      "計量日",
      "登録日時",
    ];

    const rows = visibleItems.map((item) => [
      item.orderNo,
      item.customerName,
      item.productCode,
      item.productName,
      String(item.amount),
      item.lotNo,
      item.weighingDate || "-",
      formatDateTime(item.createdAt),
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
            placeholder="注番・製品コード・製品名・得意先・ロットNoで検索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
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
              <th>注番</th>
              <th>得意先</th>
              <th>製品コード</th>
              <th>製品名</th>
              <th>数量</th>
              <th>ロット番号</th>
              <th>計量日</th>
              <th>登録日時</th>
            </tr>
          </thead>

          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td>{item.orderNo || "-"}</td>
                <td>{item.customerName || "-"}</td>
                <td>{item.productCode || "-"}</td>
                <td>{item.productName || "-"}</td>
                <td>{item.amount}</td>
                <td>{item.lotNo || "-"}</td>
                <td>{item.weighingDate || "-"}</td>
                <td>{formatDateTime(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}