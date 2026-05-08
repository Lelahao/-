import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/api/client";
import {
  createPlan,
  deletePlan,
  getPlanDetail,
  listPlans,
  updatePlan,
} from "@/api/plans";
import type { PlanDetail, PlanRow, TableRow } from "@/lib/dbTypes";

type PlanStatus = "已完成" | "进行中" | "草稿";

type PlanDistributionSegment = {
  seats: number;
  count: number;
};

type Plan = {
  id: string;
  name: string;
  status: PlanStatus;
  tableCount: number;
  guestCount: number;
  updatedAt: string;
  distribution: PlanDistributionSegment[];
  owner: string;
};

function formatDistribution(segments: PlanDistributionSegment[]): string {
  if (segments.length === 0) return "—";
  return segments.map((s) => `${s.seats}人桌 × ${s.count}`).join(" / ");
}

function statusBadgeClass(status: PlanStatus) {
  switch (status) {
    case "已完成":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "进行中":
      return "border-sky-200 bg-sky-50 text-sky-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function mapDisplayStatus(raw: string): PlanStatus {
  const key = raw.trim();
  const map: Record<string, PlanStatus> = {
    draft: "草稿",
    in_progress: "进行中",
    active: "进行中",
    done: "已完成",
    completed: "已完成",
    finished: "已完成",
    草稿: "草稿",
    进行中: "进行中",
    已完成: "已完成",
  };
  return map[key] ?? "草稿";
}

function aggregateDistribution(tables: TableRow[]): PlanDistributionSegment[] {
  const counts = new Map<number, number>();
  for (const t of tables) {
    const cap = t.capacity;
    counts.set(cap, (counts.get(cap) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([seats, count]) => ({ seats, count }));
}

function formatUpdatedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return String(ms);
  }
}

function toViewPlan(row: PlanRow, detail: PlanDetail): Plan {
  return {
    id: row.id,
    name: row.name,
    status: mapDisplayStatus(row.status),
    tableCount: detail.tables.length,
    guestCount: detail.people.length,
    updatedAt: formatUpdatedAt(row.updatedAt),
    distribution: aggregateDistribution(detail.tables),
    owner: "—",
  };
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "未知错误";
}

const ACTIVITIES = [
  {
    id: "a1",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
    title: "导出方案",
    target: "2026客户接待方案",
    time: "2026-06-03 09:55",
  },
  {
    id: "a2",
    tone: "border-orange-200 bg-orange-50 text-orange-700",
    title: "更新方案",
    target: "季度商务接待",
    time: "2026-06-02 21:18",
  },
  {
    id: "a3",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    title: "新建方案",
    target: "管理层交流会",
    time: "2026-06-01 14:02",
  },
  {
    id: "a4",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
    title: "导出方案",
    target: "家庭聚餐模板",
    time: "2026-05-30 10:41",
  },
] as const;

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]";

const pageBtnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50";

const pageBtnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600";

export function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshPlans = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const rows = await listPlans();
      const details = await Promise.all(rows.map((r) => getPlanDetail(r.id)));
      setPlans(rows.map((r, i) => toViewPlan(r, details[i]!)));
    } catch (e) {
      setError(errorMessage(e));
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPlans();
  }, [refreshPlans]);

  const onCreate = async () => {
    const name = window.prompt("新建方案名称");
    if (name === null) return;
    const n = name.trim();
    if (!n) {
      setError("方案名称不能为空");
      return;
    }
    const noteRaw = window.prompt("备注（可选，留空跳过）", "");
    const note = noteRaw === null ? undefined : noteRaw.trim() || null;
    try {
      await createPlan({ name: n, note });
      await refreshPlans();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onEdit = async (p: Plan) => {
    const name = window.prompt("方案名称", p.name);
    if (name === null) return;
    const n = name.trim();
    if (!n) {
      setError("方案名称不能为空");
      return;
    }
    try {
      await updatePlan({ id: p.id, name: n });
      await refreshPlans();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onDelete = async (p: Plan) => {
    if (!window.confirm(`确定删除方案「${p.name}」？此操作不可撤销。`)) return;
    try {
      await deletePlan(p.id);
      await refreshPlans();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const totalLabel = loading ? "…" : `${plans.length} 个`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <section className={`${cardShell} p-6`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">方案管理</h1>
                <p className="mt-1 text-sm text-slate-600">创建、管理和维护各类排座方案</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={pageBtnPrimary} aria-label="新建方案" onClick={() => void onCreate()}>
                  <span className="text-base leading-none" aria-hidden>
                    +
                  </span>
                  新建方案
                </button>
                <button type="button" className={pageBtnBase} aria-label="导入方案">
                  <span className="text-slate-500" aria-hidden>
                    ⭳
                  </span>
                  导入方案
                </button>
                <button type="button" className={pageBtnBase} aria-label="下载模板">
                  <span className="text-slate-500" aria-hidden>
                    ⬇
                  </span>
                  下载模板
                </button>
                <button type="button" className={pageBtnBase} aria-label="桌次管理">
                  <span className="text-slate-500" aria-hidden>
                    ⊞
                  </span>
                  桌次管理
                </button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={`${cardShell} p-4`}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold bg-sky-100 text-sky-700">
                  总
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">总方案数</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{totalLabel}</div>
                  <div className="mt-1 text-xs text-slate-500">所有方案</div>
                </div>
              </div>
            </div>
            <div className={`${cardShell} p-4`}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold bg-emerald-100 text-emerald-700">
                  新
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">本月新增</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">—</div>
                  <div className="mt-1 text-xs text-slate-500">待接入活动统计</div>
                </div>
              </div>
            </div>
            <div className={`${cardShell} p-4`}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold bg-orange-100 text-orange-700">
                  !
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">待处理异常</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">—</div>
                  <div className="mt-1 text-xs text-slate-500">待产品定义</div>
                </div>
              </div>
            </div>
            <div className={`${cardShell} p-4`}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold bg-violet-100 text-violet-700">
                  出
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">导出记录</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">—</div>
                  <div className="mt-1 text-xs text-slate-500">待接入导出统计</div>
                </div>
              </div>
            </div>
          </section>

          <section className={`${cardShell} p-6`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-base font-semibold text-slate-900">方案列表</div>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
                <select
                  className="h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-sm text-slate-700 shadow-sm sm:w-40"
                  defaultValue="all"
                  aria-label="方案状态筛选"
                >
                  <option value="all">全部状态</option>
                </select>
                <input
                  className="h-10 w-full min-w-[220px] rounded-xl border border-slate-200/90 bg-white px-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400"
                  placeholder="搜索方案名称、备注"
                  aria-label="搜索方案"
                />
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                  aria-label="切换视图"
                  title="切换视图"
                >
                  ▦
                </button>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                {error}
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {loading ? (
                <div className="col-span-full text-sm text-slate-500">加载中…</div>
              ) : plans.length === 0 ? (
                <div className="col-span-full text-sm text-slate-500">暂无方案，请点击「新建方案」。</div>
              ) : (
                plans.map((p) => (
                  <article key={p.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-900">{p.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={[
                            "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            statusBadgeClass(p.status),
                          ].join(" ")}
                        >
                          {p.status}
                        </span>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                          aria-label="更多"
                          title="更多"
                        >
                          ···
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2">
                        <div className="text-xs text-slate-500">桌数</div>
                        <div className="mt-1 font-semibold text-slate-900">{p.tableCount}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2">
                        <div className="text-xs text-slate-500">人数</div>
                        <div className="mt-1 font-semibold text-slate-900">{p.guestCount}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2">
                        <div className="text-xs text-slate-500">更新时间</div>
                        <div className="mt-1 text-xs font-semibold leading-snug text-slate-900">{p.updatedAt}</div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700">
                      <span className="text-xs text-slate-500">人数分布：</span>
                      <span className="font-medium text-slate-900">{formatDistribution(p.distribution)}</span>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-4">
                      <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-xs font-semibold text-slate-700"
                          aria-hidden
                        >
                          {p.owner.slice(0, 1)}
                        </span>
                        <span className="truncate">{p.owner}</span>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                          onClick={() => void onEdit(p)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                          onClick={() => void onDelete(p)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="w-full shrink-0 xl:w-80">
          <div className={`${cardShell} p-6`}>
            <div className="text-base font-semibold text-slate-900">最近动态</div>
            <div className="mt-4 space-y-4">
              {ACTIVITIES.map((a) => (
                <div key={a.id} className="flex gap-3">
                  <div
                    className={[
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-semibold",
                      a.tone,
                    ].join(" ")}
                  >
                    •
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{a.title}</div>
                    <div className="mt-0.5 truncate text-sm text-slate-600">{a.target}</div>
                    <div className="mt-1 text-xs text-slate-400">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-5 w-full rounded-xl border border-slate-200/90 bg-white py-2 text-sm font-medium text-orange-600 shadow-sm hover:bg-orange-50"
            >
              查看全部动态 &gt;
            </button>
          </div>
        </aside>
      </div>

      <footer className="rounded-2xl border border-sky-200/70 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg border border-sky-200 bg-white text-xs font-semibold text-sky-700">
          i
        </span>
        提示：方案数据保存在本地，建议定期导出备份，确保数据安全。
      </footer>
    </div>
  );
}
