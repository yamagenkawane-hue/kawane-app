import React from "react";

import styles from "./page.module.css";

const TableHeader = () => {
  return (
    <thead>
      <tr className={styles.headerTop}>
        <th rowSpan={2} className={styles.orderHeader}>
          注番
        </th>

        <th rowSpan={2} className={styles.orderHeader}>
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

        <th colSpan={3} className={styles.processHeader}>
          製造
        </th>

        <th colSpan={3} className={styles.processHeader}>
          洗浄
        </th>

        <th colSpan={3} className={styles.processHeader}>
          検査
        </th>

        <th colSpan={3} className={styles.processHeader}>
          計量
        </th>

        <th colSpan={3} className={styles.processHeader}>
          梱包
        </th>

        <th rowSpan={2} className={styles.totalHeader}>
          合計
        </th>

        <th rowSpan={2} className={styles.stockHeader}>
          在庫数
        </th>

        <th rowSpan={2} className={styles.stockHeader}>
          引当数
        </th>

        <th rowSpan={2} className={styles.stockHeader}>
          残数
        </th>

        <th rowSpan={2} className={styles.progressHeader}>
          工程進捗
        </th>

        <th rowSpan={2} className={styles.progressHeader}>
          数量進捗
        </th>

        <th rowSpan={2} className={styles.remarkHeader}>
          備考
        </th>

        <th rowSpan={2} className={styles.buttonHeader}>
          操作
        </th>
      </tr>

      <tr className={styles.headerBottom}>
        <th>ロット</th>
        <th>数量</th>
        <th>日付</th>

        <th>ロット</th>
        <th>数量</th>
        <th>日付</th>

        <th>ロット</th>
        <th>数量</th>
        <th>日付</th>

        <th>ロット</th>
        <th>数量</th>
        <th>日付</th>

        <th>ロット</th>
        <th>数量</th>
        <th>日付</th>
      </tr>
    </thead>
  );
};

export default TableHeader;
