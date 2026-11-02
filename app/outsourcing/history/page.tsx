"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth/client";
import styles from "../../historyRetention/page.module.css";
import masterStyles from "../../masterCommon.module.css";

type Remainder = { id: string; dispatch_no: number; quantity: number; sent_date: string | null; expected_date: string | null; returned_date: string | null; cancelled: boolean; note: string };
type Row = { id: string; order_no: string; customer_name: string; product_name: string; process_name: string; process_order: number; subcontractor_name: string; outsource_sent_date: string; outsource_expected_return_date: string; outsource_returned_date: string; outsource_note: string; remainders: Remainder[]; archived: boolean; initial_quantity: number | null };
export default function OutsourceHistoryPage() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: Row[]; total: number }>({ rows: [], total: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError("");
      try {
        const response = await authFetch(`/api/outsource-history?q=${encodeURIComponent(search)}&page=${page}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (active) setData(body);
      } catch (e) { if (active) { setData({ rows: [], total: 0 }); setError(e instanceof Error ? e.message : "取得に失敗しました"); } }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [search, page]);
  return <main className={`${masterStyles.container} ${styles.page}`}><div className={masterStyles.headerArea}><Link href="/outsourcing" className={masterStyles.backButton}>← 外注管理へ戻る</Link><h1 className={masterStyles.title}>外注履歴</h1></div>
    <p>注残から外れた注文・ロット未作成の注文も検索できます。外注工程ごとに、初回と分割発送の日程を表示します。</p>
    <form onSubmit={e => { e.preventDefault(); setSearch(query); setPage(0); }}><label>注番・得意先・製品・工程・外注先<input value={query} maxLength={100} onChange={e => setQuery(e.target.value)}/></label><button>検索</button></form>
    {loading && <p role="status">読込中…</p>}{error && <p role="alert">{error}</p>}
    <section><p>{data.total}工程</p><div className={styles.tableWrap}><table><thead><tr><th>注番／得意先／製品</th><th>工程／外注先</th><th>区分・数量</th><th>出し日</th><th>予定日</th><th>実績日</th><th>備考</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}>
      <td>{row.order_no}<br/>{row.customer_name}<br/>{row.product_name}</td><td>第{row.process_order}工程 {row.process_name}<br/>{row.subcontractor_name}</td>
      <td>初回：{row.initial_quantity != null ? `${row.initial_quantity}個` : row.archived ? "退避済み" : "未確定"}{row.remainders.map(r => <p key={r.id}>分割{r.dispatch_no}：{r.quantity}個{r.cancelled ? "（取消）" : ""}</p>)}</td>
      <td>{row.outsource_sent_date || "未登録"}{row.remainders.map(r => <p key={r.id}>{r.sent_date || "未登録"}</p>)}</td>
      <td>{row.outsource_expected_return_date || "未登録"}{row.remainders.map(r => <p key={r.id}>{r.expected_date || "未登録"}</p>)}</td>
      <td>{row.outsource_returned_date || "未登録"}{row.remainders.map(r => <p key={r.id}>{r.returned_date || "未登録"}</p>)}</td>
      <td>{row.outsource_note}{row.remainders.map(r => <p key={r.id}>{r.note || "-"}</p>)}{row.archived && <p>詳細は退避ファイルで保管しています</p>}</td>
    </tr>)}</tbody></table></div>
    <div className={styles.paging}><button disabled={loading || page === 0} onClick={() => setPage(page - 1)}>前へ</button><span>{page + 1} / {Math.max(1, Math.ceil(data.total / 30))}</span><button disabled={loading || (page + 1) * 30 >= data.total} onClick={() => setPage(page + 1)}>次へ</button></div></section>
  </main>;
}
