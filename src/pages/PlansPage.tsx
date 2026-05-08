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

const STATS = [
  {
    label: "总方案数",
    value: "24 个",
    hint: "所有方案",
    iconBg: "bg-sky-100 text-sky-700",
    glyph: "总",
  },
  {
    label: "本月新增",
    value: "6 个",
    hint: "较上月 +2",
    iconBg: "bg-emerald-100 text-emerald-700",
    glyph: "新",
  },
  {
    label: "待处理异常",
    value: "3 个",
    hint: "需要处理",
    iconBg: "bg-orange-100 text-orange-700",
    glyph: "!",
  },
  {
    label: "导出记录",
    value: "18 条",
    hint: "最近 30 天",
    iconBg: "bg-violet-100 text-violet-700",
    glyph: "出",
  },
] as const;

const PLANS: Plan[] = [
  {
    id: "p1",
    name: "2026客户接待方案",
    status: "已完成",
    tableCount: 4,
    guestCount: 37,
    updatedAt: "2026-05-07 18:32",
    distribution: [
      { seats: 6, count: 1 },
      { seats: 9, count: 2 },
      { seats: 13, count: 1 },
    ],
    owner: "李明轩",
  },
  {
    id: "p2",
    name: "季度商务接待",
    status: "进行中",
    tableCount: 5,
    guestCount: 42,
    updatedAt: "2026-05-06 11:08",
    distribution: [
      { seats: 8, count: 3 },
      { seats: 10, count: 2 },
    ],
    owner: "王可",
  },
  {
    id: "p3",
    name: "管理层交流会",
    status: "草稿",
    tableCount: 2,
    guestCount: 16,
    updatedAt: "2026-05-05 09:15",
    distribution: [{ seats: 8, count: 2 }],
    owner: "陈珊",
  },
  {
    id: "p4",
    name: "家庭聚餐模板",
    status: "已完成",
    tableCount: 3,
    guestCount: 22,
    updatedAt: "2026-04-28 16:44",
    distribution: [
      { seats: 6, count: 2 },
      { seats: 10, count: 1 },
    ],
    owner: "赵一宁",
  },
];

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
                <button type="button" className={pageBtnPrimary} aria-label="新建方案">
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
            {STATS.map((s) => (
              <div key={s.label} className={`${cardShell} p-4`}>
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${s.iconBg}`}
                  >
                    {s.glyph}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">{s.label}</div>
                    <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{s.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{s.hint}</div>
                  </div>
                </div>
              </div>
            ))}
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

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {PLANS.map((p) => (
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
                  </div>
                </article>
              ))}
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
