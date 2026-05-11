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
      ? "bg-orange-50/60"
      : "border-0 bg-transparent"
    : isOver
      ? "bg-orange-50/50"
      : "border-0 bg-transparent";

  return (
    <div
      ref={setNodeRef}
      className={[
        "pointer-events-auto rounded-none p-0 transition-colors",
        props.occupied ? "min-h-0" : "flex min-h-[44px] items-center justify-center",
        base,
      ].join(" ")}
    >
      {props.children}
    </div>
  );
}
