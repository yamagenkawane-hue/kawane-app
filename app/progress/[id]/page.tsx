"use client";

import { useCallback, useEffect, useState } from "react";
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
  OrderProcess,
  AiPredictionSettings,
} from "@/app/type";

const POST_SELECT_COLUMNS =
  "id,order_no,product_code,lot_no,product_name,customer_name,order_amount,remaining_amount,delivery_date,completion_scheduled_date,remark,status,delete,created_at,updated_at";

const PROCESS_SELECT_COLUMNS =
  "id,process_id,name,days,sort,enabled,outsourcing";

const CALENDAR_SELECT_COLUMNS =
  "id,date,name,is_holiday,type";

const LINE_SELECT_COLUMNS =
  "id,line_name,process_id,daily_capacity,operation_rate,enabled";

const RESULT_SELECT_COLUMNS =
  "id,post_id,schedule_id,order_process_id,process_id,process_name,date,amount,created_at";

const ORDER_PROCESS_SELECT_COLUMNS =
  "id,post_id,product_id,customer_id,product_process_id,order_no,product_code,product_name,customer_name,process_name,process_order,planned_amount,completed_amount,completed_date,subcontractor_id,subcontractor_name,outsource_sent_date,outsource_expected_return_date,outsource_returned_date,outsource_status,outsource_note,locked,created_at,updated_at";

const DIRECT_ORDER_PROCESS_SELECT_COLUMNS =
  "id,post_id,order_no,product_code,product_name,customer_name,process_name,process_order,planned_amount,completed_amount,completed_date,subcontractor_id,locked,created_at,updated_at";

const AI_SETTINGS_SELECT_COLUMNS =
  "id,enabled,target_outsource_delay,target_shipping_delay,target_line_load,strength,use_line_operation_rate,use_past_results,use_outsource_process,use_holidays,use_current_delay,use_process_average_delay,updated_at";

const DEFAULT_AI_SETTINGS: AiPredictionSettings = {
  id: "global",
  enabled: true,
  targetOutsourceDelay: true,
  targetShippingDelay: true,
  targetLineLoad: true,
  strength: "standard",
  useLineOperationRate: true,
  usePastResults: false,
  useOutsourceProcess: true,
  useHolidays: true,
  useCurrentDelay: true,
  useProcessAverageDelay: false,
};

const mapAiSettings = (row: Record<string, unknown> | null): AiPredictionSettings => {
  if (!row) return DEFAULT_AI_SETTINGS;

  return {
    id: String(row.id || "global"),
    enabled: Boolean(row.enabled),
    targetOutsourceDelay: Boolean(row.target_outsource_delay),
    targetShippingDelay: Boolean(row.target_shipping_delay),
    targetLineLoad: Boolean(row.target_line_load),
    strength:
      row.strength === "weak" || row.strength === "strong"
        ? row.strength
        : "standard",
    useLineOperationRate: Boolean(row.use_line_operation_rate),
    usePastResults: Boolean(row.use_past_results),
    useOutsourceProcess: Boolean(row.use_outsource_process),
    useHolidays: Boolean(row.use_holidays),
    useCurrentDelay: Boolean(row.use_current_delay),
    useProcessAverageDelay: Boolean(row.use_process_average_delay),
    updatedAt: String(row.updated_at || ""),
  };
};

const getStrengthDelayDays = (settings: AiPredictionSettings) => {
  if (settings.strength === "weak") return 1;
  if (settings.strength === "strong") return 3;
  return 2;
};

const getLineLoadRate = (settings: AiPredictionSettings) => {
  if (!settings.enabled || !settings.targetLineLoad) return 1;
  if (settings.strength === "weak") return 0.95;
  if (settings.strength === "strong") return 0.8;
  return 0.9;
};

export default function ProgressDetail() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id || "";

  const [post, setPost] = useState<Post | null>(null);
  const [loadError, setLoadError] = useState("");
  const [ganttProcesses, setGanttProcesses] = useState<ProcessItem[]>([]);
  const [ganttCalendar, setGanttCalendar] = useState<CompanyCalendar[]>([]);

  // =========================
  // 日付変換
  // =========================

  const safeDate = useCallback((date?: string) => {
    if (!date) return new Date();
    const parts = date.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }, []);

  // =========================
  // YYYY-MM-DD
  // =========================

  const formatDate = useCallback((date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  // =========================
  // 休日判定
  // =========================

  const isHoliday = useCallback((date: Date, calendarData: CompanyCalendar[]) => {
    const dateStr = formatDate(date);
    const calendarItem = calendarData.find((item) => item.date === dateStr);
    if (calendarItem) return calendarItem.isHoliday;
    const week = date.getDay();
    if (week === 0 || week === 6) return true;
    return false;
  }, [formatDate]);

  // =========================
  // 営業日加算
  // =========================

  const addBusinessDays = useCallback((
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
  }, [isHoliday]);

  // =========================
  // 次営業日取得
  // =========================

  const getNextBusinessDay = useCallback((date: Date, calendarData: CompanyCalendar[]) => {
    const result = new Date(date);
    while (true) {
      result.setDate(result.getDate() + 1);
      if (!isHoliday(result, calendarData)) break;
    }
    return result;
  }, [isHoliday]);

  const getBusinessDayOnOrAfter = useCallback((date: Date, calendarData: CompanyCalendar[]) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);

    while (isHoliday(result, calendarData)) {
      result.setDate(result.getDate() + 1);
    }

    return result;
  }, [isHoliday]);

  const getLaterDate = useCallback((left: Date, right: Date) =>
    left.getTime() >= right.getTime() ? left : right, []);

  const getPredictionStart = useCallback((
    baseDate: Date,
    calendarData: CompanyCalendar[],
    settings: AiPredictionSettings,
  ) => {
    const businessBase = getBusinessDayOnOrAfter(baseDate, calendarData);

    if (!settings.enabled || !settings.useCurrentDelay) {
      return businessBase;
    }

    const today = getBusinessDayOnOrAfter(new Date(), calendarData);
    return getLaterDate(businessBase, today);
  }, [getBusinessDayOnOrAfter, getLaterDate]);

  const getPredictedEnd = useCallback((
    startDate: Date,
    requiredDays: number,
    extraDays: number,
    calendarData: CompanyCalendar[],
  ) =>
    addBusinessDays(
      startDate,
      Math.max(0, requiredDays + extraDays - 1),
      calendarData,
    ), [addBusinessDays]);

  const buildAverageDailyAmountMap = useCallback((rows: ProcessResult[]) => {
    const totals = new Map<string, { amount: number; dates: Set<string> }>();

    rows.forEach((row) => {
      const key = row.processId || row.processName;
      if (!key) return;
      const current = totals.get(key) || { amount: 0, dates: new Set<string>() };
      current.amount += Number(row.amount || 0);
      current.dates.add(row.date);
      totals.set(key, current);
    });

    const averages = new Map<string, number>();
    totals.forEach((value, key) => {
      averages.set(key, value.amount / Math.max(1, value.dates.size));
    });

    return averages;
  }, []);

  const getActualCapacity = useCallback((
    line: LineMaster | undefined,
    settings: AiPredictionSettings,
    processKeys: string[],
    averageDailyAmountMap: Map<string, number>,
  ) => {
    const dailyCapacity = Number(line?.dailyCapacity || 1);
    const operationRate =
      settings.enabled && settings.useLineOperationRate
        ? Number(line?.operationRate || 100) / 100
        : 1;
    let capacity = dailyCapacity * operationRate * getLineLoadRate(settings);

    if (settings.enabled && settings.usePastResults) {
      const historicalCapacity = processKeys
        .map((key) => averageDailyAmountMap.get(key))
        .find((value): value is number => Boolean(value && value > 0));

      if (historicalCapacity) {
        capacity = Math.min(capacity, historicalCapacity);
      }
    }

    return Math.max(1, capacity);
  }, []);

  const getPredictionExtraDays = useCallback((
    isOutsourceProcess: boolean,
    isLastProcess: boolean,
    settings: AiPredictionSettings,
  ) => {
    if (!settings.enabled) return 0;

    let extraDays = 0;
    const strengthDays = getStrengthDelayDays(settings);

    if (
      settings.targetOutsourceDelay &&
      settings.useOutsourceProcess &&
      isOutsourceProcess
    ) {
      extraDays += strengthDays;
    }

    if (settings.targetShippingDelay && isLastProcess) {
      extraDays += Math.max(1, strengthDays - 1);
    }

    if (settings.useProcessAverageDelay) {
      extraDays += settings.strength === "strong" ? 2 : 1;
    }

    return extraDays;
  }, []);

  // =========================
  // 実績取得
  // =========================

  const getProcessLogs = useCallback((processId: string, resultData: ProcessResult[]) =>
    resultData
      .filter((result) => result.processId === processId)
      .map((result) => ({
        date: result.date,
        amount: result.amount,
      })), []);

  const getOrderProcessLogs = useCallback((
    orderProcessId: string,
    resultData: ProcessResult[],
  ) =>
    resultData
      .filter(
        (result) =>
          result.orderProcessId === orderProcessId ||
          result.processId === orderProcessId,
      )
      .map((result) => ({
        date: result.date,
        amount: result.amount,
      })), []);

  // =========================
  // データ取得
  // =========================

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        setLoadError("");
        // =========================
        // 投稿
        // =========================

        const { data: postRowData, error: postError } = await supabase
          .from("posts")
          .select(POST_SELECT_COLUMNS)
          .eq("id", id)
          .maybeSingle();

        let postRow = postRowData;
        if (postError || !postRow) {
          console.warn("posts取得失敗。v_posts_with_masterを参照します。", postError);

          const { data: viewPostRow, error: viewPostError } = await supabase
            .from("v_posts_with_master")
            .select(POST_SELECT_COLUMNS)
            .eq("id", id)
            .maybeSingle();

          if (viewPostError) {
            console.warn("v_posts_with_master取得失敗", viewPostError);
          }
          postRow = viewPostRow;
        }

        if (!postRow) {
          setLoadError("対象の受注データが見つかりませんでした。");
          return;
        }

        const currentPost: Post = {
          id: postRow.id,
          orderNo: postRow.order_no || "",
          productCode: postRow.product_code || "",
          lotNo: postRow.lot_no || "",
          productName: postRow.product_name || "",
          customerName: postRow.customer_name || "",
          orderAmount: postRow.order_amount || 0,
          manufacturingDate:
            postRow.completion_scheduled_date ||
            postRow.delivery_date ||
            "",
          manufacturingAmount: 0,
          cleaningDate: "",
          cleaningAmount: 0,
          inspectionDate: "",
          inspectionAmount: 0,
          measurementDate: "",
          measurementAmount: 0,
          packagingDate: "",
          packagingAmount: 0,
          remainingAmount: postRow.remaining_amount || 0,
          deliveryDate: postRow.delivery_date || "",
          completionScheduledDate:
            postRow.completion_scheduled_date || postRow.delivery_date || "",
          remark: postRow.remark || "",
          manufacturingLogs: [],
          cleaningLogs: [],
          inspectionLogs: [],
          measurementLogs: [],
          packagingLogs: [],
          days: [],
          status: postRow.status || "未着手",
          delete: postRow.delete || false,
          createdBy: "",
          updatedBy: "",
          createdAt: postRow.created_at || "",
          updatedAt: postRow.updated_at || "",
        };

        setPost(currentPost);

        // =========================
        // 工程マスタ
        // =========================

        const { data: processRows, error: processError } = await supabase
          .from("process_master")
          .select(PROCESS_SELECT_COLUMNS);

        if (processError) {
          console.warn("process_master取得失敗", processError);
        }

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
          .select(CALENDAR_SELECT_COLUMNS);

        if (calendarError) {
          console.warn("company_calendar取得失敗", calendarError);
        }

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
          .select(LINE_SELECT_COLUMNS);

        if (lineError) {
          console.warn("line_master取得失敗", lineError);
        }

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
          .select(RESULT_SELECT_COLUMNS)
          .eq("post_id", id);

        if (!resultError) {
          resultData = (resultRows || []).map((row) => ({
            id: row.id,
            postId: row.post_id,
            scheduleId: row.schedule_id || "",
            orderProcessId: row.order_process_id || "",
            processId: row.process_id,
            processName: row.process_name || "",
            date: row.date,
            amount: row.amount,
            createdAt: row.created_at || "",
          }));
        }

        let aiSettings = DEFAULT_AI_SETTINGS;
        const { data: aiSettingRow, error: aiSettingError } = await supabase
          .from("ai_prediction_settings")
          .select(AI_SETTINGS_SELECT_COLUMNS)
          .eq("id", "global")
          .maybeSingle();

        if (aiSettingError) {
          console.warn("ai_prediction_settings取得失敗。標準設定で予測します。", aiSettingError);
        } else {
          aiSettings = mapAiSettings(aiSettingRow);
        }

        let averageDailyAmountMap = new Map<string, number>();
        if (aiSettings.enabled && aiSettings.usePastResults) {
          const { data: historyRows, error: historyError } = await supabase
            .from("production_results")
            .select(RESULT_SELECT_COLUMNS)
            .order("date", { ascending: false })
            .limit(5000);

          if (historyError) {
            console.warn("production_results過去実績取得失敗", historyError);
          } else {
            averageDailyAmountMap = buildAverageDailyAmountMap(
              (historyRows || []).map((row) => ({
                id: row.id,
                postId: row.post_id,
                scheduleId: row.schedule_id || "",
                orderProcessId: row.order_process_id || "",
                processId: row.process_id,
                processName: row.process_name || "",
                date: row.date,
                amount: row.amount,
                createdAt: row.created_at || "",
              })),
            );
          }
        }

        const { data: directOrderProcessRows, error: directOrderProcessError } =
          await supabase
            .from("order_processes")
            .select(DIRECT_ORDER_PROCESS_SELECT_COLUMNS)
            .eq("post_id", id)
            .order("process_order", { ascending: true });

        let orderProcessRows = directOrderProcessRows || [];
        if (directOrderProcessError) {
          console.warn(
            "order_processes取得失敗。v_order_processes_with_masterを参照します。",
            directOrderProcessError,
          );

          const { data: viewRows, error: viewError } = await supabase
            .from("v_order_processes_with_master")
            .select(ORDER_PROCESS_SELECT_COLUMNS)
            .eq("post_id", id)
            .order("process_order", { ascending: true });

          if (viewError) {
            console.warn("v_order_processes_with_master取得失敗", viewError);
          }
          orderProcessRows = viewRows || [];
        }

        const orderProcessData: OrderProcess[] = (orderProcessRows || []).map(
          (row: Record<string, unknown>) => ({
            id: String(row.id || ""),
            postId: String(row.post_id || ""),
            productId: String(row.product_id || ""),
            customerId: String(row.customer_id || ""),
            productProcessId: String(row.product_process_id || ""),
            orderNo: String(row.order_no || ""),
            productCode: String(row.product_code || ""),
            productName: String(row.product_name || ""),
            customerName: String(row.customer_name || ""),
            processName: String(row.process_name || ""),
            processOrder: Number(row.process_order || 0),
            plannedAmount: Number(row.planned_amount || 0),
            completedAmount: Number(row.completed_amount || 0),
            completedDate: String(row.completed_date || ""),
            subcontractorId: row.subcontractor_id
              ? String(row.subcontractor_id)
              : null,
            subcontractorName: String(row.subcontractor_name || ""),
            outsourceSentDate: String(row.outsource_sent_date || ""),
            outsourceExpectedReturnDate: String(
              row.outsource_expected_return_date || "",
            ),
            outsourceReturnedDate: String(row.outsource_returned_date || ""),
            outsourceStatus: String(row.outsource_status || ""),
            outsourceNote: String(row.outsource_note || ""),
            locked: Boolean(row.locked || false),
            createdAt: String(row.created_at || ""),
            updatedAt: String(row.updated_at || ""),
          }),
        );

        // =========================
        // ガント生成
        // =========================

        const ganttList: ProcessItem[] = [];
        const predictionCalendar =
          aiSettings.enabled && !aiSettings.useHolidays ? [] : calendarData;
        setGanttCalendar(predictionCalendar);
        let currentDate = getBusinessDayOnOrAfter(new Date(), predictionCalendar);
        const orderAmount = Number(currentPost.orderAmount || 0);

        if (orderProcessData.length > 0) {
          orderProcessData.forEach((process, processIndex) => {
            const processMaster = processData.find(
              (item) =>
                item.name === process.processName ||
                item.processId === process.processName,
            );
            const line = lineData.find(
              (item) =>
                processMaster &&
                item.processId === processMaster.processId &&
                item.enabled !== false,
            );

            const processKeys = [
              process.id,
              process.processName,
              processMaster?.processId || "",
            ].filter(Boolean);
            const actualCapacity = getActualCapacity(
              line,
              aiSettings,
              processKeys,
              averageDailyAmountMap,
            );
            const processResults = getOrderProcessLogs(
              process.id,
              resultData,
            );
            processResults.sort((a, b) => a.date.localeCompare(b.date));

            const resultTotal = processResults.reduce(
              (sum, item) => sum + Number(item.amount || 0),
              0,
            );
            const plannedAmount = Number(process.plannedAmount || orderAmount);
            const totalActual = Math.max(
              Number(process.completedAmount || 0),
              resultTotal,
            );

            let actualStart = new Date(currentDate);
            let actualEnd: Date | null = null;
            let predictedStart = new Date(currentDate);
            let predictedEnd = new Date(currentDate);
            let progress = 0;
            const remainingAmount = Math.max(0, plannedAmount - totalActual);
            const extraDays = getPredictionExtraDays(
              Boolean(process.subcontractorId || processMaster?.outsourcing),
              processIndex === orderProcessData.length - 1,
              aiSettings,
            );

            if (processResults.length > 0) {
              actualStart = safeDate(processResults[0].date);
              progress =
                plannedAmount > 0
                  ? Math.min(
                      100,
                      Math.floor((totalActual / plannedAmount) * 100),
                    )
                  : 0;

              const lastActualDate = safeDate(
                processResults[processResults.length - 1].date,
              );
              actualEnd = lastActualDate;

              if (remainingAmount <= 0) {
                predictedStart = lastActualDate;
                predictedEnd = lastActualDate;
              } else {
                const remainingDays = Math.max(
                  1,
                  Math.ceil(remainingAmount / actualCapacity),
                );
                predictedStart = getPredictionStart(
                  getNextBusinessDay(lastActualDate, predictionCalendar),
                  predictionCalendar,
                  aiSettings,
                );
                predictedEnd = getPredictedEnd(
                  predictedStart,
                  remainingDays,
                  extraDays,
                  predictionCalendar,
                );
              }
            } else if (totalActual > 0) {
              actualStart = process.completedDate
                ? safeDate(process.completedDate)
                : new Date(currentDate);
              progress =
                plannedAmount > 0
                  ? Math.min(
                      100,
                      Math.floor((totalActual / plannedAmount) * 100),
                    )
                  : 0;
              actualEnd = process.completedDate ? safeDate(process.completedDate) : null;
              predictedStart = actualEnd
                ? getPredictionStart(
                    getNextBusinessDay(actualEnd, predictionCalendar),
                    predictionCalendar,
                    aiSettings,
                  )
                : getPredictionStart(currentDate, predictionCalendar, aiSettings);
              predictedEnd =
                remainingAmount <= 0
                  ? new Date(actualStart)
                  : getPredictedEnd(
                      predictedStart,
                      Math.max(1, Math.ceil(remainingAmount / actualCapacity)),
                      extraDays,
                      predictionCalendar,
                    );
            } else {
              const requiredDays = Math.max(
                1,
                Math.ceil(plannedAmount / actualCapacity),
              );
              predictedStart = getPredictionStart(
                currentDate,
                predictionCalendar,
                aiSettings,
              );
              actualStart = predictedStart;
              predictedEnd = getPredictedEnd(
                predictedStart,
                requiredDays,
                extraDays,
                predictionCalendar,
              );
              progress = 0;
            }

            const delivery = safeDate(currentPost.deliveryDate);
            const isDelay = predictedEnd.getTime() > delivery.getTime();
            if (progress >= 100) {
              actualEnd = predictedEnd;
            }

            ganttList.push({
              id: process.id,
              name: process.processName,
              actualStart,
              actualEnd,
              predictedStart,
              predictedEnd,
              progress,
              isDelay,
              completedAmount: totalActual,
              remainingAmount,
            });

            currentDate = getNextBusinessDay(predictedEnd, predictionCalendar);
          });

          console.log("ganttList", ganttList);
          setGanttProcesses(ganttList);
          return;
        }

        processData.forEach((process, processIndex) => {
          const line = lineData.find(
            (item) =>
              item.processId === process.processId && item.enabled !== false,
          );

          const actualCapacity = getActualCapacity(
            line,
            aiSettings,
            [process.processId, process.name],
            averageDailyAmountMap,
          );

          const processResults = getProcessLogs(process.processId, resultData);
          processResults.sort((a, b) => a.date.localeCompare(b.date));

          const totalActual = processResults.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0,
          );

          let actualStart = new Date(currentDate);
          let actualEnd: Date | null = null;
          let predictedStart = new Date(currentDate);
          let predictedEnd = new Date(currentDate);
          let progress = 0;
          const remainingAmount = Math.max(0, orderAmount - totalActual);
          const extraDays = getPredictionExtraDays(
            Boolean(process.outsourcing),
            processIndex === processData.length - 1,
            aiSettings,
          );

          if (processResults.length > 0) {
            actualStart = safeDate(processResults[0].date);
            progress =
              orderAmount > 0
                ? Math.min(100, Math.floor((totalActual / orderAmount) * 100))
                : 0;

            const lastActualDate = safeDate(
              processResults[processResults.length - 1].date,
            );
            actualEnd = lastActualDate;

            if (remainingAmount <= 0) {
              predictedStart = lastActualDate;
              predictedEnd = lastActualDate;
            } else {
              const remainingDays = Math.max(
                1,
                Math.ceil(remainingAmount / actualCapacity),
              );
              predictedStart = getPredictionStart(
                getNextBusinessDay(lastActualDate, predictionCalendar),
                predictionCalendar,
                aiSettings,
              );
              predictedEnd = getPredictedEnd(
                predictedStart,
                remainingDays,
                extraDays,
                predictionCalendar,
              );
            }
          } else {
            const requiredDays = Math.max(
              1,
              Math.ceil(orderAmount / actualCapacity),
            );
            predictedStart = getPredictionStart(
              currentDate,
              predictionCalendar,
              aiSettings,
            );
            actualStart = predictedStart;
            predictedEnd = getPredictedEnd(
              predictedStart,
              requiredDays,
              extraDays,
              predictionCalendar,
            );
            progress = 0;
          }

          const delivery = safeDate(currentPost.deliveryDate);
          const isDelay = predictedEnd.getTime() > delivery.getTime();
          if (progress >= 100) {
            actualEnd = predictedEnd;
          }

          ganttList.push({
            id: process.processId,
            name: process.name,
            actualStart,
            actualEnd,
            predictedStart,
            predictedEnd,
            progress,
            isDelay,
            completedAmount: totalActual,
            remainingAmount,
          });

          currentDate = getNextBusinessDay(predictedEnd, predictionCalendar);
        });

        console.log("ganttList", ganttList);
        setGanttProcesses(ganttList);
      } catch (error) {
        console.error(error);
      }
    };

    fetchData();
  }, [
    addBusinessDays,
    buildAverageDailyAmountMap,
    getActualCapacity,
    getBusinessDayOnOrAfter,
    getNextBusinessDay,
    getOrderProcessLogs,
    getPredictedEnd,
    getPredictionExtraDays,
    getPredictionStart,
    getProcessLogs,
    id,
    safeDate,
  ]);

  if (!post) {
    return (
      <div className={styles.container}>
        <div className={styles.backArea}>
          <Link href="/reservation" className={styles.backButton}>
            ← 戻る
          </Link>
        </div>
        <div className={styles.loading}>
          {loadError || "Loading..."}
        </div>
      </div>
    );
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
          calendar={ganttCalendar}
        />
      </div>
    </div>
  );
}
