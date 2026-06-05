"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { subDays } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import { CustomerMaster, PostData, Shipment } from "@/app/type";
import styles from "../masterCommon.module.css";

type ShippingPost = PostData & {
  productCode: string;
  shippedAmount: number;
  scheduledDate: string;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const mapShipment = (row: Record<string, any>): Shipment => ({
  id: row.id,
  postId: row.post_id || "",
  orderNo: row.order_no || "",
  customerName: row.customer_name || "",
  productCode: row.product_code || "",
  productName: row.product_name || "",
  lotNo: row.lot_no || "",
  scheduledDate: row.scheduled_date || "",
  deliveryDate: row.delivery_date || "",
  orderAmount: Number(row.order_amount || 0),
  quantity: Number(row.quantity || 0),
  createdAt: row.created_at || "",
  updatedAt: row.updated_at || "",
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

      const [postResult, customerResult, shipmentResponse] = await Promise.all([
        supabase.from("posts").select("*").order("customer_name", { ascending: true }),
        supabase.from("customer_master").select("*"),
        fetch("/api/shipments"),
      ]);

      if (postResult.error) throw postResult.error;
      if (customerResult.error) throw customerResult.error;
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
      const shippedMap = shipmentRows.reduce((acc: Record<string, number>, row) => {
        acc[row.postId] = (acc[row.postId] || 0) + Number(row.quantity || 0);
        return acc;
      }, {});

      const mappedPosts: ShippingPost[] = (postResult.data || [])
        .filter((row) => row.delete !== true)
        .map((row) => {
          const customer = customerList.find(
            (item) => item.customerName === row.customer_name,
          );
          const scheduledDate = formatDate(
            subDays(new Date(row.delivery_date || new Date()), customer?.shippingOffsetDays || 0),
          );
          const orderAmount = Number(row.order_amount || 0);
          const shippedAmount = Number(shippedMap[row.id] || 0);

          return {
            id: row.id,
            orderNo: row.order_no || "",
            lotNo: row.lot_no || "",
            productCode: row.product_code || "",
            productName: row.product_name || "",
            customerName: row.customer_name || "",
            orderAmount,
            remainingAmount: orderAmount - shippedAmount,
            status: row.status || "",
            deliveryDate: row.delivery_date || "",
            completionScheduledDate: row.completion_scheduled_date || row.delivery_date || "",
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
    void fetchData();
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
    const amount = Number(shipAmounts[post.id] || 0);
    if (amount <= 0) {
      alert("出荷数を入力してください");
      return;
    }
    if (amount > post.remainingAmount) {
      alert("出荷数が注残数を超えています");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: post.id,
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

      if (!response.ok) throw new Error("出荷登録に失敗しました");

      setShipAmounts((prev) => ({ ...prev, [post.id]: 0 }));
      await fetchData();
    } catch (error) {
      console.error(error);
      alert("出荷登録に失敗しました。在庫RPC deduct_inventory の作成も確認してください");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
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
              <tr key={post.id}>
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
                    value={shipAmounts[post.id] || ""}
                    onFocus={() => setNumpadPostId(post.id)}
                    onChange={(e) =>
                      setShipAmounts({
                        ...shipAmounts,
                        [post.id]: Number(e.target.value),
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
