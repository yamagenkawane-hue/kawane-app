"use client";

import Link from "next/link";
import styles from "./page.module.css";
import React, { type MouseEvent, useRef, useState } from "react";
import SearchForm from "../components/SearchForm/SearchForm";
import ReservationList from "../components/ReservationList/ReservationList";
import TableHeader from "../components/TableHeader/TableHeader";
import OutsourceTransferDialog, { type OutsourceTransferRequest } from "../components/OutsourceTransferDialog/OutsourceTransferDialog";
import { isOutsourceTransfer, validateOutsourceTransferDates, type OutsourceTransferDates } from "@/lib/outsourceTransfer";
import DeleteIcon from "@mui/icons-material/Delete";
import { actualDate } from "@/lib/aiPrediction/actuals";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { mapOutsourceRemainder, REMAINDER_COLUMNS, availableRemainderAmount } from "@/lib/outsourceRemainders";
import { getWeightedProcessProgress, isCompletionProcess } from "@/lib/progressProcess";
import supabase from "@/lib/supabase";
import { LotProcessBalance, Post, ProgressGroupSummary } from "../type";
import { useFetchPosts } from "../utills/useFetchPosts";
import { useReservationDelete } from "../utills/useReservationDelete";

const customerNameCollator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
});

const getCustomerSortKey = (customerName: string) =>
  customerName
    .trim()
    .replaceAll(/\s+/g, "")
    .replaceAll("株式会社", "かぶしきがいしゃ")
    .replaceAll("有限会社", "ゆうげんがいしゃ")
    .replaceAll("合同会社", "ごうどうがいしゃ")
    .replaceAll("合資会社", "ごうしがいしゃ")
    .replaceAll("合名会社", "ごうめいがいしゃ");

const getProgressGroupKey = (post: { customerName: string; productName: string; productCode?: string }) =>
  `${getCustomerSortKey(post.customerName)}::${post.productCode || post.productName.trim().toLowerCase()}`;

const getTotalInProcessAmount = (post: Post) =>
  (post.lotProcessBalances || []).reduce(
    (total, balance) =>
      balance.isHistoryOnly ? total : total + Number(balance.quantity || 0),
    0,
  );

const buildProgressGroupSummaryMap = (rows: Post[]) => {
  const summaryMap = new Map<
    string,
    ProgressGroupSummary & { balances: LotProcessBalance[] }
  >();

  rows.forEach((post) => {
    const groupKey = getProgressGroupKey(post);
    const current = summaryMap.get(groupKey) || {
      totalInProcessAmount: 0,
      orderAmount: 0,
      inventoryAmount: 0,
      allocatedAmount: 0,
      quantityAdjustmentAmount: 0,
      processProgress: 0,
      balances: [],
    };
    const balances = [
      ...current.balances,
      ...(post.lotProcessBalances || []),
    ];

    summaryMap.set(groupKey, {
      totalInProcessAmount:
        current.totalInProcessAmount + getTotalInProcessAmount(post),
      orderAmount: current.orderAmount + Math.max(0, Number(post.orderAmount || 0) - Number(post.shippedAmount || 0)),
      inventoryAmount: Math.max(
        current.inventoryAmount,
        Number(post.inventoryAmount || 0),
      ),
      allocatedAmount: current.allocatedAmount + Number(post.allocatedAmount || 0),
      quantityAdjustmentAmount:
        current.quantityAdjustmentAmount +
        Number(post.quantityAdjustmentAmount || 0),
      processProgress: 0,
      balances,
    });
  });

  return new Map(
    [...summaryMap].map(([groupKey, summary]) => [
      groupKey,
      {
        totalInProcessAmount: summary.totalInProcessAmount + summary.inventoryAmount,
        orderAmount: summary.orderAmount,
        inventoryAmount: summary.inventoryAmount,
        allocatedAmount: summary.allocatedAmount,
        quantityAdjustmentAmount: summary.quantityAdjustmentAmount,
        processProgress: getWeightedProcessProgress(
          [...summary.balances, { quantity: summary.inventoryAmount, isCompleted: true } as LotProcessBalance],
          summary.orderAmount,
        ),
      },
    ]),
  );
};

const buildGroupedPageRows = <T extends { customerName: string; productName: string; productCode?: string }>(
  rows: T[],
  summaryMap: Map<string, ProgressGroupSummary>,
) =>
  rows.map((post, index) => {
    const currentGroupKey = getProgressGroupKey(post);
    const previousGroupKey =
      index > 0 ? getProgressGroupKey(rows[index - 1]) : "";
    const nextGroupKey =
      index < rows.length - 1 ? getProgressGroupKey(rows[index + 1]) : "";
    const showGroupedCustomerProduct = currentGroupKey !== previousGroupKey;
    const customerProductRowSpan = showGroupedCustomerProduct
      ? rows.slice(index).findIndex((row) => getProgressGroupKey(row) !== currentGroupKey)
      : 0;
    const resolvedRowSpan =
      customerProductRowSpan === -1 ? rows.length - index : customerProductRowSpan;

    return {
      post,
      showGroupedCustomerProduct,
      customerProductRowSpan: resolvedRowSpan,
      showGroupedProgressTotals: showGroupedCustomerProduct,
      progressTotalsRowSpan: resolvedRowSpan,
      progressGroupSummary: summaryMap.get(currentGroupKey),
      isLastInCustomerProductGroup: currentGroupKey !== nextGroupKey,
    };
  });

const Reservation = () => {
  const { posts, setShouldFetch } = useFetchPosts();
  const [search, setSearch] = useState("");
  const [outsourceTransfer, setOutsourceTransfer] = useState<OutsourceTransferRequest | null>(null);
  const transferBusyRef = useRef(false);
  const [isDraggingList, setIsDraggingList] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);

  const startListDrag = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (target.closest("a, button, input, select, textarea")) {
      return;
    }

    const scrollElement = listScrollRef.current;

    if (!scrollElement) {
      return;
    }

    setIsDraggingList(true);
    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = scrollElement.scrollLeft;
  };

  const moveListDrag = (event: MouseEvent<HTMLDivElement>) => {
    const scrollElement = listScrollRef.current;

    if (!isDraggingList || !scrollElement) {
      return;
    }

    event.preventDefault();
    scrollElement.scrollLeft =
      dragStartScrollLeftRef.current - (event.clientX - dragStartXRef.current);
  };

  const stopListDrag = () => {
    setIsDraggingList(false);
  };

  const filteredPosts = posts
    .filter((post) => {
      if (post.delete) {
        return false;
      }
      if (Number(post.shippedAmount || 0) >= Number(post.orderAmount || 0)) {
        return false;
      }

      const keyword = search.toLowerCase();

      const isSearchMatch =
        !search ||
        String(post.orderNo || "")
          .toLowerCase()
          .includes(keyword) ||
        String(post.lotNo || "")
          .toLowerCase()
          .includes(keyword) ||
        String(post.productName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(post.customerName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(post.status || "")
          .toLowerCase()
          .includes(keyword) ||
        String(post.deliveryDate || "")
          .toLowerCase()
          .includes(keyword) ||
        (post.lotProcessBalances || []).some((balance) =>
          String(balance.lotNo || "")
            .toLowerCase()
            .includes(keyword),
        );

      return isSearchMatch;
    })

    .sort((a, b) => {
      const customerCompare = customerNameCollator.compare(
        String(a.customerName || "").trim(),
        String(b.customerName || "").trim(),
      );

      if (customerCompare !== 0) {
        return customerCompare;
      }

      const productCompare = a.productName.localeCompare(b.productName, "ja", {
        numeric: true,
        sensitivity: "base",
      });

      if (productCompare !== 0) {
        return productCompare;
      }

      const codeCompare = String(a.productCode || "").localeCompare(String(b.productCode || ""));
      if (codeCompare !== 0) return codeCompare;

      const deliveryCompare =
        new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime();

      if (deliveryCompare !== 0) {
        return deliveryCompare;
      }

      return (
        String(a.orderNo || "").localeCompare(String(b.orderNo || ""), "ja", {
          numeric: true,
        })
      );
    });

  const progressGroupSummaryMap = buildProgressGroupSummaryMap(filteredPosts);
  const groupedPageRows = buildGroupedPageRows(
    filteredPosts,
    progressGroupSummaryMap,
  );

  const handleDelete = useReservationDelete(setShouldFetch);

  const registerOutsourceAndTransfer = async (request: OutsourceTransferRequest, amount: number, dates: OutsourceTransferDates, scheduleId?: string) => {
    const { error } = await supabase.rpc(request.isRemainder?"transfer_outsource_remainder_lot":"transfer_outsource_lot_with_dates", {
      ...(request.isRemainder?{p_schedule_id:scheduleId||null}:{}),
      p_lot_id: request.lotId, p_from_order_process_id: request.orderProcessId, p_amount: amount,
      p_sent_date: dates.sentDate, p_expected_date: dates.expectedDate, p_returned_date: dates.returnedDate,
      p_idempotency_key: request.idempotencyKey,
    });
    if (error) throw new Error(error.code === "PGRST202"
      ? "外注日程の登録・工程移動のシステム更新が未反映です。"
      : error.message || "外注日程の登録・工程移動に失敗しました。");
    setOutsourceTransfer(null);
    setShouldFetch(true);
    alert("外注日程を登録し、次工程へ移動しました。");
  };

  const handleTransferLot = async (balance: LotProcessBalance) => {
    if (transferBusyRef.current || outsourceTransfer) return;
    transferBusyRef.current = true;
    try {
      const currentQuantity = Number(balance.quantity || 0);
      if(currentQuantity<=0) {alert("移動できる数量がありません。");return;}
      const { data: source, error: sourceError } = await supabase.from("order_processes")
        .select("id,process_name,planned_amount,completed_amount,subcontractor_id,outsource_sent_date,outsource_expected_return_date,outsource_returned_date,product_processes(process_master(outsourcing))")
        .eq("id", balance.orderProcessId).single();
      if (sourceError) throw sourceError;
      if (!source) throw new Error("工程情報が見つかりません。");
      const outsourced = isOutsourceTransfer(source);
      const isPackaging = isCompletionProcess({ processName: source.process_name, processKind: balance.processKind, isOutsource: outsourced });
      const dates: OutsourceTransferDates = {
        sentDate: source.outsource_sent_date || "",
        expectedDate: source.outsource_expected_return_date || "",
        returnedDate: source.outsource_returned_date || "",
      };
      if (outsourced) {
        const {data: scheduleRows,error: scheduleError}=await fetchAllRows((from,to)=>supabase.from("outsource_remainder_schedules")
          .select(REMAINDER_COLUMNS).eq("order_process_id",balance.orderProcessId).eq("cancelled",false)
          .order("created_at").order("id").range(from,to));
        if(scheduleError) throw new Error(['PGRST205','42P01','42703','PGRST204'].includes(scheduleError.code||'')?"残数分の外注日程を管理するDB更新が未反映です。更新後に再実行してください。":scheduleError.message);
        const schedules=(scheduleRows||[]).map(row=>mapOutsourceRemainder(row as Record<string,unknown>));
        const pending=schedules.filter(row=>row.quantity>row.movedAmount);
        const remaining=Math.max(0,Number(source.planned_amount||0)-Number(source.completed_amount||0));
        if(pending.length>0 || (Number(source.completed_amount)>0 && source.outsource_returned_date)) {
          const first=pending[0];
          const available=availableRemainderAmount(remaining,schedules);
          if(!first&&available<=0) {alert("移動できる残数量がありません。");return;}
          setOutsourceTransfer({lotId:balance.lotId,lotNo:balance.lotNo,orderProcessId:balance.orderProcessId,
            processName:source.process_name,quantity:currentQuantity,
            dates:first?{sentDate:first.sentDate,expectedDate:first.expectedDate,returnedDate:first.returnedDate}:{sentDate:"",expectedDate:"",returnedDate:""},
            isRemainder:true,schedules:pending,availableNewQuantity:available,idempotencyKey:crypto.randomUUID()});
          return;
        }
      }
      if (outsourced && Object.values(dates).some(date => !date)) {
        setOutsourceTransfer({lotId: balance.lotId, lotNo: balance.lotNo,
          orderProcessId: balance.orderProcessId, processName: source.process_name,
          quantity: currentQuantity, dates, idempotencyKey: crypto.randomUUID()});
        return;
      }
      if (currentQuantity <= 0) {
        alert("移動できる数量がありません。");
        return;
      }

      const amountText = window.prompt(
        `${balance.lotNo} を${isPackaging ? "完了" : "次工程へ移動"}します。${
          isPackaging ? "完了数量" : "移動数量"
        }を入力してください。`,
        String(currentQuantity),
      );

      if (amountText === null) return;

      const transferAmount = Number(amountText.replaceAll(",", "").trim());

      if (!Number.isInteger(transferAmount) || transferAmount <= 0) {
        alert(`${isPackaging ? "完了数量" : "移動数量"}は1以上の整数で入力してください。`);
        return;
      }

      if (transferAmount > currentQuantity) {
        alert(`現在数量を超えて処理できません。処理可能数量は${currentQuantity}です。`);
        return;
      }

      const reason = isPackaging ? "進捗管理から計量・梱包完了" : "進捗管理から工程移動（数量補正を含む）";

      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      let workDate = dates.returnedDate;
      if (outsourced) {
        const dateError = validateOutsourceTransferDates(dates, today);
        if (dateError) { alert(`${dateError} 外注日程画面で確認してください。`); return; }
      } else {
        const enteredDate = window.prompt("実際に作業した日付を入力してください（YYYY-MM-DD）。過去の作業はその作業日を指定してください。", today);
        if (enteredDate === null) return;
        workDate = actualDate(enteredDate.trim()) || "";
        if (!workDate || enteredDate.trim() !== workDate || workDate > today) {
          alert("作業日は本日以前の正しい日付（YYYY-MM-DD）で入力してください。");
          return;
        }
      }
      const confirmed = window.confirm(
        `${balance.lotNo} / ${transferAmount.toLocaleString("ja-JP")} を${
          isPackaging ? "完了" : "次工程へ移動"
        }します。作業日: ${workDate}。よろしいですか？`,
      );

      if (!confirmed) return;

      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const { error } = await supabase.rpc(outsourced ? "transfer_outsource_lot_with_dates" : isPackaging ? "complete_lot_from_progress" : "transfer_lot_to_next_process", {
        p_lot_id: balance.lotId,
        p_from_order_process_id: balance.orderProcessId,
        p_amount: transferAmount,
        p_idempotency_key: idempotencyKey,
        ...(outsourced ? {p_sent_date: dates.sentDate, p_expected_date: dates.expectedDate, p_returned_date: dates.returnedDate}
          : {p_reason: reason, p_date: workDate}),
      });

      if (error) {
        console.error(error);
        alert(error.code === "PGRST202"
          ? "作業日を保存するためのシステム更新が未反映です。管理者に反映を依頼してください。"
          : error.message || "次工程への移動に失敗しました。");
        return;
      }

      alert(isPackaging ? "完了しました。" : "次工程へ移動しました。");
      setShouldFetch(true);
    } catch (error) {
      alert(typeof error === "object" && error !== null && "message" in error
        ? String(error.message) : "工程情報の取得・移動に失敗しました。");
    } finally {
      transferBusyRef.current = false;
    }
  };

  const handleEditLotBalance = async (balance: LotProcessBalance) => {
    const currentQuantity = Number(balance.quantity || 0);
    const amountText = window.prompt(
      `${balance.lotNo} / ${balance.processName} の現在数量を編集します。編集後の数量を入力してください。`,
      String(currentQuantity),
    );

    if (amountText === null) return;

    const editedAmount = Number(amountText.replaceAll(",", "").trim());

    if (!Number.isInteger(editedAmount) || editedAmount < 0) {
      alert("編集後の数量は0以上の整数で入力してください。");
      return;
    }

    if (editedAmount === currentQuantity) {
      alert("数量が変更されていません。");
      return;
    }

    const confirmed = window.confirm(
      `${balance.lotNo} / ${balance.processName} の数量を ${currentQuantity.toLocaleString(
        "ja-JP",
      )} から ${editedAmount.toLocaleString("ja-JP")} に変更します。よろしいですか？`,
    );

    if (!confirmed) return;

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const { error } = await supabase.rpc("edit_lot_process_balance", {
      p_balance_id: balance.id,
      p_after_quantity: editedAmount,
      p_reason: "進捗管理から数量編集",
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error(error);
      alert(error.message || "数量編集に失敗しました。");
      return;
    }

    alert("数量を編集しました。");
    setShouldFetch(true);
  };

  return (
    <>
      {outsourceTransfer && <OutsourceTransferDialog request={outsourceTransfer}
        today={new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Tokyo",year: "numeric",month: "2-digit",day: "2-digit"}).format(new Date())}
        onCancel={() => setOutsourceTransfer(null)}
        onSubmit={(amount, dates, scheduleId) => registerOutsourceAndTransfer(outsourceTransfer, amount, dates, scheduleId)} />}
      <div className={styles.reservationImg}>
        <Link href="/" className={styles.topPageLink}>
          <button className={styles.topPageButton}>トップページに戻る</button>
        </Link>

        <div className={styles.searchDelete}>
          <SearchForm search={search} setSearch={setSearch} />

          <Link className={styles.deleteIconLink} href="/childDelete">
            <DeleteIcon className={styles.deleteIcon} />
          </Link>
        </div>
        <div className={styles.center}>
          <h1>進捗管理</h1>
        </div>

      </div>

      <div
        ref={listScrollRef}
        className={`${styles.reservationWrapper} ${
          isDraggingList ? styles.draggingList : ""
        }`}
        onMouseDown={startListDrag}
        onMouseLeave={stopListDrag}
        onMouseMove={moveListDrag}
        onMouseUp={stopListDrag}
      >
        <table border={1} className={styles.listTitle}>
          <TableHeader />

          <tbody>
            {groupedPageRows.map(
              ({
                post,
                showGroupedCustomerProduct,
                customerProductRowSpan,
                showGroupedProgressTotals,
                progressTotalsRowSpan,
                progressGroupSummary,
                isLastInCustomerProductGroup,
              }) => (
              <ReservationList
                key={post.id}
                post={post}
                handleDelete={() => handleDelete(post.id)}
                handleTransferLot={handleTransferLot}
                handleEditLotBalance={handleEditLotBalance}
                showGroupedCustomerProduct={showGroupedCustomerProduct}
                customerProductRowSpan={customerProductRowSpan}
                showGroupedProgressTotals={showGroupedProgressTotals}
                progressTotalsRowSpan={progressTotalsRowSpan}
                progressGroupSummary={progressGroupSummary}
                isLastInCustomerProductGroup={isLastInCustomerProductGroup}
              />
              ),
            )}
          </tbody>
        </table>
      </div>

    </>
  );
};

export default Reservation;
