import { useEffect, useState } from "react";
import supabase from "../../lib/supabase";
import { Post } from "../type";
import {
  buildOrderProcessProgressMap,
  buildOrderProcessStatusMap,
  buildOutsourceStatusDetailMap,
  buildOutsourceStatusMap,
  buildProductionResultProgressMap,
  createEmptyProcessProgress,
  sumProcessLogs,
} from "./processProgress";

const POST_SELECT_COLUMNS =
  "id,order_no,lot_no,product_code,product_name,customer_name,order_amount,manufacturing_date,delivery_date,completion_scheduled_date,remark,delete,created_by,updated_by,created_at,updated_at,days";

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
        ]);

        const { data, error } = postResult;

        if (error) throw error;
        if (shipmentResult.error) throw shipmentResult.error;
        if (orderProcessResult.error) throw orderProcessResult.error;
        if (productionResult.error) throw productionResult.error;

        const shippedMap = new Map<string, number>();
        for (const row of shipmentResult.data || []) {
          const postId = row.post_id || "";
          shippedMap.set(
            postId,
            (shippedMap.get(postId) || 0) + Number(row.quantity || 0),
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
          const shippedAmount = shippedMap.get(row.id) || 0;

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
              row.manufacturing_date ||
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
            createdBy: row.created_by || "",
            updatedBy: row.updated_by || "",
            createdAt: row.created_at || "",
            updatedAt: row.updated_at || "",
            days: row.days || [],
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
