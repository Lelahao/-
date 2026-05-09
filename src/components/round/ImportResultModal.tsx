import * as XLSX from "xlsx";
import type { PeopleImportFailureRow, PeopleImportResult } from "@/api/plans";

const FAILURE_DETAIL_FILENAME = "人员导入失败明细.xlsx";

function downloadFailureDetailXlsx(failures: PeopleImportFailureRow[]) {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [
    ["行号", "姓名", "区域", "岗位", "角色", "失败原因"],
    ...failures.map((f) => [f.row, f.name, f.region, f.position, f.role, f.reason]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "失败明细");
  XLSX.writeFile(wb, FAILURE_DETAIL_FILENAME, { bookType: "xlsx" });
}

export type ImportResultModalProps = {
  open: boolean;
  onClose: () => void;
  planDisplayName: string;
  result: PeopleImportResult | null;
  onContinueAdd: () => void;
  onViewPersonManage: () => void;
  /** 完成：刷新总览后关闭 */
  onDone: () => void | Promise<void>;
};

export function ImportResultModal(props: ImportResultModalProps) {
  const { open, onClose, planDisplayName, result, onContinueAdd, onViewPersonManage, onDone } = props;

  if (!open || !result) return null;

  const x = result.successCount;
  const y = result.failureCount;

  const topLine =
    x > 0 && y > 0
      ? `Excel 导入完成，成功新增 ${x} 人，失败 ${y} 人`
      : x > 0 && y === 0
        ? `Excel 导入完成，成功新增 ${x} 人`
        : `Excel 导入失败，请检查模板格式`;

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(46rem,94vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-result-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <div className="min-w-0">
            <h2 id="import-result-title" className="text-lg font-semibold text-slate-900">
              导入结果 · {planDisplayName}
            </h2>
            <p className="mt-2 text-sm text-slate-600">{topLine}</p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="关闭"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {x > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900">成功导入（{x}人）</h3>
              <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200/90">
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-medium text-slate-500">
                      <th className="px-3 py-2">姓名</th>
                      <th className="px-3 py-2">区域</th>
                      <th className="px-3 py-2">岗位</th>
                      <th className="px-3 py-2">角色</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.success.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-2 font-medium text-slate-900">{s.name}</td>
                        <td className="px-3 py-2 text-slate-700">{s.region}</td>
                        <td className="px-3 py-2 text-slate-700">{s.position}</td>
                        <td className="px-3 py-2 text-slate-700">{s.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {y > 0 ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">失败记录（{y}人）</h3>
                <button
                  type="button"
                  onClick={() => downloadFailureDetailXlsx(result.failures)}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  下载失败明细
                </button>
              </div>
              <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-slate-200/90">
                <table className="w-full min-w-[20rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-medium text-slate-500">
                      <th className="px-3 py-2">姓名</th>
                      <th className="px-3 py-2">原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.failures.map((f, i) => (
                      <tr key={`${f.row}-${i}`} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-2 font-medium text-slate-900">{f.name || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{f.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 space-y-3 border-t border-slate-200/80 px-5 py-4">
          <p className="text-xs text-slate-500">系统模板下载入口可在批量导入窗口再次获取</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onContinueAdd}
              className="rounded-lg border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              继续添加人员
            </button>
            <button
              type="button"
              onClick={onViewPersonManage}
              className="rounded-lg border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              查看人员管理
            </button>
            <button
              type="button"
              onClick={() => void onDone()}
              className="rounded-lg border border-orange-500/20 bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
