import { useEffect, useState } from "react";
import supabase from "../../lib/supabase";
import { Post } from "../type";

export const useFetchPosts = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [shouldFetch, setShouldFetch] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!shouldFetch) return;

      try {
        const { data, error } = await supabase
          .from("posts")
          .select("*")
          .order("created_at", { ascending: true });

        if (error) throw error;

        const postsArray: Post[] = (data || []).map((row) => {
          // =========================
          // 日別実績
          // =========================
          const manufacturingLogs = row.manufacturing_logs || [];
          const cleaningLogs = row.cleaning_logs || [];
          const inspectionLogs = row.inspection_logs || [];
          const measurementLogs = row.measurement_logs || [];
          const packagingLogs = row.packaging_logs || [];

          // =========================
          // 合計数量
          // =========================
          const manufacturingAmount = manufacturingLogs.reduce(
            (sum: number, log: { amount: number }) => sum + log.amount,
            0,
          );
          const cleaningAmount = cleaningLogs.reduce(
            (sum: number, log: { amount: number }) => sum + log.amount,
            0,
          );
          const inspectionAmount = inspectionLogs.reduce(
            (sum: number, log: { amount: number }) => sum + log.amount,
            0,
          );
          const measurementAmount = measurementLogs.reduce(
            (sum: number, log: { amount: number }) => sum + log.amount,
            0,
          );
          const packagingAmount = packagingLogs.reduce(
            (sum: number, log: { amount: number }) => sum + log.amount,
            0,
          );

          // =========================
          // 受注数量
          // =========================
          const orderAmount = row.order_amount || 0;

          // =========================
          // 注残
          // =========================
          const remainingAmount = orderAmount - packagingAmount;

          // =========================
          // 状態
          // =========================
          let status: Post["status"] = "未着手";
          if (packagingAmount >= orderAmount && orderAmount > 0) {
            status = "出荷OK";
          } else if (packagingAmount > 0) {
            status = "梱包中";
          } else if (measurementAmount > 0) {
            status = "測量中";
          } else if (inspectionAmount > 0) {
            status = "検査中";
          } else if (cleaningAmount > 0) {
            status = "洗浄中";
          } else if (manufacturingAmount > 0) {
            status = "製造中";
          }

          return {
            id: row.id,
            orderNo: row.order_no || "",
            lotNo: row.lot_no || "",
            productCode: row.product_code || "",
            productName: row.product_name || "",
            customerName: row.customer_name || "",
            orderAmount,
            manufacturingDate: row.manufacturing_date || "",
            manufacturingAmount,
            cleaningDate: row.cleaning_date || "",
            cleaningAmount,
            inspectionDate: row.inspection_date || "",
            inspectionAmount,
            measurementDate: row.measurement_date || "",
            measurementAmount,
            packagingDate: row.packaging_date || "",
            packagingAmount,
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
