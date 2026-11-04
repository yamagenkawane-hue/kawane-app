"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth/client";
import styles from "../../masterCommon.module.css";

type Closure = { id: string; order_no: string; customer_name: string; product_name: string;
  order_amount: number; shipped_amount: number; closed_quantity: number; reason: string; actor_name: string; closed_at: string };
const PAGE_SIZE = 30;
export default function ShipmentClosureHistory() {
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
    <div className={styles.tableCard}><table className={styles.table}>
      <thead><tr>{["打ち切り日時", "注番", "得意先", "製品", "受注数", "出荷済数", "打ち切り数", "操作者", "理由"].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(row => <tr key={row.id}>
        <td>{new Date(row.closed_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</td>
        <td>{row.order_no}</td><td>{row.customer_name}</td><td>{row.product_name}</td>
        <td>{Number(row.order_amount).toLocaleString("ja-JP")}</td><td>{Number(row.shipped_amount).toLocaleString("ja-JP")}</td>
        <td>{Number(row.closed_quantity).toLocaleString("ja-JP")}</td><td>{row.actor_name}</td><td>{row.reason}</td>
      </tr>)}</tbody>
    </table>{!loading && !error && !filtered.length && <p>打ち切り履歴はありません。</p>}</div>
    <nav className={styles.buttonRow} aria-label="履歴のページ切替">
      <button className={styles.saveButton} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>前へ</button>
      <span>{page} / {pages}ページ（{filtered.length}件）</span>
      <button className={styles.saveButton} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>次へ</button>
    </nav>
  </div>;
}
