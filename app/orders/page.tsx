"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../../lib/supabase";
import styles from "./page.module.css";
import { CustomerMaster, InventoryAllocation, PostData } from "@/app/type";
import {
  buildFinalProcessCompletionMap,
  buildOrderProcessProgressMap,
  buildOutsourceStatusMap,
  buildProductionResultProgressMap,
  createEmptyProcessProgress,
  sumProcessLogs,
} from "@/app/utills/processProgress";

type AdjustedPost = PostData & {
  transferSource: string;
  shippingScheduledDate: string;
  scheduledDate?: string;
  allocatedAmount: number;
  allocationConfirmed: boolean;
  availableInventoryAmount: number;
  shippedAmount: number;
};

const POST_SELECT_COLUMNS =
  "id,delete,order_no,lot_no,product_code,product_name,customer_name,order_amount,remaining_amount,status,completion_scheduled_date,delivery_date,remark";

const CUSTOMER_SELECT_COLUMNS =
  "id,customer_name,shipping_offset_days,note";

const ALLOCATION_SELECT_COLUMNS =
  "id,post_id,inventory_item_id,product_code,lot_no,allocated_amount,shipped_amount,confirmed_at";

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
  const [deletingPostId, setDeletingPostId] = useState("");

  const formatAllocationSource = useCallback((allocations: InventoryAllocation[]) => {
    if (allocations.length === 0) return "-";
    return allocations
      .map((allocation) => `${allocation.lotNo}（${allocation.allocatedAmount}個）`)
      .join(" / ");
  }, []);

  const fetchPosts = useCallback(async () => {
    try {
      const [
        postResult,
        customerResult,
        allocationResult,
        inventoryResult,
        shipmentResult,
        orderProcessResult,
        productionResult,
      ] = await Promise.all([
          supabase.from("v_posts_with_master").select(POST_SELECT_COLUMNS),
          supabase.from("customer_master").select(CUSTOMER_SELECT_COLUMNS),
          supabase
            .from("v_inventory_allocations_with_master")
            .select(ALLOCATION_SELECT_COLUMNS),
          supabase
            .from("v_inventory_items_with_master")
            .select("product_code,current_stock,allocated_stock"),
          supabase.from("v_shipments_with_master").select("post_id,quantity"),
          supabase
            .from("v_order_processes_with_master")
            .select(
              "post_id,process_name,process_order,planned_amount,completed_amount,completed_date,subcontractor_id,outsource_status,outsource_sent_date,outsource_returned_date",
            ),
          supabase
            .from("v_production_results_with_master")
            .select("post_id,process_name,date,amount"),
        ]);

      const { data, error } = postResult;

      if (error) throw error;
      if (allocationResult.error) throw allocationResult.error;
      if (inventoryResult.error) throw inventoryResult.error;
      if (shipmentResult.error) throw shipmentResult.error;
      if (orderProcessResult.error) throw orderProcessResult.error;
      if (productionResult.error) throw productionResult.error;

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

      const processProgressMap = buildOrderProcessProgressMap(
        orderProcessResult.data || [],
      );
      const finalProcessCompletionMap = buildFinalProcessCompletionMap(
        orderProcessResult.data || [],
      );
      const productionResultMap = buildProductionResultProgressMap(
        productionResult.data || [],
      );
      const outsourceStatusMap = buildOutsourceStatusMap(
        orderProcessResult.data || [],
      );

      const rawData: PostData[] = (data || []).map((row) => {
        const processProgress =
          processProgressMap.get(row.id) || createEmptyProcessProgress();
        const productionProgress =
          productionResultMap.get(row.id) || createEmptyProcessProgress();
        const manufacturingLogs =
          processProgress.manufacturingLogs.length > 0
            ? processProgress.manufacturingLogs
            : productionProgress.manufacturingLogs;
        const cleaningLogs =
          processProgress.cleaningLogs.length > 0
            ? processProgress.cleaningLogs
            : productionProgress.cleaningLogs;
        const inspectionLogs =
          processProgress.inspectionLogs.length > 0
            ? processProgress.inspectionLogs
            : productionProgress.inspectionLogs;
        const measurementLogs =
          processProgress.measurementLogs.length > 0
            ? processProgress.measurementLogs
            : productionProgress.measurementLogs;
        const packagingLogs =
          processProgress.packagingLogs.length > 0
            ? processProgress.packagingLogs
            : productionProgress.packagingLogs;
        const manufacturingAmount = sumProcessLogs(manufacturingLogs);
        const cleaningAmount = sumProcessLogs(cleaningLogs);
        const inspectionAmount = sumProcessLogs(inspectionLogs);
        const measurementAmount = sumProcessLogs(measurementLogs);
        const packagingAmount = Math.max(
          sumProcessLogs(packagingLogs),
          finalProcessCompletionMap.get(row.id) || 0,
        );
        const shippedAmount = shippedMap.get(row.id) || 0;
        let status = row.status || "未着手";
        if (shippedAmount >= Number(row.order_amount || 0) && Number(row.order_amount || 0) > 0) {
          status = "出荷OK";
        } else if (outsourceStatusMap.has(row.id)) {
          status = outsourceStatusMap.get(row.id) || status;
        } else if (packagingAmount >= Number(row.order_amount || 0) && Number(row.order_amount || 0) > 0) {
          status = "梱包完了";
        } else if (packagingAmount > 0) {
          status = "梱包中";
        } else if (measurementAmount > 0) {
          status = "計量中";
        } else if (inspectionAmount > 0) {
          status = "検査中";
        } else if (cleaningAmount > 0) {
          status = "洗浄中";
        } else if (manufacturingAmount > 0) {
          status = "製造中";
        }

        return {
          id: row.id,
          delete: row.delete || false,
          orderNo: row.order_no || "",
          lotNo: row.lot_no || "",
          productCode: row.product_code || "",
          productName: row.product_name || "",
          customerName: row.customer_name || "",
          orderAmount: row.order_amount || 0,
          remainingAmount: row.remaining_amount || 0,
          status,
          completionScheduledDate:
            row.completion_scheduled_date || row.delivery_date || "",
          deliveryDate: row.delivery_date || "",
          remark: row.remark || "",
          manufacturingAmount: sumProcessLogs(manufacturingLogs),
          cleaningAmount: sumProcessLogs(cleaningLogs),
          inspectionAmount: sumProcessLogs(inspectionLogs),
          measurementAmount: sumProcessLogs(measurementLogs),
          packagingAmount,
          manufacturingLogs,
          cleaningLogs,
          inspectionLogs,
          measurementLogs,
          packagingLogs,
        };
      });

      // =========================
      // 注残があるものだけ
      // =========================

      const filtered = rawData.filter((post) => {
        if (post.delete) return false;
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
  }, [formatAllocationSource]);

  useEffect(() => {
    const loadPosts = async () => {
      await fetchPosts();
    };

    void loadPosts();
  }, [fetchPosts]);

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

  const handleDeleteOrder = async (post: AdjustedPost) => {
    if (
      !confirm(
        `${post.orderNo} / ${post.productName} を削除します。関連する進捗・工程・実績・引当・出荷データも削除されます。よろしいですか？`,
      )
    ) {
      return;
    }

    try {
      setDeletingPostId(post.id);
      const { error } = await supabase.rpc("soft_delete_order_post", {
        p_post_id: post.id,
      });

      if (error) throw error;
      await fetchPosts();
      alert("受注を削除しました");
    } catch (error) {
      console.error(error);
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "受注の削除に失敗しました";
      alert(message);
    } finally {
      setDeletingPostId("");
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
              <th>削除</th>
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
                  <td>
                    <button
                      className={styles.deleteButton}
                      disabled={deletingPostId === post.id}
                      onClick={() => handleDeleteOrder(post)}
                    >
                      {deletingPostId === post.id ? "削除中" : "削除"}
                    </button>
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
