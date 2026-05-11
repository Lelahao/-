import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { ApiError } from "@/api/client";
import { importPeople } from "@/api/plans";
import { isLinkableBackendPlanId } from "@/lib/roundBackendPlanId";

const SHEET_DATA = "人员导入";
const SHEET_HELP = "填写说明";

const HEADER_NEED = ["姓名", "区域", "岗位", "角色"] as const;

function sanitizePlanBasename(name: string): string {
  const t = name.trim() || "方案";
  return t.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").slice(0, 80);
}

function templateFileName(planDisplayName: string): string {
  return `${sanitizePlanBasename(planDisplayName)}_人员导入模板.xlsx`;
}

/** 双 Sheet、首行表头；无示例数据行、无数据验证（角色列为普通单元格）。 */
export function downloadPeopleImportTemplateFile(planDisplayName: string) {
  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.aoa_to_sheet([["姓名", "区域", "岗位", "角色"]]);
  XLSX.utils.book_append_sheet(wb, wsData, SHEET_DATA);
  const helpRows = [
    ["填写说明"],
    [""],
    ["1. 请在「人员导入」工作表第 1 行填写表头，请勿修改列名。"],
    ["2. 姓名、区域、岗位、角色均为必填；自第 2 行起每人一行。"],
    ["3. 角色为自定义文本，请勿使用下拉或枚举限制。"],
    ["4. 仅支持 .xlsx 格式；导入为追加，不覆盖、不删除已有人员。"],
  ];
  const wsHelp = XLSX.utils.aoa_to_sheet(helpRows);
  XLSX.utils.book_append_sheet(wb, wsHelp, SHEET_HELP);
  XLSX.writeFile(wb, templateFileName(planDisplayName), { bookType: "xlsx" });
}

export type ValidatePeopleImportFileResult =
  | { ok: true }
  | { ok: false; message: string };

export async function validatePeopleImportFile(file: File): Promise<ValidatePeopleImportFileResult> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx")) {
    return { ok: false, message: "仅支持 .xlsx 格式文件" };
  }
  let wb: XLSX.WorkBook;
  try {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: "array" });
  } catch {
    return { ok: false, message: "无法读取该 Excel 文件，请检查是否为有效的 .xlsx" };
  }
  if (!wb.SheetNames?.length) {
    return { ok: false, message: "工作簿为空，无可导入人员" };
  }
  const ws = wb.Sheets[SHEET_DATA] ?? wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!ws) {
    return { ok: false, message: "工作簿为空，无可导入人员" };
  }
  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  if (!rows.length) {
    return { ok: false, message: "空文件，无可导入人员" };
  }
  const header = (rows[0] ?? []).map((c) => String(c ?? "").trim());
  const idx: Record<(typeof HEADER_NEED)[number], number> = {
    姓名: -1,
    区域: -1,
    岗位: -1,
    角色: -1,
  };
  for (const key of HEADER_NEED) {
    const i = header.indexOf(key);
    if (i < 0) {
      return { ok: false, message: `表头缺少必填列「${key}」，请使用系统模板` };
    }
    idx[key] = i;
  }
  let dataRows = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;
    const name = String(row[idx["姓名"]] ?? "").trim();
    const region = String(row[idx["区域"]] ?? "").trim();
    const position = String(row[idx["岗位"]] ?? "").trim();
    const role = String(row[idx["角色"]] ?? "").trim();
    if (!name && !region && !position && !role) continue;
    dataRows++;
    if (!name || !region || !position || !role) {
      return { ok: false, message: `第 ${r + 1} 行：姓名、区域、岗位、角色均不能为空` };
    }
  }
  if (dataRows === 0) {
    return { ok: false, message: "无可导入人员" };
  }
  return { ok: true };
}

import type { PeopleImportResult } from "@/api/plans";

export type BulkImportPeopleModalProps = {
  open: boolean;
  onClose: () => void;
  planId: string;
  planDisplayName: string;
  /** 导入请求成功（已拿到服务端结果）后调用；请先在此内刷新方案数据再展示结果弹窗 */
  onImportComplete: (result: PeopleImportResult) => void | Promise<void>;
};

export function BulkImportPeopleModal(props: BulkImportPeopleModalProps) {
  const { open, onClose, planId, planDisplayName, onImportComplete } = props;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 可见提示（Electron 下 alert 易被忽略时仍能看到进度/错误） */
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      return;
    }
    setSelectedFile(null);
    setDragOver(false);
    setFeedback(null);
    setBusy(false);
  }, [open]);

  const requestClose = useCallback(() => {
    setBusy(false);
    onClose();
  }, [onClose]);

  const pickFile = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const applySingleFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setFeedback("仅支持 .xlsx 格式文件");
      window.alert("仅支持 .xlsx 格式文件");
      return;
    }
    setSelectedFile(file);
  }, []);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    applySingleFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const list = e.dataTransfer.files;
    if (list.length > 1) {
      window.alert("每次只能导入一个文件");
      return;
    }
    applySingleFile(list[0]);
  };

  const onImportSubmit = () => {
    const linkable = isLinkableBackendPlanId(planId);
    if (busy) {
      return;
    }
    if (!selectedFile) {
      setFeedback("请先选择 Excel 文件");
      window.alert("请先选择 Excel 文件");
      return;
    }
    if (!linkable) {
      setFeedback("当前方案无法关联后端，请从方案管理进入真实方案后再导入。");
      window.alert("请先通过方案管理选择并进入已关联的后端方案，再批量导入人员。");
      return;
    }
    setBusy(true);
    setFeedback("正在校验 Excel…");
    void (async () => {
      const v = await validatePeopleImportFile(selectedFile);
      if (!v.ok) {
        setFeedback(v.message);
        window.alert(v.message);
        setBusy(false);
        return;
      }
      setFeedback("正在上传并导入，请稍候…");
      let res: PeopleImportResult | null = null;
      try {
        res = await importPeople(planId, selectedFile);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "导入失败，请重试";
        setFeedback(msg);
        window.alert(msg);
        setBusy(false);
        return;
      }
      setBusy(false);
      setFeedback(null);
      requestClose();
      if (res) {
        try {
          await Promise.resolve(onImportComplete(res));
        } catch {
          window.alert("导入已完成，但刷新总览失败，请手动刷新页面。");
        }
      }
    })();
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={onInputChange}
      />
      <div
        className="flex max-h-[min(44rem,94vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <div className="min-w-0">
            <h2 id="bulk-import-title" className="text-lg font-semibold text-slate-900">
              批量导入人员 · {planDisplayName}
            </h2>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="关闭"
            onClick={requestClose}
          >
            ✕
          </button>
        </div>

        {feedback || busy ? (
          <div className="shrink-0 border-b border-amber-200/90 bg-amber-50 px-5 py-2 text-sm text-amber-950" role="status">
            {feedback ?? "处理中，请稍候…"}
          </div>
        ) : null}

        <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={() => downloadPeopleImportTemplateFile(planDisplayName)}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 sm:flex-initial"
          >
            下载 Excel 模板
          </button>
          <button
            type="button"
            onClick={pickFile}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600 sm:flex-initial"
          >
            选择文件导入
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pickFile();
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
            }}
            onDrop={onDrop}
            onClick={() => pickFile()}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-10 text-center text-sm transition ${
              dragOver ? "border-orange-400 bg-orange-50/60" : "border-slate-200 bg-slate-50/80 hover:border-slate-300"
            }`}
          >
            <span className="text-slate-600">
              将 Excel 文件拖拽到此处，或{" "}
              <span className="font-medium text-orange-600 underline decoration-orange-300 underline-offset-2">
                点击选择文件
              </span>
            </span>
            {selectedFile ? (
              <p className="mt-3 text-xs text-slate-500">已选择：{selectedFile.name}</p>
            ) : null}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200/90 bg-slate-50/50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">模板说明（必填字段）</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>
                <span className="font-medium text-slate-900">姓名</span>{" "}
                <span className="text-orange-600">*</span>
              </li>
              <li>
                <span className="font-medium text-slate-900">区域</span>{" "}
                <span className="text-orange-600">*</span>
              </li>
              <li>
                <span className="font-medium text-slate-900">岗位</span>{" "}
                <span className="text-orange-600">*</span>
              </li>
              <li>
                <span className="font-medium text-slate-900">角色</span>{" "}
                <span className="text-orange-600">*</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              请使用系统模板录入人员信息，首行字段不可修改；支持 .xlsx 格式。
            </p>
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="px-3 py-2">姓名</th>
                    <th className="px-3 py-2">区域</th>
                    <th className="px-3 py-2">岗位</th>
                    <th className="px-3 py-2">角色</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-slate-400">
                    <td className="border-t border-slate-100 px-3 py-2">…</td>
                    <td className="border-t border-slate-100 px-3 py-2">…</td>
                    <td className="border-t border-slate-100 px-3 py-2">…</td>
                    <td className="border-t border-slate-100 px-3 py-2">…</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t border-slate-200/80 px-5 py-4">
          {feedback ? (
            <p className="text-sm font-medium text-amber-900" role="status">
              {feedback}
            </p>
          ) : null}
          <p className="text-xs text-slate-500">导入后人员将进入未安排名单中，可在人员管理中继续编辑。</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={requestClose}
              className="rounded-lg border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onImportSubmit}
              className="rounded-lg border border-orange-500/20 bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
            >
              {busy ? "导入中…" : "开始导入"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
