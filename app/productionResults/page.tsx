"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import {
  PostData,
  ProcessMaster,
  ProcessResult,
  ProductionSchedule,
} from "@/app/type";
import styles from "./page.module.css";

export default function ProductionResultsPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [processes, setProcesses] = useState<ProcessMaster[]>([]);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [results, setResults] = useState<ProcessResult[]>([]);
  const [scheduleId, setScheduleId] = useState("");
  const [processId, setProcessId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  const selectedSchedule = useMemo(
    () => schedules.find((item) => item.id === scheduleId),
    [scheduleId, schedules],
  );

  const selectedProcess = useMemo(
    () => processes.find((item) => item.processId === processId),
    [processId, processes],
  );

  const fetchData = async () => {
    try {
      setLoading(true);

      const [scheduleResult, processResult, postResult, resultResult] =
        await Promise.all([
          supabase
            .from("production_schedules")
            .select("*")
            .order("created_at", { ascending: false }),
          supabase.from("process_master").select("*"),
          supabase.from("posts").select("*"),
          supabase
            .from("production_results")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(30),
        ]);

      if (scheduleResult.error) throw scheduleResult.error;
      if (processResult.error) throw processResult.error;
      if (postResult.error) throw postResult.error;
      if (resultResult.error) throw resultResult.error;

      setSchedules(
        (scheduleResult.data || []).map((row) => ({
          id: row.id,
          customerName: row.customer_name || "",
          productName: row.product_name || "",
          pressNumber: row.press_number || "",
          lotNo: row.lot_no || "",
          planAmount: row.plan_amount || 0,
          pressCompletedAmount: row.press_completed_amount || 0,
          pressCompletedDate: row.press_completed_date || "",
          createdAt: row.created_at || "",
          updatedAt: row.updated_at || "",
        })),
      );

      const processList: ProcessMaster[] = (processResult.data || [])
        .map((row) => ({
          id: row.id,
          processId: row.process_id,
          name: row.name,
          days: row.days,
          sort: row.sort,
          enabled: row.enabled,
          outsourcing: row.outsourcing || false,
        }))
        .filter((item) => item.enabled !== false)
        .sort((a, b) => a.sort - b.sort);

      setProcesses(processList);

      setPosts(
        (postResult.data || []).map((row) => ({
          id: row.id,
          orderNo: row.order_no || "",
          lotNo: row.lot_no || "",
          productName: row.product_name || "",
          customerName: row.customer_name || "",
          orderAmount: row.order_amount || 0,
          remainingAmount: row.remaining_amount || 0,
          status: row.status || "",
          deliveryDate: row.delivery_date || "",
        })),
      );

      setResults(
        (resultResult.data || []).map((row) => ({
          id: row.id,
          postId: row.post_id || "",
          scheduleId: row.schedule_id || "",
          processId: row.process_id,
          processName: row.process_name || "",
          date: row.date,
          amount: row.amount,
          createdAt: row.created_at || "",
        })),
      );
    } catch (error) {
      console.error(error);
      alert("現場実績データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const findRelatedPostId = () => {
    if (!selectedSchedule) return "";

    const matched = posts.find((post) => {
      const sameLot =
        selectedSchedule.lotNo && post.lotNo === selectedSchedule.lotNo;
      const sameProduct =
        post.productName === selectedSchedule.productName &&
        post.customerName === selectedSchedule.customerName;

      return sameLot || sameProduct;
    });

    return matched?.id || "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSchedule || !selectedProcess || !date || amount === "") {
      alert("予定、工程、日付、数量を入力してください");
      return;
    }

    try {
      setLoading(true);

      const resultAmount = Number(amount);
      const postId = findRelatedPostId();
      const now = new Date().toISOString();

      const { error } = await supabase.from("production_results").insert({
        schedule_id: selectedSchedule.id,
        post_id: postId || null,
        process_id: selectedProcess.processId,
        process_name: selectedProcess.name,
        date,
        amount: resultAmount,
        created_at: now,
      });

      if (error) throw error;

      if (
        selectedProcess.processId === "manufacturing" ||
        selectedProcess.processId === "press"
      ) {
        const { error: scheduleError } = await supabase
          .from("production_schedules")
          .update({
            press_completed_amount:
              Number(selectedSchedule.pressCompletedAmount || 0) +
              resultAmount,
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
        <h1 className={styles.title}>現場実績登録</h1>
      </div>

      <form className={styles.formCard} onSubmit={handleSubmit}>
        <select
          className={styles.select}
          value={scheduleId}
          onChange={(e) => setScheduleId(e.target.value)}
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
          value={processId}
          onChange={(e) => setProcessId(e.target.value)}
        >
          <option value="">工程を選択</option>
          {processes.map((process) => (
            <option key={process.id} value={process.processId}>
              {process.name}
              {process.outsourcing ? "（外注）" : ""}
            </option>
          ))}
        </select>

        <input
          className={styles.input}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <input
          className={styles.input}
          type="number"
          placeholder="数量"
          value={amount}
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
    </div>
  );
}
