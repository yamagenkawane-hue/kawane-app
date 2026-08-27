"use client";

import type { PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import styles from "./page.module.css";

type LotFlowStatus =
  | "measured"
  | "packaging"
  | "stocked"
  | "allocated"
  | "partial_shipped"
  | "shipped"
  | "cancelled";

type LotFlowRow = {
  id: string;
  postId: string;
  orderNo: string;
  productCode: string;
  productName: string;
  customerName: string;
  lotNo: string;
  materialLotNo: string;
  measuredAmount: number;
  packagedAmount: number;
  inventoryAmount: number;
  allocatedAmount: number;
  shippedAmount: number;
  remainingAmount: number;
  flowStatus: LotFlowStatus;
  measuredAt: string;
  packagedAt: string;
  lastShippedAt: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

const PAGE_SIZE = 7;

const LOT_SELECT_COLUMNS = [
  "id",
  "post_id",
  "order_no",
  "product_code",
  "product_name",
  "customer_name",
  "lot_no",
  "material_lot_no",
  "measured_amount",
  "packaged_amount",
  "inventory_amount",
  "allocated_amount",
  "shipped_amount",
  "remaining_amount",
  "flow_status",
  "measured_at",
  "packaged_at",
  "last_shipped_at",
  "note",
  "created_at",
  "updated_at",
].join(",");

const toNumber = (value: unknown) => Number(value || 0);

const mapLotRow = (row: Record<string, unknown>): LotFlowRow => ({
  id: String(row.id || ""),
  postId: String(row.post_id || ""),
  orderNo: String(row.order_no || ""),
  productCode: String(row.product_code || ""),
  productName: String(row.product_name || ""),
  customerName: String(row.customer_name || ""),
  lotNo: String(row.lot_no || ""),
  materialLotNo: String(row.material_lot_no || ""),
  measuredAmount: toNumber(row.measured_amount),
  packagedAmount: toNumber(row.packaged_amount),
  inventoryAmount: toNumber(row.inventory_amount),
  allocatedAmount: toNumber(row.allocated_amount),
  shippedAmount: toNumber(row.shipped_amount),
  remainingAmount: toNumber(row.remaining_amount),
  flowStatus: String(row.flow_status || "measured") as LotFlowStatus,
  measuredAt: String(row.measured_at || ""),
  packagedAt: String(row.packaged_at || ""),
  lastShippedAt: String(row.last_shipped_at || ""),
  note: String(row.note || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const formatNumber = (value: number) => value.toLocaleString("ja-JP");

const formatDate = (value: string) => {
  if (!value) return "-";
  return value.slice(0, 10);
};

export default function LotsPage() {
  const [lots, setLots] = useState<LotFlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ active: false, startX: 0, scrollLeft: 0 });

  const fetchLots = async () => {
    try {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("v_lot_flow_status")
        .select(LOT_SELECT_COLUMNS)
        .eq("deleted", false)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as unknown as Record<string, unknown>[];
      setLots(rows.map(mapLotRow));
    } catch (error) {
      console.error(error);
      alert("ロット情報の取得に失敗しました。ロット削除管理SQLを実行してください。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchLots();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const filteredLots = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();

    return lots.filter((lot) => {
      if (!lowerSearch) return true;

      return [
        lot.orderNo,
        lot.lotNo,
        lot.materialLotNo,
        lot.productCode,
        lot.productName,
        lot.customerName,
        lot.note,
      ]
        .join(" ")
        .toLowerCase()
        .includes(lowerSearch);
    });
  }, [lots, search]);

  const totalPages = Math.max(1, Math.ceil(filteredLots.length / PAGE_SIZE));
  const normalizedCurrentPage = Math.min(currentPage, totalPages);

  const paginatedLots = useMemo(() => {
    const startIndex = (normalizedCurrentPage - 1) * PAGE_SIZE;
    return filteredLots.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredLots, normalizedCurrentPage]);

  const pageStart =
    filteredLots.length === 0 ? 0 : (normalizedCurrentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(normalizedCurrentPage * PAGE_SIZE, filteredLots.length);

  const totals = useMemo(
    () =>
      filteredLots.reduce(
        (acc, lot) => ({
          measured: acc.measured + lot.measuredAmount,
          packaged: acc.packaged + lot.packagedAmount,
          inventory: acc.inventory + lot.inventoryAmount,
          allocated: acc.allocated + lot.allocatedAmount,
          shipped: acc.shipped + lot.shippedAmount,
          remaining: acc.remaining + lot.remainingAmount,
        }),
        {
          measured: 0,
          packaged: 0,
          inventory: 0,
          allocated: 0,
          shipped: 0,
          remaining: 0,
        },
      ),
    [filteredLots],
  );

  const softDeleteLot = async (lot: LotFlowRow) => {
    const confirmed = confirm(
      `${lot.lotNo || "選択ロット"} を削除済みロット一覧へ移動します。よろしいですか？`,
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      setMessage("");

      const { error } = await supabase.rpc("soft_delete_lot", {
        p_lot_id: lot.id,
      });

      if (error) throw error;

      setLots((currentLots) => currentLots.filter((item) => item.id !== lot.id));
      setMessage("ロットを削除済みロット一覧へ移動しました");
      await fetchLots();
    } catch (error) {
      console.error(error);
      alert("ロットの削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    dragState.current = {
      active: true,
      startX: event.clientX,
      scrollLeft: scrollRef.current.scrollLeft,
    };
    scrollRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active || !scrollRef.current) return;
    const delta = event.clientX - dragState.current.startX;
    scrollRef.current.scrollLeft = dragState.current.scrollLeft - delta;
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    dragState.current.active = false;
    scrollRef.current?.releasePointerCapture(event.pointerId);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
        </Link>
        <Link href="/lots/deleted" className={styles.secondaryButton}>
          削除済みロット一覧
        </Link>
        <h1 className={styles.title}>注番管理</h1>
      </div>

      <div className={styles.filterCard}>
        <input
          className={styles.input}
          placeholder="注番・得意先・製品・ロットNo・材料ロットNoで検索"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setCurrentPage(1);
          }}
        />
        <button className={styles.reloadButton} onClick={fetchLots}>
          再読み込み
        </button>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span>表示件数</span>
          <strong>{filteredLots.length}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>製造数</span>
          <strong>{formatNumber(totals.measured)}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>梱包数</span>
          <strong>{formatNumber(totals.packaged)}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>在庫数</span>
          <strong>{formatNumber(totals.inventory)}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>引当数</span>
          <strong>{formatNumber(totals.allocated)}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>出荷数</span>
          <strong>{formatNumber(totals.shipped)}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>残数</span>
          <strong>{formatNumber(totals.remaining)}</strong>
        </div>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {loading && <div className={styles.loading}>読み込み中...</div>}

      <div
        className={styles.tableCard}
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th>注番</th>
              <th>得意先</th>
              <th>製品コード</th>
              <th>製品名</th>
              <th>ロットNo</th>
              <th>材料ロットNo</th>
              <th>製造数</th>
              <th>梱包数</th>
              <th>在庫数</th>
              <th>引当数</th>
              <th>出荷数</th>
              <th>残数</th>
              <th>製造日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLots.map((lot) => (
              <tr key={lot.id}>
                <td>{lot.orderNo || "-"}</td>
                <td className={styles.nameCell}>{lot.customerName || "-"}</td>
                <td>{lot.productCode || "-"}</td>
                <td className={styles.nameCell}>{lot.productName || "-"}</td>
                <td>{lot.lotNo || "-"}</td>
                <td>{lot.materialLotNo || "-"}</td>
                <td className={styles.numberCell}>
                  {formatNumber(lot.measuredAmount)}
                </td>
                <td className={styles.numberCell}>
                  {formatNumber(lot.packagedAmount)}
                </td>
                <td className={styles.numberCell}>
                  {formatNumber(lot.inventoryAmount)}
                </td>
                <td className={styles.numberCell}>
                  {formatNumber(lot.allocatedAmount)}
                </td>
                <td className={styles.numberCell}>
                  {formatNumber(lot.shippedAmount)}
                </td>
                <td className={styles.numberCell}>
                  {formatNumber(lot.remainingAmount)}
                </td>
                <td>{formatDate(lot.measuredAt)}</td>
                <td className={styles.actionArea}>
                  <Link
                    href={`/lots/${lot.id}`}
                    className={styles.detailButton}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    履歴確認
                  </Link>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => void softDeleteLot(lot)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
            {filteredLots.length === 0 && (
              <tr>
                <td className={styles.emptyCell} colSpan={14}>
                  表示できる注番・ロットがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <div className={styles.pageInfo}>
          {formatNumber(filteredLots.length)}件中 {formatNumber(pageStart)}-
          {formatNumber(pageEnd)}件を表示
        </div>
        <div className={styles.pageActions}>
          <button
            className={styles.pageButton}
            type="button"
            disabled={normalizedCurrentPage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            前へ
          </button>
          <span className={styles.pageNumber}>
            {normalizedCurrentPage} / {totalPages}
          </span>
          <button
            className={styles.pageButton}
            type="button"
            disabled={normalizedCurrentPage >= totalPages}
            onClick={() =>
              setCurrentPage((page) => Math.min(totalPages, page + 1))
            }
          >
            次へ
          </button>
        </div>
      </div>

    </div>
  );
}
