import { useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { getPlanDetail } from "@/api/plans";
import { layoutToRoundPlan, planDetailToLayoutSnapshot } from "@/lib/layoutBridge";
import { saveLayoutSnapshot } from "@/fullscreen/roundStorage";
import { isLinkableBackendPlanId } from "@/lib/roundBackendPlanId";
import { autoArrangeRoundSeats, runRoundSeatChecks } from "@/lib/roundSeatEngine";
import { useRoundPlanDemoStore } from "@/stores/roundPlanDemoStore";

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]";

const ROUND_LINKED_PLAN_STORAGE = "paizuo-round-linked-plan-id";
const ROUND_LINKED_PLAN_NAME_STORAGE = "paizuo-round-linked-plan-name";

export function RoundCheckDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const plan = useRoundPlanDemoStore((s) => s.plan);
  const setPlan = useRoundPlanDemoStore((s) => s.setPlan);
  const result = useMemo(() => runRoundSeatChecks(plan), [plan]);

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
      const targetId = nav?.planId ?? linkedId;
      if (targetId && isLinkableBackendPlanId(targetId)) {
        try {
          const detail = await getPlanDetail(targetId);
          if (cancelled) return;
          const layout = planDetailToLayoutSnapshot(detail);
          try {
            if (detail.plan?.name?.trim()) {
              localStorage.setItem(ROUND_LINKED_PLAN_NAME_STORAGE, detail.plan.name.trim());
            }
          } catch {
            /* ignore */
          }
          setPlan(layoutToRoundPlan(layout, targetId));
          try {
            await saveLayoutSnapshot(layout);
          } catch {
            /* ignore */
          }
          return;
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            try {
              localStorage.removeItem(ROUND_LINKED_PLAN_STORAGE);
              localStorage.removeItem(ROUND_LINKED_PLAN_NAME_STORAGE);
            } catch {
              /* ignore */
            }
            try {
              await saveLayoutSnapshot({ people: [], tables: [] });
            } catch {
              /* ignore */
            }
            if (cancelled) return;
            setPlan({ planId: "empty-overview", tables: [], people: [], seats: [] });
            return;
          }
          /* 网络错误等：保持当前 store 状态，不擅自覆盖 */
        }
        return;
      }
      // 无 linked / nav plan → 空状态
      try {
        await saveLayoutSnapshot({ people: [], tables: [] });
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      setPlan({ planId: "empty-overview", tables: [], people: [], seats: [] });
    })();
    return () => {
      cancelled = true;
    };
  }, [location.key, location.state, setPlan]);

  const isEmpty =
    plan.planId === "empty-overview" || (plan.tables.length === 0 && plan.people.length === 0);

  if (isEmpty) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
        <div className={`${cardShell} w-full max-w-md px-8 py-10 text-center`}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-2xl text-orange-500">
            检
          </div>
          <h2 className="text-lg font-semibold text-slate-900">暂无方案</h2>
          <p className="mt-2 text-sm text-slate-600">
            还没有任何排座方案。请到「方案管理」新建方案后，再回来查看圆桌检查。
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/plans", { state: { openRoundManage: true } })}
              className="inline-flex items-center rounded-lg border border-orange-500 bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600"
            >
              去方案管理新建方案
            </button>
            <button
              type="button"
              onClick={() => navigate("/plans")}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              打开方案管理
            </button>
          </div>
        </div>
      </div>
    );
  }

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
