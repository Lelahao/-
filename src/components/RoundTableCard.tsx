import type { DragEvent } from "react";
import { resolveTableCategoryLabel } from "@/config/seatRoleTemplates";
import { SeatRing } from "@/components/SeatRing";

export type RoundTableCardProps = {
  tableNo: number;
  hallName: string;
  capacity: number;
  currentCount: number;
  seats?: boolean[];
  /** 每席是否有人；长度须为 capacity，优先于 seats / currentCount */
  seatOccupied?: boolean[];
  seatNames?: (string | null)[];
  tableId: string;
  isMainTable?: boolean;
  tableRole?: string | null;
  role?: string | null;
  name?: string | null;
  label?: string | null;
  note?: string | null;
  onDragOverTable?: (e: DragEvent) => void;
  onDragLeaveTable?: (e: DragEvent) => void;
  onDropOnTable?: (e: DragEvent) => void;
  dropActive?: boolean;
  /** 拖动手柄：调整总览桌卡顺序（与人员拖拽 data 分离） */
  onReorderDragStart?: (e: DragEvent) => void;
  onReorderDragEnd?: (e: DragEvent) => void;
  personSearchQuery?: string;
  /** 有匹配时的首张桌卡：用于 scrollIntoView */
  searchScrollTarget?: boolean;
};

function buildSeatStates(
  capacity: number,
  currentCount: number,
  seats: boolean[] | undefined,
  seatOccupied: boolean[] | undefined,
): boolean[] {
  if (seatOccupied && seatOccupied.length === capacity) return seatOccupied;
  if (seats && seats.length === capacity) return seats;
  return Array.from({ length: capacity }, (_, i) => i < currentCount);
}

export function RoundTableCard({
  tableNo,
  hallName,
  capacity,
  currentCount,
  seats,
  seatOccupied,
  seatNames,
  tableId,
  isMainTable,
  tableRole,
  role,
  name,
  label,
  note,
  onDragOverTable,
  onDragLeaveTable,
  onDropOnTable,
  dropActive,
  onReorderDragStart,
  onReorderDragEnd,
  personSearchQuery,
  searchScrollTarget,
}: RoundTableCardProps) {
  const occ = buildSeatStates(capacity, currentCount, seats, seatOccupied);
  const names =
    seatNames?.length === capacity ? seatNames : Array.from({ length: capacity }, () => null);

  const tableSubtitle = resolveTableCategoryLabel({
    tableRole,
    role,
    hallName,
    name,
    label,
    note,
    isMainTable,
  });

  return (
    <article
      data-table-id={tableId}
      data-paizuo-round-search-scroll={searchScrollTarget ? "1" : undefined}
      className={[
        "min-w-0 rounded-2xl border bg-white p-3 sm:p-4 shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]",
        dropActive ? "border-orange-300 ring-2 ring-orange-200/70" : "border-slate-200/90",
      ].join(" ")}
      onDragOver={onDragOverTable}
      onDragLeave={onDragLeaveTable}
      onDrop={onDropOnTable}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          {onReorderDragStart ? (
            <span
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                onReorderDragStart(e);
              }}
              onDragEnd={(e) => onReorderDragEnd?.(e)}
              className="mt-0.5 shrink-0 cursor-grab select-none text-slate-400 hover:text-slate-600 active:cursor-grabbing"
              aria-label="拖动调整桌次顺序"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") e.preventDefault();
              }}
            >
              ⋮⋮
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-900">
              {tableNo}号桌 · {hallName}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {capacity}人桌 ·{" "}
              <span className="font-semibold text-slate-800">
                {currentCount}/{capacity}
              </span>
            </div>
          </div>
        </div>
        <div className="flex justify-center">
          <SeatRing
            capacity={capacity}
            occupied={occ}
            tableNo={tableNo}
            tableSubtitle={tableSubtitle}
            dropActive={dropActive}
            seatNames={names}
            personSearchQuery={personSearchQuery}
          />
        </div>
      </div>
    </article>
  );
}
