"use client";

import {
  type MouseEvent,
  type RefObject,
  Suspense,
  type UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "@/lib/supabase";
import { OrderProcess, ProductProcess } from "@/app/type";
import styles from "../masterCommon.module.css";
import outsourcingStyles from "./page.module.css";

type OutsourceRow = OrderProcess & {
  deliveryDate: string;
  remainingAmount: number;
  outsourcing: boolean;
};

const ORDER_PROCESS_SELECT_COLUMNS =
  "id,post_id,product_id,customer_id,product_process_id,order_no,product_code,product_name,customer_name,process_name,process_order,overlap_days,planned_amount,completed_amount,completed_date,subcontractor_id,subcontractor_name,outsource_sent_date,outsource_expected_return_date,outsource_returned_date,outsource_status,outsource_note,locked,created_at,updated_at,delivery_date";

type DerivedOutsourceStatus = "not_sent" | "sent" | "returned";

const getDerivedOutsourceStatus = (row: {
  outsourceSentDate?: string;
  outsourceReturnedDate?: string;
}): DerivedOutsourceStatus => {
  if (row.outsourceReturnedDate) return "returned";
  if (row.outsourceSentDate) return "sent";
  return "not_sent";
};

const outsourceStatusLabels: Record<DerivedOutsourceStatus, string> = {
  not_sent: "\u672a\u51fa\u3057",
  sent: "\u5916\u6ce8\u4e2d",
  returned: "\u623b\u308a\u6e08\u307f",
};

const uniqueJoined = (values: string[]) =>
  Array.from(new Set(values.filter(Boolean))).join(" / ") || "-";

const mapOrderProcess = (row: Record<string, unknown>): OutsourceRow => {
  const plannedAmount = Number(row.planned_amount || 0);
  const completedAmount = Number(row.completed_amount || 0);

  return {
    id: String(row.id || ""),
    postId: String(row.post_id || ""),
    productId: row.product_id ? String(row.product_id) : "",
    customerId: row.customer_id ? String(row.customer_id) : "",
    productProcessId: row.product_process_id
      ? String(row.product_process_id)
      : "",
    orderNo: String(row.order_no || ""),
    productCode: String(row.product_code || ""),
    productName: String(row.product_name || ""),
    customerName: String(row.customer_name || ""),
    processName: String(row.process_name || ""),
    processOrder: Number(row.process_order || 0),
    overlapDays: Number(row.overlap_days || 0),
    plannedAmount,
    completedAmount,
    completedDate: String(row.completed_date || ""),
    subcontractorId: row.subcontractor_id ? String(row.subcontractor_id) : null,
    subcontractorName: String(row.subcontractor_name || ""),
    outsourceSentDate: String(row.outsource_sent_date || ""),
    outsourceExpectedReturnDate: String(
      row.outsource_expected_return_date || "",
    ),
    outsourceReturnedDate: String(row.outsource_returned_date || ""),
    outsourceStatus: String(row.outsource_status || "not_sent"),
    outsourceNote: String(row.outsource_note || ""),
    locked: Boolean(row.locked || false),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    deliveryDate: String(row.delivery_date || ""),
    remainingAmount: Math.max(plannedAmount - completedAmount, 0),
    outsourcing: false,
  };
};

const mapProductProcess = (row: Record<string, unknown>): ProductProcess => ({
  id: String(row.id || ""),
  productId: row.product_id ? String(row.product_id) : "",
  productCode: String(row.product_code || ""),
  processName: String(row.process_name || ""),
  processOrder: Number(row.process_order || 0),
  overlapDays: Number(row.overlap_days || 0),
  subcontractorId: row.subcontractor_id ? String(row.subcontractor_id) : null,
  subcontractorName: String(row.subcontractor_name || ""),
  outsourcing: Boolean(row.outsourcing || false),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const isSameProcess = (process: OutsourceRow, master: ProductProcess) => {
  if (process.productProcessId && process.productProcessId === master.id) {
    return true;
  }

  const sameProduct =
    (process.productId && process.productId === master.productId) ||
    process.productCode === master.productCode;

  return (
    sameProduct &&
    process.processOrder === master.processOrder &&
    process.processName === master.processName
  );
};

function OutsourcingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<OutsourceRow[]>([]);
  const [savingId, setSavingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isDraggingTable, setIsDraggingTable] = useState(false);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const targetOrderNo = searchParams?.get("orderNo") || "";
  const returnTo = searchParams?.get("returnTo") || "";

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [orderProcessResult, productProcessResponse] = await Promise.all([
        supabase
          .from("v_order_processes_with_master")
          .select(ORDER_PROCESS_SELECT_COLUMNS)
          .order("delivery_date", { ascending: true })
          .order("customer_name", { ascending: true })
          .order("process_order", { ascending: true }),
        fetch("/api/masters/product-processes"),
      ]);

      if (orderProcessResult.error) throw orderProcessResult.error;
      if (!productProcessResponse.ok) {
        throw new Error("product process fetch failed");
      }

      const productProcesses: ProductProcess[] = (
        await productProcessResponse.json()
      ).map(mapProductProcess);
      const outsourcingMasters = productProcesses.filter(
        (process) => process.outsourcing,
      );

      const mappedRows = (orderProcessResult.data || [])
        .map(mapOrderProcess)
        .map((process) => {
          const master = outsourcingMasters.find((item) =>
            isSameProcess(process, item),
          );

          return {
            ...process,
            subcontractorName:
              process.subcontractorName || master?.subcontractorName || "",
            outsourcing: Boolean(master),
          };
        })
        .filter((process) => process.outsourcing)
        .sort((a, b) => {
          const deliveryCompare = a.deliveryDate.localeCompare(b.deliveryDate);
          const customerCompare = a.customerName.localeCompare(
            b.customerName,
            "ja",
          );
          return (
            deliveryCompare ||
            customerCompare ||
            a.orderNo.localeCompare(b.orderNo) ||
            a.processOrder - b.processOrder
          );
        });

      setRows(
        targetOrderNo
          ? mappedRows.filter((process) => process.orderNo === targetOrderNo)
          : mappedRows,
      );
    } catch (error) {
      console.error(error);
      alert("外注工程データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [targetOrderNo]);

  useEffect(() => {
    const loadData = async () => {
      await fetchData();
    };

    void loadData();
  }, [fetchData]);

  const returnHref = returnTo === "reservation" ? "/reservation" : "/";
  const returnLabel =
    returnTo === "reservation" ? "進捗管理に戻る" : "トップへ戻る";
  const isProgressScoped = Boolean(targetOrderNo && returnTo === "reservation");

  const visibleRows = useMemo(
    () =>
      targetOrderNo
        ? rows
        : rows.filter((row) => {
            const derivedStatus = getDerivedOutsourceStatus(row);

            return (
              showCompleted ||
              row.remainingAmount > 0 ||
              derivedStatus !== "returned"
            );
          }),
    [rows, showCompleted, targetOrderNo],
  );

  const summary = useMemo(
    () => ({
      total: visibleRows.length,
      remaining: visibleRows.reduce(
        (sum, row) => sum + Number(row.remainingAmount || 0),
        0,
      ),
      completed: rows.filter((row) => row.remainingAmount === 0).length,
    }),
    [rows, visibleRows],
  );

  const scopedDetails = useMemo(() => {
    const firstRow = visibleRows[0];

    return {
      deliveryDate: uniqueJoined(visibleRows.map((row) => row.deliveryDate)),
      orderNo: targetOrderNo || firstRow?.orderNo || "-",
      customerName: firstRow?.customerName || "-",
      productName: uniqueJoined(
        visibleRows.map((row) =>
          row.productCode
            ? `${row.productCode} / ${row.productName}`
            : row.productName,
        ),
      ),
      processName: uniqueJoined(
        visibleRows.map((row) => `${row.processOrder}. ${row.processName}`),
      ),
      subcontractorName: uniqueJoined(
        visibleRows.map((row) => row.subcontractorName || "-"),
      ),
    };
  }, [targetOrderNo, visibleRows]);

  const updateRow = (
    id: string,
    field: keyof OutsourceRow,
    value: string | number | boolean | null,
  ) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const saveRow = async (row: OutsourceRow) => {
    try {
      setSavingId(row.id);

      const nextStatus = getDerivedOutsourceStatus(row);

      const { error } = await supabase
        .from("order_processes")
        .update({
          outsource_sent_date: row.outsourceSentDate || null,
          outsource_expected_return_date:
            row.outsourceExpectedReturnDate || null,
          outsource_returned_date: row.outsourceReturnedDate || null,
          outsource_status: nextStatus,
          outsource_note: row.outsourceNote || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (error) throw error;
      await fetchData();
      if (targetOrderNo && returnTo === "reservation") {
        router.push("/reservation");
      }
    } catch (error) {
      console.error(error);
      alert("外注情報の保存に失敗しました");
    } finally {
      setSavingId("");
    }
  };

  const deleteOutsourceRow = async (row: OutsourceRow) => {
    if (!confirm("この外注工程を削除しますか？")) {
      return;
    }

    try {
      setSavingId(row.id);

      const { error } = await supabase
        .from("order_processes")
        .delete()
        .eq("id", row.id);

      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error(error);
      alert("外注工程の削除に失敗しました");
    } finally {
      setSavingId("");
    }
  };

  const syncScroll = (
    source: UIEvent<HTMLDivElement>,
    targetRef: RefObject<HTMLDivElement | null>,
  ) => {
    const target = targetRef.current;
    if (!target) return;

    const nextLeft = source.currentTarget.scrollLeft;
    if (target.scrollLeft !== nextLeft) {
      target.scrollLeft = nextLeft;
    }
  };

  const syncTopScrollLeft = (nextLeft: number) => {
    if (
      topScrollRef.current &&
      topScrollRef.current.scrollLeft !== nextLeft
    ) {
      topScrollRef.current.scrollLeft = nextLeft;
    }
  };

  const startTableDrag = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;

    if (
      target instanceof Element &&
      target.closest("input, textarea, select, button, a")
    ) {
      return;
    }

    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = event.currentTarget.scrollLeft;
    setIsDraggingTable(true);
    event.preventDefault();
  };

  const moveTableDrag = (event: MouseEvent<HTMLDivElement>) => {
    if (!isDraggingTable) return;

    const dragDistance = event.clientX - dragStartXRef.current;
    const nextLeft = dragStartScrollLeftRef.current - dragDistance;
    event.currentTarget.scrollLeft = nextLeft;
    syncTopScrollLeft(event.currentTarget.scrollLeft);
  };

  const stopTableDrag = () => {
    setIsDraggingTable(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href={returnHref} className={styles.backButton}>
          {returnLabel}
        </Link>
        <h1 className={styles.title}>外注管理</h1>
        <div />
      </div>

      {isProgressScoped ? (
        <div
          className={`${styles.summaryCard} ${outsourcingStyles.scopedSummaryCard}`}
        >
          <div>
            <span>納期</span>
            <strong>{scopedDetails.deliveryDate}</strong>
          </div>
          <div>
            <span>注番</span>
            <strong>{scopedDetails.orderNo}</strong>
          </div>
          <div>
            <span>得意先</span>
            <strong>{scopedDetails.customerName}</strong>
          </div>
          <div>
            <span>製品</span>
            <strong>{scopedDetails.productName}</strong>
          </div>
          <div>
            <span>工程</span>
            <strong>{scopedDetails.processName}</strong>
          </div>
          <div>
            <span>外注先</span>
            <strong>{scopedDetails.subcontractorName}</strong>
          </div>
        </div>
      ) : (
        <div className={styles.summaryCard}>
          <div>
            <span>表示件数</span>
            <strong>{summary.total}</strong>
          </div>
          <div>
            <span>外注残数量</span>
            <strong>{summary.remaining}</strong>
          </div>
          <div>
            <span>完了工程</span>
            <strong>{summary.completed}</strong>
          </div>
          <label>
            <span>表示条件</span>
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />{" "}
            完了済みも表示
          </label>
        </div>
      )}

      {loading && <div className={styles.loading}>読み込み中...</div>}

      <div
        ref={topScrollRef}
        className={outsourcingStyles.topScroll}
        onScroll={(event) => syncScroll(event, tableScrollRef)}
      >
        <div
          className={`${outsourcingStyles.scrollSpacer} ${
            isProgressScoped ? outsourcingStyles.scopedScrollSpacer : ""
          }`}
        />
      </div>

      <div
        ref={tableScrollRef}
        className={`${styles.tableCard} ${outsourcingStyles.tableCard} ${
          isDraggingTable ? outsourcingStyles.draggingTable : ""
        }`}
        onScroll={(event) => syncScroll(event, topScrollRef)}
        onMouseDown={startTableDrag}
        onMouseLeave={stopTableDrag}
        onMouseMove={moveTableDrag}
        onMouseUp={stopTableDrag}
      >
        <table
          className={`${styles.table} ${outsourcingStyles.outsourceTable} ${
            isProgressScoped ? outsourcingStyles.scopedOutsourceTable : ""
          }`}
        >
          <thead>
            <tr>
              {!isProgressScoped && (
                <>
                  <th>納期</th>
                  <th>注番</th>
                  <th>得意先</th>
                  <th>製品</th>
                  <th>工程</th>
                  <th>外注先</th>
                </>
              )}
              <th className={outsourcingStyles.quantityHeader}>数量</th>
              <th className={outsourcingStyles.statusHeader}>状態</th>
              <th className={outsourcingStyles.scheduleHeader}>外注日程</th>
              <th>完了日</th>
              <th className={outsourcingStyles.noteHeader}>メモ</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const outsourceStatus = getDerivedOutsourceStatus(row);

              return (
                <tr key={row.id}>
                  {!isProgressScoped && (
                    <>
                      <td className={outsourcingStyles.dateCell}>
                        {row.deliveryDate || "-"}
                      </td>
                      <td>{row.orderNo}</td>
                      <td>{row.customerName}</td>
                      <td className={outsourcingStyles.productCell}>
                        {row.productCode} / {row.productName}
                      </td>
                      <td>
                        {row.processOrder}. {row.processName}
                      </td>
                      <td>{row.subcontractorName || "-"}</td>
                    </>
                  )}
                  <td className={outsourcingStyles.quantityCell}>
                    <div className={outsourcingStyles.quantityGroup}>
                      <span>予定</span>
                      <span>完了</span>
                      <span className={outsourcingStyles.remainingLabel}>残</span>
                      <strong>{row.plannedAmount}</strong>
                      <strong>{row.completedAmount}</strong>
                      <strong className={outsourcingStyles.remainingAmount}>
                        {row.remainingAmount}
                      </strong>
                    </div>
                  </td>
                  <td className={outsourcingStyles.statusCell}>
                    <span
                      className={`${outsourcingStyles.statusBadge} ${
                        outsourcingStyles[`status_${outsourceStatus}`]
                      }`}
                    >
                      {outsourceStatusLabels[outsourceStatus]}
                    </span>
                  </td>
                  <td className={outsourcingStyles.scheduleCell}>
                    <label>
                      <span>出し</span>
                      <input
                        className={styles.tableInput}
                        type="date"
                        value={row.outsourceSentDate || ""}
                        onChange={(e) =>
                          updateRow(row.id, "outsourceSentDate", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>予定</span>
                      <input
                        className={styles.tableInput}
                        type="date"
                        value={row.outsourceExpectedReturnDate || ""}
                        onChange={(e) =>
                          updateRow(
                            row.id,
                            "outsourceExpectedReturnDate",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>実績</span>
                      <input
                        className={styles.tableInput}
                        type="date"
                        value={row.outsourceReturnedDate || ""}
                        onChange={(e) =>
                          updateRow(row.id, "outsourceReturnedDate", e.target.value)
                        }
                      />
                    </label>
                  </td>
                  <td className={outsourcingStyles.dateCell}>
                    {row.completedDate || "-"}
                  </td>
                  <td className={outsourcingStyles.noteCell}>
                    <textarea
                      className={`${styles.tableInput} ${outsourcingStyles.noteInput}`}
                      rows={3}
                      value={row.outsourceNote || ""}
                      onChange={(e) =>
                        updateRow(row.id, "outsourceNote", e.target.value)
                      }
                    />
                  </td>
                  <td className={outsourcingStyles.actionCell}>
                    <button
                      className={styles.saveButton}
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => saveRow(row)}
                    >
                      {savingId === row.id ? "保存中" : "保存"}
                    </button>
                    <button
                      className={styles.deleteButton}
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => deleteOutsourceRow(row)}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={isProgressScoped ? 6 : 12}>
                  外注工程はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OutsourcingFallback() {
  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          トップへ戻る
        </Link>
        <h1 className={styles.title}>外注管理</h1>
        <div />
      </div>
      <div className={styles.loading}>読み込み中...</div>
    </div>
  );
}

export default function OutsourcingPage() {
  return (
    <Suspense fallback={<OutsourcingFallback />}>
      <OutsourcingContent />
    </Suspense>
  );
}
