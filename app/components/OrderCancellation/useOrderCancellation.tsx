"use client";
import { useRef, useState } from "react";
import { authFetch } from "@/lib/auth/client";
import styles from "./dialog.module.css";

type Target = { id: string; label: string };
export function useOrderCancellation(onSuccess: () => void | Promise<void>) {
  const [request, setRequest] = useState<{ targets: Target[]; key: string } | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const openCancellation = (targets: Target[]) => {
    if (busyRef.current || !targets.length) return;
    setPassword(""); setError("");
    setRequest({ targets, key: crypto.randomUUID() });
  };
  const close = () => { if (!busyRef.current) { setRequest(null); setPassword(""); setError(""); } };
  const cancellationDialog = request && <div className={styles.overlay}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="order-cancellation-title"
      onKeyDown={event => {
        if (event.key === "Escape") close();
        if (event.key === "Tab") {
          const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input:not(:disabled),button:not(:disabled)"));
          const first = fields[0], last = fields[fields.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <h2 id="order-cancellation-title">誤登録取消の確認</h2>
      <p>{request.targets.map(t => t.label).join("、")}（{request.targets.length}件）</p>
      <p>未着手の誤登録・重複登録を取り消し、履歴に記録します。在庫は減算されません。</p>
      <form onSubmit={async event => {
        event.preventDefault();
        if (busyRef.current || !password) return;
        busyRef.current = true; setBusy(true); setError("");
        try {
          const response = await authFetch("/api/order-cancellations", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ post_ids: request.targets.map(t => t.id), request_id: request.key, password }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "取消できませんでした");
          setRequest(null); setPassword("");
          await onSuccess();
        } catch (e) { setPassword(""); setError(e instanceof Error ? e.message : "取消に失敗しました"); }
        finally { busyRef.current = false; setBusy(false); }
      }}>
        <label htmlFor="order-cancellation-password">ログイン中の管理者のパスワード</label>
        <input id="order-cancellation-password" type="password" autoComplete="current-password" autoFocus required maxLength={1024}
          value={password} disabled={busy} onChange={e => setPassword(e.target.value)} />
        {error && <p role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={close}>キャンセル</button>
          <button type="submit" disabled={busy || !password}>{busy ? "取消中…" : "確認して取消"}</button>
        </div>
      </form>
    </section>
  </div>;
  return { openCancellation, cancellationDialog };
}
