"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { OrderProcess, PostData, ProductProcess } from "@/app/type";
import styles from "../masterCommon.module.css";

const mapPost = (row: Record<string, unknown>): PostData => ({
  id: String(row.id || ""),
  productId: row.product_id ? String(row.product_id) : "",
  customerId: row.customer_id ? String(row.customer_id) : "",
  orderNo: String(row.order_no || ""),
  lotNo: String(row.lot_no || ""),
  productCode: String(row.product_code || ""),
  productName: String(row.product_name || ""),
  customerName: String(row.customer_name || ""),
  orderAmount: Number(row.order_amount || 0),
  remainingAmount: Number(row.remaining_amount || row.order_amount || 0),
  status: String(row.status || ""),
  deliveryDate: String(row.delivery_date || ""),
});

const mapOrderProcess = (row: Record<string, unknown>): OrderProcess => ({
  id: String(row.id || ""),
  postId: String(row.post_id || ""),
  productId: row.product_id ? String(row.product_id) : "",
  customerId: row.customer_id ? String(row.customer_id) : "",
  productProcessId: row.product_process_id ? String(row.product_process_id) : "",
  orderNo: String(row.order_no || ""),
  productCode: String(row.product_code || ""),
  productName: String(row.product_name || ""),
  customerName: String(row.customer_name || ""),
  processName: String(row.process_name || ""),
  processOrder: Number(row.process_order || 0),
  plannedAmount: Number(row.planned_amount || 0),
  completedAmount: Number(row.completed_amount || 0),
  completedDate: String(row.completed_date || ""),
  subcontractorId: row.subcontractor_id ? String(row.subcontractor_id) : null,
  subcontractorName: String(row.subcontractor_name || ""),
  outsourceSentDate: String(row.outsource_sent_date || ""),
  outsourceExpectedReturnDate: String(row.outsource_expected_return_date || ""),
  outsourceReturnedDate: String(row.outsource_returned_date || ""),
  outsourceStatus: String(row.outsource_status || "not_sent"),
  outsourceNote: String(row.outsource_note || ""),
  locked: Boolean(row.locked || false),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const mapProductProcess = (row: Record<string, unknown>): ProductProcess => ({
  id: String(row.id || ""),
  productId: row.product_id ? String(row.product_id) : "",
  productCode: String(row.product_code || ""),
  processName: String(row.process_name || ""),
  processOrder: Number(row.process_order || 0),
  subcontractorId: row.subcontractor_id ? String(row.subcontractor_id) : null,
  subcontractorName: String(row.subcontractor_name || ""),
  outsourcing: Boolean(row.outsourcing || false),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

export default function OrderProcessesPage() {
  const [posts, setPosts] = useState<PostData[]>([]);
  const [processes, setProcesses] = useState<OrderProcess[]>([]);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [newProcessName, setNewProcessName] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId),
    [posts, selectedPostId],
  );

  const selectedProcesses = useMemo(
    () =>
      processes
        .filter((process) => process.postId === selectedPostId)
        .sort((a, b) => a.processOrder - b.processOrder),
    [processes, selectedPostId],
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [postResult, processResult] = await Promise.all([
        supabase.from("v_posts_with_master").select("*").order("order_no", { ascending: true }),
        supabase
          .from("v_order_processes_with_master")
          .select("*")
          .order("process_order", { ascending: true }),
      ]);

      if (postResult.error) throw postResult.error;
      if (processResult.error) throw processResult.error;

      const mappedPosts = (postResult.data || [])
        .filter((row) => row.delete !== true)
        .map(mapPost);
      setPosts(mappedPosts);
      setProcesses((processResult.data || []).map(mapOrderProcess));

      setSelectedPostId((prev) => prev || mappedPosts[0]?.id || "");
    } catch (error) {
      console.error(error);
      alert("工程予定の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      await fetchData();
    };

    void loadData();
  }, [fetchData]);

  const updateProcess = (
    id: string,
    field: keyof OrderProcess,
    value: string | number | boolean,
  ) => {
    setProcesses((prev) =>
      prev.map((process) =>
        process.id === id ? { ...process, [field]: value } : process,
      ),
    );
  };

  const saveProcess = async (process: OrderProcess) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("order_processes")
        .update({
          process_name: process.processName,
          process_order: Number(process.processOrder),
          planned_amount: Number(process.plannedAmount),
          completed_amount: Number(process.completedAmount),
          completed_date: process.completedDate || null,
          locked: process.locked,
          updated_at: new Date().toISOString(),
        })
        .eq("id", process.id);

      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error(error);
      alert("工程予定の保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const addProcess = async () => {
    if (!selectedPost || !newProcessName.trim()) {
      alert("受注と工程名を入力してください");
      return;
    }

    try {
      setLoading(true);
      const nextOrder =
        selectedProcesses.reduce(
          (max, process) => Math.max(max, process.processOrder),
          0,
        ) + 1;

      const { error } = await supabase.from("order_processes").insert({
        post_id: selectedPost.id,
        order_no: selectedPost.orderNo,
        product_id: selectedPost.productId || null,
        customer_id: selectedPost.customerId || null,
        product_code: selectedPost.productCode || "",
        product_name: selectedPost.productName,
        customer_name: selectedPost.customerName,
        process_name: newProcessName.trim(),
        process_order: nextOrder,
        planned_amount: Number(selectedPost.orderAmount || 0),
      });

      if (error) throw error;
      setNewProcessName("");
      await fetchData();
    } catch (error) {
      console.error(error);
      alert("工程予定の追加に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const syncFromProductMaster = async () => {
    if (!selectedPost) {
      alert("受注を選択してください");
      return;
    }

    if (!confirm("製品工程マスタの内容を、この受注の工程に反映しますか？")) {
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("v_product_processes_with_master")
        .select("*")
        .eq("product_code", selectedPost.productCode)
        .order("process_order", { ascending: true });

      if (error) throw error;

      const masterProcesses = Array.from(
        new Map(
          (data || [])
            .map(mapProductProcess)
            .map((process) => [process.processOrder, process]),
        ).values(),
      ).sort((a, b) => a.processOrder - b.processOrder);

      if (masterProcesses.length === 0) {
        alert("この製品の製品工程マスタが登録されていません");
        return;
      }

      for (const masterProcess of masterProcesses) {
        const existing = selectedProcesses.find(
          (process) => process.processOrder === masterProcess.processOrder,
        );

        if (!existing) {
          const { error: insertError } = await supabase
            .from("order_processes")
            .insert({
              post_id: selectedPost.id,
              order_no: selectedPost.orderNo,
              product_id: selectedPost.productId || masterProcess.productId || null,
              customer_id: selectedPost.customerId || null,
              product_process_id: masterProcess.id,
              product_code: selectedPost.productCode,
              product_name: selectedPost.productName,
              customer_name: selectedPost.customerName,
              process_name: masterProcess.processName,
              process_order: masterProcess.processOrder,
              planned_amount: Number(selectedPost.orderAmount || 0),
              subcontractor_id: masterProcess.subcontractorId || null,
            });

          if (insertError) throw insertError;
          continue;
        }

        if (existing.completedAmount > 0 || existing.locked) {
          continue;
        }

        const { error: updateError } = await supabase
          .from("order_processes")
          .update({
            product_process_id: masterProcess.id,
            process_name: masterProcess.processName,
            planned_amount: Number(selectedPost.orderAmount || 0),
            subcontractor_id: masterProcess.subcontractorId || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (updateError) throw updateError;
      }

      await fetchData();
      alert("製品工程マスタから受注別工程を更新しました");
    } catch (error) {
      console.error(error);
      alert("製品工程マスタからの更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const deleteProcess = async (id: string) => {
    if (!confirm("工程予定を削除しますか？")) return;

    try {
      setLoading(true);
      const { error } = await supabase.from("order_processes").delete().eq("id", id);
      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error(error);
      alert("工程予定の削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/productionResults" className={styles.backButton}>
          実績登録へ戻る
        </Link>
        <h1 className={styles.title}>受注別工程管理</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <select
            className={styles.select}
            value={selectedPostId}
            onChange={(e) => setSelectedPostId(e.target.value)}
          >
            {posts.map((post) => (
              <option key={post.id} value={post.id}>
                {post.orderNo} / {post.productName} / {post.customerName}
              </option>
            ))}
          </select>
          <input
            className={styles.input}
            placeholder="追加する工程名"
            value={newProcessName}
            onChange={(e) => setNewProcessName(e.target.value)}
          />
          <button className={styles.addButton} onClick={addProcess}>
            追加
          </button>
          <button
            className={styles.linkButton}
            onClick={syncFromProductMaster}
            disabled={!selectedPost || loading}
          >
            製品工程マスタから更新
          </button>
        </div>
      </div>

      {loading && <div className={styles.loading}>読み込み中...</div>}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>工程順</th>
              <th>工程名</th>
              <th>予定数量</th>
              <th>完了数量</th>
              <th>完了日</th>
              <th>確定</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {selectedProcesses.map((process) => (
              <tr key={process.id}>
                <td>
                  <input
                    className={styles.tableInput}
                    type="number"
                    value={process.processOrder}
                    onChange={(e) =>
                      updateProcess(process.id, "processOrder", Number(e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={process.processName}
                    onChange={(e) =>
                      updateProcess(process.id, "processName", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    type="number"
                    value={process.plannedAmount}
                    onChange={(e) =>
                      updateProcess(process.id, "plannedAmount", Number(e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    type="number"
                    value={process.completedAmount}
                    onChange={(e) =>
                      updateProcess(
                        process.id,
                        "completedAmount",
                        Number(e.target.value),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    type="date"
                    value={process.completedDate}
                    onChange={(e) =>
                      updateProcess(process.id, "completedDate", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={process.locked}
                    onChange={(e) =>
                      updateProcess(process.id, "locked", e.target.checked)
                    }
                  />
                </td>
                <td className={styles.actionArea}>
                  <button
                    className={styles.saveButton}
                    onClick={() => saveProcess(process)}
                  >
                    保存
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={() => deleteProcess(process.id)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
