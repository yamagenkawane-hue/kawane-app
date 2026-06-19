"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { OrderProcess, ProductProcess } from "@/app/type";
import styles from "../masterCommon.module.css";

type OutsourceRow = OrderProcess & {
  deliveryDate: string;
  remainingAmount: number;
  outsourcing: boolean;
};

const mapOrderProcess = (row: Record<string, unknown>): OutsourceRow => {
  const plannedAmount = Number(row.planned_amount || 0);
  const completedAmount = Number(row.completed_amount || 0);

  return {
    id: String(row.id || ""),
    postId: String(row.post_id || ""),
    productId: row.product_id ? String(row.product_id) : "",
    customerId: row.customer_id ? String(row.customer_id) : "",
    productProcessId: row.product_process_id
      ? String(row.product_process_id)
      : "",
    orderNo: String(row.order_no || ""),
    productCode: String(row.product_code || ""),
    productName: String(row.product_name || ""),
    customerName: String(row.customer_name || ""),
    processName: String(row.process_name || ""),
    processOrder: Number(row.process_order || 0),
    plannedAmount,
    completedAmount,
    completedDate: String(row.completed_date || ""),
    subcontractorId: row.subcontractor_id ? String(row.subcontractor_id) : null,
    subcontractorName: String(row.subcontractor_name || ""),
    locked: Boolean(row.locked || false),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    deliveryDate: String(row.delivery_date || ""),
    remainingAmount: Math.max(plannedAmount - completedAmount, 0),
    outsourcing: false,
  };
};

const mapProductProcess = (row: Record<string, unknown>): ProductProcess => ({
  id: String(row.id || ""),
  productId: row.product_id ? String(row.product_id) : "",
  productCode: String(row.product_code || ""),
  processName: String(row.process_name || ""),
  processOrder: Number(row.process_order || 0),
  subcontractorId: row.subcontractor_id ? String(row.subcontractor_id) : null,
  subcontractorName: String(row.subcontractor_name || ""),
  outsourcing: Boolean(row.outsourcing || false),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const isSameProcess = (process: OutsourceRow, master: ProductProcess) => {
  if (process.productProcessId && process.productProcessId === master.id) {
    return true;
  }

  const sameProduct =
    (process.productId && process.productId === master.productId) ||
    process.productCode === master.productCode;

  return (
    sameProduct &&
    process.processOrder === master.processOrder &&
    process.processName === master.processName
  );
};

export default function OutsourcingPage() {
  const [rows, setRows] = useState<OutsourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [orderProcessResult, productProcessResponse] = await Promise.all([
        supabase
          .from("v_order_processes_with_master")
          .select("*")
          .order("delivery_date", { ascending: true })
          .order("customer_name", { ascending: true })
          .order("process_order", { ascending: true }),
        fetch("/api/masters/product-processes"),
      ]);

      if (orderProcessResult.error) throw orderProcessResult.error;
      if (!productProcessResponse.ok) {
        throw new Error("product process fetch failed");
      }

      const productProcesses: ProductProcess[] = (
        await productProcessResponse.json()
      ).map(mapProductProcess);
      const outsourcingMasters = productProcesses.filter(
        (process) => process.outsourcing,
      );

      const mappedRows = (orderProcessResult.data || [])
        .map(mapOrderProcess)
        .map((process) => {
          const master = outsourcingMasters.find((item) =>
            isSameProcess(process, item),
          );

          return {
            ...process,
            subcontractorName:
              process.subcontractorName || master?.subcontractorName || "",
            outsourcing: Boolean(master),
          };
        })
        .filter((process) => process.outsourcing)
        .sort((a, b) => {
          const deliveryCompare = a.deliveryDate.localeCompare(b.deliveryDate);
          const customerCompare = a.customerName.localeCompare(
            b.customerName,
            "ja",
          );
          return (
            deliveryCompare ||
            customerCompare ||
            a.orderNo.localeCompare(b.orderNo) ||
            a.processOrder - b.processOrder
          );
        });

      setRows(mappedRows);
    } catch (error) {
      console.error(error);
      alert("外注工程データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchData();
    };

    void loadData();
  }, []);

  const visibleRows = useMemo(
    () => rows.filter((row) => showCompleted || row.remainingAmount > 0),
    [rows, showCompleted],
  );

  const summary = useMemo(
    () => ({
      total: visibleRows.length,
      remaining: visibleRows.reduce(
        (sum, row) => sum + Number(row.remainingAmount || 0),
        0,
      ),
      completed: rows.filter((row) => row.remainingAmount === 0).length,
    }),
    [rows, visibleRows],
  );

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          トップへ戻る
        </Link>
        <h1 className={styles.title}>外注管理</h1>
        <div className={styles.buttonRow}>
          <Link href="/productionResults" className={styles.backButton}>
            実績登録へ
          </Link>
          <Link href="/orderProcesses" className={styles.backButton}>
            工程編集へ
          </Link>
        </div>
      </div>

      <div className={styles.summaryCard}>
        <div>
          <span>表示件数</span>
          <strong>{summary.total}</strong>
        </div>
        <div>
          <span>外注残数量</span>
          <strong>{summary.remaining}</strong>
        </div>
        <div>
          <span>完了工程</span>
          <strong>{summary.completed}</strong>
        </div>
        <label>
          <span>表示条件</span>
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />{" "}
          完了済みも表示
        </label>
      </div>

      {loading && <div className={styles.loading}>読み込み中...</div>}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>納期</th>
              <th>注番</th>
              <th>得意先</th>
              <th>製品</th>
              <th>工程</th>
              <th>外注先</th>
              <th>予定数</th>
              <th>完了数</th>
              <th>残数</th>
              <th>完了日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>{row.deliveryDate || "-"}</td>
                <td>{row.orderNo}</td>
                <td>{row.customerName}</td>
                <td>
                  {row.productCode} / {row.productName}
                </td>
                <td>
                  {row.processOrder}. {row.processName}
                </td>
                <td>{row.subcontractorName || "-"}</td>
                <td>{row.plannedAmount}</td>
                <td>{row.completedAmount}</td>
                <td>{row.remainingAmount}</td>
                <td>{row.completedDate || "-"}</td>
                <td className={styles.actionArea}>
                  <Link className={styles.backButton} href="/productionResults">
                    実績
                  </Link>
                  <Link className={styles.backButton} href="/orderProcesses">
                    編集
                  </Link>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={11}>外注工程はありません</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
