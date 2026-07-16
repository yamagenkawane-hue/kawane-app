"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import styles from "../masterCommon.module.css";

type OrderProcessRow = {
  id: string;
  postId: string;
  orderNo: string;
  productCode: string;
  productName: string;
  customerName: string;
  processName: string;
  processOrder: number;
  plannedAmount: number;
  completedAmount: number;
};

type PostLotRow = {
  id: string;
  lot_no?: string;
  order_amount?: number;
  measurement_registration_hidden?: boolean;
};

type LotMeasuredRow = {
  post_id?: string;
  measured_amount?: number;
};

type MeasurementSchedule = {
  id: string;
  postId: string;
  orderProcessId: string;
  orderNo: string;
  productCode: string;
  productName: string;
  customerName: string;
  lotNo: string;
  orderAmount: number;
  planAmount: number;
  completedAmount: number;
  availableAmount: number;
  measuredLotAmount: number;
  orderRemainingAmount: number;
  previousProcessName: string;
  previousCompletedAmount: number;
  insertProcessOrder: number;
  generatedProcess: boolean;
};

const mapOrderProcessRow = (row: Record<string, unknown>): OrderProcessRow => ({
  id: String(row.id || ""),
  postId: String(row.post_id || ""),
  orderNo: String(row.order_no || ""),
  productCode: String(row.product_code || ""),
  productName: String(row.product_name || ""),
  customerName: String(row.customer_name || ""),
  processName: String(row.process_name || ""),
  processOrder: Number(row.process_order || 0),
  plannedAmount: Number(row.planned_amount || 0),
  completedAmount: Number(row.completed_amount || 0),
});

type ExistingLotRow = {
  id?: string;
  lot_no?: string;
  material_lot_no?: string | null;
  measured_amount?: number;
  quantity?: number;
};

const normalizeLotText = (value?: string | null) =>
  String(value || "").trim();

const resolveMeasurementLot = (
  baseLotNo: string,
  materialLotNo: string,
  existingLots: ExistingLotRow[],
) => {
  const normalizedMaterial = normalizeLotText(materialLotNo);
  const sameBaseLot = existingLots.find(
    (lot) => normalizeLotText(lot.lot_no) === baseLotNo,
  );
  const sameBaseAndMaterial = existingLots.find(
    (lot) =>
      normalizeLotText(lot.lot_no) === baseLotNo &&
      normalizeLotText(lot.material_lot_no) === normalizedMaterial,
  );

  if (sameBaseAndMaterial) {
    return { lotNo: baseLotNo, existingLot: sameBaseAndMaterial };
  }

  if (!sameBaseLot) {
    return { lotNo: baseLotNo, existingLot: undefined };
  }

  const sameMaterialSplitLot = existingLots.find(
    (lot) =>
      normalizeLotText(lot.lot_no).startsWith(`${baseLotNo}-`) &&
      normalizeLotText(lot.material_lot_no) === normalizedMaterial,
  );

  if (sameMaterialSplitLot) {
    return {
      lotNo: normalizeLotText(sameMaterialSplitLot.lot_no),
      existingLot: sameMaterialSplitLot,
    };
  }

  const usedLotNos = new Set(
    existingLots.map((lot) => normalizeLotText(lot.lot_no)).filter(Boolean),
  );
  let suffix = 2;
  let nextLotNo = `${baseLotNo}-${suffix}`;

  while (usedLotNos.has(nextLotNo)) {
    suffix += 1;
    nextLotNo = `${baseLotNo}-${suffix}`;
  }

  return { lotNo: nextLotNo, existingLot: undefined };
};

const buildMeasurementSchedules = (
  processes: OrderProcessRow[],
  lotMap: Map<string, string>,
  orderAmountMap: Map<string, number>,
  measuredLotMap: Map<string, number>,
  hiddenPostIds: Set<string>,
): MeasurementSchedule[] => {
  const processesByPost = new Map<string, OrderProcessRow[]>();

  for (const process of processes) {
    if (!process.postId) continue;
    processesByPost.set(process.postId, [
      ...(processesByPost.get(process.postId) || []),
      process,
    ]);
  }

  const schedules: MeasurementSchedule[] = [];

  for (const [postId, postProcesses] of processesByPost.entries()) {
    if (hiddenPostIds.has(postId)) continue;

    const orderedProcesses = [...postProcesses].sort(
      (a, b) => a.processOrder - b.processOrder,
    );
    const measurementProcesses = orderedProcesses.filter((process) =>
      process.processName.includes("計量"),
    );
    const measurementProcess = measurementProcesses.find(
      (process) => process.completedAmount < process.plannedAmount,
    );

    if (measurementProcess) {
      const previousProcess = [...orderedProcesses]
        .filter((process) => process.processOrder < measurementProcess.processOrder)
        .sort((a, b) => b.processOrder - a.processOrder)[0];
      const previousCompletedAmount = previousProcess?.completedAmount || 0;
      const allowance =
        measurementProcess.processOrder === 1
          ? measurementProcess.plannedAmount
          : previousCompletedAmount;
      const processRemainingAmount = Math.max(
        0,
        allowance - measurementProcess.completedAmount,
      );
      const orderAmount =
        orderAmountMap.get(postId) || measurementProcess.plannedAmount;
      const measuredLotAmount = measuredLotMap.get(postId) || 0;
      const orderRemainingAmount = Math.max(0, orderAmount - measuredLotAmount);
      const availableAmount = Math.min(
        processRemainingAmount,
        orderRemainingAmount,
      );

      if (availableAmount <= 0) continue;

      schedules.push({
        id: measurementProcess.id,
        postId,
        orderProcessId: measurementProcess.id,
        orderNo: measurementProcess.orderNo,
        productCode: measurementProcess.productCode,
        productName: measurementProcess.productName,
        customerName: measurementProcess.customerName,
        lotNo: lotMap.get(postId) || "",
        orderAmount,
        planAmount: measurementProcess.plannedAmount,
        completedAmount: measurementProcess.completedAmount,
        availableAmount,
        measuredLotAmount,
        orderRemainingAmount,
        previousProcessName: previousProcess?.processName || "",
        previousCompletedAmount,
        insertProcessOrder: measurementProcess.processOrder,
        generatedProcess: false,
      });
      continue;
    }

    const completedInspectionProcess = [...orderedProcesses]
      .filter(
        (process) =>
          process.processName.includes("検査") &&
          process.plannedAmount > 0 &&
          process.completedAmount >= process.plannedAmount,
      )
      .sort((a, b) => b.processOrder - a.processOrder)[0];

    if (!completedInspectionProcess) continue;

    const nextProcess = orderedProcesses.find(
      (process) => process.processOrder > completedInspectionProcess.processOrder,
    );
    const availableAmount = completedInspectionProcess.completedAmount;
    const orderAmount =
      orderAmountMap.get(postId) || completedInspectionProcess.plannedAmount;
    const measuredLotAmount = measuredLotMap.get(postId) || 0;
    const orderRemainingAmount = Math.max(0, orderAmount - measuredLotAmount);
    const finalAvailableAmount = Math.min(availableAmount, orderRemainingAmount);

    if (finalAvailableAmount <= 0) continue;

    schedules.push({
      id: `generated-measurement-${postId}`,
      postId,
      orderProcessId: "",
      orderNo: completedInspectionProcess.orderNo,
      productCode: completedInspectionProcess.productCode,
      productName: completedInspectionProcess.productName,
      customerName: completedInspectionProcess.customerName,
      lotNo: lotMap.get(postId) || "",
      orderAmount,
      planAmount: completedInspectionProcess.plannedAmount,
      completedAmount: 0,
      availableAmount: finalAvailableAmount,
      measuredLotAmount,
      orderRemainingAmount,
      previousProcessName: completedInspectionProcess.processName,
      previousCompletedAmount: completedInspectionProcess.completedAmount,
      insertProcessOrder:
        nextProcess?.processOrder || completedInspectionProcess.processOrder + 1,
      generatedProcess: true,
    });
  }

  return schedules.sort((a, b) => a.orderNo.localeCompare(b.orderNo, "ja"));
};

export default function ManufacturingPage() {
  const [schedules, setSchedules] = useState<MeasurementSchedule[]>([]);
  const [scheduleId, setScheduleId] = useState("");
  const [finalQuantity, setFinalQuantity] = useState<number | "">("");
  const [lotNo, setLotNo] = useState("");
  const [materialLotNo, setMaterialLotNo] = useState("");
  const [numpadOpen, setNumpadOpen] = useState(false);

  const selected = useMemo(
    () => schedules.find((item) => item.id === scheduleId),
    [scheduleId, schedules],
  );

  const loadMeasurementSchedules = async () => {
    const [processResult, postResult, lotResult] = await Promise.all([
      supabase
        .from("v_order_processes_with_master")
        .select(
          "id,post_id,order_no,product_code,product_name,customer_name,process_name,process_order,planned_amount,completed_amount",
        )
        .order("process_order", { ascending: true }),
      supabase
        .from("posts")
        .select("id,lot_no,order_amount,measurement_registration_hidden"),
      supabase.from("v_lot_flow_status").select("post_id,measured_amount"),
    ]);

    if (processResult.error) {
      throw processResult.error;
    }
    if (postResult.error) {
      throw postResult.error;
    }
    if (lotResult.error) {
      throw lotResult.error;
    }

    const lotMap = new Map(
      ((postResult.data || []) as PostLotRow[]).map((post) => [
        post.id,
        post.lot_no || "",
      ]),
    );
    const orderAmountMap = new Map(
      ((postResult.data || []) as PostLotRow[]).map((post) => [
        post.id,
        Number(post.order_amount || 0),
      ]),
    );
    const measuredLotMap = new Map<string, number>();

    for (const lot of (lotResult.data || []) as LotMeasuredRow[]) {
      const postId = String(lot.post_id || "");
      if (!postId) continue;
      measuredLotMap.set(
        postId,
        (measuredLotMap.get(postId) || 0) + Number(lot.measured_amount || 0),
      );
    }

    const hiddenPostIds = new Set(
      ((postResult.data || []) as PostLotRow[])
        .filter((post) => post.measurement_registration_hidden === true)
        .map((post) => post.id),
    );
    const mappedProcesses = (processResult.data || []).map(mapOrderProcessRow);
    return buildMeasurementSchedules(
      mappedProcesses,
      lotMap,
      orderAmountMap,
      measuredLotMap,
      hiddenPostIds,
    );
  };

  const fetchSchedules = async () => {
    try {
      setSchedules(await loadMeasurementSchedules());
    } catch (error) {
      console.error(error);
      alert("計量予定の取得に失敗しました");
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const loadedSchedules = await loadMeasurementSchedules();
        if (mounted) setSchedules(loadedSchedules);
      } catch (error) {
        console.error(error);
        alert("計量予定の取得に失敗しました");
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const createGeneratedMeasurementProcess = async (
    schedule: MeasurementSchedule,
  ) => {
    const { data: shiftedProcesses, error: shiftSelectError } = await supabase
      .from("order_processes")
      .select("id,process_order")
      .eq("post_id", schedule.postId)
      .gte("process_order", schedule.insertProcessOrder)
      .order("process_order", { ascending: false });

    if (shiftSelectError) throw shiftSelectError;

    for (const process of shiftedProcesses || []) {
      const { error: shiftError } = await supabase
        .from("order_processes")
        .update({
          process_order: Number(process.process_order || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", process.id);

      if (shiftError) throw shiftError;
    }

    const { data: insertedProcess, error: insertError } = await supabase
      .from("order_processes")
      .insert({
        post_id: schedule.postId,
        order_no: schedule.orderNo,
        product_code: schedule.productCode,
        product_name: schedule.productName,
        customer_name: schedule.customerName,
        process_name: "計量",
        process_order: schedule.insertProcessOrder,
        planned_amount: schedule.planAmount,
        completed_amount: 0,
        locked: false,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;
    if (!insertedProcess?.id) {
      throw new Error("計量工程の作成に失敗しました");
    }

    return String(insertedProcess.id);
  };

  const handleConfirm = async () => {
    if (!selected || finalQuantity === "") {
      alert("計量する予定と最終確定数量を入力してください");
      return;
    }

    if (!lotNo.trim()) {
      alert("ロットNoを入力してください");
      return;
    }

    const quantity = Number(finalQuantity);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert("数量は1以上で入力してください");
      return;
    }

    if (quantity > selected.availableAmount) {
      alert(`登録可能数量は${selected.availableAmount}です`);
      return;
    }

    const readiness = await supabase
      .from("v_lot_flow_status")
      .select("id")
      .limit(1);

    if (readiness.error) {
      alert("ロット追跡SQLを先にSupabaseで実行してください");
      throw readiness.error;
    }

    const orderProcessId = selected.orderProcessId
      ? selected.orderProcessId
      : await createGeneratedMeasurementProcess(selected);

    const { data: latestLots, error: latestLotsError } = await supabase
      .from("v_lot_flow_status")
      .select("measured_amount")
      .eq("post_id", selected.postId);

    if (latestLotsError) {
      alert("計量済み数量の確認に失敗しました");
      throw latestLotsError;
    }

    const latestMeasuredAmount = (latestLots || []).reduce(
      (sum, lot) => sum + Number(lot.measured_amount || 0),
      0,
    );
    const latestOrderRemaining = Math.max(
      0,
      Number(selected.orderAmount || 0) - latestMeasuredAmount,
    );

    if (quantity > latestOrderRemaining) {
      alert(`注番全体の未計量残は${latestOrderRemaining}です`);
      return;
    }

    const { error: resultError } = await supabase.rpc(
      "register_order_process_result",
      {
        p_order_process_id: orderProcessId,
        p_schedule_id: null,
        p_date: today,
        p_amount: quantity,
        p_lot_id: null,
      },
    );

    if (resultError) {
      alert(`計量実績の登録に失敗しました: ${resultError.message}`);
      throw resultError;
    }

    const { data: resultRows, error: latestResultError } = await supabase
      .from("production_results")
      .select("id")
      .eq("post_id", selected.postId)
      .eq("order_process_id", orderProcessId)
      .eq("date", today)
      .eq("amount", quantity)
      .order("created_at", { ascending: false })
      .limit(1);

    if (latestResultError) {
      alert("計量実績のロット紐づけに失敗しました");
      throw latestResultError;
    }

    const measurementResultId = resultRows?.[0]?.id
      ? String(resultRows[0].id)
      : null;
    const trimmedLotNo = lotNo.trim();
    const trimmedMaterialLotNo = materialLotNo.trim();

    const { data: existingLots, error: existingLotError } = await supabase
      .from("lots")
      .select("id,lot_no,material_lot_no,measured_amount,quantity")
      .eq("post_id", selected.postId)
      .order("created_at", { ascending: true });

    if (existingLotError) {
      alert("ロット情報の確認に失敗しました");
      throw existingLotError;
    }

    const { lotNo: resolvedLotNo, existingLot } = resolveMeasurementLot(
      trimmedLotNo,
      trimmedMaterialLotNo,
      (existingLots || []) as ExistingLotRow[],
    );
    let lotId = existingLot?.id ? String(existingLot.id) : "";

    if (existingLot) {
      const nextMeasuredAmount =
        Number(existingLot.measured_amount || 0) + quantity;
      const nextQuantity = Number(existingLot.quantity || 0) + quantity;
      const { error: lotUpdateError } = await supabase
        .from("lots")
        .update({
          quantity: nextQuantity,
          measured_amount: nextMeasuredAmount,
          material_lot_no: trimmedMaterialLotNo || null,
          measurement_result_id: measurementResultId,
          measurement_order_process_id: orderProcessId,
          status: "measured",
          measured_at: today,
          updated_at: now,
        })
        .eq("id", lotId);

      if (lotUpdateError) {
        alert("ロット情報の更新に失敗しました");
        throw lotUpdateError;
      }
    } else {
      const { data: insertedLot, error: lotInsertError } = await supabase
        .from("lots")
        .insert({
          post_id: selected.postId,
          order_no: selected.orderNo,
          product_code: selected.productCode,
          product_name: selected.productName,
          customer_name: selected.customerName,
          lot_no: resolvedLotNo,
          lot_type: "normal",
          quantity,
          measured_amount: quantity,
          material_lot_no: trimmedMaterialLotNo || null,
          measurement_result_id: measurementResultId,
          measurement_order_process_id: orderProcessId,
          status: "measured",
          measured_at: today,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single();

      if (lotInsertError) {
        alert("ロット情報の作成に失敗しました");
        throw lotInsertError;
      }

      lotId = String(insertedLot.id || "");
    }

    if (measurementResultId && lotId) {
      const { error: resultLotError } = await supabase
        .from("production_results")
        .update({ lot_id: lotId })
        .eq("id", measurementResultId);

      if (resultLotError) {
        alert("計量実績とロットの紐づけに失敗しました");
        throw resultLotError;
      }
    }

    await supabase
      .from("posts")
      .update({
        lot_no: trimmedLotNo,
        updated_at: now,
      })
      .eq("id", selected.postId);

    setFinalQuantity("");
    setMaterialLotNo("");
    await fetchSchedules();
    alert("計量実績を登録しました。梱包完了後に在庫へ反映されます");
  };

  const handleDeleteSelected = async () => {
    if (!selected) {
      alert("削除する製品を選択してください");
      return;
    }

    if (selected.completedAmount > 0) {
      alert("計量実績が登録済みの製品は削除できません");
      return;
    }

    if (
      !confirm(
        `${selected.orderNo} / ${selected.productName} を計量登録のリストから削除します。よろしいですか？`,
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("posts")
      .update({
        measurement_registration_hidden: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selected.postId);

    if (error) {
      console.error(error);
      alert("選択した製品の削除に失敗しました");
      return;
    }

    setScheduleId("");
    setFinalQuantity("");
    setLotNo("");
    setMaterialLotNo("");
    await fetchSchedules();
    alert("選択した製品を削除しました");
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
              setMaterialLotNo("");
            }}
          >
            <option value="">計量する予定を選択</option>
            {schedules.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {schedule.orderNo} / {schedule.productName} / {schedule.productCode} / 残{schedule.availableAmount}
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
            placeholder="材料ロットNo"
            value={materialLotNo}
            onChange={(e) => setMaterialLotNo(e.target.value)}
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
          {selected && (
            <button className={styles.deleteButton} onClick={handleDeleteSelected}>
              削除
            </button>
          )}
        </div>
      </div>

      {selected && (
        <div className={styles.summaryCard}>
          <div>
            <span>得意先</span>
            <strong>{selected.customerName}</strong>
          </div>
          <div>
            <span>計画数</span>
            <strong>{selected.planAmount}</strong>
          </div>
          <div>
            <span>計量済数</span>
            <strong>{selected.completedAmount}</strong>
          </div>
          <div>
            <span>登録可能数</span>
            <strong>{selected.availableAmount}</strong>
          </div>
          <div>
            <span>前工程</span>
            <strong>
              {selected.previousProcessName || "-"} / {selected.previousCompletedAmount}
            </strong>
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
