import { Post } from "../type";
import { useOrderCancellation } from "@/app/components/OrderCancellation/useOrderCancellation";
export const useDelete = (setShouldFetch: (val: boolean) => void) => {
  const { openCancellation, cancellationDialog } = useOrderCancellation(() => setShouldFetch(true));
  return { handleDelete: (post: Post) => openCancellation([{ id: post.id, label: "選択した注番" }]), cancellationDialog };
};
