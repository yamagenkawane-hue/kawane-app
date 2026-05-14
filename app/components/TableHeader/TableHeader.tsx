import React from "react";

import styles from "./page.module.css";

const TableHeader = () => {
  return (
    <thead>
      {/* 1段目 */}
      <tr className={styles.headerTop}>
        <th rowSpan={2}>注番</th>

        <th rowSpan={2}>製品名</th>

        <th rowSpan={2}>得意先</th>

        <th rowSpan={2}>受注数量</th>

        {/* 製造 */}
        <th colSpan={2}>製造</th>

        {/* 洗浄 */}
        <th colSpan={2}>洗浄</th>

        {/* 検査 */}
        <th colSpan={2}>検査</th>

        {/* 測量 */}
        <th colSpan={2}>測量</th>

        {/* 梱包 */}
        <th colSpan={2}>梱包</th>

        {/* その他 */}
        <th rowSpan={2}>注残</th>

        <th rowSpan={2}>工程進捗</th>

        <th rowSpan={2}>数量進捗</th>

        <th rowSpan={2}>状態</th>

        <th rowSpan={2}>遅延</th>

        <th rowSpan={2}>納期</th>

        <th rowSpan={2}>備考</th>

        <th rowSpan={2}>操作</th>
      </tr>

      {/* 2段目 */}
      <tr className={styles.headerBottom}>
        {/* 製造 */}
        <th>日付</th>
        <th>数量</th>

        {/* 洗浄 */}
        <th>日付</th>
        <th>数量</th>

        {/* 検査 */}
        <th>日付</th>
        <th>数量</th>

        {/* 測量 */}
        <th>日付</th>
        <th>数量</th>

        {/* 梱包 */}
        <th>日付</th>
        <th>数量</th>
      </tr>
    </thead>
  );
};

export default TableHeader;
