"use client";

import Link from "next/link";
import React from "react";
import { LotProcessBalance, ReservationRowProps } from "@/app/type";
import styles from "./page.module.css";

type ProcessGroup = {
  label: "manufacturing" | "cleaning" | "inspection" | "measurement" | "packaging";
  processOrder: number;
  names: string[];
};

const processGroups: ProcessGroup[] = [
  { label: "manufacturing", processOrder: 1, names: ["製造", "プレス"] },
  { label: "cleaning", processOrder: 2, names: ["洗浄", "メッキ", "外注"] },
  { label: "inspection", processOrder: 3, names: ["検査", "品質"] },
  { label: "measurement", processOrder: 4, names: ["計量"] },
  { label: "packaging", processOrder: 5, names: ["梱包", "包装"] },
];

const cellClassMap: Record<ProcessGroup["label"], string> = {
  manufacturing: styles.manufacturingCell,
  cleaning: styles.cleaningCell,
  inspection: styles.inspectionCell,
  measurement: styles.measurementCell,
  packaging: styles.packagingCell,
};

const amountClassMap: Record<ProcessGroup["label"], string> = {
  manufacturing: styles.manufacturingAmountCell,
  cleaning: styles.cleaningAmountCell,
  inspection: styles.inspectionAmountCell,
  measurement: styles.measurementAmountCell,
  packaging: styles.packagingAmountCell,
};

const dateClassMap: Record<ProcessGroup["label"], string> = {
  manufacturing: styles.averageCell,
  cleaning: styles.cleaningAverageCell,
  inspection: styles.inspectionAverageCell,
  measurement: styles.measurementAverageCell,
  packaging: styles.packagingAverageCell,
};

const formatAmount = (value?: number) =>
  Number(value || 0).toLocaleString("ja-JP");

const formatAdjustmentAmount = (value?: number) =>
  `-${formatAmount(value)}個`;

const matchesProcessGroup = (
  balance: LotProcessBalance,
  group: ProcessGroup,
) => {
  if (balance.processOrder === group.processOrder) {
    return true;
  }

  return group.names.some((name) => balance.processName.includes(name));
};

const getGroupBalances = (
  balances: LotProcessBalance[],
  group: ProcessGroup,
) =>
  balances
    .filter((balance) => matchesProcessGroup(balance, group))
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
) => {
  if (values.length === 0) {
    return <div className={className}>{emptyValue}</div>;
  }

  return values.map((value, index) => (
    <div key={index} className={className}>
      {value || emptyValue}
    </div>
  ));
};

const isOutsourceBalance = (balance: LotProcessBalance) =>
  Boolean(balance.subcontractorName) ||
  balance.processName.includes("外注") ||
  balance.processName.includes("メッキ");

const renderProcessLot = (
  balance: LotProcessBalance,
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
    {isOutsourceBalance(balance) && (
      <span className={styles.outsourceBadge}>
        外注: {balance.processName || balance.subcontractorName || "-"}
      </span>
    )}
    {handleTransferLot && balance.processOrder > 1 && balance.quantity > 0 && (
      <button
        type="button"
        className={styles.transferButton}
        onClick={() => void handleTransferLot(balance)}
      >
        次工程へ移動
      </button>
    )}
    {handleEditLotBalance && balance.processOrder > 1 && balance.quantity > 0 && (
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

const getLatestLogDate = (logs?: { date: string; amount: number }[]) =>
  [...(logs || [])]
    .filter((log) => log.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date || "";

const getDateByGroup = (
  post: ReservationRowProps["post"],
  group: ProcessGroup,
) => {
  if (group.label === "manufacturing") {
    return getLatestLogDate(post.manufacturingLogs);
  }
  if (group.label === "cleaning") {
    return getLatestLogDate(post.cleaningLogs);
  }
  if (group.label === "inspection") {
    return getLatestLogDate(post.inspectionLogs);
  }
  if (group.label === "measurement") {
    return getLatestLogDate(post.measurementLogs);
  }

  return getLatestLogDate(post.packagingLogs);
};

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
}) => {
  const balances = post.lotProcessBalances || [];
  const totalInProcessAmount = balances.reduce(
    (total, balance) => total + Number(balance.quantity || 0),
    0,
  );
  const allocatedAmount = Number(post.allocatedAmount || 0);
  const quantityAdjustmentAmount = Number(post.quantityAdjustmentAmount || 0);
  const remainingInProcessAmount =
    totalInProcessAmount +
    allocatedAmount +
    quantityAdjustmentAmount -
    Number(post.orderAmount || 0);
  const completedProcessCount = processGroups.filter(
    (group) => getGroupBalances(balances, group).length > 0,
  ).length;
  const processProgress = Math.round(
    (completedProcessCount / processGroups.length) * 100,
  );
  const quantityProgress =
    post.orderAmount > 0
      ? Math.min(
          100,
          Math.round((totalInProcessAmount / Number(post.orderAmount || 1)) * 100),
        )
      : 0;
  const deliveryClass = getDeliveryClass(post.deliveryDate);

  return (
    <tr className={`${styles.reservationText} ${styles.reservationRow}`}>
      <td>{post.orderNo}</td>
      <td>{post.customerName}</td>
      <td className={styles.productName}>
        <Link href={`/progress/${post.id}`}>{post.productName}</Link>
      </td>
      <td className={styles.orderAmountCell}>{formatAmount(post.orderAmount)}</td>
      <td>
        <Link
          className={`${styles.deliveryLink} ${deliveryClass}`}
          href={`/productionResults?orderNo=${encodeURIComponent(post.orderNo)}`}
        >
          {post.deliveryDate || "-"}
        </Link>
      </td>

      {processGroups.map((group) => {
        const groupBalances = getGroupBalances(balances, group);
        const groupDate = getDateByGroup(post, group);

        return (
          <React.Fragment key={group.label}>
            <td className={cellClassMap[group.label]}>
              {renderRows(
                groupBalances.map((balance) =>
                  renderProcessLot(
                    balance,
                    handleTransferLot,
                    handleEditLotBalance,
                  ),
                ),
                styles.logRow,
              )}
            </td>
            <td className={amountClassMap[group.label]}>
              {renderRows(
                groupBalances.map((balance) => formatAmount(balance.quantity)),
                styles.amountRow,
                "0",
              )}
            </td>
            <td className={dateClassMap[group.label]}>
              {renderRows(groupDate ? [groupDate] : [], styles.averageRow)}
            </td>
          </React.Fragment>
        );
      })}

      <td className={styles.totalCell}>{formatAmount(totalInProcessAmount)}</td>
      <td className={styles.stockCell}>{formatAmount(post.inventoryAmount)}</td>
      <td className={styles.stockCell}>{formatAmount(allocatedAmount)}</td>
      <td className={styles.stockCell}>
        <span className={styles.remainingAmountValue}>
          {formatAmount(remainingInProcessAmount)}
        </span>
        {quantityAdjustmentAmount > 0 && (
          <span className={styles.adjustmentAmountValue}>
            {formatAdjustmentAmount(quantityAdjustmentAmount)}
          </span>
        )}
      </td>

      <td>
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

      <td>
        <div className={styles.progressArea}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${quantityProgress}%` }}
            />
            <span className={styles.progressText}>{quantityProgress}%</span>
          </div>
        </div>
      </td>

      <td>{post.remark || "-"}</td>

      <td>
        <Link
          className={styles.editButton}
          href={`/productionResults?orderNo=${encodeURIComponent(post.orderNo)}`}
        >
          製造実績
        </Link>
        <button className={styles.deleteButton} onClick={handleDelete}>
          削除
        </button>
      </td>
    </tr>
  );
};

export default ReservationList;
