"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import supabase from "@/lib/supabase";
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
    if (!date) return new Date();
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
    if (week === 0 || week === 6) return true;
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
      if (!isHoliday(result, calendarData)) added++;
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
      if (!isHoliday(result, calendarData)) break;
    }
    return result;
  };

  // =========================
  // 実績取得
  // =========================

  const getProcessLogs = (
    processId: string,
    currentPost: Post,
    resultData: ProcessResult[],
  ) => {
    const resultLogs = resultData
      .filter((result) => result.processId === processId)
      .map((result) => ({
        date: result.date,
        amount: result.amount,
      }));

    let postLogs: { date: string; amount: number }[] = [];

    switch (processId) {
      case "manufacturing":
        postLogs = currentPost.manufacturingLogs || [];
        break;
      case "cleaning":
        postLogs = currentPost.cleaningLogs || [];
        break;
      case "inspection":
        postLogs = currentPost.inspectionLogs || [];
        break;
      case "measurement":
        postLogs = currentPost.measurementLogs || [];
        break;
      case "packaging":
        postLogs = currentPost.packagingLogs || [];
        break;
      default:
        postLogs = [];
    }

    return [...postLogs, ...resultLogs];
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

        const { data: postRow, error: postError } = await supabase
          .from("posts")
          .select("*")
          .eq("id", id)
          .single();

        if (postError || !postRow) return;

        const currentPost: Post = {
          id: postRow.id,
          orderNo: postRow.order_no || "",
          productCode: postRow.product_code || "",
          lotNo: postRow.lot_no || "",
          productName: postRow.product_name || "",
          customerName: postRow.customer_name || "",
          orderAmount: postRow.order_amount || 0,
          manufacturingDate: postRow.manufacturing_date || "",
          manufacturingAmount: 0,
          cleaningDate: postRow.cleaning_date || "",
          cleaningAmount: 0,
          inspectionDate: postRow.inspection_date || "",
          inspectionAmount: 0,
          measurementDate: postRow.measurement_date || "",
          measurementAmount: 0,
          packagingDate: postRow.packaging_date || "",
          packagingAmount: 0,
          remainingAmount: postRow.remaining_amount || 0,
          deliveryDate: postRow.delivery_date || "",
          remark: postRow.remark || "",
          manufacturingLogs: postRow.manufacturing_logs || [],
          cleaningLogs: postRow.cleaning_logs || [],
          inspectionLogs: postRow.inspection_logs || [],
          measurementLogs: postRow.measurement_logs || [],
          packagingLogs: postRow.packaging_logs || [],
          days: postRow.days || [],
          status: postRow.status || "未着手",
          delete: postRow.delete || false,
          createdBy: postRow.created_by || "",
          updatedBy: postRow.updated_by || "",
          createdAt: postRow.created_at || "",
          updatedAt: postRow.updated_at || "",
        };

        setPost(currentPost);

        // =========================
        // 工程マスタ
        // =========================

        const { data: processRows, error: processError } = await supabase
          .from("process_master")
          .select("*");

        if (processError) throw processError;

        const processData: ProcessMaster[] = (processRows || [])
          .map((row) => ({
            id: row.id,
            processId: row.process_id,
            name: row.name,
            days: row.days,
            sort: row.sort,
            enabled: row.enabled,
            outsourcing: row.outsourcing || false,
          }))
          .filter((item) => item.enabled !== false);

        processData.sort((a, b) => a.sort - b.sort);

        // =========================
        // カレンダー
        // =========================

        const { data: calendarRows, error: calendarError } = await supabase
          .from("company_calendar")
          .select("*");

        if (calendarError) throw calendarError;

        const calendarData: CompanyCalendar[] = (calendarRows || []).map(
          (row) => ({
            id: row.id,
            date: row.date,
            name: row.name,
            isHoliday: row.is_holiday,
            type: row.type,
          }),
        );

        // =========================
        // ライン能力
        // =========================

        const { data: lineRows, error: lineError } = await supabase
          .from("line_master")
          .select("*");

        if (lineError) throw lineError;

        const lineData: LineMaster[] = (lineRows || []).map((row) => ({
          id: row.id,
          lineName: row.line_name,
          processId: row.process_id,
          dailyCapacity: row.daily_capacity,
          operationRate: row.operation_rate,
          enabled: row.enabled,
        }));

        // =========================
        // 現場実績
        // =========================

        let resultData: ProcessResult[] = [];

        const { data: resultRows, error: resultError } = await supabase
          .from("production_results")
          .select("*")
          .eq("post_id", id);

        if (!resultError) {
          resultData = (resultRows || []).map((row) => ({
            id: row.id,
            postId: row.post_id,
            scheduleId: row.schedule_id || "",
            processId: row.process_id,
            processName: row.process_name || "",
            date: row.date,
            amount: row.amount,
            createdAt: row.created_at || "",
          }));
        }

        // =========================
        // ガント生成
        // =========================

        const ganttList: ProcessItem[] = [];
        let currentDate = safeDate(currentPost.manufacturingDate);
        const orderAmount = Number(currentPost.orderAmount || 0);

        processData.forEach((process) => {
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

          const processResults = getProcessLogs(
            process.processId,
            currentPost,
            resultData,
          );
          processResults.sort((a, b) => a.date.localeCompare(b.date));

          const totalActual = processResults.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0,
          );

          let startDate = new Date(currentDate);
          let endDate = new Date(currentDate);
          let progress = 0;

          if (processResults.length > 0) {
            startDate = safeDate(processResults[0].date);
            progress =
              orderAmount > 0
                ? Math.min(100, Math.floor((totalActual / orderAmount) * 100))
                : 0;

            const lastActualDate = safeDate(
              processResults[processResults.length - 1].date,
            );
            const remainingAmount = Math.max(0, orderAmount - totalActual);

            if (remainingAmount <= 0) {
              endDate = lastActualDate;
            } else {
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
          } else {
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

          const delivery = safeDate(currentPost.deliveryDate);
          const isDelay = endDate.getTime() > delivery.getTime();

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

  if (!post) {
    return <div className={styles.loading}>Loading...</div>;
  }

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
