import React from "react";

import styles from "./page.module.css";

const TableHeader = () => {
  return (
    <thead>
      {/* 上段 */}
      <tr className={styles.headerTop}>
        <th rowSpan={2} className={styles.orderHeader}>
          注番
        </th>

        <th rowSpan={2} className={styles.orderHeader}>
          ロットNo
        </th>

        <th rowSpan={2} className={styles.productHeader}>
          製品名
        </th>

        <th rowSpan={2} className={styles.customerHeader}>
          得意先
        </th>

        <th rowSpan={2}>受注数量</th>

        {/* 製造 */}
        <th colSpan={3} className={styles.processHeader}>
          製造
        </th>

        {/* 洗浄 */}
        <th colSpan={3} className={styles.processHeader}>
          洗浄
        </th>

        {/* 検査 */}
        <th colSpan={3} className={styles.processHeader}>
          検査
        </th>

        {/* 測量 */}
        <th colSpan={3} className={styles.processHeader}>
          測量
        </th>

        {/* 梱包 */}
        <th colSpan={3} className={styles.processHeader}>
          梱包
        </th>

        <th rowSpan={2} className={styles.remainingHeader}>
          注残
        </th>

        <th rowSpan={2} className={styles.progressHeader}>
          工程進捗
        </th>

        <th rowSpan={2} className={styles.progressHeader}>
          数量進捗
        </th>

        <th rowSpan={2} className={styles.statusHeader}>
          状態
        </th>

        <th rowSpan={2} className={styles.delayHeader}>
          遅延
        </th>

        <th rowSpan={2} className={styles.deliveryHeader}>
          納期
        </th>

        <th rowSpan={2} className={styles.remarkHeader}>
          備考
        </th>

        <th rowSpan={2} className={styles.buttonHeader}>
          操作
        </th>
      </tr>

      {/* 下段 */}
      <tr className={styles.headerBottom}>
        {/* 製造 */}
        <th>日付</th>
        <th>数量</th>
        <th>累計</th>

        {/* 洗浄 */}
        <th>日付</th>
        <th>数量</th>
        <th>累計</th>

        {/* 検査 */}
        <th>日付</th>
        <th>数量</th>
        <th>累計</th>

        {/* 測量 */}
        <th>日付</th>
        <th>数量</th>
        <th>累計</th>

        {/* 梱包 */}
        <th>日付</th>
        <th>数量</th>
        <th>累計</th>
      </tr>
    </thead>
  );
};

export default TableHeader;
