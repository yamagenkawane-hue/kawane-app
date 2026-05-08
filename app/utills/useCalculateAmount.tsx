
export const useCalculateAmount = () => {
  const calculateAmount = (
    start?: string,
    end?: string,
    childClass?: string
  ): number => {
    if (!start || !end) return 0;

    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    const diffMinutes = Math.max(endMinutes - startMinutes, 0);
    if (diffMinutes === 0) return 0;

    const isSpecialClass =
      childClass === "小学生" || childClass === "未就園児";

    let units = 0;
    if (diffMinutes <= 29) {
      units = 1;
    } else if (diffMinutes <= 59) {
      units = 2;
    } else {
      const fullUnits = Math.floor(diffMinutes / 30);
      const remainder = diffMinutes % 30;
      units = fullUnits + (remainder > 0 ? 1 : 0);
    }

    const ratePerUnit = isSpecialClass ? 250 : 200;

    return units * ratePerUnit;
  };

  return { calculateAmount };
};
