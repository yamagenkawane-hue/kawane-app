"use client";

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
  lotNo: "",
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
  lotNo: string;
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
};

type ProductPlanRow = {
  product_code?: string | null;
  product_name?: string | null;
  customer_name?: string | null;
  plan_amount?: number | string | null;
};

type NumpadTarget =
  | { kind: "form"; field: "planAmount" | "pressCompletedAmount" }
  | { kind: "schedule"; id: string; field: "planAmount" | "pressCompletedAmount" };

type AllDepartmentEdit = {
  qualityCompletedDate: string;
  shippingCompletedDate: string;
};

type EditingRow =
  | { kind: "post"; id: string }
  | { kind: "schedule"; id: string }
  | { kind: "all"; id: string }
  | null;

const SCHEDULE_SELECT_COLUMNS =
  "id,post_id,order_no,customer_name,product_name,press_number,lot_no,plan_amount,press_completed_amount,press_completed_date,shipping_scheduled_start,shipping_scheduled_end,delivery_date,created_at,updated_at,department,product_plan_amount";

const LOT_PROCESS_BALANCE_SELECT_COLUMNS =
  "id,post_id,order_no,lot_no,process_name,process_order,quantity,completed_amount,completed_date,customer_name,product_name,delivery_date";

const STOCK_IN_HISTORY_SELECT_COLUMNS =
  "id,post_id,order_no,lot_no,from_process_name,from_process_order,quantity,created_at,customer_name,product_name";

const mapSchedule = (row: Record<string, unknown>): ProductionSchedule => ({
  id: String(row.id || ""),
  postId: row.post_id ? String(row.post_id) : "",
  orderNo: String(row.order_no || ""),
  department: String(row.department || "製造G"),
  customerName: String(row.customer_name || ""),
  productName: String(row.product_name || ""),
  pressNumber: String(row.press_number || ""),
  lotNo: String(row.lot_no || ""),
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
  productName: String(row.product_name || ""),
  customerName: String(row.customer_name || ""),
  orderAmount: Number(row.order_amount || 0),
  remainingAmount: Number(row.remaining_amount || row.order_amount || 0),
  status: String(row.status || ""),
  deliveryDate: String(row.delivery_date || ""),
  completionScheduledDate: String(
    row.completion_scheduled_date || row.delivery_date || "",
  ),
  remark: String(row.remark || ""),
});

const mapLotProcessBalance = (
  row: Record<string, unknown>,
): LotProcessBalanceRow => ({
  id: String(row.id || ""),
  postId: String(row.post_id || ""),
  orderNo: String(row.order_no || ""),
  lotNo: String(row.lot_no || ""),
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

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const todayText = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

const isOverdue = (deliveryDate?: string) =>
  Boolean(deliveryDate) && String(deliveryDate) < todayText();

const createScheduleNo = (schedules: ProductionSchedule[]) => {
  const todayKey = formatDateKey(new Date());
  const prefix = `PS-${todayKey}-`;
  const maxSequence = schedules.reduce((max, schedule) => {
    if (!schedule.orderNo?.startsWith(prefix)) return max;
    const sequence = Number(schedule.orderNo.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `${prefix}${String(maxSequence + 1).padStart(3, "0")}`;
};

const filterSchedulesByBackorders = (
  scheduleRows: ProductionSchedule[],
  backorderRows: PostData[],
) => {
  const activePostIds = new Set(backorderRows.map((post) => post.id).filter(Boolean));
  const activeOrderNos = new Set(
    backorderRows.map((post) => post.orderNo).filter(Boolean),
  );

  return scheduleRows.filter((schedule) => {
    if (schedule.postId && activePostIds.has(schedule.postId)) return true;
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
    lotNo?: string;
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
  (!search.lotNo || normalizeText(row.lotNo).includes(normalizeText(search.lotNo)));

const getProductPlanKey = (
  productCode?: string,
  productName?: string,
  customerName?: string,
) =>
  [productCode, productName, customerName].map((value) => normalizeText(value)).join("|");

export default function ProductionSchedulesPage() {
  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [orderSchedules, setOrderSchedules] = useState<DailySchedulePost[]>([]);
  const [lotProcessBalances, setLotProcessBalances] = useState<
    LotProcessBalanceRow[]
  >([]);
  const [selectedDepartment, setSelectedDepartment] =
    useState<DepartmentFilter>("製造G");
  const [form, setForm] = useState(emptyForm);
  const [appliedSearch, setAppliedSearch] = useState<ScheduleSearch>({
    orderNo: "",
    customerName: "",
    productName: "",
    pressNumber: "",
    lotNo: "",
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
    <div className={styles.displayText}>{value || "-"}</div>
  );

  const fetchSchedules = async () => {
    try {
      setLoading(true);

      const [
        scheduleResult,
        balanceResult,
        completedResult,
        postResult,
        shipmentResult,
        dailyResult,
        productPlanResult,
      ] = await Promise.all([
        supabase
          .from("v_production_schedules_with_master")
          .select(SCHEDULE_SELECT_COLUMNS)
          .order("created_at", { ascending: false }),
        supabase
          .from("v_lot_process_balance_with_master")
          .select(LOT_PROCESS_BALANCE_SELECT_COLUMNS)
          .order("process_order", { ascending: true }),
        supabase
          .from("v_process_transfer_history_with_master")
          .select(STOCK_IN_HISTORY_SELECT_COLUMNS)
          .eq("movement_type", "stock_in")
          .order("created_at", { ascending: false }),
        supabase
          .from("v_posts_with_master")
          .select("id,order_no,customer_name,product_name,order_amount,delivery_date")
          .or("delete.is.null,delete.eq.false"),
        supabase
          .from("shipments")
          .select("post_id,quantity")
          .eq("cancelled", false),
        fetch("/api/daily-production"),
        supabase
          .from("v_product_master_with_customer")
          .select("product_code,product_name,customer_name,plan_amount"),
      ]);

      if (scheduleResult.error) throw scheduleResult.error;
      if (balanceResult.error) throw balanceResult.error;
      if (completedResult.error) throw completedResult.error;
      if (postResult.error) throw postResult.error;
      if (shipmentResult.error) throw shipmentResult.error;
      if (productPlanResult.error) throw productPlanResult.error;
      if (!dailyResult.ok) throw new Error("注残データの取得に失敗しました");

      const dailyRows = await dailyResult.json();
      const productPlanMap = new Map<string, number>();
      for (const row of (productPlanResult.data || []) as ProductPlanRow[]) {
        const planAmount = Number(row.plan_amount || 0);
        const codeKey = getProductPlanKey(row.product_code || "", "", "");
        const detailKey = getProductPlanKey(
          "",
          row.product_name || "",
          row.customer_name || "",
        );
        if (row.product_code) productPlanMap.set(codeKey, planAmount);
        if (row.product_name || row.customer_name) productPlanMap.set(detailKey, planAmount);
      }
      const mappedPosts: DailySchedulePost[] = (dailyRows || []).map(
        (row: Record<string, unknown>) => {
          const post = mapPost(row);
          return {
            ...post,
            planAmount:
              productPlanMap.get(getProductPlanKey(post.productCode, "", "")) ||
              productPlanMap.get(
                getProductPlanKey("", post.productName, post.customerName),
              ) ||
              0,
          };
        },
      );
      const postMap = new Map(
        (postResult.data || []).map((row) => [
          String(row.id || ""),
          {
            id: String(row.id || ""),
            orderNo: String(row.order_no || ""),
            customerName: String(row.customer_name || ""),
            productName: String(row.product_name || ""),
            orderAmount: Number(row.order_amount || 0),
            deliveryDate: String(row.delivery_date || ""),
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
      const mappedSchedules = (scheduleResult.data || []).map(mapSchedule);
      const mappedBalances = [
        ...(balanceResult.data || []).map(mapLotProcessBalance),
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

    setSchedules((prev) =>
      prev.map((schedule) =>
        schedule.id === numpadTarget.id
          ? { ...schedule, [numpadTarget.field]: numericValue }
          : schedule,
      ),
    );
  };

  const currentNumpadValue = () => {
    if (!numpadTarget) return "";
    if (numpadTarget.kind === "form") return String(form[numpadTarget.field] || "");
    const schedule = schedules.find((item) => item.id === numpadTarget.id);
    return String(schedule?.[numpadTarget.field] || "");
  };

  const handleChange = (
    id: string,
    field: keyof ProductionSchedule,
    value: string | number,
  ) => {
    setSchedules((prev) =>
      prev.map((schedule) =>
        schedule.id === id ? { ...schedule, [field]: value } : schedule,
      ),
    );
  };

  const handlePostChange = (
    id: string,
    field: keyof PostData,
    value: string | number,
  ) => {
    setOrderSchedules((prev) =>
      prev.map((post) =>
        post.id === id ? { ...post, [field]: value } : post,
      ),
    );
  };

  const handleSave = async (schedule: ProductionSchedule) => {
    try {
      setLoading(true);
      const planAmount = Number(schedule.planAmount);
      const pressCompletedAmount = Number(schedule.pressCompletedAmount);
      if (planAmount < 0 || pressCompletedAmount < 0) {
        alert("予定数と完了数は0以上で入力してください");
        return;
      }
      if (pressCompletedAmount > planAmount) {
        alert("完了数は予定数以下で入力してください");
        return;
      }

      const orderNo = schedule.orderNo || createScheduleNo(schedules);

      const { error } = await supabase
        .from("production_schedules")
        .update({
          order_no: orderNo,
          customer_name: schedule.customerName,
          product_name: schedule.productName,
          press_number: schedule.pressNumber,
          lot_no: schedule.lotNo,
          plan_amount: planAmount,
          press_completed_amount: pressCompletedAmount,
          press_completed_date: schedule.pressCompletedDate || null,
          shipping_scheduled_end:
            schedule.deliveryDate || schedule.shippingScheduledEnd || null,
          department: schedule.department || "製造G",
          updated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id);

      if (error) throw error;

      if ((schedule.postId || orderNo) && schedule.pressCompletedDate && !orderNo.startsWith("PS-")) {
        let postUpdate = supabase
          .from("posts")
          .update({
            completion_scheduled_date: schedule.pressCompletedDate,
            updated_at: new Date().toISOString(),
          });

        postUpdate = schedule.postId
          ? postUpdate.eq("id", schedule.postId)
          : postUpdate.eq("order_no", orderNo);

        const { error: postError } = await postUpdate;
        if (postError) throw postError;
      }

      setEditingRow(null);
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("生産予定の保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handlePostSave = async (post: PostData) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from("posts")
        .update({
          completion_scheduled_date:
            post.completionScheduledDate || post.deliveryDate || null,
          delivery_date: post.deliveryDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (error) throw error;

      setEditingRow(null);
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("生産予定の保存に失敗しました");
    } finally {
      setLoading(false);
    }
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

    const saveDepartmentDate = async (department: Department, completedDate: string) => {
      const existingSchedule = schedules.find(
        (schedule) =>
          ((schedule.postId && schedule.postId === post.id) ||
            (!schedule.postId && schedule.orderNo === post.orderNo)) &&
          (schedule.department || "製造G") === department,
      );
      const updatedAt = new Date().toISOString();

      if (existingSchedule) {
        const { error } = await supabase
          .from("production_schedules")
          .update({
            press_completed_date: completedDate || null,
            shipping_scheduled_end:
              post.deliveryDate || existingSchedule.shippingScheduledEnd || null,
            updated_at: updatedAt,
          })
          .eq("id", existingSchedule.id);

        if (error) throw error;
        return;
      }

      if (!completedDate) return;

      const { error } = await supabase.from("production_schedules").insert({
        post_id: post.id || null,
        order_no: post.orderNo,
        customer_name: post.customerName,
        product_name: post.productName,
        press_number: post.pressNumber || "",
        lot_no: post.lotNo || "",
        plan_amount: Number(post.remainingAmount || post.orderAmount || 0),
        press_completed_amount: 0,
        press_completed_date: completedDate,
        shipping_scheduled_end: post.deliveryDate || null,
        department,
        updated_at: updatedAt,
      });

      if (error) throw error;
    };

    try {
      setLoading(true);
      await saveDepartmentDate("品質管理G", edit.qualityCompletedDate);
      await saveDepartmentDate("梱包出荷G", edit.shippingCompletedDate);

      setEditingRow(null);
      setAllDepartmentEdits((prev) => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("全体表示の完了日の保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from("production_schedules")
        .delete()
        .eq("id", id);

      if (error) throw error;
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("生産予定の削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handlePostDelete = async (id: string) => {
    if (!confirm("この受注を生産予定画面から外しますか？")) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from("posts")
        .update({
          shipping_scheduled_start: null,
          shipping_scheduled_end: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      await fetchSchedules();
    } catch (error) {
      console.error(error);
      alert("生産予定からの削除に失敗しました");
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
    return matchesSearch(post, appliedSearch);
  });
  const filteredDepartmentSchedules = departmentSchedules.filter((schedule) =>
    selectedDepartment === "製造G" ? matchesSearch(schedule, appliedSearch) : true,
  );
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
      lotNo:
        balances.map((balance) => balance.lotNo).filter(Boolean).join(" / ") ||
        post.lotNo ||
        "-",
      manufacturingCompletedDate: datesForDepartment("製造G"),
      qualityCompletedDate: datesForDepartment("品質管理G"),
      shippingCompletedDate: datesForDepartment("梱包出荷G"),
      qualityScheduleDate:
        scheduleForDepartment("品質管理G")?.pressCompletedDate || "",
      shippingScheduleDate:
        scheduleForDepartment("梱包出荷G")?.pressCompletedDate || "",
    };
  });

  const showManualInput = selectedDepartment === "製造G";

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
        {showManualInput && (
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
            placeholder="ロットNo"
            value={form.lotNo}
            onChange={(e) => setForm({ ...form, lotNo: e.target.value })}
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
              lotNo: form.lotNo,
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
        <table className={styles.table}>
          <thead>
            <tr>
              <th>注番</th>
              <th>取引先名</th>
              <th>製品名</th>
              <th>ロット</th>
              <th>数量</th>
              <th>計画数</th>
              <th>プレス機No</th>
              <th>完了数</th>
              <th>完了日</th>
              {selectedDepartment === "全て" && (
                <>
                  <th className={styles.multiLineHeader}>
                    <span>品質管理G</span>
                    <span>完了日</span>
                  </th>
                  <th className={styles.multiLineHeader}>
                    <span>梱包出荷G</span>
                    <span>完了日</span>
                  </th>
                </>
              )}
              <th>納期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {selectedDepartment === "製造G" &&
              unscheduledOrderSchedules.map((post) => {
              const editing = isEditing("post", post.id);
              const rowClassName = isOverdue(post.deliveryDate)
                ? styles.dangerRow
                : styles.autoRow;

              return (
                <tr key={`post-${post.id}`} className={rowClassName}>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.tableInput} ${styles.orderInput}`}
                        disabled
                        value={post.orderNo}
                        onChange={(e) =>
                          handlePostChange(post.id, "orderNo", e.target.value)
                        }
                      />
                    ) : (
                      renderCellText(post.orderNo)
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.tableInput} ${styles.customerInput}`}
                        disabled
                        value={post.customerName}
                        onChange={(e) =>
                          handlePostChange(post.id, "customerName", e.target.value)
                        }
                      />
                    ) : (
                      renderCellText(post.customerName)
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.tableInput} ${styles.productInput}`}
                        disabled
                        value={post.productName}
                        onChange={(e) =>
                          handlePostChange(post.id, "productName", e.target.value)
                        }
                      />
                    ) : (
                      renderCellText(post.productName)
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.tableInput} ${styles.lotInput}`}
                        disabled
                        value={post.lotNo || ""}
                        onChange={(e) =>
                          handlePostChange(post.id, "lotNo", e.target.value)
                        }
                      />
                    ) : (
                      renderCellText(post.lotNo)
                    )}
                  </td>
                  <td>
                    <input
                      className={`${styles.tableInput} ${styles.numberInput}`}
                      disabled
                      inputMode="numeric"
                      value={post.remainingAmount || ""}
                      onChange={(e) =>
                        handlePostChange(
                          post.id,
                          "remainingAmount",
                          Number(e.target.value),
                        )
                      }
                    />
                  </td>
                  <td>{renderCellText(post.planAmount || 0)}</td>
                  <td>{renderCellText(post.pressNumber || "-")}</td>
                  <td>-</td>
                  <td>
                    <input
                      className={`${styles.tableInput} ${styles.dateInput}`}
                      disabled={!editing}
                      type="date"
                      value={post.completionScheduledDate || ""}
                      onChange={(e) =>
                        handlePostChange(
                          post.id,
                          "completionScheduledDate",
                          e.target.value,
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className={`${styles.tableInput} ${styles.dateInput}`}
                      disabled={!editing}
                      type="date"
                      value={post.deliveryDate || ""}
                      onChange={(e) =>
                        handlePostChange(post.id, "deliveryDate", e.target.value)
                      }
                    />
                  </td>
                  <td className={styles.actionArea}>
                    {editing ? (
                      <>
                        <button
                          className={styles.saveButton}
                          onClick={() => handlePostSave(post)}
                        >
                          保存
                        </button>
                        <button className={styles.cancelButton} onClick={handleCancel}>
                          キャンセル
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={styles.editButton}
                          onClick={() => setEditingRow({ kind: "post", id: post.id })}
                        >
                          編集
                        </button>
                        <button
                          className={styles.deleteButton}
                          onClick={() => handlePostDelete(post.id)}
                        >
                          削除
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}

            {selectedDepartment === "製造G" &&
              filteredDepartmentSchedules.map((schedule) => {
              const editing = isEditing("schedule", schedule.id);

              return (
              <tr
                key={schedule.id}
                className={isOverdue(schedule.deliveryDate) ? styles.dangerRow : ""}
              >
                <td>
                  {editing ? (
                    <input
                      className={`${styles.tableInput} ${styles.orderInput}`}
                      disabled
                      value={schedule.orderNo || ""}
                      onChange={(e) =>
                        handleChange(schedule.id, "orderNo", e.target.value)
                      }
                    />
                  ) : (
                    renderCellText(schedule.orderNo)
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className={`${styles.tableInput} ${styles.customerInput}`}
                      disabled
                      value={schedule.customerName}
                      onChange={(e) =>
                        handleChange(schedule.id, "customerName", e.target.value)
                      }
                    />
                  ) : (
                    renderCellText(schedule.customerName)
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className={`${styles.tableInput} ${styles.productInput}`}
                      disabled
                      value={schedule.productName}
                      onChange={(e) =>
                        handleChange(schedule.id, "productName", e.target.value)
                      }
                    />
                  ) : (
                    renderCellText(schedule.productName)
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className={`${styles.tableInput} ${styles.lotInput}`}
                      disabled
                      value={schedule.lotNo}
                      onChange={(e) =>
                        handleChange(schedule.id, "lotNo", e.target.value)
                      }
                    />
                  ) : (
                    renderCellText(schedule.lotNo)
                  )}
                </td>
                <td>
                  <input
                    className={`${styles.tableInput} ${styles.numberInput}`}
                    disabled
                    inputMode="numeric"
                    value={schedule.planAmount || ""}
                    onFocus={() =>
                      editing &&
                      setNumpadTarget({
                        kind: "schedule",
                        id: schedule.id,
                        field: "planAmount",
                      })
                    }
                    onChange={(e) =>
                      handleChange(schedule.id, "planAmount", Number(e.target.value))
                    }
                  />
                </td>
                <td>{renderCellText(schedule.productPlanAmount || 0)}</td>
                <td>{renderCellText(schedule.pressNumber)}</td>
                <td>
                  <input
                    className={`${styles.tableInput} ${styles.numberInput}`}
                    disabled={!editing}
                    inputMode="numeric"
                    value={schedule.pressCompletedAmount || ""}
                    onFocus={() =>
                      editing &&
                      setNumpadTarget({
                        kind: "schedule",
                        id: schedule.id,
                        field: "pressCompletedAmount",
                      })
                    }
                    onChange={(e) =>
                      handleChange(
                        schedule.id,
                        "pressCompletedAmount",
                        Number(e.target.value),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    className={`${styles.tableInput} ${styles.dateInput}`}
                    disabled={!editing}
                    type="date"
                    value={schedule.pressCompletedDate}
                    onChange={(e) =>
                      handleChange(schedule.id, "pressCompletedDate", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={`${styles.tableInput} ${styles.dateInput}`}
                    disabled={!editing}
                    type="date"
                    value={schedule.deliveryDate || ""}
                    onChange={(e) =>
                      handleChange(schedule.id, "deliveryDate", e.target.value)
                    }
                  />
                </td>
                <td className={styles.actionArea}>
                  {editing ? (
                    <>
                      <button
                        className={styles.saveButton}
                        onClick={() => handleSave(schedule)}
                      >
                        保存
                      </button>
                      <button className={styles.cancelButton} onClick={handleCancel}>
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={styles.editButton}
                        onClick={() =>
                          setEditingRow({ kind: "schedule", id: schedule.id })
                        }
                      >
                        編集
                      </button>
                      <button
                        className={styles.deleteButton}
                        onClick={() => handleDelete(schedule.id)}
                      >
                        削除
                      </button>
                    </>
                  )}
                </td>
              </tr>
              );
            })}
            {selectedDepartment !== "製造G" && selectedDepartment !== "全て" &&
              departmentBalanceRows.map((row) => (
                <tr
                  key={`balance-${row.id}`}
                  className={isOverdue(row.deliveryDate) ? styles.dangerRow : ""}
                >
                  <td>{renderCellText(row.orderNo)}</td>
                  <td>{renderCellText(row.customerName)}</td>
                  <td>{renderCellText(row.productName)}</td>
                  <td>{renderCellText(row.lotNo)}</td>
                  <td>{renderCellText(row.quantity)}</td>
                  <td>{renderCellText("-")}</td>
                  <td>{renderCellText("-")}</td>
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
                    <td>{renderCellText(row.lotNo)}</td>
                    <td>{renderCellText(row.orderAmount)}</td>
                    <td>{renderCellText(row.planAmount || 0)}</td>
                    <td>{renderCellText(row.pressNumber || "-")}</td>
                    <td>{renderCellText("-")}</td>
                    <td>{renderCellText(row.manufacturingCompletedDate)}</td>
                    <td>
                      {editing ? (
                        <input
                          className={`${styles.tableInput} ${styles.dateInput}`}
                          type="date"
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
                <td colSpan={selectedDepartment === "全て" ? 13 : 11} className={styles.emptyCell}>
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
