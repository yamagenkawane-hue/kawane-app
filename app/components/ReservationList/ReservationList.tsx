"use client";

import React, { useState } from "react";
import styles from "./page.module.css";
import supabase from "../../../lib/supabase";
import { ReservationRowProps } from "@/app/type";
import Link from "next/link";

const ReservationList: React.FC<ReservationRowProps> = ({
  post,
  handleDelete,
}) => {
  const [isEdit, setIsEdit] = useState(false);

  // =========================
  // 製造ログ
  // =========================
  const [manufacturingLogDate, setManufacturingLogDate] = useState("");
  const [manufacturingLogAmount, setManufacturingLogAmount] = useState<
    number | ""
  >("");
  const manufacturingLogs = post.manufacturingLogs || [];

  // =========================
  // 洗浄ログ
  // =========================
  const [cleaningLogDate, setCleaningLogDate] = useState("");
  const [cleaningLogAmount, setCleaningLogAmount] = useState<number | "">("");
  const cleaningLogs = post.cleaningLogs || [];

  // =========================
  // 検査ログ
  // =========================
  const [inspectionLogDate, setInspectionLogDate] = useState("");
  const [inspectionLogAmount, setInspectionLogAmount] = useState<number | "">(
    "",
  );
  const inspectionLogs = post.inspectionLogs || [];

  // =========================
  // 測量ログ
  // =========================
  const [measurementLogDate, setMeasurementLogDate] = useState("");
  const [measurementLogAmount, setMeasurementLogAmount] = useState<number | "">(
    "",
  );
  const measurementLogs = post.measurementLogs || [];

  // =========================
  // 梱包ログ
  // =========================
  const [packagingLogDate, setPackagingLogDate] = useState("");
  const [packagingLogAmount, setPackagingLogAmount] = useState<number | "">("");
  const packagingLogs = post.packagingLogs || [];

  // =========================
  // 製造ログ追加
  // =========================
  const handleAddManufacturingLog = async () => {
    if (!manufacturingLogDate || manufacturingLogAmount === "") {
      alert("日付と数量を入力してください");
      return;
    }

    try {
      const newLogs = [
        ...manufacturingLogs,
        { date: manufacturingLogDate, amount: Number(manufacturingLogAmount) },
      ];

      const { error } = await supabase
        .from("posts")
        .update({
          manufacturing_logs: newLogs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (error) throw error;

      alert("製造実績を追加しました");
      setManufacturingLogDate("");
      setManufacturingLogAmount("");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("追加に失敗しました");
    }
  };

  // =========================
  // 洗浄ログ追加
  // =========================
  const handleAddCleaningLog = async () => {
    if (!cleaningLogDate || cleaningLogAmount === "") {
      alert("日付と数量を入力してください");
      return;
    }

    try {
      const newLogs = [
        ...cleaningLogs,
        { date: cleaningLogDate, amount: Number(cleaningLogAmount) },
      ];

      const { error } = await supabase
        .from("posts")
        .update({
          cleaning_logs: newLogs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (error) throw error;

      alert("洗浄実績を追加しました");
      setCleaningLogDate("");
      setCleaningLogAmount("");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("追加失敗");
    }
  };

  // =========================
  // 検査ログ追加
  // =========================
  const handleAddInspectionLog = async () => {
    if (!inspectionLogDate || inspectionLogAmount === "") {
      alert("日付と数量を入力してください");
      return;
    }

    try {
      const newLogs = [
        ...inspectionLogs,
        { date: inspectionLogDate, amount: Number(inspectionLogAmount) },
      ];

      const { error } = await supabase
        .from("posts")
        .update({
          inspection_logs: newLogs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (error) throw error;

      alert("検査実績を追加しました");
      setInspectionLogDate("");
      setInspectionLogAmount("");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("追加失敗");
    }
  };

  // =========================
  // 測量ログ追加
  // =========================
  const handleAddMeasurementLog = async () => {
    if (!measurementLogDate || measurementLogAmount === "") {
      alert("日付と数量を入力してください");
      return;
    }

    try {
      const newLogs = [
        ...measurementLogs,
        { date: measurementLogDate, amount: Number(measurementLogAmount) },
      ];

      const { error } = await supabase
        .from("posts")
        .update({
          measurement_logs: newLogs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (error) throw error;

      alert("測量実績を追加しました");
      setMeasurementLogDate("");
      setMeasurementLogAmount("");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("追加失敗");
    }
  };

  // =========================
  // 梱包ログ追加
  // =========================
  const handleAddPackagingLog = async () => {
    if (!packagingLogDate || packagingLogAmount === "") {
      alert("日付と数量を入力してください");
      return;
    }

    try {
      const newLogs = [
        ...packagingLogs,
        { date: packagingLogDate, amount: Number(packagingLogAmount) },
      ];

      const { error } = await supabase
        .from("posts")
        .update({
          packaging_logs: newLogs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (error) throw error;

      alert("梱包実績を追加しました");
      setPackagingLogDate("");
      setPackagingLogAmount("");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("追加失敗");
    }
  };

  // =========================
  // 保存
  // =========================
  const handleSave = async () => {
    try {
      const manufacturing = manufacturingLogs.reduce(
        (sum, log) => sum + log.amount,
        0,
      );
      const cleaning = cleaningLogs.reduce((sum, log) => sum + log.amount, 0);
      const inspection = inspectionLogs.reduce(
        (sum, log) => sum + log.amount,
        0,
      );
      const measurement = measurementLogs.reduce(
        (sum, log) => sum + log.amount,
        0,
      );
      const packaging = packagingLogs.reduce((sum, log) => sum + log.amount, 0);

      // 状態判定
      let status = "未着手";
      if (manufacturing > 0) status = "製造中";
      if (manufacturing >= post.orderAmount) status = "製造完了";
      if (cleaning > 0) status = "洗浄中";
      if (cleaning >= post.orderAmount) status = "洗浄完了";
      if (inspection > 0) status = "検査中";
      if (inspection >= post.orderAmount) status = "検査完了";
      if (measurement > 0) status = "測量中";
      if (measurement >= post.orderAmount) status = "測量完了";
      if (packaging > 0) status = "梱包中";
      if (packaging >= post.orderAmount) status = "出荷OK";

      const { error } = await supabase
        .from("posts")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (error) throw error;

      alert("更新しました");
      setIsEdit(false);
    } catch (error) {
      console.error(error);
      alert("更新に失敗しました");
    }
  };

  // =========================
  // 工程進捗
  // =========================
  const manufacturing = manufacturingLogs.reduce(
    (sum, log) => sum + log.amount,
    0,
  );
  const cleaning = cleaningLogs.reduce((sum, log) => sum + log.amount, 0);
  const inspection = inspectionLogs.reduce((sum, log) => sum + log.amount, 0);
  const measurement = measurementLogs.reduce((sum, log) => sum + log.amount, 0);
  const packaging = packagingLogs.reduce((sum, log) => sum + log.amount, 0);

  let processProgress = 0;
  if (manufacturing > 0)
    processProgress += manufacturing >= post.orderAmount ? 20 : 10;
  if (cleaning > 0) processProgress += cleaning >= post.orderAmount ? 20 : 10;
  if (inspection > 0)
    processProgress += inspection >= post.orderAmount ? 20 : 10;
  if (measurement > 0)
    processProgress += measurement >= post.orderAmount ? 20 : 10;
  if (packaging > 0) processProgress += packaging >= post.orderAmount ? 20 : 10;

  // 状態表示用
  let status = "未着手";
  if (manufacturing > 0) status = "製造中";
  if (manufacturing >= post.orderAmount) status = "製造完了";
  if (cleaning > 0) status = "洗浄中";
  if (cleaning >= post.orderAmount) status = "洗浄完了";
  if (inspection > 0) status = "検査中";
  if (inspection >= post.orderAmount) status = "検査完了";
  if (measurement > 0) status = "測量中";
  if (measurement >= post.orderAmount) status = "測量完了";
  if (packaging > 0) status = "梱包中";
  if (packaging >= post.orderAmount) status = "出荷OK";

  // 数量進捗
  const quantityProgress =
    post.orderAmount > 0 ? Math.floor((packaging / post.orderAmount) * 100) : 0;

  const processProgressColor =
    processProgress >= 80
      ? "#22c55e"
      : processProgress >= 40
        ? "#eab308"
        : "#ef4444";

  const quantityProgressColor =
    quantityProgress >= 80
      ? "#22c55e"
      : quantityProgress >= 40
        ? "#eab308"
        : "#ef4444";

  // 遅延判定
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivery = new Date(post.deliveryDate);
  delivery.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(
    (delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  const isDelay = diffDays <= 1 && processProgress < 80 && status !== "出荷OK";

  // 納期警告
  const deliveryClass = (() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const d = new Date(post.deliveryDate);
    d.setHours(0, 0, 0, 0);
    const diff = Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return styles.danger;
    if (diff <= 3) return styles.danger;
    if (diff <= 7) return styles.warning;
    return "";
  })();

  return (
    <tr className={`${styles.reservationText} ${styles.reservationRow}`}>
      {/* 注番 */}
      <td>{post.orderNo}</td>

      {/* 製品名 */}
      <td className={styles.productName}>
        <Link href={`/progress/${post.id}`}>{post.productName}</Link>
      </td>

      {/* 得意先 */}
      <td>{post.customerName}</td>

      {/* 受注数量 */}
      <td>{post.orderAmount}</td>

      {/* 製造 日付 */}
      <td className={styles.manufacturingCell}>
        {isEdit && (
          <div className={styles.logArea}>
            <input
              type="date"
              value={manufacturingLogDate}
              onChange={(e) => setManufacturingLogDate(e.target.value)}
            />
            <input
              type="number"
              placeholder="数量"
              value={manufacturingLogAmount}
              onChange={(e) =>
                setManufacturingLogAmount(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            />
            <button type="button" onClick={handleAddManufacturingLog}>
              追加
            </button>
          </div>
        )}
        {manufacturingLogs.length > 0 ? (
          manufacturingLogs.map((log, index) => (
            <div key={index} className={styles.logRow}>
              {log.date}
            </div>
          ))
        ) : (
          <div className={styles.logRow}>-</div>
        )}
      </td>

      {/* 製造 数量 */}
      <td className={styles.manufacturingAmountCell}>
        {manufacturingLogs.length > 0 ? (
          manufacturingLogs.map((log, index) => (
            <div key={index} className={styles.amountRow}>
              {log.amount}
            </div>
          ))
        ) : (
          <div className={styles.amountRow}>0</div>
        )}
      </td>

      {/* 製造 累計 */}
      <td className={styles.averageCell}>
        {manufacturingLogs.length > 0 ? (
          manufacturingLogs.map((log, index) => {
            const cumulative = manufacturingLogs
              .slice(0, index + 1)
              .reduce((sum, item) => sum + item.amount, 0);
            return (
              <div key={index} className={styles.averageRow}>
                {cumulative}
              </div>
            );
          })
        ) : (
          <div className={styles.averageRow}>0</div>
        )}
      </td>

      {/* 洗浄 日付 */}
      <td className={styles.cleaningCell}>
        {isEdit && (
          <div className={styles.logArea}>
            <input
              type="date"
              value={cleaningLogDate}
              onChange={(e) => setCleaningLogDate(e.target.value)}
            />
            <input
              type="number"
              placeholder="数量"
              value={cleaningLogAmount}
              onChange={(e) =>
                setCleaningLogAmount(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            />
            <button type="button" onClick={handleAddCleaningLog}>
              追加
            </button>
          </div>
        )}
        {cleaningLogs.length > 0 ? (
          cleaningLogs.map((log, index) => (
            <div key={index} className={styles.logRow}>
              {log.date}
            </div>
          ))
        ) : (
          <div className={styles.logRow}>-</div>
        )}
      </td>

      {/* 洗浄 数量 */}
      <td className={styles.cleaningAmountCell}>
        {cleaningLogs.length > 0 ? (
          cleaningLogs.map((log, index) => (
            <div key={index} className={styles.amountRow}>
              {log.amount}
            </div>
          ))
        ) : (
          <div className={styles.amountRow}>0</div>
        )}
      </td>

      {/* 洗浄 累計 */}
      <td className={styles.cleaningAverageCell}>
        {cleaningLogs.length > 0 ? (
          cleaningLogs.map((log, index) => {
            const cumulative = cleaningLogs
              .slice(0, index + 1)
              .reduce((sum, item) => sum + item.amount, 0);
            return (
              <div key={index} className={styles.averageRow}>
                {cumulative}
              </div>
            );
          })
        ) : (
          <div className={styles.averageRow}>0</div>
        )}
      </td>

      {/* 検査 日付 */}
      <td className={styles.inspectionCell}>
        {isEdit && (
          <div className={styles.logArea}>
            <input
              type="date"
              value={inspectionLogDate}
              onChange={(e) => setInspectionLogDate(e.target.value)}
            />
            <input
              type="number"
              placeholder="数量"
              value={inspectionLogAmount}
              onChange={(e) =>
                setInspectionLogAmount(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            />
            <button type="button" onClick={handleAddInspectionLog}>
              追加
            </button>
          </div>
        )}
        {inspectionLogs.length > 0 ? (
          inspectionLogs.map((log, index) => (
            <div key={index} className={styles.logRow}>
              {log.date}
            </div>
          ))
        ) : (
          <div className={styles.logRow}>-</div>
        )}
      </td>

      {/* 検査 数量 */}
      <td className={styles.inspectionAmountCell}>
        {inspectionLogs.length > 0 ? (
          inspectionLogs.map((log, index) => (
            <div key={index} className={styles.amountRow}>
              {log.amount}
            </div>
          ))
        ) : (
          <div className={styles.amountRow}>0</div>
        )}
      </td>

      {/* 検査 累計 */}
      <td className={styles.inspectionAverageCell}>
        {inspectionLogs.length > 0 ? (
          inspectionLogs.map((log, index) => {
            const cumulative = inspectionLogs
              .slice(0, index + 1)
              .reduce((sum, item) => sum + item.amount, 0);
            return (
              <div key={index} className={styles.averageRow}>
                {cumulative}
              </div>
            );
          })
        ) : (
          <div className={styles.averageRow}>0</div>
        )}
      </td>

      {/* 測量 日付 */}
      <td className={styles.measurementCell}>
        {isEdit && (
          <div className={styles.logArea}>
            <input
              type="date"
              value={measurementLogDate}
              onChange={(e) => setMeasurementLogDate(e.target.value)}
            />
            <input
              type="number"
              placeholder="数量"
              value={measurementLogAmount}
              onChange={(e) =>
                setMeasurementLogAmount(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            />
            <button type="button" onClick={handleAddMeasurementLog}>
              追加
            </button>
          </div>
        )}
        {measurementLogs.length > 0 ? (
          measurementLogs.map((log, index) => (
            <div key={index} className={styles.logRow}>
              {log.date}
            </div>
          ))
        ) : (
          <div className={styles.logRow}>-</div>
        )}
      </td>

      {/* 測量 数量 */}
      <td className={styles.measurementAmountCell}>
        {measurementLogs.length > 0 ? (
          measurementLogs.map((log, index) => (
            <div key={index} className={styles.amountRow}>
              {log.amount}
            </div>
          ))
        ) : (
          <div className={styles.amountRow}>0</div>
        )}
      </td>

      {/* 測量 累計 */}
      <td className={styles.measurementAverageCell}>
        {measurementLogs.length > 0 ? (
          measurementLogs.map((log, index) => {
            const cumulative = measurementLogs
              .slice(0, index + 1)
              .reduce((sum, item) => sum + item.amount, 0);
            return (
              <div key={index} className={styles.averageRow}>
                {cumulative}
              </div>
            );
          })
        ) : (
          <div className={styles.averageRow}>0</div>
        )}
      </td>

      {/* 梱包 日付 */}
      <td className={styles.packagingCell}>
        {isEdit && (
          <div className={styles.logArea}>
            <input
              type="date"
              value={packagingLogDate}
              onChange={(e) => setPackagingLogDate(e.target.value)}
            />
            <input
              type="number"
              placeholder="数量"
              value={packagingLogAmount}
              onChange={(e) =>
                setPackagingLogAmount(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            />
            <button type="button" onClick={handleAddPackagingLog}>
              追加
            </button>
          </div>
        )}
        {packagingLogs.length > 0 ? (
          packagingLogs.map((log, index) => (
            <div key={index} className={styles.logRow}>
              {log.date}
            </div>
          ))
        ) : (
          <div className={styles.logRow}>-</div>
        )}
      </td>

      {/* 梱包 数量 */}
      <td className={styles.packagingAmountCell}>
        {packagingLogs.length > 0 ? (
          packagingLogs.map((log, index) => (
            <div key={index} className={styles.amountRow}>
              {log.amount}
            </div>
          ))
        ) : (
          <div className={styles.amountRow}>0</div>
        )}
      </td>

      {/* 梱包 累計 */}
      <td className={styles.packagingAverageCell}>
        {packagingLogs.length > 0 ? (
          packagingLogs.map((log, index) => {
            const cumulative = packagingLogs
              .slice(0, index + 1)
              .reduce((sum, item) => sum + item.amount, 0);
            return (
              <div key={index} className={styles.averageRow}>
                {cumulative}
              </div>
            );
          })
        ) : (
          <div className={styles.averageRow}>0</div>
        )}
      </td>

      {/* 注残 */}
      <td>{post.orderAmount - Number(packaging)}</td>

      {/* 工程進捗 */}
      <td>
        <div className={styles.progressArea}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${processProgress}%`,
                backgroundColor: processProgressColor,
              }}
            />
            <span className={styles.progressText}>{processProgress}%</span>
          </div>
        </div>
      </td>

      {/* 数量進捗 */}
      <td>
        <div className={styles.progressArea}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${quantityProgress}%`,
                backgroundColor: quantityProgressColor,
              }}
            />
            <span className={styles.progressText}>{quantityProgress}%</span>
          </div>
        </div>
      </td>

      {/* 状態 */}
      <td>
        <span className={`${styles.statusBadge} ${styles[status]}`}>
          {status}
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
      <td>
        <span className={deliveryClass}>{post.deliveryDate}</span>
      </td>

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
