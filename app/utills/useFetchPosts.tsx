import { useEffect, useState } from "react";
import supabase from "../../lib/supabase";
import { LotProcessBalance, Post } from "../type";
import {
  buildOrderProcessProgressMap,
  buildOrderProcessStatusMap,
  buildOutsourceStatusDetailMap,
  buildOutsourceStatusMap,
  buildProductionResultProgressMap,
  createEmptyProcessProgress,
  getProcessLogKey,
  ProcessLog,
  sumProcessLogs,
} from "./processProgress";

const POST_SELECT_COLUMNS =
  "id,order_no,lot_no,product_code,product_name,customer_name,order_amount,delivery_date,completion_scheduled_date,remark,delete,created_at,updated_at";

const LOT_PROCESS_BALANCE_SELECT_COLUMNS =
  "id,post_id,order_no,lot_id,lot_no,material_lot_no,order_process_id,process_name,process_order,quantity,subcontractor_name";

const STOCK_IN_HISTORY_SELECT_COLUMNS =
  "id,post_id,order_no,lot_id,lot_no,material_lot_no,from_order_process_id,to_order_process_id,from_process_name,to_process_name,from_process_order,to_process_order,quantity,created_at";

const mapLotProcessBalance = (
  row: Record<string, unknown>,
): LotProcessBalance => ({
  id: String(row.id || ""),
  postId: String(row.post_id || ""),
  orderNo: String(row.order_no || ""),
  lotId: String(row.lot_id || ""),
  lotNo: String(row.lot_no || ""),
  materialLotNo: String(row.material_lot_no || ""),
  orderProcessId: String(row.order_process_id || ""),
  processName: String(row.process_name || ""),
  processOrder: Number(row.process_order || 0),
  quantity: Number(row.quantity || 0),
  subcontractorName: String(row.subcontractor_name || ""),
});

const mergeLogDates = (
  baseLogs: ProcessLog[],
  historyLogs: ProcessLog[] = [],
) => {
  const logsByDate = new Map<string, ProcessLog>();

  for (const log of [...baseLogs, ...historyLogs]) {
    if (!log.date) continue;
    const current = logsByDate.get(log.date);
    logsByDate.set(log.date, {
      date: log.date,
      amount: (current?.amount || 0) + Number(log.amount || 0),
    });
  }

  return [...logsByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

export const useFetchPosts = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [shouldFetch, setShouldFetch] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!shouldFetch) return;

      try {
        const [
          postResult,
          shipmentResult,
          orderProcessResult,
          productionResult,
          lotBalanceResult,
          inventoryResult,
          allocationResult,
          transferHistoryResult,
        ] = await Promise.all([
          supabase
            .from("posts")
            .select(POST_SELECT_COLUMNS)
            .order("created_at", { ascending: true }),
          supabase.from("shipments").select("post_id,quantity"),
          supabase
            .from("v_order_processes_with_master")
            .select(
              "post_id,process_name,process_order,planned_amount,completed_amount,completed_date,subcontractor_id,outsource_status,outsource_sent_date,outsource_returned_date",
            ),
          supabase
            .from("v_production_results_with_master")
            .select("post_id,process_name,date,amount"),
          supabase
            .from("v_lot_process_balance_with_master")
            .select(LOT_PROCESS_BALANCE_SELECT_COLUMNS)
            .order("process_order", { ascending: true }),
          supabase
            .from("v_inventory_items_with_master")
            .select("product_code,product_name,current_stock,allocated_stock"),
          supabase
            .from("v_inventory_allocations_with_master")
            .select("post_id,allocated_amount,shipped_amount"),
          supabase
            .from("v_process_transfer_history_with_master")
            .select(
              `${STOCK_IN_HISTORY_SELECT_COLUMNS},movement_type,before_from_quantity,after_from_quantity,correction_quantity`,
            ),
        ]);

        const { data, error } = postResult;

        if (error) throw error;
        if (shipmentResult.error) throw shipmentResult.error;
        if (orderProcessResult.error) throw orderProcessResult.error;
        if (productionResult.error) throw productionResult.error;
        if (lotBalanceResult.error) throw lotBalanceResult.error;
        if (inventoryResult.error) throw inventoryResult.error;
        if (allocationResult.error) throw allocationResult.error;
        if (transferHistoryResult.error) throw transferHistoryResult.error;

        const shippedMap = new Map<string, number>();
        for (const row of shipmentResult.data || []) {
          const postId = row.post_id || "";
          shippedMap.set(
            postId,
            (shippedMap.get(postId) || 0) + Number(row.quantity || 0),
          );
        }

        const lotBalancesByPost = new Map<string, LotProcessBalance[]>();
        for (const row of lotBalanceResult.data || []) {
          const balance = mapLotProcessBalance(row as Record<string, unknown>);
          if (!balance.postId) continue;
          lotBalancesByPost.set(balance.postId, [
            ...(lotBalancesByPost.get(balance.postId) || []),
            balance,
          ]);
        }

        const inventoryByProduct = new Map<
          string,
          { currentStock: number; allocatedStock: number }
        >();
        for (const row of inventoryResult.data || []) {
          const key = String(row.product_code || row.product_name || "");
          if (!key) continue;
          const current = inventoryByProduct.get(key) || {
            currentStock: 0,
            allocatedStock: 0,
          };
          inventoryByProduct.set(key, {
            currentStock:
              current.currentStock + Number(row.current_stock || 0),
            allocatedStock:
              current.allocatedStock + Number(row.allocated_stock || 0),
          });
        }

        const allocationByPost = new Map<
          string,
          { allocatedAmount: number; shippedAmount: number }
        >();
        for (const row of allocationResult.data || []) {
          const postId = String(row.post_id || "");
          if (!postId) continue;
          const current = allocationByPost.get(postId) || {
            allocatedAmount: 0,
            shippedAmount: 0,
          };
          allocationByPost.set(postId, {
            allocatedAmount:
              current.allocatedAmount + Number(row.allocated_amount || 0),
            shippedAmount:
              current.shippedAmount + Number(row.shipped_amount || 0),
          });
        }

        const quantityAdjustmentByPost = new Map<string, number>();
        const completedBalancesByPost = new Map<string, LotProcessBalance[]>();
        const transferDateProgressMap = new Map<
          string,
          ReturnType<typeof createEmptyProcessProgress>
        >();
        for (const row of transferHistoryResult.data || []) {
          const postId = String(row.post_id || "");
          if (!postId) continue;

          const movementType = String(row.movement_type || "");
          const transferDate = String(row.created_at || "").slice(0, 10);
          const toLogKey = getProcessLogKey(
            String(row.to_process_name || ""),
            Number(row.to_process_order || 0),
          );
          const fromLogKey = getProcessLogKey(
            String(row.from_process_name || ""),
            Number(row.from_process_order || 0),
          );

          if (
            transferDate &&
            (movementType === "manufacturing_result" ||
              movementType === "process_transfer" ||
              movementType === "quantity_correction")
          ) {
            const progress =
              transferDateProgressMap.get(postId) || createEmptyProcessProgress();
            const logKey = toLogKey || fromLogKey;
            if (logKey) {
              progress[logKey].push({
                date: transferDate,
                amount: 0,
              });
              transferDateProgressMap.set(postId, progress);
            }
          }

          if (movementType === "stock_in") {
            const completedBalance: LotProcessBalance = {
              id: String(row.id || ""),
              postId,
              orderNo: String(row.order_no || ""),
              lotId: String(row.lot_id || ""),
              lotNo: String(row.lot_no || ""),
              materialLotNo: String(row.material_lot_no || ""),
              orderProcessId: String(row.from_order_process_id || ""),
              processName: String(row.from_process_name || "梱包"),
              processOrder: Number(row.from_process_order || 0),
              quantity: Number(row.quantity || 0),
              subcontractorName: "",
              isCompleted: true,
              completedDate: String(row.created_at || "").slice(0, 10),
            };

            completedBalancesByPost.set(postId, [
              ...(completedBalancesByPost.get(postId) || []),
              completedBalance,
            ]);
          }

          const beforeQuantity = Number(row.before_from_quantity || 0);
          const afterQuantity = Number(row.after_from_quantity || 0);
          const correctionQuantity = Number(row.correction_quantity || 0);
          const manualDecrease =
            movementType === "manual_edit"
              ? Math.max(0, beforeQuantity - afterQuantity)
              : 0;
          const transferCorrection =
            movementType === "quantity_correction"
              ? Math.max(0, correctionQuantity)
              : 0;
          const adjustmentAmount = manualDecrease + transferCorrection;

          if (adjustmentAmount <= 0) continue;

          quantityAdjustmentByPost.set(
            postId,
            (quantityAdjustmentByPost.get(postId) || 0) + adjustmentAmount,
          );
        }

        const processProgressMap = buildOrderProcessProgressMap(
          orderProcessResult.data || [],
        );
        const outsourceStatusMap = buildOutsourceStatusMap(
          orderProcessResult.data || [],
        );
        const outsourceStatusDetailMap = buildOutsourceStatusDetailMap(
          orderProcessResult.data || [],
        );
        const orderProcessStatusMap = buildOrderProcessStatusMap(
          orderProcessResult.data || [],
        );
        const productionResultMap = buildProductionResultProgressMap(
          productionResult.data || [],
        );

        const postsArray: Post[] = (data || []).map((row) => {
          // =========================
          // 日別実績
          // =========================
          const processProgress =
            processProgressMap.get(row.id) || createEmptyProcessProgress();
          const productionProgress =
            productionResultMap.get(row.id) || createEmptyProcessProgress();
          const transferDateProgress =
            transferDateProgressMap.get(row.id) || createEmptyProcessProgress();
          const baseManufacturingLogs =
            processProgress.manufacturingLogs.length > 0
              ? processProgress.manufacturingLogs
              : productionProgress.manufacturingLogs;
          const baseCleaningLogs =
            processProgress.cleaningLogs.length > 0
              ? processProgress.cleaningLogs
              : productionProgress.cleaningLogs;
          const baseInspectionLogs =
            processProgress.inspectionLogs.length > 0
              ? processProgress.inspectionLogs
              : productionProgress.inspectionLogs;
          const baseMeasurementLogs =
            processProgress.measurementLogs.length > 0
              ? processProgress.measurementLogs
              : productionProgress.measurementLogs;
          const basePackagingLogs =
            processProgress.packagingLogs.length > 0
              ? processProgress.packagingLogs
              : productionProgress.packagingLogs;
          const manufacturingLogs = mergeLogDates(
            baseManufacturingLogs,
            transferDateProgress.manufacturingLogs,
          );
          const cleaningLogs = mergeLogDates(
            baseCleaningLogs,
            transferDateProgress.cleaningLogs,
          );
          const inspectionLogs = mergeLogDates(
            baseInspectionLogs,
            transferDateProgress.inspectionLogs,
          );
          const measurementLogs = mergeLogDates(
            baseMeasurementLogs,
            transferDateProgress.measurementLogs,
          );
          const packagingLogs = mergeLogDates(
            basePackagingLogs,
            transferDateProgress.packagingLogs,
          );

          // =========================
          // 合計数量
          // =========================
          const manufacturingAmount = sumProcessLogs(manufacturingLogs);
          const cleaningAmount = sumProcessLogs(cleaningLogs);
          const inspectionAmount = sumProcessLogs(inspectionLogs);
          const measurementAmount = sumProcessLogs(measurementLogs);
          const packagingAmount = sumProcessLogs(packagingLogs);

          // =========================
          // 受注数量
          // =========================
          const orderAmount = row.order_amount || 0;

          // =========================
          // 注残
          // =========================
          const remainingAmount = orderAmount - packagingAmount;
          const allocationSummary = allocationByPost.get(row.id);
          const shippedAmount =
            shippedMap.get(row.id) || allocationSummary?.shippedAmount || 0;
          const productInventory =
            inventoryByProduct.get(row.product_code || "") ||
            inventoryByProduct.get(row.product_name || "") ||
            { currentStock: 0, allocatedStock: 0 };
          const allocatedAmount =
            allocationSummary?.allocatedAmount || productInventory.allocatedStock;
          const quantityAdjustmentAmount =
            quantityAdjustmentByPost.get(row.id) || 0;
          const stockDifferenceAmount =
            productInventory.currentStock - Number(orderAmount || 0);

          // =========================
          // 状態
          // =========================
          const processStatus = orderProcessStatusMap.get(row.id);
          const outsourceStatus = outsourceStatusDetailMap.get(row.id);
          let status: Post["status"] = "未着手";
          if (packagingAmount >= orderAmount && orderAmount > 0) {
            status = "出荷OK";
          } else if (
            processStatus &&
            (!outsourceStatus || processStatus.processOrder > outsourceStatus.processOrder)
          ) {
            status = processStatus.status as Post["status"];
          } else if (outsourceStatus) {
            status = outsourceStatus.status as Post["status"];
          } else if (processStatus) {
            status = processStatus.status as Post["status"];
          } else if (outsourceStatusMap.has(row.id)) {
            status = outsourceStatusMap.get(row.id) as Post["status"];
          }

          return {
            id: row.id,
            orderNo: row.order_no || "",
            lotNo: row.lot_no || "",
            productCode: row.product_code || "",
            productName: row.product_name || "",
            customerName: row.customer_name || "",
            orderAmount,
            manufacturingDate:
              row.completion_scheduled_date ||
              row.delivery_date ||
              "",
            manufacturingAmount,
            cleaningDate: "",
            cleaningAmount,
            inspectionDate: "",
            inspectionAmount,
            measurementDate: "",
            measurementAmount,
            packagingDate: "",
            packagingAmount,
            shippedAmount,
            inventoryAmount: productInventory.currentStock,
            allocatedAmount,
            stockDifferenceAmount,
            quantityAdjustmentAmount,
            lotProcessBalances: [
              ...(lotBalancesByPost.get(row.id) || []),
              ...(completedBalancesByPost.get(row.id) || []),
            ],
            remainingAmount,
            deliveryDate: row.delivery_date || "",
            completionScheduledDate:
              row.completion_scheduled_date || row.delivery_date || "",
            remark: row.remark || "",
            manufacturingLogs,
            cleaningLogs,
            inspectionLogs,
            measurementLogs,
            packagingLogs,
            status,
            delete: row.delete || false,
            createdBy: "",
            updatedBy: "",
            createdAt: row.created_at || "",
            updatedAt: row.updated_at || "",
            days: [],
          };
        });

        setPosts(postsArray);
        setShouldFetch(false);
      } catch (error) {
        console.error("データ取得エラー", error);
      }
    };

    fetchData();
  }, [shouldFetch]);

  return {
    posts,
    setShouldFetch,
  };
};
