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

          // =========================
          // 日別実績
          // =========================
          const manufacturingLogs = data.manufacturingLogs || [];

          const cleaningLogs = data.cleaningLogs || [];

          const inspectionLogs = data.inspectionLogs || [];

          const measurementLogs = data.measurementLogs || [];

          const packagingLogs = data.packagingLogs || [];

          // =========================
          // 合計数量
          // =========================
          const manufacturingAmount = manufacturingLogs.reduce(
            (
              sum: number,
              log: {
                amount: number;
              },
            ) => sum + log.amount,
            0,
          );

          const cleaningAmount = cleaningLogs.reduce(
            (
              sum: number,
              log: {
                amount: number;
              },
            ) => sum + log.amount,
            0,
          );

          const inspectionAmount = inspectionLogs.reduce(
            (
              sum: number,
              log: {
                amount: number;
              },
            ) => sum + log.amount,
            0,
          );

          const measurementAmount = measurementLogs.reduce(
            (
              sum: number,
              log: {
                amount: number;
              },
            ) => sum + log.amount,
            0,
          );

          const packagingAmount = packagingLogs.reduce(
            (
              sum: number,
              log: {
                amount: number;
              },
            ) => sum + log.amount,
            0,
          );

          // =========================
          // 受注数量
          // =========================
          const orderAmount = data.orderAmount || 0;

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

            manufacturingAmount,

            // =========================
            // 洗浄
            // =========================
            cleaningDate: data.cleaningDate || "",

            cleaningAmount,

            // =========================
            // 検査
            // =========================
            inspectionDate: data.inspectionDate || "",

            inspectionAmount,

            // =========================
            // 測量
            // =========================
            measurementDate: data.measurementDate || "",

            measurementAmount,

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

            // =========================
            // 日別実績
            // =========================
            manufacturingLogs,

            cleaningLogs,

            inspectionLogs,

            measurementLogs,

            packagingLogs,

            // 状態
            status,

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
