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

type LotHistoryRow = {
  id: string;
  date: string;
  sortOrder: number;
  category: string;
  amount: number;
  detail: string;
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

const buildDateLabel = (label: string, value: unknown) => {
  const date = formatDate(String(value || ""));
  return date === "-" ? "" : `${label}: ${date}`;
};

const sortHistoryRows = (rows: LotHistoryRow[]) =>
  [...rows].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.sortOrder - b.sortOrder;
  });

export default function LotsPage() {
  const [lots, setLots] = useState<LotFlowRow[]>([]);
  const [historyRows, setHistoryRows] = useState<LotHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedLotId, setSelectedLotId] = useState("");
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
    void fetchLots();
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

  const selectedLot = useMemo(
    () => lots.find((lot) => lot.id === selectedLotId) || null,
    [lots, selectedLotId],
  );

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

  const fetchLotHistory = async (lot: LotFlowRow) => {
    try {
      setHistoryLoading(true);
      const baseRows: LotHistoryRow[] = [
        lot.measuredAmount > 0
          ? {
              id: `lot-measured-${lot.id}`,
              date: lot.measuredAt || lot.createdAt,
              sortOrder: 5,
              category: "計量",
              amount: lot.measuredAmount,
              detail: `材料ロットNo: ${lot.materialLotNo || "-"}`,
            }
          : null,
        lot.packagedAmount > 0
          ? {
              id: `lot-packaged-${lot.id}`,
              date: lot.packagedAt || lot.updatedAt,
              sortOrder: 20,
              category: "梱包",
              amount: lot.packagedAmount,
              detail: "梱包実績から在庫登録",
            }
          : null,
        lot.inventoryAmount > 0
          ? {
              id: `lot-inventory-${lot.id}`,
              date: lot.packagedAt || lot.updatedAt,
              sortOrder: 30,
              category: "在庫登録",
              amount: lot.inventoryAmount,
              detail: `現在庫 ${formatNumber(lot.inventoryAmount)}`,
            }
          : null,
        lot.allocatedAmount > 0
          ? {
              id: `lot-allocated-${lot.id}`,
              date: lot.updatedAt,
              sortOrder: 40,
              category: "在庫引当",
              amount: lot.allocatedAmount,
              detail: `未出荷引当 ${formatNumber(lot.allocatedAmount)}`,
            }
          : null,
        lot.shippedAmount > 0
          ? {
              id: `lot-shipped-${lot.id}`,
              date: lot.lastShippedAt || lot.updatedAt,
              sortOrder: 50,
              category: "出荷",
              amount: lot.shippedAmount,
              detail: "ロット出荷数合計",
            }
          : null,
      ].filter((row): row is LotHistoryRow => row !== null);

      const [
        productionResult,
        inventoryResult,
        allocationResult,
        shipmentResult,
      ] = await Promise.all([
        supabase
          .from("production_results")
          .select("id,process_name,date,amount,created_at")
          .eq("lot_id", lot.id)
          .order("date", { ascending: true }),
        supabase
          .from("inventory_items")
          .select("id,current_stock,allocated_stock,created_at,updated_at")
          .eq("lot_id", lot.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("inventory_allocations")
          .select("id,allocated_amount,shipped_amount,confirmed_at")
          .eq("lot_id", lot.id)
          .order("confirmed_at", { ascending: true }),
        supabase
          .from("shipments")
          .select("id,quantity,scheduled_date,delivery_date,customer_name,created_at")
          .or(`lot_id.eq.${lot.id},lot_no.eq.${lot.lotNo}`)
          .order("scheduled_date", { ascending: true }),
      ]);

      if (productionResult.error) {
        console.warn("ロット実績履歴の取得に失敗", productionResult.error);
      }
      if (inventoryResult.error) {
        console.warn("ロット在庫履歴の取得に失敗", inventoryResult.error);
      }
      if (allocationResult.error) {
        console.warn("ロット引当履歴の取得に失敗", allocationResult.error);
      }
      if (shipmentResult.error) {
        console.warn("ロット出荷履歴の取得に失敗", shipmentResult.error);
      }

      const productionRows = (
        (productionResult.error ? [] : productionResult.data || []) as Record<string, unknown>[]
      ).map((row) => ({
        id: `result-${String(row.id || "")}`,
        date: String(row.date || row.created_at || ""),
        sortOrder: 10,
        category: String(row.process_name || "実績"),
        amount: toNumber(row.amount),
        detail: `${String(row.process_name || "工程")} 実績登録`,
      }));
      const inventoryRows = (
        (inventoryResult.error ? [] : inventoryResult.data || []) as Record<string, unknown>[]
      ).map((row) => ({
        id: `inventory-${String(row.id || "")}`,
        date: String(row.updated_at || row.created_at || ""),
        sortOrder: 30,
        category: "在庫登録",
        amount: toNumber(row.current_stock),
        detail: `現在庫 ${formatNumber(toNumber(row.current_stock))} / 引当済 ${formatNumber(
          toNumber(row.allocated_stock),
        )}`,
      }));
      const allocationRows = (
        (allocationResult.error ? [] : allocationResult.data || []) as Record<string, unknown>[]
      ).map((row) => ({
        id: `allocation-${String(row.id || "")}`,
        date: String(row.confirmed_at || ""),
        sortOrder: 40,
        category: "在庫引当",
        amount: toNumber(row.allocated_amount),
        detail: `引当 ${formatNumber(
          toNumber(row.allocated_amount),
        )} / 出荷済 ${formatNumber(toNumber(row.shipped_amount))}`,
      }));
      const shipmentRows = (
        (shipmentResult.error ? [] : shipmentResult.data || []) as Record<string, unknown>[]
      ).map((row) => {
        const detailParts = [
          `得意先: ${String(row.customer_name || lot.customerName || "-")}`,
          buildDateLabel("出荷予定", row.scheduled_date),
          buildDateLabel("納品日", row.delivery_date),
        ].filter(Boolean);

        return {
          id: `shipment-${String(row.id || "")}`,
          date: String(row.delivery_date || row.scheduled_date || row.created_at || ""),
          sortOrder: 50,
          category: "出荷",
          amount: toNumber(row.quantity),
          detail: detailParts.join(" / "),
        };
      });

      const detailRows = [
        ...productionRows,
        ...inventoryRows,
        ...allocationRows,
        ...shipmentRows,
      ];
      const detailCategories = new Set(detailRows.map((row) => row.category));
      const fallbackRows = baseRows.filter(
        (row) => !detailCategories.has(row.category),
      );

      setHistoryRows(sortHistoryRows([...detailRows, ...fallbackRows]));
    } catch (error) {
      console.error(error);
      alert("ロット履歴の取得に失敗しました");
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleDetail = async (lot: LotFlowRow) => {
    const nextLotId = selectedLotId === lot.id ? "" : lot.id;
    setSelectedLotId(nextLotId);
    setHistoryRows([]);

    if (nextLotId) {
      await fetchLotHistory(lot);
    }
  };

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

      if (selectedLotId === lot.id) {
        setSelectedLotId("");
        setHistoryRows([]);
      }
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
        <h1 className={styles.title}>ロット管理</h1>
      </div>

      <div className={styles.filterCard}>
        <input
          className={styles.input}
          placeholder="注番・ロットNo・材料ロットNo・製品・得意先で検索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
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
          <span>計量数</span>
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
              <th>計量日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLots.map((lot) => (
              <tr
                key={lot.id}
                className={selectedLotId === lot.id ? styles.selectedRow : ""}
              >
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
                  表示できるロットがありません
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

      {selectedLot && (
        <div className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <div>
              <span>履歴確認</span>
              <strong>{selectedLot.lotNo}</strong>
            </div>
          </div>

          <div className={styles.detailGrid}>
            <div>
              <span>注番</span>
              <strong>{selectedLot.orderNo || "-"}</strong>
            </div>
            <div>
              <span>製品</span>
              <strong>{selectedLot.productName || "-"}</strong>
            </div>
            <div>
              <span>得意先</span>
              <strong>{selectedLot.customerName || "-"}</strong>
            </div>
            <div>
              <span>材料ロットNo</span>
              <strong>{selectedLot.materialLotNo || "-"}</strong>
            </div>
          </div>

          <div className={styles.flowSteps}>
            <div className={styles.flowStep}>
              <span>計量</span>
              <strong>{formatNumber(selectedLot.measuredAmount)}</strong>
            </div>
            <div className={styles.flowStep}>
              <span>梱包</span>
              <strong>{formatNumber(selectedLot.packagedAmount)}</strong>
            </div>
            <div className={styles.flowStep}>
              <span>在庫</span>
              <strong>{formatNumber(selectedLot.inventoryAmount)}</strong>
            </div>
            <div className={styles.flowStep}>
              <span>引当</span>
              <strong>{formatNumber(selectedLot.allocatedAmount)}</strong>
            </div>
            <div className={styles.flowStep}>
              <span>出荷</span>
              <strong>{formatNumber(selectedLot.shippedAmount)}</strong>
            </div>
            <div className={styles.flowStep}>
              <span>残</span>
              <strong>{formatNumber(selectedLot.remainingAmount)}</strong>
            </div>
          </div>

          <div className={styles.historyArea}>
            <h2>ロットの動き</h2>
            {historyLoading ? (
              <div className={styles.loading}>履歴を読み込み中...</div>
            ) : (
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>区分</th>
                    <th>数量</th>
                    <th>内容</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((history) => (
                    <tr key={history.id}>
                      <td>{formatDate(history.date)}</td>
                      <td>{history.category}</td>
                      <td className={styles.numberCell}>
                        {formatNumber(history.amount)}
                      </td>
                      <td>{history.detail}</td>
                    </tr>
                  ))}
                  {historyRows.length === 0 && (
                    <tr>
                      <td className={styles.emptyCell} colSpan={4}>
                        表示できる履歴がありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
