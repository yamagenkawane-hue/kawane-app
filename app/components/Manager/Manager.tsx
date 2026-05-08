import React from "react";
import styles from "./page.module.css";
import { UserRowProps } from "@/app/type";

const Manager: React.FC<UserRowProps> = ({
  user,
  editingUserId,
  editedUser,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onInputChange,
  onCheckboxChange,
}) => {
  const isEditing = editingUserId === user.id;

  return (
    <tr key={user.id}>
      <td className={styles.text}>
        {isEditing ? (
          <input
            className={styles.text}
            type="text"
            name="name"
            value={editedUser.name}
            onChange={onInputChange}
          />
        ) : (
          user.name
        )}
      </td>
      <td className={styles.text}>
        {isEditing ? (
          <input
            className={styles.text}
            type="text"
            name="pass"
            value={editedUser.pass}
            onChange={onInputChange}
          />
        ) : (
          user.pass
        )}
      </td>
      <td>
        <input
          className={styles.checkBox}
          type="checkbox"
          checked={isEditing ? editedUser.manager : user.manager}
          onChange={isEditing ? onCheckboxChange : undefined}
          readOnly={!isEditing}
        />
      </td>
      <td className={styles.tableLine}>
        {isEditing ? (
          <>
            <button
              className={styles.managerSave}
              onClick={() => onSave(user.id)}
            >
              保存
            </button>
            <button className={styles.managerCancel} onClick={onCancel}>
              キャンセル
            </button>
          </>
        ) : (
          <>
            <button className={styles.managerEdit} onClick={() => onEdit(user)}>
              変更
            </button>
            <button
              className={styles.managerDelete}
              onClick={() => onDelete(user.id)}
            >
              削除
            </button>
          </>
        )}
      </td>
    </tr>
  );
};

export default Manager;
