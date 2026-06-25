"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import { PostData, ProductionSchedule } from "@/app/type";
import styles from "./page.module.css";

const emptyForm = {
  orderNo: "",
  customerName: "",
  productName: "",
  pressNumber: "",
  lotNo: "",
  planAmount: 0,
  pressCompletedAmount: 0,
  pressCompletedDate: "",
};

type NumpadTarget =
  | { kind: "form"; field: "planAmount" | "pressCompletedAmount" }
  | { kind: "schedule"; id: string; field: "planAmount" | "pressCompletedAmount" };

type EditingRow =
  | { kind: "post"; id: string }
  | { kind: "schedule"; id: string }
  | null;

const mapSchedule = (row: Record<string, unknown>): ProductionSchedule => ({
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
  shippingScheduledStart: String(row.shipping_scheduled_start || ""),
  shippingScheduledEnd: String(row.shipping_scheduled_end || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const mapPost = (row: Record<string, unknown>): PostData => ({
  id: String(row.id || ""),
  orderNo: String(row.order_no || ""),
  lotNo: String(row.lot_no || ""),
  productName: String(row.product_name || ""),
  customerName: String(row.customer_name || ""),
  orderAmount: Number(row.order_amount || 0),
  remainingAmount: Number(row.remaining_amount || row.order_amount || 0),
  status: String(row.status || ""),
  deliveryDate: String(row.delivery_date || ""),
  completionScheduledDate: String(
    row.completion_scheduled_date || row.delivery_date || "",
  ),
  remark: String(row.remark || ""),
});

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const todayText = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

const isOverdue = (deliveryDate?: string) =>
  Boolean(deliveryDate) && String(deliveryDate) < todayText();

const createScheduleNo = (schedules: ProductionSchedule[]) => {
  const todayKey = formatDateKey(new Date());
  const prefix = `PS-${todayKey}-`;
  const maxSequence = schedules.reduce((max, schedule) => {
    if (!schedule.orderNo?.startsWith(prefix)) return max;
    const sequence = Number(schedule.orderNo.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `${prefix}${String(maxSequence + 1).padStart(3, "0")}`;
};

export default function ProductionSchedulesPage() {
  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [orderSchedules, setOrderSchedules] = useState<PostData[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [numpadTarget, setNumpadTarget] = useState<NumpadTarget | null>(null);
  const [editingRow, setEditingRow] = useState<EditingRow>(null);

  const isEditing = (kind: "post" | "schedule", id: string) =>
    editingRow?.kind === kind && editingRow.id === id;

  const renderCellText = (value?: string | number) => (
    <div className={styles.displayText}>{value || "-"}</div>
  );

  const fetchSchedules = async () => {
    try {
      setLoading(true);

      const [scheduleResult, dailyResult] = await Promise.all([
        supabase
          .from("v_production_schedules_with_master")
          .select("*")
          .order("created_at", { ascending: false }),
        fetch("/api/daily-production"),
      ]);

      if (scheduleResult.error) throw scheduleResult.error;
      if (!dailyResult.ok) throw new Error("注残データの取得に失敗しました");

      const dailyRows = await dailyResult.json();
      setSchedules((scheduleResult.data || []).map(mapSchedule));
      setOrderSchedules((dailyRows || []).map(mapPost));
    } catch (error) {
      console.error(error);
      alert("生産予定の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadSchedules = async () => {
      await fetchSchedules();
    };

    void loadSchedules();
  }, []);

  const handleNumpadChange = (value: string) => {
    if (!numpadTarget) return;
    const numericValue = Number(value || 0);

    if (numpadTarget.kind === "form") {
      setForm((prev) => ({ ...prev, [numpadTarget.field]: numericValue }));
      return;
    }

    setSchedules((prev) =>
      prev.map((schedule) =>
        schedule.id === numpadTarget.id
          ? { ...schedule, [numpadTarget.field]: numericValue }
          : schedule,
      ),
    );
  };

  const currentNumpadValue = () => {
    if (!numpadTarget) return "";
    if (numpadTarget.kind === "form") return String(form[numpadTarget.field] || "");
    const schedule = schedules.find((item) => item.id === numpadTarget.id);
    return String(schedule?.[numpadTarget.field] || "");
  };

  const handleAdd = async () => {
    if (!form.customerName || !form.productName || !form.pressNumber) {
      alert("得意先、製品名、プレス機Noを入力してください");
      return;
    }

    try {
      setLoading(true);
      const planAmount = Number(form.planAmount);
      const pressCompletedAmount = Number(form.pressCompletedAmount);
      if (planAmount < 0 || pressCompletedAmount < 0) {
        alert("予定数と完了数は0以上で入力してください");
        return;
      }
      if (pressCompletedAmount > planAmount) {
        alert("完了数は予定数以下で入力してください");
        return;
      }

      const orderNo = form.orderNo || createScheduleNo(schedules);
      const response = await fetch("/api/daily-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: form.customerName,
          product_name: form.productName,
          order_no: orderNo,
          press_number: form.pressNumber,
          lot_no: form.lotNo,
          plan_amount: planAmount,
          press_completed_amount: pressCompletedAmount,
          press_completed_date: form.pressCompletedDate || null,
        }),
      });

      if (!response.ok) throw new Error("生産予定の登録に失敗しました");

      setForm(emptyForm);
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("生産予定の登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    id: string,
    field: keyof ProductionSchedule,
    value: string | number,
  ) => {
    setSchedules((prev) =>
      prev.map((schedule) =>
        schedule.id === id ? { ...schedule, [field]: value } : schedule,
      ),
    );
  };

  const handlePostChange = (
    id: string,
    field: keyof PostData,
    value: string | number,
  ) => {
    setOrderSchedules((prev) =>
      prev.map((post) =>
        post.id === id ? { ...post, [field]: value } : post,
      ),
    );
  };

  const handleSave = async (schedule: ProductionSchedule) => {
    try {
      setLoading(true);
      const planAmount = Number(schedule.planAmount);
      const pressCompletedAmount = Number(schedule.pressCompletedAmount);
      if (planAmount < 0 || pressCompletedAmount < 0) {
        alert("予定数と完了数は0以上で入力してください");
        return;
      }
      if (pressCompletedAmount > planAmount) {
        alert("完了数は予定数以下で入力してください");
        return;
      }

      const orderNo = schedule.orderNo || createScheduleNo(schedules);

      const { error } = await supabase
        .from("production_schedules")
        .update({
          order_no: orderNo,
          customer_name: schedule.customerName,
          product_name: schedule.productName,
          press_number: schedule.pressNumber,
          lot_no: schedule.lotNo,
          plan_amount: planAmount,
          press_completed_amount: pressCompletedAmount,
          press_completed_date: schedule.pressCompletedDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id);

      if (error) throw error;

      if ((schedule.postId || orderNo) && schedule.pressCompletedDate && !orderNo.startsWith("PS-")) {
        let postUpdate = supabase
          .from("posts")
          .update({
            completion_scheduled_date: schedule.pressCompletedDate,
            updated_at: new Date().toISOString(),
          });

        postUpdate = schedule.postId
          ? postUpdate.eq("id", schedule.postId)
          : postUpdate.eq("order_no", orderNo);

        const { error: postError } = await postUpdate;
        if (postError) throw postError;
      }

      setEditingRow(null);
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("生産予定の保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handlePostSave = async (post: PostData) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from("posts")
        .update({
          order_no: post.orderNo,
          customer_name: post.customerName,
          product_name: post.productName,
          lot_no: post.lotNo || null,
          order_amount: Number(post.remainingAmount || post.orderAmount || 0),
          completion_scheduled_date:
            post.completionScheduledDate || post.deliveryDate || null,
          delivery_date: post.deliveryDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (error) throw error;

      setEditingRow(null);
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("生産予定の保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from("production_schedules")
        .delete()
        .eq("id", id);

      if (error) throw error;
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("生産予定の削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handlePostDelete = async (id: string) => {
    if (!confirm("この受注を生産予定画面から外しますか？")) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from("posts")
        .update({
          shipping_scheduled_start: null,
          shipping_scheduled_end: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("生産予定からの削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setEditingRow(null);
    await fetchSchedules();
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
        </Link>
        <h1 className={styles.title}>デイリー生産予定管理</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            placeholder="注番"
            value={form.orderNo}
            onChange={(e) => setForm({ ...form, orderNo: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="得意先"
            value={form.customerName}
            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="製品名"
            value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="プレス機No"
            value={form.pressNumber}
            onChange={(e) => setForm({ ...form, pressNumber: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="ロットNo"
            value={form.lotNo}
            onChange={(e) => setForm({ ...form, lotNo: e.target.value })}
          />
          <input
            className={styles.input}
            inputMode="numeric"
            placeholder="数量"
            value={form.planAmount || ""}
            onFocus={() => setNumpadTarget({ kind: "form", field: "planAmount" })}
            onChange={(e) => setForm({ ...form, planAmount: Number(e.target.value) })}
          />
          <input
            className={styles.input}
            inputMode="numeric"
            placeholder="プレス完了数"
            value={form.pressCompletedAmount || ""}
            onFocus={() =>
              setNumpadTarget({ kind: "form", field: "pressCompletedAmount" })
            }
            onChange={(e) =>
              setForm({ ...form, pressCompletedAmount: Number(e.target.value) })
            }
          />
          <input
            className={styles.input}
            type="date"
            value={form.pressCompletedDate}
            onChange={(e) =>
              setForm({ ...form, pressCompletedDate: e.target.value })
            }
          />
        </div>
        <button className={styles.addButton} onClick={handleAdd}>
          追加
        </button>
      </div>

      {loading && <div className={styles.loading}>読み込み中...</div>}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>種別</th>
              <th>注番</th>
              <th>得意先</th>
              <th>製品名</th>
              <th>プレス機No</th>
              <th>ロットNo</th>
              <th>数量</th>
              <th>完了数</th>
              <th>完了日</th>
              <th>納期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orderSchedules.map((post) => {
              const editing = isEditing("post", post.id);
              const rowClassName = isOverdue(post.deliveryDate)
                ? styles.dangerRow
                : styles.autoRow;

              return (
                <tr key={`post-${post.id}`} className={rowClassName}>
                  <td>
                    <span className={styles.sourceBadge}>注残</span>
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.tableInput} ${styles.orderInput}`}
                        value={post.orderNo}
                        onChange={(e) =>
                          handlePostChange(post.id, "orderNo", e.target.value)
                        }
                      />
                    ) : (
                      renderCellText(post.orderNo)
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.tableInput} ${styles.customerInput}`}
                        value={post.customerName}
                        onChange={(e) =>
                          handlePostChange(post.id, "customerName", e.target.value)
                        }
                      />
                    ) : (
                      renderCellText(post.customerName)
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.tableInput} ${styles.productInput}`}
                        value={post.productName}
                        onChange={(e) =>
                          handlePostChange(post.id, "productName", e.target.value)
                        }
                      />
                    ) : (
                      renderCellText(post.productName)
                    )}
                  </td>
                  <td>-</td>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.tableInput} ${styles.lotInput}`}
                        value={post.lotNo || ""}
                        onChange={(e) =>
                          handlePostChange(post.id, "lotNo", e.target.value)
                        }
                      />
                    ) : (
                      renderCellText(post.lotNo)
                    )}
                  </td>
                  <td>
                    <input
                      className={`${styles.tableInput} ${styles.numberInput}`}
                      disabled={!editing}
                      inputMode="numeric"
                      value={post.remainingAmount || ""}
                      onChange={(e) =>
                        handlePostChange(
                          post.id,
                          "remainingAmount",
                          Number(e.target.value),
                        )
                      }
                    />
                  </td>
                  <td>-</td>
                  <td>
                    <input
                      className={`${styles.tableInput} ${styles.dateInput}`}
                      disabled={!editing}
                      type="date"
                      value={post.completionScheduledDate || ""}
                      onChange={(e) =>
                        handlePostChange(
                          post.id,
                          "completionScheduledDate",
                          e.target.value,
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className={`${styles.tableInput} ${styles.dateInput}`}
                      disabled={!editing}
                      type="date"
                      value={post.deliveryDate || ""}
                      onChange={(e) =>
                        handlePostChange(post.id, "deliveryDate", e.target.value)
                      }
                    />
                  </td>
                  <td className={styles.actionArea}>
                    {editing ? (
                      <>
                        <button
                          className={styles.saveButton}
                          onClick={() => handlePostSave(post)}
                        >
                          保存
                        </button>
                        <button className={styles.cancelButton} onClick={handleCancel}>
                          キャンセル
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={styles.editButton}
                          onClick={() => setEditingRow({ kind: "post", id: post.id })}
                        >
                          編集
                        </button>
                        <button
                          className={styles.deleteButton}
                          onClick={() => handlePostDelete(post.id)}
                        >
                          削除
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}

            {schedules.map((schedule) => {
              const editing = isEditing("schedule", schedule.id);

              return (
              <tr key={schedule.id}>
                <td>
                  <span className={styles.manualBadge}>手入力</span>
                </td>
                <td>
                  {editing ? (
                    <input
                      className={`${styles.tableInput} ${styles.orderInput}`}
                      value={schedule.orderNo || ""}
                      onChange={(e) =>
                        handleChange(schedule.id, "orderNo", e.target.value)
                      }
                    />
                  ) : (
                    renderCellText(schedule.orderNo)
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className={`${styles.tableInput} ${styles.customerInput}`}
                      value={schedule.customerName}
                      onChange={(e) =>
                        handleChange(schedule.id, "customerName", e.target.value)
                      }
                    />
                  ) : (
                    renderCellText(schedule.customerName)
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className={`${styles.tableInput} ${styles.productInput}`}
                      value={schedule.productName}
                      onChange={(e) =>
                        handleChange(schedule.id, "productName", e.target.value)
                      }
                    />
                  ) : (
                    renderCellText(schedule.productName)
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className={`${styles.tableInput} ${styles.pressInput}`}
                      value={schedule.pressNumber}
                      onChange={(e) =>
                        handleChange(schedule.id, "pressNumber", e.target.value)
                      }
                    />
                  ) : (
                    renderCellText(schedule.pressNumber)
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className={`${styles.tableInput} ${styles.lotInput}`}
                      value={schedule.lotNo}
                      onChange={(e) =>
                        handleChange(schedule.id, "lotNo", e.target.value)
                      }
                    />
                  ) : (
                    renderCellText(schedule.lotNo)
                  )}
                </td>
                <td>
                  <input
                    className={`${styles.tableInput} ${styles.numberInput}`}
                    disabled={!editing}
                    inputMode="numeric"
                    value={schedule.planAmount || ""}
                    onFocus={() =>
                      editing &&
                      setNumpadTarget({
                        kind: "schedule",
                        id: schedule.id,
                        field: "planAmount",
                      })
                    }
                    onChange={(e) =>
                      handleChange(schedule.id, "planAmount", Number(e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    className={`${styles.tableInput} ${styles.numberInput}`}
                    disabled={!editing}
                    inputMode="numeric"
                    value={schedule.pressCompletedAmount || ""}
                    onFocus={() =>
                      editing &&
                      setNumpadTarget({
                        kind: "schedule",
                        id: schedule.id,
                        field: "pressCompletedAmount",
                      })
                    }
                    onChange={(e) =>
                      handleChange(
                        schedule.id,
                        "pressCompletedAmount",
                        Number(e.target.value),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    className={`${styles.tableInput} ${styles.dateInput}`}
                    disabled={!editing}
                    type="date"
                    value={schedule.pressCompletedDate}
                    onChange={(e) =>
                      handleChange(schedule.id, "pressCompletedDate", e.target.value)
                    }
                  />
                </td>
                <td>-</td>
                <td className={styles.actionArea}>
                  {editing ? (
                    <>
                      <button
                        className={styles.saveButton}
                        onClick={() => handleSave(schedule)}
                      >
                        保存
                      </button>
                      <button className={styles.cancelButton} onClick={handleCancel}>
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={styles.editButton}
                        onClick={() =>
                          setEditingRow({ kind: "schedule", id: schedule.id })
                        }
                      >
                        編集
                      </button>
                      <button
                        className={styles.deleteButton}
                        onClick={() => handleDelete(schedule.id)}
                      >
                        削除
                      </button>
                    </>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Numpad
        open={numpadTarget !== null}
        value={currentNumpadValue()}
        onChange={handleNumpadChange}
        onClose={() => setNumpadTarget(null)}
      />
    </div>
  );
}
