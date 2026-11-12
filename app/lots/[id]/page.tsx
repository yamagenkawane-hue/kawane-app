"use client";
import { authFetch } from "@/lib/auth/client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAppAuth } from "@/app/components/AuthProvider/AuthProvider";
import { useParams } from "next/navigation";
import supabase from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { createLotHistoryOrder, sortLotHistory, lotPackagingCompletedDate } from "@/lib/lotHistoryOrder";
import { lotHistoryBelongsTo } from "@/lib/lotHistoryIdentity";
import { lotHistoryReasonText } from "@/lib/lotHistoryText";
import styles from "../page.module.css";

type LotFlowRow = {
  id: string;
  postId: string;
  productId: string;
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
  measuredAt: string;
  packagedAt: string;
  lastShippedAt: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

type HistoryRow = {
  id: string;
  date: string;
  sortOrder: number;
  processOrder?: number;
  eventOrder?: number;
  section: "注番工程履歴" | "ロット履歴";
  action: string;
  amount: number | null;
  target: string;
  detail: string;
  shipmentId?: string;
  canCancelShipment?: boolean;
  cancelled?: boolean;
};

const HISTORY_PAGE_SIZE = 30;

const LOT_SELECT_COLUMNS = [
  "id",
  "post_id",
  "product_id",
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
  productId: String(row.product_id || ""),
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

const formatAmount = (value: number | null) =>
  value === null ? "-" : formatNumber(value);

const buildDateLabel = (label: string, value: unknown) => {
  const date = formatDate(String(value || ""));
  return date === "-" ? "" : `${label}: ${date}`;
};

const buildBaseRows = (lot: LotFlowRow): HistoryRow[] => {
  const rows: Array<HistoryRow | null> = [
    lot.measuredAmount > 0
      ? {
          id: `base-measured-${lot.id}`,
          date: lot.measuredAt || lot.createdAt,
          sortOrder: 50,
          section: "ロット履歴" as const,
          action: "計量",
          amount: lot.measuredAmount,
          target: lot.lotNo || "-",
          detail: `材料ロットNo: ${lot.materialLotNo || "-"}`,
        }
      : null,
    lot.packagedAmount > 0
      ? {
          id: `base-packaged-${lot.id}`,
          date: lot.packagedAt,
          sortOrder: 60,
          section: "ロット履歴" as const,
          action: "梱包",
          amount: lot.packagedAmount,
          target: lot.lotNo || "-",
          detail: "梱包実績から在庫登録",
        }
      : null,
    lot.inventoryAmount > 0
      ? {
          id: `base-inventory-${lot.id}`,
          date: lot.packagedAt,
          sortOrder: 70,
          section: "ロット履歴" as const,
          action: "在庫登録",
          amount: lot.inventoryAmount,
          target: lot.lotNo || "-",
          detail: `現在庫 ${formatNumber(lot.inventoryAmount)}`,
        }
      : null,
    lot.allocatedAmount > 0
      ? {
          id: `base-allocation-${lot.id}`,
          date: lot.updatedAt,
          sortOrder: 80,
          section: "ロット履歴" as const,
          action: "在庫引当",
          amount: lot.allocatedAmount,
          target: lot.orderNo || "-",
          detail: `未出荷引当 ${formatNumber(lot.allocatedAmount)}`,
        }
      : null,
    lot.shippedAmount > 0
      ? {
          id: `base-shipment-${lot.id}`,
          date: lot.lastShippedAt || lot.updatedAt,
          sortOrder: 90,
          section: "ロット履歴" as const,
          action: "出荷",
          amount: lot.shippedAmount,
          target: lot.orderNo || "-",
          detail: "ロット出荷数合計",
        }
      : null,
  ];

  return rows.filter((row): row is HistoryRow => row !== null);
};

export default function LotDetailPage() {
  const params = useParams<{ id: string }>();
  const lotId = String(params?.id || "");
  const [lot, setLot] = useState<LotFlowRow | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyPage,setHistoryPage]=useState(1);
  const historyTotalPages=Math.max(1,Math.ceil(historyRows.length/HISTORY_PAGE_SIZE));
  const currentHistoryPage=Math.min(historyPage,historyTotalPages);
  const historyStart=(currentHistoryPage-1)*HISTORY_PAGE_SIZE;
  const paginatedHistory=historyRows.slice(historyStart,historyStart+HISTORY_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [cancellingShipmentId, setCancellingShipmentId] = useState("");
  const {profile}=useAppAuth();
  const isManagerIn=Boolean(profile?.manager);
  const [message, setMessage] = useState("");

  const loadHistory = useCallback(async (targetLot: LotFlowRow) => {
    const siblingLots = await fetchAllRows((from, to) => supabase.from("lots")
      .select("id,post_id,lot_no").eq("post_id", targetLot.postId)
      .eq("lot_no", targetLot.lotNo).order("id").range(from, to));
    if (siblingLots.error) throw siblingLots.error;
    const legacyIsUnambiguous = siblingLots.data?.length === 1 && siblingLots.data[0].id === targetLot.id;
    const historyFilter = legacyIsUnambiguous && targetLot.postId
      ? `lot_id.eq.${targetLot.id},and(lot_id.is.null,post_id.eq.${targetLot.postId})`
      : `lot_id.eq.${targetLot.id}`;
    const [
      orderResult,
      lotResult,
      orderProcessResult,
      transferResult,
      inventoryResult,
      allocationResult,
      shipmentResult,
      remainderResult,
      masterResult,
    ] = await Promise.all([
      fetchAllRows((from, to) => supabase
        .from("production_results")
        .select("id,post_id,lot_id,order_process_id,process_name,date,amount,created_at")
        .eq("post_id", targetLot.postId)
        .order("date", { ascending: true }).order("id").range(from,to)),
      fetchAllRows((from, to) => supabase
        .from("production_results")
        .select("id,order_process_id,process_name,date,amount,created_at")
        .eq("lot_id", targetLot.id)
        .order("date", { ascending: true }).order("id").range(from,to)),
      fetchAllRows((from, to) => supabase
        .from("v_order_processes_with_master")
        .select(
          "id,product_process_id,process_name,process_order,subcontractor_name,outsource_sent_date,outsource_expected_return_date,outsource_returned_date,outsource_status,outsource_note,completed_amount,completed_date,updated_at",
        )
        .eq("post_id", targetLot.postId)
        .order("process_order", { ascending: true }).order("id").range(from,to)),
      fetchAllRows((from, to) => supabase
        .from("v_process_transfer_history_with_master")
        .select(
          "id,created_at,from_order_process_id,to_order_process_id,source_result_id,from_process_name,to_process_name,from_process_order,to_process_order,quantity,movement_type,before_from_quantity,after_from_quantity,correction_quantity,reason",
        )
        .eq("lot_id", targetLot.id)
        .order("created_at", { ascending: true }).order("id").range(from,to)),
      fetchAllRows((from, to) => supabase
        .from("inventory_items")
        .select("id,current_stock,allocated_stock,updated_at")
        .eq("lot_id", targetLot.id)
        .order("updated_at", { ascending: true }).order("id").range(from,to)),
      fetchAllRows((from, to) => supabase
        .from("inventory_allocations")
        .select("id,post_id,lot_id,allocated_amount,shipped_amount,confirmed_at,lot_no")
        .or(historyFilter)
        .order("confirmed_at", { ascending: true }).order("id").range(from, to)),
      fetchAllRows((from, to) => supabase
        .from("shipments")
        .select(
          "id,post_id,lot_id,quantity,scheduled_date,delivery_date,customer_name,created_at,lot_no,cancelled,cancelled_at,cancelled_reason",
        )
        .or(historyFilter)
        .order("scheduled_date", { ascending: true }).order("id").range(from, to)),
      fetchAllRows((from,to) => supabase.from("outsource_remainder_schedules").select("*,order_processes!inner(post_id)")
        .eq("order_processes.post_id",targetLot.postId).order("dispatch_no").order("id").range(from,to)),
      targetLot.productId ? fetchAllRows((from,to) => supabase.from("product_processes")
        .select("id,process_name,process_order").eq("product_id",targetLot.productId)
        .order("process_order").order("id").range(from,to)) : Promise.resolve({data:[],error:null}),
    ]);

    if(remainderResult.error) console.warn("外注分割履歴の取得に失敗",remainderResult.error);
    if (orderResult.error) console.warn("注番工程実績の取得に失敗", orderResult.error);
    if (lotResult.error) console.warn("ロット実績の取得に失敗", lotResult.error);
    if (orderProcessResult.error) console.warn("外注工程履歴の取得に失敗", orderProcessResult.error);
    if (transferResult.error) console.warn("工程移動履歴の取得に失敗", transferResult.error);
    if (inventoryResult.error) console.warn("ロット在庫履歴の取得に失敗", inventoryResult.error);
    if (allocationResult.error) console.warn("ロット引当履歴の取得に失敗", allocationResult.error);
    if (shipmentResult.error) console.warn("ロット出荷履歴の取得に失敗", shipmentResult.error);

    if (masterResult.error) throw masterResult.error;
    const processes = (orderProcessResult.data || []) as Record<string, unknown>[];
    const route = createLotHistoryOrder(processes, (masterResult.data || []) as Record<string, unknown>[]);
    const ownResults = (lotResult.error ? [] : lotResult.data || []) as Record<string, unknown>[];
    const packagedAt = lotPackagingCompletedDate(ownResults, processes, targetLot.packagedAt);
    setLot(current => current?.id === targetLot.id ? { ...current, packagedAt } : current);

    const lotResultRows = (
      (lotResult.error ? [] : lotResult.data || []) as Record<string, unknown>[]
    ).map((row) => ({
      id: `lot-result-${String(row.id || "")}`,
      processOrder: route.resolve(row.order_process_id,row.process_name), eventOrder: 10,
      date: String(row.date || row.created_at || ""),
      sortOrder: 50,
      section: "ロット履歴" as const,
      action: String(row.process_name || "実績"),
      amount: toNumber(row.amount),
      target: targetLot.lotNo || "-",
      detail: `${String(row.process_name || "工程")} 実績登録`,
    }));
    const lotResultIds = new Set(lotResultRows.map((row) => row.id.replace("lot-result-", "")));

    const orderRows = (
      (orderResult.error ? [] : orderResult.data || []) as Record<string, unknown>[]
    )
      .filter((row) => !lotResultIds.has(String(row.id || "")))
      .map((row) => ({
        id: `order-result-${String(row.id || "")}`,
        processOrder: route.resolve(row.order_process_id,row.process_name), eventOrder: 10,
        date: String(row.date || row.created_at || ""),
        sortOrder: 20,
        section: "注番工程履歴" as const,
        action: String(row.process_name || "実績"),
        amount: toNumber(row.amount),
        target: targetLot.orderNo || "-",
        detail: `${String(row.process_name || "工程")} 実績登録`,
      }));

    const remainderHistory: HistoryRow[] = ((remainderResult.data||[]) as unknown as Record<string,unknown>[]).flatMap(row=>{
      const process=((orderProcessResult.data||[]) as Record<string,unknown>[]).find(process=>process.id===row.order_process_id)||{};
      const detail=`第${process.process_order}工程 ${process.process_name} / ${process.subcontractor_name||"-"} / 分割${row.dispatch_no}${row.cancelled?"（取消）":""} / ${row.note||""}`;
      return [["sent_date","外注分割出し",30],["expected_date","外注分割戻り予定",35],["returned_date","外注分割戻り",40]].flatMap(([key,action,sortOrder])=>row[String(key)]?[{
        processOrder:route.resolve(process.id,process.process_name,process.process_order),eventOrder:Number(sortOrder),
        id:`remainder-${row.id}-${key}`,date:String(row[String(key)]),sortOrder:Number(sortOrder),section:"注番工程履歴" as const,action:String(action),amount:toNumber(row.quantity),target:targetLot.orderNo||"-",detail,
      }]:[]);
    });

    const outsourceRows = (
      (orderProcessResult.error ? [] : orderProcessResult.data || []) as Record<string, unknown>[]
    ).flatMap((row) => {
      const processName = String(row.process_name || "外注工程");
      const subcontractorName = String(row.subcontractor_name || "-");
      const note = String(row.outsource_note || "");
      const baseDetail = `${processName} / 外注先: ${subcontractorName}${note ? ` / ${note}` : ""}`;
      const rows: HistoryRow[] = [];

      if (row.outsource_sent_date) {
        rows.push({
          id: `outsource-sent-${String(row.id || "")}`,
          processOrder: route.resolve(row.id,row.process_name,row.process_order), eventOrder: 1,
          date: String(row.outsource_sent_date || ""),
          sortOrder: 30,
          section: "注番工程履歴",
          action: "外注出し",
          amount: null,
          target: targetLot.orderNo || "-",
          detail: baseDetail,
        });
      }

      if (row.outsource_expected_return_date) {
        rows.push({
          id: `outsource-expected-${String(row.id || "")}`,
          processOrder: route.resolve(row.id,row.process_name,row.process_order), eventOrder: 2,
          date: String(row.outsource_expected_return_date || ""),
          sortOrder: 35,
          section: "注番工程履歴",
          action: "外注戻り予定",
          amount: null,
          target: targetLot.orderNo || "-",
          detail: baseDetail,
        });
      }

      if (row.outsource_returned_date) {
        rows.push({
          id: `outsource-returned-${String(row.id || "")}`,
          processOrder: route.resolve(row.id,row.process_name,row.process_order), eventOrder: 3,
          date: String(row.outsource_returned_date || ""),
          sortOrder: 40,
          section: "注番工程履歴",
          action: "外注戻り",
          amount: toNumber(row.completed_amount),
          target: targetLot.orderNo || "-",
          detail: baseDetail,
        });
      }

      return rows;
    });

    const transferRows = (
      (transferResult.error ? [] : transferResult.data || []) as Record<string, unknown>[]
    ).map((row) => {
      const fromProcess = String(row.from_process_name || "開始");
      const toProcess = String(row.to_process_name || "完了");
      const movementType = String(row.movement_type || "");
      const reason = lotHistoryReasonText(row.reason);
      const beforeFromQuantity = toNumber(row.before_from_quantity);
      const afterFromQuantity = toNumber(row.after_from_quantity);
      const correctionQuantity = toNumber(row.correction_quantity);
      const isManualEdit = movementType === "manual_edit";
      const correctionDetail =
        correctionQuantity > 0
          ? ` / 補正 ${formatNumber(correctionQuantity)}`
          : "";

      return {
        id: `transfer-${String(row.id || "")}`,
        processOrder: route.resolve(row.from_order_process_id,row.from_process_name,row.from_process_order)
          || route.previous(route.resolve(row.to_order_process_id,row.to_process_name,row.to_process_order)),
        eventOrder: isManualEdit ? 15 : 20,
        date: String(row.created_at || ""),
        sortOrder: 45,
        section: "ロット履歴" as const,
        action: isManualEdit ? "数量編集" : correctionQuantity > 0 ? "補正移動" : "工程移動",
        amount: toNumber(row.quantity),
        target: targetLot.lotNo || "-",
        detail: isManualEdit
          ? `${fromProcess} / ${formatNumber(beforeFromQuantity)} → ${formatNumber(afterFromQuantity)}${reason ? ` / ${reason}` : ""}`
          : `${fromProcess} → ${toProcess}${correctionDetail}${reason ? ` / ${reason}` : ""}`,
      };
    });

    const inventoryRows = (
      (inventoryResult.error ? [] : inventoryResult.data || []) as Record<string, unknown>[]
    ).map((row) => ({
      id: `inventory-${String(row.id || "")}`,
      processOrder: route.last + 3,
      date: String(row.updated_at || row.created_at || ""),
      sortOrder: 70,
      section: "ロット履歴" as const,
      action: "在庫登録",
      amount: toNumber(row.current_stock),
      target: targetLot.lotNo || "-",
      detail: `現在庫 ${formatNumber(toNumber(row.current_stock))} / 引当済 ${formatNumber(
        toNumber(row.allocated_stock),
      )}`,
    }));

    const allocationRows = (
      (allocationResult.error ? [] : allocationResult.data || []) as Record<string, unknown>[]
    ).filter((row) => lotHistoryBelongsTo(row, targetLot, legacyIsUnambiguous)).map((row) => ({
      id: `allocation-${String(row.id || "")}`,
      processOrder: route.last + 1,
      date: String(row.confirmed_at || ""),
      sortOrder: 80,
      section: "ロット履歴" as const,
      action: "在庫引当",
      amount: toNumber(row.allocated_amount),
      target: targetLot.orderNo || "-",
      detail: `引当 ${formatNumber(toNumber(row.allocated_amount))} / 出荷済 ${formatNumber(
        toNumber(row.shipped_amount),
      )}`,
    }));

    const shipmentRows = (
      (shipmentResult.error ? [] : shipmentResult.data || []) as Record<string, unknown>[]
    ).filter((row) => lotHistoryBelongsTo(row, targetLot, legacyIsUnambiguous)).map((row) => {
      const cancelled = Boolean(row.cancelled);
      const detailParts = [
        `得意先: ${String(row.customer_name || targetLot.customerName || "-")}`,
        buildDateLabel("出荷予定", row.scheduled_date),
        buildDateLabel("納品日", row.delivery_date),
        cancelled ? buildDateLabel("取消日", row.cancelled_at) : "",
        cancelled ? `取消理由: ${String(row.cancelled_reason || "-")}` : "",
      ].filter(Boolean);

      return {
        id: `shipment-${String(row.id || "")}`,
        processOrder: route.last + 2,
        date: String(row.delivery_date || row.scheduled_date || row.created_at || ""),
        sortOrder: 90,
        section: "ロット履歴" as const,
        action: cancelled ? "出荷取消済" : "出荷",
        amount: toNumber(row.quantity),
        target: targetLot.lotNo || "-",
        detail: detailParts.join(" / "),
        shipmentId: String(row.id || ""),
        canCancelShipment: !cancelled,
        cancelled,
      };
    });

    const detailRows = [
      ...orderRows,
      ...outsourceRows,
      ...remainderHistory,
      ...transferRows,
      ...lotResultRows,
      ...inventoryRows,
      ...allocationRows,
      ...shipmentRows,
    ];
    const fallbackActions = new Set(detailRows.map((row) => row.action));
    const fallbackRows = buildBaseRows({ ...targetLot, packagedAt }).map(row => ({ ...row,
      processOrder: row.action === "在庫登録" ? route.last + 3 : row.action === "出荷" ? route.last + 2 : row.action === "在庫引当" ? route.last + 1 : route.resolve(null,row.action), eventOrder: 10,
    })).filter(
      (row) => !fallbackActions.has(row.action),
    );

    setHistoryRows(sortLotHistory([...detailRows, ...fallbackRows]));
  }, []);

  const loadLotDetail = useCallback(async () => {
    if (!lotId) return;

    try {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("v_lot_flow_status")
        .select(LOT_SELECT_COLUMNS)
        .eq("id", lotId)
        .eq("deleted", false)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setLot(null);
        setHistoryRows([]);
        setMessage("対象ロットが見つかりません");
        return;
      }

      const nextLot = mapLotRow(data as unknown as Record<string, unknown>);
      setHistoryPage(1);
      setLot(nextLot);
      await loadHistory(nextLot);
    } catch (error) {
      console.error(error);
      setMessage("ロット詳細の取得に失敗しました");
      setLot(null);
      setHistoryRows([]);
    } finally {
      setLoading(false);
    }
  }, [loadHistory, lotId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadLotDetail();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadLotDetail]);

  const handleCancelShipment = async (history: HistoryRow) => {
    if (!history.shipmentId || !lot) return;
    if (!isManagerIn) {
      alert("出荷取消は管理者のみ操作できます");
      return;
    }

    const reason = window.prompt(
      `${lot.lotNo} の出荷履歴を取り消します。理由を入力してください。`,
      "出荷数量誤入力",
    );
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      alert("取消理由を入力してください");
      return;
    }

    if(!window.confirm(`出荷数 ${formatAmount(history.amount)} を取り消し、在庫に戻します。よろしいですか？`)) return;
    try {
      setCancellingShipmentId(history.shipmentId);
      const response=await authFetch("/api/shipments",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:history.shipmentId,reason:trimmedReason})});
      if(!response.ok) {const result=await response.json();throw new Error(result.error||"出荷取消に失敗しました");}
      await loadLotDetail();
    } catch(error) {alert(error instanceof Error?error.message:"出荷取消に失敗しました");}
    finally {setCancellingShipmentId("");}
  };

  const totals = useMemo(
    () =>
      lot
        ? [
            ["製造数", lot.measuredAmount],
            ["梱包数", lot.packagedAmount],
            ["在庫数", lot.inventoryAmount],
            ["引当数", lot.allocatedAmount],
            ["出荷数", lot.shippedAmount],
            ["残数", lot.remainingAmount],
          ]
        : [],
    [lot],
  );

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/lots" className={styles.backButton}>
          ← 注番管理へ戻る
        </Link>
        <h1 className={styles.title}>注番・ロット履歴</h1>
      </div>

      {loading && <div className={styles.loading}>読み込み中...</div>}
      {message && <div className={styles.message}>{message}</div>}

      {lot && (
        <>
          <div className={styles.detailCard}>
            <div className={styles.detailHeader}>
              <div>
                <span>ロットNo</span>
                <strong>{lot.lotNo || "-"}</strong>
              </div>
            </div>

            <div className={styles.detailGrid}>
              <div>
                <span>材料ロットNo</span>
                <strong>{lot.materialLotNo || "-"}</strong>
              </div>
              <div>
                <span>注番</span>
                <strong>{lot.orderNo || "-"}</strong>
              </div>
              <div>
                <span>製品コード</span>
                <strong>{lot.productCode || "-"}</strong>
              </div>
              <div>
                <span>製品名</span>
                <strong>{lot.productName || "-"}</strong>
              </div>
              <div>
                <span>得意先</span>
                <strong>{lot.customerName || "-"}</strong>
              </div>
              <div>
                <span>製造日</span>
                <strong>{formatDate(lot.measuredAt)}</strong>
              </div>
              <div>
                <span>梱包日</span>
                <strong>{formatDate(lot.packagedAt)}</strong>
              </div>
              <div>
                <span>最終出荷日</span>
                <strong>{formatDate(lot.lastShippedAt)}</strong>
              </div>
            </div>

            <div className={styles.flowSteps}>
              {totals.map(([label, value]) => (
                <div className={styles.flowStep} key={label}>
                  <span>{label}</span>
                  <strong>{formatNumber(Number(value))}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.detailCard}>
            <div className={styles.historyArea}>
              <h2>注番工程とロットの動き</h2>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>区分</th>
                    <th>工程・処理</th>
                    <th>数量</th>
                    <th>対象</th>
                    <th>内容</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistory.map((history) => (
                    <tr key={history.id}>
                      <td>{formatDate(history.date)}</td>
                      <td>{history.section}</td>
                      <td>{history.action}</td>
                      <td className={styles.numberCell}>
                        {formatAmount(history.amount)}
                      </td>
                      <td>{history.target}</td>
                      <td>{history.detail}</td>
                      <td>
                        {history.canCancelShipment && isManagerIn ? (
                          <button
                            className={styles.cancelShipmentButton}
                            disabled={cancellingShipmentId === history.shipmentId}
                            onClick={() => handleCancelShipment(history)}
                          >
                            取消
                          </button>
                        ) : history.cancelled ? (
                          <span className={styles.cancelledBadge}>取消済</span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                  {historyRows.length === 0 && (
                    <tr>
                      <td className={styles.emptyCell} colSpan={7}>
                        表示できる履歴がありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <nav className={styles.pagination} aria-label="履歴のページ切り替え">
                <div className={styles.pageInfo}>
                  {formatNumber(historyRows.length)}件中 {formatNumber(historyRows.length?historyStart+1:0)}-
                  {formatNumber(Math.min(historyStart+HISTORY_PAGE_SIZE,historyRows.length))}件を表示
                </div>
                <div className={styles.pageActions}>
                  <button className={styles.pageButton} type="button" disabled={currentHistoryPage<=1}
                    onClick={()=>setHistoryPage(currentHistoryPage-1)}>前へ</button>
                  <span className={styles.pageNumber}>{currentHistoryPage} / {historyTotalPages}</span>
                  <button className={styles.pageButton} type="button" disabled={currentHistoryPage>=historyTotalPages}
                    onClick={()=>setHistoryPage(currentHistoryPage+1)}>次へ</button>
                </div>
              </nav>
            </div>
          </div>
        </>
      )}


    </div>
  );
}
