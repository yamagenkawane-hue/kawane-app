"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { AiPredictionSettings, AiPredictionStrength } from "@/app/type";
import styles from "./page.module.css";

const DEFAULT_SETTINGS: AiPredictionSettings = {
  id: "global",
  enabled: true,
  targetOutsourceDelay: true,
  targetShippingDelay: true,
  targetLineLoad: true,
  strength: "standard",
  useLineOperationRate: true,
  usePastResults: false,
  useOutsourceProcess: true,
  useHolidays: true,
  useCurrentDelay: true,
  useProcessAverageDelay: false,
};

const mapRowToSettings = (row: Record<string, unknown>): AiPredictionSettings => ({
  id: String(row.id || "global"),
  enabled: Boolean(row.enabled),
  targetOutsourceDelay: Boolean(row.target_outsource_delay),
  targetShippingDelay: Boolean(row.target_shipping_delay),
  targetLineLoad: Boolean(row.target_line_load),
  strength: String(row.strength || "standard") as AiPredictionStrength,
  useLineOperationRate: Boolean(row.use_line_operation_rate),
  usePastResults: Boolean(row.use_past_results),
  useOutsourceProcess: Boolean(row.use_outsource_process),
  useHolidays: Boolean(row.use_holidays),
  useCurrentDelay: Boolean(row.use_current_delay),
  useProcessAverageDelay: Boolean(row.use_process_average_delay),
  updatedAt: String(row.updated_at || ""),
});

export default function AiPredictionSettingsPage() {
  const [settings, setSettings] = useState<AiPredictionSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("ai_prediction_settings")
        .select("*")
        .eq("id", "global")
        .maybeSingle();

      if (error) {
        console.warn("ai_prediction_settings fetch failed", error);
        setSettings(DEFAULT_SETTINGS);
        setMessage("AI予測設定テーブル未適用のため、標準設定を表示しています。");
      } else if (data) {
        setSettings(mapRowToSettings(data));
      }

      setLoading(false);
    };

    fetchSettings();
  }, []);

  const toggle = (key: keyof AiPredictionSettings) => {
    setSettings((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("ai_prediction_settings").upsert({
      id: "global",
      enabled: settings.enabled,
      target_outsource_delay: settings.targetOutsourceDelay,
      target_shipping_delay: settings.targetShippingDelay,
      target_line_load: settings.targetLineLoad,
      strength: settings.strength,
      use_line_operation_rate: settings.useLineOperationRate,
      use_past_results: settings.usePastResults,
      use_outsource_process: settings.useOutsourceProcess,
      use_holidays: settings.useHolidays,
      use_current_delay: settings.useCurrentDelay,
      use_process_average_delay: settings.useProcessAverageDelay,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error(error);
      setMessage("保存に失敗しました。SupabaseでAI予測設定SQLを実行してください。");
    } else {
      setMessage("AI予測設定を保存しました。");
    }

    setSaving(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/settings" className={styles.backButton}>
          ← 設定へ戻る
        </Link>
        <h1 className={styles.title}>AI予測設定</h1>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>全体共通設定</h2>
          <label className={styles.switchRow}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={() => toggle("enabled")}
              disabled={loading}
            />
            AI予測を使用する
          </label>
        </div>

        <div className={styles.section}>
          <h3>予測対象</h3>
          <div className={styles.optionGrid}>
            <label>
              <input
                type="checkbox"
                checked={settings.targetOutsourceDelay}
                onChange={() => toggle("targetOutsourceDelay")}
              />
              外注遅延
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.targetShippingDelay}
                onChange={() => toggle("targetShippingDelay")}
              />
              出荷遅延
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.targetLineLoad}
                onChange={() => toggle("targetLineLoad")}
              />
              ライン負荷
            </label>
          </div>
        </div>

        <div className={styles.section}>
          <h3>予測の強さ</h3>
          <div className={styles.segmented}>
            {[
              ["weak", "弱め"],
              ["standard", "標準"],
              ["strong", "強め"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={settings.strength === value ? styles.activeSegment : ""}
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    strength: value as AiPredictionStrength,
                  }))
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <h3>補正要素</h3>
          <div className={styles.optionGrid}>
            <label>
              <input
                type="checkbox"
                checked={settings.useLineOperationRate}
                onChange={() => toggle("useLineOperationRate")}
              />
              ライン稼働率
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.usePastResults}
                onChange={() => toggle("usePastResults")}
              />
              過去実績
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.useOutsourceProcess}
                onChange={() => toggle("useOutsourceProcess")}
              />
              外注工程
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.useHolidays}
                onChange={() => toggle("useHolidays")}
              />
              休日
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.useCurrentDelay}
                onChange={() => toggle("useCurrentDelay")}
              />
              現在の遅れ
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.useProcessAverageDelay}
                onChange={() => toggle("useProcessAverageDelay")}
              />
              工程ごとの平均遅延
            </label>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={saveSettings} disabled={loading || saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </section>
    </div>
  );
}
