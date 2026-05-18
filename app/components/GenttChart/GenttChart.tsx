"use client";

import styles from "./page.module.css";
import { Props } from "@/app/type";

const DAY_WIDTH = 40;

export default function GanttChart({ processes, deliveryDate }: Props) {
  // =========================
  // データなし
  // =========================

  if (processes.length === 0) {
    return <div className={styles.empty}>データがありません</div>;
  }

  // =========================
  // 全体期間
  // =========================

  const startDates = processes.map((p) => p.start.getTime());

  const endDates = processes.map((p) => p.end.getTime());

  const minDate = new Date(Math.min(...startDates));

  const maxDate = new Date(Math.max(...endDates));

  // =========================
  // 日数
  // =========================

  const totalDays =
    Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) +
    1;

  // =========================
  // 日付配列
  // =========================

  const dates = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(minDate);

    d.setDate(d.getDate() + i);

    return d;
  });

  // =========================
  // 今日
  // =========================

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const todayOffset = Math.floor(
    (today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // =========================
  // 納期
  // =========================

  const delivery = new Date(deliveryDate);

  const deliveryOffset = Math.floor(
    (delivery.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return (
    <div className={styles.wrapper}>
      {/* ヘッダー */}
      <div className={styles.headerRow}>
        <div className={styles.processHeader}>工程</div>

        <div className={styles.dateArea}>
          {dates.map((date, index) => (
            <div
              key={`header-${date.getTime()}-${index}`}
              className={styles.dateCell}
              style={{
                width: `${DAY_WIDTH}px`,
              }}
            >
              {date.getMonth() + 1}/{date.getDate()}
            </div>
          ))}
        </div>
      </div>

      {/* 工程行 */}
      {processes.map((process, processIndex) => {
        // 開始位置
        const offset =
          Math.floor(
            (process.start.getTime() - minDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ) * DAY_WIDTH;

        // 横幅
        const duration =
          Math.ceil(
            (process.end.getTime() - process.start.getTime()) /
              (1000 * 60 * 60 * 24),
          ) * DAY_WIDTH;

        console.log(process.name, process.progress);

        return (
          <div
            key={`process-${process.id}-${processIndex}`}
            className={styles.processRow}
          >
            {/* 工程名 */}
            <div className={styles.processName}>{process.name}</div>

            {/* ガントエリア */}
            <div className={styles.ganttArea}>
              {/* グリッド */}
              {dates.map((date, dateIndex) => (
                <div
                  key={`grid-${process.id}-${date.getTime()}-${dateIndex}`}
                  className={styles.gridCell}
                  style={{
                    width: `${DAY_WIDTH}px`,
                  }}
                />
              ))}

              {/* 今日ライン */}
              <div
                key={`today-${process.id}`}
                className={styles.todayLine}
                style={{
                  left: `${todayOffset * DAY_WIDTH}px`,
                }}
              />

              {/* 納期ライン */}
              <div
                key={`delivery-${process.id}`}
                className={styles.deliveryLine}
                style={{
                  left: `${deliveryOffset * DAY_WIDTH}px`,
                }}
              />

              {/* バー */}
              <div
                className={styles.ganttBar}
                style={{
                  left: `${offset}px`,
                  width: `${Math.max(duration, 60)}px`,
                  backgroundColor: process.isDelay ? "#ef4444" : "#22c55e",
                }}
              >
                <span className={styles.progressText}>{process.progress}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
