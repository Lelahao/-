import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

export function droppableSeatId(tableId: string, seatNo: number) {
  return `seat::${tableId}::${seatNo}`;
}

export function DroppableSeatTarget(props: {
  tableId: string;
  seatNo: number;
  occupied: boolean;
  children: ReactNode;
}) {
  const id = droppableSeatId(props.tableId, props.seatNo);
  const { isOver, setNodeRef } = useDroppable({ id });

  const base = props.occupied
    ? isOver
      ? "border-2 border-dashed border-orange-400 bg-orange-50/60 ring-2 ring-orange-200/70"
      : "border border-slate-200/90 bg-white"
    : isOver
      ? "border-2 border-dashed border-orange-400 bg-orange-50/60 ring-2 ring-orange-200/70"
      : "border border-dashed border-slate-200/80 bg-slate-50/40";

  return (
    <div ref={setNodeRef} className={["rounded-2xl p-1 transition-colors", base].join(" ")}>
      {props.children}
    </div>
  );
}
