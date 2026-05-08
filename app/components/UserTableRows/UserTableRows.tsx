import React from "react";
import styles from "./page.module.css";
import { EditData, UserTableRowsProps } from "@/app/type";

const UserTableRows: React.FC<UserTableRowsProps> = ({
  filteredPosts,
  editingRow,
  editData,
  setEditData,
  handleEdit,
  handleSave,
  handleDelete,
  setEditingRow,
}) => (
  <tbody>
    {filteredPosts.map((post, postIndex) => (
      <React.Fragment key={postIndex}>
        {post.days.map((day, dayIndex) => {
          const isEditing =
            editingRow?.postIndex === postIndex &&
            editingRow?.dayIndex === dayIndex;

          return (
            <tr key={dayIndex}>
              <td>{day.name}</td>
              <td>{day.class}</td>
              <td>
                {isEditing ? (
                  <input
                    type="date"
                    value={editData.date}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        date: e.target.value,
                      })
                    }
                  />
                ) : (
                  day.date
                )}
              </td>
              {isEditing ? (
                <>
                  {["startTime", "endTime", "remark"].map((field, idx) => (
                    <td key={idx}>
                      <input
                        type={field === "remark" ? "text" : "time"}
                        value={editData[field as keyof EditData]}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            [field]: e.target.value,
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <button className={styles.usersSave} onClick={handleSave}>
                      保存
                    </button>
                    <button
                      className={styles.usersCancel}
                      onClick={() => setEditingRow(null)}
                    >
                      キャンセル
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td>{day.startTime}</td>
                  <td>{day.endTime}</td>
                  <td>{day.remark}</td>
                  <td>
                    {new Date(day.date) > new Date() && (
                      <>
                        <button
                          className={styles.usersEdit}
                          onClick={() => handleEdit(postIndex, dayIndex)}
                        >
                          編集
                        </button>
                        <button
                          className={styles.usersDelete}
                          onClick={() => handleDelete(post)}
                        >
                          取り消し
                        </button>
                      </>
                    )}
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </React.Fragment>
    ))}
  </tbody>
);

export default UserTableRows;
