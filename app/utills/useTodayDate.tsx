import { useState } from "react";

export const useTodayDate = () => {
  const getTodayDate = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(today.getDate()).padStart(2, "0")}`;
  };
  const [search, setSearch] = useState<string>(getTodayDate());

  return [search, setSearch] as const;
};
