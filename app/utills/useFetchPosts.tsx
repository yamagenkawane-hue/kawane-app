import { collection, getDocs, orderBy, query } from "firebase/firestore";

import { useEffect, useState } from "react";

import db from "../../lib/firebase";

import { Post } from "../type";

export const useFetchPosts = () => {
  const [posts, setPosts] = useState<Post[]>([]);

  const [shouldFetch, setShouldFetch] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!shouldFetch) return;

      try {
        // posts コレクション
        const postData = collection(db, "posts");

        // 作成日順
        const q = query(postData, orderBy("createdAt", "asc"));

        // Firestore取得
        const querySnapshot = await getDocs(q);

        // データ変換
        const postsArray: Post[] = querySnapshot.docs.map((doc) => {
          const data = doc.data();

          // 数量
          const orderAmount = data.orderAmount || 0;

          const packagingAmount = data.packagingAmount || 0;

          // 注残再計算
          const remainingAmount = orderAmount - packagingAmount;

          // 状態再計算
          let status: Post["status"] = "未着手";

          if (packagingAmount >= orderAmount && orderAmount > 0) {
            status = "出荷完了";
          } else if (packagingAmount > 0) {
            status = "梱包中";
          } else if (data.measurementAmount > 0) {
            status = "測量中";
          } else if (data.inspectionAmount > 0) {
            status = "検査中";
          } else if (data.cleaningAmount > 0) {
            status = "洗浄中";
          } else if (data.manufacturingAmount > 0) {
            status = "製造中";
          }

          return {
            id: doc.id,

            // 注番
            orderNo: data.orderNo || "",

            // 製品情報
            productCode: data.productCode || "",

            productName: data.productName || "",

            // 客先
            customerName: data.customerName || "",

            // 受注数量
            orderAmount,

            // =========================
            // 製造
            // =========================
            manufacturingDate: data.manufacturingDate || "",

            manufacturingAmount: data.manufacturingAmount || 0,

            // =========================
            // 洗浄
            // =========================
            cleaningDate: data.cleaningDate || "",

            cleaningAmount: data.cleaningAmount || 0,

            // =========================
            // 検査
            // =========================
            inspectionDate: data.inspectionDate || "",

            inspectionAmount: data.inspectionAmount || 0,

            // =========================
            // 測量
            // =========================
            measurementDate: data.measurementDate || "",

            measurementAmount: data.measurementAmount || 0,

            // =========================
            // 梱包
            // =========================
            packagingDate: data.packagingDate || "",

            packagingAmount,

            // 注残
            remainingAmount,

            // 納期
            deliveryDate: data.deliveryDate || "",

            // 備考
            remark: data.remark || "",

            // 状態
            status,

            // 並び替え用
            firstDate: data.firstDate || data.createdAt || "",

            // 論理削除
            delete: data.delete || false,

            // 作成情報
            createdBy: data.createdBy || "",

            updatedBy: data.updatedBy || "",

            createdAt: data.createdAt || "",

            updatedAt: data.updatedAt || "",
          };
        });

        setPosts(postsArray);

        // 更新停止
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
