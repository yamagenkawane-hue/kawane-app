"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import db from "../../lib/firebase";
import styles from "./page.module.css";
import { PostData } from "@/app/type";

type AdjustedPost = PostData & {
  transferSource: string;
};

const OrdersPage = () => {
  const [posts, setPosts] = useState<AdjustedPost[]>([]);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "posts"));

        const data: PostData[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<PostData, "id">),
        }));

        // =========================
        // 注残があるものだけ
        // =========================

        const filtered = data.filter((post) => {
          const completed = post.packagingAmount || 0;

          return post.orderAmount - completed > 0;
        });

        // =========================
        // 納期順
        // =========================

        filtered.sort(
          (a, b) =>
            new Date(a.deliveryDate).getTime() -
            new Date(b.deliveryDate).getTime(),
        );

        // =========================
        // 余剰使用管理
        // =========================

        const surplusStockMap: Record<string, number> = {};

        // =========================
        // 同一製品の余剰振替
        // =========================

        const adjusted: AdjustedPost[] = filtered.map((post) => {
          // 自分の完成数
          const ownCompleted = post.packagingAmount || 0;

          // 自分の注残
          const ownRemaining = post.orderAmount - ownCompleted;

          let remaining = ownRemaining;

          // 振替元ログ
          const transferLogs: string[] = [];

          // 同一製品
          const sameProducts = data.filter(
            (item) =>
              item.productName === post.productName && item.id !== post.id,
          );

          // =========================
          // 余剰在庫振替
          // =========================

          for (const item of sameProducts) {
            // 注残ゼロなら終了
            if (remaining <= 0) {
              break;
            }

            const completed = item.packagingAmount || 0;

            // 元余剰
            const originalSurplus = completed - item.orderAmount;

            // 使用済み
            const usedSurplus = surplusStockMap[item.id] || 0;

            // 残余剰
            const surplus = originalSurplus - usedSurplus;

            // 余剰なし
            if (surplus <= 0) {
              continue;
            }

            // 振替数量
            const transferAmount = surplus >= remaining ? remaining : surplus;

            // 注残減算
            remaining -= transferAmount;

            // 使用済み登録
            surplusStockMap[item.id] =
              (surplusStockMap[item.id] || 0) + transferAmount;

            // ログ追加
            transferLogs.push(`${item.orderNo} から ${transferAmount}個`);
          }

          return {
            ...post,

            // 振替後注残
            remainingAmount: remaining > 0 ? remaining : 0,

            // 振替元
            transferSource:
              transferLogs.length > 0 ? transferLogs.join(" / ") : "-",
          };
        });

        // 振替後も注残あるものだけ表示
        const visiblePosts = adjusted.filter(
          (post) => post.remainingAmount > 0,
        );

        setPosts(visiblePosts);
      } catch (error) {
        console.error(error);

        alert("データ取得失敗");
      }
    };

    fetchPosts();
  }, []);

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
        </Link>

        <h1 className={styles.title}>注残管理一覧</h1>
      </div>

      {/* テーブル */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>注番</th>

              <th>製品名</th>

              <th>得意先</th>

              <th>受注数</th>

              <th>完成数</th>

              <th>注残</th>

              <th>振替ロット</th>

              <th>状態</th>

              <th>納期</th>
            </tr>
          </thead>

          <tbody>
            {posts.map((post) => {
              const today = new Date();

              today.setHours(0, 0, 0, 0);

              const delivery = new Date(post.deliveryDate);

              delivery.setHours(0, 0, 0, 0);

              const diffDays = Math.ceil(
                (delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
              );

              let rowClass = "";

              // =========================
              // 納期警告
              // =========================

              // 赤（3日以内）
              if (diffDays <= 3 && post.remainingAmount > 0) {
                rowClass = styles.dangerRow;
              }

              // 黄（7日以内）
              else if (diffDays <= 7 && post.remainingAmount > 0) {
                rowClass = styles.warningRow;
              }

              return (
                <tr key={post.id} className={rowClass}>
                  {/* 注番 */}
                  <td>{post.orderNo}</td>

                  {/* 製品名 */}
                  <td>{post.productName}</td>

                  {/* 得意先 */}
                  <td>{post.customerName}</td>

                  {/* 受注数 */}
                  <td>{post.orderAmount}</td>

                  {/* 完成数 */}
                  <td>{post.packagingAmount || 0}</td>

                  {/* 注残 */}
                  <td className={styles.remaining}>{post.remainingAmount}</td>

                  {/* 振替ロット */}
                  <td>{post.transferSource}</td>

                  {/* 状態 */}
                  <td>{post.status}</td>

                  {/* 納期 */}
                  <td>{post.deliveryDate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrdersPage;
