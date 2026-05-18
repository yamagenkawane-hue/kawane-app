"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import db from "@/lib/firebase";

import GanttChart from "../../components/GenttChart/GenttChart";

import styles from "./page.module.css";

import {
  Post,
  ProcessMaster,
  ProcessItem,
  CompanyCalendar,
  LineMaster,
  ProcessResult,
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
  // 休日判定
  // =========================

  const isHoliday = (date: Date, calendarData: CompanyCalendar[]) => {
    const week = date.getDay();

    // 土日
    if (week === 0 || week === 6) {
      return true;
    }

    const y = date.getFullYear();

    const m = String(date.getMonth() + 1).padStart(2, "0");

    const d = String(date.getDate()).padStart(2, "0");

    const dateStr = `${y}-${m}-${d}`;

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
          .filter((item) => item.enabled);

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
        // 工程実績
        // =========================

        const resultQuery = query(
          collection(db, "processResults"),
          where("postId", "==", currentPost.orderNo),
        );

        const resultSnap = await getDocs(resultQuery);

        console.log("resultSnap", resultSnap.docs);

        const resultData = resultSnap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<ProcessResult, "id">),
        }));

        console.log("resultData", resultData);
        // =========================
        // ガント生成
        // =========================

        const ganttList: ProcessItem[] = [];

        let currentDate = safeDate(currentPost.manufacturingDate);

        processData.forEach((process) => {
          // =========================
          // ライン能力
          // =========================

          const line = lineData.find(
            (item) => item.processId === process.processId && item.enabled,
          );

          const actualCapacity = line
            ? line.dailyCapacity * (line.operationRate / 100)
            : 1;

          // =========================
          // 工程実績
          // =========================

          const processResults = resultData
            .filter((item) => item.processId === process.processId)
            .sort((a, b) => a.date.localeCompare(b.date));

          console.log("process", process.processId, processResults);
          // =========================
          // 初期値
          // =========================

          let startDate = new Date(currentDate);

          let endDate = new Date(currentDate);

          let progress = 0;

          const orderAmount = Number(currentPost.orderAmount || 0);

          // =========================
          // 実績あり
          // =========================

          if (processResults.length > 0) {
            startDate = safeDate(processResults[0].date);

            endDate = safeDate(processResults[processResults.length - 1].date);

            const totalActual = processResults.reduce(
              (sum, item) => sum + Number(item.amount || 0),
              0,
            );

            progress =
              orderAmount > 0
                ? Math.min(100, Math.floor((totalActual / orderAmount) * 100))
                : 0;
          }

          // =========================
          // 実績なし
          // 能力予測
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
            start: startDate,
            end: endDate,
            progress,
            isDelay,
          });

          // =========================
          // 次工程開始日
          // =========================

          currentDate = getNextBusinessDay(endDate, calendarData);
        });

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
