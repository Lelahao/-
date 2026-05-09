import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/api/client";
import { getPlanVersion, listPlanVersions } from "@/api/plans";
import { RoundTableCard } from "@/components/RoundTableCard";
import { overviewGridColsClass, overviewGridColsStyle } from "@/components/round/RoundOverviewBoard";
import { buildRoundOverviewTableRows } from "@/lib/buildRoundOverviewTableRows";
import type { PlanVersionCreateResult, PlanVersionListItem } from "@/lib/dbTypes";
import { layoutToRoundPlan } from "@/lib/layoutBridge";
import {
  exportPlanVersionSnapshot,
  type PlanVersionExportFormat,
} from "@/lib/planExport";
import { snapshotToLayoutSnapshot } from "@/lib/planVersionSnapshot";
import { isLinkableBackendPlanId } from "@/lib/roundBackendPlanId";
import type { RoundPlanSnapshot } from "@/lib/roundSeatEngine";
import { useRoundVersionDrawerStore } from "@/stores/roundVersionDrawerStore";

function formatVersionTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

type ViewState = {
  version: PlanVersionCreateResult;
  roundPlan: RoundPlanSnapshot;
};

type Props = {
  planId: string;
  colsPerRow: number;
  /** 用于导出文件名与 ExportScene 标题，与总览展示的方案名一致 */
  planDisplayName: string;
};

const exportWaitMessage = "该格式导出功能待接入";

const EXPORT_FORMAT_ITEMS: { id: PlanVersionExportFormat; label: string }[] = [
  { id: "png", label: "图片 PNG" },
  { id: "xlsx", label: "Excel XLSX" },
  { id: "docx", label: "Word DOCX" },
  { id: "pptx", label: "PPT PPTX" },
];

export function RoundVersionHistoryDrawer(props: Props) {
  const { planId, colsPerRow, planDisplayName } = props;
  const listOpen = useRoundVersionDrawerStore((s) => s.listOpen);
  const closeList = useRoundVersionDrawerStore((s) => s.closeList);

  const [versions, setVersions] = useState<PlanVersionListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [view, setView] = useState<ViewState | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState<string | null>(null);

  const [exportTarget, setExportTarget] = useState<PlanVersionListItem | null>(null);
  const [exportRunning, setExportRunning] = useState(false);

  const linkable = isLinkableBackendPlanId(planId);

  useEffect(() => {
    if (!listOpen || !linkable) {
      setListError(null);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    void listPlanVersions(planId)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setListError(e instanceof ApiError ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listOpen, planId, linkable]);

  const closeAll = () => {
    if (exportRunning) return;
    setView(null);
    setExportTarget(null);
    closeList();
  };

  const onView = async (row: PlanVersionListItem) => {
    if (!linkable) return;
    setViewLoadingId(row.id);
    try {
      const detail = await getPlanVersion(planId, row.id);
      const layout = snapshotToLayoutSnapshot(detail.snapshot);
      const roundPlan = layoutToRoundPlan(layout, planId);
      setView({ version: detail.version, roundPlan });
    } catch (e: unknown) {
      window.alert(e instanceof ApiError ? e.message : "加载版本详情失败");
    } finally {
      setViewLoadingId(null);
    }
  };

  const versionSummaryLine = (row: PlanVersionListItem) =>
    `V${row.versionNo}${row.versionName ? ` ${row.versionName}` : ""}`;

  const onExportFormat = async (format: PlanVersionExportFormat) => {
    if (!exportTarget || !linkable) {
      window.alert(exportWaitMessage);
      return;
    }
    setExportRunning(true);
    try {
      const detail = await getPlanVersion(planId, exportTarget.id);
      const layout = snapshotToLayoutSnapshot(detail.snapshot);
      await exportPlanVersionSnapshot(layout, {
        planDisplayName,
        versionNo: detail.version.versionNo,
        versionName: detail.version.versionName,
        savedAtMs: detail.version.createdAt,
      }, format);
      setExportTarget(null);
    } catch (e: unknown) {
      window.alert(e instanceof ApiError ? e.message : "导出失败");
    } finally {
      setExportRunning(false);
    }
  };

  const viewTableRows = useMemo(() => (view ? buildRoundOverviewTableRows(view.roundPlan) : []), [view]);

  const viewUnassigned = useMemo(() => {
    if (!view) return [];
    const seated = new Set(view.roundPlan.seats.filter((s) => s.personId).map((s) => s.personId as string));
    return view.roundPlan.people.filter((p) => !seated.has(p.id));
  }, [view]);

  if (!listOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[200] flex justify-end bg-slate-900/30" role="presentation">
        <button
          type="button"
          aria-label="关闭版本记录"
          className="min-h-0 min-w-0 flex-1 cursor-default border-0 bg-transparent"
          onClick={closeAll}
        />
        <aside className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-900">版本记录</h2>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
              onClick={closeAll}
            >
              关闭
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {!linkable ? (
              <p className="text-sm text-slate-600">请从方案管理进入总览并关联后端方案后，方可查看版本记录。</p>
            ) : listLoading ? (
              <p className="text-sm text-slate-500">加载中…</p>
            ) : listError ? (
              <p className="text-sm text-rose-600">{listError}</p>
            ) : versions.length === 0 ? (
              <p className="text-sm text-slate-500">暂无已保存版本。</p>
            ) : (
              <ul className="space-y-3">
                {versions.map((v) => (
                  <li key={v.id} className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-3 text-sm">
                    <div className="font-semibold text-slate-900">
                      V{v.versionNo}
                      {v.versionName ? ` · ${v.versionName}` : ""}
                    </div>
                    {v.note ? <div className="mt-1 text-slate-600">{v.note}</div> : null}
                    <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                      <div>保存时间：{formatVersionTime(v.createdAt)}</div>
                      <div>
                        桌 {v.tableCount} · 人数 {v.peopleCount} · 已安排 {v.assignedCount} · 未安排{" "}
                        {v.unassignedCount}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={viewLoadingId === v.id}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        onClick={() => void onView(v)}
                      >
                        {viewLoadingId === v.id ? "加载…" : "查看"}
                      </button>
                      <button
                        type="button"
                        disabled={exportRunning}
                        className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100/80 disabled:opacity-50"
                        onClick={() => setExportTarget(v)}
                      >
                        导出
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {exportTarget ? (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/45 p-4"
          role="presentation"
          onClick={() => {
            if (!exportRunning) setExportTarget(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-version-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 px-5 py-4">
              <h2 id="export-version-title" className="text-lg font-semibold text-slate-900">
                导出版本
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                版本：{versionSummaryLine(exportTarget)}
              </p>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">格式</div>
              <ul className="mt-3 space-y-2">
                {EXPORT_FORMAT_ITEMS.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={exportRunning}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:border-orange-200 hover:bg-orange-50/50 disabled:opacity-50"
                      onClick={() => void onExportFormat(item.id)}
                    >
                      <span>{item.label}</span>
                      <span className="text-xs text-slate-400" aria-hidden>
                        →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {exportRunning ? <p className="mt-3 text-xs text-slate-500">正在导出…</p> : null}
            </div>
            <div className="flex justify-end border-t border-slate-200/80 px-5 py-3">
              <button
                type="button"
                disabled={exportRunning}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setExportTarget(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {view ? (
        <div className="fixed inset-0 z-[210] flex flex-col bg-slate-50">
          <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900">
                历史版本 · V{view.version.versionNo}
                {view.version.versionName ? ` · ${view.version.versionName}` : ""}
              </div>
              <div className="mt-1 text-xs text-slate-500">保存时间：{formatVersionTime(view.version.createdAt)}</div>
              <div className="mt-2 text-sm text-slate-700">
                桌 {view.version.tableCount} · 总人数 {view.version.peopleCount} · 已安排 {view.version.assignedCount}{" "}
                · 未安排 {view.version.unassignedCount}
              </div>
              <p className="mt-2 text-xs text-amber-800">只读预览，不影响当前编辑中的方案。</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setView(null)}
              >
                关闭预览
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <section className={overviewGridColsClass()} style={overviewGridColsStyle(colsPerRow)}>
              {viewTableRows.map((t) => (
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
                />
              ))}
            </section>
            {viewUnassigned.length > 0 ? (
              <div className="mt-4 rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-sm text-slate-700">
                <span className="font-medium text-slate-800">未安排（{viewUnassigned.length}）</span>
                <span className="ml-2 text-slate-600">{viewUnassigned.map((p) => p.name).join("、")}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
