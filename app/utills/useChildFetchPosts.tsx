import { useEffect, useState } from "react";
import supabase from "../../lib/supabase";
import { Post } from "../type";

export const useChildFetchPosts = (
  shouldFetch: boolean,
  setShouldFetch: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase
          .from("posts")
          .select("*")
          .order("first_date", { ascending: true });

        if (error) throw error;

        const postsArray = (data || []).map((row) => ({
          ...row,
          id: row.id,
          orderNo: row.order_no || "",
          productCode: row.product_code || "",
          productName: row.product_name || "",
          customerName: row.customer_name || "",
          orderAmount: row.order_amount || 0,
          manufacturingDate: row.manufacturing_date || "",
          cleaningDate: row.cleaning_date || "",
          inspectionDate: row.inspection_date || "",
          measurementDate: row.measurement_date || "",
          packagingDate: row.packaging_date || "",
          deliveryDate: row.delivery_date || "",
          manufacturingLogs: row.manufacturing_logs || [],
          cleaningLogs: row.cleaning_logs || [],
          inspectionLogs: row.inspection_logs || [],
          measurementLogs: row.measurement_logs || [],
          packagingLogs: row.packaging_logs || [],
          createdBy: row.created_by || "",
          updatedBy: row.updated_by || "",
          createdAt: row.created_at || "",
          updatedAt: row.updated_at || "",
        }));

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
