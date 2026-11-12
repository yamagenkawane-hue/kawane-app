import { Dispatch, SetStateAction } from "react";
import { useOrderCancellation } from "@/app/components/OrderCancellation/useOrderCancellation";
export const useReservationDelete = (setShouldFetch: Dispatch<SetStateAction<boolean>>) => {
  const { openCancellation, cancellationDialog } = useOrderCancellation(() => setShouldFetch(true));
  return { handleDelete: async (postId: string) => openCancellation([{ id: postId, label: "選択した注番" }]), cancellationDialog };
};
