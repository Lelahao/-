import type { CSSProperties, ReactNode } from "react";

export type RoundOverviewBoardStats = {
  tableCount: number;
  peopleTotal: number;
  assigned: number;
  unassigned: number;
};

export type RoundOverviewBoardMode = "screen" | "fullscreen" | "export";

/** 与阶段 11.5.1 约定：≤6 桌 3 列；7–12 桌 4 列；>12 紧凑缩放 */
export function overviewGridClass(tableCount: number): string {
  if (tableCount <= 6) return "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
  if (tableCount <= 12) return "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  return "grid max-w-[1700px] gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 origin-top scale-[0.92]";
}

/** 动态列数必须用 inline style：Tailwind 无法为运行时 n 生成 arbitrary repeat(n,…) 规则 */
export function clampOverviewGridCols(cols: number): number {
  return Math.max(1, Math.min(8, Math.round(Number(cols)) || 1));
}

/** 与每行桌数搭配：静态类名 */
export function overviewGridColsClass(): string {
  return "grid w-full min-w-0 gap-3";
}

export function overviewGridColsStyle(cols: number): CSSProperties {
  const n = clampOverviewGridCols(cols);
  return { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
}

/**
 * PNG 导出用：固定列数（不依赖视口断点），保证长图纵向延展、单张图包含全部桌。
 */
export function overviewExportGridClass(tableCount: number): string {
  if (tableCount <= 6) {
    return "grid w-full gap-4 [grid-template-columns:repeat(3,minmax(0,1fr))]";
  }
  if (tableCount <= 12) {
    return "grid w-full gap-3 [grid-template-columns:repeat(4,minmax(0,1fr))]";
  }
  return "grid w-full gap-2 [grid-template-columns:repeat(4,minmax(0,1fr))] text-[11px]";
}

export type RoundOverviewBoardProps = {
  planName: string;
  stats: RoundOverviewBoardStats;
  mode: RoundOverviewBoardMode;
  tableCount: number;
  /** screen / fullscreen：每行桌列数；不传则按 overviewGridClass(tableCount) */
  gridCols?: number;
  /** screen：顶部四格统计卡等 */
  statsBanner?: ReactNode;
  /** fullscreen：左侧未安排区等 */
  leadingAside?: ReactNode;
  children: ReactNode;
  /** fullscreen：主滚动区内、桌网之上的区域（如未安排人员条） */
  preGrid?: ReactNode;
  /** fullscreen：桌卡网格下方提示条等 */
  postGrid?: ReactNode;
  /** 包裹除 aside 外的主区域 class */
  mainClassName?: string;
  /** export：导出时间等；versionLine 为历史版本副标题 */
  exportMeta?: { exportedAtLabel?: string; versionLine?: string };
  /** export：底部未安排区等 */
  exportFooter?: ReactNode;
  /** export：桌网格 class（默认 overviewExportGridClass） */
  exportGridClassName?: string;
};

export function RoundOverviewBoard(props: RoundOverviewBoardProps) {
  const {
    planName,
    stats,
    mode,
    tableCount,
    gridCols,
    statsBanner,
    leadingAside,
    children,
    preGrid,
    postGrid,
    mainClassName,
    exportMeta,
    exportFooter,
    exportGridClassName,
  } = props;

  const gridForInteractive = (
    <div
      className={gridCols != null ? overviewGridColsClass() : overviewGridClass(tableCount)}
      style={gridCols != null ? overviewGridColsStyle(gridCols) : undefined}
    >
      {children}
    </div>
  );

  if (mode === "export") {
    const gridClass = exportGridClassName ?? overviewExportGridClass(tableCount);
    return (
      <div className="inline-block min-w-[1080px] max-w-[1600px] bg-white px-8 py-8 text-slate-900">
        <h1 className="text-xl font-semibold text-slate-900">{planName}</h1>
        {exportMeta?.versionLine ? (
          <p className="mt-1 text-sm font-medium text-slate-800">{exportMeta.versionLine}</p>
        ) : null}
        {exportMeta?.exportedAtLabel ? (
          <p className="mt-2 text-xs text-slate-500">{exportMeta.exportedAtLabel}</p>
        ) : null}
        <p className="mt-4 text-sm text-slate-700">
          总桌数：{stats.tableCount} · 总人数：{stats.peopleTotal} · 已安排人数：{stats.assigned} · 未安排人数：
          {stats.unassigned}
        </p>
        <div className={`mt-6 ${gridClass}`}>{children}</div>
        {exportFooter}
      </div>
    );
  }

  if (mode === "fullscreen") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 gap-4">
        {leadingAside}
        <div className={`min-h-0 min-w-0 flex-1 overflow-auto ${mainClassName ?? ""}`}>
          {preGrid ? <div className="mb-4 shrink-0">{preGrid}</div> : null}
          <div>{gridForInteractive}</div>
          {postGrid}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
      {statsBanner}
      <div className={mainClassName ?? ""}>{children}</div>
    </div>
  );
}
