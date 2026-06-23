"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import { ProductionSchedule } from "@/app/type";
import styles from "../masterCommon.module.css";

export default function ManufacturingPage() {
  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [scheduleId, setScheduleId] = useState("");
  const [finalQuantity, setFinalQuantity] = useState<number | "">("");
  const [lotNo, setLotNo] = useState("");
  const [numpadOpen, setNumpadOpen] = useState(false);

  const selected = schedules.find((item) => item.id === scheduleId);

  const fetchSchedules = async () => {
    const { data, error } = await supabase
      .from("v_production_schedules_with_master")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      alert("生産予定の取得に失敗しました");
      return;
    }
    setSchedules(
      (data || []).map((row) => ({
        id: row.id,
        postId: row.post_id || "",
        orderNo: row.order_no || "",
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
    const loadSchedules = async () => {
      const { data, error } = await supabase
        .from("v_production_schedules_with_master")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        alert("生産予定の取得に失敗しました");
        return;
      }

      const mappedSchedules: ProductionSchedule[] = (data || []).map((row) => ({
        id: row.id,
        postId: row.post_id || "",
        orderNo: row.order_no || "",
        customerName: row.customer_name || "",
        productName: row.product_name || "",
        pressNumber: row.press_number || "",
        lotNo: row.lot_no || "",
        planAmount: row.plan_amount || 0,
        pressCompletedAmount: row.press_completed_amount || 0,
        pressCompletedDate: row.press_completed_date || "",
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || "",
      }));

      setSchedules(mappedSchedules);
    };

    void loadSchedules();
  }, []);

  const handleConfirm = async () => {
    if (!selected || finalQuantity === "") {
      alert("製品と最終確定数量を入力してください");
      return;
    }

    const quantity = Number(finalQuantity);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    if (selected.postId) {
      await supabase.rpc("create_order_processes_for_post", {
        p_post_id: selected.postId,
      });

      const { data: firstProcess, error: processError } = await supabase
        .from("v_order_processes_with_master")
        .select("id,completed_amount,planned_amount")
        .eq("post_id", selected.postId)
        .order("process_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (processError) throw processError;
      if (!firstProcess?.id) {
        throw new Error("製造工程が見つかりません");
      }

      const completedAmount = Number(firstProcess.completed_amount || 0);
      const plannedAmount = Number(firstProcess.planned_amount || 0);
      const remainingAmount = Math.max(0, plannedAmount - completedAmount);

      if (quantity > remainingAmount) {
        throw new Error(`製造工程の登録可能数量は${remainingAmount}です`);
      }

      const { error: resultError } = await supabase.rpc(
        "register_order_process_result",
        {
          p_order_process_id: firstProcess.id,
          p_schedule_id: selected.id,
          p_date: today,
          p_amount: quantity,
        },
      );

      if (resultError) throw resultError;
    } else {
      const { error: resultError } = await supabase
        .from("production_results")
        .insert({
          schedule_id: selected.id,
          process_id: "manufacturing",
          process_name: "製造",
          date: today,
          amount: quantity,
          created_at: now,
        });

      if (resultError) throw resultError;
    }

    const { data: existing } = await supabase.from("inventory_items")
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
    alert("計量実績と在庫を更新しました");
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
        </Link>
        <h1 className={styles.title}>計量登録</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <select
            className={styles.select}
            value={scheduleId}
            onChange={(e) => {
              const value = e.target.value;

              setScheduleId(value);

              const schedule = schedules.find((item) => item.id === value);

              setLotNo(schedule?.lotNo || "");
            }}
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
            inputMode="numeric"
            placeholder="計量後の最終確定数量"
            value={finalQuantity}
            onFocus={() => setNumpadOpen(true)}
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

      <Numpad
        open={numpadOpen}
        value={finalQuantity === "" ? "" : String(finalQuantity)}
        onChange={(value) =>
          setFinalQuantity(value === "" ? "" : Number(value))
        }
        onClose={() => setNumpadOpen(false)}
      />
    </div>
  );
}
