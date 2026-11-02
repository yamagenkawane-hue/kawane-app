"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth/client";
import { parseArchivePacket, type RetentionSettings } from "@/lib/historyRetention";
import styles from "./page.module.css";

type Candidate = { post_id: string; order_no: string; product_name: string; finished_at: string | null; eligible: boolean; reason: string };
type Event = { id: string; action: string; created_at: string; post_id: string | null; actor_id: string | null };
type View = { settings: RetentionSettings; preview: { rows: Candidate[]; total: number }; events: Event[]; reference_days: number };
const actions: Record<string, string> = { settings: "設定変更", export: "退避ファイル作成", delete_details: "詳細履歴削除（復元検証済み）", restore: "詳細履歴復元" };

export default function HistoryRetentionPage() {
  const loadVersion = useRef(0);
  const [view, setView] = useState<View | null>(null);
  const [settings, setSettings] = useState<RetentionSettings | null>(null);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [archive, setArchive] = useState<ReturnType<typeof parseArchivePacket> | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [fileName, setFileName] = useState("");
  const [stored, setStored] = useState(false);
  const load = useCallback(async (isActive: () => boolean = () => true) => {
    const version=++loadVersion.current;
    try {
      const response = await authFetch(`/api/history-retention?page=${page}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if(isActive() && version===loadVersion.current) { setView(data); setSettings(data.settings); }
    } catch (error) { if(isActive() && version===loadVersion.current) setMessage(error instanceof Error ? error.message : "読込に失敗しました"); }
  }, [page]);
  useEffect(() => { let active=true; async function loadData() { await load(()=>active); } void loadData(); return ()=>{active=false;}; }, [load]);
  async function request(body: unknown, method = "POST") {
    const response = await authFetch("/api/history-retention", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "処理に失敗しました"); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <header><Link href="/masterSettings">← マスタ設定へ戻る</Link><h1>履歴管理マスタ</h1></header>
    <p>保存期間を過ぎた詳細履歴を、注文ごとに確認して整理します。自動削除は行いません。</p>
    <p>注文・ロット・工程・在庫・出荷の基本情報と、参照に必要な実績は残します。業務を訂正するときは先に詳細履歴を復元してください。</p>
    {message && <p role="status" className={styles.message}>{message}</p>}
    {settings && <section><h2>保存期間</h2><form onSubmit={event => { event.preventDefault(); void run(async () => { await request(settings, "PUT"); await load(); setMessage("設定を保存しました。履歴は削除していません。"); }); }}>
      <label>業務の詳細履歴（年）<input type="number" min={1} max={30} required value={settings.detail_years} onChange={e => setSettings({ ...settings, detail_years: Number(e.target.value) })}/></label>
      <label>AI用実績（年）<input type="number" min={settings.detail_years} max={30} required value={settings.ai_years} onChange={e => setSettings({ ...settings, ai_years: Number(e.target.value) })}/></label>
      <label>AI予測結果・入力記録（日）<input type="number" min={30} max={3650} required value={settings.prediction_days} onChange={e => setSettings({ ...settings, prediction_days: Number(e.target.value) })}/></label>
      <p>AIの最大参照期間：{view?.reference_days}日（AI予測設定を継承）。AI用実績はこの期間以上必要です。保存期間を延長しても、既に削除した明細や期限切れのAI用実績は自動復元されません。</p>
      <button disabled={busy}>設定を保存</button>
    </form></section>}
    <section><h2>削除対象の確認</h2><p>全数出荷済みでも、未完了工程・外注未戻り・残在庫・未消化引当・他注文の参照・日付不明などがある注文は除外します。</p>
      <button disabled={busy} onClick={() => void run(load)}>再読み込み</button>
      <div className={styles.tableWrap}><table><thead><tr><th>注番</th><th>製品</th><th>業務終了の基準日</th><th>判定</th><th>退避</th></tr></thead><tbody>
        {view?.preview.rows.map(row => <tr key={row.post_id}><td>{row.order_no}</td><td>{row.product_name}</td><td>{row.finished_at ? new Date(row.finished_at).toLocaleDateString("ja-JP") : "不明"}</td><td>{row.reason}</td><td><button disabled={busy || !row.eligible} onClick={() => void run(async () => {
          const data = await request({ action: "export", post_id: row.post_id });
          const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
          const anchor = document.createElement("a"); anchor.href = url; anchor.download = `履歴退避_${row.order_no.replace(/[^\p{L}\p{N}_-]/gu, "_")}_${data.export_id}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          setArchive(null); setFileName(""); setStored(false); setConfirmation(""); await load(); setMessage("退避ファイルを作成しました。社内の保管先へ保存し、下の欄で保存したファイルを読み込んでください。削除の実行は作成から24時間以内です。");
        })}>退避ファイルを作成</button></td></tr>)}
      </tbody></table></div>
      <div className={styles.paging}><button disabled={busy || page === 0} onClick={() => setPage(page - 1)}>前へ</button><span>{page + 1} / {Math.max(1, Math.ceil((view?.preview.total || 0) / 30))}</span><button disabled={busy || (page + 1) * 30 >= (view?.preview.total || 0)} onClick={() => setPage(page + 1)}>次へ</button></div>
    </section>
    <section><h2>退避ファイルの確認・削除・復元</h2><p>保存したファイルを再読込します。削除前に、AI用実績の保存とDB内での削除・復元検証を行います。データが変わっている場合は中止します。</p>
      <label>退避ファイル<input type="file" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; setArchive(null); setStored(false); setConfirmation(""); setFileName(""); if (!file) return; void run(async () => {
        if (file.size > 16 * 1024 * 1024) throw new Error("ファイルは16MB以内にしてください");
        setArchive(parseArchivePacket(JSON.parse(await file.text()))); setFileName(file.name); setMessage("ファイルを読み込みました。登録内容との一致は実行時にサーバーで検証します。");
      }); }}/></label>
      {archive && <><p>{fileName} ／ 注文ID：{archive.payload.post_id}</p><p>対象明細：{Object.entries(archive.payload.tables).map(([key, rows]) => `${key}: ${rows.length}件`).join("、")}</p>
        <label><input type="checkbox" checked={stored} onChange={e => setStored(e.target.checked)}/>退避ファイルを社内の保管先に保存しました</label>
        <label>実行する操作に合わせて「履歴削除」または「履歴復元」と入力<input value={confirmation} onChange={e => setConfirmation(e.target.value)}/></label>
        <button className={styles.danger} disabled={busy || !stored || confirmation !== "履歴削除"} onClick={() => void run(async () => { await request({ action: "delete", archive, confirmation }); setArchive(null); setConfirmation(""); await load(); setMessage("AI用実績を保存し、復元検証後に詳細履歴を削除しました。"); })}>詳細履歴を削除する</button>{" "}
        <button disabled={busy || confirmation !== "履歴復元"} onClick={() => void run(async () => { await request({ action: "restore", archive, confirmation }); setArchive(null); setConfirmation(""); await load(); setMessage("詳細履歴を復元しました。"); })}>詳細履歴を復元する</button>
      </>}
    </section>
    <section><h2>操作記録（新しい順・最新30件）</h2><ul>{view?.events.map(event => <li key={event.id}>{new Date(event.created_at).toLocaleString("ja-JP")}　{actions[event.action] || event.action}　{event.post_id}　実行者：{event.actor_id || "システム"}</li>)}</ul></section>
  </main>;
}
