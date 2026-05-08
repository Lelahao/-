import { Link } from "react-router-dom";
import type { RoundCheckResult } from "@/lib/roundSeatEngine";

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]";

function severityTone(s: string) {
  if (s === "error") return "text-rose-700 bg-rose-50 ring-rose-200/80";
  if (s === "warn") return "text-amber-800 bg-amber-50 ring-amber-200/80";
  if (s === "info") return "text-sky-800 bg-sky-50 ring-sky-200/80";
  return "text-emerald-800 bg-emerald-50 ring-emerald-200/80";
}

export function RoundCheckPanel({
  result,
  detailLink,
  compact,
}: {
  result: RoundCheckResult;
  detailLink?: string;
  compact?: boolean;
}) {
  const { planStatus, checkItems, tableStatuses } = result;
  const top = compact ? checkItems.filter((i) => i.severity !== "pass").slice(0, 6) : checkItems.filter((i) => i.severity !== "pass");

  const errTables = tableStatuses.filter((t) => t.errors.length > 0).length;

  return (
    <div className={`${cardShell} p-5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">总体检查</div>
        {detailLink ? (
          <Link to={detailLink} className="text-xs font-medium text-orange-700 hover:text-orange-800">
            详情
          </Link>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 text-sm text-slate-600">
        <div className="flex items-center justify-between gap-3">
          <span>方案状态</span>
          <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ring-1 ${severityTone(planStatus.ok ? "pass" : "error")}`}>
            {planStatus.ok ? "无错误" : "有错误"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>提醒条数</span>
          <span className="font-semibold text-slate-900">{planStatus.warnCount + planStatus.infoCount}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>异常桌次</span>
          <span className={errTables ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>{errTables}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>未安排</span>
          <span className="font-semibold text-slate-900">{planStatus.unassignedCount} 人</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>空座合计</span>
          <span className="font-semibold text-slate-900">{planStatus.totalEmptySeats}</span>
        </div>
      </div>

      <div
        className={[
          "mt-4 flex min-h-[40px] items-center justify-center rounded-xl px-2 py-2 text-center text-sm font-semibold ring-1",
          severityTone(planStatus.errorCount ? "error" : planStatus.warnCount ? "warn" : "pass"),
        ].join(" ")}
      >
        {planStatus.summary}
      </div>

      {top.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {top.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{item.title}</span>
                <span
                  className={[
                    "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase",
                    item.severity === "error"
                      ? "bg-rose-100 text-rose-800"
                      : item.severity === "warn"
                        ? "bg-amber-100 text-amber-900"
                        : item.severity === "info"
                          ? "bg-sky-100 text-sky-900"
                          : "bg-emerald-100 text-emerald-800",
                  ].join(" ")}
                >
                  {item.severity}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-600">{item.message}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500">暂无预警项（含空座/大桌提示请见详情页）。</p>
      )}
    </div>
  );
}
