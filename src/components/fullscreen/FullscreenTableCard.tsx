import type { PersonRecord, TableDefinition } from "@/fullscreen/types";
import { DraggableSeatLabel } from "@/components/fullscreen/DraggableSeatLabel";
import { DroppableSeatTarget } from "@/components/fullscreen/DroppableSeatTarget";

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_10px_30px_rgb(15_23_42_/_0.06)]";

function personAtSeat(people: PersonRecord[], tableId: string, seatNo: number) {
  return people.find((p) => p.assignedTableId === tableId && p.assignedSeatNo === seatNo);
}

export function FullscreenTableCard(props: {
  table: TableDefinition;
  people: PersonRecord[];
}) {
  const { table, people } = props;
  const radius = 150;

  return (
    <section className={`${cardShell} p-5`}>
      <div className="text-center">
        <div className="text-base font-semibold text-slate-900">
          {table.no}号桌 · {table.hallName}
        </div>
        <div className="mt-1 text-xs text-slate-500">{table.capacity}人桌</div>
      </div>

      <div className="relative mx-auto mt-4 h-[360px] w-[360px]">
        <div className="absolute left-1/2 top-1/2 w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-center text-xs text-slate-600">
          <div className="font-semibold text-slate-900">座位示意</div>
          <div className="mt-1 text-[11px] text-slate-500">拖拽姓名到虚线座位区</div>
        </div>

        {Array.from({ length: table.capacity }, (_, i) => {
          const seatNo = i + 1;
          const p = personAtSeat(people, table.id, seatNo);
          const angle = (2 * Math.PI * i) / table.capacity - Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          return (
            <div
              key={seatNo}
              className="absolute left-1/2 top-1/2 w-[150px]"
              style={{
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
              }}
            >
              <DroppableSeatTarget tableId={table.id} seatNo={seatNo} occupied={Boolean(p)}>
                {p ? (
                  <DraggableSeatLabel
                    personId={p.id}
                    personName={p.name}
                    sourceTableId={table.id}
                    sourceSeatNo={seatNo}
                  />
                ) : (
                  <div className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-white/30 px-2 py-2 text-center">
                    <span className="inline-flex h-7 w-7 rounded-full border border-dashed border-slate-300 bg-white" />
                    <span className="text-[11px] font-medium text-slate-500">空位</span>
                  </div>
                )}
              </DroppableSeatTarget>
            </div>
          );
        })}
      </div>
    </section>
  );
}
