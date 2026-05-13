import React from "react";
import styles from "./page.module.css";

const TableHeader: React.FC = () => {
  return (
    <thead>
      <tr className={styles.subTitle}>
        <th>製品名</th>
        <th>製造</th>
        <th>洗浄</th>
        <th>検査</th>
        <th>測量</th>
        <th>梱包</th>
        <th>納期</th>
        <th>備考</th>
      </tr>
    </thead>
  );
};

export default TableHeader;
