import { useEffect, useState } from "react";
import { ApiError } from "@/api/client";
import { deletePerson, updatePerson } from "@/api/plans";

export type EditPersonNameModalProps = {
  open: boolean;
  onClose: () => void;
  planId: string;
  personId: string;
  initialName: string;
  /** 当前座位描述，例如 "2号桌 · 5号座" */
  seatLabel?: string;
  /** 保存或删除成功后调用，用于刷新当前界面数据 */
  onChanged: () => void | Promise<void>;
};

/**
 * 全屏页点击座位姓名时弹出。仅修改姓名；区域/岗位/角色请在「人员管理」中编辑。
 * 同一弹窗提供「删除人员」按钮，删除走二次确认。
 */
export function EditPersonNameModal(props: EditPersonNameModalProps) {
  const { open, onClose, planId, personId, initialName, seatLabel, onChanged } = props;
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  if (!open) return null;

  const submit = async () => {
    const n = name.trim();
    if (!n) {
      window.alert("请填写姓名");
      return;
    }
    if (n === initialName.trim()) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await updatePerson(planId, personId, { name: n });
      await Promise.resolve(onChanged());
      onClose();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const label = initialName.trim() || "该人员";
    const seatPart = seatLabel ? `\n该人员当前安排在 ${seatLabel}。` : "";
    const ok = window.confirm(
      `确认删除「${label}」吗？${seatPart}\n删除后将清空其座位绑定，并从当前方案人员名单中移除。`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deletePerson(planId, personId);
      await Promise.resolve(onChanged());
      onClose();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "删除失败，请重试");
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
        aria-labelledby="edit-person-name-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <div className="min-w-0">
            <h2 id="edit-person-name-title" className="text-lg font-semibold text-slate-900">
              编辑人员
            </h2>
            {seatLabel ? (
              <p className="mt-1 text-sm text-slate-600">当前座位：{seatLabel}</p>
            ) : null}
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

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-800">
              姓名 <span className="text-orange-600">*</span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </label>
          <p className="text-xs text-slate-500">
            此处仅修改姓名；区域、岗位、角色请在「人员管理」中编辑。
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200/80 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDelete()}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-60"
          >
            删除人员
          </button>
          <div className="flex gap-2">
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
    </div>
  );
}
