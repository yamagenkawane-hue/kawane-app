"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import supabase from "@/lib/supabase";
import Numpad from "@/app/components/Numpad/Numpad";
import { AiPredictionSettings } from "@/app/type";
import styles from "./page.module.css";

const DEFAULT_SETTINGS: AiPredictionSettings = {
  id: "global", enabled: true, usePastResults: true,
  priorityReferenceDays: 90, maxReferenceDays: 730,
  manufacturingMinBusinessDays: 5, otherProcessMinLots: 5,
  outsourceDefaultSentOffsetDays: 0, outsourceDefaultReturnOffsetDays: 3,
  validationMode: true,
};

type NumberSettingKey = "priorityReferenceDays" | "maxReferenceDays" | "manufacturingMinBusinessDays" | "otherProcessMinLots" | "outsourceDefaultSentOffsetDays" | "outsourceDefaultReturnOffsetDays";
type ScheduledRunStatus = { id: string; status: string; started_at: string; finished_at?: string; target_count: number; success_count: number; failed_count: number; error_message?: string };
type EvaluationDetail = { id: string; order_no: string; predicted_completion_date: string; actual_completion_date: string; business_day_error: number; lead_business_days: number; created_at: string };
type RunStatus = { id?: string; status?: string; model?: string; trigger_type?: string; started_at?: string; finished_at?: string; target_count?: number; success_count?: number; failed_count?: number; error_message?: string; evaluation_count?: number; average_absolute_error?: number | null; cron_configured?: boolean; schedule_label?: string; latest_scheduled_run?: ScheduledRunStatus | null; evaluation_details?: EvaluationDetail[]; failure_details?: Array<{ order_no: string; process_name: string; reason: string }> };
type ProductOption = { id: string; name: string };
type ProcessOption = { id: string; name: string; sort: number };
type SubcontractorOption = { id: string; name: string };
type ReferenceStart = { id: string; productId: string; productName: string; processId: string; processName: string; pressNumber: string; subcontractorId: string; subcontractorName: string; referenceStartDate: string };
type SettingsTab = "common" | "individual" | "status";

const mapSettings = (row: Record<string, unknown>): AiPredictionSettings => ({
  id: String(row.id || "global"), enabled: Boolean(row.enabled),
  usePastResults: Boolean(row.use_past_results),
  priorityReferenceDays: Number(row.priority_reference_days || 90),
  maxReferenceDays: Number(row.max_reference_days || 730),
  manufacturingMinBusinessDays: Number(row.manufacturing_min_business_days || 5),
  otherProcessMinLots: Number(row.other_process_min_lots || 5),
  outsourceDefaultSentOffsetDays: Number(row.outsource_default_sent_offset_days ?? 0),
  outsourceDefaultReturnOffsetDays: Number(row.outsource_default_return_offset_days ?? 3),
  validationMode: row.validation_mode !== false,
});

const formatDateTime = (value?: string) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
const formatRunStatus = (status?: string) => status === "succeeded" ? "成功" : status === "partial" ? "一部成功" : status === "failed" ? "失敗" : status === "running" ? "実行中" : status === "skipped" ? "未実行" : "-";
const formatEvaluationError = (value: number) => value === 0 ? "一致" : value > 0 ? `${value}営業日遅れ` : `${Math.abs(value)}営業日前倒し`;

export default function AiPredictionSettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [editingKey, setEditingKey] = useState<NumberSettingKey | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [pressNumbers, setPressNumbers] = useState<string[]>([]);
  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([]);
  const [referenceStarts, setReferenceStarts] = useState<ReferenceStart[]>([]);
  const [referenceProductId, setReferenceProductId] = useState("");
  const [referenceProcessId, setReferenceProcessId] = useState("");
  const [referencePressNumber, setReferencePressNumber] = useState("");
  const [referenceSubcontractorId, setReferenceSubcontractorId] = useState("");
  const [referenceStartDate, setReferenceStartDate] = useState("");
  const [activeTab, setActiveTab] = useState<SettingsTab>("common");

  const fetchRunStatus = useCallback(async () => {
    const response = await fetch("/api/ai-predictions/status", { cache: "no-store" });
    if (response.ok) setRunStatus((await response.json()) as RunStatus | null);
  }, []);

  const fetchReferenceStarts = useCallback(async () => {
    const { data, error } = await supabase
      .from("ai_prediction_reference_starts")
      .select("id,product_id,process_id,press_number,subcontractor_id,reference_start_date,product_master(product_name),process_master(name),subcontractors(name)")
      .order("reference_start_date", { ascending: false });
    if (error) throw error;
    setReferenceStarts((data || []).map((row) => {
      const product = Array.isArray(row.product_master) ? row.product_master[0] : row.product_master;
      const process = Array.isArray(row.process_master) ? row.process_master[0] : row.process_master;
      const subcontractor = Array.isArray(row.subcontractors) ? row.subcontractors[0] : row.subcontractors;
      return {
        id: String(row.id), productId: String(row.product_id || ""),
        productName: String(product?.product_name || "-"), processId: String(row.process_id || ""),
        processName: String(process?.name || "-"), pressNumber: String(row.press_number || ""),
        subcontractorId: String(row.subcontractor_id || ""), subcontractorName: String(subcontractor?.name || ""),
        referenceStartDate: String(row.reference_start_date || ""),
      };
    }));
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from("ai_prediction_settings").select("*").eq("id", "global").maybeSingle();
      if (error) {
        setMessageType("error");
        setMessage("AI予測用SQLを実行してください。");
      }
      else if (data) setSettings(mapSettings(data));
      const [productResponse, processResponse, scheduleResponse, subcontractorResponse] = await Promise.all([
        supabase.from("product_master").select("id,product_name").order("product_name"),
        supabase.from("process_master").select("id,name,sort").eq("enabled", true).order("sort"),
        supabase.from("production_schedules").select("press_number").eq("department", "製造G").not("press_number", "is", null),
        supabase.from("subcontractors").select("id,name").order("name"),
      ]);
      if (!productResponse.error) setProducts((productResponse.data || []).map((row) => ({ id: String(row.id), name: String(row.product_name || "-") })));
      if (!processResponse.error) setProcesses((processResponse.data || []).map((row) => ({ id: String(row.id), name: String(row.name || "-"), sort: Number(row.sort || 0) })));
      if (!scheduleResponse.error) setPressNumbers([...new Set((scheduleResponse.data || []).map((row) => String(row.press_number || "").trim()).filter(Boolean))].sort());
      if (!subcontractorResponse.error) setSubcontractors((subcontractorResponse.data || []).map((row) => ({ id: String(row.id), name: String(row.name || "-") })));
      try { await fetchReferenceStarts(); } catch { setMessageType("error"); setMessage("参照開始日の取得に失敗しました。"); }
      await fetchRunStatus();
      setLoading(false);
    };
    void load();
  }, [fetchReferenceStarts, fetchRunStatus]);

  const saveReferenceStart = async () => {
    if (!referenceProductId || !referenceProcessId || !referenceStartDate) {
      setMessageType("error"); setMessage("製品・工程・参照開始日をすべて選択してください。"); return;
    }
    const normalizedPressNumber = referencePressNumber.trim();
    if (normalizedPressNumber && referenceSubcontractorId) {
      setMessageType("error"); setMessage("設備Noと外注先はどちらか一方だけ選択してください。"); return;
    }
    const { error } = await supabase.from("ai_prediction_reference_starts").upsert({
      product_id: referenceProductId, process_id: referenceProcessId,
      press_number: normalizedPressNumber || null, subcontractor_id: referenceSubcontractorId || null,
      reference_start_date: referenceStartDate, updated_at: new Date().toISOString(),
    }, { onConflict: "product_id,process_id,press_number,subcontractor_id" });
    if (error) { setMessageType("error"); setMessage(`参照開始日の保存に失敗しました: ${error.message}`); return; }
    setMessageType("success"); setMessage("参照開始日を保存しました。次回の予測から反映されます。");
    setReferenceProductId(""); setReferenceProcessId(""); setReferencePressNumber(""); setReferenceSubcontractorId(""); setReferenceStartDate("");
    await fetchReferenceStarts();
  };

  const deleteReferenceStart = async (id: string) => {
    const { error } = await supabase.from("ai_prediction_reference_starts").delete().eq("id", id);
    if (error) { setMessageType("error"); setMessage(`削除に失敗しました: ${error.message}`); return; }
    setReferenceStarts((current) => current.filter((item) => item.id !== id));
  };

  const setNumber = (key: NumberSettingKey, value: string) => {
    const parsed = Math.max(0, Math.floor(Number(value || 0)));
    setSettings((current) => ({ ...current, [key]: parsed }));
  };
  const validate = () => {
    if (settings.priorityReferenceDays < 1 || settings.maxReferenceDays < settings.priorityReferenceDays || settings.manufacturingMinBusinessDays < 1 || settings.otherProcessMinLots < 1) {
      return "各設定は1以上、最大参照期間は優先参照期間以上で入力してください。";
    }
    if (settings.outsourceDefaultReturnOffsetDays < settings.outsourceDefaultSentOffsetDays) {
      return "外注の戻り日は出し日以降になるように設定してください。";
    }
    return "";
  };

  const saveSettings = async () => {
    const validationMessage = validate();
    if (validationMessage) {
      setMessageType("error");
      return setMessage(validationMessage);
    }
    setSaving(true); setMessage(""); setMessageType("success");
    const { error } = await supabase.from("ai_prediction_settings").upsert({
      id: "global", enabled: settings.enabled, use_past_results: settings.usePastResults,
      priority_reference_days: settings.priorityReferenceDays, max_reference_days: settings.maxReferenceDays,
      manufacturing_min_business_days: settings.manufacturingMinBusinessDays,
      other_process_min_lots: settings.otherProcessMinLots,
      outsource_default_sent_offset_days: settings.outsourceDefaultSentOffsetDays,
      outsource_default_return_offset_days: settings.outsourceDefaultReturnOffsetDays,
      validation_mode: settings.validationMode,
      updated_at: new Date().toISOString(),
    });
    setMessageType(error ? "error" : "success");
    setMessage(error ? `保存に失敗しました: ${error.message}` : "AI予測設定を保存しました。");
    setSaving(false);
  };

  const runPrediction = async () => {
    const validationMessage = validate();
    if (validationMessage) {
      setMessageType("error");
      return setMessage(validationMessage);
    }
    setRunning(true); setMessageType("success"); setMessage("AI予測を実行しています。この画面を閉じずにお待ちください。");
    try {
      const response = await fetch("/api/ai-predictions/run", { method: "POST" });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "AI予測の実行に失敗しました。");
      setMessage(body.message || "AI予測を更新しました。");
      setMessageType("success");
      await fetchRunStatus();
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "AI予測の実行に失敗しました。");
      await fetchRunStatus();
    } finally { setRunning(false); }
  };

  const numberFields: Array<{ key: NumberSettingKey; label: string; unit: string; help: string }> = [
    { key: "priorityReferenceDays", label: "優先参照期間", unit: "日", help: "まず参照する直近の期間" },
    { key: "maxReferenceDays", label: "最大参照期間", unit: "日", help: "実績不足時に遡る上限" },
    { key: "manufacturingMinBusinessDays", label: "製造の基準生産日数", unit: "日分", help: "Gemini予測に必要な製造実績" },
    { key: "otherProcessMinLots", label: "その他工程の基準ロット数", unit: "ロット", help: "Gemini予測に必要な工程実績" },
    { key: "outsourceDefaultSentOffsetDays", label: "外注の出し日（未登録時）", unit: "営業日後", help: "AI予測の実行日から出し日まで（土日・会社休日を除く、当日は0）" },
    { key: "outsourceDefaultReturnOffsetDays", label: "外注の戻り日（未登録時）", unit: "営業日後", help: "AI予測の実行日から戻り日まで（土日・会社休日を除く）" },
  ];

  return <div className={styles.container}>
    <div className={styles.headerArea}><Link href="/settings" className={styles.backButton}>← 設定へ戻る</Link><h1 className={styles.title}>AI予測設定</h1></div>
    {message && <div className={messageType === "error" ? styles.errorBanner : styles.message}>{message}</div>}
    <div className={styles.tabNav} role="tablist" aria-label="AI予測設定の表示切り替え">
      <button type="button" role="tab" aria-selected={activeTab === "common"} className={activeTab === "common" ? styles.activeTab : ""} onClick={() => setActiveTab("common")}>共通設定</button>
      <button type="button" role="tab" aria-selected={activeTab === "individual"} className={activeTab === "individual" ? styles.activeTab : ""} onClick={() => setActiveTab("individual")}>個別設定</button>
      <button type="button" role="tab" aria-selected={activeTab === "status"} className={activeTab === "status" ? styles.activeTab : ""} onClick={() => setActiveTab("status")}>実行状況</button>
    </div>
    {activeTab === "common" && <section className={styles.card}>
      <div className={styles.cardHeader}><div><h2>予測条件</h2><p className={styles.helpText}>全製品・全工程に共通して適用します。</p></div><label className={styles.switchRow}><input type="checkbox" checked={settings.enabled} onChange={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))} disabled={loading} />AI予測を使用する</label></div>
      <div className={styles.numberGrid}>{numberFields.map((field) => <button type="button" className={styles.numberField} key={field.key} onClick={() => setEditingKey(field.key)}><span className={styles.numberLabel}>{field.label}</span><strong>{settings[field.key].toLocaleString()} {field.unit}</strong><small>{field.help}</small></button>)}</div>
      <div className={styles.optionGrid}>
        <label><input type="checkbox" checked={settings.usePastResults} onChange={() => setSettings((current) => ({ ...current, usePastResults: !current.usePastResults }))} />過去実績を使用する</label>
        <label><input type="checkbox" checked={settings.validationMode} readOnly />検証モード（手動更新を表示）</label>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.saveButton} onClick={saveSettings} disabled={loading || saving || running}><Save size={18} />{saving ? "保存中..." : "設定を保存"}</button>
        {settings.validationMode && <button type="button" className={styles.runButton} onClick={runPrediction} disabled={loading || saving || running}><RefreshCw size={18} className={running ? styles.spinning : ""} />{running ? "予測中..." : "手動更新"}</button>}
      </div>
    </section>}
    {activeTab === "individual" && <section className={styles.card}>
      <div className={styles.referenceHeader}><div><h2>個別設定：実績の参照開始日</h2><p className={styles.helpText}>製品と工程の組み合わせごとに設定します。設備Noまたは外注先を選ぶと、その対象だけに適用できます。</p><p className={styles.helpText}>設備No・外注先を選ばない場合は工程全体の設定となり、未登録の組み合わせには共通設定が適用されます。</p></div></div>
      <div className={styles.referenceForm}>
        <label><span>製品</span><select value={referenceProductId} onChange={(event) => setReferenceProductId(event.target.value)}><option value="">選択してください</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label><span>工程</span><select value={referenceProcessId} onChange={(event) => setReferenceProcessId(event.target.value)}><option value="">選択してください</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}</select></label>
        <label><span>設備No（任意）</span><input type="text" list="ai-reference-press-numbers" value={referencePressNumber} disabled={Boolean(referenceSubcontractorId)} placeholder="工程全体" onChange={(event) => setReferencePressNumber(event.target.value)} /><datalist id="ai-reference-press-numbers">{pressNumbers.map((pressNumber) => <option key={pressNumber} value={pressNumber} />)}</datalist></label>
        <label><span>外注先（任意）</span><select value={referenceSubcontractorId} disabled={Boolean(referencePressNumber)} onChange={(event) => setReferenceSubcontractorId(event.target.value)}><option value="">工程全体</option>{subcontractors.map((subcontractor) => <option key={subcontractor.id} value={subcontractor.id}>{subcontractor.name}</option>)}</select></label>
        <label><span>参照開始日</span><input type="date" value={referenceStartDate} onChange={(event) => setReferenceStartDate(event.target.value)} /></label>
        <button type="button" className={styles.addButton} onClick={saveReferenceStart}><Plus size={18} />追加・更新</button>
      </div>
      <div className={styles.referenceTableWrap}><table className={styles.referenceTable}><thead><tr><th>製品</th><th>工程</th><th>適用範囲</th><th>参照開始日</th><th>操作</th></tr></thead><tbody>{referenceStarts.length === 0 ? <tr><td colSpan={5}>個別の参照開始日は登録されていません。</td></tr> : referenceStarts.map((item) => <tr key={item.id}><td>{item.productName}</td><td>{item.processName}</td><td>{item.pressNumber ? `設備: ${item.pressNumber}` : item.subcontractorName ? `外注先: ${item.subcontractorName}` : "工程全体"}</td><td>{item.referenceStartDate}</td><td><button type="button" className={styles.deleteButton} title="削除" onClick={() => deleteReferenceStart(item.id)}><Trash2 size={18} /></button></td></tr>)}</tbody></table></div>
    </section>}
    {activeTab === "status" && <section className={styles.card}><h2>最新の実行状況</h2>{runStatus ? <div className={styles.statusGrid}>
      <div><span>定期更新</span><strong>{runStatus.cron_configured ? "設定済み" : "未設定"}</strong></div><div><span>更新時刻</span><strong>{runStatus.schedule_label || "毎朝7:00（日本時間）"}</strong></div><div><span>最終定期更新</span><strong>{formatDateTime(runStatus.latest_scheduled_run?.finished_at || runStatus.latest_scheduled_run?.started_at)}</strong></div><div><span>定期更新の状態</span><strong>{formatRunStatus(runStatus.latest_scheduled_run?.status)}</strong></div><div><span>定期更新 成功 / 失敗</span><strong>{runStatus.latest_scheduled_run ? `${runStatus.latest_scheduled_run.success_count} / ${runStatus.latest_scheduled_run.failed_count}` : "-"}</strong></div>{runStatus.id && <><div><span>最新の実行状態</span><strong>{formatRunStatus(runStatus.status)}</strong></div><div><span>実行方法</span><strong>{runStatus.trigger_type === "manual" ? "手動" : "毎朝7時"}</strong></div><div><span>開始日時</span><strong>{formatDateTime(runStatus.started_at)}</strong></div><div><span>完了日時</span><strong>{formatDateTime(runStatus.finished_at)}</strong></div><div><span>対象注番</span><strong>{runStatus.target_count || 0}件</strong></div><div><span>成功 / 失敗</span><strong>{runStatus.success_count || 0} / {runStatus.failed_count || 0}</strong></div><div><span>評価済み予測</span><strong>{runStatus.evaluation_count || 0}件</strong></div><div><span>平均営業日誤差</span><strong>{runStatus.average_absolute_error == null ? "-" : `${runStatus.average_absolute_error.toFixed(1)}日`}</strong></div></>}
    </div> : <p className={styles.helpText}>まだAI予測は実行されていません。</p>}{runStatus?.error_message && <div className={styles.errorMessage}>{runStatus.error_message}</div>}{Boolean(runStatus?.failure_details?.length) && <div className={styles.errorMessage}><strong>予測できなかった工程</strong><ul>{runStatus?.failure_details?.map((detail, index) => <li key={`${detail.order_no}-${detail.process_name}-${index}`}>{detail.order_no} / {detail.process_name}: {detail.reason}</li>)}</ul></div>}{Boolean(runStatus?.evaluation_details?.length) && <div className={styles.referenceTableWrap}><h3>予測精度（最新20件）</h3><table className={styles.referenceTable}><thead><tr><th>注番</th><th>予測実行日時</th><th>AI完了予測日</th><th>実際の完了日</th><th>営業日誤差</th></tr></thead><tbody>{runStatus?.evaluation_details?.map((detail) => <tr key={detail.id}><td>{detail.order_no}</td><td>{formatDateTime(detail.created_at)}</td><td>{detail.predicted_completion_date || "-"}</td><td>{detail.actual_completion_date || "-"}</td><td>{formatEvaluationError(Number(detail.business_day_error || 0))}</td></tr>)}</tbody></table></div>}</section>}
    {editingKey && <Numpad open replaceOnFirstInput value={String(settings[editingKey])} onChange={(value) => setNumber(editingKey, value)} onClose={() => setEditingKey(null)} />}
  </div>;
}
