import React from "react";
import styles from "../ConfirmationTable/page.module.css";

type Props = {
  handleBulkDelete: () => void;
  handleToggleAll: () => void;
  isAllSelected: boolean;
};

const ConfirmationTable: React.FC<Props> = ({
  handleBulkDelete,
  handleToggleAll,
  isAllSelected,
}) => {
  return (
    <thead>
      <tr className={styles.subTitle}>
        <th colSpan={9}>
        <button className={styles.delete} onClick={handleBulkDelete}>
            削除
          </button>

          <button className={styles.selectAll} onClick={handleToggleAll}>
            {isAllSelected ? "全て解除" : "全て選択"}
          </button>
        </th>
      </tr>
      <tr className={styles.subTitle}>
        <th>選択</th>
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

export default ConfirmationTable;
