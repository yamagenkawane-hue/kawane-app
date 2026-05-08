import React from "react";
import styles from "./page.module.css";
import Link from "next/link";
import { Day, ReservationRowProps } from "@/app/type";
import { useCalculateAmount } from "../../utills/useCalculateAmount";

const ReservationList: React.FC<ReservationRowProps> = ({
  post,
  postIndex,
  editingRow,
  editStartTime,
  editEndTime,
  setEditStartTime,
  setEditEndTime,
  handleEdit,
  handleSave,
  handleDelete,
  handleCancel,
}) => {
  const isEditing = (dayIndex: number) =>
    editingRow?.postId === post.id && editingRow?.dayIndex === dayIndex;

  const renderTimeInput = (
    value: string,
    onChange: (value: string) => void,
    min?: string
  ) => (
    <input
      className={styles.reservationInput}
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={min}
    />
  );

  const { calculateAmount } = useCalculateAmount();

  return (
    <>
      {post.days.map((day, dayIndex) => (
        <tr key={dayIndex} className={styles.reservationText}>
          <td>
            <Link className={styles.childName} href={`/childName/${day.name}`}>
              {day.name}
            </Link>
          </td>
          <td>{day.class}</td>
          <td>{day.date}</td>
          <td>{day.startTime}</td>
          <td>{day.endTime}</td>
          <td>
            {isEditing(dayIndex)
              ? renderTimeInput(editStartTime, setEditStartTime)
              : day.realStartTime}
          </td>
          <td>
            {isEditing(dayIndex)
              ? renderTimeInput(editEndTime, setEditEndTime, editStartTime)
              : day.realEndTime}
          </td>
          <td>
  {calculateAmount(day.realStartTime ?? "", day.realEndTime ?? "",day.class)} 円
</td>

          <td>{day.remark}</td>
          <td>
            {isEditing(dayIndex) ? (
              <>
                <button className={styles.saveButton} onClick={handleSave}>
                  保存
                </button>
                <button
                  className={styles.deleteButton}
                  onClick={() => handleDelete(postIndex)}
                >
                  削除
                </button>
                <button className={styles.cancelButton} onClick={handleCancel}>
                  キャンセル
                </button>
              </>
            ) : (
              <button
                className={styles.editButton}
                onClick={() => handleEdit(post.id, dayIndex)}
              >
                編集
              </button>
            )}
          </td>
        </tr>
      ))}
    </>
  );
};

export default ReservationList;
