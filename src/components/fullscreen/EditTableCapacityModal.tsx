import { useEffect, useState } from "react";
import type { TableDefinition } from "@/fullscreen/types";

export type EditTableCapacityModalProps = {
  open: boolean;
  onClose: () => void;
  table: TableDefinition;
  /** 提交新 capacity；父组件负责超容确认 / unassign / saveTables / refresh 等业务编排。
   *  约定：父组件抛错时弹窗保持打开；成功 / 无变化时弹窗自行关闭。 */
  onSubmit: (newCapacity: number) => Promise<void>;
};

function parseCapacity(s: string): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function EditTableCapacityModal({ open, onClose, table, onSubmit }: EditTableCapacityModalProps) {
  const [text, setText] = useState(String(table.capacity));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setText(String(table.capacity));
  }, [open, table.capacity]);

  if (!open) return null;

  const submit = async () => {
    const n = parseCapacity(text);
    if (n == null) {
      window.alert("请输入正整数（每桌人数 ≥ 1）。");
      return;
    }
    if (n === table.capacity) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(n);
      onClose();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-table-capacity-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <div className="min-w-0">
            <h2 id="edit-table-capacity-title" className="text-lg font-semibold text-slate-900">
              修改每桌人数
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {table.no}号桌 · {table.hallName || "宾客桌"}
            </p>
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

        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-800">
              每桌人数 <span className="text-orange-600">*</span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </label>
          <p className="text-xs text-slate-500">
            当前 {table.capacity} 人。减少人数时，超出位置上的人员将被移出座位，但不会从人员管理中删除。
          </p>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200/80 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg border border-orange-500/20 bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
          >
            {busy ? "处理中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
