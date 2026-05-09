import { useDraggable } from "@dnd-kit/core";
import type { SeatDragData } from "@/fullscreen/types";

export function DraggableSeatLabel(props: {
  personId: string;
  personName: string;
  sourceTableId: string | null;
  sourceSeatNo: number;
  /** compact：侧栏与窄区；comfortable：全屏座位区可完整换行展示姓名 */
  density?: "compact" | "comfortable";
  /** 总览搜索命中 */
  searchHighlight?: boolean;
}) {
  const density = props.density ?? "comfortable";

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `person::${props.personId}`,
    data: {
      sourceTableId: props.sourceTableId,
      sourceSeatNo: props.sourceSeatNo,
      personId: props.personId,
      personName: props.personName,
    } satisfies SeatDragData,
  });

  const compactCls =
    "inline-flex min-h-[32px] w-fit max-w-[120px] cursor-grab select-none items-center justify-center px-0 py-1 text-sm font-semibold text-slate-900 transition active:cursor-grabbing";

  const comfortableCls =
    "inline-flex min-h-[32px] w-fit max-w-[min(100%,11rem)] cursor-grab select-none items-center justify-center px-0 py-1 text-center text-sm font-semibold leading-snug text-slate-900 transition active:cursor-grabbing whitespace-normal break-words";

  const highlightCls = props.searchHighlight ? " rounded-md ring-2 ring-amber-400 ring-offset-1 bg-amber-50" : "";

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      title={props.personName}
      className={[
        density === "compact" ? compactCls : comfortableCls,
        highlightCls,
        isDragging ? "opacity-55" : "opacity-100",
      ].join(" ")}
    >
      {density === "compact" ? (
        <span className="min-w-0 truncate">{props.personName}</span>
      ) : (
        props.personName
      )}
    </button>
  );
}
