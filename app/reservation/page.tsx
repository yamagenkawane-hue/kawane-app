"use client";

import Link from "next/link";
import styles from "./page.module.css";
import React, { type MouseEvent, useRef, useState } from "react";
import SearchForm from "../components/SearchForm/SearchForm";
import ReservationList from "../components/ReservationList/ReservationList";
import TableHeader from "../components/TableHeader/TableHeader";
import Pagination from "../components/Pagination/Pagination";
import DeleteIcon from "@mui/icons-material/Delete";
import supabase from "@/lib/supabase";
import { LotProcessBalance, Post, ProgressGroupSummary } from "../type";
import { useFetchPosts } from "../utills/useFetchPosts";
import { usePagination } from "../utills/usePagination";
import { useReservationDelete } from "../utills/useReservationDelete";

const itemsPerPage = 7;

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

const getProgressGroupKey = (post: { customerName: string; productName: string }) =>
  `${getCustomerSortKey(post.customerName)}::${post.productName.trim().toLowerCase()}`;

const getTotalInProcessAmount = (post: Post) =>
  (post.lotProcessBalances || []).reduce(
    (total, balance) =>
      balance.isHistoryOnly ? total : total + Number(balance.quantity || 0),
    0,
  );

const buildProgressGroupSummaryMap = (rows: Post[]) => {
  const summaryMap = new Map<string, ProgressGroupSummary>();

  rows.forEach((post) => {
    const groupKey = getProgressGroupKey(post);
    const current = summaryMap.get(groupKey) || {
      totalInProcessAmount: 0,
      orderAmount: 0,
      inventoryAmount: 0,
      allocatedAmount: 0,
      quantityAdjustmentAmount: 0,
    };

    summaryMap.set(groupKey, {
      totalInProcessAmount:
        current.totalInProcessAmount + getTotalInProcessAmount(post),
      orderAmount: current.orderAmount + Number(post.orderAmount || 0),
      inventoryAmount: Math.max(
        current.inventoryAmount,
        Number(post.inventoryAmount || 0),
      ),
      allocatedAmount: current.allocatedAmount + Number(post.allocatedAmount || 0),
      quantityAdjustmentAmount:
        current.quantityAdjustmentAmount +
        Number(post.quantityAdjustmentAmount || 0),
    });
  });

  return summaryMap;
};

const buildGroupedPageRows = <T extends { customerName: string; productName: string }>(
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

const isPackagingProcess = (balance: LotProcessBalance) =>
  balance.processName.includes("梱包") ||
  balance.processName.includes("包装") ||
  balance.processOrder >= 5;

const Reservation = () => {
  const { posts, setShouldFetch } = useFetchPosts();
  const [search, setSearch] = useState("");
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
        getCustomerSortKey(a.customerName),
        getCustomerSortKey(b.customerName),
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

  const { paginatedPosts, currentPage, setCurrentPage } = usePagination(
    filteredPosts,
    itemsPerPage,
  );
  const progressGroupSummaryMap = buildProgressGroupSummaryMap(filteredPosts);
  const groupedPageRows = buildGroupedPageRows(
    paginatedPosts,
    progressGroupSummaryMap,
  );

  const handleDelete = useReservationDelete(setShouldFetch);

  const handleTransferLot = async (balance: LotProcessBalance) => {
    const currentQuantity = Number(balance.quantity || 0);
    const isPackaging = isPackagingProcess(balance);
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

    let reason = isPackaging
      ? "Progress screen packaging complete"
      : "Progress screen transfer";
    if (transferAmount < currentQuantity) {
      const reasonText = window.prompt(
        `現在数量より少なく${isPackaging ? "完了" : "移動"}する理由を入力してください。`,
      );

      if (reasonText === null) return;
      if (!reasonText.trim()) {
        alert(`数量を減らして${isPackaging ? "完了" : "移動"}する場合は理由を入力してください。`);
        return;
      }

      reason = reasonText.trim();
    }

    const confirmed = window.confirm(
      `${balance.lotNo} / ${transferAmount.toLocaleString("ja-JP")} を${
        isPackaging ? "完了" : "次工程へ移動"
      }します。よろしいですか？`,
    );

    if (!confirmed) return;

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const { error } = await supabase.rpc("transfer_lot_to_next_process", {
      p_lot_id: balance.lotId,
      p_from_order_process_id: balance.orderProcessId,
      p_amount: transferAmount,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error(error);
      alert(error.message || "次工程への移動に失敗しました。");
      return;
    }

    alert(isPackaging ? "完了しました。" : "次工程へ移動しました。");
    setShouldFetch(true);
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

    const reasonText = window.prompt(
      "数量を直接編集する理由を入力してください。",
    );

    if (reasonText === null) return;
    if (!reasonText.trim()) {
      alert("数量を直接編集する場合は理由を入力してください。");
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
      p_reason: reasonText.trim(),
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
      <div className={styles.reservationImg}>
        <Link href="/" className={styles.topPageLink}>
          <button className={styles.topPageButton}>トップページに戻る</button>
        </Link>

        <div className={styles.center}>
          <h1>進捗管理</h1>
        </div>

        <div className={styles.searchDelete}>
          <SearchForm search={search} setSearch={setSearch} />

          <Link className={styles.deleteIconLink} href="/childDelete">
            <DeleteIcon className={styles.deleteIcon} />
          </Link>
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

      <div className={styles.reservationPagination}>
        <Pagination
          totalItems={filteredPosts.length}
          itemsPerPage={itemsPerPage}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </>
  );
};

export default Reservation;
