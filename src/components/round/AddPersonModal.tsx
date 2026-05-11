import { useEffect, useState } from "react";
import { ApiError } from "@/api/client";
import { createPerson, getPlanDetail, updatePerson } from "@/api/plans";
import { isLinkableBackendPlanId } from "@/lib/roundBackendPlanId";

export type AddPersonEditTarget = {
  id: string;
  name: string;
  region: string;
  position: string;
  role: string;
};

export type AddPersonModalProps = {
  open: boolean;
  onClose: () => void;
  planId: string;
  planDisplayName: string;
  onSuccess: () => void | Promise<void>;
  /** 传入则为编辑模式（同一表单，提交时 PATCH） */
  editPerson?: AddPersonEditTarget | null;
};

export function AddPersonModal(props: AddPersonModalProps) {
  const { open, onClose, planId, planDisplayName, onSuccess, editPerson = null } = props;
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [position, setPosition] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const regionListDomId = `paizuo-add-person-region-${planId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const isEdit = Boolean(editPerson);

  useEffect(() => {
    if (!open) return;
    if (editPerson) {
      setName(editPerson.name);
      setRegion(editPerson.region);
      setPosition(editPerson.position);
      setRole(editPerson.role);
    } else {
      setName("");
      setRegion("");
      setPosition("");
      setRole("");
    }
  }, [open, editPerson]);

  useEffect(() => {
    if (!open || !isLinkableBackendPlanId(planId)) {
      setRegionOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await getPlanDetail(planId);
        if (cancelled) return;
        const set = new Set<string>();
        for (const p of d.people) {
          const r = p.region?.trim();
          if (r) set.add(r);
        }
        setRegionOptions([...set].sort((a, b) => a.localeCompare(b, "zh-CN")));
      } catch {
        if (!cancelled) setRegionOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, planId]);

  if (!open) return null;

  const submit = async () => {
    const n = name.trim();
    const reg = region.trim();
    const pos = position.trim();
    const rl = role.trim();
    if (!n || !reg || !pos || !rl) {
      window.alert("请填写姓名、区域、岗位、角色");
      return;
    }
    if (!isLinkableBackendPlanId(planId)) {
      window.alert("请先通过方案管理选择并进入已关联的后端方案，再添加人员。");
      return;
    }
    setBusy(true);
    try {
      if (isEdit && editPerson) {
        await updatePerson(planId, editPerson.id, { name: n, region: reg, position: pos, role: rl });
      } else {
        await createPerson(planId, { name: n, region: reg, position: pos, role: rl });
      }
      await Promise.resolve(onSuccess());
      window.alert(isEdit ? "人员信息已保存" : "人员已添加到未安排名单");
      onClose();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : isEdit ? "保存失败，请重试" : "添加失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-person-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <div className="min-w-0">
            <h2 id="add-person-title" className="text-lg font-semibold text-slate-900">
              {isEdit ? "编辑人员" : "添加人员"} · {planDisplayName}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {isEdit ? "修改人员档案信息后请点击确认保存" : "支持手动添加人员信息"}
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

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-800">
              姓名 <span className="text-orange-600">*</span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入姓名"
              autoComplete="name"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-800">
              区域 <span className="text-orange-600">*</span>
            </span>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="请选择区域"
              list={regionListDomId}
              autoComplete="address-level1"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
            <datalist id={regionListDomId}>
              {regionOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-800">
              岗位 <span className="text-orange-600">*</span>
            </span>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="请输入岗位"
              autoComplete="organization-title"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-800">
              角色 <span className="text-orange-600">*</span>
            </span>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="请输入角色"
              autoComplete="nickname"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
            <p className="mt-1 text-xs text-slate-500">角色为自定义输入</p>
          </label>
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          <p className="text-xs text-slate-500">
            {isEdit
              ? "修改后列表与排座数据将随方案刷新。角色为自定义输入。"
              : "添加后默认进入未安排人员名单，可拖拽至空座完成排座。角色为自定义输入。"}
          </p>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200/80 px-5 py-4">
          <button
            type="button"
            className="rounded-lg border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-lg border border-orange-500/20 bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "提交中…" : isEdit ? "确认保存" : "确认添加"}
          </button>
        </div>
      </div>
    </div>
  );
}
