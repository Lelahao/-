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
        "min-h-[2.5rem] rounded-none p-0 transition-colors",
        props.occupied ? "" : "flex min-h-[3rem] items-end justify-center pb-0.5",
        base,
      ].join(" ")}
    >
      {props.children}
    </div>
  );
}
