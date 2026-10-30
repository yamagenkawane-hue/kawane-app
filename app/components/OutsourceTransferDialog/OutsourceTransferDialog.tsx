"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { type OutsourceTransferDates, validateOutsourceTransferDates } from "@/lib/outsourceTransfer";
import styles from "./page.module.css";
import type { OutsourceRemainder } from "@/lib/outsourceRemainders";

export type OutsourceTransferRequest = {
  lotId: string;
  lotNo: string;
  orderProcessId: string;
  processName: string;
  quantity: number;
  dates: OutsourceTransferDates;
  idempotencyKey: string;
  isRemainder?: boolean;
  schedules?: OutsourceRemainder[];
  availableNewQuantity?: number;
};

type Props = {
  request: OutsourceTransferRequest;
  today: string;
  onCancel: () => void;
  onSubmit: (amount: number, dates: OutsourceTransferDates, scheduleId?: string) => Promise<void>;
};

export default function OutsourceTransferDialog({ request, today, onCancel, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const [dates, setDates] = useState(request.dates);
  const [amount, setAmount] = useState(String(request.isRemainder?Math.min(request.quantity,request.schedules?.[0]?request.schedules[0].quantity-request.schedules[0].movedAmount:request.availableNewQuantity||0):request.quantity));
  const [scheduleId,setScheduleId]=useState(request.schedules?.[0]?.id||"");
  const selectedSchedule=request.schedules?.find(item=>item.id===scheduleId);
  const registeredDates=selectedSchedule?{sentDate:selectedSchedule.sentDate,expectedDate:selectedSchedule.expectedDate,returnedDate:selectedSchedule.returnedDate}
    : request.isRemainder?{sentDate:"",expectedDate:"",returnedDate:""}:request.dates;
  const maxQuantity=request.isRemainder?Math.min(request.quantity,selectedSchedule?selectedSchedule.quantity-selectedSchedule.movedAmount:request.availableNewQuantity||0):request.quantity;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    const quantity = Number(amount);
    const message = validateOutsourceTransferDates(dates, today);
    if (message) { setError(message); return; }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > maxQuantity) {
      setError(`移動数量は1〜${maxQuantity}の整数で入力してください。`);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSubmit(quantity, dates, scheduleId||undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "外注日程の登録・工程移動に失敗しました。");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const fields = [
    ["sentDate", "出し日"], ["expectedDate", "予定日（戻り予定日）"], ["returnedDate", "実績日（戻り日）"],
  ] as const;

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="outsource-transfer-title"
      onCancel={event => { event.preventDefault(); if (!savingRef.current) onCancel(); }}>
      <form onSubmit={submit}>
        <h2 id="outsource-transfer-title">{request.isRemainder?"残数分の外注日程で次工程へ移動":"外注日程を登録して次工程へ移動"}</h2>
        <p>{request.lotNo} ／ {request.processName}</p>
        <p>未登録の外注日程を入力してください。登録済みの日付は引き継ぎます。</p>
        <fieldset disabled={saving} className={styles.fields}>
          {request.isRemainder&&<label><span>対象の追加日程</span>
            <select value={scheduleId} onChange={event=>{
              const id=event.target.value,item=request.schedules?.find(row=>row.id===id);
              setScheduleId(id);setDates(item?{sentDate:item.sentDate,expectedDate:item.expectedDate,returnedDate:item.returnedDate}:{sentDate:"",expectedDate:"",returnedDate:""});
              setAmount(String(Math.min(request.quantity,item?item.quantity-item.movedAmount:request.availableNewQuantity||0)));setError("");
            }}>
              {(request.schedules||[]).map(item=><option key={item.id} value={item.id}>追加{item.sequence}回目：未移動{item.quantity-item.movedAmount}個／出し日 {item.sentDate||"未登録"}</option>)}
              {(request.availableNewQuantity||0)>0&&<option value="">新しい残数分の日程</option>}
            </select>
          </label>}
          {fields.map(([key, label]) => (
            <label key={key}>
              <span>{label}{registeredDates[key] ? "（登録済み）" : ""}</span>
              <input type="date" required value={dates[key]} readOnly={Boolean(registeredDates[key])}
                max={key === "expectedDate" ? undefined : today}
                min={key === "sentDate" ? undefined : dates.sentDate || undefined}
                onChange={event => setDates(previous => ({ ...previous, [key]: event.target.value }))} />
            </label>
          ))}
          <label><span>移動数量</span>
            <input type="number" required min={1} max={maxQuantity} step={1} value={amount}
              onChange={event => setAmount(event.target.value)} />
          </label>
        </fieldset>
        <p className={styles.note}>実績日を工程の作業日として記録します。</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" disabled={saving} onClick={onCancel}>キャンセル</button>
          <button type="submit" disabled={saving}>{saving ? "登録・移動中…" : "登録して次工程へ移動"}</button>
        </div>
      </form>
    </dialog>
  );
}
