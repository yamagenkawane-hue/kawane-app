"use client";

import { useEffect, useMemo, useState } from "react";
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

const isPostScheduleId = (id: string) => id.startsWith("post:");

const getPostIdFromScheduleId = (id: string) =>
  isPostScheduleId(id) ? id.replace("post:", "") : "";

const mapScheduleRow = (row: Record<string, unknown>): ProductionSchedule => ({
  id: String(row.id || ""),
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
  processId: String(row.process_id || ""),
  processName: String(row.process_name || ""),
  date: String(row.date || ""),
  amount: Number(row.amount || 0),
  createdAt: String(row.created_at || ""),
});

export default function ProductionResultsPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [orderProcesses, setOrderProcesses] = useState<OrderProcess[]>([]);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [results, setResults] = useState<ProcessResult[]>([]);
  const [scheduleId, setScheduleId] = useState("");
  const [orderProcessId, setOrderProcessId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [numpadOpen, setNumpadOpen] = useState(false);

  const selectedSchedule = useMemo(
    () => schedules.find((item) => item.id === scheduleId),
    [scheduleId, schedules],
  );

  const selectedPostId = useMemo(() => {
    if (!selectedSchedule) return "";
    const schedulePostId = getPostIdFromScheduleId(selectedSchedule.id);
    if (schedulePostId) return schedulePostId;

    const matched = posts.find((post) => {
      const sameOrder =
        selectedSchedule.orderNo && post.orderNo === selectedSchedule.orderNo;
      const sameLot =
        selectedSchedule.lotNo && post.lotNo === selectedSchedule.lotNo;
      const sameProduct =
        post.productName === selectedSchedule.productName &&
        post.customerName === selectedSchedule.customerName;

      return sameOrder || sameLot || sameProduct;
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

  const findPostIdForSchedule = (
    schedule: ProductionSchedule,
    postList = posts,
  ) => {
    const schedulePostId = getPostIdFromScheduleId(schedule.id);
    if (schedulePostId) return schedulePostId;

    const matched = postList.find((post) => {
      const sameOrder = schedule.orderNo && post.orderNo === schedule.orderNo;
      const sameLot = schedule.lotNo && post.lotNo === schedule.lotNo;
      const sameProduct =
        post.productName === schedule.productName &&
        post.customerName === schedule.customerName;

      return sameOrder || sameLot || sameProduct;
    });

    return matched?.id || "";
  };

  const fetchOrderProcesses = async () => {
    const { data, error } = await supabase
      .from("v_order_processes_with_master")
      .select("*")
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
            .from("production_schedules")
            .select("*")
            .order("created_at", { ascending: false }),
          fetch("/api/daily-production"),
          supabase
            .from("v_order_processes_with_master")
            .select("*")
            .order("process_order", { ascending: true }),
          supabase.from("v_posts_with_master").select("*"),
          supabase
            .from("v_production_results_with_master")
            .select("*")
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

      const dailyRows = await dailyScheduleResult.json();
      const dailySchedules = (dailyRows || [])
        .filter((row: Record<string, unknown>) => row.delete !== true)
        .map(mapPostToSchedule);
      const manualSchedules = (scheduleResult.data || []).map(mapScheduleRow);

      setSchedules([...dailySchedules, ...manualSchedules]);
      setOrderProcesses((orderProcessResult.data || []).map(mapOrderProcessRow));
      setPosts(
        (postResult.data || [])
          .filter((row) => row.delete !== true)
          .map(mapPostRow),
      );
      setResults((resultResult.data || []).map(mapResultRow));
    } catch (error) {
      console.error(error);
      alert("現場実績データの取得に失敗しました");
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

    const schedule = schedules.find((item) => item.id === value);
    if (!schedule) return;

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

  const getProcessAllowance = (target: OrderProcess) => {
    if (target.processOrder === 1) return target.plannedAmount;

    const previous = selectedScheduleOrderProcesses
      .filter((item) => item.processOrder < target.processOrder)
      .sort((a, b) => b.processOrder - a.processOrder)[0];

    return previous?.completedAmount || 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSchedule || !selectedOrderProcess || !date || amount === "") {
      alert("予定、工程、日付、数量を入力してください");
      return;
    }

    try {
      setLoading(true);

      const resultAmount = Number(amount);
      const now = new Date().toISOString();
      const allowance = getProcessAllowance(selectedOrderProcess);
      const remainingAllowance =
        allowance - Number(selectedOrderProcess.completedAmount || 0);

      if (!Number.isFinite(resultAmount) || resultAmount <= 0) {
        alert("数量は1以上で入力してください");
        return;
      }

      if (resultAmount > remainingAllowance) {
        alert(
          `前工程の完了数量を超えて登録できません。登録可能数量は${remainingAllowance}です。`,
        );
        return;
      }

      const { error } = await supabase.rpc("register_order_process_result", {
        p_order_process_id: selectedOrderProcess.id,
        p_schedule_id: isPostScheduleId(selectedSchedule.id)
          ? null
          : selectedSchedule.id,
        p_date: date,
        p_amount: resultAmount,
      });

      if (error) throw error;

      if (
        selectedOrderProcess.processOrder === 1 &&
        !isPostScheduleId(selectedSchedule.id)
      ) {
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
      await fetchData();
      alert("現場実績を登録しました");
      router.push("/manufacturing");
    } catch (error) {
      console.error(error);
      alert("現場実績の登録に失敗しました");
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
          工程予定編集
        </Link>
        <h1 className={styles.title}>現場実績登録</h1>
      </div>

      <form className={styles.formCard} onSubmit={handleSubmit}>
        <select
          className={styles.select}
          value={scheduleId}
          onChange={(e) => void handleScheduleChange(e.target.value)}
        >
          <option value="">デイリー予定の製品を選択</option>
          {schedules.map((schedule) => (
            <option key={schedule.id} value={schedule.id}>
              {schedule.productName} / {schedule.pressNumber} /{" "}
              {schedule.lotNo || "ロット未設定"}
            </option>
          ))}
        </select>

        <select
          className={styles.select}
          value={orderProcessId}
          onChange={(e) => setOrderProcessId(e.target.value)}
          disabled={!selectedPostId || selectedScheduleOrderProcesses.length === 0}
        >
          <option value="">工程を選択</option>
          {selectedScheduleOrderProcesses.map((process) => {
            const allowance = getProcessAllowance(process);
            const remainingAllowance =
              allowance - Number(process.completedAmount || 0);

            return (
              <option key={process.id} value={process.id}>
                {process.processOrder}. {process.processName} / 登録可能{" "}
                {Math.max(0, remainingAllowance)}
              </option>
            );
          })}
        </select>

        {selectedSchedule && selectedScheduleOrderProcesses.length === 0 && (
          <div className={styles.notice}>
            この受注の工程予定がありません。製品工程マスタを確認してください。
          </div>
        )}

        {selectedOrderProcess && (
          <div className={styles.notice}>
            完了済み {selectedOrderProcess.completedAmount} / 登録可能{" "}
            {Math.max(
              0,
              getProcessAllowance(selectedOrderProcess) -
                Number(selectedOrderProcess.completedAmount || 0),
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
          実績登録
        </button>
      </form>

      {selectedSchedule && (
        <div className={styles.summaryCard}>
          <div>
            <span>取引先</span>
            <strong>{selectedSchedule.customerName}</strong>
          </div>
          <div>
            <span>計画数</span>
            <strong>{selectedSchedule.planAmount}</strong>
          </div>
          <div>
            <span>プレス完了数</span>
            <strong>{selectedSchedule.pressCompletedAmount}</strong>
          </div>
          <div>
            <span>プレス完了日</span>
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


