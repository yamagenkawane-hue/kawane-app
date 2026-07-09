"use client";

import { type MouseEvent, useRef, useState } from "react";
import styles from "./page.module.css";
import { Props } from "@/app/type";

const DAY_WIDTH = 40;
const DAY_MS = 1000 * 60 * 60 * 24;

const formatDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function GanttChart({ processes, deliveryDate, calendar = [] }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);

  if (processes.length === 0) {
    return <div className={styles.empty}>データがありません</div>;
  }

  // =========================
  // 日付範囲
  // =========================

  const calendarMap = new Map(
    calendar.map((item) => [item.date, item.isHoliday]),
  );

  const isBusinessDay = (date: Date) => {
    const dateKey = formatDateKey(date);
    const explicitHoliday = calendarMap.get(dateKey);
    if (explicitHoliday !== undefined) return !explicitHoliday;

    const week = date.getDay();
    if (week === 0 || week === 6) return false;
    return true;
  };

  const allDates: number[] = [];

  processes.forEach((p) => {
    allDates.push(p.actualStart.getTime());
    allDates.push(p.predictedStart.getTime());
    allDates.push(p.predictedEnd.getTime());

    if (p.actualEnd) {
      allDates.push(p.actualEnd.getTime());
    }
  });

  const delivery = new Date(deliveryDate);
  if (!Number.isNaN(delivery.getTime())) {
    allDates.push(delivery.getTime());
  }

  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));

  const totalDays =
    Math.ceil((maxDate.getTime() - minDate.getTime()) / DAY_MS) + 1;

  const businessDates = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(minDate);

    d.setDate(d.getDate() + i);

    return d;
  }).filter(isBusinessDay);

  const dates = businessDates.length > 0 ? businessDates : [minDate];
  const dateIndexMap = new Map(
    dates.map((date, index) => [formatDateKey(date), index]),
  );

  const getDateIndex = (date: Date) => {
    const exact = dateIndexMap.get(formatDateKey(date));
    if (exact !== undefined) return exact;

    const targetTime = date.getTime();
    const nextIndex = dates.findIndex((item) => item.getTime() >= targetTime);
    if (nextIndex >= 0) return nextIndex;

    return dates.length - 1;
  };

  // =========================
  // 今日
  // =========================

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const todayOffset = getDateIndex(today);
  const shouldShowToday =
    today.getTime() >= dates[0].getTime() &&
    today.getTime() <= dates[dates.length - 1].getTime();

  // =========================
  // 納期
  // =========================

  const safeDelivery = Number.isNaN(delivery.getTime()) ? maxDate : delivery;

  const deliveryOffset = getDateIndex(safeDelivery);

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

        const actualStartIndex = getDateIndex(process.actualStart);
        const actualEndIndex = process.actualEnd
          ? getDateIndex(process.actualEnd)
          : actualStartIndex;
        const actualOffset = actualStartIndex * DAY_WIDTH;

        const actualWidth = process.actualEnd
          ? Math.max(
              40,
              (actualEndIndex - actualStartIndex + 1) * DAY_WIDTH,
            )
          : 0;

        // =========================
        // 予測バー
        // =========================

        const predictedStartIndex = getDateIndex(process.predictedStart);
        const predictedEndIndex = getDateIndex(process.predictedEnd);
        const predictedOffset = predictedStartIndex * DAY_WIDTH;
        const predictedDays = predictedEndIndex - predictedStartIndex + 1;
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
              {shouldShowToday && (
                <div
                  className={styles.todayLine}
                  style={{ left: `${todayOffset * DAY_WIDTH}px` }}
                />
              )}

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
