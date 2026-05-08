import React from "react";
import styles from "./page.module.css";
import { ReservationInputProps } from "@/app/type";

const CreateForm: React.FC<ReservationInputProps> = ({ index, onChange }) => {
  return (
    <div className={styles.applicationSection}>
      <div className={styles.applicationNumberContainer}>
        <span className={styles.applicationNumber}>第{index + 1}希望日</span>
      </div>
      <div className={styles.applicationContent}>
        <strong className={styles.createStrong}>日にち</strong>
        <input
          className={styles.createInput}
          type="date"
          onChange={onChange("date")}
        />
        <strong className={styles.createStrong}>延長開始時間</strong>
        <input
          className={styles.createInput}
          type="time"
          defaultValue={"14:00"}
          onChange={onChange("startTime")}
        />
        <strong className={styles.createStrong}>お迎え時間</strong>
        <input
          className={styles.createInput}
          type="time"
          min="14:00"
          defaultValue={"14:00"}
          onChange={onChange("endTime")}
        />
        <strong className={styles.createStrong}>備考</strong>
        <input className={styles.createInput} onChange={onChange("remark")} />
      </div>
    </div>
  );
};

export default CreateForm;
