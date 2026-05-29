"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { CustomerMaster, PostData } from "@/app/type";
import styles from "../masterCommon.module.css";

type ShippingPost = PostData & {
  productCode: string;
  packagingAmount: number;
  shippedAmount: number;
  scheduledDate: string;
};

const addDays = (dateText: string, days: number) => {
  const date = dateText ? new Date(dateText) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export default function ShippingPage() {
  const [posts, setPosts] = useState<ShippingPost[]>([]);
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);
  const [shipAmounts, setShipAmounts] = useState<Record<string, number>>({});
  const [targetDate, setTargetDate] = useState("");

  const fetchData = async () => {
    const [postResult, customerResult, shipmentResult] = await Promise.all([
      supabase.from("posts").select("*").order("delivery_date"),
      supabase.from("customer_master").select("*"),
      supabase.from("shipment_records").select("*"),
    ]);

    if (postResult.error) {
      alert("注残データの取得に失敗しました");
      return;
    }

    const customerList: CustomerMaster[] = (customerResult.data || []).map(
      (row) => ({
        id: row.id,
        customerName: row.customer_name || "",
        shippingOffsetDays: row.shipping_offset_days || 0,
        note: row.note || "",
      }),
    );
    setCustomers(customerList);

    const shippedMap = (shipmentResult.data || []).reduce(
      (acc: Record<string, number>, row) => {
        acc[row.post_id] = (acc[row.post_id] || 0) + Number(row.shipped_amount || 0);
        return acc;
      },
      {},
    );

    setPosts(
      (postResult.data || [])
        .filter((row) => row.delete !== true)
        .map((row) => {
          const packagingAmount = (row.packaging_logs || []).reduce(
            (sum: number, log: { amount: number }) => sum + Number(log.amount || 0),
            0,
          );
          const customer = customerList.find(
            (item) => item.customerName === row.customer_name,
          );
          const scheduledDate = addDays(
            row.delivery_date,
            -Number(customer?.shippingOffsetDays || 0),
          );

          return {
            id: row.id,
            orderNo: row.order_no || "",
            lotNo: row.lot_no || "",
            productCode: row.product_code || "",
            productName: row.product_name || "",
            customerName: row.customer_name || "",
            orderAmount: row.order_amount || 0,
            remainingAmount:
              Number(row.order_amount || 0) - Number(shippedMap[row.id] || 0),
            status: row.status || "",
            deliveryDate: row.delivery_date || "",
            completionScheduledDate:
              row.completion_scheduled_date || row.delivery_date || "",
            packagingAmount,
            shippedAmount: Number(shippedMap[row.id] || 0),
            scheduledDate,
          };
        })
        .filter((post) => post.remainingAmount > 0)
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    );
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

  const handleShip = async (post: ShippingPost) => {
    const amount = Number(shipAmounts[post.id] || 0);
    if (amount <= 0) {
      alert("出荷数を入力してください");
      return;
    }

    const shippedAmount = Math.min(amount, post.remainingAmount);
    const carryoverAmount = Math.max(0, post.remainingAmount - shippedAmount);

    const { data: inventory } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("product_name", post.productName)
      .eq("lot_no", post.lotNo || "")
      .maybeSingle();

    if (inventory) {
      await supabase
        .from("inventory_items")
        .update({
          current_stock: Math.max(
            0,
            Number(inventory.current_stock || 0) - shippedAmount,
          ),
          updated_at: new Date().toISOString(),
        })
        .eq("id", inventory.id);
    }

    const { error } = await supabase.from("shipment_records").insert({
      post_id: post.id,
      product_code: post.productCode,
      product_name: post.productName,
      lot_no: post.lotNo || "",
      customer_name: post.customerName,
      scheduled_date: post.scheduledDate,
      shipped_date: new Date().toISOString().slice(0, 10),
      shipped_amount: shippedAmount,
      carryover_amount: carryoverAmount,
    });

    if (error) {
      alert("出荷登録に失敗しました");
      return;
    }

    setShipAmounts((prev) => ({ ...prev, [post.id]: 0 }));
    await fetchData();
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
          <button className={styles.saveButton} onClick={() => setTargetDate("")}>
            全件表示
          </button>
        </div>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>出荷予定日</th>
              <th>得意先</th>
              <th>注番</th>
              <th>製品名</th>
              <th>ロットNo</th>
              <th>受注数</th>
              <th>出荷済</th>
              <th>出荷残</th>
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
                <td>{post.orderAmount}</td>
                <td>{post.shippedAmount}</td>
                <td>{post.remainingAmount}</td>
                <td>
                  <input
                    className={styles.tableInput}
                    type="number"
                    value={shipAmounts[post.id] || ""}
                    onChange={(e) =>
                      setShipAmounts({
                        ...shipAmounts,
                        [post.id]: Number(e.target.value),
                      })
                    }
                  />
                </td>
                <td className={styles.actionArea}>
                  <button
                    className={styles.saveButton}
                    onClick={() => handleShip(post)}
                  >
                    出荷
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
