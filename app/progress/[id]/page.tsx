"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { collection, doc, getDoc, getDocs } from "firebase/firestore";

import db from "@/lib/firebase";

import GanttChart from "../../components/GenttChart/GenttChart";

import styles from "./page.module.css";

import {
  Post,
  ProcessMaster,
  ProcessItem,
  CompanyCalendar,
  LineMaster,
} from "@/app/type";

export default function ProgressDetail() {
  const params = useParams();

  const id = Array.isArray(params?.id) ? params.id[0] : params?.id || "";

  const [post, setPost] = useState<Post | null>(null);

  const [ganttProcesses, setGanttProcesses] = useState<ProcessItem[]>([]);

  // =========================
  // 日付変換
  // =========================

  const safeDate = (date?: string) => {
    if (!date) {
      return new Date();
    }

    const parts = date.split("-");

    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  };

  // =========================
  // YYYY-MM-DD
  // =========================

  const formatDate = (date: Date) => {
    const y = date.getFullYear();

    const m = String(date.getMonth() + 1).padStart(2, "0");

    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
  };

  // =========================
  // 休日判定
  // =========================

  const isHoliday = (date: Date, calendarData: CompanyCalendar[]) => {
    const week = date.getDay();

    if (week === 0 || week === 6) {
      return true;
    }

    const dateStr = formatDate(date);

    return calendarData.some((item) => item.date === dateStr && item.isHoliday);
  };

  // =========================
  // 営業日加算
  // =========================

  const addBusinessDays = (
    startDate: Date,
    days: number,
    calendarData: CompanyCalendar[],
  ) => {
    const result = new Date(startDate);

    let added = 0;

    while (added < days) {
      result.setDate(result.getDate() + 1);

      if (!isHoliday(result, calendarData)) {
        added++;
      }
    }

    return result;
  };

  // =========================
  // 次営業日取得
  // =========================

  const getNextBusinessDay = (date: Date, calendarData: CompanyCalendar[]) => {
    const result = new Date(date);

    while (true) {
      result.setDate(result.getDate() + 1);

      if (!isHoliday(result, calendarData)) {
        break;
      }
    }

    return result;
  };

  // =========================
  // 実績取得
  // =========================

  const getProcessLogs = (processId: string, currentPost: Post) => {
    switch (processId) {
      case "manufacturing":
        return currentPost.manufacturingLogs || [];

      case "cleaning":
        return currentPost.cleaningLogs || [];

      case "inspection":
        return currentPost.inspectionLogs || [];

      case "measurement":
        return currentPost.measurementLogs || [];

      case "packaging":
        return currentPost.packagingLogs || [];

      default:
        return [];
    }
  };

  // =========================
  // データ取得
  // =========================

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        // =========================
        // 投稿
        // =========================

        const postSnap = await getDoc(doc(db, "posts", id));

        if (!postSnap.exists()) {
          return;
        }

        const currentPost = {
          id: postSnap.id,
          ...(postSnap.data() as Omit<Post, "id">),
        };

        setPost(currentPost);

        // =========================
        // 工程マスタ
        // =========================

        const processSnap = await getDocs(collection(db, "processMaster"));

        const processData = processSnap.docs
          .map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<ProcessMaster, "id">),
          }))
          .filter((item) => item.enabled !== false);

        processData.sort((a, b) => a.sort - b.sort);

        // =========================
        // カレンダー
        // =========================

        const calendarSnap = await getDocs(collection(db, "calendar"));

        const calendarData = calendarSnap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<CompanyCalendar, "id">),
        }));

        // =========================
        // ライン能力
        // =========================

        const lineSnap = await getDocs(collection(db, "lineMaster"));

        const lineData = lineSnap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<LineMaster, "id">),
        }));

        // =========================
        // ガント生成
        // =========================

        const ganttList: ProcessItem[] = [];

        let currentDate = safeDate(currentPost.manufacturingDate);

        const orderAmount = Number(currentPost.orderAmount || 0);

        processData.forEach((process) => {
          // =========================
          // ライン能力
          // =========================

          const line = lineData.find(
            (item) =>
              item.processId === process.processId && item.enabled !== false,
          );

          const dailyCapacity = Number(line?.dailyCapacity || 1);

          const operationRate = Number(line?.operationRate || 100);

          const actualCapacity = Math.max(
            1,
            dailyCapacity * (operationRate / 100),
          );

          // =========================
          // 工程実績
          // =========================

          const processResults = getProcessLogs(process.processId, currentPost);

          processResults.sort((a, b) => a.date.localeCompare(b.date));

          // =========================
          // 実績数量
          // =========================

          const totalActual = processResults.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0,
          );

          // =========================
          // 初期値
          // =========================

          let startDate = new Date(currentDate);

          let endDate = new Date(currentDate);

          let progress = 0;

          // =========================
          // 実績あり
          // =========================

          if (processResults.length > 0) {
            // 実績開始日
            startDate = safeDate(processResults[0].date);

            // 進捗率
            progress =
              orderAmount > 0
                ? Math.min(100, Math.floor((totalActual / orderAmount) * 100))
                : 0;

            // 実績最終日
            const lastActualDate = safeDate(
              processResults[processResults.length - 1].date,
            );

            // 残数量
            const remainingAmount = Math.max(0, orderAmount - totalActual);

            // 完了済み
            if (remainingAmount <= 0) {
              endDate = lastActualDate;
            }

            // 未完了
            else {
              const remainingDays = Math.max(
                1,
                Math.ceil(remainingAmount / actualCapacity),
              );

              endDate = addBusinessDays(
                lastActualDate,
                remainingDays,
                calendarData,
              );
            }
          }

          // =========================
          // 実績なし
          // =========================
          else {
            const requiredDays = Math.max(
              1,
              Math.ceil(orderAmount / actualCapacity),
            );

            endDate = addBusinessDays(
              startDate,
              requiredDays - 1,
              calendarData,
            );

            progress = 0;
          }

          // =========================
          // 遅延判定
          // =========================

          const delivery = safeDate(currentPost.deliveryDate);

          const isDelay = endDate.getTime() > delivery.getTime();

          // =========================
          // ガント追加
          // =========================

          ganttList.push({
            id: process.processId,
            name: process.name,

            actualStart: startDate,

            actualEnd:
              progress >= 100
                ? endDate
                : processResults.length > 0
                  ? safeDate(processResults[processResults.length - 1].date)
                  : null,

            predictedEnd: endDate,

            progress,

            isDelay,

            completedAmount: totalActual,

            remainingAmount: Math.max(0, orderAmount - totalActual),
          });

          // =========================
          // 次工程開始日
          // =========================

          currentDate = getNextBusinessDay(endDate, calendarData);
        });

        console.log("ganttList", ganttList);

        setGanttProcesses(ganttList);
      } catch (error) {
        console.error(error);
      }
    };

    fetchData();
  }, [id]);

  // =========================
  // Loading
  // =========================

  if (!post) {
    return <div className={styles.loading}>Loading...</div>;
  }

  // =========================
  // Render
  // =========================

  return (
    <div className={styles.container}>
      {/* 戻る */}
      <div className={styles.backArea}>
        <Link href="/reservation" className={styles.backButton}>
          ← 戻る
        </Link>
      </div>

      {/* ヘッダー */}
      <div className={styles.headerCard}>
        <h1 className={styles.title}>{post.productName}</h1>

        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <span className={styles.label}>得意先</span>

            <span className={styles.value}>{post.customerName}</span>
          </div>

          <div className={styles.infoCard}>
            <span className={styles.label}>数量</span>

            <span className={styles.value}>{post.orderAmount}</span>
          </div>

          <div className={styles.infoCard}>
            <span className={styles.label}>納期</span>

            <span className={styles.value}>{post.deliveryDate}</span>
          </div>
        </div>
      </div>

      {/* ガント */}
      <div className={styles.ganttCard}>
        <h2 className={styles.ganttTitle}>工程ガント</h2>

        <GanttChart
          processes={ganttProcesses}
          deliveryDate={post.deliveryDate}
        />
      </div>
    </div>
  );
}
