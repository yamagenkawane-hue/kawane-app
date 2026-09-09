"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { subDays } from "date-fns";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import { CustomerMaster, Shipment } from "@/app/type";
import styles from "../masterCommon.module.css";

type ShippingPost = {
  lotNo: string;
  lotId: string;
  rowKey: string;
  id: string;
  postId: string;
  orderNo: string;
  productCode: string;
  productName: string;
  customerName: string;
  orderAmount: number;
  lotProductionAmount: number;
  remainingAmount: number;
  status: string;
  deliveryDate: string;
  completionScheduledDate: string;
  shippedAmount: number;
  scheduledDate: string;
};

type ShippingPostGroup = {
  groupKey: string;
  rows: ShippingPost[];
};

const STOCK_IN_HISTORY_SELECT_COLUMNS =
  "id,post_id,order_no,lot_id,lot_no,quantity,created_at,product_code,product_name,customer_name";

const CUSTOMER_SELECT_COLUMNS =
  "id,customer_name,shipping_offset_days,note";

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const escapeHtml = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const createShippingGroupKey = (post: ShippingPost) =>
  [
    post.scheduledDate,
    post.customerName,
    post.orderNo,
    post.productName,
    post.deliveryDate,
    post.orderAmount,
  ].join("|");

const mapShipment = (row: Record<string, unknown>): Shipment => ({
  id: String(row.id || ""),
  postId: String(row.post_id || ""),
  orderNo: String(row.order_no || ""),
  customerName: String(row.customer_name || ""),
  productCode: String(row.product_code || ""),
  productName: String(row.product_name || ""),
  lotId: String(row.lot_id || ""),
  lotNo: String(row.lot_no || ""),
  scheduledDate: String(row.scheduled_date || ""),
  deliveryDate: String(row.delivery_date || ""),
  orderAmount: Number(row.order_amount || 0),
  quantity: Number(row.quantity || 0),
  cancelled: Boolean(row.cancelled),
  cancelledAt: String(row.cancelled_at || ""),
  cancelledReason: String(row.cancelled_reason || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

export default function ShippingPage() {
  const [posts, setPosts] = useState<ShippingPost[]>([]);
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
            lotId: String(row.lot_id || ""),
            postId,
            orderNo: row.order_no || "",
            lotNo,
            productCode: row.product_code || "",
            productName: row.product_name || "",
            customerName: row.customer_name || "",
            orderAmount,
            lotProductionAmount: completedQuantity,
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

  const visiblePostGroups = useMemo(() => {
    const groupMap = new Map<string, ShippingPostGroup>();

    visiblePosts.forEach((post) => {
      const groupKey = createShippingGroupKey(post);
      const currentGroup = groupMap.get(groupKey);

      if (currentGroup) {
        currentGroup.rows.push(post);
        return;
      }

      groupMap.set(groupKey, {
        groupKey,
        rows: [post],
      });
    });

    return Array.from(groupMap.values()).map((group) => ({
      ...group,
      rows: group.rows.sort((a, b) =>
        a.lotNo.localeCompare(b.lotNo, "ja", { numeric: true }),
      ),
    }));
  }, [visiblePosts]);

  const exportPdf = () => {
    const printableRows = visiblePostGroups.flatMap((group) =>
      group.rows.map((post) => [
        post.scheduledDate,
        post.customerName,
        post.orderNo,
        post.productName,
        post.lotNo || "-",
        post.lotProductionAmount.toLocaleString("ja-JP"),
        post.deliveryDate,
        post.orderAmount.toLocaleString("ja-JP"),
        "",
      ]),
    );
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      alert("PDF出力用の画面を開けませんでした。ポップアップ設定を確認してください。");
      return;
    }

    const bodyRows =
      printableRows.length > 0
        ? printableRows
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
            )
            .join("")
        : `<tr><td colspan="9" class="empty">出荷対象がありません</td></tr>`;

    printWindow.document.write(`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>出荷リスト</title>
    <style>
      body {
        color: #111827;
        font-family: "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif;
        margin: 24px;
      }
      h1 {
        font-size: 22px;
        margin: 0 0 16px;
        text-align: center;
      }
      table {
        border-collapse: collapse;
        table-layout: fixed;
        width: 100%;
      }
      th,
      td {
        border: 1px solid #d1d5db;
        font-size: 11px;
        padding: 7px 6px;
        text-align: center;
        word-break: break-word;
      }
      th {
        background: #1f2937;
        color: #fff;
      }
      .empty {
        color: #64748b;
        padding: 20px;
      }
      @page {
        margin: 12mm;
        size: A4 landscape;
      }
    </style>
  </head>
  <body>
    <h1>出荷リスト</h1>
    <table>
      <thead>
        <tr>
          <th>出荷予定日</th>
          <th>得意先</th>
          <th>注番</th>
          <th>製品名</th>
          <th>ロットNo</th>
          <th>生産数</th>
          <th>納期</th>
          <th>受注数</th>
          <th>出荷数</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <script>
      window.addEventListener("load", () => {
        window.print();
      });
    </script>
  </body>
</html>`);
    printWindow.document.close();
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

    if (
      !window.confirm(
        `${post.orderNo} / ${post.lotNo} を ${amount.toLocaleString(
          "ja-JP",
        )} 個出荷します。よろしいですか？`,
      )
    ) {
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
          lot_id: post.lotId || null,
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
              <th>生産数</th>
              <th>納期</th>
              <th>受注数</th>
              <th>出荷数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visiblePostGroups.map((group) =>
              group.rows.map((post, index) => (
                <tr key={post.rowKey}>
                  {index === 0 && (
                    <>
                      <td rowSpan={group.rows.length}>{post.scheduledDate}</td>
                      <td rowSpan={group.rows.length}>{post.customerName}</td>
                      <td rowSpan={group.rows.length}>{post.orderNo}</td>
                      <td rowSpan={group.rows.length}>{post.productName}</td>
                    </>
                  )}
                  <td>{post.lotNo || "-"}</td>
                  <td>{post.lotProductionAmount.toLocaleString("ja-JP")}</td>
                  {index === 0 && (
                    <>
                      <td rowSpan={group.rows.length}>{post.deliveryDate}</td>
                      <td rowSpan={group.rows.length}>{post.orderAmount}</td>
                    </>
                  )}
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
              )),
            )}
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
