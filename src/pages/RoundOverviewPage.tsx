import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useLocation } from "react-router-dom";
import { getPlanDetail } from "@/api/plans";
import { RoundTableCard } from "@/components/RoundTableCard";
import { RoundVersionHistoryDrawer } from "@/components/RoundVersionHistoryDrawer";
import { RoundCheckPanel } from "@/components/RoundCheckPanel";
import { RoundOverviewBoard, overviewGridColsClass, overviewGridColsStyle } from "@/components/round/RoundOverviewBoard";
import { loadLayoutSnapshot, saveLayoutSnapshot } from "@/fullscreen/roundStorage";
import { buildRoundOverviewTableRows } from "@/lib/buildRoundOverviewTableRows";
import { DEFAULT_EXPORT_PLAN_NAME } from "@/features/export/exportScene";
import { layoutToRoundPlan, planDetailToLayoutSnapshot, roundPlanToLayout } from "@/lib/layoutBridge";
import { isLinkableBackendPlanId } from "@/lib/roundBackendPlanId";
import { runRoundSeatChecks, type RoundPlanSnapshot } from "@/lib/roundSeatEngine";
import { getSeatRoleLabel } from "@/config/seatRoleTemplates";
import { useRoundPlanDemoStore } from "@/stores/roundPlanDemoStore";
import { useRoundPersonSearchStore, roundPersonSearchMatches } from "@/stores/roundPersonSearchStore";

const DIST_SEGMENTS = [
  { n: 6, c: 1 },
  { n: 9, c: 2 },
  { n: 10, c: 4 },
  { n: 13, c: 1 },
] as const;

const COLS_STORAGE = "paizuo-overview-cols-per-row";

/** 与后端方案关联的 planId（从方案管理进入总览时写入） */
const ROUND_LINKED_PLAN_STORAGE = "paizuo-round-linked-plan-id";

/** 与后端方案关联的展示名称（与 planId 同步，供刷新后标题回显） */
const ROUND_LINKED_PLAN_NAME_STORAGE = "paizuo-round-linked-plan-name";

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]";

const dragMime = "application/x-paizuo-person";
const tableOrderMime = "application/x-paizuo-table-order";

function reorderTablesInPlan(prev: RoundPlanSnapshot, sourceId: string, targetId: string) {
  if (sourceId === targetId) return prev;
  const tables = [...prev.tables];
  const si = tables.findIndex((t) => t.id === sourceId);
  if (si < 0) return prev;
  const [item] = tables.splice(si, 1);
  let insertAt = tables.findIndex((t) => t.id === targetId);
  if (insertAt < 0) insertAt = tables.length;
  tables.splice(insertAt, 0, item);
  return { ...prev, tables };
}

const UNASSIGNED_PREVIEW_MAX = 8;

const unassignedChipClass =
  "inline-flex min-h-[32px] w-fit max-w-[120px] shrink-0 cursor-grab select-none items-center justify-center gap-0 px-0 py-1 text-sm font-semibold text-slate-900 transition active:cursor-grabbing";

type DropPerson = { id: string; name: string };

function readColsPreference(fallback: number): number {
  try {
    const raw = localStorage.getItem(COLS_STORAGE);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 8) return n;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function RoundOverviewPage() {
  const location = useLocation();
  const plan = useRoundPlanDemoStore((s) => s.plan);
  const setPlan = useRoundPlanDemoStore((s) => s.setPlan);
  const personSearchQuery = useRoundPersonSearchStore((s) => s.query);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [draggingPersonId, setDraggingPersonId] = useState<string | null>(null);
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);

  const [colsPerRow, setColsPerRow] = useState<number>(() => readColsPreference(4));
  const [assignedListOpen, setAssignedListOpen] = useState(false);

  const navState = location.state as { planId?: string; planName?: string } | null;

  const overviewPlanName = useMemo(() => {
    if (navState?.planName?.trim()) return navState.planName.trim();
    try {
      const n = localStorage.getItem(ROUND_LINKED_PLAN_NAME_STORAGE);
      if (n?.trim()) return n.trim();
    } catch {
      /* ignore */
    }
    return DEFAULT_EXPORT_PLAN_NAME;
  }, [navState, location.key, plan.planId]);

  const overviewPlanSubtitle = isLinkableBackendPlanId(plan.planId)
    ? "后端方案 · 与检查引擎联动"
    : "演示数据 · 与检查引擎联动";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nav = location.state as { planId?: string; planName?: string } | null;
      if (nav?.planId) {
        try {
          localStorage.setItem(ROUND_LINKED_PLAN_STORAGE, nav.planId);
          if (nav.planName?.trim()) {
            localStorage.setItem(ROUND_LINKED_PLAN_NAME_STORAGE, nav.planName.trim());
          }
        } catch {
          /* ignore */
        }
      }
      let linkedId: string | null = null;
      try {
        linkedId = localStorage.getItem(ROUND_LINKED_PLAN_STORAGE);
      } catch {
        /* ignore */
      }
      const planIdForSnapshot = nav?.planId ?? linkedId ?? "from-layout";
      const navPlanId = nav?.planId;

      if (navPlanId && isLinkableBackendPlanId(navPlanId)) {
        try {
          const detail = await getPlanDetail(navPlanId);
          if (cancelled) return;
          const layout = planDetailToLayoutSnapshot(detail);
          try {
            if (detail.plan?.name?.trim()) {
              localStorage.setItem(ROUND_LINKED_PLAN_NAME_STORAGE, detail.plan.name.trim());
            }
          } catch {
            /* ignore */
          }
          setPlan(layoutToRoundPlan(layout, navPlanId));
          try {
            await saveLayoutSnapshot(layout);
          } catch {
            /* ignore */
          }
          return;
        } catch {
          /* 后端不可用时回退本机快照 */
        }
      }

      const snap = await loadLayoutSnapshot();
      if (cancelled) return;
      if (!snap?.tables?.length && !snap?.people?.length) return;
      setPlan(layoutToRoundPlan(snap, planIdForSnapshot));
    })();
    return () => {
      cancelled = true;
    };
  }, [location.key, location.state, setPlan]);

  const stats = useMemo(() => {
    const tableCount = plan.tables.length;
    const assigned = plan.seats.filter((s) => s.personId).length;
    const capSum = plan.tables.reduce((a, t) => a + t.capacity, 0);
    const pct = capSum ? Math.round((assigned / capSum) * 100) : 0;
    return { tableCount, assigned, pct };
  }, [plan]);

  const tableRows = useMemo(() => buildRoundOverviewTableRows(plan), [plan]);

  const unassigned = useMemo(() => {
    const seated = new Set(plan.seats.filter((s) => s.personId).map((s) => s.personId as string));
    return plan.people.filter((p) => !seated.has(p.id));
  }, [plan]);

  const unassignedCount = unassigned.length;

  const searchScrollTarget = useMemo(() => {
    const q = personSearchQuery.trim().toLowerCase();
    if (!q) return { tableId: null as string | null, unassignedPersonId: null as string | null };
    for (const t of tableRows) {
      if (t.seatNames?.some((n) => n && n.trim().toLowerCase().includes(q))) {
        return { tableId: t.id, unassignedPersonId: null as string | null };
      }
    }
    const u = unassigned.find((p) => p.name.trim().toLowerCase().includes(q));
    return { tableId: null as string | null, unassignedPersonId: u?.id ?? null };
  }, [personSearchQuery, tableRows, unassigned]);

  useEffect(() => {
    const raw = personSearchQuery.trim();
    if (!raw) return;
    const t = window.setTimeout(() => {
      document.querySelector<HTMLElement>("[data-paizuo-round-search-scroll=\"1\"]")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 0);
    return () => window.clearTimeout(t);
  }, [personSearchQuery, searchScrollTarget.tableId, searchScrollTarget.unassignedPersonId]);

  const checkResult = useMemo(() => runRoundSeatChecks(plan), [plan]);

  const assignedSeatRows = useMemo(() => {
    type Row = {
      key: string;
      personName: string;
      tableNo: number;
      seatNo: number;
      positionLabel: string;
    };
    const rows: Row[] = [];
    for (const seat of plan.seats) {
      if (!seat.personId) continue;
      const t = plan.tables.find((x) => x.id === seat.tableId);
      if (!t || seat.seatNo < 1 || seat.seatNo > t.capacity) continue;
      const p = plan.people.find((x) => x.id === seat.personId);
      const role = getSeatRoleLabel(t.capacity, seat.seatNo);
      rows.push({
        key: `${seat.tableId}:${seat.seatNo}:${seat.personId}`,
        personName: p?.name ?? "（未知）",
        tableNo: t.no,
        seatNo: seat.seatNo,
        positionLabel: role ? `${seat.seatNo} 号座 · ${role}` : `${seat.seatNo} 号座`,
      });
    }
    rows.sort(
      (a, b) => a.tableNo - b.tableNo || a.seatNo - b.seatNo || a.personName.localeCompare(b.personName, "zh-CN"),
    );
    return rows;
  }, [plan]);

  const onDragStartPerson = (e: DragEvent, p: DropPerson) => {
    setDraggingPersonId(p.id);
    e.dataTransfer.setData(dragMime, JSON.stringify(p));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOverTable = (e: DragEvent, tableId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setActiveDropId(tableId);
  };

  const onDragLeaveTable = (e: DragEvent, tableId: string) => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setActiveDropId((cur) => (cur === tableId ? null : cur));
  };

  const onTableReorderDragStart = (e: DragEvent, sourceTableId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData(tableOrderMime, sourceTableId);
    e.dataTransfer.effectAllowed = "move";
  };

  const onTableReorderDragEnd = () => {
    setActiveDropId(null);
  };

  const onDropOnTable = (e: DragEvent, tableId: string) => {
    e.preventDefault();
    setActiveDropId(null);

    const orderSource = e.dataTransfer.getData(tableOrderMime);
    if (orderSource) {
      if (orderSource !== tableId) {
        setPlan((prev) => {
          const next = reorderTablesInPlan(prev, orderSource, tableId);
          void saveLayoutSnapshot(roundPlanToLayout(next));
          return next;
        });
      }
      return;
    }

    const raw = e.dataTransfer.getData(dragMime);
    if (!raw) return;
    const person = JSON.parse(raw) as DropPerson;

    setPlan((prev) => {
      const t = prev.tables.find((x) => x.id === tableId);
      if (!t) return prev;
      const occ = prev.seats.filter((s) => s.tableId === tableId && s.personId).length;
      if (occ >= t.capacity) return prev;

      const idx = prev.seats.findIndex(
        (s) => s.tableId === tableId && !s.personId && s.seatNo >= 1 && s.seatNo <= t.capacity,
      );
      if (idx < 0) return prev;

      const seats = [...prev.seats];
      seats[idx] = { ...seats[idx], personId: person.id };
      const hasPerson = prev.people.some((p) => p.id === person.id);
      const people = hasPerson
        ? prev.people
        : [...prev.people, { id: person.id, name: person.name }];

      return { ...prev, seats, people };
    });
  };

  const endDrag = () => {
    setActiveDropId(null);
    setDraggingPersonId(null);
  };

  const unassignedOverflow = unassignedCount > UNASSIGNED_PREVIEW_MAX ? unassignedCount - UNASSIGNED_PREVIEW_MAX : 0;
  const unassignedShown =
    unassignedCount <= UNASSIGNED_PREVIEW_MAX || unassignedExpanded
      ? unassigned
      : unassigned.slice(0, UNASSIGNED_PREVIEW_MAX);

  const onColsChange = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    const v = Math.max(1, Math.min(8, n));
    setColsPerRow(v);
    try {
      localStorage.setItem(COLS_STORAGE, String(v));
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <RoundOverviewBoard
      mode="screen"
      planName={overviewPlanName}
      stats={{
        tableCount: stats.tableCount,
        peopleTotal: plan.people.length,
        assigned: stats.assigned,
        unassigned: unassignedCount,
      }}
      tableCount={stats.tableCount}
      statsBanner={
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className={`${cardShell} flex h-full min-h-0 min-w-0 flex-col p-3 sm:p-4 xl:col-span-1`}>
            <RoundCheckPanel result={checkResult} detailLink="/round/check" layout="banner" />
          </div>
          <div className={`${cardShell} p-3 sm:p-4 xl:col-span-1`}>
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sm font-semibold text-sky-700 sm:h-10 sm:w-10">
                桌
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-500">桌数</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{stats.tableCount} 桌</div>
                <div className="mt-0.5 text-xs text-slate-500">当前方案</div>
              </div>
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            className={`${cardShell} cursor-pointer p-3 transition hover:border-slate-300/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/80 sm:p-4 xl:col-span-1`}
            onClick={() => setAssignedListOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setAssignedListOpen(true);
              }
            }}
            aria-haspopup="dialog"
            aria-expanded={assignedListOpen}
          >
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-sm font-semibold text-emerald-700 sm:h-10 sm:w-10">
                排
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-500">安排人数</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{stats.assigned} 人</div>
                <div className="mt-0.5 text-xs text-slate-500">已入座安排 · 点击查看名单</div>
              </div>
            </div>
          </div>
          <div className={`${cardShell} min-w-0 p-3 sm:p-4 xl:col-span-2`}>
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-sm font-semibold text-orange-700 sm:h-10 sm:w-10">
                未
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500">未安排人数</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{unassignedCount} 人</div>
                {unassignedCount === 0 ? (
                  <p className="mt-3 text-sm text-slate-600">全部人员已安排</p>
                ) : (
                  <>
                    <div
                      className={
                        unassignedExpanded && unassignedOverflow > 0
                          ? "mt-3 max-h-48 overflow-y-auto overscroll-contain pr-0.5"
                          : "mt-3"
                      }
                    >
                      <div className="flex flex-wrap gap-2">
                        {unassignedShown.map((p) => (
                          <div
                            key={p.id}
                            draggable
                            title={p.name}
                            data-paizuo-round-search-scroll={
                              searchScrollTarget.unassignedPersonId === p.id ? "1" : undefined
                            }
                            onDragStart={(e) => onDragStartPerson(e, p)}
                            onDragEnd={endDrag}
                            className={`${unassignedChipClass} ${
                              draggingPersonId === p.id ? "opacity-55" : ""
                            } ${
                              roundPersonSearchMatches(p.name, personSearchQuery)
                                ? "rounded-md ring-2 ring-amber-400 ring-offset-1 bg-amber-50"
                                : ""
                            }`}
                          >
                            <span className="min-w-0 truncate">{p.name}</span>
                          </div>
                        ))}
                        {!unassignedExpanded && unassignedOverflow > 0 ? (
                          <button
                            type="button"
                            onClick={() => setUnassignedExpanded(true)}
                            className="inline-flex w-fit shrink-0 items-center rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-1 text-sm font-medium text-slate-600 hover:border-orange-300 hover:bg-orange-50/60 hover:text-orange-800"
                          >
                            +{unassignedOverflow} 更多
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {unassignedExpanded && unassignedOverflow > 0 ? (
                      <button
                        type="button"
                        onClick={() => setUnassignedExpanded(false)}
                        className="mt-2 text-xs font-medium text-orange-700 hover:text-orange-800"
                      >
                        收起
                      </button>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-500">拖拽姓名到座位完成安排</p>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className={`${cardShell} p-3 sm:p-4 xl:col-span-1`}>
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-sm font-semibold text-violet-700 sm:h-10 sm:w-10">
                占
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-500">总体占用率</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{stats.pct}%</div>
                <div className="mt-0.5 text-xs text-slate-500">按方案核算</div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-orange-500" style={{ width: `${stats.pct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </section>
      }
      mainClassName=""
    >
      <div className="flex min-w-0 flex-col gap-4">
        <div className={`${cardShell} w-full px-5 py-4`}>
          <div className="flex min-h-[5.5rem] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
            <div className="min-w-0 shrink-0 sm:max-w-[min(24rem,40%)]">
              <div className="text-xs font-medium text-slate-500">当前方案</div>
              <div className="mt-1.5 text-base font-semibold leading-snug text-slate-900">{overviewPlanName}</div>
              <div className="mt-1 text-xs text-slate-500">{overviewPlanSubtitle}</div>
            </div>
            <div className="min-w-0 flex-1 border-t border-slate-100 pt-4 sm:border-l sm:border-t-0 sm:pl-10 sm:pt-0">
              <div className="text-xs font-medium text-slate-500">人数分布</div>
              <ul className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-700">
                {DIST_SEGMENTS.map((s) => (
                  <li key={`${s.n}-${s.c}`} className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden />
                    <span className="font-medium text-slate-900">
                      {s.n}人桌 × {s.c}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="whitespace-nowrap">每行桌数</span>
            <input
              type="number"
              min={1}
              max={8}
              inputMode="numeric"
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm font-medium text-slate-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              value={colsPerRow}
              onChange={(e) => onColsChange(e.target.value)}
              aria-label="每行显示几张桌子"
            />
          </label>
        </div>

        <section
          className={`min-w-0 ${overviewGridColsClass()}`}
          style={overviewGridColsStyle(colsPerRow)}
        >
          {tableRows.map((t) => (
            <RoundTableCard
              key={t.id}
              tableId={t.id}
              tableNo={t.no}
              hallName={t.hallName}
              capacity={t.capacity}
              currentCount={t.current}
              seatOccupied={t.seatOccupied}
              seatNames={t.seatNames}
              isMainTable={t.isMainTable}
              dropActive={activeDropId === t.id}
              onDragOverTable={(e) => onDragOverTable(e, t.id)}
              onDragLeaveTable={(e) => onDragLeaveTable(e, t.id)}
              onDropOnTable={(e) => onDropOnTable(e, t.id)}
              onReorderDragStart={(e) => onTableReorderDragStart(e, t.id)}
              onReorderDragEnd={onTableReorderDragEnd}
              personSearchQuery={personSearchQuery}
              searchScrollTarget={searchScrollTarget.tableId === t.id}
            />
          ))}
        </section>

      </div>
    </RoundOverviewBoard>

      {assignedListOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={() => setAssignedListOpen(false)}
        >
          <div
            className="flex max-h-[min(32rem,85vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assigned-list-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
              <div>
                <h2 id="assigned-list-title" className="text-lg font-semibold text-slate-900">
                  已安排人员
                </h2>
                <p className="mt-1 text-xs text-slate-500">共 {assignedSeatRows.length} 条入座记录</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
                onClick={() => setAssignedListOpen(false)}
              >
                关闭
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
              {assignedSeatRows.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500">暂无已安排人员</p>
              ) : (
                <table className="w-full min-w-[20rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      <th className="sticky top-0 px-3 py-2.5">姓名</th>
                      <th className="sticky top-0 px-3 py-2.5">桌号</th>
                      <th className="sticky top-0 px-3 py-2.5">位置</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedSeatRows.map((r) => (
                      <tr key={r.key} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 font-medium text-slate-900">{r.personName}</td>
                        <td className="px-3 py-2.5 text-slate-700">{r.tableNo} 号桌</td>
                        <td className="px-3 py-2.5 text-slate-600">{r.positionLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <RoundVersionHistoryDrawer planId={plan.planId} colsPerRow={colsPerRow} planDisplayName={overviewPlanName} />
    </>
  );
}
