import React from "react";
import styles from "./page.module.css";

const TableHeader: React.FC = () => {
  return (
    <thead>
      <tr className={styles.subTitle}>
        <th>園児名</th>
        <th>クラス</th>
        <th>日にち</th>
        <th>延長開始時間</th>
        <th>お迎え時間</th>
        <th>開始時間</th>
        <th>終了時間</th>
        <th>金額</th>
        <th>備考</th>
      </tr>
    </thead>
  );
};

export default TableHeader;
