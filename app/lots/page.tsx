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

type EditingLot = {
  id: string;
  materialLotNo: string;
  note: string;
};

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

const statusLabels: Record<LotFlowStatus, string> = {
  measured: "計量済",
  packaging: "梱包中",
  stocked: "在庫あり",
  allocated: "引当済",
  partial_shipped: "一部出荷済",
  shipped: "出荷完了",
  cancelled: "取消",
};

const statusOptions: { value: "all" | LotFlowStatus; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "measured", label: "計量済" },
  { value: "packaging", label: "梱包中" },
  { value: "stocked", label: "在庫あり" },
  { value: "allocated", label: "引当済" },
  { value: "partial_shipped", label: "一部出荷済" },
  { value: "shipped", label: "出荷完了" },
  { value: "cancelled", label: "取消" },
];

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
  const [statusFilter, setStatusFilter] = useState<"all" | LotFlowStatus>("all");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [editingLot, setEditingLot] = useState<EditingLot | null>(null);
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ active: false, startX: 0, scrollLeft: 0 });

  const fetchLots = async () => {
    try {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("v_lot_flow_status")
        .select(LOT_SELECT_COLUMNS)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as unknown as Record<string, unknown>[];
      setLots(rows.map(mapLotRow));
    } catch (error) {
      console.error(error);
      alert("ロット情報の取得に失敗しました");
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
      const statusMatches =
        statusFilter === "all" || lot.flowStatus === statusFilter;
      const textMatches =
        !lowerSearch ||
        [
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

      return statusMatches && textMatches;
    });
  }, [lots, search, statusFilter]);

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

  const startEdit = (lot: LotFlowRow) => {
    setEditingLot({
      id: lot.id,
      materialLotNo: lot.materialLotNo,
      note: lot.note,
    });
    setSelectedLotId(lot.id);
    setMessage("");
  };

  const cancelEdit = () => {
    setEditingLot(null);
    setMessage("");
  };

  const saveEdit = async () => {
    if (!editingLot) return;

    try {
      setLoading(true);
      setMessage("");

      const { error } = await supabase
        .from("lots")
        .update({
          material_lot_no: editingLot.materialLotNo.trim() || null,
          note: editingLot.note.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingLot.id);

      if (error) throw error;

      setMessage("ロット情報を保存しました");
      setEditingLot(null);
      await fetchLots();
    } catch (error) {
      console.error(error);
      alert("ロット情報の保存に失敗しました");
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
        <h1 className={styles.title}>ロット管理</h1>
      </div>

      <div className={styles.filterCard}>
        <input
          className={styles.input}
          placeholder="注番・ロットNo・材料ロットNo・製品・得意先で検索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className={styles.select}
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as "all" | LotFlowStatus)
          }
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
              <th>状態</th>
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
            {filteredLots.map((lot) => (
              <tr
                key={lot.id}
                className={selectedLotId === lot.id ? styles.selectedRow : ""}
              >
                <td>
                  <span className={`${styles.badge} ${styles[lot.flowStatus]}`}>
                    {statusLabels[lot.flowStatus] || lot.flowStatus}
                  </span>
                </td>
                <td>{lot.lotNo || "-"}</td>
                <td>{lot.materialLotNo || "-"}</td>
                <td>{lot.orderNo || "-"}</td>
                <td>{lot.productCode || "-"}</td>
                <td className={styles.nameCell}>{lot.productName || "-"}</td>
                <td className={styles.nameCell}>{lot.customerName || "-"}</td>
                <td className={styles.numberCell}>{formatNumber(lot.measuredAmount)}</td>
                <td className={styles.numberCell}>{formatNumber(lot.packagedAmount)}</td>
                <td className={styles.numberCell}>{formatNumber(lot.inventoryAmount)}</td>
                <td className={styles.numberCell}>{formatNumber(lot.allocatedAmount)}</td>
                <td className={styles.numberCell}>{formatNumber(lot.shippedAmount)}</td>
                <td className={styles.numberCell}>{formatNumber(lot.remainingAmount)}</td>
                <td>{formatDate(lot.measuredAt)}</td>
                <td className={styles.actionArea}>
                  <button
                    className={styles.detailButton}
                    onClick={() =>
                      setSelectedLotId((current) =>
                        current === lot.id ? "" : lot.id,
                      )
                    }
                  >
                    詳細
                  </button>
                  <button
                    className={styles.editButton}
                    onClick={() => startEdit(lot)}
                  >
                    編集
                  </button>
                </td>
              </tr>
            ))}
            {filteredLots.length === 0 && (
              <tr>
                <td className={styles.emptyCell} colSpan={15}>
                  表示できるロットがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedLot && (
        <div className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <div>
              <span>選択ロット</span>
              <strong>{selectedLot.lotNo}</strong>
            </div>
            <span className={`${styles.badge} ${styles[selectedLot.flowStatus]}`}>
              {statusLabels[selectedLot.flowStatus] || selectedLot.flowStatus}
            </span>
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
            <div>
              <span>計量日</span>
              <strong>{formatDate(selectedLot.measuredAt)}</strong>
            </div>
            <div>
              <span>最終梱包日</span>
              <strong>{formatDate(selectedLot.packagedAt)}</strong>
            </div>
            <div>
              <span>最終出荷日</span>
              <strong>{formatDate(selectedLot.lastShippedAt)}</strong>
            </div>
            <div>
              <span>備考</span>
              <strong>{selectedLot.note || "-"}</strong>
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
        </div>
      )}

      {editingLot && (
        <div className={styles.editCard}>
          <h2>ロット補助情報</h2>
          <div className={styles.editGrid}>
            <label>
              材料ロットNo
              <input
                className={styles.input}
                value={editingLot.materialLotNo}
                onChange={(event) =>
                  setEditingLot({
                    ...editingLot,
                    materialLotNo: event.target.value,
                  })
                }
              />
            </label>
            <label>
              備考
              <input
                className={styles.input}
                value={editingLot.note}
                onChange={(event) =>
                  setEditingLot({ ...editingLot, note: event.target.value })
                }
              />
            </label>
          </div>
          <div className={styles.editActions}>
            <button className={styles.saveButton} onClick={saveEdit}>
              保存
            </button>
            <button className={styles.cancelButton} onClick={cancelEdit}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
