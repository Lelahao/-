import type { DragEvent } from "react";

export type RoundTableCardProps = {
  tableNo: number;
  hallName: string;
  capacity: number;
  currentCount: number;
  seats?: boolean[];
  tableId: string;
  onDragOverTable?: (e: DragEvent) => void;
  onDragLeaveTable?: (e: DragEvent) => void;
  onDropOnTable?: (e: DragEvent) => void;
  dropActive?: boolean;
};

function buildSeatStates(capacity: number, currentCount: number, seats: boolean[] | undefined): boolean[] {
  if (seats && seats.length === capacity) return seats;
  return Array.from({ length: capacity }, (_, i) => i < currentCount);
}

function SeatRing({ occupied }: { occupied: boolean[] }) {
  const capacity = occupied.length;
  const size = 84;
  const cx = size / 2;
  const cy = size / 2;
  const rDot = 4.2;
  const ringR = Math.min(cx, cy) - rDot - 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
      {occupied.map((occ, i) => {
        const angle = (2 * Math.PI * i) / capacity - Math.PI / 2;
        const x = cx + ringR * Math.cos(angle);
        const y = cy + ringR * Math.sin(angle);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={rDot}
            className={occ ? "fill-orange-500" : "fill-white stroke-slate-300"}
            strokeWidth={occ ? 0 : 1}
          />
        );
      })}
    </svg>
  );
}

export function RoundTableCard({
  tableNo,
  hallName,
  capacity,
  currentCount,
  seats,
  tableId,
  onDragOverTable,
  onDragLeaveTable,
  onDropOnTable,
  dropActive,
}: RoundTableCardProps) {
  const occ = buildSeatStates(capacity, currentCount, seats);

  return (
    <article
      data-table-id={tableId}
      className={[
        "rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]",
        dropActive ? "border-orange-300 ring-2 ring-orange-200/70" : "border-slate-200/90",
      ].join(" ")}
      onDragOver={onDragOverTable}
      onDragLeave={onDragLeaveTable}
      onDrop={onDropOnTable}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
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
        <SeatRing occupied={occ} />
      </div>
    </article>
  );
}
