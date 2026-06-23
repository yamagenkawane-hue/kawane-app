import { useEffect, useState } from "react";
import supabase from "../../lib/supabase";
import { Post } from "../type";
import {
  buildOrderProcessProgressMap,
  buildProductionResultProgressMap,
  createEmptyProcessProgress,
  sumProcessLogs,
} from "./processProgress";

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
            supabase.from("posts").select("*").order("first_date", {
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

          return {
            ...row,
            id: row.id,
            orderNo: row.order_no || "",
            productCode: row.product_code || "",
            productName: row.product_name || "",
            customerName: row.customer_name || "",
            orderAmount: row.order_amount || 0,
            manufacturingDate: row.manufacturing_date || "",
            manufacturingAmount: sumProcessLogs(manufacturingLogs),
            cleaningDate: row.cleaning_date || "",
            cleaningAmount: sumProcessLogs(cleaningLogs),
            inspectionDate: row.inspection_date || "",
            inspectionAmount: sumProcessLogs(inspectionLogs),
            measurementDate: row.measurement_date || "",
            measurementAmount: sumProcessLogs(measurementLogs),
            packagingDate: row.packaging_date || "",
            packagingAmount: sumProcessLogs(packagingLogs),
            deliveryDate: row.delivery_date || "",
            manufacturingLogs,
            cleaningLogs,
            inspectionLogs,
            measurementLogs,
            packagingLogs,
            createdBy: row.created_by || "",
            updatedBy: row.updated_by || "",
            createdAt: row.created_at || "",
            updatedAt: row.updated_at || "",
          };
        });

        setPosts(postsArray as Post[]);
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
