"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth/client";
import styles from "../../masterCommon.module.css";
type Entry = { id: string; order_no: string; customer_name: string; product_name: string; order_amount: number; cancelled_at: string; actor_name: string };
export default function OrderCancellationHistory() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await authFetch("/api/order-cancellations");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "履歴を取得できませんでした");
        if (active) setRows(data);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "履歴を取得できませんでした"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  const filtered = rows.filter(row => [row.order_no, row.customer_name, row.product_name, row.actor_name].some(value => String(value || "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  return <div className={styles.container}>
    <div className={styles.headerArea}>
      <Link href="/orders" className={styles.backButton}>← 注残管理一覧に戻る</Link>
      <h1 className={styles.title}>誤登録取消履歴</h1>
    </div>
    <div className={styles.formCard}><input className={styles.input} aria-label="取消履歴を検索" placeholder="注番・得意先・製品・操作者で検索"
      value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
    {loading && <p>読み込み中...</p>}{error && <p role="alert">{error}</p>}
    <div className={styles.tableCard}><table className={styles.table}>
      <thead><tr>{["取消日時", "注番", "得意先", "製品", "受注数", "操作者"].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{filtered.slice((page - 1) * 30, page * 30).map(row => <tr key={row.id}>
        <td>{new Date(row.cancelled_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</td><td>{row.order_no}</td>
        <td>{row.customer_name}</td><td>{row.product_name}</td><td>{Number(row.order_amount).toLocaleString("ja-JP")}</td><td>{row.actor_name}</td>
      </tr>)}</tbody>
    </table>{!loading && !error && !filtered.length && <p>誤登録取消履歴はありません。</p>}</div>
    <nav className={styles.buttonRow} aria-label="履歴のページ切替">
      <button className={styles.saveButton} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>前へ</button>
      <span>{page} / {pages}ページ（{filtered.length}件）</span>
      <button className={styles.saveButton} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>次へ</button>
    </nav>
  </div>;
}
