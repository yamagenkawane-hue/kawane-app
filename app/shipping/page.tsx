"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { subDays } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import { CustomerMaster, Shipment } from "@/app/type";
import styles from "../masterCommon.module.css";

type ShippingPost = {
  lotNo: string;
  rowKey: string;
  id: string;
  postId: string;
  orderNo: string;
  productCode: string;
  productName: string;
  customerName: string;
  orderAmount: number;
  remainingAmount: number;
  status: string;
  deliveryDate: string;
  completionScheduledDate: string;
  shippedAmount: number;
  scheduledDate: string;
};

const STOCK_IN_HISTORY_SELECT_COLUMNS =
  "id,post_id,order_no,lot_no,quantity,created_at,product_code,product_name,customer_name";

const CUSTOMER_SELECT_COLUMNS =
  "id,customer_name,shipping_offset_days,note";

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const mapShipment = (row: Record<string, unknown>): Shipment => ({
  id: String(row.id || ""),
  postId: String(row.post_id || ""),
  orderNo: String(row.order_no || ""),
  customerName: String(row.customer_name || ""),
  productCode: String(row.product_code || ""),
  productName: String(row.product_name || ""),
  lotNo: String(row.lot_no || ""),
  scheduledDate: String(row.scheduled_date || ""),
  deliveryDate: String(row.delivery_date || ""),
  orderAmount: Number(row.order_amount || 0),
  quantity: Number(row.quantity || 0),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

export default function ShippingPage() {
  const [posts, setPosts] = useState<ShippingPost[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipAmounts, setShipAmounts] = useState<Record<string, number>>({});
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [numpadPostId, setNumpadPostId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [completedResult, customerResult, postResult, shipmentResponse] = await Promise.all([
        supabase
          .from("v_process_transfer_history_with_master")
          .select(STOCK_IN_HISTORY_SELECT_COLUMNS)
          .eq("movement_type", "stock_in")
          .order("customer_name", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.from("customer_master").select(CUSTOMER_SELECT_COLUMNS),
        supabase
          .from("v_posts_with_master")
          .select("id,order_amount,delivery_date,completion_scheduled_date")
          .or("delete.is.null,delete.eq.false"),
        fetch("/api/shipments"),
      ]);

      if (completedResult.error) throw completedResult.error;
      if (customerResult.error) throw customerResult.error;
      if (postResult.error) throw postResult.error;
      if (!shipmentResponse.ok) throw new Error("出荷データの取得に失敗しました");

      const customerList: CustomerMaster[] = (customerResult.data || []).map(
        (row) => ({
          id: row.id,
          customerName: row.customer_name || "",
          shippingOffsetDays: Number(row.shipping_offset_days || 0),
          note: row.note || "",
        }),
      );

      const shipmentRows: Shipment[] = (await shipmentResponse.json()).map(mapShipment);
      const shippedByPost = shipmentRows.reduce((acc: Record<string, number>, row) => {
        acc[row.postId] = (acc[row.postId] || 0) + Number(row.quantity || 0);
        return acc;
      }, {});
      const shippedByPostLot = shipmentRows.reduce((acc: Record<string, number>, row) => {
        const key = `${row.postId}:${row.lotNo}`;
        acc[key] = (acc[key] || 0) + Number(row.quantity || 0);
        return acc;
      }, {});
      const postMap = new Map(
        (postResult.data || []).map((row) => [
          String(row.id || ""),
          {
            orderAmount: Number(row.order_amount || 0),
            deliveryDate: String(row.delivery_date || ""),
            completionScheduledDate: String(
              row.completion_scheduled_date || row.delivery_date || "",
            ),
          },
        ]),
      );

      const mappedPosts: ShippingPost[] = (completedResult.data || [])
        .map((row) => {
          const customer = customerList.find(
            (item) => item.customerName === row.customer_name,
          );
          const postId = String(row.post_id || "");
          const post = postMap.get(postId);
          const scheduledDate = formatDate(
            subDays(new Date(post?.deliveryDate || new Date()), customer?.shippingOffsetDays || 0),
          );
          const orderAmount = Number(post?.orderAmount || 0);
          const shippedAmount = Number(shippedByPost[postId] || 0);
          const orderRemainingAmount = Math.max(orderAmount - shippedAmount, 0);
          const lotNo = String(row.lot_no || "");
          const shippedLotAmount = Number(shippedByPostLot[`${postId}:${lotNo}`] || 0);
          const completedQuantity = Number(row.quantity || 0);

          return {
            id: postId,
            rowKey: String(row.id || `${postId}-${lotNo}`),
            postId,
            orderNo: row.order_no || "",
            lotNo,
            productCode: row.product_code || "",
            productName: row.product_name || "",
            customerName: row.customer_name || "",
            orderAmount,
            remainingAmount: Math.min(
              Math.max(completedQuantity - shippedLotAmount, 0),
              orderRemainingAmount,
            ),
            status: "",
            deliveryDate: post?.deliveryDate || "",
            completionScheduledDate: post?.completionScheduledDate || "",
            shippedAmount,
            scheduledDate,
          };
        })
        .filter((post) => post.remainingAmount > 0)
        .sort((a, b) => {
          const customerCompare = a.customerName.localeCompare(b.customerName, "ja");
          return customerCompare || a.scheduledDate.localeCompare(b.scheduledDate);
        });

      setShipments(shipmentRows);
      setPosts(mappedPosts);
    } catch (error) {
      console.error(error);
      alert("出荷データの取得に失敗しました");
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

  const visiblePosts = useMemo(
    () =>
      targetDate
        ? posts.filter((post) => post.scheduledDate === targetDate)
        : posts,
    [posts, targetDate],
  );

  const visibleShipments = useMemo(
    () =>
      (targetDate
        ? shipments.filter((shipment) => shipment.scheduledDate === targetDate)
        : shipments
      ).sort((a, b) => a.customerName.localeCompare(b.customerName, "ja")),
    [shipments, targetDate],
  );

  const exportPdf = () => {
    const doc = new jsPDF();
    autoTable(doc, {
      head: [["出荷予定日", "得意先", "注番", "製品名", "ロットNo", "納期", "受注数", "出荷数"]],
      body: visibleShipments.map((shipment) => [
        shipment.scheduledDate,
        shipment.customerName,
        shipment.orderNo,
        shipment.productName,
        shipment.lotNo,
        shipment.deliveryDate,
        shipment.orderAmount,
        shipment.quantity,
      ]),
    });
    doc.save("出荷リスト.pdf");
  };

  const handleShip = async (post: ShippingPost) => {
    const amount = Number(shipAmounts[post.rowKey] || 0);
    if (amount <= 0) {
      alert("出荷数を入力してください");
      return;
    }
    if (amount > post.remainingAmount) {
      alert("出荷数が注残数を超えています");
      return;
    }
    if (!post.lotNo.trim()) {
      alert("ロットNoが未設定です。注残管理で在庫引当を確定してください");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: post.postId,
          order_no: post.orderNo,
          customer_name: post.customerName,
          product_code: post.productCode,
          product_name: post.productName,
          lot_no: post.lotNo || "",
          scheduled_date: post.scheduledDate,
          delivery_date: post.deliveryDate,
          order_amount: post.orderAmount,
          quantity: amount,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "出荷登録に失敗しました");
      }

      setShipAmounts((prev) => ({ ...prev, [post.rowKey]: 0 }));
      await fetchData();
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? error.message : "出荷登録に失敗しました",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/productionSchedules" className={styles.backButton}>
          ← 生産予定に戻る
        </Link>
        <h1 className={styles.title}>出荷管理</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>

        <div className={styles.buttonRow}>
          <button className={styles.printButton} onClick={() => window.print()}>
            出荷リスト印刷
          </button>
          <button className={styles.csvButton} onClick={exportPdf}>
            PDF出力
          </button>
          <button className={styles.saveButton} onClick={() => setTargetDate("")}>
            全件表示
          </button>
        </div>
      </div>

      {loading && <div className={styles.loading}>読み込み中...</div>}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>出荷予定日</th>
              <th>得意先</th>
              <th>注番</th>
              <th>製品名</th>
              <th>ロットNo</th>
              <th>納期</th>
              <th>受注数</th>
              <th>出荷数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visiblePosts.map((post) => (
              <tr key={post.rowKey}>
                <td>{post.scheduledDate}</td>
                <td>{post.customerName}</td>
                <td>{post.orderNo}</td>
                <td>{post.productName}</td>
                <td>{post.lotNo || "-"}</td>
                <td>{post.deliveryDate}</td>
                <td>{post.orderAmount}</td>
                <td>
                  <input
                    className={styles.tableInput}
                    inputMode="numeric"
                    value={shipAmounts[post.rowKey] || ""}
                    onFocus={() => setNumpadPostId(post.rowKey)}
                    onChange={(e) =>
                      setShipAmounts({
                        ...shipAmounts,
                        [post.rowKey]: Number(e.target.value),
                      })
                    }
                  />
                </td>
                <td className={styles.actionArea}>
                  <button className={styles.saveButton} onClick={() => handleShip(post)}>
                    出荷
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Numpad
        open={numpadPostId !== null}
        value={numpadPostId ? String(shipAmounts[numpadPostId] || "") : ""}
        onChange={(value) => {
          if (!numpadPostId) return;
          setShipAmounts((prev) => ({ ...prev, [numpadPostId]: Number(value || 0) }));
        }}
        onClose={() => setNumpadPostId(null)}
      />
    </div>
  );
}
