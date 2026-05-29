"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { PostData, ProductionSchedule } from "@/app/type";
import styles from "./page.module.css";

const emptyForm = {
  customerName: "",
  productName: "",
  pressNumber: "",
  lotNo: "",
  planAmount: 0,
  pressCompletedAmount: 0,
  pressCompletedDate: "",
};

export default function ProductionSchedulesPage() {
  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [orderSchedules, setOrderSchedules] = useState<PostData[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const isTodayInProductionPeriod = (row: any) => {
    const today = formatDate(new Date());
    const startDate =
      row.manufacturing_date ||
      row.created_at?.slice(0, 10) ||
      row.delivery_date ||
      today;
    const completionDate =
      row.completion_scheduled_date || row.delivery_date || startDate;

    return startDate <= today && today <= completionDate;
  };

  const fetchSchedules = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("production_schedules")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: orderRows, error: orderError } = await supabase
        .from("posts")
        .select("*")
        .order("delivery_date", { ascending: true });

      if (orderError) throw orderError;

      setSchedules(
        (data || []).map((row) => ({
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

      setOrderSchedules(
        (orderRows || [])
          .filter((row) => {
            const packagingAmount = (row.packaging_logs || []).reduce(
              (sum: number, log: { amount: number }) => sum + log.amount,
              0,
            );
            const orderAmount = Number(row.order_amount || 0);
            return (
              row.delete !== true &&
              orderAmount - packagingAmount > 0 &&
              isTodayInProductionPeriod(row)
            );
          })
          .map((row) => {
            const packagingAmount = (row.packaging_logs || []).reduce(
              (sum: number, log: { amount: number }) => sum + log.amount,
              0,
            );

            return {
              id: row.id,
              orderNo: row.order_no || "",
              lotNo: row.lot_no || "",
              productName: row.product_name || "",
              customerName: row.customer_name || "",
              orderAmount: row.order_amount || 0,
              remainingAmount: Number(row.order_amount || 0) - packagingAmount,
              status: row.status || "",
              deliveryDate: row.delivery_date || "",
              completionScheduledDate:
                row.completion_scheduled_date || row.delivery_date || "",
              remark: row.remark || "",
              packagingAmount,
            };
          }),
      );
    } catch (error) {
      console.error(error);
      alert("生産予定の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSchedules();
  }, []);

  const handleAdd = async () => {
    if (!form.customerName || !form.productName || !form.pressNumber) {
      alert("取引先、製品名、プレスナンバーを入力してください");
      return;
    }

    try {
      setLoading(true);

      const now = new Date().toISOString();
      const { error } = await supabase.from("production_schedules").insert({
        customer_name: form.customerName,
        product_name: form.productName,
        press_number: form.pressNumber,
        lot_no: form.lotNo,
        plan_amount: Number(form.planAmount),
        press_completed_amount: Number(form.pressCompletedAmount),
        press_completed_date: form.pressCompletedDate || null,
        created_at: now,
        updated_at: now,
      });

      if (error) throw error;

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

  const handleSave = async (schedule: ProductionSchedule) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from("production_schedules")
        .update({
          customer_name: schedule.customerName,
          product_name: schedule.productName,
          press_number: schedule.pressNumber,
          lot_no: schedule.lotNo,
          plan_amount: Number(schedule.planAmount),
          press_completed_amount: Number(schedule.pressCompletedAmount),
          press_completed_date: schedule.pressCompletedDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id);

      if (error) throw error;

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
            placeholder="取引先"
            value={form.customerName}
            onChange={(e) =>
              setForm({ ...form, customerName: e.target.value })
            }
          />
          <input
            className={styles.input}
            placeholder="製品名"
            value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="プレスナンバー"
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
            type="number"
            placeholder="計画数"
            value={form.planAmount}
            onChange={(e) =>
              setForm({ ...form, planAmount: Number(e.target.value) })
            }
          />
          <input
            className={styles.input}
            type="number"
            placeholder="プレス完了数"
            value={form.pressCompletedAmount}
            onChange={(e) =>
              setForm({
                ...form,
                pressCompletedAmount: Number(e.target.value),
              })
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
              <th>取引先</th>
              <th>製品名</th>
              <th>プレスNo</th>
              <th>ロットNo</th>
              <th>計画数</th>
              <th>完了数</th>
              <th>完了日</th>
              <th>完了予定日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orderSchedules.map((post) => (
              <tr key={`post-${post.id}`} className={styles.autoRow}>
                <td>
                  <span className={styles.sourceBadge}>注残</span>
                </td>
                <td>{post.customerName}</td>
                <td>{post.productName}</td>
                <td>{post.orderNo}</td>
                <td>{post.lotNo || "-"}</td>
                <td>{post.orderAmount}</td>
                <td>{post.packagingAmount || 0}</td>
                <td>-</td>
                <td>{post.completionScheduledDate || post.deliveryDate}</td>
                <td className={styles.readOnlyText}>自動表示</td>
              </tr>
            ))}

            {schedules.map((schedule) => (
              <tr key={schedule.id}>
                <td>
                  <span className={styles.manualBadge}>手入力</span>
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={schedule.customerName}
                    onChange={(e) =>
                      handleChange(schedule.id, "customerName", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={schedule.productName}
                    onChange={(e) =>
                      handleChange(schedule.id, "productName", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={schedule.pressNumber}
                    onChange={(e) =>
                      handleChange(schedule.id, "pressNumber", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={schedule.lotNo}
                    onChange={(e) =>
                      handleChange(schedule.id, "lotNo", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    type="number"
                    value={schedule.planAmount}
                    onChange={(e) =>
                      handleChange(
                        schedule.id,
                        "planAmount",
                        Number(e.target.value),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    type="number"
                    value={schedule.pressCompletedAmount}
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
                    className={styles.tableInput}
                    type="date"
                    value={schedule.pressCompletedDate}
                    onChange={(e) =>
                      handleChange(
                        schedule.id,
                        "pressCompletedDate",
                        e.target.value,
                      )
                    }
                  />
                </td>
                <td>-</td>
                <td className={styles.actionArea}>
                  <button
                    className={styles.saveButton}
                    onClick={() => handleSave(schedule)}
                  >
                    保存
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={() => handleDelete(schedule.id)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
