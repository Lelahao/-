import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { createPlanVersion, listPlanVersions } from "@/api/plans";
import { saveLayoutSnapshot } from "@/fullscreen/roundStorage";
import { resolveLayoutForExport, roundPlanToLayout } from "@/lib/layoutBridge";
import { titleForPath } from "@/lib/pageTitles";
import { autoArrangeRoundSeats } from "@/lib/roundSeatEngine";
import {
  exportLayoutExcel,
  exportLayoutJson,
  exportLayoutJpg,
  exportLayoutPng,
  exportLayoutPpt,
  exportLayoutSvgFile,
  exportLayoutWord,
} from "@/lib/planExport";
import { isLinkableBackendPlanId } from "@/lib/roundBackendPlanId";
import { pushRoundPlanToBackend } from "@/lib/syncRoundPlanToBackend";
import { useRoundPlanDemoStore } from "@/stores/roundPlanDemoStore";
import { useRoundVersionDrawerStore } from "@/stores/roundVersionDrawerStore";
import { useRoundPersonSearchStore } from "@/stores/roundPersonSearchStore";

const btnBase =
  "inline-flex items-center justify-center rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600";

const exportTriggerBase =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-orange-500 bg-white px-3 py-1.5 text-sm font-medium text-orange-600 shadow-sm transition hover:bg-orange-50";

const AUTO_SEAT_NEED_OVERVIEW_MESSAGE = "请进入圆桌排座总览或单桌页后再使用自动排座。";

const EXPORT_ITEMS = [
  "导出为 Excel",
  "导出为 Word",
  "导出为 PPT",
  "导出为 JSON",
  "导出为 PNG 图片",
  "导出为 JPG 图片",
  "导出为 SVG 图片",
] as const;

export function TopToolbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const title = titleForPath(pathname);
  const isTableEdit = pathname.startsWith("/round/table/");
  const showRoundExport = pathname.startsWith("/round") && !pathname.includes("/fullscreen");

  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoSeatModalOpen, setAutoSeatModalOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const setPlan = useRoundPlanDemoStore((s) => s.setPlan);
  const plan = useRoundPlanDemoStore((s) => s.plan);
  const isRoundOverview = pathname.startsWith("/round/overview");
  const personSearchQuery = useRoundPersonSearchStore((s) => s.query);
  const setPersonSearchQuery = useRoundPersonSearchStore((s) => s.setQuery);

  const versionStats = useMemo(() => {
    const seated = new Set(plan.seats.filter((s) => s.personId).map((s) => s.personId as string));
    return {
      tableCount: plan.tables.length,
      peopleCount: plan.people.length,
      assignedCount: seated.size,
      unassignedCount: plan.people.length - seated.size,
    };
  }, [plan]);

  const [saveVersionOpen, setSaveVersionOpen] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [versionNote, setVersionNote] = useState("");
  const [, setVersionList] = useState<{ versionNo: number }[]>([]);

  const canRunAutoSeat =
    pathname.startsWith("/round/overview") || pathname.startsWith("/round/table/");

  useEffect(() => {
    if (!exportOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = exportRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setExportOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [exportOpen]);

  const getPlan = () => useRoundPlanDemoStore.getState().plan;

  const handleSavePlan = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const layout = roundPlanToLayout(getPlan());
      await saveLayoutSnapshot(layout);
    } catch {
      window.alert("保存失败：请确认在桌面版中运行或稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (label: (typeof EXPORT_ITEMS)[number]) => {
    setExportOpen(false);
    if (busy) return;
    setBusy(true);
    try {
      const layout = await resolveLayoutForExport(getPlan);
      switch (label) {
        case "导出为 Excel":
          await exportLayoutExcel(layout);
          break;
        case "导出为 Word":
          await exportLayoutWord(layout);
          break;
        case "导出为 PPT":
          await exportLayoutPpt(layout);
          break;
        case "导出为 JSON":
          exportLayoutJson(layout);
          break;
        case "导出为 PNG 图片":
          await exportLayoutPng(layout);
          break;
        case "导出为 JPG 图片":
          await exportLayoutJpg(layout);
          break;
        case "导出为 SVG 图片":
          exportLayoutSvgFile(layout);
          break;
        default:
          break;
      }
    } catch {
      window.alert("导出失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const openAutoSeatModal = () => {
    if (!canRunAutoSeat) {
      window.alert(AUTO_SEAT_NEED_OVERVIEW_MESSAGE);
      return;
    }
    setAutoSeatModalOpen(true);
  };

  const closeAutoSeatModal = () => {
    if (busy) return;
    setAutoSeatModalOpen(false);
  };

  const confirmAutoSeat = () => {
    if (!canRunAutoSeat || busy) return;
    setBusy(true);
    try {
      setPlan((prev) => {
        const seats = autoArrangeRoundSeats(prev);
        return { ...prev, seats };
      });
      setAutoSeatModalOpen(false);
      window.alert("自动排座完成");
    } catch {
      window.alert("自动排座失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const onTableManagementClick = () => {
    navigate("/plans", { state: { openRoundManage: true } });
  };

  const openVersionHistory = () => {
    if (busy || !isRoundOverview) return;
    const pid = getPlan().planId;
    if (!isLinkableBackendPlanId(pid)) {
      window.alert(
        "查看版本记录需要关联已保存的后端方案。\n请从「方案管理」中选择方案并进入圆桌总览；并确认本地后端已启动。",
      );
      return;
    }
    useRoundVersionDrawerStore.getState().openList();
  };

  const openSaveVersionModal = async () => {
    if (busy || !isRoundOverview) return;
    const pid = getPlan().planId;
    if (!isLinkableBackendPlanId(pid)) {
      window.alert(
        "保存版本需要关联已保存的后端方案。\n请从「方案管理」中选择方案并进入圆桌总览；并确认本地后端已启动。",
      );
      return;
    }
    setBusy(true);
    try {
      const versions = await listPlanVersions(pid);
      const nextNo = versions.reduce((m, v) => Math.max(m, v.versionNo), 0) + 1;
      setVersionName(`V${nextNo} 当前排座方案`);
      setVersionNote("");
      setVersionList(versions);
      setSaveVersionOpen(true);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "无法加载版本列表，请确认后端已启动。");
    } finally {
      setBusy(false);
    }
  };

  const closeSaveVersionModal = () => {
    if (busy) return;
    setSaveVersionOpen(false);
  };

  const confirmSaveVersion = async () => {
    if (!isRoundOverview || busy) return;
    const name = versionName.trim();
    if (!name) {
      window.alert("版本名称不能为空");
      return;
    }
    const pid = getPlan().planId;
    if (!isLinkableBackendPlanId(pid)) return;

    setBusy(true);
    try {
      const snapshotPlan = getPlan();
      await saveLayoutSnapshot(roundPlanToLayout(snapshotPlan));
      await pushRoundPlanToBackend(pid, snapshotPlan);
      await createPlanVersion(pid, { versionName: name, note: versionNote.trim() || null });
      const refreshed = await listPlanVersions(pid);
      setVersionList(refreshed);
      setSaveVersionOpen(false);
      window.alert("版本已保存");
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "保存版本失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/90 backdrop-blur">
      <div className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-slate-900">{title}</div>
        </div>

        <div className="hidden shrink-0 items-center md:flex">
          {isRoundOverview ? (
            <label className="flex w-[13.5rem] min-w-0 items-center gap-2 text-sm text-slate-600">
              <span className="sr-only">搜索姓名</span>
              <input
                type="search"
                enterKeyHint="search"
                placeholder="搜索姓名…"
                autoComplete="off"
                value={personSearchQuery}
                onChange={(e) => setPersonSearchQuery(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isRoundOverview ? (
            <>
              <button
                type="button"
                className={btnBase}
                disabled={busy}
                onClick={() => void openSaveVersionModal()}
              >
                {busy ? "处理中…" : "保存版本"}
              </button>
              <button type="button" className={btnBase} disabled={busy} onClick={openVersionHistory}>
                版本记录
              </button>
            </>
          ) : (
            <button type="button" className={btnBase} disabled={busy} onClick={() => void handleSavePlan()}>
              {busy ? "处理中…" : "保存方案"}
            </button>
          )}
          {pathname.startsWith("/round/overview") ? null : (
            <button type="button" className={btnPrimary} disabled={busy} onClick={openAutoSeatModal}>
              自动排座
            </button>
          )}
          <button type="button" className={btnBase} onClick={onTableManagementClick}>
            {isTableEdit ? "座位管理" : "桌次管理"}
          </button>
          {pathname.startsWith("/round/overview") ? null : (
            <button type="button" className={btnBase} onClick={() => navigate("/round/check")}>
              查看检查
            </button>
          )}

          {isTableEdit ? (
            <button type="button" className={btnBase} onClick={() => navigate("/round/overview")}>
              返回总览
            </button>
          ) : null}

          {pathname.startsWith("/round/overview") ? (
            <button type="button" className={btnBase} onClick={() => navigate("/round/fullscreen")}>
              全屏
            </button>
          ) : null}

          {showRoundExport ? (
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                className={`${exportTriggerBase} ${exportOpen ? "bg-orange-50" : ""}`}
                aria-expanded={exportOpen}
                aria-haspopup="menu"
                disabled={busy}
                onClick={() => setExportOpen((v) => !v)}
              >
                导出
                <span className="text-xs" aria-hidden>
                  ▾
                </span>
              </button>

              {exportOpen ? (
                <div
                  className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-[0_10px_30px_rgb(15_23_42_/_0.12)]"
                  role="menu"
                >
                  {EXPORT_ITEMS.map((label) => (
                    <button
                      key={label}
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void handleExport(label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {autoSeatModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAutoSeatModal();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auto-seat-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 id="auto-seat-title" className="text-lg font-semibold text-slate-900">
                自动排座
              </h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-slate-700">系统将根据当前未安排人员与桌次容量自动分配座位。</p>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200/80 px-6 py-4">
              <button type="button" className={btnBase} onClick={closeAutoSeatModal} disabled={busy}>
                取消
              </button>
              <button type="button" className={btnPrimary} onClick={confirmAutoSeat} disabled={busy}>
                {busy ? "排座中…" : "确认排座"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {saveVersionOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSaveVersionModal();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-version-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 id="save-version-title" className="text-lg font-semibold text-slate-900">
                保存方案版本
              </h2>
            </div>
            <div className="space-y-4 px-6 py-4">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-3 text-sm text-slate-700">
                <div>
                  <span className="text-slate-500">桌数</span>
                  <div className="font-semibold text-slate-900">{versionStats.tableCount}</div>
                </div>
                <div>
                  <span className="text-slate-500">总人数</span>
                  <div className="font-semibold text-slate-900">{versionStats.peopleCount}</div>
                </div>
                <div>
                  <span className="text-slate-500">已安排</span>
                  <div className="font-semibold text-slate-900">{versionStats.assignedCount}</div>
                </div>
                <div>
                  <span className="text-slate-500">未安排</span>
                  <div className="font-semibold text-slate-900">{versionStats.unassignedCount}</div>
                </div>
              </div>
              <div>
                <label htmlFor="save-version-name" className="block text-xs font-medium text-slate-600">
                  版本名称
                </label>
                <input
                  id="save-version-name"
                  type="text"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="save-version-note" className="block text-xs font-medium text-slate-600">
                  版本备注（可选）
                </label>
                <textarea
                  id="save-version-note"
                  rows={2}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  value={versionNote}
                  onChange={(e) => setVersionNote(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200/80 px-6 py-4">
              <button type="button" className={btnBase} onClick={closeSaveVersionModal} disabled={busy}>
                取消
              </button>
              <button type="button" className={btnPrimary} onClick={() => void confirmSaveVersion()} disabled={busy}>
                {busy ? "保存中…" : "保存版本"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
