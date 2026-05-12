import { useEffect, useMemo, useState, type DragEvent } from "react";
import { flushSync } from "react-dom";
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
import { useNavigate, useLocation } from "react-router-dom";
import { FullscreenTableCard } from "@/components/fullscreen/FullscreenTableCard";
import { DraggableSeatLabel } from "@/components/fullscreen/DraggableSeatLabel";
import { EditPersonNameModal } from "@/components/fullscreen/EditPersonNameModal";
import { EditTableCapacityModal } from "@/components/fullscreen/EditTableCapacityModal";
import {
  DroppableUnassignedPool,
  UNASSIGNED_POOL_DROP_ID,
} from "@/components/fullscreen/DroppableUnassignedPool";
import { RoundOverviewBoard } from "@/components/round/RoundOverviewBoard";
import { AddPersonModal } from "@/components/round/AddPersonModal";
import { BulkImportPeopleModal } from "@/components/round/BulkImportPeopleModal";
import { ImportResultModal } from "@/components/round/ImportResultModal";
import { buildSeedLayout } from "@/fullscreen/seedLayout";
import { movePersonToSeat, unassignPerson } from "@/fullscreen/layoutOps";
import { normalizeLayoutSnapshot, isReservedPlaceholderPersonName } from "@/fullscreen/normalizeLayoutSnapshot";
import { loadLayoutSnapshot, saveLayoutSnapshot } from "@/fullscreen/roundStorage";
import type { LayoutSnapshot, PersonRecord, SeatDragData, TableDefinition } from "@/fullscreen/types";
import { layoutToRoundPlan, planDetailToLayoutSnapshot, roundPlanToLayout } from "@/lib/layoutBridge";
import { isLinkableBackendPlanId } from "@/lib/roundBackendPlanId";
import { getPlanDetail, unassignPerson as unassignPersonApi, type PeopleImportResult } from "@/api/plans";
import { saveTables } from "@/api/tables";
import { useRoundPersonSearchStore, roundPersonSearchMatches } from "@/stores/roundPersonSearchStore";
import { useRoundPlanDemoStore } from "@/stores/roundPlanDemoStore";
import { DEFAULT_EXPORT_PLAN_NAME } from "@/features/export/exportScene";

const TABLE_ORDER_MIME = "application/x-paizuo-table-order";

const ROUND_LINKED_PLAN_STORAGE = "paizuo-round-linked-plan-id";
const ROUND_LINKED_PLAN_NAME_STORAGE = "paizuo-round-linked-plan-name";

function reorderTablesList(prev: TableDefinition[], sourceId: string, targetId: string): TableDefinition[] {
  if (sourceId === targetId) return prev;
  const next = [...prev];
  const si = next.findIndex((t) => t.id === sourceId);
  if (si < 0) return prev;
  const [item] = next.splice(si, 1);
  let insertAt = next.findIndex((t) => t.id === targetId);
  if (insertAt < 0) insertAt = next.length;
  next.splice(insertAt, 0, item);
  return next;
}

const btnBase =
  "inline-flex items-center justify-center rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600";

function parseSeatTarget(overId: string): { tableId: string; seatNo: number } | null {
  if (!overId.startsWith("seat::")) return null;
  const parts = overId.split("::");
  if (parts.length !== 3) return null;
  const seatNo = Number(parts[2]);
  if (!Number.isFinite(seatNo)) return null;
  return { tableId: parts[1], seatNo };
}

const FS_COLS_STORAGE = "paizuo-fullscreen-cols-per-row";
const FS_ZOOM_STORAGE = "paizuo-fullscreen-visual-scale";

/** 圆桌视图缩放上限（与顶栏 ± 一致） */
const FS_VISUAL_SCALE_MAX = 2;

function readFullscreenCols(): number {
  try {
    const raw = localStorage.getItem(FS_COLS_STORAGE);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 8) return n;
  } catch {
    /* ignore */
  }
  return 4;
}

function readVisualScale(): number {
  try {
    const raw = localStorage.getItem(FS_ZOOM_STORAGE);
    const z = raw ? parseFloat(raw) : NaN;
    if (Number.isFinite(z) && z >= 0.75 && z <= FS_VISUAL_SCALE_MAX) return Math.round(z * 100) / 100;
  } catch {
    /* ignore */
  }
  return 1;
}

export function FullscreenRoundOverview() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialSnap = useMemo(() => normalizeLayoutSnapshot(buildSeedLayout()), []);

  const [people, setPeople] = useState<PersonRecord[]>(() => initialSnap.people);
  const [tables, setTables] = useState<TableDefinition[]>(() => initialSnap.tables);
  const [colsPerRow, setColsPerRow] = useState<number>(() => readFullscreenCols());
  const [visualScale, setVisualScale] = useState(readVisualScale);
  const [activeDrag, setActiveDrag] = useState<SeatDragData | null>(null);
  const [saving, setSaving] = useState(false);
  const [tableReorderDropId, setTableReorderDropId] = useState<string | null>(null);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [importResultOpen, setImportResultOpen] = useState(false);
  const [importResult, setImportResult] = useState<PeopleImportResult | null>(null);
  const [editPersonTarget, setEditPersonTarget] = useState<
    { planId: string; personId: string; name: string; seatLabel: string } | null
  >(null);
  const [capacityEditTarget, setCapacityEditTarget] = useState<
    { planId: string; table: TableDefinition } | null
  >(null);

  const plan = useRoundPlanDemoStore((s) => s.plan);
  const setPlan = useRoundPlanDemoStore((s) => s.setPlan);

  const navState = location.state as { planName?: string } | null;
  const fullscreenPlanName = useMemo(() => {
    if (navState?.planName?.trim()) return navState.planName.trim();
    try {
      const n = localStorage.getItem(ROUND_LINKED_PLAN_NAME_STORAGE);
      if (n?.trim()) return n.trim();
    } catch {
      /* ignore */
    }
    return DEFAULT_EXPORT_PLAN_NAME;
  }, [navState, location.key, plan.planId]);

  const refreshPlanFromBackend = async (planIdOverride?: string) => {
    const pid = planIdOverride ?? plan.planId;
    if (!isLinkableBackendPlanId(pid)) return;
    const detail = await getPlanDetail(pid);
    const layout = normalizeLayoutSnapshot(planDetailToLayoutSnapshot(detail));
    setPeople(layout.people);
    setTables(layout.tables);
    setPlan(layoutToRoundPlan(layout, pid));
    try {
      await saveLayoutSnapshot(layout);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let cancelled = false;
    const apply = (snap: LayoutSnapshot) => {
      if (cancelled) return;
      const n = normalizeLayoutSnapshot(snap);
      setPeople(n.people);
      setTables(n.tables);
    };

    (async () => {
      if (isLinkableBackendPlanId(plan.planId)) {
        apply(roundPlanToLayout(plan));
        return;
      }
      const snap = await loadLayoutSnapshot();
      if (cancelled) return;
      if (snap?.tables?.length) {
        apply(snap);
      } else {
        apply(roundPlanToLayout(plan));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.key, plan]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const unassigned = useMemo(
    () =>
      people.filter(
        (p) =>
          (!p.assignedTableId || p.assignedSeatNo == null) && !isReservedPlaceholderPersonName(p.name),
      ),
    [people],
  );

  const personSearchQuery = useRoundPersonSearchStore((s) => s.query);
  const setPersonSearchQuery = useRoundPersonSearchStore((s) => s.setQuery);

  const searchScrollTarget = useMemo(() => {
    const q = personSearchQuery.trim().toLowerCase();
    if (!q) return { tableId: null as string | null, unassignedPersonId: null as string | null };
    for (const tbl of tables) {
      for (let sn = 1; sn <= tbl.capacity; sn++) {
        const person = people.find((p) => p.assignedTableId === tbl.id && p.assignedSeatNo === sn);
        if (person && person.name.trim().toLowerCase().includes(q)) {
          return { tableId: tbl.id, unassignedPersonId: null as string | null };
        }
      }
    }
    const u = unassigned.find((p) => p.name.trim().toLowerCase().includes(q));
    return { tableId: null as string | null, unassignedPersonId: u?.id ?? null };
  }, [personSearchQuery, tables, people, unassigned]);

  useEffect(() => {
    const raw = personSearchQuery.trim();
    if (!raw) return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>("[data-paizuo-round-search-scroll=\"1\"]")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [personSearchQuery, searchScrollTarget.tableId, searchScrollTarget.unassignedPersonId]);

  const onColsChange = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    const v = Math.max(1, Math.min(8, n));
    setColsPerRow(v);
    try {
      localStorage.setItem(FS_COLS_STORAGE, String(v));
    } catch {
      /* ignore */
    }
  };

  const adjustVisualScale = (delta: number) => {
    setVisualScale((prev) => {
      const n = Math.round((prev + delta) * 100) / 100;
      const c = Math.max(0.75, Math.min(FS_VISUAL_SCALE_MAX, n));
      try {
        localStorage.setItem(FS_ZOOM_STORAGE, String(c));
      } catch {
        /* ignore */
      }
      return c;
    });
  };

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as SeatDragData | undefined;
    setActiveDrag(data ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const data = e.active.data.current as SeatDragData | undefined;
    const overId = e.over?.id?.toString();
    if (!data || !overId) return;
    if (overId === UNASSIGNED_POOL_DROP_ID) {
      setPeople((prev) => unassignPerson(prev, data.personId));
      return;
    }
    const target = parseSeatTarget(overId);
    if (!target) return;

    setPeople((prev) => movePersonToSeat(prev, data.personId, target.tableId, target.seatNo));
  };

  const boardStats = useMemo(
    () => ({
      tableCount: tables.length,
      peopleTotal: people.length,
      assigned: people.filter((p) => p.assignedTableId && p.assignedSeatNo != null).length,
      unassigned: unassigned.length,
    }),
    [tables.length, people, unassigned],
  );

  const onSave = async () => {
    const snapshot = normalizeLayoutSnapshot({ people, tables });
    setPeople(snapshot.people);
    setSaving(true);
    try {
      await saveLayoutSnapshot(snapshot);
      window.alert("方案布局已保存。");
    } finally {
      setSaving(false);
    }
  };

  /** 编辑某桌 capacity：减容时先确认+逐人 unassignPerson，再全量 saveTables，最后 refresh。 */
  const submitCapacityChange = async (targetPlanId: string, targetTableId: string, newCap: number) => {
    const tbl = tables.find((t) => t.id === targetTableId);
    if (!tbl) throw new Error("未找到目标桌");
    if (newCap === tbl.capacity) return;

    if (newCap < tbl.capacity) {
      const overflow = people
        .filter((p) => p.assignedTableId === targetTableId && (p.assignedSeatNo ?? 0) > newCap)
        .sort((a, b) => (a.assignedSeatNo ?? 0) - (b.assignedSeatNo ?? 0));

      if (overflow.length > 0) {
        const seatList = overflow.map((p) => `${p.assignedSeatNo}号`).join("、");
        const ok = window.confirm(
          `减少人数后，超出位置（${seatList}）上的人员将被移出座位，但不会从人员管理中删除。是否继续？`,
        );
        if (!ok) return;
        for (const p of overflow) {
          await unassignPersonApi(targetPlanId, p.id);
        }
      }
    }

    const tablesPayload = tables.map((t) => ({
      id: t.id,
      tableNo: t.no,
      hallName: t.hallName,
      capacity: t.id === targetTableId ? newCap : t.capacity,
    }));
    await saveTables({ planId: targetPlanId, tables: tablesPayload });

    // 全屏页的座位绑定（drag/move/unassign）当前只保存在本地 state + localStorage，
    // 还未同步到 backend 的 people.assigned_*/seats.person_id。
    // 因此这里不能调用 refreshPlanFromBackend——backend 会返回"几乎全空"的座位状态，
    // 把整桌人误覆盖成空座。改为对本地 state 做精确更新：只动 capacity 和超出座位的人员。
    const nextTables = tables.map((t) =>
      t.id === targetTableId ? { ...t, capacity: newCap } : t,
    );
    const nextPeople = people.map((p) =>
      p.assignedTableId === targetTableId && (p.assignedSeatNo ?? 0) > newCap
        ? { ...p, assignedTableId: null, assignedSeatNo: null }
        : p,
    );
    const nextLayout = normalizeLayoutSnapshot({ people: nextPeople, tables: nextTables });
    setTables(nextLayout.tables);
    setPeople(nextLayout.people);
    setPlan(layoutToRoundPlan(nextLayout, targetPlanId));
    try {
      await saveLayoutSnapshot(nextLayout);
    } catch {
      /* ignore */
    }
  };

  const onTableReorderDragStart = (e: DragEvent, sourceTableId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData(TABLE_ORDER_MIME, sourceTableId);
    e.dataTransfer.effectAllowed = "move";
  };

  const onTableReorderDragEnd = () => {
    setTableReorderDropId(null);
  };

  const onTableReorderDragOver = (e: DragEvent, tableId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setTableReorderDropId(tableId);
  };

  const onTableReorderDragLeave = (e: DragEvent, tableId: string) => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setTableReorderDropId((cur) => (cur === tableId ? null : cur));
  };

  const onTableReorderDrop = (e: DragEvent, targetTableId: string) => {
    e.preventDefault();
    setTableReorderDropId(null);
    const orderSource = e.dataTransfer.getData(TABLE_ORDER_MIME);
    if (!orderSource || orderSource === targetTableId) return;
    setTables((prevTables) => {
      const nextTables = reorderTablesList(prevTables, orderSource, targetTableId);
      void saveLayoutSnapshot(normalizeLayoutSnapshot({ people, tables: nextTables }));
      return nextTables;
    });
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

          <div className="hidden shrink-0 items-center md:flex">
            <label className="flex w-[13.5rem] min-w-0 items-center gap-2 text-sm text-slate-600">
              <span className="sr-only">搜索姓名</span>
              <input
                type="search"
                enterKeyHint="search"
                placeholder="搜索姓名…"
                autoComplete="off"
                value={personSearchQuery}
                onChange={(e) => setPersonSearchQuery(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="mr-1 flex items-center gap-1.5 text-sm text-slate-600">
              <span className="whitespace-nowrap">每行桌数</span>
              <input
                type="number"
                min={1}
                max={8}
                inputMode="numeric"
                className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm font-medium text-slate-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                value={colsPerRow}
                onChange={(e) => onColsChange(e.target.value)}
                aria-label="全屏每行显示几张桌子"
              />
            </label>
            <div className="mr-1 flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/90 px-1 py-0.5">
              <span className="hidden whitespace-nowrap pl-1 text-xs text-slate-600 sm:inline">圆桌</span>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-lg font-semibold leading-none text-slate-700 shadow-sm hover:bg-slate-50"
                aria-label="缩小圆桌示意"
                onClick={() => adjustVisualScale(-0.05)}
              >
                −
              </button>
              <span className="w-9 text-center text-xs tabular-nums text-slate-800">{Math.round(visualScale * 100).toString()}%</span>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-lg font-semibold leading-none text-slate-700 shadow-sm hover:bg-slate-50"
                aria-label="放大圆桌示意"
                onClick={() => adjustVisualScale(0.05)}
              >
                +
              </button>
            </div>
            <button type="button" className={btnBase} onClick={onSave} disabled={saving}>
              保存方案
            </button>
            <button
              type="button"
              className={btnBase}
              onClick={() => {
                let pid: string | null = isLinkableBackendPlanId(plan.planId) ? plan.planId : null;
                if (!pid) {
                  try {
                    const linked = localStorage.getItem(ROUND_LINKED_PLAN_STORAGE);
                    if (linked && isLinkableBackendPlanId(linked)) pid = linked;
                  } catch {
                    /* ignore */
                  }
                }
                if (pid) {
                  navigate("/plans", { state: { openEditPlanId: pid } });
                } else {
                  navigate("/plans", { state: { openRoundManage: true } });
                }
              }}
            >
              桌次管理
            </button>
            <button
              type="button"
              className={btnBase}
              onClick={() => navigate("/round/check")}
            >
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
        <div className="flex min-h-0 min-w-0 flex-1 p-4">
          <RoundOverviewBoard
            mode="fullscreen"
            planName={fullscreenPlanName}
            stats={boardStats}
            tableCount={tables.length}
            gridCols={colsPerRow}
            preGrid={
              <DroppableUnassignedPool>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">未安排人员（{unassigned.length}）</div>
                    <p className="mt-1 text-xs text-slate-500">
                      已入座人员可拖入此处取消桌位；此处人员可拖回空座入座。
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAddPersonOpen(true)}
                      className="inline-flex items-center rounded-lg border border-orange-500 bg-white px-3 py-1.5 text-sm font-medium text-orange-600 shadow-sm hover:bg-orange-50"
                    >
                      + 添加人员
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkImportOpen(true)}
                      className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      批量导入
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex min-h-[44px] flex-wrap gap-2">
                  {unassigned.map((p) => (
                    <div
                      key={p.id}
                      data-paizuo-round-search-scroll={
                        searchScrollTarget.unassignedPersonId === p.id ? "1" : undefined
                      }
                    >
                      <DraggableSeatLabel
                        personId={p.id}
                        personName={p.name}
                        sourceTableId={null}
                        sourceSeatNo={0}
                        density="compact"
                        searchHighlight={roundPersonSearchMatches(p.name, personSearchQuery)}
                        onActivate={() => {
                          let pid: string | null = isLinkableBackendPlanId(plan.planId) ? plan.planId : null;
                          if (!pid) {
                            try {
                              const linked = localStorage.getItem(ROUND_LINKED_PLAN_STORAGE);
                              if (linked && isLinkableBackendPlanId(linked)) pid = linked;
                            } catch {
                              /* ignore */
                            }
                          }
                          if (!pid) {
                            window.alert("演示数据下无法编辑人员，请从「方案管理」进入真实方案。");
                            return;
                          }
                          setEditPersonTarget({
                            planId: pid,
                            personId: p.id,
                            name: p.name,
                            seatLabel: "未安排人员",
                          });
                        }}
                      />
                    </div>
                  ))}
                  {unassigned.length === 0 ? (
                    <span className="text-sm text-slate-400">暂无未安排人员</span>
                  ) : null}
                </div>
              </DroppableUnassignedPool>
            }
            postGrid={
              <div className="mt-4 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
                拖拽座位标签到其他位置换位，或拖入顶栏「未安排人员」取消桌位。
              </div>
            }
          >
            {tables.map((t) => (
              <FullscreenTableCard
                key={t.id}
                table={t}
                people={people}
                visualScale={visualScale}
                personSearchQuery={personSearchQuery}
                searchScrollTarget={searchScrollTarget.tableId === t.id}
                onTableReorderDragStart={onTableReorderDragStart}
                onTableReorderDragEnd={onTableReorderDragEnd}
                tableReorderDropActive={tableReorderDropId === t.id}
                onTableReorderDragOver={onTableReorderDragOver}
                onTableReorderDragLeave={onTableReorderDragLeave}
                onTableReorderDrop={onTableReorderDrop}
                onPersonClick={(person, seatLabel) => {
                  let pid: string | null = isLinkableBackendPlanId(plan.planId) ? plan.planId : null;
                  if (!pid) {
                    try {
                      const linked = localStorage.getItem(ROUND_LINKED_PLAN_STORAGE);
                      if (linked && isLinkableBackendPlanId(linked)) pid = linked;
                    } catch {
                      /* ignore */
                    }
                  }
                  if (!pid) {
                    window.alert("演示数据下无法编辑人员，请从「方案管理」进入真实方案。");
                    return;
                  }
                  setEditPersonTarget({
                    planId: pid,
                    personId: person.id,
                    name: person.name,
                    seatLabel,
                  });
                }}
                onCapacityEdit={(targetTable) => {
                  let pid: string | null = isLinkableBackendPlanId(plan.planId) ? plan.planId : null;
                  let lsLinked: string | null = null;
                  try {
                    lsLinked = localStorage.getItem(ROUND_LINKED_PLAN_STORAGE);
                  } catch {
                    /* ignore */
                  }
                  if (!pid && lsLinked && isLinkableBackendPlanId(lsLinked)) pid = lsLinked;
                  if (!pid) {
                    window.alert("演示数据下无法修改桌人数，请从「方案管理」进入真实方案。");
                    return;
                  }
                  setCapacityEditTarget({ planId: pid, table: targetTable });
                }}
              />
            ))}
          </RoundOverviewBoard>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="rounded-md border border-dashed border-slate-400/85 bg-slate-50/90 px-3 py-2 text-sm font-normal text-slate-900 shadow-sm min-h-[44px] min-w-[48px] inline-flex items-center justify-center">
              {activeDrag.personName}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AddPersonModal
        open={addPersonOpen}
        onClose={() => setAddPersonOpen(false)}
        planId={plan.planId}
        planDisplayName={fullscreenPlanName}
        onSuccess={refreshPlanFromBackend}
      />

      {editPersonTarget ? (
        <EditPersonNameModal
          open
          onClose={() => setEditPersonTarget(null)}
          planId={editPersonTarget.planId}
          personId={editPersonTarget.personId}
          initialName={editPersonTarget.name}
          seatLabel={editPersonTarget.seatLabel}
          onRenamed={(newName) => {
            // 外科手术式更新：仅改这一个人的 name，避免 refreshPlanFromBackend
            // 把本地未同步到 backend 的座位绑定一起覆盖成空座。
            const target = editPersonTarget;
            setPeople((prev) => {
              const next = prev.map((p) =>
                p.id === target.personId ? { ...p, name: newName } : p,
              );
              void saveLayoutSnapshot({ people: next, tables });
              return next;
            });
          }}
          onDeleted={() => {
            // 外科手术式更新：仅移除这一个人，其余人员的座位绑定保持不变。
            const target = editPersonTarget;
            setPeople((prev) => {
              const next = prev.filter((p) => p.id !== target.personId);
              void saveLayoutSnapshot({ people: next, tables });
              return next;
            });
          }}
        />
      ) : null}

      {capacityEditTarget ? (
        <EditTableCapacityModal
          open
          onClose={() => setCapacityEditTarget(null)}
          table={capacityEditTarget.table}
          onSubmit={(newCap) =>
            submitCapacityChange(capacityEditTarget.planId, capacityEditTarget.table.id, newCap)
          }
        />
      ) : null}

      <BulkImportPeopleModal
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        planId={plan.planId}
        planDisplayName={fullscreenPlanName}
        onImportComplete={async (res) => {
          flushSync(() => {
            setImportResult(res);
            setImportResultOpen(true);
          });
          try {
            await refreshPlanFromBackend();
          } catch {
            /* 列表刷新失败不阻断导入结果展示 */
          }
        }}
      />

      <ImportResultModal
        open={importResultOpen}
        onClose={() => {
          setImportResultOpen(false);
          setImportResult(null);
        }}
        planDisplayName={fullscreenPlanName}
        result={importResult}
        onContinueAdd={() => {
          setImportResultOpen(false);
          setImportResult(null);
          setAddPersonOpen(true);
        }}
        onViewPersonManage={() => {
          setImportResultOpen(false);
          setImportResult(null);
          navigate("/round/overview", { state: { openPersonManage: true } });
        }}
        onDone={async () => {
          await refreshPlanFromBackend();
          setImportResultOpen(false);
          setImportResult(null);
        }}
      />
    </div>
  );
}
