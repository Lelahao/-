import { useNavigate } from "react-router-dom";

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]";

const btnBase =
  "inline-flex items-center justify-center rounded-xl border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50";

const btnPrimary =
  "inline-flex items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600";

const ROADMAP = ["桌型配置", "座位编辑", "规则设置", "导出方案"] as const;

export function SquarePage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-6">
        <section className={`${cardShell} p-6`}>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">方桌排座</h1>
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
              规划中
            </span>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5">
            <div className="text-base font-semibold text-slate-900">方桌排座功能预留中</div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              当前先保留入口与页面占位，后续将逐步完善方桌排座方案、规则与编辑能力。
            </p>
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-slate-900">路线图</div>
            <ol className="mt-3 space-y-3">
              {ROADMAP.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm text-slate-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-bold text-orange-700 ring-1 ring-orange-200/70">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 font-medium text-slate-900">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className={btnPrimary} onClick={() => navigate("/round/overview")}>
              返回圆桌排座
            </button>
            <button type="button" className={btnBase}>
              期待后续
            </button>
          </div>
        </section>
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:w-80">
        <div className={`${cardShell} p-5`}>
          <div className="text-sm font-semibold text-slate-900">当前状态</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            入口与导航已接通；方桌排座业务逻辑未开启，数据与交互以圆桌流程为主。
          </p>
        </div>

        <div className={`${cardShell} p-5`}>
          <div className="text-sm font-semibold text-slate-900">版本说明</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            占位页 v0.1：仅用于产品路线沟通与 UI 壳验证，不包含方桌算法与编辑能力。
          </p>
        </div>

        <div className={`${cardShell} p-5`}>
          <div className="text-sm font-semibold text-slate-900">后续功能预告</div>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>方桌/长桌布局模板与桌型参数</li>
            <li>与方案、导出流程对齐</li>
            <li>规则与校验（与圆桌模式相互独立演进）</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
