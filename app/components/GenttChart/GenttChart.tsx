"use client";

import { type MouseEvent, useRef, useState } from "react";
import styles from "./page.module.css";
import { Props } from "@/app/type";

const DAY_WIDTH = 40;

export default function GanttChart({ processes, deliveryDate }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);

  if (processes.length === 0) {
    return <div className={styles.empty}>データがありません</div>;
  }

  // =========================
  // 日付範囲
  // =========================

  const allDates: number[] = [];

  processes.forEach((p) => {
    allDates.push(p.actualStart.getTime());
    allDates.push(p.predictedEnd.getTime());

    if (p.actualEnd) {
      allDates.push(p.actualEnd.getTime());
    }
  });

  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));

  const totalDays =
    Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) +
    1;

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
  const safeDelivery = Number.isNaN(delivery.getTime()) ? maxDate : delivery;

  const deliveryOffset = Math.floor(
    (safeDelivery.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  const startDrag = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;

    if (
      target instanceof Element &&
      target.closest("input, textarea, select, button, a")
    ) {
      return;
    }

    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = event.currentTarget.scrollLeft;
    setIsDragging(true);
    event.preventDefault();
  };

  const moveDrag = (event: MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const dragDistance = event.clientX - dragStartXRef.current;
    event.currentTarget.scrollLeft =
      dragStartScrollLeftRef.current - dragDistance;
  };

  const stopDrag = () => {
    setIsDragging(false);
  };

  return (
    <div
      className={`${styles.wrapper} ${isDragging ? styles.dragging : ""}`}
      onMouseDown={startDrag}
      onMouseLeave={stopDrag}
      onMouseMove={moveDrag}
      onMouseUp={stopDrag}
    >
      {/* ヘッダー */}
      <div className={styles.headerRow}>
        <div className={styles.processHeader}>工程</div>

        <div className={styles.dateArea}>
          {dates.map((date, index) => (
            <div
              key={`header-${date.getTime()}-${index}`}
              className={styles.dateCell}
              style={{ width: `${DAY_WIDTH}px` }}
            >
              {date.getMonth() + 1}/{date.getDate()}
            </div>
          ))}
        </div>
      </div>

      {/* 工程 */}
      {processes.map((process, processIndex) => {
        // =========================
        // 実績バー
        // =========================

        const actualOffset =
          Math.floor(
            (process.actualStart.getTime() - minDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ) * DAY_WIDTH;

        const actualWidth = process.actualEnd
          ? Math.max(
              40,
              (Math.ceil(
                (process.actualEnd.getTime() - process.actualStart.getTime()) /
                  (1000 * 60 * 60 * 24),
              ) +
                1) *
                DAY_WIDTH,
            )
          : 0;

        // =========================
        // 予測バー
        // =========================

        const predictedBaseDate = process.actualEnd || process.actualStart;
        const predictedOffset = process.actualEnd
          ? Math.floor(
              (process.actualEnd.getTime() - minDate.getTime()) /
                (1000 * 60 * 60 * 24),
            ) * DAY_WIDTH
          : actualOffset;

        const predictedDays =
          Math.ceil(
            (process.predictedEnd.getTime() - predictedBaseDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1;
        const predictedWidth =
          process.remainingAmount > 0
            ? Math.max(DAY_WIDTH, predictedDays * DAY_WIDTH)
            : 0;

        return (
          <div
            key={`process-${process.id}-${processIndex}`}
            className={styles.processRow}
          >
            {/* 工程名 */}
            <div className={styles.processName}>
              <div>{process.name}</div>

              <div className={styles.subInfo}>{process.progress}%</div>
            </div>

            {/* ガント */}
            <div className={styles.ganttArea}>
              {/* グリッド */}
              {dates.map((date, dateIndex) => (
                <div
                  key={`grid-${process.id}-${date.getTime()}-${dateIndex}`}
                  className={styles.gridCell}
                  style={{ width: `${DAY_WIDTH}px` }}
                />
              ))}

              {/* 今日 */}
              <div
                className={styles.todayLine}
                style={{ left: `${todayOffset * DAY_WIDTH}px` }}
              />

              {/* 納期 */}
              <div
                className={styles.deliveryLine}
                style={{ left: `${deliveryOffset * DAY_WIDTH}px` }}
              />

              {/* 実績バー */}
              {actualWidth > 0 && (
                <div
                  className={styles.actualBar}
                  style={{
                    left: `${actualOffset}px`,
                    width: `${actualWidth}px`,
                  }}
                >
                  実績 {process.completedAmount}
                </div>
              )}

              {/* 予測バー */}
              {predictedWidth > 0 && (
                <div
                  className={styles.predictBar}
                  style={{
                    left: `${predictedOffset}px`,
                    width: `${predictedWidth}px`,
                    backgroundColor: process.isDelay ? "#ef4444" : "#f59e0b",
                  }}
                >
                  残 {process.remainingAmount}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
