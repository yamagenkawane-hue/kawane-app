"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Save } from "lucide-react";
import supabase from "@/lib/supabase";
import Numpad from "@/app/components/Numpad/Numpad";
import { AiPredictionSettings } from "@/app/type";
import styles from "./page.module.css";

const DEFAULT_SETTINGS: AiPredictionSettings = {
  id: "global", enabled: true, usePastResults: true,
  priorityReferenceDays: 90, maxReferenceDays: 730,
  manufacturingMinBusinessDays: 5, otherProcessMinLots: 5,
  validationMode: true,
};

type NumberSettingKey = "priorityReferenceDays" | "maxReferenceDays" | "manufacturingMinBusinessDays" | "otherProcessMinLots";
type RunStatus = { id: string; status: string; model: string; trigger_type: string; started_at: string; finished_at?: string; target_count: number; success_count: number; failed_count: number; error_message?: string };

const mapSettings = (row: Record<string, unknown>): AiPredictionSettings => ({
  id: String(row.id || "global"), enabled: Boolean(row.enabled),
  usePastResults: Boolean(row.use_past_results),
  priorityReferenceDays: Number(row.priority_reference_days || 90),
  maxReferenceDays: Number(row.max_reference_days || 730),
  manufacturingMinBusinessDays: Number(row.manufacturing_min_business_days || 5),
  otherProcessMinLots: Number(row.other_process_min_lots || 5),
  validationMode: row.validation_mode !== false,
});

const formatDateTime = (value?: string) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";

export default function AiPredictionSettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [editingKey, setEditingKey] = useState<NumberSettingKey | null>(null);

  const fetchRunStatus = useCallback(async () => {
    const response = await fetch("/api/ai-predictions/status", { cache: "no-store" });
    if (response.ok) setRunStatus((await response.json()) as RunStatus | null);
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from("ai_prediction_settings").select("*").eq("id", "global").maybeSingle();
      if (error) setMessage("AI予測用SQLを実行してください。");
      else if (data) setSettings(mapSettings(data));
      await fetchRunStatus();
      setLoading(false);
    };
    void load();
  }, [fetchRunStatus]);

  const setNumber = (key: NumberSettingKey, value: string) => {
    const parsed = Math.max(0, Math.floor(Number(value || 0)));
    setSettings((current) => ({ ...current, [key]: parsed }));
  };
  const validate = () => settings.priorityReferenceDays < 1 || settings.maxReferenceDays < settings.priorityReferenceDays || settings.manufacturingMinBusinessDays < 1 || settings.otherProcessMinLots < 1
    ? "各設定は1以上、最大参照期間は優先参照期間以上で入力してください。" : "";

  const saveSettings = async () => {
    const validationMessage = validate();
    if (validationMessage) return setMessage(validationMessage);
    setSaving(true); setMessage("");
    const { error } = await supabase.from("ai_prediction_settings").upsert({
      id: "global", enabled: settings.enabled, use_past_results: settings.usePastResults,
      priority_reference_days: settings.priorityReferenceDays, max_reference_days: settings.maxReferenceDays,
      manufacturing_min_business_days: settings.manufacturingMinBusinessDays,
      other_process_min_lots: settings.otherProcessMinLots, validation_mode: settings.validationMode,
      updated_at: new Date().toISOString(),
    });
    setMessage(error ? `保存に失敗しました: ${error.message}` : "AI予測設定を保存しました。");
    setSaving(false);
  };

  const runPrediction = async () => {
    const validationMessage = validate();
    if (validationMessage) return setMessage(validationMessage);
    setRunning(true); setMessage("AI予測を実行しています。この画面を閉じずにお待ちください。");
    try {
      const response = await fetch("/api/ai-predictions/run", { method: "POST" });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "AI予測の実行に失敗しました。");
      setMessage(body.message || "AI予測を更新しました。");
      await fetchRunStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI予測の実行に失敗しました。");
    } finally { setRunning(false); }
  };

  const numberFields: Array<{ key: NumberSettingKey; label: string; unit: string; help: string }> = [
    { key: "priorityReferenceDays", label: "優先参照期間", unit: "日", help: "まず参照する直近の期間" },
    { key: "maxReferenceDays", label: "最大参照期間", unit: "日", help: "実績不足時に遡る上限" },
    { key: "manufacturingMinBusinessDays", label: "製造の基準生産日数", unit: "日分", help: "Gemini予測に必要な製造実績" },
    { key: "otherProcessMinLots", label: "その他工程の基準ロット数", unit: "ロット", help: "Gemini予測に必要な工程実績" },
  ];

  return <div className={styles.container}>
    <div className={styles.headerArea}><Link href="/settings" className={styles.backButton}>← 設定へ戻る</Link><h1 className={styles.title}>AI予測設定</h1></div>
    {message && <div className={styles.message}>{message}</div>}
    <section className={styles.card}>
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
    </section>
    <section className={styles.statusCard}><h2>最新の実行状況</h2>{runStatus ? <div className={styles.statusGrid}>
      <div><span>状態</span><strong>{runStatus.status}</strong></div><div><span>実行方法</span><strong>{runStatus.trigger_type === "manual" ? "手動" : "毎朝7時"}</strong></div><div><span>開始日時</span><strong>{formatDateTime(runStatus.started_at)}</strong></div><div><span>完了日時</span><strong>{formatDateTime(runStatus.finished_at)}</strong></div><div><span>対象注番</span><strong>{runStatus.target_count}件</strong></div><div><span>成功 / 失敗</span><strong>{runStatus.success_count} / {runStatus.failed_count}</strong></div>
    </div> : <p className={styles.helpText}>まだAI予測は実行されていません。</p>}{runStatus?.error_message && <div className={styles.errorMessage}>{runStatus.error_message}</div>}</section>
    {editingKey && <Numpad open value={String(settings[editingKey])} onChange={(value) => setNumber(editingKey, value)} onClose={() => setEditingKey(null)} />}
  </div>;
}
