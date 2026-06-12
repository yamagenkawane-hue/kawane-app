"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../../lib/supabase";
import styles from "./page.module.css";
import { CustomerMaster, InventoryAllocation, PostData } from "@/app/type";

type AdjustedPost = PostData & {
  transferSource: string;
  shippingScheduledDate: string;
  scheduledDate?: string;
  allocatedAmount: number;
  allocationConfirmed: boolean;
  availableInventoryAmount: number;
  shippedAmount: number;
};

const addDays = (dateText: string, days: number) => {
  const date = dateText ? new Date(dateText) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const customerNameCollator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
});

const getCustomerSortKey = (customerName: string) =>
  customerName
    .trim()
    .replaceAll(/\s+/g, "")
    .replaceAll("株式会社", "かぶしきがいしゃ")
    .replaceAll("有限会社", "ゆうげんがいしゃ")
    .replaceAll("合同会社", "ごうどうがいしゃ")
    .replaceAll("合資会社", "ごうしがいしゃ")
    .replaceAll("合名会社", "ごうめいがいしゃ");

const compareCustomerName = (a: string, b: string) =>
  customerNameCollator.compare(getCustomerSortKey(a), getCustomerSortKey(b));

const OrdersPage = () => {
  const [posts, setPosts] = useState<AdjustedPost[]>([]);
  const [loadingPostId, setLoadingPostId] = useState("");

  const formatAllocationSource = (allocations: InventoryAllocation[]) => {
    if (allocations.length === 0) return "-";
    return allocations
      .map((allocation) => `${allocation.lotNo}（${allocation.allocatedAmount}個）`)
      .join(" / ");
  };

  const fetchPosts = async () => {
    try {
      const [
        postResult,
        customerResult,
        allocationResult,
        inventoryResult,
        shipmentResult,
      ] = await Promise.all([
          supabase.from("posts").select("*"),
          supabase.from("customer_master").select("*"),
          supabase.from("inventory_allocations").select("*"),
          supabase
            .from("inventory_items")
            .select("product_code,current_stock,allocated_stock"),
          supabase.from("shipments").select("post_id,quantity"),
        ]);

      const { data, error } = postResult;

      if (error) throw error;
      if (allocationResult.error) throw allocationResult.error;
      if (inventoryResult.error) throw inventoryResult.error;
      if (shipmentResult.error) throw shipmentResult.error;

      const customerList: CustomerMaster[] = (customerResult.data || []).map(
        (row) => ({
          id: row.id,
          customerName: row.customer_name || "",
          shippingOffsetDays: row.shipping_offset_days || 0,
          note: row.note || "",
        }),
      );

      const allocations: InventoryAllocation[] = (
        allocationResult.data || []
      ).map((row) => ({
        id: row.id,
        postId: row.post_id || "",
        inventoryItemId: row.inventory_item_id || null,
        productCode: row.product_code || "",
        lotNo: row.lot_no || "",
        allocatedAmount: Number(row.allocated_amount || 0),
        shippedAmount: Number(row.shipped_amount || 0),
        confirmedAt: row.confirmed_at || "",
      }));

      const allocationMap = allocations.reduce(
        (acc: Record<string, InventoryAllocation[]>, allocation) => {
          acc[allocation.postId] = acc[allocation.postId] || [];
          acc[allocation.postId].push(allocation);
          return acc;
        },
        {},
      );

      const availableInventoryMap = new Map<string, number>();
      for (const row of inventoryResult.data || []) {
        const productCode = row.product_code || "";
        const currentStock = Number(row.current_stock || 0);
        const allocatedStock = Number(row.allocated_stock || 0);
        availableInventoryMap.set(
          productCode,
          (availableInventoryMap.get(productCode) || 0) +
            Math.max(0, currentStock - allocatedStock),
        );
      }

      const shippedMap = new Map<string, number>();
      for (const row of shipmentResult.data || []) {
        const postId = row.post_id || "";
        shippedMap.set(postId, (shippedMap.get(postId) || 0) + Number(row.quantity || 0));
      }

      const rawData: PostData[] = (data || []).map((row) => ({
          id: row.id,
          orderNo: row.order_no || "",
          lotNo: row.lot_no || "",
          productCode: row.product_code || "",
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
        const shippedAmount = shippedMap.get(post.id) || 0;
        return post.orderAmount - completed > 0 && shippedAmount < post.orderAmount;
      });

      // =========================
      // 納期順（同一納期は得意先昇順）
      // =========================

      filtered.sort((a, b) => {
        const deliveryCompare =
          new Date(a.deliveryDate).getTime() -
          new Date(b.deliveryDate).getTime();
        if (deliveryCompare !== 0) return deliveryCompare;
        return compareCustomerName(a.customerName, b.customerName);
      });

      const adjusted: AdjustedPost[] = filtered.map((post) => {
        const completed = post.packagingAmount || 0;
        const ownRemaining = post.orderAmount - completed;
        const customer = customerList.find(
          (item) => item.customerName === post.customerName,
        );
        const shippingScheduledDate = addDays(
          post.deliveryDate,
          -Number(customer?.shippingOffsetDays || 0),
        );
        const postAllocations = allocationMap[post.id] || [];
        const allocatedAmount = postAllocations.reduce(
          (sum, allocation) => sum + allocation.allocatedAmount,
          0,
        );
        const shippedAmount = shippedMap.get(post.id) || 0;
        const availableInventoryAmount = availableInventoryMap.get(
          post.productCode || "",
        ) || 0;

        return {
          ...post,
          remainingAmount: Math.max(0, ownRemaining - allocatedAmount),
          shippingScheduledDate,
          transferSource: formatAllocationSource(postAllocations),
          allocatedAmount,
          allocationConfirmed: postAllocations.length > 0,
          availableInventoryAmount,
          shippedAmount,
        };
      });

      const visiblePosts = adjusted
        .filter(
          (post) =>
            post.shippedAmount < post.orderAmount &&
            (post.remainingAmount > 0 || post.allocationConfirmed),
        )
        .sort((a, b) => {
          const deliveryCompare =
            new Date(a.deliveryDate).getTime() -
            new Date(b.deliveryDate).getTime();
          if (deliveryCompare !== 0) return deliveryCompare;
          return compareCustomerName(a.customerName, b.customerName);
        });

      setPosts(visiblePosts);
    } catch (error) {
      console.error(error);
      alert("データ取得失敗");
    }
  };

  useEffect(() => {
    const loadPosts = async () => {
      await fetchPosts();
    };

    void loadPosts();
  }, []);

  const handleConfirmAllocation = async (post: AdjustedPost) => {
    if (post.allocationConfirmed) return;
    if (!confirm(`${post.orderNo} の在庫引当を確定しますか？`)) return;

    try {
      setLoadingPostId(post.id);
      const { error } = await supabase.rpc("confirm_inventory_allocation", {
        p_post_id: post.id,
      });

      if (error) throw error;
      await fetchPosts();
      alert("在庫引当を確定しました");
    } catch (error) {
      console.error(error);
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "在庫引当の確定に失敗しました";
      alert(
        message,
      );
    } finally {
      setLoadingPostId("");
    }
  };

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
              <th>在庫引当</th>
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
                  <td>{post.shippingScheduledDate}</td>
                  <td>
                    {post.allocationConfirmed ? (
                      <span className={styles.confirmedBadge}>確定済み</span>
                    ) : post.availableInventoryAmount > 0 ? (
                      <button
                        className={styles.confirmButton}
                        disabled={loadingPostId === post.id}
                        onClick={() => handleConfirmAllocation(post)}
                      >
                        {loadingPostId === post.id ? "処理中" : "確定"}
                      </button>
                    ) : (
                      <span className={styles.noInventoryText}>在庫なし</span>
                    )}
                  </td>
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
