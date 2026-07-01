import { useEffect, useState } from "react";
import supabase from "../../lib/supabase";
import { Post } from "../type";
import {
  buildOrderProcessProgressMap,
  buildProductionResultProgressMap,
  createEmptyProcessProgress,
  sumProcessLogs,
} from "./processProgress";

const POST_SELECT_COLUMNS =
  "id,order_no,lot_no,product_code,product_name,customer_name,order_amount,delivery_date,completion_scheduled_date,remark,delete,created_at,updated_at";

export const useChildFetchPosts = (
  shouldFetch: boolean,
  setShouldFetch: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [postResult, orderProcessResult, productionResult] =
          await Promise.all([
            supabase
              .from("posts")
              .select(POST_SELECT_COLUMNS)
              .order("created_at", {
                ascending: true,
              }),
            supabase
              .from("v_order_processes_with_master")
              .select(
                "post_id,process_name,process_order,completed_amount,completed_date",
              ),
            supabase
              .from("v_production_results_with_master")
              .select("post_id,process_name,date,amount"),
          ]);

        const { data, error } = postResult;
        if (error) throw error;
        if (orderProcessResult.error) throw orderProcessResult.error;
        if (productionResult.error) throw productionResult.error;

        const processProgressMap = buildOrderProcessProgressMap(
          orderProcessResult.data || [],
        );
        const productionResultMap = buildProductionResultProgressMap(
          productionResult.data || [],
        );

        const postsArray = (data || []).map((row) => {
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
          const orderAmount = row.order_amount || 0;
          const packagingAmount = sumProcessLogs(packagingLogs);

          return {
            ...row,
            id: row.id,
            lotNo: row.lot_no || "",
            orderNo: row.order_no || "",
            productCode: row.product_code || "",
            productName: row.product_name || "",
            customerName: row.customer_name || "",
            orderAmount,
            manufacturingDate:
              row.completion_scheduled_date ||
              row.delivery_date ||
              "",
            manufacturingAmount: sumProcessLogs(manufacturingLogs),
            cleaningDate: "",
            cleaningAmount: sumProcessLogs(cleaningLogs),
            inspectionDate: "",
            inspectionAmount: sumProcessLogs(inspectionLogs),
            measurementDate: "",
            measurementAmount: sumProcessLogs(measurementLogs),
            packagingDate: "",
            packagingAmount,
            remainingAmount: orderAmount - packagingAmount,
            deliveryDate: row.delivery_date || "",
            completionScheduledDate:
              row.completion_scheduled_date || row.delivery_date || "",
            remark: row.remark || "",
            status: "未着手" as Post["status"],
            manufacturingLogs,
            cleaningLogs,
            inspectionLogs,
            measurementLogs,
            packagingLogs,
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

    if (shouldFetch) {
      fetchData();
    }
  }, [shouldFetch, setShouldFetch]);

  return { posts };
};
