"use client";

import type { PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import styles from "../page.module.css";

type DeletedLotRow = {
  id: string;
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
  deletedAt: string;
};

const PAGE_SIZE = 7;

const LOT_SELECT_COLUMNS = [
  "id",
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
  "deleted_at",
].join(",");

const toNumber = (value: unknown) => Number(value || 0);

const formatNumber = (value: number) => value.toLocaleString("ja-JP");

const formatDate = (value: string) => {
  if (!value) return "-";
  return value.slice(0, 10);
};

const mapDeletedLotRow = (row: Record<string, unknown>): DeletedLotRow => ({
  id: String(row.id || ""),
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
  deletedAt: String(row.deleted_at || ""),
});

export default function DeletedLotsPage() {
  const [lots, setLots] = useState<DeletedLotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ active: false, startX: 0, scrollLeft: 0 });

  const fetchDeletedLots = async () => {
    try {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("v_lot_flow_status")
        .select(LOT_SELECT_COLUMNS)
        .eq("deleted", true)
        .order("deleted_at", { ascending: false });

      if (error) throw error;

      setLots(
        ((data || []) as unknown as Record<string, unknown>[]).map(
          mapDeletedLotRow,
        ),
      );
    } catch (error) {
      console.error(error);
      alert("削除済みロットの取得に失敗しました。ロット削除管理SQLを実行してください。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDeletedLots();
  }, []);

  const filteredLots = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();
    if (!lowerSearch) return lots;

    return lots.filter((lot) =>
      [
        lot.orderNo,
        lot.lotNo,
        lot.materialLotNo,
        lot.productCode,
        lot.productName,
        lot.customerName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(lowerSearch),
    );
  }, [lots, search]);

  const totalPages = Math.max(1, Math.ceil(filteredLots.length / PAGE_SIZE));
  const paginatedLots = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredLots.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredLots]);
  const pageStart =
    filteredLots.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, filteredLots.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const restoreLot = async (lot: DeletedLotRow) => {
    const confirmed = confirm(
      `${lot.lotNo || "選択ロット"} を通常のロット管理へ戻します。よろしいですか？`,
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from("lots")
        .update({
          deleted: false,
          deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lot.id);

      if (error) throw error;

      setMessage("ロットを復元しました");
      await fetchDeletedLots();
    } catch (error) {
      console.error(error);
      alert("ロットの復元に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const permanentlyDeleteLot = async (lot: DeletedLotRow) => {
    const confirmed = confirm(
      `${lot.lotNo || "選択ロット"} と関連する実績・在庫・引当・出荷履歴を完全に削除します。元に戻せません。完全削除しますか？`,
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      setMessage("");

      const { error } = await supabase.rpc("permanently_delete_lot", {
        p_lot_id: lot.id,
      });
      if (error) throw error;

      setMessage("ロットを完全削除しました");
      await fetchDeletedLots();
    } catch (error) {
      console.error(error);
      alert("ロットの完全削除に失敗しました");
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
        <Link href="/lots" className={styles.backButton}>
          ← ロット管理へ戻る
        </Link>
        <h1 className={styles.title}>削除済みロット一覧</h1>
      </div>

      <div className={styles.filterCard}>
        <input
          className={styles.input}
          placeholder="注番・ロットNo・材料ロットNo・製品・得意先で検索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className={styles.reloadButton} onClick={fetchDeletedLots}>
          再読み込み
        </button>
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
              <th>ロットNo</th>
              <th>材料ロットNo</th>
              <th>注番</th>
              <th>製品コード</th>
              <th>製品名</th>
              <th>得意先</th>
              <th>計量数</th>
              <th>梱包数</th>
              <th>在庫数</th>
              <th>引当数</th>
              <th>出荷数</th>
              <th>残数</th>
              <th>削除日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLots.map((lot) => (
              <tr key={lot.id}>
                <td>{lot.lotNo || "-"}</td>
                <td>{lot.materialLotNo || "-"}</td>
                <td>{lot.orderNo || "-"}</td>
                <td>{lot.productCode || "-"}</td>
                <td className={styles.nameCell}>{lot.productName || "-"}</td>
                <td className={styles.nameCell}>{lot.customerName || "-"}</td>
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
                <td>{formatDate(lot.deletedAt)}</td>
                <td className={styles.actionArea}>
                  <button
                    className={styles.restoreButton}
                    onClick={() => void restoreLot(lot)}
                  >
                    復元
                  </button>
                  <button
                    className={styles.dangerButton}
                    onClick={() => void permanentlyDeleteLot(lot)}
                  >
                    完全削除
                  </button>
                </td>
              </tr>
            ))}
            {filteredLots.length === 0 && (
              <tr>
                <td className={styles.emptyCell} colSpan={14}>
                  削除済みロットがありません
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
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            前へ
          </button>
          <span className={styles.pageNumber}>
            {currentPage} / {totalPages}
          </span>
          <button
            className={styles.pageButton}
            type="button"
            disabled={currentPage >= totalPages}
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
