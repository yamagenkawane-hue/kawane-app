import { useState } from "react";

export const useHandleChange = () => {
  const initialDayState = {
    date: "",
    startTime: "14:00",
    endTime: "14:00",
    remark: "",
    delete: false,
  };

  const [days, setDays] = useState(Array(5).fill(initialDayState));

  const handleChange =
    (dayIndex: number, field: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setDays((prev) =>
        prev.map((day, index) =>
          index === dayIndex ? { ...day, [field]: value } : day
        )
      );
    };

  return {
    handleChange,
    firstDay: days[0],
    secondDay: days[1],
    thirdDay: days[2],
    fourthDay: days[3],
    fifthDay: days[4],
  };
};
