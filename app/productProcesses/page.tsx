"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Numpad from "@/app/components/Numpad/Numpad";
import ProcessSorter from "@/app/components/ProcessSorter/ProcessSorter";
import supabase from "@/lib/supabase";
import {
  ProcessMaster,
  ProductMaster,
  ProductProcess,
  Subcontractor,
} from "@/app/type";
import styles from "../masterCommon.module.css";

const processOrderOptions = Array.from({ length: 50 }, (_, index) => index + 1);

const PRODUCT_SELECT_COLUMNS =
  "id,product_code,product_name,customer_name,standard,unit";

type NumpadTarget =
  | { kind: "form"; field: "overlapDays" }
  | { kind: "process"; id: string; field: "overlapDays" }
  | null;

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
  processName: String(row.process_name || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const mapProcessMaster = (row: Record<string, unknown>): ProcessMaster => ({
  id: String(row.id || ""),
  processId: String(row.process_id || ""),
  name: String(row.name || ""),
  days: Number(row.days || 0),
  sort: Number(row.sort || 0),
  enabled: Boolean(row.enabled ?? true),
  outsourcing: Boolean(row.outsourcing || false),
});

const mapProcess = (row: Record<string, unknown>): ProductProcess => {
  const subcontractor = row.subcontractors as { name?: string } | null;

  return {
    id: String(row.id || ""),
    productCode: String(row.product_code || ""),
    processName: String(row.process_name || ""),
    processOrder: Number(row.process_order || 0),
    overlapDays: Number(row.overlap_days || 0),
    subcontractorId: row.subcontractor_id ? String(row.subcontractor_id) : null,
    subcontractorName: String(row.subcontractor_name || subcontractor?.name || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
};

export default function ProductProcessesPage() {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [processMasters, setProcessMasters] = useState<ProcessMaster[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [processes, setProcesses] = useState<ProductProcess[]>([]);
  const [form, setForm] = useState({
    productCode: "",
    processName: "",
    processOrder: 1,
    overlapDays: 0,
    subcontractorId: "",
  });
  const [loading, setLoading] = useState(false);
  const [numpadTarget, setNumpadTarget] = useState<NumpadTarget>(null);

  const selectedProcesses = useMemo(
    () =>
      processes
        .filter((process) => process.productCode === form.productCode)
        .sort((a, b) => a.processOrder - b.processOrder),
    [form.productCode, processes],
  );

  const processNameOptions = useMemo(() => {
    const optionMap = new Map<string, ProcessMaster>();

    processMasters.forEach((process) => {
      if (process.name) optionMap.set(process.name, process);
    });

    processes.forEach((process) => {
      if (process.processName && !optionMap.has(process.processName)) {
        optionMap.set(process.processName, {
          id: process.processName,
          processId: process.processName,
          name: process.processName,
          days: 0,
          sort: 9999,
          enabled: true,
          outsourcing: false,
        });
      }
    });

    return Array.from(optionMap.values()).sort(
      (a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ja"),
    );
  }, [processMasters, processes]);

  const getProcessMasterByName = useCallback(
    (processName: string) =>
      processMasters.find(
        (process) =>
          process.name === processName || process.processId === processName,
      ),
    [processMasters],
  );

  const getSubcontractorsForProcess = useCallback(
    (processName: string) =>
      subcontractors.filter(
        (subcontractor) => subcontractor.processName === processName,
      ),
    [subcontractors],
  );

  const isOutsourceProcess = useCallback(
    (processName: string) =>
      Boolean(getProcessMasterByName(processName)?.outsourcing),
    [getProcessMasterByName],
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        productResult,
        processMasterResponse,
        subcontractorResponse,
        processResponse,
      ] = await Promise.all([
        supabase
          .from("v_product_master_with_customer")
          .select(PRODUCT_SELECT_COLUMNS)
          .order("product_code"),
        fetch("/api/processes"),
        fetch("/api/masters/subcontractors"),
        fetch("/api/masters/product-processes"),
      ]);

      if (productResult.error) throw productResult.error;
      if (!processMasterResponse.ok) throw new Error("工程マスタの取得に失敗しました");
      if (!subcontractorResponse.ok) throw new Error("外注先マスタの取得に失敗しました");
      if (!processResponse.ok) throw new Error("製品工程マスタの取得に失敗しました");

      const productRows = (productResult.data || []).map(mapProduct);
      const processMasterRows: ProcessMaster[] = (
        await processMasterResponse.json()
      ).map(mapProcessMaster);
      const processRows: ProductProcess[] = (await processResponse.json()).map(mapProcess);
      setProducts(productRows);
      setProcessMasters(processMasterRows);
      setSubcontractors((await subcontractorResponse.json()).map(mapSubcontractor));
      setProcesses(processRows);

      if (productRows[0]) {
        setForm((prev) => {
          const productCode = prev.productCode || productRows[0].productCode;
          return {
            ...prev,
            productCode,
            processOrder: Math.min(
              50,
              processRows.filter((p) => p.productCode === productCode).length + 1,
            ),
          };
        });
      }
    } catch (error) {
      console.error(error);
      alert("製品工程マスタの取得に失敗しました");
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

  const handleFormProcessNameChange = (processName: string) => {
    const matchingSubcontractors = getSubcontractorsForProcess(processName);
    setForm((prev) => ({
      ...prev,
      processName,
      subcontractorId: isOutsourceProcess(processName)
        ? matchingSubcontractors[0]?.id || ""
        : "",
    }));
  };

  const handleProcessNameChange = (id: string, processName: string) => {
    const matchingSubcontractors = getSubcontractorsForProcess(processName);
    setProcesses((prev) =>
      prev.map((process) =>
        process.id === id
          ? {
              ...process,
              processName,
              subcontractorId: isOutsourceProcess(processName)
                ? matchingSubcontractors[0]?.id || null
                : null,
            }
          : process,
      ),
    );
  };

  const currentNumpadValue = () => {
    if (!numpadTarget) return "";

    if (numpadTarget.kind === "form") {
      return String(form[numpadTarget.field] || "");
    }

    const process = processes.find((item) => item.id === numpadTarget.id);
    return process ? String(process[numpadTarget.field] || "") : "";
  };

  const handleNumpadChange = (value: string) => {
    if (!numpadTarget) return;
    const nextValue = Math.max(0, Math.floor(Number(value || 0)));

    if (numpadTarget.kind === "form") {
      setForm((prev) => ({ ...prev, [numpadTarget.field]: nextValue }));
      return;
    }

    updateProcess(numpadTarget.id, numpadTarget.field, nextValue);
  };

  const addProcess = async () => {
    if (
      !form.productCode ||
      !form.processName ||
      Number(form.processOrder) <= 0 ||
      Number(form.overlapDays) < 0
    ) {
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
        overlap_days: Number(form.overlapDays || 0),
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
      processOrder: Math.min(50, selectedProcesses.length + 2),
      overlapDays: 0,
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
        overlap_days: Number(process.overlapDays || 0),
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
          overlap_days: Number(process.overlapDays || 0),
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
        <Link href="/masterSettings" className={styles.backButton}>
          ← マスタ設定に戻る
        </Link>
        <h1 className={styles.title}>製品工程マスタ</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <label className={styles.fieldLabel}>
            <span className={styles.fieldLabelText}>製品</span>
          <select
            className={styles.select}
            value={form.productCode}
            onChange={(e) =>
              setForm({
                ...form,
                productCode: e.target.value,
                processOrder: Math.min(
                  50,
                  processes.filter((p) => p.productCode === e.target.value).length + 1,
                ),
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
          </label>
          <label className={styles.fieldLabel}>
            <span className={styles.fieldLabelText}>工程名</span>
          <select
            className={styles.select}
            value={form.processName}
            onChange={(e) => handleFormProcessNameChange(e.target.value)}
          >
            <option value="">工程名を選択</option>
            {processNameOptions.map((process) => (
              <option key={process.id} value={process.name}>
                {process.name}
              </option>
            ))}
          </select>
          </label>
          <label className={styles.fieldLabel}>
            <span className={styles.fieldLabelText}>工程順</span>
          <select
            className={styles.select}
            value={form.processOrder}
            onChange={(e) =>
              setForm({ ...form, processOrder: Number(e.target.value) })
            }
          >
            {processOrderOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          </label>
          <label className={styles.fieldLabel}>
            <span className={styles.fieldLabelText}>重複日数</span>
          <input
            className={`${styles.input} ${styles.numpadInput}`}
            type="text"
            inputMode="none"
            readOnly
            placeholder="重複日数"
            value={form.overlapDays}
            onFocus={() =>
              setNumpadTarget({ kind: "form", field: "overlapDays" })
            }
          />
          </label>
          <label className={styles.fieldLabel}>
            <span className={styles.fieldLabelText}>加工区分</span>
          {isOutsourceProcess(form.processName) ? (
            <select
              className={styles.select}
              value={form.subcontractorId}
              onChange={(e) =>
                setForm({ ...form, subcontractorId: e.target.value })
              }
            >
              <option value="">外注先を選択</option>
              {getSubcontractorsForProcess(form.processName).map(
                (subcontractor) => (
                  <option key={subcontractor.id} value={subcontractor.id}>
                    {subcontractor.name}
                  </option>
                ),
              )}
            </select>
          ) : (
            <input
              className={styles.input}
              value="社内加工"
              disabled
              readOnly
            />
          )}
          </label>
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
              <th>重複日数</th>
              <th>加工区分</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {selectedProcesses.map((process) => (
              <tr key={process.id}>
                <td>{process.productCode}</td>
                <td>
                  <select
                    className={styles.select}
                    value={process.processOrder}
                    onChange={(e) =>
                      updateProcess(process.id, "processOrder", Number(e.target.value))
                    }
                  >
                    {processOrderOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className={styles.select}
                    value={process.processName}
                    onChange={(e) =>
                      handleProcessNameChange(process.id, e.target.value)
                    }
                  >
                    <option value="">工程名を選択</option>
                    {processNameOptions.map((option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className={`${styles.tableInput} ${styles.numpadInput}`}
                    type="text"
                    inputMode="none"
                    readOnly
                    value={process.overlapDays}
                    onFocus={() =>
                      setNumpadTarget({
                        kind: "process",
                        id: process.id,
                        field: "overlapDays",
                      })
                    }
                  />
                </td>
                <td>
                  {isOutsourceProcess(process.processName) ? (
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
                      <option value="">外注先を選択</option>
                      {getSubcontractorsForProcess(process.processName).map(
                        (subcontractor) => (
                          <option key={subcontractor.id} value={subcontractor.id}>
                            {subcontractor.name}
                          </option>
                        ),
                      )}
                    </select>
                  ) : (
                    <input
                      className={styles.tableInput}
                      value="社内加工"
                      disabled
                      readOnly
                    />
                  )}
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

      <Numpad
        open={numpadTarget !== null}
        value={currentNumpadValue()}
        onChange={handleNumpadChange}
        onClose={() => setNumpadTarget(null)}
      />
    </div>
  );
}
