"use client";

import {
  DndContext,
  DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ProductProcess } from "@/app/type";
import styles from "./page.module.css";

type ProcessSorterProps = {
  processes: ProductProcess[];
  onChange: (processes: ProductProcess[]) => void;
};

function SortableRow({ process }: { process: ProductProcess }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: process.id });

  return (
    <div
      className={styles.row}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button className={styles.handle} type="button" {...attributes} {...listeners}>
        ↕
      </button>
      <span className={styles.order}>{process.processOrder}</span>
      <span className={styles.name}>{process.processName}</span>
      <span className={styles.subcontractor}>
        {process.subcontractorName || "社内工程"}
      </span>
    </div>
  );
}

export default function ProcessSorter({
  processes,
  onChange,
}: ProcessSorterProps) {
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = processes.findIndex((item) => item.id === active.id);
    const newIndex = processes.findIndex((item) => item.id === over.id);
    const reordered = arrayMove(processes, oldIndex, newIndex).map(
      (process, index) => ({ ...process, processOrder: index + 1 }),
    );
    onChange(reordered);
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={processes.map((process) => process.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={styles.list}>
          {processes.map((process) => (
            <SortableRow key={process.id} process={process} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
