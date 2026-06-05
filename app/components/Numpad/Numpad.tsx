"use client";

import styles from "./page.module.css";

type NumpadProps = {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  open: boolean;
};

const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "C"];

export default function Numpad({ value, onChange, onClose, open }: NumpadProps) {
  if (!open) return null;

  const handlePress = (key: string) => {
    if (key === "C") {
      onChange("");
      return;
    }

    if (key === "." && value.includes(".")) return;
    onChange(`${value}${key}`);
  };

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
