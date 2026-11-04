"use client";
import { authFetch } from "@/lib/auth/client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { subDays } from "date-fns";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import { CustomerMaster } from "@/app/type";
import { fetchAllRows } from "@/lib/fetchAllRows";
import styles from "../masterCommon.module.css";
import shippingStyles from "./page.module.css";
import { buildShippedAmountMap } from "@/lib/orderVisibility";
import { buildShippingStockMaps, shippingQuantityError } from "@/lib/shippingQuantity";

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
  orderRemaining: number;
  availableStock: number;
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
    post.postId,
    post.scheduledDate,
    post.customerName,
    post.orderNo,
    post.productName,
    post.deliveryDate,
    post.orderAmount,
  ].join("|");

export default function ShippingPage() {
  const shippingRef = useRef(false);
  const [posts, setPosts] = useState<ShippingPost[]>([]);
  const [shipAmounts, setShipAmounts] = useState<Record<string, number>>({});
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [numpadPostId, setNumpadPostId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [stockResult, customerResult, shipmentResult, inventoryResult, allocationResult] = await Promise.all([
        fetchAllRows((from, to) => supabase.from("v_shipping_candidates")
          .select("post_id,order_no,lot_id,lot_no,product_code,product_name,customer_name,order_amount,delivery_date,completion_scheduled_date,current_stock,available_quantity")
          .gt("available_quantity", 0).order("post_id").order("lot_id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("customer_master").select(CUSTOMER_SELECT_COLUMNS).order("id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("shipments")
          .select("post_id,order_no,quantity,cancelled").or("cancelled.is.null,cancelled.eq.false").order("id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("inventory_items")
          .select("id,lot_id,current_stock,allocated_stock").order("id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("inventory_allocations")
          .select("post_id,inventory_item_id,allocated_amount,shipped_amount").order("id").range(from, to)),
      ]);
      if (stockResult.error) throw stockResult.error;
      if (customerResult.error) throw customerResult.error;
      if (shipmentResult.error) throw shipmentResult.error;
      if (inventoryResult.error) throw inventoryResult.error;
      if (allocationResult.error) throw allocationResult.error;
      const shippedAmounts = buildShippedAmountMap(
        (stockResult.data || []).map(row => ({ id: row.post_id, order_no: row.order_no })),
        shipmentResult.data || [],
      );
      const stockMaps = buildShippingStockMaps(inventoryResult.data || [], allocationResult.data || []);

      const customerList: CustomerMaster[] = (customerResult.data || []).map(
        (row) => ({
          id: row.id,
          customerName: row.customer_name || "",
          shippingOffsetDays: Number(row.shipping_offset_days || 0),
          note: row.note || "",
        }),
      );

      const mappedPosts: ShippingPost[] = (stockResult.data || []).map((row) => {
        const customer = customerList.find(item => item.customerName === row.customer_name);
        const deliveryDate = String(row.delivery_date || "");
        const scheduledDate = deliveryDate
          ? formatDate(subDays(new Date(deliveryDate), customer?.shippingOffsetDays || 0)) : "";
        const shippedAmount = shippedAmounts.get(row.post_id) || 0;
        const orderRemaining = Math.max(Number(row.order_amount || 0) - shippedAmount, 0);
        const availableStock = (stockMaps.freeByLot.get(row.lot_id) || 0)
          + (stockMaps.ownByOrderLot.get(`${row.post_id}:${row.lot_id}`) || 0);
        return {
          id: row.post_id, postId: row.post_id, rowKey: `${row.post_id}:${row.lot_id}`,
          lotId: row.lot_id, lotNo: row.lot_no, orderNo: row.order_no,
          productCode: row.product_code || "", productName: row.product_name || "",
          customerName: row.customer_name || "", orderAmount: Number(row.order_amount || 0),
          lotProductionAmount: Number(row.current_stock || 0),
          remainingAmount: Math.min(Number(row.available_quantity || 0), orderRemaining, availableStock),
          orderRemaining, availableStock,
          deliveryDate, scheduledDate, completionScheduledDate: row.completion_scheduled_date || "",
          status: "", shippedAmount,
        };
      })
        .sort((a, b) => {
          const customerCompare = a.customerName.localeCompare(b.customerName, "ja");
          return customerCompare || a.scheduledDate.localeCompare(b.scheduledDate);
        });

      setPosts(mappedPosts);
      return mappedPosts;
    } catch (error) {
      console.error(error);
      alert("出荷データの取得に失敗しました。最新の数量を確認できるまで出荷できません。");
      setPosts([]);
      return null;
    } finally {
      if (!shippingRef.current) setLoading(false);
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
          <th>ロット在庫数</th>
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

  const getShipAmount = (post: ShippingPost) => shipAmounts[post.rowKey] ?? post.remainingAmount;

  const handleShip = async (post: ShippingPost) => {
    if (shippingRef.current) return;
    const amount = getShipAmount(post);
    const quantityError = shippingQuantityError(amount, post.orderRemaining, post.availableStock);
    if (quantityError) {
      alert(quantityError);
      return;
    }
    if (!post.lotNo.trim()) {
      alert("ロットNoが未設定です。注残管理で在庫引当を確定してください");
      return;
    }
    if (!post.scheduledDate) {
      alert("納期が未登録のため出荷予定日を計算できません。注残管理で納期を設定してください");
      return;
    }

    shippingRef.current = true;
    const requestStorageKey = `shipment-request:${post.rowKey}:${amount}:${post.scheduledDate}`;
    try {
      setLoading(true);
      const latestPosts = await fetchData();
      if (!latestPosts) return;
      const latestPost = latestPosts.find(row => row.rowKey === post.rowKey);
      if (!latestPost || latestPost.remainingAmount <= 0) {
        alert("この注文またはロットから現在出荷できる数量は0個です。最新の一覧を確認してください。");
        return;
      }
      const latestError = shippingQuantityError(amount, latestPost.orderRemaining, latestPost.availableStock);
      if (latestError || amount > latestPost.remainingAmount) {
        alert(latestError || `今回の出荷上限は${latestPost.remainingAmount.toLocaleString("ja-JP")}個です。最新の一覧を確認してください。`);
        return;
      }
      if (latestPost.scheduledDate !== post.scheduledDate) {
        alert("出荷予定日が変更されています。最新の一覧を確認して再度出荷してください。");
        return;
      }
      if (!window.confirm(
        `${post.orderNo} / ${post.lotNo} を ${amount.toLocaleString("ja-JP")} 個出荷します。\n出荷後の注残：${(latestPost.orderRemaining - amount).toLocaleString("ja-JP")}個\n出荷後のロット在庫：${(latestPost.lotProductionAmount - amount).toLocaleString("ja-JP")}個\nよろしいですか？`,
      )) return;
      const requestKey = sessionStorage.getItem(requestStorageKey) || crypto.randomUUID();
      sessionStorage.setItem(requestStorageKey, requestKey);
      const response = await authFetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: requestKey,
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
        if (response.status === 409) {
          const refreshed = await fetchData();
          const current = refreshed?.find(row => row.rowKey === post.rowKey);
          const detail = current
            ? `最新の注残は${current.orderRemaining.toLocaleString("ja-JP")}個、今回の出荷上限は${current.remainingAmount.toLocaleString("ja-JP")}個です。`
            : refreshed ? "現在この注文またはロットから出荷できる数量は0個です。" : "";
          throw new Error(`${result?.error || "出荷数量が変更されています。"}\n${detail}`);
        }
        throw new Error(result?.error || "出荷登録に失敗しました");
      }

      sessionStorage.removeItem(requestStorageKey);
      setShipAmounts((prev) => {
        const next = { ...prev };
        delete next[post.rowKey];
        return next;
      });
      await fetchData();
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? error.message : "出荷登録に失敗しました",
      );
    } finally {
      shippingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <nav className={styles.backLinkGroup} aria-label="画面移動">
          <Link href="/productionSchedules" className={styles.backButton}>
            ← 生産予定に戻る
          </Link>
          <Link href="/reservation" className={styles.backButton}>
            ← 進捗管理に戻る
          </Link>
        </nav>
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
      <p className={shippingStyles.guide}>注残数は注文全体の残り数量です。今回の出荷上限は、注残数とこのロットの出荷可能在庫の少ない方です。他の注文への引当分は出荷可能在庫に含みません。</p>

      <div className={styles.tableCard}>
        <table className={`${styles.table} ${shippingStyles.table}`}>
          <thead>
            <tr>
              <th>出荷予定日</th>
              <th>得意先</th>
              <th>注番</th>
              <th>製品名</th>
              <th>ロットNo</th>
              <th>ロット在庫数</th>
              <th>納期</th>
              <th>受注数</th>
              <th>出荷済数</th>
              <th>注残数</th>
              <th>出荷可能在庫</th>
              <th>今回の出荷</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visiblePostGroups.map((group) =>
              group.rows.map((post, index) => {
                const amount = getShipAmount(post);
                const error = shippingQuantityError(amount, post.orderRemaining, post.availableStock);
                return <tr key={post.rowKey}>
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
                      <td rowSpan={group.rows.length}>{post.orderAmount.toLocaleString("ja-JP")}</td>
                      <td rowSpan={group.rows.length}>{post.shippedAmount.toLocaleString("ja-JP")}</td>
                      <td rowSpan={group.rows.length} className={shippingStyles.remaining}>{post.orderRemaining.toLocaleString("ja-JP")}</td>
                    </>
                  )}
                  <td>{post.availableStock.toLocaleString("ja-JP")}</td>
                  <td className={shippingStyles.quantityCell}>
                    <div className={shippingStyles.limit}>今回の出荷上限：{post.remainingAmount.toLocaleString("ja-JP")}個</div>
                    <input
                      className={`${styles.tableInput} ${shippingStyles.quantityInput}`}
                      aria-label={`${post.orderNo} / ${post.lotNo} の出荷数`}
                      aria-invalid={!!error}
                      aria-describedby={`quantity-${post.rowKey}`}
                      disabled={loading}
                      inputMode="numeric"
                      value={amount || ""}
                      onFocus={() => setNumpadPostId(post.rowKey)}
                      onChange={(e) =>
                        setShipAmounts({
                          ...shipAmounts,
                          [post.rowKey]: Number(e.target.value),
                        })
                      }
                    />
                    <div id={`quantity-${post.rowKey}`} className={shippingStyles.preview} aria-live="polite">
                      {error ? <span className={shippingStyles.error}>{error}</span> : <>
                        <div>出荷後の注残：{(post.orderRemaining - amount).toLocaleString("ja-JP")}個</div>
                        <div>出荷後のロット在庫：{(post.lotProductionAmount - amount).toLocaleString("ja-JP")}個</div>
                      </>}
                    </div>
                  </td>
                  <td className={styles.actionArea}>
                    <button className={styles.saveButton} disabled={loading || !!error || post.remainingAmount <= 0}
                      onClick={() => handleShip(post)}>
                      出荷
                    </button>
                  </td>
                </tr>;
              }),
            )}
          </tbody>
        </table>
      </div>

      <Numpad
        open={numpadPostId !== null}
        replaceOnFirstInput
        value={numpadPostId ? String(shipAmounts[numpadPostId] ?? posts.find(post => post.rowKey === numpadPostId)?.remainingAmount ?? "") : ""}
        onChange={(value) => {
          if (!numpadPostId) return;
          setShipAmounts((prev) => ({ ...prev, [numpadPostId]: Number(value || 0) }));
        }}
        onClose={() => setNumpadPostId(null)}
      />
    </div>
  );
}
