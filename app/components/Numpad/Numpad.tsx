"use client";

import { useEffect } from "react";
import styles from "./page.module.css";

type NumpadProps = {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  open: boolean;
};

const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "C"];

export default function Numpad({ value, onChange, onClose, open }: NumpadProps) {
  const handlePress = (key: string) => {
    if (key === "C") {
      onChange("");
      return;
    }

    if (key === "." && value.includes(".")) return;
    onChange(`${value}${key}`);
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        onChange(`${value}${event.key}`);
        return;
      }

      if (event.key === "." && !value.includes(".")) {
        event.preventDefault();
        onChange(`${value}.`);
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        onChange(value.slice(0, -1));
        return;
      }

      if (event.key === "Delete" || event.key.toLowerCase() === "c") {
        event.preventDefault();
        onChange("");
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onChange, onClose, open, value]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} role="presentation">
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.display}>{value || "0"}</div>
        <div className={styles.grid}>
          {keys.map((key) => (
            <button
              className={key === "C" ? styles.clearKey : styles.key}
              key={key}
              type="button"
              onClick={() => handlePress(key)}
            >
              {key}
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.cancelButton} type="button" onClick={onClose}>
            閉じる
          </button>
          <button className={styles.enterButton} type="button" onClick={onClose}>
            確定
          </button>
        </div>
      </div>
    </div>
  );
}
