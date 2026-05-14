"use client";

import React, { useState } from "react";

import { doc, updateDoc } from "firebase/firestore";

import styles from "./page.module.css";

import db from "../../../lib/firebase";

import { ReservationRowProps } from "@/app/type";

const ReservationList: React.FC<ReservationRowProps> = ({
  post,
  handleDelete,
}) => {
  // 編集状態
  const [isEdit, setIsEdit] = useState(false);

  // =========================
  // 製造
  // =========================
  const [manufacturingDate, setManufacturingDate] = useState(
    post.manufacturingDate || "",
  );

  const [manufacturingAmount, setManufacturingAmount] = useState<number | "">(
    post.manufacturingAmount || "",
  );

  // =========================
  // 洗浄
  // =========================
  const [cleaningDate, setCleaningDate] = useState(post.cleaningDate || "");

  const [cleaningAmount, setCleaningAmount] = useState<number | "">(
    post.cleaningAmount || "",
  );

  // =========================
  // 検査
  // =========================
  const [inspectionDate, setInspectionDate] = useState(
    post.inspectionDate || "",
  );

  const [inspectionAmount, setInspectionAmount] = useState<number | "">(
    post.inspectionAmount || "",
  );

  // =========================
  // 測量
  // =========================
  const [measurementDate, setMeasurementDate] = useState(
    post.measurementDate || "",
  );

  const [measurementAmount, setMeasurementAmount] = useState<number | "">(
    post.measurementAmount || "",
  );

  // =========================
  // 梱包
  // =========================
  const [packagingDate, setPackagingDate] = useState(post.packagingDate || "");

  const [packagingAmount, setPackagingAmount] = useState<number | "">(
    post.packagingAmount || "",
  );

  // =========================
  // 保存
  // =========================
  const handleSave = async () => {
    try {
      // 空対策
      const manufacturing = Number(manufacturingAmount) || 0;

      const cleaning = Number(cleaningAmount) || 0;

      const inspection = Number(inspectionAmount) || 0;

      const measurement = Number(measurementAmount) || 0;

      const packaging = Number(packagingAmount) || 0;

      // 注残
      const remainingAmount = post.orderAmount - packaging;

      // =========================
      // 状態
      // =========================
      let status = "未着手";

      if (packaging >= post.orderAmount && post.orderAmount > 0) {
        status = "出荷完了";
      } else if (packaging > 0) {
        status = "梱包中";
      } else if (measurement > 0) {
        status = "測量中";
      } else if (inspection > 0) {
        status = "検査中";
      } else if (cleaning > 0) {
        status = "洗浄中";
      } else if (manufacturing > 0) {
        status = "製造中";
      }

      // 更新
      await updateDoc(doc(db, "posts", post.id), {
        manufacturingDate,

        manufacturingAmount: manufacturing,

        cleaningDate,

        cleaningAmount: cleaning,

        inspectionDate,

        inspectionAmount: inspection,

        measurementDate,

        measurementAmount: measurement,

        packagingDate,

        packagingAmount: packaging,

        remainingAmount,

        status,

        updatedAt: new Date().toISOString(),

        updatedBy: "admin",
      });

      alert("更新しました");

      setIsEdit(false);

      window.location.reload();
    } catch (error) {
      console.error("更新失敗", error);

      alert("更新に失敗しました");
    }
  };

  // =========================
  // 工程進捗
  // =========================
  let completedProcess = 0;

  if (Number(manufacturingAmount) > 0) {
    completedProcess++;
  }

  if (Number(cleaningAmount) > 0) {
    completedProcess++;
  }

  if (Number(inspectionAmount) > 0) {
    completedProcess++;
  }

  if (Number(measurementAmount) > 0) {
    completedProcess++;
  }

  if (Number(packagingAmount) > 0) {
    completedProcess++;
  }

  const processProgress = Math.floor((completedProcess / 5) * 100);

  // =========================
  // 数量進捗
  // =========================
  const quantityProgress =
    post.orderAmount > 0
      ? Math.floor((Number(packagingAmount) / post.orderAmount) * 100)
      : 0;

  // =========================
  // 遅延判定
  // =========================
  const start = new Date(manufacturingDate || new Date());

  const end = new Date(post.deliveryDate);

  const today = new Date();

  const total = end.getTime() - start.getTime();

  const passed = today.getTime() - start.getTime();

  const timeProgress = total > 0 ? (passed / total) * 100 : 0;

  const isDelay = quantityProgress < timeProgress;

  return (
    <tr className={styles.reservationText}>
      {/* 注番 */}
      <td>{post.orderNo}</td>

      {/* 製品名 */}
      <td className={styles.productName}>{post.productName}</td>

      {/* 得意先 */}
      <td>{post.customerName}</td>

      {/* 受注数量 */}
      <td>{post.orderAmount}</td>

      {/* =========================
          製造
      ========================= */}
      <td className={styles.manufacturingCell}>
        {isEdit ? (
          <input
            type="date"
            value={manufacturingDate}
            onChange={(e) => setManufacturingDate(e.target.value)}
          />
        ) : (
          manufacturingDate
        )}
      </td>

      <td className={styles.manufacturingAmountCell}>
        {isEdit ? (
          <input
            type="number"
            value={manufacturingAmount}
            onChange={(e) =>
              setManufacturingAmount(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          />
        ) : (
          manufacturingAmount
        )}
      </td>

      {/* =========================
          洗浄
      ========================= */}
      <td className={styles.cleaningCell}>
        {isEdit ? (
          <input
            type="date"
            value={cleaningDate}
            onChange={(e) => setCleaningDate(e.target.value)}
          />
        ) : (
          cleaningDate
        )}
      </td>

      <td className={styles.cleaningAmountCell}>
        {isEdit ? (
          <input
            type="number"
            value={cleaningAmount}
            onChange={(e) =>
              setCleaningAmount(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          />
        ) : (
          cleaningAmount
        )}
      </td>

      {/* =========================
          検査
      ========================= */}
      <td className={styles.inspectionCell}>
        {isEdit ? (
          <input
            type="date"
            value={inspectionDate}
            onChange={(e) => setInspectionDate(e.target.value)}
          />
        ) : (
          inspectionDate
        )}
      </td>

      <td className={styles.inspectionAmountCell}>
        {isEdit ? (
          <input
            type="number"
            value={inspectionAmount}
            onChange={(e) =>
              setInspectionAmount(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          />
        ) : (
          inspectionAmount
        )}
      </td>

      {/* =========================
          測量
      ========================= */}
      <td className={styles.measurementCell}>
        {isEdit ? (
          <input
            type="date"
            value={measurementDate}
            onChange={(e) => setMeasurementDate(e.target.value)}
          />
        ) : (
          measurementDate
        )}
      </td>

      <td className={styles.measurementAmountCell}>
        {isEdit ? (
          <input
            type="number"
            value={measurementAmount}
            onChange={(e) =>
              setMeasurementAmount(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          />
        ) : (
          measurementAmount
        )}
      </td>

      {/* =========================
          梱包
      ========================= */}
      <td className={styles.packagingCell}>
        {isEdit ? (
          <input
            type="date"
            value={packagingDate}
            onChange={(e) => setPackagingDate(e.target.value)}
          />
        ) : (
          packagingDate
        )}
      </td>

      <td className={styles.packagingAmountCell}>
        {isEdit ? (
          <input
            type="number"
            value={packagingAmount}
            onChange={(e) =>
              setPackagingAmount(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          />
        ) : (
          packagingAmount
        )}
      </td>

      {/* 注残 */}
      <td>{post.orderAmount - Number(packagingAmount)}</td>

      {/* 工程進捗 */}
      <td>
        <div className={styles.progressArea}>
          <p>{processProgress}%</p>

          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${processProgress}%`,
              }}
            />
          </div>
        </div>
      </td>

      {/* 数量進捗 */}
      <td>
        <div className={styles.progressArea}>
          <p>{quantityProgress}%</p>

          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${quantityProgress}%`,
              }}
            />
          </div>
        </div>
      </td>

      {/* 状態 */}
      <td>
        <span className={`${styles.statusBadge} ${styles[post.status]}`}>
          {post.status}
        </span>
      </td>

      {/* 遅延 */}
      <td>
        {isDelay ? (
          <span className={styles.delayBadge}>遅延</span>
        ) : (
          <span className={styles.normalBadge}>正常</span>
        )}
      </td>

      {/* 納期 */}
      <td>{post.deliveryDate}</td>

      {/* 備考 */}
      <td>{post.remark}</td>

      {/* 操作 */}
      <td>
        {isEdit ? (
          <button className={styles.saveButton} onClick={handleSave}>
            保存
          </button>
        ) : (
          <button className={styles.editButton} onClick={() => setIsEdit(true)}>
            編集
          </button>
        )}

        <button className={styles.deleteButton} onClick={handleDelete}>
          削除
        </button>
      </td>
    </tr>
  );
};

export default ReservationList;
