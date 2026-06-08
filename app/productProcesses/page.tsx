"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProcessSorter from "@/app/components/ProcessSorter/ProcessSorter";
import supabase from "@/lib/supabase";
import { ProductMaster, ProductProcess, Subcontractor } from "@/app/type";
import styles from "../masterCommon.module.css";

const mapProduct = (row: Record<string, unknown>): ProductMaster => ({
  id: String(row.id || ""),
  productCode: String(row.product_code || ""),
  productName: String(row.product_name || ""),
  customerName: String(row.customer_name || ""),
  standard: String(row.standard || ""),
  unit: String(row.unit || ""),
});

const mapSubcontractor = (row: Record<string, unknown>): Subcontractor => ({
  id: String(row.id || ""),
  name: String(row.name || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const mapProcess = (row: Record<string, unknown>): ProductProcess => {
  const subcontractor = row.subcontractors as { name?: string } | null;

  return {
    id: String(row.id || ""),
    productCode: String(row.product_code || ""),
    processName: String(row.process_name || ""),
    processOrder: Number(row.process_order || 0),
    subcontractorId: row.subcontractor_id ? String(row.subcontractor_id) : null,
    subcontractorName: subcontractor?.name || "",
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
};

export default function ProductProcessesPage() {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [processes, setProcesses] = useState<ProductProcess[]>([]);
  const [form, setForm] = useState({
    productCode: "",
    processName: "",
    processOrder: 1,
    subcontractorId: "",
  });
  const [loading, setLoading] = useState(false);

  const selectedProcesses = useMemo(
    () =>
      processes
        .filter((process) => process.productCode === form.productCode)
        .sort((a, b) => a.processOrder - b.processOrder),
    [form.productCode, processes],
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      const [productResult, subcontractorResponse, processResponse] =
        await Promise.all([
          supabase.from("product_master").select("*").order("product_code"),
          fetch("/api/masters/subcontractors"),
          fetch("/api/masters/product-processes"),
        ]);

      if (productResult.error) throw productResult.error;
      if (!subcontractorResponse.ok) throw new Error("外注先の取得に失敗しました");
      if (!processResponse.ok) throw new Error("製品工程の取得に失敗しました");

      const productRows = (productResult.data || []).map(mapProduct);
      setProducts(productRows);
      setSubcontractors((await subcontractorResponse.json()).map(mapSubcontractor));
      setProcesses((await processResponse.json()).map(mapProcess));

      if (!form.productCode && productRows[0]) {
        setForm((prev) => ({ ...prev, productCode: productRows[0].productCode }));
      }
    } catch (error) {
      console.error(error);
      alert("製品工程マスタの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchData();
    };

    void loadData();
  }, []);

  const addProcess = async () => {
    if (!form.productCode || !form.processName || Number(form.processOrder) <= 0) {
      alert("製品、工程名、工程順を入力してください");
      return;
    }

    const response = await fetch("/api/masters/product-processes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_code: form.productCode,
        process_name: form.processName,
        process_order: Number(form.processOrder),
        subcontractor_id: form.subcontractorId || null,
      }),
    });

    if (!response.ok) {
      alert("登録に失敗しました");
      return;
    }

    setForm((prev) => ({
      ...prev,
      processName: "",
      processOrder: selectedProcesses.length + 2,
      subcontractorId: "",
    }));
    await fetchData();
  };

  const updateProcess = (
    id: string,
    field: keyof ProductProcess,
    value: string | number | null,
  ) => {
    setProcesses((prev) =>
      prev.map((process) =>
        process.id === id ? { ...process, [field]: value } : process,
      ),
    );
  };

  const saveProcess = async (process: ProductProcess) => {
    const response = await fetch("/api/masters/product-processes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: process.id,
        product_code: process.productCode,
        process_name: process.processName,
        process_order: Number(process.processOrder),
        subcontractor_id: process.subcontractorId || null,
      }),
    });

    if (!response.ok) alert("保存に失敗しました");
    await fetchData();
  };

  const saveOrder = async () => {
    for (const process of selectedProcesses) {
      const response = await fetch("/api/masters/product-processes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: process.id,
          product_code: process.productCode,
          process_name: process.processName,
          process_order: process.processOrder,
          subcontractor_id: process.subcontractorId || null,
        }),
      });
      if (!response.ok) {
        alert("工程順の保存に失敗しました");
        return;
      }
    }
    await fetchData();
  };

  const deleteProcess = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const response = await fetch(`/api/masters/product-processes?id=${id}`, {
      method: "DELETE",
    });
    if (!response.ok) alert("削除に失敗しました");
    await fetchData();
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/settings" className={styles.backButton}>
          ← 設定へ戻る
        </Link>
        <h1 className={styles.title}>製品工程マスタ</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <select
            className={styles.select}
            value={form.productCode}
            onChange={(e) =>
              setForm({
                ...form,
                productCode: e.target.value,
                processOrder:
                  processes.filter((p) => p.productCode === e.target.value).length + 1,
              })
            }
          >
            <option value="">製品を選択</option>
            {products.map((product) => (
              <option key={product.id} value={product.productCode}>
                {product.productCode} / {product.productName}
              </option>
            ))}
          </select>
          <input
            className={styles.input}
            placeholder="工程名"
            value={form.processName}
            onChange={(e) => setForm({ ...form, processName: e.target.value })}
          />
          <input
            className={styles.input}
            min={1}
            type="number"
            value={form.processOrder}
            onChange={(e) =>
              setForm({ ...form, processOrder: Number(e.target.value) })
            }
          />
          <select
            className={styles.select}
            value={form.subcontractorId}
            onChange={(e) =>
              setForm({ ...form, subcontractorId: e.target.value })
            }
          >
            <option value="">社内工程</option>
            {subcontractors.map((subcontractor) => (
              <option key={subcontractor.id} value={subcontractor.id}>
                {subcontractor.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.buttonRow}>
          <button className={styles.addButton} onClick={addProcess}>
            追加
          </button>
          <button className={styles.saveButton} onClick={saveOrder}>
            工程順を保存
          </button>
        </div>
      </div>

      {loading && <div className={styles.loading}>読み込み中...</div>}

      {selectedProcesses.length > 0 && (
        <div className={styles.formCard}>
          <ProcessSorter
            processes={selectedProcesses}
            onChange={(ordered) =>
              setProcesses((prev) =>
                prev.map((process) => {
                  const updated = ordered.find((item) => item.id === process.id);
                  return updated || process;
                }),
              )
            }
          />
        </div>
      )}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>品番</th>
              <th>工程順</th>
              <th>工程名</th>
              <th>外注先</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {selectedProcesses.map((process) => (
              <tr key={process.id}>
                <td>{process.productCode}</td>
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
                  <select
                    className={styles.select}
                    value={process.subcontractorId || ""}
                    onChange={(e) =>
                      updateProcess(
                        process.id,
                        "subcontractorId",
                        e.target.value || null,
                      )
                    }
                  >
                    <option value="">社内工程</option>
                    {subcontractors.map((subcontractor) => (
                      <option key={subcontractor.id} value={subcontractor.id}>
                        {subcontractor.name}
                      </option>
                    ))}
                  </select>
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
