"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../../lib/supabase";
import styles from "./page.module.css";
import { CustomerMaster, PostData } from "@/app/type";

type AdjustedPost = PostData & {
  transferSource: string;
  shippingScheduledDate: string;
  scheduledDate?: string;
};

const addDays = (dateText: string, days: number) => {
  const date = dateText ? new Date(dateText) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const OrdersPage = () => {
  const [posts, setPosts] = useState<AdjustedPost[]>([]);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const [postResult, customerResult] = await Promise.all([
          supabase.from("posts").select("*"),
          supabase.from("customer_master").select("*"),
        ]);

        const { data, error } = postResult;

        if (error) throw error;

        const customerList: CustomerMaster[] = (customerResult.data || []).map(
          (row) => ({
            id: row.id,
            customerName: row.customer_name || "",
            shippingOffsetDays: row.shipping_offset_days || 0,
            note: row.note || "",
          }),
        );

        const rawData: PostData[] = (data || []).map((row) => ({
          id: row.id,
          orderNo: row.order_no || "",
          lotNo: row.lot_no || "",
          productName: row.product_name || "",
          customerName: row.customer_name || "",
          orderAmount: row.order_amount || 0,
          remainingAmount: row.remaining_amount || 0,
          status: row.status || "未着手",
          completionScheduledDate:
            row.completion_scheduled_date || row.delivery_date || "",
          deliveryDate: row.delivery_date || "",
          remark: row.remark || "",
          manufacturingAmount: (row.manufacturing_logs || []).reduce(
            (sum: number, log: { amount: number }) => sum + log.amount,
            0,
          ),
          cleaningAmount: (row.cleaning_logs || []).reduce(
            (sum: number, log: { amount: number }) => sum + log.amount,
            0,
          ),
          inspectionAmount: (row.inspection_logs || []).reduce(
            (sum: number, log: { amount: number }) => sum + log.amount,
            0,
          ),
          measurementAmount: (row.measurement_logs || []).reduce(
            (sum: number, log: { amount: number }) => sum + log.amount,
            0,
          ),
          packagingAmount: (row.packaging_logs || []).reduce(
            (sum: number, log: { amount: number }) => sum + log.amount,
            0,
          ),
          manufacturingLogs: row.manufacturing_logs || [],
          cleaningLogs: row.cleaning_logs || [],
          inspectionLogs: row.inspection_logs || [],
          measurementLogs: row.measurement_logs || [],
          packagingLogs: row.packaging_logs || [],
        }));

        // =========================
        // 注残があるものだけ
        // =========================

        const filtered = rawData.filter((post) => {
          const completed = post.packagingAmount || 0;
          return post.orderAmount - completed > 0;
        });

        // =========================
        // 納期順
        // =========================

        filtered.sort(
          (a, b) =>
            new Date(a.deliveryDate).getTime() -
            new Date(b.deliveryDate).getTime(),
        );

        // =========================
        // 余剰使用管理
        // =========================

        const surplusStockMap: Record<string, number> = {};

        // =========================
        // 同一製品の余剰振替
        // =========================

        const adjusted: AdjustedPost[] = filtered.map((post) => {
          const ownCompleted = post.packagingAmount || 0;
          const ownRemaining = post.orderAmount - ownCompleted;
          const customer = customerList.find(
            (item) => item.customerName === post.customerName,
          );
          const shippingScheduledDate = addDays(
            post.deliveryDate,
            -Number(customer?.shippingOffsetDays || 0),
          );

          let remaining = ownRemaining;
          const transferLogs: string[] = [];

          const sameProducts = rawData.filter(
            (item) =>
              item.productName === post.productName && item.id !== post.id,
          );

          for (const item of sameProducts) {
            if (remaining <= 0) break;

            const completed = item.packagingAmount || 0;
            const originalSurplus = completed - item.orderAmount;
            const usedSurplus = surplusStockMap[item.id] || 0;
            const surplus = originalSurplus - usedSurplus;

            if (surplus <= 0) continue;

            const transferAmount = surplus >= remaining ? remaining : surplus;

            remaining -= transferAmount;
            surplusStockMap[item.id] =
              (surplusStockMap[item.id] || 0) + transferAmount;

            transferLogs.push(`${item.orderNo} から ${transferAmount}個`);
          }

          return {
            ...post,
            remainingAmount: remaining > 0 ? remaining : 0,
            shippingScheduledDate,
            transferSource:
              transferLogs.length > 0 ? transferLogs.join(" / ") : "-",
          };
        });

        // 振替後も注残あるものだけ表示
        const visiblePosts = adjusted.filter(
          (post) => post.remainingAmount > 0,
        );

        setPosts(visiblePosts);
      } catch (error) {
        console.error(error);
        alert("データ取得失敗");
      }
    };

    fetchPosts();
  }, []);

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
        </Link>

        <h1 className={styles.title}>注残管理一覧</h1>
      </div>

      {/* テーブル */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>注番</th>
              <th>ロットNo</th>
              <th>製品名</th>
              <th>得意先</th>
              <th>受注数</th>
              <th>完成数</th>
              <th>注残</th>
              <th>振替ロット</th>
              <th>状態</th>
              <th>完了予定日</th>
              <th>納期</th>
              <th>出荷予定日</th>
            </tr>
          </thead>

          <tbody>
            {posts.map((post) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              const delivery = new Date(post.deliveryDate);
              delivery.setHours(0, 0, 0, 0);

              const diffDays = Math.ceil(
                (delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
              );

              let rowClass = "";

              if (diffDays <= 3 && post.remainingAmount > 0) {
                rowClass = styles.dangerRow;
              } else if (diffDays <= 7 && post.remainingAmount > 0) {
                rowClass = styles.warningRow;
              }

              return (
                <tr key={post.id} className={rowClass}>
                  <td>{post.orderNo}</td>
                  <td>{post.lotNo || "-"}</td>
                  <td>{post.productName}</td>
                  <td>{post.customerName}</td>
                  <td>{post.orderAmount}</td>
                  <td>{post.packagingAmount || 0}</td>
                  <td className={styles.remaining}>{post.remainingAmount}</td>
                  <td>{post.transferSource}</td>
                  <td>{post.status}</td>
                  <td>{post.completionScheduledDate || "-"}</td>
                  <td>{post.deliveryDate}</td>
                  <td>{post.scheduledDate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrdersPage;
