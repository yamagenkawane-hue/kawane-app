"use client";
import { authFetch } from "@/lib/auth/client";
import { pressMachineNumber } from "@/lib/pressMachineNumber";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { hasProductionStarted } from "@/lib/dailyProductionStart";

import { type MouseEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import { PostData, ProductionSchedule } from "@/app/type";
import styles from "./page.module.css";

const emptyForm = {
  orderNo: "",
  customerName: "",
  productName: "",
  pressNumber: "",
  plannedStartDate: "",
  planAmount: 0,
  pressCompletedAmount: 0,
  pressCompletedDate: "",
};

const DEPARTMENTS = ["製造G", "品質管理G", "梱包出荷G"] as const;
type Department = (typeof DEPARTMENTS)[number];
type DepartmentFilter = Department | "全て";

type ScheduleSearch = {
  orderNo: string;
  customerName: string;
  productName: string;
  pressNumber: string;
  plannedStartDate: string;
};

type DailySchedulePost = PostData & {
  planAmount?: number;
  pressNumber?: string;
};

type LotProcessBalanceRow = {
  id: string;
  postId: string;
  orderNo: string;
  lotNo: string;
  plannedStartDate: string;
  processName: string;
  processOrder: number;
  quantity: number;
  completedAmount: number;
  completedDate: string;
  customerName: string;
  productName: string;
  deliveryDate: string;
  isCompleted?: boolean;
};

type CompletedPostSummary = {
  id: string;
  orderNo: string;
  customerName: string;
  productName: string;
  orderAmount: number;
  deliveryDate: string;
  plannedStartDate: string;
};

type NumpadTarget =
  | { kind: "form"; field: "planAmount" | "pressCompletedAmount" }
  | { kind: "all"; id: string; field: "planAmount" };

type AllDepartmentEdit = {
  planAmount?: string;
  manufacturingCompletedDate: string;
  qualityCompletedDate: string;
  shippingCompletedDate: string;
};

type EditingRow =
  | { kind: "post"; id: string }
  | { kind: "schedule"; id: string }
  | { kind: "all"; id: string }
  | null;

const SCHEDULE_SELECT_COLUMNS =
  "id,post_id,order_no,customer_name,product_name,press_number,lot_no,planned_start_date,plan_amount,press_completed_amount,press_completed_date,shipping_scheduled_start,shipping_scheduled_end,delivery_date,created_at,updated_at,department,product_plan_amount";

const LOT_PROCESS_BALANCE_SELECT_COLUMNS =
  "id,post_id,order_no,lot_no,process_name,process_order,quantity,completed_amount,completed_date,customer_name,product_name,delivery_date";

const STOCK_IN_HISTORY_SELECT_COLUMNS =
  "id,post_id,order_no,lot_no,from_process_name,from_process_order,quantity,created_at,customer_name,product_name";

const mapSchedule = (row: Record<string, unknown>, processNames: readonly string[] = []): ProductionSchedule => ({
  id: String(row.id || ""),
  postId: row.post_id ? String(row.post_id) : "",
  orderNo: String(row.order_no || ""),
  department: String(row.department || "製造G"),
  customerName: String(row.customer_name || ""),
  productName: String(row.product_name || ""),
  pressNumber: pressMachineNumber(row.press_number, processNames),
  lotNo: String(row.lot_no || ""),
  plannedStartDate: String(row.planned_start_date || ""),
  planAmount: Number(row.plan_amount || 0),
  productPlanAmount: Number(row.product_plan_amount || 0),
  pressCompletedAmount: Number(row.press_completed_amount || 0),
  pressCompletedDate: String(row.press_completed_date || ""),
  shippingScheduledStart: String(row.shipping_scheduled_start || ""),
  shippingScheduledEnd: String(row.shipping_scheduled_end || ""),
  deliveryDate: String(row.delivery_date || row.shipping_scheduled_end || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const mapPost = (row: Record<string, unknown>): PostData => ({
  id: String(row.id || ""),
  orderNo: String(row.order_no || ""),
  lotNo: String(row.lot_no || ""),
  plannedStartDate: String(row.planned_start_date || ""),
  productName: String(row.product_name || ""),
  customerName: String(row.customer_name || ""),
  orderAmount: Number(row.order_amount || 0),
  remainingAmount: Number(row.remaining_amount || row.order_amount || 0),
  status: String(row.status || ""),
  deliveryDate: String(row.delivery_date || ""),
  completionScheduledDate: String(row.completion_scheduled_date || ""),
  remark: String(row.remark || ""),
});

const mapLotProcessBalance = (
  row: Record<string, unknown>,
  postMap: Map<string, CompletedPostSummary>,
): LotProcessBalanceRow => ({
  id: String(row.id || ""),
  postId: String(row.post_id || ""),
  orderNo: String(row.order_no || ""),
  lotNo: String(row.lot_no || ""),
  plannedStartDate: postMap.get(String(row.post_id || ""))?.plannedStartDate || "",
  processName: String(row.process_name || ""),
  processOrder: Number(row.process_order || 0),
  quantity: Number(row.quantity || 0),
  completedAmount: Number(row.completed_amount || 0),
  completedDate: String(row.completed_date || ""),
  customerName: String(row.customer_name || ""),
  productName: String(row.product_name || ""),
  deliveryDate: String(row.delivery_date || ""),
});

const mapCompletedLotProcess = (
  row: Record<string, unknown>,
  postMap: Map<string, CompletedPostSummary>,
): LotProcessBalanceRow => {
  const postId = String(row.post_id || "");
  const post = postMap.get(postId);
  const completedDate = String(row.created_at || "").slice(0, 10);
  const quantity = Number(row.quantity || 0);

  return {
    id: `completed-${String(row.id || "")}`,
    postId,
    orderNo: String(row.order_no || post?.orderNo || ""),
    lotNo: `${String(row.lot_no || "")} / 完了`,
    plannedStartDate: post?.plannedStartDate || "",
    processName: String(row.from_process_name || "梱包"),
    processOrder: Number(row.from_process_order || 0),
    quantity,
    completedAmount: quantity,
    completedDate,
    customerName: String(row.customer_name || post?.customerName || ""),
    productName: String(row.product_name || post?.productName || ""),
    deliveryDate: String(post?.deliveryDate || ""),
    isCompleted: true,
  };
};

const getDepartmentForProcess = (processName: string): Department => {
  if (processName.includes("検査") || processName.includes("品質")) {
    return "品質管理G";
  }

  if (
    processName.includes("梱包") ||
    processName.includes("包装") ||
    processName.includes("出荷")
  ) {
    return "梱包出荷G";
  }

  return "製造G";
};

const todayText = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

const isOverdue = (deliveryDate?: string) =>
  Boolean(deliveryDate) && String(deliveryDate) < todayText();

const filterSchedulesByBackorders = (
  scheduleRows: ProductionSchedule[],
  backorderRows: PostData[],
) => {
  const activePostIds = new Set(backorderRows.map((post) => post.id).filter(Boolean));
  const activeOrderNos = new Set(
    backorderRows.map((post) => post.orderNo).filter(Boolean),
  );

  return scheduleRows.filter((schedule) => {
    if (schedule.postId) return activePostIds.has(schedule.postId);
    if (schedule.orderNo && activeOrderNos.has(schedule.orderNo)) return true;
    return false;
  });
};

const normalizeText = (value?: string | number) =>
  String(value || "").trim().toLowerCase();

const matchesSearch = (
  row: {
    orderNo?: string;
    customerName?: string;
    productName?: string;
    pressNumber?: string;
    plannedStartDate?: string;
  },
  search: ScheduleSearch,
) =>
  (!search.orderNo || normalizeText(row.orderNo).includes(normalizeText(search.orderNo))) &&
  (!search.customerName ||
    normalizeText(row.customerName).includes(normalizeText(search.customerName))) &&
  (!search.productName ||
    normalizeText(row.productName).includes(normalizeText(search.productName))) &&
  (!search.pressNumber ||
    normalizeText(row.pressNumber).includes(normalizeText(search.pressNumber))) &&
  (!search.plannedStartDate || row.plannedStartDate === search.plannedStartDate);

export default function ProductionSchedulesPage() {
  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [orderSchedules, setOrderSchedules] = useState<DailySchedulePost[]>([]);
  const [lotProcessBalances, setLotProcessBalances] = useState<
    LotProcessBalanceRow[]
  >([]);
  const [selectedDepartment, setSelectedDepartment] =
    useState<DepartmentFilter>("全て");
  const [form, setForm] = useState(emptyForm);
  const [appliedSearch, setAppliedSearch] = useState<ScheduleSearch>({
    orderNo: "",
    customerName: "",
    productName: "",
    pressNumber: "",
    plannedStartDate: "",
  });
  const [loading, setLoading] = useState(false);
  const [numpadTarget, setNumpadTarget] = useState<NumpadTarget | null>(null);
  const [editingRow, setEditingRow] = useState<EditingRow>(null);
  const [allDepartmentEdits, setAllDepartmentEdits] = useState<
    Record<string, AllDepartmentEdit>
  >({});
  const [isDraggingTable, setIsDraggingTable] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);

  const startTableDrag = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (target.closest("a, button, input, select, textarea")) {
      return;
    }

    const scrollElement = tableScrollRef.current;

    if (!scrollElement) {
      return;
    }

    setIsDraggingTable(true);
    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = scrollElement.scrollLeft;
  };

  const moveTableDrag = (event: MouseEvent<HTMLDivElement>) => {
    const scrollElement = tableScrollRef.current;

    if (!isDraggingTable || !scrollElement) {
      return;
    }

    event.preventDefault();
    scrollElement.scrollLeft =
      dragStartScrollLeftRef.current - (event.clientX - dragStartXRef.current);
  };

  const stopTableDrag = () => {
    setIsDraggingTable(false);
  };

  const isEditing = (kind: "post" | "schedule" | "all", id: string) =>
    editingRow?.kind === kind && editingRow.id === id;

  const renderCellText = (value?: string | number) => (
    <div className={styles.displayText}>{value === "" || value == null ? "-" : value}</div>
  );

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const today = todayText();

      const [
        scheduleResult,
        balanceResult,
        completedResult,
        postResult,
        shipmentResult,
        dailyResult,
        processNameResult,
      ] = await Promise.all([
        fetchAllRows((from, to) => supabase
          .from("v_production_schedules_with_master")
          .select(SCHEDULE_SELECT_COLUMNS)
          .order("created_at", { ascending: false }).order("id").range(from, to)),
        fetchAllRows((from, to) => supabase
          .from("v_lot_process_balance_with_master")
          .select(LOT_PROCESS_BALANCE_SELECT_COLUMNS)
          .order("process_order", { ascending: true }).order("id").range(from, to)),
        fetchAllRows((from, to) => supabase
          .from("v_process_transfer_history_with_master")
          .select(STOCK_IN_HISTORY_SELECT_COLUMNS)
          .eq("movement_type", "stock_in")
          .order("created_at", { ascending: false }).order("id").range(from, to)),
        fetchAllRows((from, to) => supabase
          .from("v_posts_with_master")
          .select("id,order_no,customer_name,product_name,order_amount,delivery_date,planned_start_date")
          .or("delete.is.null,delete.eq.false").order("id").range(from, to)),
        fetchAllRows((from, to) => supabase
          .from("shipments")
          .select("post_id,quantity")
          .or("cancelled.is.null,cancelled.eq.false").order("id").range(from, to)),
        authFetch(`/api/daily-production?date=${today}`),
        fetchAllRows((from, to) => supabase
          .from("process_master")
          .select("name").order("id").range(from, to)),
      ]);

      if (scheduleResult.error) throw scheduleResult.error;
      if (balanceResult.error) throw balanceResult.error;
      if (completedResult.error) throw completedResult.error;
      if (postResult.error) throw postResult.error;
      if (shipmentResult.error) throw shipmentResult.error;
      if (processNameResult.error) throw processNameResult.error;
      if (!dailyResult.ok) throw new Error("注残データの取得に失敗しました");

      const dailyRows = await dailyResult.json();
      const postMap = new Map(
        (postResult.data || []).filter(row => hasProductionStarted(row.planned_start_date, today)).map((row) => [
          String(row.id || ""),
          {
            id: String(row.id || ""),
            orderNo: String(row.order_no || ""),
            customerName: String(row.customer_name || ""),
            productName: String(row.product_name || ""),
            orderAmount: Number(row.order_amount || 0),
            deliveryDate: String(row.delivery_date || ""),
            plannedStartDate: String(row.planned_start_date || ""),
          },
        ]),
      );
      const shippedMap = (shipmentResult.data || []).reduce(
        (acc: Map<string, number>, row) => {
          const postId = String(row.post_id || "");
          if (!postId) return acc;
          acc.set(postId, (acc.get(postId) || 0) + Number(row.quantity || 0));
          return acc;
        },
        new Map<string, number>(),
      );
      const mappedPosts: DailySchedulePost[] = (dailyRows || []).filter((row: Record<string, unknown>) => hasProductionStarted(row.planned_start_date, today)).map((row: Record<string,unknown>) => {
        const post = mapPost(row);
        const remainingAmount = Math.max(post.orderAmount - (shippedMap.get(post.id) || 0), 0);
        return {...post,remainingAmount,planAmount:remainingAmount};
      });
      const processNames = (processNameResult.data || []).map(row => String(row.name || ""));
      const mappedSchedules = (scheduleResult.data || []).map(row => {
        const schedule = mapSchedule(row, processNames);
        const post = schedule.postId ? postMap.get(schedule.postId) : mappedPosts.find(post => post.orderNo === schedule.orderNo);
        return { ...schedule, plannedStartDate: post?.plannedStartDate || "" };
      });
      const mappedBalances = [
        ...(balanceResult.data || []).filter(row => postMap.has(String(row.post_id || ""))).map((row) => mapLotProcessBalance(row, postMap)),
        ...(completedResult.data || [])
          .filter((row) => {
            const postId = String(row.post_id || "");
            const post = postMap.get(postId);
            if (!post) return false;
            return (shippedMap.get(postId) || 0) < post.orderAmount;
          })
          .map((row) => mapCompletedLotProcess(row, postMap)),
      ];

      setSchedules(filterSchedulesByBackorders(mappedSchedules, mappedPosts));
      setOrderSchedules(mappedPosts);
      setLotProcessBalances(mappedBalances);
    } catch (error) {
      console.error(error);
      alert("生産予定の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadSchedules = async () => {
      await fetchSchedules();
    };

    void loadSchedules();
  }, []);

  const handleNumpadChange = (value: string) => {
    if (!numpadTarget) return;
    const numericValue = Number(value || 0);

    if (numpadTarget.kind === "form") {
      setForm((prev) => ({ ...prev, [numpadTarget.field]: numericValue }));
      return;
    }

    handleAllDepartmentChange(numpadTarget.id, "planAmount", value);
  };

  const currentNumpadValue = () => {
    if (!numpadTarget) return "";
    if (numpadTarget.kind === "form") return String(form[numpadTarget.field] || "");
    return allDepartmentEdits[numpadTarget.id]?.planAmount ?? String(allDepartmentRows.find(row => row.id === numpadTarget.id)?.planAmount ?? 0);
  };

  const handleAllDepartmentChange = (
    postId: string,
    field: keyof AllDepartmentEdit,
    value: string,
  ) => {
    setAllDepartmentEdits((prev) => ({
      ...prev,
      [postId]: {
        ...(prev[postId] || {
          manufacturingCompletedDate: "",
          qualityCompletedDate: "",
          shippingCompletedDate: "",
        }),
        [field]: value,
      },
    }));
  };

  const handleAllDepartmentSave = async (post: DailySchedulePost) => {
    const edit = allDepartmentEdits[post.id];
    if (!edit) {
      setEditingRow(null);
      return;
    }

    const planAmount = edit.planAmount === undefined ? undefined : Number(edit.planAmount);
    if (planAmount !== undefined && (!edit.planAmount?.trim() || !Number.isInteger(planAmount) || planAmount < 0 || planAmount > 2147483647)) {
      alert("計画数は0以上の整数で入力してください"); return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.rpc("save_daily_department_dates", {
        p_post_id: post.id,
        ...(planAmount === undefined ? {} : { p_plan_amount: planAmount }),
        p_manufacturing_date: edit.manufacturingCompletedDate || null,
        p_quality_date: edit.qualityCompletedDate || null,
        p_shipping_date: edit.shippingCompletedDate || null,
      });
      if (error) throw error;

      setEditingRow(null);
      setAllDepartmentEdits((prev) => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("全体表示の完了予定日の保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setEditingRow(null);
    await fetchSchedules();
  };

  const departmentBalanceRows = lotProcessBalances.filter((row) => {
    if (selectedDepartment === "全て") return true;
    return getDepartmentForProcess(row.processName) === selectedDepartment;
  });
  const departmentSchedules = schedules.filter((schedule) => {
    if (selectedDepartment === "全て") return true;
    return (schedule.department || "製造G") === selectedDepartment;
  });
  const scheduledPostIds = new Set(
    departmentSchedules.map((schedule) => schedule.postId).filter(Boolean),
  );
  const scheduledOrderNos = new Set(
    departmentSchedules.map((schedule) => schedule.orderNo).filter(Boolean),
  );
  const unscheduledOrderSchedules = orderSchedules.filter((post) => {
    if (post.id && scheduledPostIds.has(post.id)) return false;
    if (post.orderNo && scheduledOrderNos.has(post.orderNo)) return false;
    return true;
  });
  const filteredDepartmentSchedules = departmentSchedules;
  const allDepartmentRows = orderSchedules.map((post) => {
    const balances = lotProcessBalances.filter((row) => row.postId === post.id);
    const schedulesForPost = schedules.filter(
      (schedule) =>
        (schedule.postId && schedule.postId === post.id) ||
        (!schedule.postId && schedule.orderNo === post.orderNo),
    );
    const scheduleForDepartment = (department: Department) =>
      schedulesForPost.find(
        (schedule) => (schedule.department || "製造G") === department,
      );
    const datesForDepartment = (department: Department) => {
      const scheduleDates = schedulesForPost
        .filter((schedule) => (schedule.department || "製造G") === department)
        .map((schedule) => schedule.pressCompletedDate)
        .filter(Boolean);
      const balanceDates = balances
        .filter((balance) => getDepartmentForProcess(balance.processName) === department)
        .map((balance) => balance.completedDate)
        .filter(Boolean);
      return Array.from(new Set([...scheduleDates, ...balanceDates])).join(" / ") || "-";
    };

    return {
      ...post,
      pressNumber: Array.from(new Set(schedulesForPost.filter(schedule => (schedule.department || "製造G") === "製造G").map(schedule => pressMachineNumber(schedule.pressNumber)).filter(Boolean))).join(" / ") || "",
      planAmount: scheduleForDepartment("製造G")?.productPlanAmount ?? post.remainingAmount ?? post.orderAmount ?? 0,
      manufacturingCompletedDate: datesForDepartment("製造G"),
      qualityCompletedDate: datesForDepartment("品質管理G"),
      shippingCompletedDate: datesForDepartment("梱包出荷G"),
      manufacturingScheduleDate:
        scheduleForDepartment("製造G")?.pressCompletedDate || "",
      qualityScheduleDate:
        scheduleForDepartment("品質管理G")?.pressCompletedDate || "",
      shippingScheduleDate:
        scheduleForDepartment("梱包出荷G")?.pressCompletedDate || "",
    };
  }).filter(row => matchesSearch(row, appliedSearch));

  const showSearchFields = selectedDepartment === "全て";
  const showManufacturingColumns =
    selectedDepartment === "製造G" || selectedDepartment === "全て";
  const emptyColSpan =
    selectedDepartment === "全て" ? 13 : showManufacturingColumns ? 10 : 9;

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← トップへ戻る
        </Link>
        <h1 className={styles.title}>デイリー生産予定管理</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.departmentRow}>
          <label className={styles.fieldLabel} htmlFor="department-select">
            表示部署
          </label>
          <select
            id="department-select"
            className={styles.departmentSelect}
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value as DepartmentFilter)}
          >
            <option value="全て">全て</option>
            {DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
          {selectedDepartment === "梱包出荷G" && (
            <Link href="/shipping" className={styles.shippingButton}>
              出荷管理
            </Link>
          )}
        </div>
        {showSearchFields && (
          <>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            placeholder="注番"
            value={form.orderNo}
            onChange={(e) => setForm({ ...form, orderNo: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="得意先"
            value={form.customerName}
            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="製品名"
            value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="プレス機No"
            value={form.pressNumber}
            onChange={(e) => setForm({ ...form, pressNumber: e.target.value })}
          />
          <input
            className={styles.input}
            type="date"
            aria-label="開始予定日で検索"
            title="開始予定日で検索"
            value={form.plannedStartDate}
            onChange={(e) => setForm({ ...form, plannedStartDate: e.target.value })}
          />
          <input
            className={styles.input}
            inputMode="numeric"
            placeholder="数量"
            value={form.planAmount || ""}
            onFocus={() => setNumpadTarget({ kind: "form", field: "planAmount" })}
            onChange={(e) => setForm({ ...form, planAmount: Number(e.target.value) })}
          />
          <input
            className={styles.input}
            inputMode="numeric"
            placeholder="プレス完了数"
            value={form.pressCompletedAmount || ""}
            onFocus={() =>
              setNumpadTarget({ kind: "form", field: "pressCompletedAmount" })
            }
            onChange={(e) =>
              setForm({ ...form, pressCompletedAmount: Number(e.target.value) })
            }
          />
          <input
            className={styles.input}
            type="date"
            value={form.pressCompletedDate}
            onChange={(e) =>
              setForm({ ...form, pressCompletedDate: e.target.value })
            }
          />
        </div>
        <button
          className={styles.addButton}
          onClick={() =>
            setAppliedSearch({
              orderNo: form.orderNo,
              customerName: form.customerName,
              productName: form.productName,
              pressNumber: form.pressNumber,
              plannedStartDate: form.plannedStartDate,
            })
          }
        >
          検索
        </button>
          </>
        )}
      </div>

      {loading && <div className={styles.loading}>読み込み中...</div>}

      <div
        ref={tableScrollRef}
        className={`${styles.tableCard} ${
          isDraggingTable ? styles.draggingTable : ""
        }`}
        onMouseDown={startTableDrag}
        onMouseLeave={stopTableDrag}
        onMouseMove={moveTableDrag}
        onMouseUp={stopTableDrag}
      >
        <table
          className={`${styles.table} ${
            showManufacturingColumns ? "" : styles.departmentTable
          }`}
        >
          <thead>
            <tr>
              <th>注番</th>
              <th>取引先名</th>
              <th>製品名</th>
              <th>開始予定日</th>
              <th>数量</th>
              {showManufacturingColumns && (
                <>
                  <th>計画数</th>
                  <th>プレス機No</th>
                </>
              )}
              <th>完了数</th>
              <th className={selectedDepartment === "全て" ? styles.multiLineHeader : undefined}>
                {selectedDepartment === "全て" ? (
                  <>
                    <span>製造・洗浄</span>
                    <span>完了予定日</span>
                  </>
                ) : "完了予定日"}
              </th>
              {selectedDepartment === "全て" && (
                <>
                  <th className={styles.multiLineHeader}>
                    <span>品質管理G</span>
                    <span>完了予定日</span>
                  </th>
                  <th className={styles.multiLineHeader}>
                    <span>梱包出荷G</span>
                    <span>完了予定日</span>
                  </th>
                </>
              )}
              <th>納期</th>
              {selectedDepartment !== "製造G" && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {selectedDepartment === "製造G" && unscheduledOrderSchedules.map(post => (
              <tr key={`post-${post.id}`} className={isOverdue(post.deliveryDate) ? styles.dangerRow : styles.autoRow}>
                <td>{renderCellText(post.orderNo)}</td>
                <td>{renderCellText(post.customerName)}</td>
                <td>{renderCellText(post.productName)}</td>
                <td>{renderCellText(post.plannedStartDate)}</td>
                <td><input className={`${styles.tableInput} ${styles.numberInput}`} disabled inputMode="numeric" value={post.remainingAmount || ""} /></td>
                <td>{renderCellText(post.planAmount || 0)}</td>
                <td>{renderCellText(pressMachineNumber(post.pressNumber) || "-")}</td>
                <td>-</td>
                <td><input className={`${styles.tableInput} ${styles.dateInput}`} disabled type="date" value={post.completionScheduledDate || ""} /></td>
                <td><input className={`${styles.tableInput} ${styles.dateInput}`} disabled type="date" value={post.deliveryDate || ""} /></td>
              </tr>
            ))}
            {selectedDepartment === "製造G" && filteredDepartmentSchedules.map(schedule => (
              <tr key={schedule.id} className={isOverdue(schedule.deliveryDate) ? styles.dangerRow : ""}>
                <td>{renderCellText(schedule.orderNo)}</td>
                <td>{renderCellText(schedule.customerName)}</td>
                <td>{renderCellText(schedule.productName)}</td>
                <td>{renderCellText(schedule.plannedStartDate)}</td>
                <td><input className={`${styles.tableInput} ${styles.numberInput}`} disabled inputMode="numeric" value={schedule.planAmount || ""} /></td>
                <td>{renderCellText(schedule.productPlanAmount || 0)}</td>
                <td>{renderCellText(pressMachineNumber(schedule.pressNumber))}</td>
                <td><input className={`${styles.tableInput} ${styles.numberInput}`} disabled inputMode="numeric" value={schedule.pressCompletedAmount || ""} /></td>
                <td><input className={`${styles.tableInput} ${styles.dateInput}`} disabled type="date" value={schedule.pressCompletedDate || ""} /></td>
                <td><input className={`${styles.tableInput} ${styles.dateInput}`} disabled type="date" value={schedule.deliveryDate || ""} /></td>
              </tr>
            ))}
            {selectedDepartment !== "製造G" && selectedDepartment !== "全て" &&
              departmentBalanceRows.map((row) => (
                <tr
                  key={`balance-${row.id}`}
                  className={isOverdue(row.deliveryDate) ? styles.dangerRow : ""}
                >
                  <td>{renderCellText(row.orderNo)}</td>
                  <td>{renderCellText(row.customerName)}</td>
                  <td>{renderCellText(row.productName)}</td>
                  <td>{renderCellText(row.plannedStartDate)}</td>
                  <td>{renderCellText(row.quantity)}</td>
                  <td>{renderCellText(row.completedAmount)}</td>
                  <td>{renderCellText(row.completedDate)}</td>
                  <td>{renderCellText(row.deliveryDate)}</td>
                  <td className={styles.actionArea}>
                    <span className={styles.readOnlyText}>{row.processName}</span>
                  </td>
                </tr>
              ))}
            {selectedDepartment === "全て" &&
              allDepartmentRows.map((row) => {
                const editing = isEditing("all", row.id);
                const edit = allDepartmentEdits[row.id] || {
                  manufacturingCompletedDate: row.manufacturingScheduleDate,
                  qualityCompletedDate: row.qualityScheduleDate,
                  shippingCompletedDate: row.shippingScheduleDate,
                };

                return (
                  <tr
                    key={`all-${row.id}`}
                    className={isOverdue(row.deliveryDate) ? styles.dangerRow : ""}
                  >
                    <td>{renderCellText(row.orderNo)}</td>
                    <td>{renderCellText(row.customerName)}</td>
                    <td>{renderCellText(row.productName)}</td>
                    <td>{renderCellText(row.plannedStartDate)}</td>
                    <td>{renderCellText(row.orderAmount)}</td>
                    <td>{editing ? (
                      <input className={`${styles.tableInput} ${styles.numberInput}`} inputMode="numeric"
                        aria-label={`${row.orderNo}の計画数`} value={edit.planAmount ?? String(row.planAmount ?? 0)}
                        onFocus={() => setNumpadTarget({kind:"all",id:row.id,field:"planAmount"})}
                        onChange={e => handleAllDepartmentChange(row.id,"planAmount",e.target.value)} />
                    ) : renderCellText(row.planAmount ?? 0)}</td>
                    <td>{renderCellText(row.pressNumber || "-")}</td>
                    <td>{renderCellText("-")}</td>
                    <td>
                      {editing ? (
                        <input
                          className={`${styles.tableInput} ${styles.dateInput}`}
                          type="date"
                          aria-label="製造Gの完了予定日"
                          value={edit.manufacturingCompletedDate}
                          onChange={(e) => handleAllDepartmentChange(row.id, "manufacturingCompletedDate", e.target.value)}
                        />
                      ) : (
                        renderCellText(row.manufacturingCompletedDate)
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          className={`${styles.tableInput} ${styles.dateInput}`}
                          type="date"
                          aria-label="品質管理Gの完了予定日"
                          value={edit.qualityCompletedDate}
                          onChange={(e) =>
                            handleAllDepartmentChange(
                              row.id,
                              "qualityCompletedDate",
                              e.target.value,
                            )
                          }
                        />
                      ) : (
                        renderCellText(row.qualityCompletedDate)
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          className={`${styles.tableInput} ${styles.dateInput}`}
                          type="date"
                          aria-label="梱包出荷Gの完了予定日"
                          value={edit.shippingCompletedDate}
                          onChange={(e) =>
                            handleAllDepartmentChange(
                              row.id,
                              "shippingCompletedDate",
                              e.target.value,
                            )
                          }
                        />
                      ) : (
                        renderCellText(row.shippingCompletedDate)
                      )}
                    </td>
                    <td>{renderCellText(row.deliveryDate)}</td>
                    <td className={styles.actionArea}>
                      {editing ? (
                        <>
                          <button
                            className={styles.saveButton}
                            onClick={() => handleAllDepartmentSave(row)}
                          >
                            保存
                          </button>
                          <button className={styles.cancelButton} onClick={handleCancel}>
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <button
                          className={styles.editButton}
                          onClick={() => {
                            setAllDepartmentEdits((prev) => ({
                              ...prev,
                              [row.id]: {
                                manufacturingCompletedDate: row.manufacturingScheduleDate,
                                qualityCompletedDate: row.qualityScheduleDate,
                                shippingCompletedDate: row.shippingScheduleDate,
                              },
                            }));
                            setEditingRow({ kind: "all", id: row.id });
                          }}
                        >
                          編集
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            {((selectedDepartment === "製造G" &&
              unscheduledOrderSchedules.length === 0 &&
              filteredDepartmentSchedules.length === 0) ||
              (selectedDepartment === "全て" && allDepartmentRows.length === 0) ||
              (selectedDepartment !== "製造G" && selectedDepartment !== "全て" &&
                departmentBalanceRows.length === 0)) && (
              <tr>
                <td colSpan={emptyColSpan} className={styles.emptyCell}>
                  表示できる生産予定はありません
                </td>
              </tr>
            )}
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
