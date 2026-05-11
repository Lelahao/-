import type { LayoutSnapshot, TableDefinition } from "@/fullscreen/types";
import { getSeatRoleLabel, resolveTableCategoryLabel } from "@/config/seatRoleTemplates";

/** 与总览 / 全屏文案对齐的默认方案名（LayoutSnapshot 无独立字段时可兜底） */
export const DEFAULT_EXPORT_PLAN_NAME = "2026 春季接待 · 锦绣厅";

const ROUND_LINKED_PLAN_NAME_STORAGE = "paizuo-round-linked-plan-name";

/** 导出文件名与文档标题：优先使用方案管理进入总览时写入的展示名 */
export function getExportPlanDisplayName(): string {
  try {
    const n = localStorage.getItem(ROUND_LINKED_PLAN_NAME_STORAGE);
    if (n?.trim()) return n.trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_EXPORT_PLAN_NAME;
}

export type ExportSeat = {
  seatNo: number;
  roleLabel: string | null;
  personName: string | null;
  isEmpty: boolean;
};

export type ExportTable = {
  tableId: string;
  tableNo: number;
  tableRole: string | null;
  tableKind: string | null;
  capacity: number;
  hallName: string;
  seats: ExportSeat[];
};

export type ExportSceneStats = {
  tableCount: number;
  peopleCount: number;
  assignedCount: number;
  unassignedCount: number;
};

/** 全局人员列表（含未安排），与 LayoutSnapshot.people 一一对应 */
export type ExportPerson = {
  id: string;
  name: string;
  tableNo: number | null;
  seatNo: number | null;
  roleLabel: string | null;
};

export type ExportSeatRow = ExportSeat & {
  tableNo: number;
  tableId: string;
};

/** 历史版本导出：PNG / 文档首屏展示用 */
export type ExportVersionMeta = {
  versionLine: string;
  savedAtLine: string;
};

export type ExportScene = {
  planName: string;
  stats: ExportSceneStats;
  tables: ExportTable[];
  seats: ExportSeatRow[];
  people: ExportPerson[];
  unassignedPeople: Array<{ id: string; name: string }>;
  /** 若存在，总览图与表格首行展示版本信息，并使用保存时间替代「导出时间」 */
  versionExport?: ExportVersionMeta;
};

/** 适用于下载文件名：Windows 非法字符替换 */
export function sanitizePlanFileBase(name: string): string {
  const t = name.replace(/[/\\:*?"<>|]/g, "_").trim();
  return t || "方案";
}

function tableKindSource(t: TableDefinition) {
  return {
    tableRole: t.tableRole,
    role: t.role,
    hallName: t.hallName,
    name: t.name,
    label: t.label,
    note: t.note,
    isMainTable: t.isMainTable,
  };
}

/**
 * 从当前布局快照构建统一导出场景（PNG / 后续 Excel·Word·PPT 共用）。
 */
export function buildExportSceneFromLayout(layout: LayoutSnapshot, planName: string): ExportScene {
  const unassignedPeople = layout.people
    .filter((p) => !p.assignedTableId || p.assignedSeatNo == null)
    .map((p) => ({ id: p.id, name: p.name }));

  const assignedCount = layout.people.filter((p) => p.assignedTableId && p.assignedSeatNo != null).length;

  const tables: ExportTable[] = layout.tables.map((t) => {
    const seats: ExportSeat[] = [];
    for (let sn = 1; sn <= t.capacity; sn++) {
      const person = layout.people.find((x) => x.assignedTableId === t.id && x.assignedSeatNo === sn);
      seats.push({
        seatNo: sn,
        roleLabel: getSeatRoleLabel(t.capacity, sn),
        personName: person?.name ?? null,
        isEmpty: !person,
      });
    }
    return {
      tableId: t.id,
      tableNo: t.no,
      tableRole: t.tableRole ?? null,
      tableKind: resolveTableCategoryLabel(tableKindSource(t)),
      capacity: t.capacity,
      hallName: t.hallName ?? "",
      seats,
    };
  });

  /** 所有桌的座位扁平列表（含桌号，顺序：桌序 × 座位号） */
  const seatsFlat: ExportSeatRow[] = [];
  for (const t of tables) {
    for (const s of t.seats) {
      seatsFlat.push({
        ...s,
        tableNo: t.tableNo,
        tableId: t.tableId,
      });
    }
  }

  const people: ExportPerson[] = layout.people.map((p) => {
    const tbl = layout.tables.find((x) => x.id === p.assignedTableId);
    const roleLabel =
      tbl != null && p.assignedSeatNo != null ? getSeatRoleLabel(tbl.capacity, p.assignedSeatNo) : null;
    return {
      id: p.id,
      name: p.name,
      tableNo: tbl?.no ?? null,
      seatNo: p.assignedSeatNo,
      roleLabel,
    };
  });

  return {
    planName,
    stats: {
      tableCount: layout.tables.length,
      peopleCount: layout.people.length,
      assignedCount,
      unassignedCount: unassignedPeople.length,
    },
    tables,
    seats: seatsFlat,
    people,
    unassignedPeople,
  };
}

function formatSnapshotTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

/** 从某历史版本的 layout 快照构建导出场景（统计数据与座席均来自快照，不写库）。 */
export function buildVersionExportScene(
  layout: LayoutSnapshot,
  input: { planDisplayName: string; versionNo: number; versionName: string | null; savedAtMs: number },
): ExportScene {
  const base = buildExportSceneFromLayout(layout, input.planDisplayName);
  const versionLine = `版本：V${input.versionNo}${input.versionName ? ` ${input.versionName}` : ""}`;
  const savedAtLine = `保存时间：${formatSnapshotTime(input.savedAtMs)}`;
  return { ...base, versionExport: { versionLine, savedAtLine } };
}

/** 下载文件名基底（不含扩展名）：`方案名_V3_排座总览` */
export function versionOverviewExportFileBase(planDisplayName: string, versionNo: number): string {
  return `${sanitizePlanFileBase(planDisplayName)}_V${versionNo}_排座总览`;
}
