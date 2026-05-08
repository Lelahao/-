import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useNavigate } from "react-router-dom";
import { FullscreenTableCard } from "@/components/fullscreen/FullscreenTableCard";
import { DraggableSeatLabel } from "@/components/fullscreen/DraggableSeatLabel";
import { buildSeedLayout } from "@/fullscreen/seedLayout";
import { movePersonToSeat } from "@/fullscreen/layoutOps";
import { loadLayoutSnapshot, saveLayoutSnapshot } from "@/fullscreen/roundStorage";
import type { LayoutSnapshot, PersonRecord, SeatDragData, TableDefinition } from "@/fullscreen/types";

const btnBase =
  "inline-flex items-center justify-center rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600";

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]";

function parseSeatTarget(overId: string): { tableId: string; seatNo: number } | null {
  if (!overId.startsWith("seat::")) return null;
  const parts = overId.split("::");
  if (parts.length !== 3) return null;
  const seatNo = Number(parts[2]);
  if (!Number.isFinite(seatNo)) return null;
  return { tableId: parts[1], seatNo };
}

export function FullscreenRoundOverview() {
  const navigate = useNavigate();
  const seed = useMemo(() => buildSeedLayout(), []);

  const [people, setPeople] = useState<PersonRecord[]>(() => seed.people);
  const [tables, setTables] = useState<TableDefinition[]>(() => seed.tables);
  const [activeDrag, setActiveDrag] = useState<SeatDragData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await loadLayoutSnapshot();
      if (cancelled || !snap?.people?.length) return;
      setPeople(snap.people);
      if (snap.tables?.length) setTables(snap.tables);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const unassigned = useMemo(
    () => people.filter((p) => !p.assignedTableId || p.assignedSeatNo == null),
    [people],
  );

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as SeatDragData | undefined;
    setActiveDrag(data ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const data = e.active.data.current as SeatDragData | undefined;
    const overId = e.over?.id?.toString();
    if (!data || !overId) return;
    const target = parseSeatTarget(overId);
    if (!target) return;

    setPeople((prev) => movePersonToSeat(prev, data.personId, target.tableId, target.seatNo));
  };

  const onSave = async () => {
    const snapshot: LayoutSnapshot = { people, tables };
    setSaving(true);
    try {
      await saveLayoutSnapshot(snapshot);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-svh min-h-0 flex-col bg-slate-50 text-slate-900">
      <header className="z-20 shrink-0 border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="text-sm font-semibold text-slate-900">排座助手</div>
            <div className="hidden h-5 w-px bg-slate-200 sm:block" />
            <div className="text-sm font-semibold text-slate-900">圆桌排座 · 总览</div>
          </div>

          <div className="hidden items-center gap-2 text-sm text-slate-500 md:flex">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              已保存到本机
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className={btnBase} onClick={onSave} disabled={saving}>
              保存方案
            </button>
            <button type="button" className={btnPrimary}>
              自动排座
            </button>
            <button type="button" className={btnBase}>
              桌次管理
            </button>
            <button type="button" className={btnBase}>
              查看检查
            </button>
            <button
              type="button"
              className={btnBase}
              onClick={() => navigate("/round/overview")}
            >
              退出全屏
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={onSave}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragCancel={() => setActiveDrag(null)}
        onDragEnd={onDragEnd}
      >
        <div className="flex min-h-0 min-w-0 flex-1 gap-4 p-4">
          <aside className={`${cardShell} w-[300px] shrink-0 overflow-auto p-4`}>
            <div className="text-sm font-semibold text-slate-900">未安排人员（{unassigned.length}）</div>
            <p className="mt-1 text-xs text-slate-500">拖拽到座位虚线区可直接入座或换位。</p>

            <div className="mt-4 space-y-2">
              {unassigned.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/60 px-3 py-2"
                >
                  <DraggableSeatLabel
                    personId={p.id}
                    personName={p.name}
                    sourceTableId={null}
                    sourceSeatNo={0}
                  />
                  <span className="text-slate-400" aria-hidden>
                    ⋮⋮
                  </span>
                </div>
              ))}
              {unassigned.length === 0 ? <div className="text-sm text-slate-500">暂无未安排人员</div> : null}
            </div>
          </aside>

          <main className="min-h-0 min-w-0 flex-1 overflow-auto">
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {tables.map((t) => (
                <FullscreenTableCard key={t.id} table={t} people={people} />
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
              拖拽座位标签到其他位置换位
            </div>
          </main>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_12px_40px_rgb(15_23_42_/_0.18)]">
              {activeDrag.personName}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
