"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { ProductionSchedule } from "@/app/type";
import styles from "../masterCommon.module.css";

export default function ManufacturingPage() {
  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [scheduleId, setScheduleId] = useState("");
  const [finalQuantity, setFinalQuantity] = useState<number | "">("");
  const [lotNo, setLotNo] = useState("");

  const selected = schedules.find((item) => item.id === scheduleId);

  const fetchSchedules = async () => {
    const { data, error } = await supabase
      .from("production_schedules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      alert("生産予定の取得に失敗しました");
      return;
    }
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
  };

  useEffect(() => {
    void fetchSchedules();
  }, []);

  useEffect(() => {
    setLotNo(selected?.lotNo || "");
  }, [selected?.lotNo]);

  const handleConfirm = async () => {
    if (!selected || finalQuantity === "") {
      alert("製品と最終確定数量を入力してください");
      return;
    }

    const quantity = Number(finalQuantity);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    await supabase.from("production_results").insert({
      schedule_id: selected.id,
      process_id: "manufacturing",
      process_name: "製造",
      date: today,
      amount: quantity,
      created_at: now,
    });

    const { data: existing } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("product_name", selected.productName)
      .eq("lot_no", lotNo)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("inventory_items")
        .update({
          current_stock: Number(existing.current_stock || 0) + quantity,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("inventory_items").insert({
        product_code: selected.pressNumber,
        product_name: selected.productName,
        lot_no: lotNo,
        current_stock: quantity,
        updated_at: now,
      });
    }

    await supabase
      .from("production_schedules")
      .update({
        press_completed_amount: quantity,
        press_completed_date: today,
        lot_no: lotNo,
        updated_at: now,
      })
      .eq("id", selected.id);

    setFinalQuantity("");
    await fetchSchedules();
    alert("製造実績と在庫を更新しました");
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
        </Link>
        <h1 className={styles.title}>製造管理</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <select
            className={styles.select}
            value={scheduleId}
            onChange={(e) => setScheduleId(e.target.value)}
          >
            <option value="">製造する予定を選択</option>
            {schedules.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {schedule.productName} / {schedule.pressNumber} /{" "}
                {schedule.lotNo || "ロット未設定"}
              </option>
            ))}
          </select>
          <input
            className={styles.input}
            placeholder="ロットNo"
            value={lotNo}
            onChange={(e) => setLotNo(e.target.value)}
          />
          <input
            className={styles.input}
            type="number"
            placeholder="計量後の最終確定数量"
            value={finalQuantity}
            onChange={(e) =>
              setFinalQuantity(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          />
        </div>
        <div className={styles.buttonRow}>
          <button className={styles.addButton} onClick={handleConfirm}>
            確定登録
          </button>
        </div>
      </div>

      {selected && (
        <div className={styles.summaryCard}>
          <div>
            <span>取引先</span>
            <strong>{selected.customerName}</strong>
          </div>
          <div>
            <span>計画数</span>
            <strong>{selected.planAmount}</strong>
          </div>
          <div>
            <span>プレス完了数</span>
            <strong>{selected.pressCompletedAmount}</strong>
          </div>
          <div>
            <span>完了日</span>
            <strong>{selected.pressCompletedDate || "-"}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
