import { useLayoutEffect, useRef, useState, type DragEvent } from "react";
import type { PersonRecord, TableDefinition } from "@/fullscreen/types";
import { DraggableSeatLabel } from "@/components/fullscreen/DraggableSeatLabel";
import { DroppableSeatTarget } from "@/components/fullscreen/DroppableSeatTarget";
import { RoundTableVisual } from "@/components/round/RoundTableVisual";
import { resolveTableCategoryLabel } from "@/config/seatRoleTemplates";
import { FS_FULLSCREEN_OUTER_CAP } from "@/fullscreen/fullscreenVisualCaps";
import { isReservedPlaceholderPersonName } from "@/fullscreen/normalizeLayoutSnapshot";

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_10px_30px_rgb(15_23_42_/_0.06)]";

const FS_BASE_BOX_CAP = 560;
const FS_BASE_BOX_MIN = 220;

function fractionOfWrapWidthForBaseBox(w: number): number {
  return Math.round(Math.max(FS_BASE_BOX_MIN, Math.min(FS_BASE_BOX_CAP, w * 0.42)));
}

function personAtSeat(people: PersonRecord[], tableId: string, seatNo: number) {
  const p = people.find((x) => x.assignedTableId === tableId && x.assignedSeatNo === seatNo);
  if (!p || isReservedPlaceholderPersonName(p.name)) return undefined;
  return p;
}

export function FullscreenTableCard(props: {
  table: TableDefinition;
  people: PersonRecord[];
  /** 在自适应尺寸基础上的手动倍率（全屏顶栏 ±） */
  visualScale?: number;
  /** 顶栏姓名搜索 */
  personSearchQuery?: string;
  searchScrollTarget?: boolean;
  /** 与总览一致：拖动 ⋮⋮ 调整桌卡顺序（HTML5 DataTransfer） */
  onTableReorderDragStart?: (e: DragEvent, tableId: string) => void;
  onTableReorderDragEnd?: () => void;
  tableReorderDropActive?: boolean;
  onTableReorderDragOver?: (e: DragEvent, tableId: string) => void;
  onTableReorderDragLeave?: (e: DragEvent, tableId: string) => void;
  onTableReorderDrop?: (e: DragEvent, tableId: string) => void;
}) {
  const {
    table,
    people,
    visualScale = 1,
    personSearchQuery = "",
    searchScrollTarget = false,
    onTableReorderDragStart,
    onTableReorderDragEnd,
    tableReorderDropActive,
    onTableReorderDragOver,
    onTableReorderDragLeave,
    onTableReorderDrop,
  } = props;
  const tableKind = resolveTableCategoryLabel(table);

  const visualWrapRef = useRef<HTMLDivElement>(null);
  const [baseBox, setBaseBox] = useState(360);

  useLayoutEffect(() => {
    const el = visualWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr?.width) return;
      setBaseBox(fractionOfWrapWidthForBaseBox(cr.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layoutBoxPx = Math.round(Math.max(200, Math.min(FS_FULLSCREEN_OUTER_CAP, baseBox)));
  const diagramBoxPx = Math.round(
    Math.max(200, Math.min(FS_FULLSCREEN_OUTER_CAP, baseBox * Math.max(0.75, Math.min(2, visualScale)))),
  );

  const seatOccupied = Array.from({ length: table.capacity }, (_, i) => {
    const sn = i + 1;
    return Boolean(personAtSeat(people, table.id, sn));
  });
  const seatNames = Array.from({ length: table.capacity }, (_, i) => {
    const sn = i + 1;
    return personAtSeat(people, table.id, sn)?.name ?? null;
  });

  return (
    <section
      data-table-id={table.id}
      data-paizuo-round-search-scroll={searchScrollTarget ? "1" : undefined}
      className={[
        cardShell,
        "flex min-w-0 flex-col p-3 sm:p-5",
        tableReorderDropActive ? "border-orange-300 ring-2 ring-orange-200/70" : "",
      ].join(" ")}
      onDragOver={onTableReorderDragOver ? (e) => onTableReorderDragOver(e, table.id) : undefined}
      onDragLeave={onTableReorderDragLeave ? (e) => onTableReorderDragLeave(e, table.id) : undefined}
      onDrop={onTableReorderDrop ? (e) => onTableReorderDrop(e, table.id) : undefined}
    >
      <div className="flex items-start gap-2">
        {onTableReorderDragStart ? (
          <span
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              onTableReorderDragStart(e, table.id);
            }}
            onDragEnd={() => onTableReorderDragEnd?.()}
            className="mt-0.5 shrink-0 cursor-grab select-none text-slate-400 hover:text-slate-600 active:cursor-grabbing"
            aria-label="拖动调整桌卡顺序"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") e.preventDefault();
            }}
          >
            ⋮⋮
          </span>
        ) : null}
        <div className="min-w-0 flex-1 text-center">
          <div className="text-base font-semibold text-slate-900">
            {table.no}号桌 · {table.hallName}
          </div>
          <div className="mt-1 text-xs text-slate-500">{table.capacity}人桌</div>
        </div>
      </div>

      <div ref={visualWrapRef} className="mt-1 w-full min-w-0">
        <div
          className="relative mx-auto overflow-visible"
          style={{
            width: layoutBoxPx,
            height: layoutBoxPx,
            maxWidth: "100%",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: diagramBoxPx,
              height: diagramBoxPx,
              transform: "translate(-50%, -50%)",
            }}
          >
            <RoundTableVisual
              mode="fullscreen"
              tableNo={table.no}
              tableKind={tableKind}
              capacity={table.capacity}
              seatOccupied={seatOccupied}
              seatNames={seatNames}
              fullscreenBoxPx={diagramBoxPx}
              personSearchQuery={personSearchQuery}
              renderSeat={({ seatNo, searchMatch }) => {
                const person = personAtSeat(people, table.id, seatNo);
                const labelTitle = person ? `${seatNo}号 · ${person.name}` : `${seatNo}号`;

                return (
                  <div className="flex justify-center">
                    <DroppableSeatTarget tableId={table.id} seatNo={seatNo} occupied={Boolean(person)}>
                      {person ? (
                        <DraggableSeatLabel
                          personId={person.id}
                          personName={person.name}
                          sourceTableId={table.id}
                          sourceSeatNo={seatNo}
                          density="comfortable"
                          searchHighlight={Boolean(searchMatch)}
                        />
                      ) : (
                        <div
                          className="flex min-h-[44px] min-w-[48px] items-center justify-center px-2 py-1 text-center"
                          title={labelTitle}
                        >
                          <span className="text-[11px] font-medium text-slate-500">空位</span>
                        </div>
                      )}
                    </DroppableSeatTarget>
                  </div>
                );
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
