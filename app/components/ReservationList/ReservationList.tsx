"use client";
import { useAppAuth } from "@/app/components/AuthProvider/AuthProvider";

import Link from "next/link";
import React from "react";
import { LotProcessBalance, ReservationRowProps } from "@/app/type";
import styles from "./page.module.css";
import { getProcessKind, getProgressDisplayGroup, getWeightedProcessProgress, isCompletionProcess, isOutsourceProcess } from "@/lib/progressProcess";

type ProcessGroup = { label: "manufacturing" | "cleaning" | "inspection" | "measurement" };
const processGroups: ProcessGroup[] = [
  {label: "manufacturing"}, {label: "cleaning"}, {label: "inspection"}, {label: "measurement"},
];

const cellClassMap: Record<ProcessGroup["label"], string> = {
  manufacturing: styles.manufacturingCell,
  cleaning: styles.cleaningCell,
  inspection: styles.inspectionCell,
  measurement: styles.measurementCell,
};

const amountClassMap: Record<ProcessGroup["label"], string> = {
  manufacturing: styles.manufacturingAmountCell,
  cleaning: styles.cleaningAmountCell,
  inspection: styles.inspectionAmountCell,
  measurement: styles.measurementAmountCell,
};

const formatAmount = (value?: number) =>
  Number(value || 0).toLocaleString("ja-JP");

const formatAdjustmentAmount = (value?: number) =>
  `-${formatAmount(value)}個`;

const getGroupBalances = (
  balances: LotProcessBalance[],
  group: ProcessGroup,
) =>
  balances
    .filter((balance) => !balance.isHistoryOnly && !balance.isCompleted && balance.quantity > 0 &&
      getProgressDisplayGroup(balance) === group.label)
    .sort(
      (a, b) =>
        a.processOrder - b.processOrder ||
        a.lotNo.localeCompare(b.lotNo, "ja", { numeric: true }) ||
        a.materialLotNo.localeCompare(b.materialLotNo, "ja", {
          numeric: true,
        }) ||
        a.lotId.localeCompare(b.lotId),
    );

const renderRows = (
  values: React.ReactNode[],
  className: string,
  emptyValue = "-",
  getRowClassName?: (index: number) => string,
) => {
  if (values.length === 0) {
    return <div className={className}>{emptyValue}</div>;
  }

  return values.map((value, index) => (
    <div
      key={index}
      className={`${className} ${getRowClassName?.(index) || ""}`}
    >
      {value || emptyValue}
    </div>
  ));
};

const hasLotActionButtons = (balance: LotProcessBalance) =>
  !balance.isCompleted &&
  !balance.isHistoryOnly &&
  (isOutsourceProcess(balance) || getProcessKind(balance) !== "manufacturing") &&
  balance.quantity > 0;

const hasLotDetailLines = (balance: LotProcessBalance) =>
  Boolean(balance.materialLotNo) ||
  isOutsourceProcess(balance) ||
  Boolean(balance.isCompleted);

const getBalanceRowClassName = (balance?: LotProcessBalance) => {
  if (!balance) {
    return "";
  }

  if (hasLotActionButtons(balance)) {
    return styles.actionLogRow;
  }

  if (hasLotDetailLines(balance)) {
    return styles.detailLogRow;
  }

  return "";
};

const renderProcessLot = (
  balance: LotProcessBalance,
  orderNo: string,
  handleTransferLot?: (balance: LotProcessBalance) => Promise<void>,
  handleEditLotBalance?: (balance: LotProcessBalance) => Promise<void>,
) => (
  <span className={styles.lotLabel}>
    <span>{balance.lotNo || "-"}</span>
    {balance.materialLotNo && (
      <span className={styles.materialLotLabel}>
        材料: {balance.materialLotNo}
      </span>
    )}
    {isOutsourceProcess(balance) && (
      <Link
        className={styles.outsourceBadge}
        href={`/outsourcing?orderNo=${encodeURIComponent(
          balance.orderNo || orderNo,
        )}&returnTo=reservation`}
      >
        外注: {balance.processName || balance.subcontractorName || "-"}
      </Link>
    )}
    {balance.isCompleted && (
      <span className={styles.completedBadge}>完了</span>
    )}
    {handleTransferLot &&
      hasLotActionButtons(balance) && (
      <button
        type="button"
        className={styles.transferButton}
        onClick={() => void handleTransferLot(balance)}
      >
        {isCompletionProcess(balance) ? "完了" : "次工程へ移動"}
      </button>
    )}
    {handleEditLotBalance &&
      hasLotActionButtons(balance) && (
      <button
        type="button"
        className={styles.editQuantityButton}
        onClick={() => void handleEditLotBalance(balance)}
      >
        数量編集
      </button>
    )}
  </span>
);

const getDeliveryClass = (deliveryDate: string) => {
  if (!deliveryDate) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivery = new Date(deliveryDate);
  delivery.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diff <= 3) return styles.danger;
  if (diff <= 7) return styles.warning;
  return "";
};

const ReservationList: React.FC<ReservationRowProps> = ({
  post,
  handleDelete,
  handleTransferLot,
  handleEditLotBalance,
  showGroupedCustomerProduct = true,
  customerProductRowSpan = 1,
  showGroupedProgressTotals = true,
  progressTotalsRowSpan = 1,
  progressGroupSummary,
  isLastInCustomerProductGroup = true,
}) => {
  const {profile}=useAppAuth();
  const canManage=Boolean(profile?.manager);
  const balances = (post.lotProcessBalances || []).filter(balance => !balance.isHistoryOnly && !balance.isCompleted && balance.quantity > 0);
  const totalInProcessAmount = balances.reduce(
    (total, balance) =>
      balance.isHistoryOnly ? total : total + Number(balance.quantity || 0),
    0,
  );
  const displayTotalInProcessAmount =
    progressGroupSummary?.totalInProcessAmount ?? (totalInProcessAmount + Number(post.inventoryAmount || 0));
  const displayOrderAmount =
    progressGroupSummary?.orderAmount ?? Math.max(0, Number(post.orderAmount || 0) - Number(post.shippedAmount || 0));
  const displayInventoryAmount =
    progressGroupSummary?.inventoryAmount ?? Number(post.inventoryAmount || 0);
  const quantityAdjustmentAmount =
    progressGroupSummary?.quantityAdjustmentAmount ??
    Number(post.quantityAdjustmentAmount || 0);
  const remainingInProcessAmount =
    displayTotalInProcessAmount - displayOrderAmount;
  const processProgress =
    progressGroupSummary?.processProgress ??
    getWeightedProcessProgress([...balances, { quantity: displayInventoryAmount, isCompleted: true }], displayOrderAmount);
  const deliveryClass = getDeliveryClass(post.deliveryDate);

  return (
    <tr
      className={`${styles.reservationText} ${styles.reservationRow} ${
        isLastInCustomerProductGroup ? "" : styles.groupContinuationRow
      }`}
    >
      <td className={styles.orderNoCell}>
        <Link className={styles.orderDetailLink} href={`/progress/${post.id}`}>
          {post.orderNo}
        </Link>
      </td>
      {showGroupedCustomerProduct && (
        <>
          <td
            className={`${styles.groupedCustomerCell} ${styles.customerCell}`}
            rowSpan={customerProductRowSpan}
          >
            {post.customerName}
          </td>
          <td
            className={`${styles.productName} ${styles.groupedProductCell}`}
            rowSpan={customerProductRowSpan}
          >
            {post.productName}
          </td>
        </>
      )}
      <td className={styles.orderAmountCell}>{formatAmount(post.orderAmount)}</td>
      <td className={styles.deliveryCell}>
        <Link
          className={`${styles.deliveryLink} ${deliveryClass}`}
          href={`/productionResults?orderNo=${encodeURIComponent(post.orderNo)}`}
        >
          {post.deliveryDate || "-"}
        </Link>
      </td>

      {processGroups.map((group) => {
        const groupBalances = getGroupBalances(balances, group);
        const getGroupRowClassName = (index: number) =>
          getBalanceRowClassName(groupBalances[index]);

        return (
          <React.Fragment key={group.label}>
            <td className={cellClassMap[group.label]}>
              {renderRows(
                groupBalances.map((balance) =>
                  renderProcessLot(
                    balance,
                    post.orderNo,
                    handleTransferLot,
                    handleEditLotBalance,
                  ),
                ),
                styles.logRow,
                "-",
                getGroupRowClassName,
              )}
            </td>
            <td className={amountClassMap[group.label]}>
              {renderRows(
                groupBalances.map((balance) => formatAmount(balance.quantity)),
                styles.amountRow,
                "0",
                getGroupRowClassName,
              )}
            </td>
          </React.Fragment>
        );
      })}

      {showGroupedProgressTotals && (
        <>
          <td className={styles.stockCell} rowSpan={progressTotalsRowSpan}>
            <Link href="/shipping">{formatAmount(displayInventoryAmount)}</Link>
          </td>
          <td className={styles.totalCell} rowSpan={progressTotalsRowSpan}>
            {formatAmount(displayTotalInProcessAmount)}
          </td>
          <td className={styles.stockCell} rowSpan={progressTotalsRowSpan}>
            <span className={styles.remainingAmountValue}>
              {formatAmount(remainingInProcessAmount)}
            </span>
            {quantityAdjustmentAmount > 0 && (
              <span className={styles.adjustmentAmountValue}>
                {formatAdjustmentAmount(quantityAdjustmentAmount)}
              </span>
            )}
          </td>
        </>
      )}

      {showGroupedProgressTotals && (
        <td className={styles.progressCell} rowSpan={progressTotalsRowSpan}>
          <div className={styles.progressArea}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${processProgress}%` }}
              />
              <span className={styles.progressText}>{processProgress}%</span>
            </div>
          </div>
        </td>
      )}

      <td>{post.remark || "-"}</td>

      <td>
        <button className={styles.deleteButton} onClick={handleDelete} disabled={!canManage} title={!canManage?"管理者のみ操作できます":undefined}>
          誤登録取消
        </button>
      </td>
    </tr>
  );
};

export default ReservationList;
