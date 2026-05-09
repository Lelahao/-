import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/api/client";
import { deletePerson, getPlanDetail, unassignPerson } from "@/api/plans";
import type { PlanDetail } from "@/lib/dbTypes";
import { isLinkableBackendPlanId } from "@/lib/roundBackendPlanId";
import type { RoundPlanSnapshot } from "@/lib/roundSeatEngine";
import type { AddPersonEditTarget } from "./AddPersonModal";

export type PersonManageModalProps = {
  open: boolean;
  onClose: () => void;
  planId: string;
  planDisplayName: string;
  /** 演示或未拉取详情时用于列表回退 */
  planSnapshot: RoundPlanSnapshot;
  /** 父级在 refresh 成功后递增，用于与后端人员档案同步 */
  reloadKey: number;
  onAddClick: () => void;
  onEditClick: (person: AddPersonEditTarget) => void;
  onBulkImportClick: () => void;
  onRefresh: () => void | Promise<void>;
};

type PersonManageRow = {
  id: string;
  name: string;
  region: string;
  position: string;
  role: string;
  assignedTableId: string | null;
  assignedSeatNo: number | null;
  tableNo: number | null;
  /** true：可操作后端；false：演示快照只读 */
  api: boolean;
};

function rowsFromDetail(d: PlanDetail): PersonManageRow[] {
  const tmap = new Map(d.tables.map((t) => [t.id, t.tableNo]));
  return d.people.map((p) => ({
    id: p.id,
    name: p.displayName,
    region: p.region ?? "",
    position: p.position ?? "",
    role: p.role ?? "",
    assignedTableId: p.assignedTableId,
    assignedSeatNo: p.assignedSeatNo,
    tableNo: p.assignedTableId ? (tmap.get(p.assignedTableId) ?? null) : null,
    api: true,
  }));
}

function rowsFromSnapshot(plan: RoundPlanSnapshot): PersonManageRow[] {
  const tmap = new Map(plan.tables.map((t) => [t.id, t.no]));
  return plan.people.map((p) => {
    const seat = plan.seats.find((s) => s.personId === p.id);
    const tid = seat?.tableId ?? null;
    const sn = seat?.seatNo ?? null;
    return {
      id: p.id,
      name: p.name,
      region: "—",
      position: "—",
      role: "—",
      assignedTableId: tid,
      assignedSeatNo: sn,
      tableNo: tid ? (tmap.get(tid) ?? null) : null,
      api: false,
    };
  });
}

function isAssignedRow(r: PersonManageRow): boolean {
  return Boolean(r.assignedTableId && r.assignedSeatNo != null);
}

function rowMatchesSearch(r: PersonManageRow, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;
  const tn = r.tableNo != null ? String(r.tableNo) : "";
  const sn = r.assignedSeatNo != null ? String(r.assignedSeatNo) : "";
  const hay = [
    r.name,
    r.region,
    r.position,
    r.role,
    tn,
    sn,
    tn && sn ? `${tn}号桌${sn}座` : "",
    tn && sn ? `${tn}号桌 · ${sn}座` : "",
  ]
    .join("\n")
    .toLowerCase();
  return hay.includes(q);
}

export function PersonManageModal(props: PersonManageModalProps) {
  const { open, onClose, planId, planDisplayName, planSnapshot, reloadKey, onAddClick, onEditClick, onBulkImportClick, onRefresh } =
    props;
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"unassigned" | "assigned">("unassigned");
  const [search, setSearch] = useState("");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setTab("unassigned");
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setLoadErr(null);
      return;
    }
    if (!isLinkableBackendPlanId(planId)) {
      setDetail(null);
      setLoadErr(null);
      return;
    }
    let cancelled = false;
    setLoadErr(null);
    (async () => {
      try {
        const d = await getPlanDetail(planId);
        if (!cancelled) setDetail(d);
      } catch {
        if (!cancelled) {
          setDetail(null);
          setLoadErr("加载人员列表失败");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, planId, reloadKey]);

  const allRows = useMemo((): PersonManageRow[] => {
    if (detail) return rowsFromDetail(detail);
    return rowsFromSnapshot(planSnapshot);
  }, [detail, planSnapshot]);

  const { unassignedRows, assignedRows } = useMemo(() => {
    const u: PersonManageRow[] = [];
    const a: PersonManageRow[] = [];
    for (const r of allRows) {
      if (isAssignedRow(r)) a.push(r);
      else u.push(r);
    }
    return { unassignedRows: u, assignedRows: a };
  }, [allRows]);

  const activePool = tab === "unassigned" ? unassignedRows : assignedRows;
  const filteredRows = useMemo(() => activePool.filter((r) => rowMatchesSearch(r, search)), [activePool, search]);

  const canMutate = isLinkableBackendPlanId(planId) && detail != null;

  const runMutation = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await Promise.resolve(onRefresh());
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "操作失败，请重试");
    }
  };

  const onEditRow = (r: PersonManageRow) => {
    if (!r.api) {
      window.alert("演示方案请从方案管理进入真实方案后再编辑人员。");
      return;
    }
    onEditClick({
      id: r.id,
      name: r.name,
      region: r.region || "",
      position: r.position || "",
      role: r.role || "",
    });
  };

  const onDeleteUnassigned = (r: PersonManageRow) => {
    if (!r.api || !canMutate) {
      window.alert("演示方案请从方案管理进入真实方案后再删除人员。");
      return;
    }
    if (!window.confirm("确定删除该人员？")) return;
    void (async () => {
      setRowBusyId(r.id);
      try {
        await runMutation(async () => {
          await deletePerson(planId, r.id);
        });
      } finally {
        setRowBusyId(null);
      }
    })();
  };

  const onDeleteAssigned = (r: PersonManageRow) => {
    if (!r.api || !canMutate) {
      window.alert("演示方案请从方案管理进入真实方案后再删除人员。");
      return;
    }
    const tn = r.tableNo ?? "?";
    const sn = r.assignedSeatNo ?? "?";
    if (!window.confirm(`该人员已安排在 ${tn}号桌 ${sn}座，删除后将清空座位。确定删除？`)) return;
    void (async () => {
      setRowBusyId(r.id);
      try {
        await runMutation(async () => {
          await deletePerson(planId, r.id);
        });
      } finally {
        setRowBusyId(null);
      }
    })();
  };

  const onUnassignRow = (r: PersonManageRow) => {
    if (!r.api || !canMutate) {
      window.alert("演示方案请从方案管理进入真实方案后再操作。");
      return;
    }
    if (!window.confirm("确定将该人员退回未安排？")) return;
    void (async () => {
      setRowBusyId(r.id);
      try {
        await runMutation(async () => {
          await unassignPerson(planId, r.id);
        });
      } finally {
        setRowBusyId(null);
      }
    })();
  };

  const onPickImport = () => {
    if (!canMutate) {
      window.alert("请在后端方案下使用批量导入。");
      return;
    }
    onBulkImportClick();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(42rem,92vh)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-manage-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <h2 id="person-manage-title" className="text-lg font-semibold text-slate-900">
            人员管理 · {planDisplayName}
          </h2>
          <button
            type="button"
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="关闭"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onAddClick}
            className="inline-flex items-center rounded-lg border border-orange-500 bg-white px-3 py-1.5 text-sm font-medium text-orange-600 shadow-sm hover:bg-orange-50"
          >
            + 添加人员
          </button>
          <button
            type="button"
            onClick={onPickImport}
            disabled={!canMutate}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            批量导入
          </button>
          <div className="min-w-[12rem] flex-1">
            <label className="block">
              <span className="sr-only">搜索</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索人员姓名 / 区域 / 岗位 / 角色"
                autoComplete="off"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </label>
          </div>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-slate-200/80 px-5">
          <button
            type="button"
            onClick={() => setTab("unassigned")}
            className={`border-b-2 px-3 py-3 text-sm font-medium transition ${
              tab === "unassigned"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            未安排人员（{unassignedRows.length}）
          </button>
          <button
            type="button"
            onClick={() => setTab("assigned")}
            className={`border-b-2 px-3 py-3 text-sm font-medium transition ${
              tab === "assigned"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            已安排人员（{assignedRows.length}）
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          {loadErr ? <p className="text-sm text-red-600">{loadErr}</p> : null}
          {!isLinkableBackendPlanId(planId) ? (
            <p className="mb-2 text-xs text-slate-500">当前为演示/本地方案，列表来自内存快照；完整档案与导入请使用已关联的后端方案。</p>
          ) : null}
          {filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {activePool.length === 0 ? "暂无数据" : "没有符合搜索条件的人员"}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200/90">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5">姓名</th>
                    <th className="px-3 py-2.5">区域</th>
                    <th className="px-3 py-2.5">岗位</th>
                    <th className="px-3 py-2.5">角色</th>
                    <th className="px-3 py-2.5">状态</th>
                    <th className="sticky right-0 bg-slate-50/90 px-3 py-2.5 text-right shadow-[-4px_0_8px_rgb(15_23_42_/_0.06)]">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const busy = rowBusyId === r.id;
                    const assigned = isAssignedRow(r);
                    const statusText = assigned
                      ? r.tableNo != null && r.assignedSeatNo != null
                        ? `已安排（${r.tableNo}号桌 · ${r.assignedSeatNo}座）`
                        : "已安排"
                      : "未安排";
                    return (
                      <tr key={r.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 font-medium text-slate-900">{r.name}</td>
                        <td className="px-3 py-2.5 text-slate-700">{r.region || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-700">{r.position || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-700">{r.role || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-600">{statusText}</td>
                        <td className="sticky right-0 bg-white px-3 py-2.5 text-right shadow-[-4px_0_8px_rgb(15_23_42_/_0.06)]">
                          <div className="flex flex-wrap justify-end gap-2">
                            {assigned ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => onUnassignRow(r)}
                                className="text-sm font-medium text-sky-600 hover:text-sky-800 disabled:opacity-50"
                              >
                                退回未安排
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onEditRow(r)}
                              className="text-sm font-medium text-orange-600 hover:text-orange-800 disabled:opacity-50"
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => (assigned ? onDeleteAssigned(r) : onDeleteUnassigned(r))}
                              className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t border-slate-200/80 px-5 py-4">
          <p className="text-xs text-slate-500">
            支持手动添加与 Excel 批量导入；请点击顶部「批量导入」使用模板与导入流程。
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
