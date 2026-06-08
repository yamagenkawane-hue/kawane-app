"use client";

type ConfirmationTableProps = {
  handleBulkDelete: () => Promise<void>;
  handleToggleAll: () => void;
  isAllSelected: boolean;
};

export default function ConfirmationTable({
  handleBulkDelete,
  handleToggleAll,
  isAllSelected,
}: ConfirmationTableProps) {
  return (
    <thead>
      <tr>
        <th>
          <input
            aria-label="全選択"
            checked={isAllSelected}
            onChange={handleToggleAll}
            type="checkbox"
          />
        </th>
        <th>日付</th>
        <th>工程</th>
        <th>注番</th>
        <th>ロットNo</th>
        <th>製品名</th>
        <th>得意先</th>
        <th>
          <button type="button" onClick={() => void handleBulkDelete()}>
            選択削除
          </button>
        </th>
      </tr>
    </thead>
  );
}
