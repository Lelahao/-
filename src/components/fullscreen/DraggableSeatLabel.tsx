import { useDraggable } from "@dnd-kit/core";
import type { SeatDragData } from "@/fullscreen/types";

export function DraggableSeatLabel(props: {
  personId: string;
  personName: string;
  sourceTableId: string | null;
  sourceSeatNo: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `person::${props.personId}`,
    data: {
      sourceTableId: props.sourceTableId,
      sourceSeatNo: props.sourceSeatNo,
      personId: props.personId,
      personName: props.personName,
    } satisfies SeatDragData,
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      className={[
        "w-full max-w-full rounded-xl border border-orange-200/80 bg-white px-2 py-2 text-center text-xs font-semibold leading-snug text-slate-900 shadow-sm break-words sm:text-sm",
        isDragging ? "opacity-0" : "opacity-100",
      ].join(" ")}
    >
      {props.personName}
    </button>
  );
}
