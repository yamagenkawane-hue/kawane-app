"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import {
  OrderProcess,
  PostData,
  ProcessResult,
  ProductionSchedule,
} from "@/app/type";
import styles from "./page.module.css";

const postScheduleId = (postId: string) => `post:${postId}`;

const SCHEDULE_SELECT_COLUMNS =
  "id,post_id,order_no,customer_name,product_name,press_number,lot_no,plan_amount,press_completed_amount,press_completed_date,created_at,updated_at";

const POST_SELECT_COLUMNS =
  "id,product_id,customer_id,order_no,lot_no,product_code,product_name,customer_name,order_amount,remaining_amount,status,delivery_date,delete";

const ORDER_PROCESS_SELECT_COLUMNS =
  "id,post_id,product_id,customer_id,product_process_id,order_no,product_code,product_name,customer_name,process_name,process_order,overlap_days,planned_amount,completed_amount,completed_date,subcontractor_id,subcontractor_name,outsource_sent_date,outsource_expected_return_date,outsource_returned_date,outsource_status,outsource_note,locked,created_at,updated_at";

const RESULT_SELECT_COLUMNS =
  "id,post_id,schedule_id,order_process_id,process_name,date,amount,created_at";

const isPostScheduleId = (id: string) => id.startsWith("post:");

const getPostIdFromScheduleId = (id: string) =>
  isPostScheduleId(id) ? id.replace("post:", "") : "";

const mapScheduleRow = (row: Record<string, unknown>): ProductionSchedule => ({
  id: String(row.id || ""),
  postId: row.post_id ? String(row.post_id) : "",
  orderNo: String(row.order_no || ""),
  customerName: String(row.customer_name || ""),
  productName: String(row.product_name || ""),
  pressNumber: String(row.press_number || ""),
  lotNo: String(row.lot_no || ""),
  planAmount: Number(row.plan_amount || 0),
  pressCompletedAmount: Number(row.press_completed_amount || 0),
  pressCompletedDate: String(row.press_completed_date || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const mapPostRow = (row: Record<string, unknown>): PostData => ({
  id: String(row.id || ""),
  productId: row.product_id ? String(row.product_id) : "",
  customerId: row.customer_id ? String(row.customer_id) : "",
  orderNo: String(row.order_no || ""),
  lotNo: String(row.lot_no || ""),
  productCode: String(row.product_code || ""),
  productName: String(row.product_name || ""),
  customerName: String(row.customer_name || ""),
  orderAmount: Number(row.order_amount || 0),
  remainingAmount: Number(row.remaining_amount || row.order_amount || 0),
  status: String(row.status || ""),
  deliveryDate: String(row.delivery_date || ""),
});

const mapPostToSchedule = (row: Record<string, unknown>): ProductionSchedule => ({
  id: postScheduleId(String(row.id || "")),
  postId: String(row.id || ""),
  orderNo: String(row.order_no || ""),
  customerName: String(row.customer_name || ""),
  productName: String(row.product_name || ""),
  pressNumber: String(row.product_code || ""),
  lotNo: String(row.lot_no || ""),
  planAmount: Number(row.remaining_amount || row.order_amount || 0),
  pressCompletedAmount: 0,
  pressCompletedDate: "",
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const mapOrderProcessRow = (row: Record<string, unknown>): OrderProcess => ({
  id: String(row.id || ""),
  postId: String(row.post_id || ""),
  productId: row.product_id ? String(row.product_id) : "",
  customerId: row.customer_id ? String(row.customer_id) : "",
  productProcessId: row.product_process_id ? String(row.product_process_id) : "",
  orderNo: String(row.order_no || ""),
  productCode: String(row.product_code || ""),
  productName: String(row.product_name || ""),
  customerName: String(row.customer_name || ""),
  processName: String(row.process_name || ""),
  processOrder: Number(row.process_order || 0),
  overlapDays: Number(row.overlap_days || 0),
  plannedAmount: Number(row.planned_amount || 0),
  completedAmount: Number(row.completed_amount || 0),
  completedDate: String(row.completed_date || ""),
  subcontractorId: row.subcontractor_id ? String(row.subcontractor_id) : null,
  subcontractorName: String(row.subcontractor_name || ""),
  outsourceSentDate: String(row.outsource_sent_date || ""),
  outsourceExpectedReturnDate: String(row.outsource_expected_return_date || ""),
  outsourceReturnedDate: String(row.outsource_returned_date || ""),
  outsourceStatus: String(row.outsource_status || "not_sent"),
  outsourceNote: String(row.outsource_note || ""),
  locked: Boolean(row.locked || false),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const mapResultRow = (row: Record<string, unknown>): ProcessResult => ({
  id: String(row.id || ""),
  postId: String(row.post_id || ""),
  scheduleId: String(row.schedule_id || ""),
  orderProcessId: String(row.order_process_id || ""),
  processId: String(row.order_process_id || row.process_name || ""),
  processName: String(row.process_name || ""),
  date: String(row.date || ""),
  amount: Number(row.amount || 0),
  createdAt: String(row.created_at || ""),
});

const filterSchedulesByActivePosts = (
  scheduleRows: ProductionSchedule[],
  postRows: PostData[],
) => {
  const activePostIds = new Set(postRows.map((post) => post.id).filter(Boolean));
  const activeOrderNos = new Set(postRows.map((post) => post.orderNo).filter(Boolean));

  return scheduleRows.filter((schedule) => {
    if (schedule.postId && activePostIds.has(schedule.postId)) return true;
    if (schedule.orderNo && activeOrderNos.has(schedule.orderNo)) return true;
    return false;
  });
};

export default function ProductionResultsPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [orderProcesses, setOrderProcesses] = useState<OrderProcess[]>([]);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [results, setResults] = useState<ProcessResult[]>([]);
  const [scheduleId, setScheduleId] = useState("");
  const [orderProcessId, setOrderProcessId] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [materialLotNo, setMaterialLotNo] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [numpadOpen, setNumpadOpen] = useState(false);
  const queryAppliedRef = useRef(false);

  const selectedSchedule = useMemo(
    () => schedules.find((item) => item.id === scheduleId),
    [scheduleId, schedules],
  );

  const selectedPostId = useMemo(() => {
    if (!selectedSchedule) return "";
    if (selectedSchedule.postId) return selectedSchedule.postId;

    const schedulePostId = getPostIdFromScheduleId(selectedSchedule.id);
    if (schedulePostId) return schedulePostId;

    const matched = posts.find((post) => {
      const sameOrder =
        selectedSchedule.orderNo && post.orderNo === selectedSchedule.orderNo;
      const sameLot =
        selectedSchedule.lotNo && post.lotNo === selectedSchedule.lotNo;

      return Boolean(sameOrder || sameLot);
    });

    return matched?.id || "";
  }, [posts, selectedSchedule]);

  const selectedScheduleOrderProcesses = useMemo(
    () =>
      orderProcesses
        .filter((item) => item.postId === selectedPostId)
        .sort((a, b) => a.processOrder - b.processOrder),
    [orderProcesses, selectedPostId],
  );

  const selectedOrderProcess = useMemo(
    () => orderProcesses.find((item) => item.id === orderProcessId),
    [orderProcessId, orderProcesses],
  );

  const isFirstProcess = selectedOrderProcess?.processOrder === 1;

  const selectableOrderProcesses = useMemo(
    () =>
      selectedScheduleOrderProcesses.filter(
        (process) => process.processOrder === 1,
      ),
    [selectedScheduleOrderProcesses],
  );

  useEffect(() => {
    const firstProcess = selectableOrderProcesses[0];

    if (!firstProcess) {
      if (orderProcessId) {
        setOrderProcessId("");
      }
      return;
    }

    if (orderProcessId !== firstProcess.id) {
      setOrderProcessId(firstProcess.id);
    }
  }, [orderProcessId, selectableOrderProcesses]);

  const getProcessAvailableAmount = (target: OrderProcess) => {
    return Math.max(
      0,
      Number(target.plannedAmount || 0) - Number(target.completedAmount || 0),
    );
  };

  const findPostIdForSchedule = (
    schedule: ProductionSchedule,
    postList = posts,
  ) => {
    if (schedule.postId) return schedule.postId;

    const schedulePostId = getPostIdFromScheduleId(schedule.id);
    if (schedulePostId) return schedulePostId;

    const matched = postList.find((post) => {
      const sameOrder = schedule.orderNo && post.orderNo === schedule.orderNo;
      const sameLot = schedule.lotNo && post.lotNo === schedule.lotNo;

      return Boolean(sameOrder || sameLot);
    });

    return matched?.id || "";
  };

  const fetchOrderProcesses = async () => {
    const { data, error } = await supabase
      .from("v_order_processes_with_master")
      .select(ORDER_PROCESS_SELECT_COLUMNS)
      .order("process_order", { ascending: true });

    if (error) throw error;

    const mappedProcesses = (data || []).map(mapOrderProcessRow);
    setOrderProcesses(mappedProcesses);
    return mappedProcesses;
  };

  const ensureOrderProcesses = async (
    schedule: ProductionSchedule,
    postList = posts,
  ) => {
    const postId = findPostIdForSchedule(schedule, postList);
    if (!postId) return;

    const existingProcesses = orderProcesses.filter(
      (process) => process.postId === postId,
    );
    if (existingProcesses.length > 0) return;

    const { error } = await supabase.rpc("create_order_processes_for_post", {
      p_post_id: postId,
    });

    if (error) throw error;

    await fetchOrderProcesses();
  };

  const fetchData = async () => {
    try {
      setLoading(true);

      const [
        scheduleResult,
        dailyScheduleResult,
        orderProcessResult,
        postResult,
        resultResult,
      ] =
        await Promise.all([
          supabase
            .from("v_production_schedules_with_master")
            .select(SCHEDULE_SELECT_COLUMNS)
            .order("created_at", { ascending: false }),
          fetch("/api/daily-production"),
          supabase
            .from("v_order_processes_with_master")
            .select(ORDER_PROCESS_SELECT_COLUMNS)
            .order("process_order", { ascending: true }),
          supabase.from("v_posts_with_master").select(POST_SELECT_COLUMNS),
          supabase
            .from("v_production_results_with_master")
            .select(RESULT_SELECT_COLUMNS)
            .order("created_at", { ascending: false })
            .limit(30),
        ]);

      if (scheduleResult.error) throw scheduleResult.error;
      if (!dailyScheduleResult.ok) {
        throw new Error("daily production fetch failed");
      }
      if (orderProcessResult.error) throw orderProcessResult.error;
      if (postResult.error) throw postResult.error;
      if (resultResult.error) throw resultResult.error;

      const dailyRows: Record<string, unknown>[] = await dailyScheduleResult.json();
      const activePosts: PostData[] = (dailyRows || [])
        .filter((row: Record<string, unknown>) => row.delete !== true)
        .map(mapPostRow);
      const activePostIds = new Set(activePosts.map((post) => post.id));
      const dailySchedules = (dailyRows || [])
        .filter((row: Record<string, unknown>) => row.delete !== true)
        .map(mapPostToSchedule);
      const manualSchedules = (scheduleResult.data || []).map(mapScheduleRow);

      setSchedules([
        ...dailySchedules,
        ...filterSchedulesByActivePosts(manualSchedules, activePosts),
      ]);
      setOrderProcesses(
        (orderProcessResult.data || [])
          .map(mapOrderProcessRow)
          .filter((process) => activePostIds.has(process.postId)),
      );
      setPosts(activePosts);
      setResults((resultResult.data || []).map(mapResultRow));
    } catch (error) {
      console.error(error);
      alert("製造実績データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchData();
    };

    void loadData();
  }, []);

  const handleScheduleChange = async (value: string) => {
    setScheduleId(value);
    setOrderProcessId("");
    setLotNo("");
    setMaterialLotNo("");

    const schedule = schedules.find((item) => item.id === value);
    if (!schedule) return;
    setLotNo(schedule.lotNo || "");

    try {
      setLoading(true);
      await ensureOrderProcesses(schedule);
    } catch (error) {
      console.error(error);
      alert("工程予定の自動作成に失敗しました。製品工程マスタを確認してください。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (queryAppliedRef.current || schedules.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const orderNo = params.get("orderNo");
    if (!orderNo) return;

    const matchedSchedule = schedules.find(
      (schedule) => schedule.orderNo === orderNo,
    );
    if (!matchedSchedule) return;

    queryAppliedRef.current = true;
    window.setTimeout(() => {
      setScheduleId(matchedSchedule.id);
      setOrderProcessId("");
      setLotNo(matchedSchedule.lotNo || "");
      setMaterialLotNo("");
    }, 0);
  }, [schedules]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSchedule || !date || amount === "") {
      alert("製造予定、日付、数量を入力してください");
      return;
    }

    if (!selectedOrderProcess) {
      alert("製造工程予定がありません。製品工程マスタを確認してください。");
      return;
    }

    try {
      setLoading(true);

      const resultAmount = Number(amount);
      const now = new Date().toISOString();
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      if (!Number.isFinite(resultAmount) || resultAmount <= 0) {
        alert("数量は1以上で入力してください");
        return;
      }

      if (!isFirstProcess) {
        alert("実績登録画面で登録できるのは製造工程のみです。");
        return;
      }

      if (!lotNo.trim()) {
        alert("製造工程ではロットNoを入力してください");
        return;
      }

      const { error } = await supabase.rpc("register_manufacturing_lot_result", {
        p_order_process_id: selectedOrderProcess.id,
        p_schedule_id: isPostScheduleId(selectedSchedule.id)
          ? null
          : selectedSchedule.id,
        p_date: date,
        p_amount: resultAmount,
        p_lot_no: lotNo.trim(),
        p_material_lot_no: materialLotNo.trim() || null,
        p_idempotency_key: idempotencyKey,
      });

      if (error) throw error;

      if (!isPostScheduleId(selectedSchedule.id)) {
        const { error: scheduleError } = await supabase
          .from("production_schedules")
          .update({
            press_completed_amount:
              Number(selectedSchedule.pressCompletedAmount || 0) + resultAmount,
            press_completed_date: date,
            updated_at: now,
          })
          .eq("id", selectedSchedule.id);

        if (scheduleError) throw scheduleError;
      }

      setAmount("");
      setLotNo("");
      setMaterialLotNo("");
      await fetchData();
      alert("製造実績を登録しました");
      router.push("/reservation");
    } catch (error) {
      console.error(error);
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "製造実績の登録に失敗しました";
      alert(message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
        </Link>
        <Link href="/orderProcesses" className={styles.backButton}>
          受注別工程管理
        </Link>
        <h1 className={styles.title}>製造実績登録</h1>
      </div>

      <form className={styles.formCard} onSubmit={handleSubmit}>
        <select
          className={styles.select}
          value={scheduleId}
          onChange={(e) => void handleScheduleChange(e.target.value)}
        >
          <option value="">製造予定を選択</option>
          {schedules.map((schedule) => (
            <option key={schedule.id} value={schedule.id}>
              {schedule.orderNo || "-"} / {schedule.productName} / 数量{" "}
              {schedule.planAmount}
            </option>
          ))}
        </select>

        {selectedOrderProcess && (
          <>
            <input
              className={styles.input}
              placeholder="ロットNo"
              value={lotNo}
              onChange={(e) => setLotNo(e.target.value)}
            />
            <input
              className={styles.input}
              placeholder="材料ロットNo"
              value={materialLotNo}
              onChange={(e) => setMaterialLotNo(e.target.value)}
            />
          </>
        )}

        {selectedSchedule && selectedScheduleOrderProcesses.length === 0 && (
          <div className={styles.notice}>
            この受注の工程予定がありません。製品工程マスタを確認してください。
          </div>
        )}

        {selectedSchedule &&
          selectedScheduleOrderProcesses.length > 0 &&
          selectableOrderProcesses.length === 0 && (
            <div className={styles.notice}>
              製造実績として登録できる工程がありません。
            </div>
          )}

        {selectedOrderProcess && (
          <div className={styles.notice}>
            完了済み {selectedOrderProcess.completedAmount} / 登録可能{" "}
            {Math.max(
              0,
              getProcessAvailableAmount(selectedOrderProcess),
            )}
          </div>
        )}

        <input
          className={styles.input}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <input
          className={styles.input}
          inputMode="numeric"
          placeholder="数量"
          value={amount}
          onFocus={() => setNumpadOpen(true)}
          onChange={(e) =>
            setAmount(e.target.value === "" ? "" : Number(e.target.value))
          }
        />

        <button className={styles.submitButton} type="submit">
          製造実績登録
        </button>
      </form>

      {selectedSchedule && (
        <div className={styles.summaryCard}>
          <div>
            <span>取引先</span>
            <strong>{selectedSchedule.customerName}</strong>
          </div>
          <div>
            <span>予定数</span>
            <strong>{selectedSchedule.planAmount}</strong>
          </div>
          <div>
            <span>登録済み数</span>
            <strong>{selectedSchedule.pressCompletedAmount}</strong>
          </div>
          <div>
            <span>登録日</span>
            <strong>{selectedSchedule.pressCompletedDate || "-"}</strong>
          </div>
        </div>
      )}

      {loading && <div className={styles.loading}>読み込み中...</div>}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>日付</th>
              <th>工程</th>
              <th>数量</th>
              <th>予定ID</th>
              <th>受注ID</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.id}>
                <td>{result.date}</td>
                <td>{result.processName || result.processId}</td>
                <td>{result.amount}</td>
                <td>{result.scheduleId || "-"}</td>
                <td>{result.postId || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Numpad
        open={numpadOpen}
        value={amount === "" ? "" : String(amount)}
        onChange={(value) => setAmount(value === "" ? "" : Number(value))}
        onClose={() => setNumpadOpen(false)}
      />
    </div>
  );
}


