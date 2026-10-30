import React from "react";

import styles from "./page.module.css";

const TableHeader = () => {
  return (
    <thead>
      <tr className={styles.headerTop}>
        <th rowSpan={2} className={styles.orderHeader}>
          注番
        </th>

        <th rowSpan={2} className={styles.customerHeader}>
          得意先
        </th>

        <th rowSpan={2} className={styles.productHeader}>
          製品名
        </th>

        <th rowSpan={2} className={styles.orderAmountHeader}>
          受注数量
        </th>

        <th rowSpan={2} className={styles.deliveryHeader}>
          納期
        </th>

        <th colSpan={2} className={styles.processHeader}>
          製造
        </th>

        <th colSpan={2} className={styles.processHeader}>
          洗浄・外注
        </th>

        <th colSpan={2} className={styles.processHeader}>
          検査
        </th>

        <th colSpan={2} className={styles.processHeader}>
          計量
        </th>

        <th rowSpan={2} className={styles.stockHeader}>
          梱包在庫
        </th>

        <th rowSpan={2} className={styles.totalHeader}>
          在庫合計
        </th>

        <th rowSpan={2} className={styles.stockHeader}>
          残数
        </th>

        <th rowSpan={2} className={styles.progressHeader}>
          工程進捗
        </th>

        <th rowSpan={2} className={styles.remarkHeader}>
          備考
        </th>

        <th rowSpan={2} className={styles.buttonHeader}>
          操作
        </th>
      </tr>

      <tr className={styles.headerBottom}>
        <th className={styles.lotHeader}>ロット</th>
        <th className={styles.amountHeader}>数量</th>

        <th className={styles.lotHeader}>ロット</th>
        <th className={styles.amountHeader}>数量</th>

        <th className={styles.lotHeader}>ロット</th>
        <th className={styles.amountHeader}>数量</th>

        <th className={styles.lotHeader}>ロット</th>
        <th className={styles.amountHeader}>数量</th>

      </tr>
    </thead>
  );
};

export default TableHeader;
