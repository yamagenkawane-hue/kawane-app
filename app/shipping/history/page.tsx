"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth/client";
import styles from "../../masterCommon.module.css";

type Closure = { id: string; order_no: string; customer_name: string; product_name: string;
  order_amount: number; shipped_amount: number; closed_quantity: number; reason: string; actor_name: string; closed_at: string; restored_at: string | null; restored_actor_name: string | null };
const PAGE_SIZE = 30;
export default function ShipmentClosureHistory() {
  const restoringRef = useRef(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<Closure[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await authFetch("/api/shipment-closures");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "履歴を取得できませんでした");
        if (active) setRows(data);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "履歴を取得できませんでした"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  const handleRestore = async (row: Closure) => {
    if (restoringRef.current || row.restored_at) return;
    if (!window.confirm(`${row.order_no} の打ち切りを取り消し、注残に戻します。\n出荷済数量・在庫数量は変更しません。解除済みの在庫引当は自動では戻しません。\n復元日時と操作者を履歴に記録します。よろしいですか？`)) return;
    restoringRef.current = true;
    setRestoring(row.id);
    setError("");
    setMessage("");
    const storageKey = `shipment-restore:${row.id}`;
    try {
      const requestId = sessionStorage.getItem(storageKey) || crypto.randomUUID();
      sessionStorage.setItem(storageKey, requestId);
      const response = await authFetch("/api/shipment-closures", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closure_id: row.id, request_id: requestId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "復元に失敗しました");
      sessionStorage.removeItem(storageKey);
      setRows(previous => previous.map(item => item.id === row.id ? { ...item, ...result } : item));
      setMessage(`${row.order_no} を注残に戻しました。必要に応じて在庫引当を確認してください。`);
    } catch (e) { setError(e instanceof Error ? e.message : "復元に失敗しました"); }
    finally { restoringRef.current = false; setRestoring(null); }
  };
  const keyword = search.trim().toLocaleLowerCase("ja-JP");
  const filtered = rows.filter(row => [row.order_no, row.customer_name, row.product_name, row.reason, row.actor_name]
    .some(value => value.toLocaleLowerCase("ja-JP").includes(keyword)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  return <div className={styles.container}>
    <div className={styles.headerArea}>
      <Link href="/shipping" className={styles.backButton}>← 出荷管理に戻る</Link>
      <h1 className={styles.title}>打ち切り履歴</h1>
    </div>
    <div className={styles.formCard}>
      <input className={styles.input} aria-label="打ち切り履歴を検索" placeholder="注番・得意先・製品・理由・操作者で検索"
        value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
    </div>
    {loading && <p>読み込み中...</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    <div className={styles.tableCard}><table className={styles.table}>
      <thead><tr>{["打ち切り日時", "注番", "得意先", "製品", "受注数", "打ち切り時出荷済合計", "未出荷数", "操作者", "理由", "状態", "復元日時", "復元操作者", "操作"].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(row => <tr key={row.id}>
        <td>{new Date(row.closed_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</td>
        <td>{row.order_no}</td><td>{row.customer_name}</td><td>{row.product_name}</td>
        <td>{Number(row.order_amount).toLocaleString("ja-JP")}</td><td>{Number(row.shipped_amount).toLocaleString("ja-JP")}</td>
        <td>{Number(row.closed_quantity).toLocaleString("ja-JP")}</td><td>{row.actor_name}</td><td>{row.reason}</td>
        <td>{row.restored_at ? "復元済み" : `${Number(row.shipped_amount).toLocaleString("ja-JP")}個で打ち切り`}</td>
        <td>{row.restored_at ? new Date(row.restored_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "-"}</td>
        <td>{row.restored_actor_name || "-"}</td>
        <td>{!row.restored_at && <button className={styles.saveButton} disabled={restoring !== null}
          onClick={() => handleRestore(row)}>{restoring === row.id ? "復元中…" : "復元"}</button>}</td>
      </tr>)}</tbody>
    </table>{!loading && !error && !filtered.length && <p>打ち切り履歴はありません。</p>}</div>
    <nav className={styles.buttonRow} aria-label="履歴のページ切替">
      <button className={styles.saveButton} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>前へ</button>
      <span>{page} / {pages}ページ（{filtered.length}件）</span>
      <button className={styles.saveButton} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>次へ</button>
    </nav>
  </div>;
}
