import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { saveLayoutSnapshot } from "@/fullscreen/roundStorage";
import { resolveLayoutForExport, roundPlanToLayout } from "@/lib/layoutBridge";
import { titleForPath } from "@/lib/pageTitles";
import {
  exportLayoutExcel,
  exportLayoutJson,
  exportLayoutJpg,
  exportLayoutPng,
  exportLayoutPpt,
  exportLayoutSvgFile,
  exportLayoutWord,
} from "@/lib/planExport";
import { useRoundPlanDemoStore } from "@/stores/roundPlanDemoStore";

const btnBase =
  "inline-flex items-center justify-center rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600";

const exportTriggerBase =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-orange-500 bg-white px-3 py-1.5 text-sm font-medium text-orange-600 shadow-sm transition hover:bg-orange-50";

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
  const exportRef = useRef<HTMLDivElement | null>(null);

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
          exportLayoutExcel(layout);
          break;
        case "导出为 Word":
          await exportLayoutWord(layout);
          break;
        case "导出为 PPT":
          exportLayoutPpt(layout);
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

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/90 backdrop-blur">
      <div className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-slate-900">{title}</div>
        </div>

        <div className="hidden items-center gap-2 text-sm text-slate-500 md:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            已保存到本机
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className={btnBase} disabled={busy} onClick={() => void handleSavePlan()}>
            {busy ? "处理中…" : "保存方案"}
          </button>
          <button type="button" className={btnPrimary}>
            自动排座
          </button>
          <button type="button" className={btnBase}>
            {isTableEdit ? "座位管理" : "桌次管理"}
          </button>
          <button type="button" className={btnBase} onClick={() => navigate("/round/check")}>
            查看检查
          </button>

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
    </header>
  );
}
