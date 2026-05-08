import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useLocation } from "react-router-dom";
import { RoundTableCard } from "@/components/RoundTableCard";
import { RoundCheckPanel } from "@/components/RoundCheckPanel";
import { loadLayoutSnapshot } from "@/fullscreen/roundStorage";
import { layoutToRoundPlan } from "@/lib/layoutBridge";
import { autoArrangeRoundSeats, runRoundSeatChecks } from "@/lib/roundSeatEngine";
import { useRoundPlanDemoStore } from "@/stores/roundPlanDemoStore";

const DIST_SEGMENTS = [
  { n: 6, c: 1 },
  { n: 9, c: 2 },
  { n: 10, c: 4 },
  { n: 13, c: 1 },
] as const;

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]";

const dragMime = "application/x-paizuo-person";

type DropPerson = { id: string; name: string };

export function RoundOverviewPage() {
  const location = useLocation();
  const plan = useRoundPlanDemoStore((s) => s.plan);
  const setPlan = useRoundPlanDemoStore((s) => s.setPlan);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await loadLayoutSnapshot();
      if (cancelled || !snap?.people?.length) return;
      setPlan(layoutToRoundPlan(snap, "from-layout"));
    })();
    return () => {
      cancelled = true;
    };
  }, [location.key, setPlan]);

  const tableRows = useMemo(() => {
    return plan.tables
      .slice()
      .sort((a, b) => a.no - b.no)
      .map((t) => {
        const occ = plan.seats.filter((s) => s.tableId === t.id && s.personId && s.seatNo <= t.capacity).length;
        return {
          id: t.id,
          no: t.no,
          hallName: t.hallName ?? "",
          capacity: t.capacity,
          current: occ,
        };
      });
  }, [plan]);

  const unassigned = useMemo(() => {
    const seated = new Set(plan.seats.filter((s) => s.personId).map((s) => s.personId as string));
    return plan.people.filter((p) => !seated.has(p.id));
  }, [plan]);

  const unassignedCount = unassigned.length;

  const checkResult = useMemo(() => runRoundSeatChecks(plan), [plan]);

  const stats = useMemo(() => {
    const tableCount = plan.tables.length;
    const assigned = plan.seats.filter((s) => s.personId).length;
    const capSum = plan.tables.reduce((a, t) => a + t.capacity, 0);
    const pct = capSum ? Math.round((assigned / capSum) * 100) : 0;
    return { tableCount, assigned, pct };
  }, [plan]);

  const onDragStartPerson = (e: DragEvent, p: DropPerson) => {
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

  const onDropOnTable = (e: DragEvent, tableId: string) => {
    e.preventDefault();
    setActiveDropId(null);

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

  const endDrag = () => setActiveDropId(null);

  const handleAutoAll = () => {
    setPlan((prev) => {
      const seats = autoArrangeRoundSeats(prev);
      return { ...prev, seats };
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`${cardShell} p-4`}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sm font-semibold text-sky-700">
              桌
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">桌数</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{stats.tableCount} 桌</div>
              <div className="mt-1 text-xs text-slate-500">当前方案</div>
            </div>
          </div>
        </div>
        <div className={`${cardShell} p-4`}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-sm font-semibold text-emerald-700">
              排
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">安排人数</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{stats.assigned} 人</div>
              <div className="mt-1 text-xs text-slate-500">已入座安排</div>
            </div>
          </div>
        </div>
        <div className={`${cardShell} p-4`}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-sm font-semibold text-orange-700">
              未
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">未安排人数</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{unassignedCount} 人</div>
              <div className="mt-1 text-xs text-slate-500">待拖拽分配</div>
            </div>
          </div>
        </div>
        <div className={`${cardShell} p-4`}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-sm font-semibold text-violet-700">
              占
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">总体占用率</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{stats.pct}%</div>
              <div className="mt-1 text-xs text-slate-500">按方案核算</div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-orange-500" style={{ width: `${stats.pct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start">
        <section className={`${cardShell} w-full shrink-0 p-4 xl:w-[300px]`}>
          <div className="text-sm font-semibold text-slate-900">未安排人员（{unassignedCount}）</div>
          <p className="mt-1 text-xs text-slate-500">支持拖拽到右侧桌卡入座（本阶段仅本地预览）。</p>

          <div className="mt-4 space-y-2">
            {unassigned.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => onDragStartPerson(e, p)}
                onDragEnd={endDrag}
                className="flex cursor-grab items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/60 px-3 py-2 active:cursor-grabbing"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-sm font-semibold text-orange-700">
                    {p.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 truncate text-sm font-medium text-slate-900">{p.name}</div>
                </div>
                <span className="text-slate-400" aria-hidden>
                  ⋮⋮
                </span>
              </div>
            ))}
            {unassigned.length === 0 ? <div className="text-sm text-slate-500">暂无未安排人员</div> : null}
          </div>
        </section>

        <section className="min-w-0 flex-1">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {tableRows.map((t) => (
              <RoundTableCard
                key={t.id}
                tableId={t.id}
                tableNo={t.no}
                hallName={t.hallName}
                capacity={t.capacity}
                currentCount={t.current}
                dropActive={activeDropId === t.id}
                onDragOverTable={(e) => onDragOverTable(e, t.id)}
                onDragLeaveTable={(e) => onDragLeaveTable(e, t.id)}
                onDropOnTable={(e) => onDropOnTable(e, t.id)}
              />
            ))}
          </div>
        </section>

        <aside className="w-full shrink-0 space-y-4 xl:w-80">
          <div className={`${cardShell} p-5`}>
            <div className="text-sm font-semibold text-slate-900">当前方案</div>
            <div className="mt-3 text-sm font-semibold text-slate-900">2026 春季接待 · 锦绣厅</div>
            <div className="mt-1 text-xs text-slate-500">演示数据 · 与检查引擎联动</div>
          </div>

          <div className={`${cardShell} p-5`}>
            <div className="text-sm font-semibold text-slate-900">人数分布</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {DIST_SEGMENTS.map((s) => (
                <li key={`${s.n}-${s.c}`} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-500" aria-hidden />
                  <span className="font-medium text-slate-900">
                    {s.n}人桌 × {s.c}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <RoundCheckPanel result={checkResult} detailLink="/round/check" compact />

          <details className={`${cardShell} p-5`}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">自动排座（演示）</summary>
            <p className="mt-2 text-xs text-slate-500">
              按规则重排未锁定座位；锁定座保留。正式方案可在单桌页使用同类能力。
            </p>
            <button
              type="button"
              onClick={handleAutoAll}
              className="mt-3 w-full rounded-xl border border-orange-200 bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
            >
              一键自动排座
            </button>
          </details>

          <div className={`${cardShell} p-5`}>
            <div className="text-sm font-semibold text-slate-900">快速导出</div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {["X", "W", "P", "图"].map((g) => (
                <button
                  key={g}
                  type="button"
                  className="flex h-12 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  aria-label={`快速导出 ${g}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
