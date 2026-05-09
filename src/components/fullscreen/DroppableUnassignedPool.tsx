import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

/** 与 FullscreenRoundOverview.onDragEnd 中解析一致 */
export const UNASSIGNED_POOL_DROP_ID = "paizuo::unassigned-pool";

export function DroppableUnassignedPool(props: { children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: UNASSIGNED_POOL_DROP_ID });

  return (
    <div
      ref={setNodeRef}
      className={[
        "rounded-2xl border-2 border-dashed px-4 py-3 transition-colors",
        isOver
          ? "border-orange-400 bg-orange-50/70 ring-2 ring-orange-200/80"
          : "border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06)]",
      ].join(" ")}
    >
      {props.children}
    </div>
  );
}
