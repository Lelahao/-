import { useMemo } from "react";
import { Link } from "react-router-dom";
import { autoArrangeRoundSeats, runRoundSeatChecks } from "@/lib/roundSeatEngine";
import { useRoundPlanDemoStore } from "@/stores/roundPlanDemoStore";

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]";

export function RoundCheckDetailPage() {
  const plan = useRoundPlanDemoStore((s) => s.plan);
  const setPlan = useRoundPlanDemoStore((s) => s.setPlan);
  const result = useMemo(() => runRoundSeatChecks(plan), [plan]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">圆桌检查详情</h1>
          <p className="mt-1 text-sm text-slate-500">与总览共用演示方案数据；自动排座会写回共享状态。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/round/overview"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            返回总览
          </Link>
          <button
            type="button"
            onClick={() => setPlan((prev) => ({ ...prev, seats: autoArrangeRoundSeats(prev) }))}
            className="inline-flex items-center justify-center rounded-xl border border-orange-200 bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
          >
            一键自动排座
          </button>
        </div>
      </div>

      <section className={`${cardShell} p-5`}>
        <div className="text-sm font-semibold text-slate-900">方案状态</div>
        <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <dt>总览</dt>
            <dd className="font-semibold text-slate-900">{result.planStatus.summary}</dd>
          </div>
          <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <dt>错误/提醒/信息</dt>
            <dd className="font-semibold text-slate-900">
              {result.planStatus.errorCount} / {result.planStatus.warnCount} / {result.planStatus.infoCount}
            </dd>
          </div>
          <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <dt>未安排人数</dt>
            <dd className="font-semibold text-slate-900">{result.planStatus.unassignedCount}</dd>
          </div>
          <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <dt>空座合计</dt>
            <dd className="font-semibold text-slate-900">{result.planStatus.totalEmptySeats}</dd>
          </div>
        </dl>
      </section>

      <section className={`${cardShell} p-5`}>
        <div className="text-sm font-semibold text-slate-900">各桌状态</div>
        <ul className="mt-3 space-y-2 text-sm">
          {result.tableStatuses.map((t) => (
            <li key={t.tableId} className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2">
              <div className="font-semibold text-slate-900">
                {t.tableNo} 号桌 · {t.hallName ?? ""}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                入座 {t.occupied}/{t.capacity} · 空座 {t.emptySeats}
                {t.largeTableNote ? ` · ${t.largeTableNote}` : ""}
              </div>
              {t.errors.length ? (
                <div className="mt-2 text-xs text-rose-700">{t.errors.join("；")}</div>
              ) : null}
              {t.warnings.length ? (
                <div className="mt-1 text-xs text-amber-800">{t.warnings.join("；")}</div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className={`${cardShell} p-5`}>
        <div className="text-sm font-semibold text-slate-900">检查项（checkItems）</div>
        <ul className="mt-3 space-y-2 text-sm">
          {result.checkItems.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{item.title}</span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {item.scope === "table" ? `桌 ${item.tableId}` : "方案"}
                  · {item.severity}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-600">{item.message}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
