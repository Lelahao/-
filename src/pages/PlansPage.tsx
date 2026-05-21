import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import * as XLSX from "xlsx";
import { ApiError } from "@/api/client";
import {
  createPlan,
  deletePlan,
  getPlanDetail,
  listPlans,
  updatePlan,
} from "@/api/plans";
import { putPeople } from "@/api/people";
import { saveTables } from "@/api/tables";
import type { PlanDetail, PlanRow, PersonRow, SeatRow, TableRow } from "@/lib/dbTypes";

type PlanStatus = "草稿" | "已发布" | "已完成" | "已归档";
type PlanStatusFilter = "all" | "draft" | "published" | "completed" | "archived";

type PlanDistributionSegment = {
  seats: number;
  count: number;
};

type Plan = {
  id: string;
  name: string;
  /** 备注，用于列表搜索 */
  note: string;
  status: PlanStatus;
  /** API 原始 status，用于发布/筛选 */
  statusRaw: string;
  /** 创建时间戳 ms，用于最新动态排序 */
  createdAt: number;
  tableCount: number;
  guestCount: number;
  updatedAt: string;
  distribution: PlanDistributionSegment[];
  owner: string;
};

function formatDistribution(segments: PlanDistributionSegment[]): string {
  if (segments.length === 0) return "—";
  return segments.map((s) => `${s.seats}人桌 × ${s.count}`).join(" / ");
}

function statusBadgeClass(status: PlanStatus) {
  switch (status) {
    case "已完成":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "已发布":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "已归档":
      return "border-slate-300 bg-slate-100 text-slate-600";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function mapDisplayStatus(raw: string): PlanStatus {
  const key = raw.trim().toLowerCase();
  const map: Record<string, PlanStatus> = {
    draft: "草稿",
    published: "已发布",
    completed: "已完成",
    archived: "已归档",
    archive: "已归档",
    done: "已完成",
    finished: "已完成",
    in_progress: "已发布",
    active: "已发布",
    草稿: "草稿",
    已发布: "已发布",
    已完成: "已完成",
    已归档: "已归档",
    进行中: "已发布",
  };
  return map[key] ?? "草稿";
}

function isDraftStatusRaw(raw: string): boolean {
  return raw.trim().toLowerCase() === "draft";
}

function planStatusBucket(raw: string): "draft" | "published" | "completed" | "archived" {
  const s = mapDisplayStatus(raw);
  const map: Record<PlanStatus, "draft" | "published" | "completed" | "archived"> = {
    草稿: "draft",
    已发布: "published",
    已完成: "completed",
    已归档: "archived",
  };
  return map[s];
}

function matchesPlanStatusFilter(p: Plan, filter: PlanStatusFilter): boolean {
  if (filter === "all") return true;
  return planStatusBucket(p.statusRaw) === filter;
}

function aggregateDistribution(tables: TableRow[]): PlanDistributionSegment[] {
  const counts = new Map<number, number>();
  for (const t of tables) {
    const cap = t.capacity;
    counts.set(cap, (counts.get(cap) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([seats, count]) => ({ seats, count }));
}

function formatUpdatedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return String(ms);
  }
}

function toViewPlan(row: PlanRow, detail: PlanDetail): Plan {
  return {
    id: row.id,
    name: row.name,
    note: row.note ?? detail.plan.note ?? "",
    status: mapDisplayStatus(row.status),
    statusRaw: row.status,
    createdAt: row.createdAt,
    tableCount: detail.tables.length,
    guestCount: detail.people.length,
    updatedAt: formatUpdatedAt(row.updatedAt),
    distribution: aggregateDistribution(detail.tables),
    owner: "—",
  };
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "未知错误";
}

function sanitizeExportFilenameBase(name: string): string {
  const s = name.trim() || "方案";
  return s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120);
}

/** Excel 中避免毫秒时间戳被显示为科学计数法 */
function formatTimestampForExport(ms: number): string {
  try {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return String(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return String(ms);
  }
}

function planRowForExport(row: PlanRow): Record<string, unknown> {
  return {
    ...row,
    createdAt: formatTimestampForExport(row.createdAt),
    updatedAt: formatTimestampForExport(row.updatedAt),
  };
}

function tableRowForExport(row: TableRow): Record<string, unknown> {
  return {
    ...row,
    createdAt: formatTimestampForExport(row.createdAt),
    updatedAt: formatTimestampForExport(row.updatedAt),
  };
}

function personRowForExport(row: PersonRow): Record<string, unknown> {
  return {
    ...row,
    createdAt: formatTimestampForExport(row.createdAt),
    updatedAt: formatTimestampForExport(row.updatedAt),
  };
}

function seatRowForExport(row: SeatRow): Record<string, unknown> {
  return {
    ...row,
    createdAt: formatTimestampForExport(row.createdAt),
    updatedAt: formatTimestampForExport(row.updatedAt),
  };
}

function applyExportSheetColWidths(ws: XLSX.WorkSheet, sampleRows: Record<string, unknown>[]) {
  if (!sampleRows.length) return;
  const keys = Object.keys(sampleRows[0]!);
  ws["!cols"] = keys.map((key) => {
    let max = Math.max(14, key.length + 1);
    for (const r of sampleRows) {
      const v = r[key];
      const s = v == null || v === "" ? "" : String(v);
      if (s.length > max) max = s.length;
    }
    return { wch: Math.min(64, max + 2) };
  });
}

const TABLE_CATEGORY_PRESETS = ["主桌", "宾客桌", "工作人员桌", "领导桌", "嘉宾桌", "自定义"] as const;
type TableCategoryPreset = (typeof TABLE_CATEGORY_PRESETS)[number];

const TABLE_KINDS: { value: "round" | "square" | "long" | "custom"; label: string }[] = [
  { value: "round", label: "圆桌 round" },
  { value: "square", label: "方桌 square" },
  { value: "long", label: "长桌 long" },
  { value: "custom", label: "自定义 custom" },
];

type NewPlanTableRow = {
  key: string;
  categoryPreset: TableCategoryPreset;
  categoryCustom: string;
  kind: "round" | "square" | "long" | "custom";
  tableCount: number;
  capacity: number;
};

function resolveHallName(r: NewPlanTableRow): string {
  if (r.categoryPreset === "自定义") return r.categoryCustom.trim();
  return r.categoryPreset;
}

function newRowKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newRowDefaults(
  partial?: Partial<
    Pick<NewPlanTableRow, "categoryPreset" | "categoryCustom" | "kind" | "tableCount" | "capacity">
  >,
): NewPlanTableRow {
  return {
    key: newRowKey(),
    categoryPreset: partial?.categoryPreset ?? "宾客桌",
    categoryCustom: partial?.categoryCustom ?? "",
    kind: partial?.kind ?? "round",
    tableCount: partial?.tableCount ?? 1,
    capacity: partial?.capacity ?? 8,
  };
}

function buildTablesPayload(rows: NewPlanTableRow[]): Array<{
  tableNo: number;
  hallName: string;
  capacity: number;
  kind: string;
}> {
  const tables: Array<{ tableNo: number; hallName: string; capacity: number; kind: string }> = [];
  let no = 1;
  for (const r of rows) {
    const count = Math.max(0, Math.floor(Number(r.tableCount)));
    const cap = Math.max(0, Math.floor(Number(r.capacity)));
    const hallName = resolveHallName(r);
    for (let i = 0; i < count; i++) {
      tables.push({
        tableNo: no++,
        hallName,
        capacity: cap,
        kind: r.kind,
      });
    }
  }
  return tables;
}

/** 按桌号顺序尽量复用已有 table id，避免无端整批替换 UUID。 */
function buildTablesSavePayload(
  rows: NewPlanTableRow[],
  existingTables: TableRow[],
): Array<{ id?: string; tableNo: number; hallName: string; capacity: number; kind: string }> {
  const desired = buildTablesPayload(rows);
  const oldSorted = [...existingTables].sort((a, b) => a.tableNo - b.tableNo);
  return desired.map((d, i) => {
    const id = i < oldSorted.length ? oldSorted[i]!.id : undefined;
    return id ? { id, ...d } : { ...d };
  });
}

function defaultNewPlanRows(): NewPlanTableRow[] {
  return [
    newRowDefaults({ categoryPreset: "主桌", kind: "round", tableCount: 1, capacity: 10 }),
    newRowDefaults({ categoryPreset: "宾客桌", kind: "round", tableCount: 1, capacity: 8 }),
  ];
}

function validateNewPlanRows(rows: NewPlanTableRow[]): string | null {
  if (rows.length < 1) return "至少保留一行桌次配置";
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const hall = resolveHallName(r);
    if (!hall) return `第 ${i + 1} 行：请填写桌别`;
    if (!r.kind) return `第 ${i + 1} 行：请选择桌型`;
    const tc = Number(r.tableCount);
    if (!Number.isFinite(tc) || tc < 0 || !Number.isInteger(tc)) {
      return `第 ${i + 1} 行：桌数须为大于等于 0 的整数`;
    }
    const cap = Number(r.capacity);
    if (!Number.isFinite(cap) || cap < 0 || !Number.isInteger(cap)) {
      return `第 ${i + 1} 行：每桌人数须为大于等于 0 的整数`;
    }
  }
  return null;
}

function buildPlaceholderPeople(n: number): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const count = Math.max(0, Math.floor(Number(n)));
  for (let i = 1; i <= count; i++) {
    out.push({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `person-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
      displayName: `宾客${i}`,
      assignedTableId: null,
      assignedSeatNo: null,
    });
  }
  return out;
}

function normalizeTableKind(k: string): NewPlanTableRow["kind"] {
  if (k === "round" || k === "square" || k === "long" || k === "custom") return k;
  return "custom";
}

/** 将 tables.hallName 还原为桌别选择；未知文案归入「自定义」文本。按 hallName + kind + capacity 聚合行数（同 key 合并）。 */
function matchHallToPreset(hallRaw: string): { categoryPreset: TableCategoryPreset; categoryCustom: string } {
  const h = hallRaw.trim();
  if (!h || h === "—") return { categoryPreset: "宾客桌", categoryCustom: "" };
  const found = TABLE_CATEGORY_PRESETS.find((x) => x === h);
  if (found && found !== "自定义") return { categoryPreset: found, categoryCustom: "" };
  return { categoryPreset: "自定义", categoryCustom: h };
}

function tablesToEditRows(tables: TableRow[]): NewPlanTableRow[] {
  if (tables.length === 0) {
    return [newRowDefaults({ tableCount: 0, capacity: 0 })];
  }
  const sorted = [...tables].sort((a, b) => a.tableNo - b.tableNo);
  const keyOrder: string[] = [];
  const map = new Map<string, { hall: string; kind: NewPlanTableRow["kind"]; cap: number; count: number }>();
  for (const t of sorted) {
    const hall = (t.hallName ?? "").trim() || "—";
    const kind = normalizeTableKind(t.kind);
    const cap = t.capacity;
    const key = `${hall}\0${kind}\0${cap}`;
    if (!map.has(key)) {
      keyOrder.push(key);
      map.set(key, { hall, kind, cap, count: 0 });
    }
    map.get(key)!.count += 1;
  }
  return keyOrder.map((key) => {
    const g = map.get(key)!;
    const { categoryPreset, categoryCustom } = matchHallToPreset(g.hall === "—" ? "" : g.hall);
    return newRowDefaults({
      categoryPreset,
      categoryCustom,
      kind: g.kind,
      tableCount: g.count,
      capacity: g.cap,
    });
  });
}

/**
 * 复制方案弹窗专用：按 hallName + kind + capacity 聚合；无桌次时用与新建一致的默认两行。
 * 若某组缺失桌别（空 hallName），按组出现顺序：第一组视为「主桌」，其余视为「宾客桌」。
 */
function tablesToCopyRows(tables: TableRow[]): NewPlanTableRow[] {
  if (tables.length === 0) {
    return defaultNewPlanRows();
  }
  const sorted = [...tables].sort((a, b) => a.tableNo - b.tableNo);
  const keyOrder: string[] = [];
  const map = new Map<
    string,
    { hall: string; kind: NewPlanTableRow["kind"]; cap: number; count: number; hallEmpty: boolean }
  >();
  for (const t of sorted) {
    const rawHall = (t.hallName ?? "").trim();
    const hallEmpty = !rawHall;
    const hall = hallEmpty ? "—" : rawHall;
    const kind = normalizeTableKind(t.kind);
    const cap = t.capacity;
    const key = `${hall}\0${kind}\0${cap}`;
    if (!map.has(key)) {
      keyOrder.push(key);
      map.set(key, { hall, kind, cap, count: 0, hallEmpty });
    }
    map.get(key)!.count += 1;
  }
  let emptyHallSeq = 0;
  return keyOrder.map((key) => {
    const g = map.get(key)!;
    let categoryPreset: TableCategoryPreset;
    let categoryCustom: string;
    if (g.hallEmpty) {
      if (emptyHallSeq === 0) {
        categoryPreset = "主桌";
        categoryCustom = "";
      } else {
        categoryPreset = "宾客桌";
        categoryCustom = "";
      }
      emptyHallSeq += 1;
    } else {
      const m = matchHallToPreset(g.hall);
      categoryPreset = m.categoryPreset;
      categoryCustom = m.categoryCustom;
    }
    return newRowDefaults({
      categoryPreset,
      categoryCustom,
      kind: g.kind,
      tableCount: g.count,
      capacity: g.cap,
    });
  });
}

function sortPeopleStable(people: PersonRow[]): PersonRow[] {
  return [...people].sort((a, b) => {
    const ma = /^宾客(\d+)$/.exec(a.displayName);
    const mb = /^宾客(\d+)$/.exec(b.displayName);
    if (ma && mb) return Number(ma[1]) - Number(mb[1]);
    return a.displayName.localeCompare(b.displayName, "zh-CN") || a.id.localeCompare(b.id);
  });
}

function buildPeopleSyncPayload(
  existing: PersonRow[],
  targetCount: number,
): Array<Record<string, unknown>> {
  const sorted = sortPeopleStable(existing);
  const n = Math.max(0, Math.floor(targetCount));
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < n; i++) {
    if (i < sorted.length) {
      const p = sorted[i]!;
      out.push({
        id: p.id,
        displayName: p.displayName,
        assignedTableId: null,
        assignedSeatNo: null,
      });
    } else {
      out.push({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `person-${Date.now()}-${i}`,
        displayName: `宾客${i + 1}`,
        assignedTableId: null,
        assignedSeatNo: null,
      });
    }
  }
  return out;
}

/** 复制方案：新的人员 id，优先沿用源方案的 displayName；超出部分「宾客N」补齐。不复制座位绑定。 */
function buildPeopleForCopy(sourcePeople: PersonRow[], targetCount: number): Array<Record<string, unknown>> {
  const sorted = sortPeopleStable(sourcePeople);
  const n = Math.max(0, Math.floor(targetCount));
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < n; i++) {
    const displayName = i < sorted.length ? sorted[i]!.displayName : `宾客${i + 1}`;
    out.push({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `person-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
      displayName,
      assignedTableId: null,
      assignedSeatNo: null,
    });
  }
  return out;
}

function formatPlanStatusLine(raw: string): string {
  const k = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    draft: "draft（草稿）",
    published: "published（已发布）",
    completed: "completed（已完成）",
    archived: "archived（已归档）",
    archive: "archived（已归档）",
  };
  const display = mapDisplayStatus(raw);
  return map[k] ?? `${raw.trim()}（${display}）`;
}

const PLAN_IMPORT_TEMPLATE_FILENAME = "方案导入模板.xlsx";

const IMPORT_ALLOWED_STATUSES = new Set(["draft", "published", "completed", "archived"]);

function downloadPlanImportTemplateFile() {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [
    ["方案名称", "示例方案"],
    [],
    ["桌次人数配置（列与新建方案「桌次人数配置」一致）"],
    ["桌别", "桌型", "桌数", "每桌人数"],
    ["主桌", "round", 1, 10],
    ["宾客桌", "round", 9, 8],
    [],
    ["备注", "用于导入演示"],
    ["状态", "draft"],
    [],
    ["人员（可选；可删去下列姓名，留空则按桌次自动生成宾客占位）"],
    ["姓名"],
    ["张三"],
    ["李四"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "方案导入");
  XLSX.writeFile(wb, PLAN_IMPORT_TEMPLATE_FILENAME, { bookType: "xlsx" });
  window.alert(`模板「${PLAN_IMPORT_TEMPLATE_FILENAME}」已开始下载。`);
}

type NormalizedPlanImport = {
  planName: string;
  planNote: string | null;
  planStatus: string | undefined;
  tableGroups: Array<{
    tableRole: string;
    tableKind: "round" | "square" | "long" | "custom";
    tableCount: number;
    capacity: number;
  }>;
  people: Array<Record<string, unknown>>;
};

function tablesFromImportGroups(
  groups: NormalizedPlanImport["tableGroups"],
): Array<{ tableNo: number; hallName: string; capacity: number; kind: string }> {
  const tables: Array<{ tableNo: number; hallName: string; capacity: number; kind: string }> = [];
  let no = 1;
  for (const g of groups) {
    for (let i = 0; i < g.tableCount; i++) {
      tables.push({
        tableNo: no++,
        hallName: g.tableRole,
        capacity: g.capacity,
        kind: g.tableKind,
      });
    }
  }
  return tables;
}

function estimatedTotalFromImportGroups(groups: NormalizedPlanImport["tableGroups"]): number {
  return groups.reduce((s, g) => s + g.tableCount * g.capacity, 0);
}

function buildPeoplePayloadFromImport(
  peopleRaw: Array<Record<string, unknown>>,
  estimatedTotal: number,
): Array<Record<string, unknown>> {
  if (peopleRaw.length > 0) {
    return peopleRaw.map((pr, i) => ({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `person-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
      displayName:
        typeof pr.displayName === "string" && pr.displayName.trim()
          ? pr.displayName.trim()
          : `宾客${i + 1}`,
      assignedTableId: null,
      assignedSeatNo: null,
    }));
  }
  return buildPlaceholderPeople(estimatedTotal);
}

function validatePlanImportJson(parsed: unknown):
  | { ok: true; data: NormalizedPlanImport; warnings: string[] }
  | { ok: false; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errors: ["导入数据根节点须为对象（含 plan、tableGroups）。"] };
  }
  const root = parsed as Record<string, unknown>;

  const plan = root.plan;
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) {
    return { ok: false, errors: ["缺少有效的 plan 对象"] };
  }
  const p = plan as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim()) {
    errors.push("plan.name 为必填非空字符串");
  }
  if (p.note !== undefined && p.note !== null && typeof p.note !== "string") {
    errors.push("plan.note 如填写须为字符串");
  }
  let planStatus: string | undefined;
  if (p.status !== undefined && p.status !== null) {
    if (typeof p.status !== "string" || !IMPORT_ALLOWED_STATUSES.has(p.status.trim().toLowerCase())) {
      errors.push("plan.status 如填写则只能为 draft / published / completed / archived");
    } else {
      planStatus = p.status.trim().toLowerCase();
    }
  }

  const tableGroups = root.tableGroups;
  if (!Array.isArray(tableGroups)) {
    errors.push("tableGroups 必须为数组");
  } else {
    for (let i = 0; i < tableGroups.length; i++) {
      const g = tableGroups[i];
      if (g === null || typeof g !== "object" || Array.isArray(g)) {
        errors.push(`tableGroups[${i}] 须为对象`);
        continue;
      }
      const gg = g as Record<string, unknown>;
      if (typeof gg.tableRole !== "string" || !gg.tableRole.trim()) {
        errors.push(`tableGroups[${i}].tableRole 必填`);
      }
      if (
        typeof gg.tableKind !== "string" ||
        !["round", "square", "long", "custom"].includes(gg.tableKind)
      ) {
        errors.push(`tableGroups[${i}].tableKind 须为 round / square / long / custom`);
      }
      const tc = gg.tableCount;
      if (typeof tc !== "number" || !Number.isInteger(tc) || tc < 0) {
        errors.push(`tableGroups[${i}].tableCount 须为非负整数`);
      }
      const cap = gg.capacity;
      if (typeof cap !== "number" || !Number.isInteger(cap) || cap < 0) {
        errors.push(`tableGroups[${i}].capacity 须为非负整数`);
      }
    }
  }

  let peopleRaw: unknown[] = [];
  if (root.people !== undefined && root.people !== null) {
    if (!Array.isArray(root.people)) {
      errors.push("people 如存在必须为数组");
    } else {
      peopleRaw = root.people as unknown[];
      for (let i = 0; i < peopleRaw.length; i++) {
        const person = peopleRaw[i];
        if (person === null || typeof person !== "object" || Array.isArray(person)) {
          errors.push(`people[${i}] 须为对象`);
          continue;
        }
        const pr = person as Record<string, unknown>;
        if (pr.displayName !== undefined && typeof pr.displayName !== "string") {
          errors.push(`people[${i}].displayName 如存在须为字符串`);
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors };

  const name = (p.name as string).trim();
  const planNote =
    p.note === undefined || p.note === null ? null : ((p.note as string).trim() || null);

  const groupsNorm: NormalizedPlanImport["tableGroups"] = (
    tableGroups as Array<Record<string, unknown>>
  ).map((gg) => ({
    tableRole: (gg.tableRole as string).trim(),
    tableKind: gg.tableKind as "round" | "square" | "long" | "custom",
    tableCount: gg.tableCount as number,
    capacity: gg.capacity as number,
  }));

  const peopleNorm = peopleRaw.map((x) => x as Record<string, unknown>);
  if (peopleNorm.length === 0 && estimatedTotalFromImportGroups(groupsNorm) > 0) {
    warnings.push("人员列表为空，将按桌次预计总人数自动生成占位人员（宾客1…）。");
  }

  return {
    ok: true,
    data: {
      planName: name,
      planNote,
      planStatus,
      tableGroups: groupsNorm,
      people: peopleNorm,
    },
    warnings,
  };
}

function excelCellStr(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(v).trim();
  }
  return String(v).trim();
}

function findWorksheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
  const nm = wb.SheetNames.find((n) => n.trim() === name);
  return nm ? (wb.Sheets[nm] ?? null) : null;
}

function sheetToMatrix(ws: XLSX.WorkSheet): (string | number | null | undefined)[][] {
  return XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(ws, {
    header: 1,
    defval: "",
  }) as (string | number | null | undefined)[][];
}

function resolvePlanHeader(cell: string): "name" | "note" | "status" | null {
  const x = cell.replace(/\s/g, "").toLowerCase();
  if (x.includes("方案名称") || x === "name" || x === "名称") return "name";
  if (x.includes("备注") || x === "note") return "note";
  if (x.includes("状态") || x === "status") return "status";
  return null;
}

function resolveTableHeader(cell: string): "role" | "kind" | "count" | "cap" | null {
  const x = cell.replace(/\s/g, "").toLowerCase();
  if (x.includes("桌别") || x.includes("tablerole")) return "role";
  if (x.includes("桌型") || x.includes("tablekind")) return "kind";
  if (x.includes("桌数") && !x.includes("每桌") && !x.includes("人数")) return "count";
  if (x.includes("tablecount") && !x.includes("capacity")) return "count";
  if (x.includes("每桌人数") || x.includes("capacity") || x === "人数") return "cap";
  return null;
}

function resolvePeopleHeader(cell: string): boolean {
  const x = cell.replace(/\s/g, "").toLowerCase();
  return x.includes("姓名") || x.includes("displayname") || x === "name";
}

function readNonNegIntCell(v: unknown, errLabel: string, errors: string[]): number | null {
  if (v === "" || v === undefined || v === null) {
    errors.push(`${errLabel}不能为空`);
    return null;
  }
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) {
    errors.push(`${errLabel}须为数字`);
    return null;
  }
  const r = Math.round(n);
  if (!Number.isInteger(n) && Math.abs(n - r) > 1e-9) {
    errors.push(`${errLabel}须为整数`);
    return null;
  }
  if (r < 0) {
    errors.push(`${errLabel}须为非负整数`);
    return null;
  }
  return r;
}

function isFullTableHeaderRow(
  row: (string | number | null | undefined)[],
): Partial<Record<"role" | "kind" | "count" | "cap", number>> | null {
  const cmap: Partial<Record<"role" | "kind" | "count" | "cap", number>> = {};
  for (let j = 0; j < row.length; j++) {
    const k = resolveTableHeader(excelCellStr(row[j] ?? ""));
    if (k) cmap[k] = j;
  }
  if (cmap.role !== undefined && cmap.kind !== undefined && cmap.count !== undefined && cmap.cap !== undefined) {
    return cmap;
  }
  return null;
}

function isPeopleHeaderRow(
  row: (string | number | null | undefined)[],
  tcol: Partial<Record<"role" | "kind" | "count" | "cap", number>>,
): boolean {
  const a0 = excelCellStr(row[0]);
  if (!resolvePeopleHeader(a0)) return false;
  if (tcol.kind === undefined) return true;
  return !excelCellStr(row[tcol.kind!]);
}

function applyPlanKeyValueRow(a0: string, b1: string, planMut: { name: string; noteVal: string; statusVal: string }): void {
  if (a0 === "方案名称") planMut.name = b1;
  else if (a0 === "备注") planMut.noteVal = b1;
  else if (a0 === "状态" || a0 === "初始状态") planMut.statusVal = b1;
}

function parsePeopleDataRows(
  m: (string | number | null | undefined)[][],
  startRow: number,
  errors: string[],
): Array<Record<string, unknown>> {
  const people: Array<Record<string, unknown>> = [];
  for (let j = startRow; j < m.length; j++) {
    const r2 = m[j]!;
    const dn = excelCellStr(r2[0]);
    if (!dn) {
      if (r2.every((c) => !excelCellStr(c))) break;
      errors.push(`「人员」第 ${j + 1} 行：姓名为空。`);
      continue;
    }
    people.push({ displayName: dn });
  }
  return people;
}

function parseImportMatrix(
  m: (string | number | null | undefined)[][],
):
  | { ok: false; errors: string[] }
  | {
      ok: true;
      root: {
        plan: Record<string, unknown>;
        tableGroups: Array<Record<string, unknown>>;
        people: Array<Record<string, unknown>>;
      };
    } {
  const errors: string[] = [];
  const planMut = { name: "", noteVal: "", statusVal: "" };
  let startIdx = 0;

  if (m.length >= 2) {
    const ph = m[0]!.map((c) => excelCellStr(c));
    const pc: Partial<Record<"name" | "note" | "status", number>> = {};
    let planHeaderCols = 0;
    for (let j = 0; j < ph.length; j++) {
      const k = resolvePlanHeader(ph[j] ?? "");
      if (k) {
        pc[k] = j;
        planHeaderCols += 1;
      }
    }
    if (pc.name !== undefined && planHeaderCols >= 2) {
      const pr = m[1]!;
      planMut.name = excelCellStr(pr[pc.name]);
      if (pc.note !== undefined) planMut.noteVal = excelCellStr(pr[pc.note]);
      if (pc.status !== undefined) planMut.statusVal = excelCellStr(pr[pc.status]);
      startIdx = 2;
    }
  }

  let ti = -1;
  let tcol: Partial<Record<"role" | "kind" | "count" | "cap", number>> = {};
  for (let i = startIdx; i < m.length; i++) {
    const th = isFullTableHeaderRow(m[i]!);
    if (th) {
      ti = i;
      tcol = th;
      break;
    }
  }

  const tableGroups: Array<Record<string, unknown>> = [];
  let people: Array<Record<string, unknown>> = [];
  let tableBodyEndExclusive = m.length;

  if (ti >= 0) {
    let i = ti + 1;
    while (i < m.length) {
      const row = m[i]!;
      if (isPeopleHeaderRow(row, tcol)) {
        people = parsePeopleDataRows(m, i + 1, errors);
        tableBodyEndExclusive = i;
        break;
      }
      const role = excelCellStr(row[tcol.role!]);
      if (!role) {
        if (row.every((c) => !excelCellStr(c))) {
          i++;
          continue;
        }
        tableBodyEndExclusive = i;
        break;
      }
      const kind = excelCellStr(row[tcol.kind!]).toLowerCase();
      const tc = readNonNegIntCell(row[tcol.count!], `桌次第 ${i + 1} 行桌数`, errors);
      const cap = readNonNegIntCell(row[tcol.cap!], `桌次第 ${i + 1} 行每桌人数`, errors);
      if (tc !== null && cap !== null) {
        tableGroups.push({ tableRole: role, tableKind: kind, tableCount: tc, capacity: cap });
      }
      i++;
    }
    if (tableBodyEndExclusive === m.length) {
      tableBodyEndExclusive = i;
    }
  }

  if (people.length === 0) {
    for (let i = Math.max(0, ti >= 0 ? tableBodyEndExclusive : 0); i < m.length; i++) {
      if (isPeopleHeaderRow(m[i]!, tcol)) {
        people = parsePeopleDataRows(m, i + 1, errors);
        break;
      }
    }
  }

  for (let i = 0; i < m.length; i++) {
    if (startIdx >= 2 && (i === 0 || i === 1)) continue;
    if (i === ti) continue;
    if (ti >= 0 && i > ti && i < tableBodyEndExclusive) continue;
    const row = m[i]!;
    if (row.length < 2) continue;
    const a0 = excelCellStr(row[0]);
    const b1 = excelCellStr(row[1]);
    applyPlanKeyValueRow(a0, b1, planMut);
  }

  if (errors.length) return { ok: false, errors };

  const planObj: Record<string, unknown> = {
    name: planMut.name,
    ...(planMut.noteVal ? { note: planMut.noteVal } : {}),
    ...(planMut.statusVal ? { status: planMut.statusVal.toLowerCase() } : {}),
  };

  return {
    ok: true,
    root: { plan: planObj, tableGroups, people },
  };
}

function parsePlanImportExcel(
  buffer: ArrayBuffer,
):
  | { ok: true; data: NormalizedPlanImport; warnings: string[] }
  | { ok: false; errors: string[] } {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    return { ok: false, errors: ["无法解析 Excel 文件，请确认格式为 .xlsx 或 .xls。"] };
  }
  if (wb.SheetNames.length === 0) {
    return { ok: false, errors: ["工作簿中没有工作表。"] };
  }

  const wsLegacyTables = findWorksheet(wb, "桌次分组");
  if (wsLegacyTables) {
    const wsPlan = findWorksheet(wb, "方案") ?? wb.Sheets[wb.SheetNames[0]!]!;
    const wsPeople =
      findWorksheet(wb, "人员") ?? (wb.SheetNames[2] ? wb.Sheets[wb.SheetNames[2]!]! : null);

    const sheetErrors: string[] = [];
    const planM = sheetToMatrix(wsPlan);
    if (planM.length < 2) {
      sheetErrors.push("「方案」工作表至少需要表头行与一行数据。");
      return { ok: false, errors: sheetErrors };
    }
    const ph = planM[0]!.map((c) => excelCellStr(c));
    const prow = planM[1]!;
    const planCol: Partial<Record<"name" | "note" | "status", number>> = {};
    for (let j = 0; j < ph.length; j++) {
      const key = resolvePlanHeader(ph[j] ?? "");
      if (key) planCol[key] = j;
    }
    if (planCol.name === undefined) {
      sheetErrors.push("「方案」表缺少可识别的「方案名称」列。");
    }
    const planName = planCol.name !== undefined ? excelCellStr(prow[planCol.name]) : "";
    const noteRaw = planCol.note !== undefined ? excelCellStr(prow[planCol.note]) : "";
    const statusRaw = planCol.status !== undefined ? excelCellStr(prow[planCol.status]) : "";
    const planObj: Record<string, unknown> = {
      name: planName,
      ...(noteRaw ? { note: noteRaw } : {}),
      ...(statusRaw ? { status: statusRaw.toLowerCase() } : {}),
    };

    const tm = sheetToMatrix(wsLegacyTables);
    if (tm.length < 2) {
      const root = { plan: planObj, tableGroups: [], people: [] as Array<Record<string, unknown>> };
      return validatePlanImportJson(root);
    }
    const th = tm[0]!.map((c) => excelCellStr(c));
    const tcol: Partial<Record<"role" | "kind" | "count" | "cap", number>> = {};
    for (let j = 0; j < th.length; j++) {
      const key = resolveTableHeader(th[j] ?? "");
      if (key) tcol[key] = j;
    }
    if (tcol.role === undefined || tcol.kind === undefined || tcol.count === undefined || tcol.cap === undefined) {
      sheetErrors.push("「桌次分组」表需包含列：桌别、桌型、桌数、每桌人数。");
      return { ok: false, errors: sheetErrors };
    }

    const tableGroups: Array<Record<string, unknown>> = [];
    for (let i = 1; i < tm.length; i++) {
      const row = tm[i]!;
      const role = excelCellStr(row[tcol.role!]);
      if (!role) {
        const emptyRow = row.every((c) => !excelCellStr(c));
        if (emptyRow) continue;
        sheetErrors.push(`「桌次分组」第 ${i + 1} 行：桌别不能为空。`);
        continue;
      }
      const kind = excelCellStr(row[tcol.kind!]).toLowerCase();
      const tc = readNonNegIntCell(row[tcol.count!], `「桌次分组」第 ${i + 1} 行桌数`, sheetErrors);
      const cap = readNonNegIntCell(row[tcol.cap!], `「桌次分组」第 ${i + 1} 行每桌人数`, sheetErrors);
      if (tc === null || cap === null) continue;
      tableGroups.push({
        tableRole: role,
        tableKind: kind,
        tableCount: tc,
        capacity: cap,
      });
    }
    if (sheetErrors.length) return { ok: false, errors: sheetErrors };

    let people: Array<Record<string, unknown>> = [];
    if (wsPeople) {
      const pm = sheetToMatrix(wsPeople);
      if (pm.length >= 2) {
        const hdr = pm[0]!.map((c) => excelCellStr(c));
        let nameCol = 0;
        const idx = hdr.findIndex((h) => resolvePeopleHeader(h));
        if (idx >= 0) nameCol = idx;
        for (let i = 1; i < pm.length; i++) {
          const row = pm[i]!;
          const dn = excelCellStr(row[nameCol]);
          if (!dn) {
            if (row.every((c) => !excelCellStr(c))) continue;
            sheetErrors.push(`「人员」第 ${i + 1} 行：姓名为空。`);
            continue;
          }
          people.push({ displayName: dn });
        }
      }
    }
    if (sheetErrors.length) return { ok: false, errors: sheetErrors };

    const root = { plan: planObj, tableGroups, people };
    return validatePlanImportJson(root);
  }

  const wsUnified = findWorksheet(wb, "方案导入") ?? wb.Sheets[wb.SheetNames[0]!]!;
  const parsed = parseImportMatrix(sheetToMatrix(wsUnified));
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  return validatePlanImportJson(parsed.root);
}

const modalField =
  "h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-sm text-slate-800 shadow-sm";
const modalLabel = "mb-1 block text-sm font-medium text-slate-700";

function PlanTableConfigEditor(props: {
  rows: NewPlanTableRow[];
  setRows: Dispatch<SetStateAction<NewPlanTableRow[]>>;
  estimatedTotal: number;
  /** 设计稿：预计总人数卡片与「桌次人数配置」标题同一行右侧 */
  embedSummaryCard?: "none" | "topRight";
}) {
  const { rows, setRows, estimatedTotal, embedSummaryCard = "none" } = props;
  const summaryCard = (
    <div className="w-full shrink-0 rounded-xl border border-sky-200/80 bg-sky-50/80 px-4 py-3 sm:w-auto sm:min-w-[12rem]">
      <div className="text-xs font-medium text-sky-800/90">预计总人数</div>
      <div className="mt-1 text-base font-semibold text-sky-900">预计总人数：{estimatedTotal} 人</div>
    </div>
  );
  return (
    <div>
      {embedSummaryCard === "topRight" ? (
        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">
              桌次人数配置 <span className="text-red-500">*</span>
            </span>
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-medium text-slate-500 shadow-sm"
              title="按每行桌数 × 每桌人数汇总预计总人数"
            >
              i
            </span>
          </div>
          {summaryCard}
        </div>
      ) : (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">
            桌次人数配置 <span className="text-red-500">*</span>
          </span>
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-500"
            title="系统按每类桌次 × 桌数 × 每桌人数汇总预计总人数"
          >
            i
          </span>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200/90">
        <table className="w-full min-w-[500px] text-left text-sm">
          <thead className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-medium text-slate-600">
            <tr>
              <th className="px-3 py-2">桌别</th>
              <th className="px-3 py-2">桌型</th>
              <th className="px-3 py-2">桌数</th>
              <th className="px-3 py-2">每桌人数</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row, idx) => (
              <tr key={row.key}>
                <td className="p-2 align-top">
                  <select
                    className={`${modalField} h-9 text-sm`}
                    value={row.categoryPreset}
                    aria-label={`第 ${idx + 1} 行桌别`}
                    onChange={(e) => {
                      const v = e.target.value as TableCategoryPreset;
                      setRows((rs) =>
                        rs.map((r) =>
                          r.key === row.key ? { ...r, categoryPreset: v, categoryCustom: "" } : r,
                        ),
                      );
                    }}
                  >
                    {TABLE_CATEGORY_PRESETS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {row.categoryPreset === "自定义" ? (
                    <input
                      type="text"
                      className={`${modalField} mt-1 h-9 text-sm`}
                      value={row.categoryCustom}
                      placeholder="请输入自定义桌别"
                      aria-label={`第 ${idx + 1} 行自定义桌别`}
                      onChange={(e) => {
                        const t = e.target.value;
                        setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, categoryCustom: t } : r)));
                      }}
                    />
                  ) : null}
                </td>
                <td className="p-2">
                  <select
                    className={`${modalField} h-9 text-sm`}
                    value={row.kind}
                    aria-label={`第 ${idx + 1} 行桌型`}
                    onChange={(e) => {
                      const v = e.target.value as NewPlanTableRow["kind"];
                      setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, kind: v } : r)));
                    }}
                  >
                    {TABLE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    min={0}
                    className={`${modalField} h-9`}
                    value={row.tableCount}
                    aria-label={`第 ${idx + 1} 行桌数`}
                    onChange={(e) => {
                      const v = e.target.value === "" ? 0 : Number(e.target.value);
                      setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, tableCount: v } : r)));
                    }}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${modalField} h-9`}
                    value={row.capacity}
                    aria-label={`第 ${idx + 1} 行每桌人数`}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const v = raw === "" ? 0 : Number(raw);
                      setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, capacity: v } : r)));
                    }}
                  />
                </td>
                <td className="p-2 text-right">
                  <button
                    type="button"
                    className="text-sm text-slate-500 hover:text-red-600 disabled:opacity-40"
                    disabled={rows.length <= 1}
                    onClick={() =>
                      setRows((rs) => (rs.length <= 1 ? rs : rs.filter((r) => r.key !== row.key)))
                    }
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="mt-3 text-sm font-medium text-orange-600 hover:text-orange-700"
        onClick={() => setRows((rs) => [...rs, newRowDefaults()])}
      >
        + 新增一类桌次
      </button>
      {embedSummaryCard === "none" ? (
        <div className="mt-2 text-sm text-slate-600 lg:hidden">预计总人数：{estimatedTotal} 人</div>
      ) : null}
    </div>
  );
}

function planActivityTitle(status: PlanStatus): string {
  switch (status) {
    case "草稿":
      return "草稿方案";
    case "已发布":
      return "发布方案";
    case "已完成":
      return "已完成方案";
    case "已归档":
      return "已归档方案";
  }
}

function planActivityTone(status: PlanStatus): string {
  switch (status) {
    case "已完成":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "已发布":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "已归档":
      return "border-slate-300 bg-slate-100 text-slate-600";
    default:
      return "border-orange-200 bg-orange-50 text-orange-700";
  }
}

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]";

const pageBtnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50";

const pageBtnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600";

export function PlansPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newRows, setNewRows] = useState<NewPlanTableRow[]>(() => defaultNewPlanRows());
  const [newPlanSubmitting, setNewPlanSubmitting] = useState(false);
  const [newPlanError, setNewPlanError] = useState<string | null>(null);

  const [showCopyPlan, setShowCopyPlan] = useState(false);
  const [copyName, setCopyName] = useState("");
  const [copyNote, setCopyNote] = useState("");
  const [copyRows, setCopyRows] = useState<NewPlanTableRow[]>(() => defaultNewPlanRows());
  const [copyStatus, setCopyStatus] = useState<"draft" | "published" | "completed" | "archived">("draft");
  const [copySourcePeople, setCopySourcePeople] = useState<PersonRow[]>([]);
  const [copyLoadingDetail, setCopyLoadingDetail] = useState(false);
  const [copySubmitting, setCopySubmitting] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyDetailReady, setCopyDetailReady] = useState(false);

  const [showEditPlan, setShowEditPlan] = useState(false);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editRows, setEditRows] = useState<NewPlanTableRow[]>([]);
  const [editStatusRaw, setEditStatusRaw] = useState("");
  const [editPeopleSnapshot, setEditPeopleSnapshot] = useState<PersonRow[]>([]);
  const [editTablesSnapshot, setEditTablesSnapshot] = useState<TableRow[]>([]);
  const [editBaselineTableCount, setEditBaselineTableCount] = useState(0);
  const [editBaselinePeopleCount, setEditBaselinePeopleCount] = useState(0);
  const [editLoadingDetail, setEditLoadingDetail] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [moreMenuPlanId, setMoreMenuPlanId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PlanStatusFilter>("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [viewMode, setViewMode] = useState<"card" | "compact">("card");
  const [publishTarget, setPublishTarget] = useState<{ id: string; name: string } | null>(null);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [exportingPlanId, setExportingPlanId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [showRoundManageModal, setShowRoundManageModal] = useState(false);
  const [roundManagePlanId, setRoundManagePlanId] = useState<string>("");

  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFlowStep, setImportFlowStep] = useState<"file" | "preview" | "working" | "success" | "fail">("file");
  const [importWorkPhase, setImportWorkPhase] = useState<"creating" | "tables" | "people">("creating");
  const [importParsed, setImportParsed] = useState<NormalizedPlanImport | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importPreviewErrors, setImportPreviewErrors] = useState<string[]>([]);
  const [importRunError, setImportRunError] = useState<string | null>(null);
  const [importDragging, setImportDragging] = useState(false);

  const estimatedPeople = useMemo(
    () =>
      newRows.reduce((sum, r) => {
        const c = Math.max(0, Math.floor(Number(r.tableCount)));
        const cap = Math.max(0, Math.floor(Number(r.capacity)));
        return sum + c * cap;
      }, 0),
    [newRows],
  );

  const estimatedEditPeople = useMemo(
    () =>
      editRows.reduce((sum, r) => {
        const c = Math.max(0, Math.floor(Number(r.tableCount)));
        const cap = Math.max(0, Math.floor(Number(r.capacity)));
        return sum + c * cap;
      }, 0),
    [editRows],
  );

  const estimatedCopyPeople = useMemo(
    () =>
      copyRows.reduce((sum, r) => {
        const c = Math.max(0, Math.floor(Number(r.tableCount)));
        const cap = Math.max(0, Math.floor(Number(r.capacity)));
        return sum + c * cap;
      }, 0),
    [copyRows],
  );

  const filteredPlans = useMemo(() => {
    let out = plans;
    if (statusFilter !== "all") {
      out = out.filter((p) => matchesPlanStatusFilter(p, statusFilter));
    }
    const q = searchKeyword.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.note.toLowerCase().includes(q),
      );
    }
    return out;
  }, [plans, statusFilter, searchKeyword]);

  /** 最新动态：按方案创建时间倒序，仅展示前 4 条 */
  const latestPlanActivities = useMemo(() => {
    return [...plans]
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        title: planActivityTitle(p.status),
        target: p.name,
        time: formatUpdatedAt(p.createdAt),
        tone: planActivityTone(p.status),
      }));
  }, [plans]);

  const refreshPlans = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const rows = await listPlans();
      const details = await Promise.all(rows.map((r) => getPlanDetail(r.id)));
      setPlans(rows.map((r, i) => toViewPlan(r, details[i]!)));
    } catch (e) {
      setError(errorMessage(e));
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPlans();
  }, [refreshPlans]);

  useEffect(() => {
    if (!feedbackMessage) return;
    const t = window.setTimeout(() => setFeedbackMessage(null), 2500);
    return () => window.clearTimeout(t);
  }, [feedbackMessage]);

  useEffect(() => {
    if (!moreMenuPlanId) return;
    const onMouseDown = (e: MouseEvent) => {
      const node = e.target as Node;
      const root = document.querySelector(`[data-plan-more-root="${moreMenuPlanId}"]`);
      if (root?.contains(node)) return;
      setMoreMenuPlanId(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [moreMenuPlanId]);

  const openNewPlan = () => {
    setNewName("");
    setNewNote("");
    setNewRows(defaultNewPlanRows());
    setNewPlanError(null);
    setShowNewPlan(true);
  };

  const closeNewPlan = () => {
    if (newPlanSubmitting) return;
    setShowNewPlan(false);
    setNewPlanError(null);
  };

  const closeEditPlan = () => {
    if (editSubmitting) return;
    setShowEditPlan(false);
    setEditPlanId(null);
    setEditError(null);
    setEditLoadingDetail(false);
  };

  const openEditPlan = async (p: Plan) => {
    setEditError(null);
    setEditPlanId(p.id);
    setShowEditPlan(true);
    setMoreMenuPlanId(null);
    setEditName("");
    setEditNote("");
    setEditRows([]);
    setEditStatusRaw("");
    setEditPeopleSnapshot([]);
    setEditTablesSnapshot([]);
    setEditBaselineTableCount(0);
    setEditBaselinePeopleCount(0);
    setEditLoadingDetail(true);
    try {
      const detail = await getPlanDetail(p.id);
      setEditName(detail.plan.name);
      setEditNote(detail.plan.note ?? "");
      setEditRows(tablesToEditRows(detail.tables));
      setEditStatusRaw(detail.plan.status);
      setEditPeopleSnapshot(detail.people);
      setEditTablesSnapshot(detail.tables);
      setEditBaselineTableCount(detail.tables.length);
      setEditBaselinePeopleCount(detail.people.length);
    } catch (e) {
      setEditError(errorMessage(e));
    } finally {
      setEditLoadingDetail(false);
    }
  };

  const submitNewPlan = async () => {
    setNewPlanError(null);
    const name = newName.trim();
    if (!name) {
      setNewPlanError("请填写方案名称");
      return;
    }
    if (newNote.length > 200) {
      setNewPlanError("备注不能超过 200 字");
      return;
    }
    const rowErr = validateNewPlanRows(newRows);
    if (rowErr) {
      setNewPlanError(rowErr);
      return;
    }
    const tablesPayload = buildTablesPayload(newRows);

    setNewPlanSubmitting(true);
    let planId: string | null = null;
    try {
      const created = await createPlan({ name, note: newNote.trim() || null });
      planId = created.id;
      await saveTables({ planId: created.id, tables: tablesPayload });
      setShowNewPlan(false);
      await refreshPlans();
    } catch (e) {
      if (planId) {
        try {
          await deletePlan(planId);
        } catch {
          /* 回滚失败则留给用户手动删除 */
        }
        setNewPlanError(
          `${errorMessage(e)} 已尝试自动删除半成品方案；若仍存在请手动删除。`,
        );
      } else {
        setNewPlanError(errorMessage(e));
      }
    } finally {
      setNewPlanSubmitting(false);
    }
  };

  const submitEditPlan = async () => {
    if (!editPlanId) return;
    setEditError(null);
    const name = editName.trim();
    if (!name) {
      setEditError("请填写方案名称");
      return;
    }
    if (editNote.length > 200) {
      setEditError("备注不能超过 200 字");
      return;
    }
    const rowErr = validateNewPlanRows(editRows);
    if (rowErr) {
      setEditError(rowErr);
      return;
    }

    const newTableCount = buildTablesPayload(editRows).length;
    const newPeopleCount = estimatedEditPeople;

    if (newTableCount < editBaselineTableCount) {
      if (!window.confirm("减少桌数将清理被删除桌次上的座位安排，是否继续？")) return;
    }
    if (newPeopleCount < editBaselinePeopleCount) {
      if (!window.confirm("减少人数将移除未保留的人员及其座位关联，是否继续？")) return;
    }

    const tablesPayload = buildTablesSavePayload(editRows, editTablesSnapshot);
    const peoplePayload = buildPeopleSyncPayload(editPeopleSnapshot, newPeopleCount);

    setEditSubmitting(true);
    try {
      await updatePlan({ id: editPlanId, name, note: editNote.trim() || null });
      await saveTables({ planId: editPlanId, tables: tablesPayload });
      await putPeople(editPlanId, peoplePayload, { replace: true });
      setShowEditPlan(false);
      setEditPlanId(null);
      await refreshPlans();
    } catch (e) {
      setEditError(errorMessage(e));
    } finally {
      setEditSubmitting(false);
    }
  };

  const openPublishConfirm = (p: Plan) => {
    if (!isDraftStatusRaw(p.statusRaw)) return;
    setError(null);
    setMoreMenuPlanId(null);
    setPublishTarget({ id: p.id, name: p.name });
  };

  const openPublishConfirmFromEdit = () => {
    if (!editPlanId || !isDraftStatusRaw(editStatusRaw)) return;
    setError(null);
    setPublishTarget({ id: editPlanId, name: editName.trim() || "（未命名方案）" });
  };

  const closePublishConfirm = () => {
    if (publishSubmitting) return;
    setPublishTarget(null);
  };

  const confirmPublish = async () => {
    if (!publishTarget) return;
    const planId = publishTarget.id;
    setPublishSubmitting(true);
    setError(null);
    try {
      await updatePlan({ id: planId, status: "published" });
      setPublishTarget(null);
      if (editPlanId === planId) setEditStatusRaw("published");
      await refreshPlans();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPublishSubmitting(false);
    }
  };

  const openDeleteConfirm = (p: Plan) => {
    setMoreMenuPlanId(null);
    setDeleteTarget(p);
  };

  const closeDeleteConfirm = () => {
    if (deleteSubmitting) return;
    setDeleteTarget(null);
  };

  const confirmDeletePlan = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setError(null);
    try {
      await deletePlan(deleteTarget.id);
      setDeleteTarget(null);
      await refreshPlans();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const exportPlanExcel = async (p: Plan) => {
    setMoreMenuPlanId(null);
    setError(null);
    setExportingPlanId(p.id);
    try {
      const detail = await getPlanDetail(p.id);
      const wb = XLSX.utils.book_new();

      const planRows = [planRowForExport(detail.plan)];
      const wsPlan = XLSX.utils.json_to_sheet(planRows);
      applyExportSheetColWidths(wsPlan, planRows);
      XLSX.utils.book_append_sheet(wb, wsPlan, "方案");

      const tableRows = detail.tables.map(tableRowForExport);
      const wsTables = XLSX.utils.json_to_sheet(tableRows);
      if (tableRows.length) applyExportSheetColWidths(wsTables, tableRows);
      XLSX.utils.book_append_sheet(wb, wsTables, "桌次");

      const peopleRows = detail.people.map(personRowForExport);
      const wsPeople = XLSX.utils.json_to_sheet(peopleRows);
      if (peopleRows.length) applyExportSheetColWidths(wsPeople, peopleRows);
      XLSX.utils.book_append_sheet(wb, wsPeople, "人员");

      const seatRows = detail.seats.map(seatRowForExport);
      const wsSeats = XLSX.utils.json_to_sheet(seatRows);
      if (seatRows.length) applyExportSheetColWidths(wsSeats, seatRows);
      XLSX.utils.book_append_sheet(wb, wsSeats, "座位");
      const filename = `${sanitizeExportFilenameBase(p.name)}_导出.xlsx`;
      XLSX.writeFile(wb, filename, { bookType: "xlsx" });
      setFeedbackMessage("方案已导出");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExportingPlanId(null);
    }
  };

  const closeCopyPlan = () => {
    if (copySubmitting) return;
    setShowCopyPlan(false);
    setCopyError(null);
    setCopyLoadingDetail(false);
    setCopyDetailReady(false);
  };

  const openCopyPlan = (p: Plan) => {
    setMoreMenuPlanId(null);
    setCopyError(null);
    setCopyName(`${p.name}（副本）`);
    setCopyNote("");
    setCopyRows(defaultNewPlanRows());
    setCopyStatus("draft");
    setCopySourcePeople([]);
    setCopyDetailReady(false);
    setShowCopyPlan(true);
    setCopyLoadingDetail(true);
    void (async () => {
      try {
        const detail = await getPlanDetail(p.id);
        setCopyName(`${detail.plan.name}（副本）`);
        setCopyNote(detail.plan.note ?? "");
        setCopyRows(tablesToCopyRows(detail.tables));
        setCopySourcePeople(detail.people);
        setCopyStatus("draft");
        setCopyDetailReady(true);
      } catch (e) {
        setCopyError(errorMessage(e));
        setCopyDetailReady(false);
      } finally {
        setCopyLoadingDetail(false);
      }
    })();
  };

  const submitCopyPlan = async () => {
    if (!copyDetailReady) {
      setCopyError("方案详情未加载完成，请稍后重试或关闭后重新打开。");
      return;
    }

    setCopyError(null);
    const name = copyName.trim();
    if (!name) {
      setCopyError("请填写方案名称");
      return;
    }
    if (copyNote.length > 200) {
      setCopyError("备注不能超过 200 字");
      return;
    }
    const rowErr = validateNewPlanRows(copyRows);
    if (rowErr) {
      setCopyError(rowErr);
      return;
    }
    const tablesPayload = buildTablesPayload(copyRows);
    const peoplePayload = buildPeopleForCopy(copySourcePeople, estimatedCopyPeople);

    setCopySubmitting(true);
    let newPlanId: string | null = null;
    try {
      const created = await createPlan({ name, note: copyNote.trim() || null });
      newPlanId = created.id;
      if (copyStatus !== "draft") {
        await updatePlan({ id: created.id, status: copyStatus });
      }
      await saveTables({ planId: created.id, tables: tablesPayload });
      await putPeople(created.id, peoplePayload, { replace: true });
      setShowCopyPlan(false);
      setCopyError(null);
      setCopyDetailReady(false);
      await refreshPlans();
    } catch (e) {
      if (newPlanId) {
        try {
          await deletePlan(newPlanId);
        } catch {
          /* 回滚失败则留给用户手动删除 */
        }
        setCopyError(
          `${errorMessage(e)} 已尝试自动删除半成品方案；若仍存在请手动删除。`,
        );
      } else {
        setCopyError(errorMessage(e));
      }
    } finally {
      setCopySubmitting(false);
    }
  };

  const openRoundManageModal = () => {
    setRoundManagePlanId(plans[0]?.id ?? "");
    setShowRoundManageModal(true);
  };

  const closeRoundManageModal = () => {
    setShowRoundManageModal(false);
  };

  const confirmRoundManageNavigate = () => {
    if (!roundManagePlanId) return;
    const name = plans.find((x) => x.id === roundManagePlanId)?.name ?? "";
    navigate("/round/overview", { state: { planId: roundManagePlanId, planName: name } });
    setShowRoundManageModal(false);
  };

  useEffect(() => {
    const st = location.state as { openRoundManage?: boolean } | null;
    if (!st?.openRoundManage) return;
    setShowRoundManageModal(true);
    navigate("/plans", { replace: true, state: null });
  }, [location.state, navigate]);

  useEffect(() => {
    const st = location.state as { openEditPlanId?: string } | null;
    if (!st?.openEditPlanId) return;
    if (plans.length === 0) return;
    const target = plans.find((p) => p.id === st.openEditPlanId);
    if (target) void openEditPlan(target);
    navigate("/plans", { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, plans, navigate]);

  useEffect(() => {
    if (!showRoundManageModal) return;
    if (roundManagePlanId || plans.length === 0) return;
    setRoundManagePlanId(plans[0]!.id);
  }, [showRoundManageModal, roundManagePlanId, plans]);

  const renderPlanMoreMenuItems = (p: Plan) => (
    <>
      <button
        type="button"
        className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
        role="menuitem"
        onClick={() => {
          setMoreMenuPlanId(null);
          void openEditPlan(p);
        }}
      >
        编辑方案
      </button>
      <button
        type="button"
        className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
        role="menuitem"
        disabled={!isDraftStatusRaw(p.statusRaw)}
        onClick={() => openPublishConfirm(p)}
      >
        发布方案
      </button>
      <button
        type="button"
        className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
        role="menuitem"
        disabled={exportingPlanId === p.id}
        onClick={() => void exportPlanExcel(p)}
      >
        {exportingPlanId === p.id ? "导出中…" : "导出 Excel"}
      </button>
      <button
        type="button"
        className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
        role="menuitem"
        onClick={() => openCopyPlan(p)}
      >
        复制方案
      </button>
      <button
        type="button"
        className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
        role="menuitem"
        onClick={() => openDeleteConfirm(p)}
      >
        删除方案
      </button>
    </>
  );

  const resetImportModalInner = () => {
    setImportFlowStep("file");
    setImportWorkPhase("creating");
    setImportParsed(null);
    setImportWarnings([]);
    setImportPreviewErrors([]);
    setImportRunError(null);
    setImportDragging(false);
    if (importFileInputRef.current) importFileInputRef.current.value = "";
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    resetImportModalInner();
  };

  const openImportModal = () => {
    resetImportModalInner();
    setShowImportModal(true);
  };

  const readImportFile = (file: File) => {
    void (async () => {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
        setImportPreviewErrors(["请选择 Excel 文件（.xlsx 或 .xls）。"]);
        setImportParsed(null);
        setImportWarnings([]);
        setImportFlowStep("preview");
        return;
      }
      try {
        const buf = await file.arrayBuffer();
        const result = parsePlanImportExcel(buf);
        if (!result.ok) {
          setImportPreviewErrors(result.errors);
          setImportParsed(null);
          setImportWarnings([]);
          setImportFlowStep("preview");
          return;
        }
        setImportParsed(result.data);
        setImportWarnings(result.warnings);
        setImportPreviewErrors([]);
        setImportFlowStep("preview");
      } catch {
        setImportPreviewErrors(["无法读取或解析该文件。"]);
        setImportParsed(null);
        setImportWarnings([]);
        setImportFlowStep("preview");
      }
    })();
  };

  const confirmPlanImport = async () => {
    if (!importParsed) return;
    setImportFlowStep("working");
    setImportRunError(null);
    setImportWorkPhase("creating");
    let planId: string | null = null;
    try {
      const created = await createPlan({ name: importParsed.planName, note: importParsed.planNote });
      planId = created.id;
      setImportWorkPhase("tables");
      const tablesPayload = tablesFromImportGroups(importParsed.tableGroups);
      await saveTables({ planId, tables: tablesPayload });
      setImportWorkPhase("people");
      const est = estimatedTotalFromImportGroups(importParsed.tableGroups);
      const peoplePayload = buildPeoplePayloadFromImport(importParsed.people, est);
      await putPeople(planId, peoplePayload, { replace: true });
      if (importParsed.planStatus && importParsed.planStatus !== "draft") {
        await updatePlan({ id: planId, status: importParsed.planStatus });
      }
      setImportFlowStep("success");
      await refreshPlans();
    } catch (e) {
      const errText = errorMessage(e);
      if (planId) {
        try {
          await deletePlan(planId);
        } catch {
          setImportRunError(
            `导入过程中发生错误：${errText}\n\n已尝试自动删除半成品方案失败，请手动删除已创建的方案。`,
          );
          setImportFlowStep("fail");
          return;
        }
        setImportRunError(
          `导入过程中发生错误：${errText}\n\n已自动删除已创建的半成品方案。`,
        );
      } else {
        setImportRunError(`导入过程中发生错误：${errText}`);
      }
      setImportFlowStep("fail");
    }
  };

  const totalLabel = loading ? "…" : `${plans.length} 个`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <section className={`${cardShell} p-6`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">方案管理</h1>
                <p className="mt-1 text-sm text-slate-600">创建、管理和维护各类排座方案</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={pageBtnPrimary} aria-label="新建方案" onClick={openNewPlan}>
                  <span className="text-base leading-none" aria-hidden>
                    +
                  </span>
                  新建方案
                </button>
                <button type="button" className={pageBtnBase} aria-label="导入方案" onClick={openImportModal}>
                  <span className="text-slate-500" aria-hidden>
                    ⭳
                  </span>
                  导入方案
                </button>
                <button
                  type="button"
                  className={pageBtnBase}
                  aria-label="下载模板"
                  onClick={() => {
                    downloadPlanImportTemplateFile();
                  }}
                >
                  <span className="text-slate-500" aria-hidden>
                    ⬇
                  </span>
                  下载模板
                </button>
                <button
                  type="button"
                  className={pageBtnBase}
                  aria-label="桌次管理"
                  onClick={openRoundManageModal}
                >
                  <span className="text-slate-500" aria-hidden>
                    ⊞
                  </span>
                  桌次管理
                </button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={`${cardShell} p-4`}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold bg-sky-100 text-sky-700">
                  总
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">总方案数</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{totalLabel}</div>
                  <div className="mt-1 text-xs text-slate-500">所有方案</div>
                </div>
              </div>
            </div>
            <div className={`${cardShell} p-4`}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold bg-emerald-100 text-emerald-700">
                  新
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">本月新增</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">—</div>
                  <div className="mt-1 text-xs text-slate-500">待接入活动统计</div>
                </div>
              </div>
            </div>
            <div className={`${cardShell} p-4`}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold bg-orange-100 text-orange-700">
                  !
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">待处理异常</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">—</div>
                  <div className="mt-1 text-xs text-slate-500">待产品定义</div>
                </div>
              </div>
            </div>
            <div className={`${cardShell} p-4`}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold bg-violet-100 text-violet-700">
                  出
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">导出记录</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">—</div>
                  <div className="mt-1 text-xs text-slate-500">待接入导出统计</div>
                </div>
              </div>
            </div>
          </section>

          <section className={`${cardShell} p-6`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-base font-semibold text-slate-900">方案列表</div>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
                <select
                  className="h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-sm text-slate-700 shadow-sm sm:w-40"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as PlanStatusFilter)}
                  aria-label="方案状态筛选"
                >
                  <option value="all">全部状态</option>
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="completed">已完成</option>
                  <option value="archived">已归档</option>
                </select>
                <input
                  className="h-10 w-full min-w-[220px] rounded-xl border border-slate-200/90 bg-white px-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400"
                  placeholder="搜索方案名称、备注"
                  aria-label="搜索方案"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                />
                <button
                  type="button"
                  className={[
                    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-slate-600 shadow-sm hover:bg-slate-50",
                    viewMode === "compact"
                      ? "border-slate-300 bg-slate-100"
                      : "border-slate-200/90 bg-white",
                  ].join(" ")}
                  aria-label="切换视图"
                  title={viewMode === "card" ? "切换为紧凑列表" : "切换为卡片视图"}
                  aria-pressed={viewMode === "compact"}
                  onClick={() => setViewMode((m) => (m === "card" ? "compact" : "card"))}
                >
                  ▦
                </button>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                {error}
              </div>
            ) : null}

            <div className="mt-6">
              {loading ? (
                <div className="text-sm text-slate-500">加载中…</div>
              ) : plans.length === 0 ? (
                <div className="text-sm text-slate-500">暂无方案，请点击「新建方案」。</div>
              ) : filteredPlans.length === 0 ? (
                <div className="text-sm text-slate-500">暂无匹配方案，请调整搜索或筛选条件。</div>
              ) : viewMode === "card" ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {filteredPlans.map((p) => (
                    <article key={p.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-slate-900">{p.name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={[
                              "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                              statusBadgeClass(p.status),
                            ].join(" ")}
                          >
                            {p.status}
                          </span>
                          <div className="relative" data-plan-more-root={p.id}>
                            <button
                              type="button"
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                              aria-label="更多"
                              title="更多"
                              aria-expanded={moreMenuPlanId === p.id}
                              aria-haspopup="menu"
                              onClick={() => setMoreMenuPlanId((cur) => (cur === p.id ? null : p.id))}
                            >
                              ···
                            </button>
                            {moreMenuPlanId === p.id ? (
                              <div
                                className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-xl border border-slate-200/90 bg-white py-1 text-sm shadow-[0_8px_24px_rgb(15_23_42_/_0.12)]"
                                role="menu"
                              >
                                {renderPlanMoreMenuItems(p)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                        <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2">
                          <div className="text-xs text-slate-500">桌数</div>
                          <div className="mt-1 font-semibold text-slate-900">{p.tableCount}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2">
                          <div className="text-xs text-slate-500">人数</div>
                          <div className="mt-1 font-semibold text-slate-900">{p.guestCount}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2">
                          <div className="text-xs text-slate-500">更新时间</div>
                          <div className="mt-1 text-xs font-semibold leading-snug text-slate-900">{p.updatedAt}</div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700">
                        <span className="text-xs text-slate-500">人数分布：</span>
                        <span className="font-medium text-slate-900">{formatDistribution(p.distribution)}</span>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-4">
                        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-xs font-semibold text-slate-700"
                            aria-hidden
                          >
                            {p.owner.slice(0, 1)}
                          </span>
                          <span className="truncate">{p.owner}</span>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                            onClick={() => void openEditPlan(p)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                            onClick={() => openDeleteConfirm(p)}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-50/40">
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200/80 bg-white/80 text-xs font-medium text-slate-500">
                        <th className="px-4 py-3">方案名称</th>
                        <th className="px-4 py-3">状态</th>
                        <th className="px-4 py-3">桌数</th>
                        <th className="px-4 py-3">人数</th>
                        <th className="px-4 py-3">更新时间</th>
                        <th className="px-4 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlans.map((p) => (
                        <tr key={p.id} className="border-b border-slate-200/60 last:border-b-0 bg-white/60">
                          <td className="max-w-[200px] truncate px-4 py-3 font-medium text-slate-900">{p.name}</td>
                          <td className="px-4 py-3">
                            <span
                              className={[
                                "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                statusBadgeClass(p.status),
                              ].join(" ")}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-800">{p.tableCount}</td>
                          <td className="px-4 py-3 text-slate-800">{p.guestCount}</td>
                          <td className="px-4 py-3 text-xs text-slate-800">{p.updatedAt}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                className="rounded-lg px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                                onClick={() => void openEditPlan(p)}
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                                onClick={() => openDeleteConfirm(p)}
                              >
                                删除
                              </button>
                              <div className="relative inline-block" data-plan-more-root={p.id}>
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                                  aria-label="更多"
                                  title="更多"
                                  aria-expanded={moreMenuPlanId === p.id}
                                  aria-haspopup="menu"
                                  onClick={() => setMoreMenuPlanId((cur) => (cur === p.id ? null : p.id))}
                                >
                                  ···
                                </button>
                                {moreMenuPlanId === p.id ? (
                                  <div
                                    className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-xl border border-slate-200/90 bg-white py-1 text-sm shadow-[0_8px_24px_rgb(15_23_42_/_0.12)]"
                                    role="menu"
                                  >
                                    {renderPlanMoreMenuItems(p)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="w-full shrink-0 xl:w-80">
          <div className={`${cardShell} p-6`}>
            <div className="text-base font-semibold text-slate-900">最新动态</div>
            <div className="mt-4 space-y-4">
              {latestPlanActivities.length === 0 ? (
                <div className="text-sm text-slate-500">暂无方案动态。</div>
              ) : (
                latestPlanActivities.map((a) => (
                  <div key={a.id} className="flex gap-3">
                    <div
                      className={[
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-semibold",
                        a.tone,
                      ].join(" ")}
                    >
                      •
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{a.title}</div>
                      <div className="mt-0.5 truncate text-sm text-slate-600">{a.target}</div>
                      <div className="mt-1 text-xs text-slate-400">{a.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              className="mt-5 w-full rounded-xl border border-slate-200/90 bg-white py-2 text-sm font-medium text-orange-600 shadow-sm hover:bg-orange-50"
            >
              查看全部动态 &gt;
            </button>
          </div>
        </aside>
      </div>

      <footer className="rounded-2xl border border-sky-200/70 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg border border-sky-200 bg-white text-xs font-semibold text-sky-700">
          i
        </span>
        提示：方案数据保存在本地，建议定期导出备份，确保数据安全。
      </footer>

      {showNewPlan
        ? createPortal(
            <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeNewPlan();
          }}
        >
          <div
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-plan-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 id="new-plan-title" className="text-lg font-semibold text-slate-900">
                新建方案
              </h2>
              <p className="mt-1 text-sm text-slate-600">创建一个新的排座方案</p>
            </div>

            <div className="p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1 space-y-5">
                  <div>
                    <label className={modalLabel} htmlFor="new-plan-name">
                      方案名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="new-plan-name"
                      className={modalField}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="请输入方案名称"
                      maxLength={120}
                    />
                  </div>

                  <PlanTableConfigEditor
                    rows={newRows}
                    setRows={setNewRows}
                    estimatedTotal={estimatedPeople}
                  />

                  <div>
                    <label className={modalLabel} htmlFor="new-plan-note">
                      备注
                    </label>
                    <textarea
                      id="new-plan-note"
                      className="min-h-[88px] w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="客户、会务等补充说明"
                      maxLength={200}
                    />
                    <div className="mt-1 text-right text-xs text-slate-400">{newNote.length}/200</div>
                  </div>

                  <div>
                    <div className={modalLabel}>初始状态</div>
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                      草稿 draft（新建方案默认为草稿）
                    </div>
                  </div>
                </div>

                <div className="w-full shrink-0 rounded-2xl border border-sky-200/80 bg-sky-50/80 px-5 py-4 lg:w-48">
                  <div className="text-xs font-medium text-sky-800/90">预计总人数</div>
                  <div className="mt-2 text-lg font-semibold tracking-tight text-sky-900">
                    预计总人数：{estimatedPeople} 人
                  </div>
                </div>
              </div>

              {newPlanError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                  {newPlanError}
                </div>
              ) : null}

              <div className="mt-6 flex justify-end gap-3 border-t border-slate-200/80 pt-4">
                <button type="button" className={pageBtnBase} onClick={closeNewPlan} disabled={newPlanSubmitting}>
                  取消
                </button>
                <button
                  type="button"
                  className={pageBtnPrimary}
                  onClick={() => void submitNewPlan()}
                  disabled={newPlanSubmitting}
                >
                  {newPlanSubmitting ? "创建中…" : "创建方案"}
                </button>
              </div>
            </div>
          </div>
        </div>,
            document.body,
          )
        : null}

      {showCopyPlan ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCopyPlan();
          }}
        >
          <div
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="copy-plan-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-6 py-4">
              <div className="min-w-0">
                <h2 id="copy-plan-title" className="text-lg font-semibold text-slate-900">
                  复制方案
                </h2>
                <p className="mt-1 text-sm text-slate-600">基于当前方案创建一个可编辑的新方案</p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-lg leading-none text-slate-500 shadow-sm hover:bg-slate-50"
                aria-label="关闭"
                onClick={closeCopyPlan}
                disabled={copySubmitting}
              >
                ×
              </button>
            </div>

            <div className="p-6">
              {copyLoadingDetail ? (
                <div className="py-12 text-center text-sm text-slate-600">加载方案详情…</div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label className={modalLabel} htmlFor="copy-plan-name">
                      方案名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="copy-plan-name"
                      className={modalField}
                      value={copyName}
                      onChange={(e) => setCopyName(e.target.value)}
                      placeholder="请输入方案名称"
                      maxLength={120}
                    />
                  </div>

                  <PlanTableConfigEditor
                    rows={copyRows}
                    setRows={setCopyRows}
                    estimatedTotal={estimatedCopyPeople}
                    embedSummaryCard="topRight"
                  />

                  <div>
                    <label className={modalLabel} htmlFor="copy-plan-note">
                      备注
                    </label>
                    <textarea
                      id="copy-plan-note"
                      className="min-h-[88px] w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400"
                      value={copyNote}
                      onChange={(e) => setCopyNote(e.target.value)}
                      placeholder="可填写客户、会议、场景说明"
                      maxLength={200}
                    />
                    <div className="mt-1 text-right text-xs text-slate-400">{copyNote.length}/200</div>
                  </div>

                  <div>
                    <label className={modalLabel} htmlFor="copy-plan-status">
                      初始状态
                    </label>
                    <select
                      id="copy-plan-status"
                      className={modalField}
                      value={copyStatus}
                      onChange={(e) =>
                        setCopyStatus(e.target.value as "draft" | "published" | "completed" | "archived")
                      }
                      aria-label="初始状态"
                    >
                      <option value="draft">草稿 draft（新建方案默认草稿）</option>
                      <option value="published">已发布 published</option>
                      <option value="completed">已完成 completed</option>
                      <option value="archived">已归档 archived</option>
                    </select>
                  </div>
                </div>
              )}

              {copyError ? (
                <div
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                >
                  {copyError}
                </div>
              ) : null}

              <div className="mt-6 flex justify-end gap-3 border-t border-slate-200/80 pt-4">
                <button type="button" className={pageBtnBase} onClick={closeCopyPlan} disabled={copySubmitting}>
                  取消
                </button>
                <button
                  type="button"
                  className={pageBtnPrimary}
                  onClick={() => void submitCopyPlan()}
                  disabled={copySubmitting || copyLoadingDetail || !copyDetailReady}
                >
                  {copySubmitting ? "复制中…" : "确认复制"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showEditPlan ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditPlan();
          }}
        >
          <div
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-plan-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 id="edit-plan-title" className="text-lg font-semibold text-slate-900">
                编辑方案
              </h2>
              <p className="mt-1 text-sm text-slate-600">修改方案名称、桌次人数配置与备注</p>
            </div>

            <div className="p-6">
              {editLoadingDetail ? (
                <div className="py-12 text-center text-sm text-slate-600">加载方案详情…</div>
              ) : (
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1 space-y-5">
                    <div>
                      <label className={modalLabel} htmlFor="edit-plan-name">
                        方案名称 <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="edit-plan-name"
                        className={modalField}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="请输入方案名称"
                        maxLength={120}
                      />
                    </div>

                    <PlanTableConfigEditor
                      rows={editRows}
                      setRows={setEditRows}
                      estimatedTotal={estimatedEditPeople}
                    />

                    <div>
                      <label className={modalLabel} htmlFor="edit-plan-note">
                        备注
                      </label>
                      <textarea
                        id="edit-plan-note"
                        className="min-h-[88px] w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="客户、会务等补充说明"
                        maxLength={200}
                      />
                      <div className="mt-1 text-right text-xs text-slate-400">{editNote.length}/200</div>
                    </div>

                    <div>
                      <div className={modalLabel}>当前状态</div>
                      <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                        {formatPlanStatusLine(editStatusRaw)}
                      </div>
                    </div>

                    {isDraftStatusRaw(editStatusRaw) ? (
                      <div>
                        <div className={modalLabel}>发布</div>
                        <button
                          type="button"
                          className={pageBtnPrimary}
                          onClick={openPublishConfirmFromEdit}
                          disabled={editSubmitting}
                        >
                          发布方案
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="w-full shrink-0 rounded-2xl border border-sky-200/80 bg-sky-50/80 px-5 py-4 lg:w-48">
                    <div className="text-xs font-medium text-sky-800/90">预计总人数</div>
                    <div className="mt-2 text-lg font-semibold tracking-tight text-sky-900">
                      预计总人数：{estimatedEditPeople} 人
                    </div>
                  </div>
                </div>
              )}

              {editError ? (
                <div
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                >
                  {editError}
                </div>
              ) : null}

              <div className="mt-6 flex justify-end gap-3 border-t border-slate-200/80 pt-4">
                <button type="button" className={pageBtnBase} onClick={closeEditPlan} disabled={editSubmitting}>
                  取消
                </button>
                <button
                  type="button"
                  className={pageBtnPrimary}
                  onClick={() => void submitEditPlan()}
                  disabled={editSubmitting || editLoadingDetail}
                >
                  {editSubmitting ? "保存中…" : "保存修改"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showImportModal ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && importFlowStep !== "working") closeImportModal();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-plan-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 id="import-plan-title" className="text-lg font-semibold text-slate-900">
                导入方案
              </h2>
            </div>
            <div className="p-6">
              {importFlowStep === "file" ? (
                <>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="sr-only"
                    aria-hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) readImportFile(f);
                    }}
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    className={[
                      "cursor-pointer rounded-xl border-2 border-dashed px-4 py-10 text-center text-sm transition",
                      importDragging
                        ? "border-orange-400 bg-orange-50/80 text-slate-800"
                        : "border-slate-200 bg-slate-50/50 text-slate-600",
                    ].join(" ")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        importFileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setImportDragging(true);
                    }}
                    onDragLeave={() => setImportDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setImportDragging(false);
                      const f = e.dataTransfer.files[0];
                      if (f) readImportFile(f);
                    }}
                    onClick={() => importFileInputRef.current?.click()}
                  >
                    拖拽 Excel 文件（.xlsx / .xls）到这里，或点击选择文件
                  </div>
                  <button
                    type="button"
                    className="mt-4 text-sm font-medium text-orange-600 hover:text-orange-700"
                    onClick={() => {
                      downloadPlanImportTemplateFile();
                    }}
                  >
                    下载导入模板
                  </button>
                </>
              ) : null}

              {importFlowStep === "preview" ? (
                <>
                  {importParsed ? (
                    <dl className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-slate-500">方案名称</dt>
                        <dd className="font-medium text-slate-900">{importParsed.planName}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-slate-500">备注</dt>
                        <dd className="text-slate-800">{importParsed.planNote ?? "—"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-slate-500">状态</dt>
                        <dd className="text-slate-800">
                          {importParsed.planStatus
                            ? formatPlanStatusLine(importParsed.planStatus)
                            : "draft（草稿）（默认）"}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-slate-500">桌数</dt>
                        <dd className="text-slate-800">
                          {importParsed.tableGroups.reduce((s, g) => s + g.tableCount, 0)}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-slate-500">预计人数</dt>
                        <dd className="text-slate-800">
                          {estimatedTotalFromImportGroups(importParsed.tableGroups)}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-slate-500">人员列表</dt>
                        <dd className="text-slate-800">
                          {importParsed.people.length > 0
                            ? `${importParsed.people.length} 人（使用模板名单）`
                            : `${estimatedTotalFromImportGroups(importParsed.tableGroups)} 人（将自动生成占位）`}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  {importWarnings.length ? (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <div className="font-medium">提示</div>
                      <ul className="mt-1 list-inside list-disc">
                        {importWarnings.map((w, i) => (
                          <li key={`${i}-${w}`}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {importPreviewErrors.length ? (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      <div className="font-medium">校验结果</div>
                      <ul className="mt-1 list-inside list-disc">
                        {importPreviewErrors.map((err, i) => (
                          <li key={`${i}-${err}`}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button type="button" className={pageBtnBase} onClick={closeImportModal}>
                      取消
                    </button>
                    <button type="button" className={pageBtnBase} onClick={() => setImportFlowStep("file")}>
                      重新选择文件
                    </button>
                    {importParsed ? (
                      <button type="button" className={pageBtnPrimary} onClick={() => void confirmPlanImport()}>
                        确认导入
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}

              {importFlowStep === "working" ? (
                <div className="space-y-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">正在导入…</div>
                  <ul className="space-y-2">
                    <li className={importWorkPhase === "creating" ? "font-semibold text-orange-700" : ""}>
                      创建方案中
                    </li>
                    <li className={importWorkPhase === "tables" ? "font-semibold text-orange-700" : ""}>
                      写入桌次中
                    </li>
                    <li className={importWorkPhase === "people" ? "font-semibold text-orange-700" : ""}>
                      写入人员中
                    </li>
                  </ul>
                </div>
              ) : null}

              {importFlowStep === "success" ? (
                <div className="text-center">
                  <div className="text-base font-semibold text-emerald-800">导入完成</div>
                  <button type="button" className={`${pageBtnPrimary} mt-6`} onClick={closeImportModal}>
                    关闭
                  </button>
                </div>
              ) : null}

              {importFlowStep === "fail" ? (
                <div>
                  <div className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {importRunError}
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button type="button" className={pageBtnBase} onClick={closeImportModal}>
                      关闭
                    </button>
                    <button
                      type="button"
                      className={pageBtnPrimary}
                      onClick={() => {
                        setImportRunError(null);
                        resetImportModalInner();
                      }}
                    >
                      重新导入
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {importFlowStep === "file" ? (
              <div className="flex justify-end gap-3 border-t border-slate-200/80 px-6 py-4">
                <button type="button" className={pageBtnBase} onClick={closeImportModal}>
                  取消
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {publishTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePublishConfirm();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-plan-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 id="publish-plan-title" className="text-lg font-semibold text-slate-900">
                发布方案
              </h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-slate-700">
                确认发布「{publishTarget.name}」吗？发布后状态将变为「已发布」。
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200/80 px-6 py-4">
              <button type="button" className={pageBtnBase} onClick={closePublishConfirm} disabled={publishSubmitting}>
                取消
              </button>
              <button
                type="button"
                className={pageBtnPrimary}
                onClick={() => void confirmPublish()}
                disabled={publishSubmitting}
              >
                {publishSubmitting ? "发布中…" : "确认发布"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteConfirm();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-plan-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 id="delete-plan-title" className="text-lg font-semibold text-slate-900">
                删除方案
              </h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-slate-700">
                确认删除「{deleteTarget.name}」吗？删除后，该方案下的桌次、人员、座位数据可能一并删除，无法恢复。
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200/80 px-6 py-4">
              <button type="button" className={pageBtnBase} onClick={closeDeleteConfirm} disabled={deleteSubmitting}>
                取消
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
                onClick={() => void confirmDeletePlan()}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRoundManageModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeRoundManageModal();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgb(15_23_42_/_0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="round-manage-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 id="round-manage-title" className="text-lg font-semibold text-slate-900">
                进入桌次管理
              </h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-slate-700">
                将打开<strong className="font-semibold text-slate-900"> 圆桌排座总览 </strong>
                ，基于所选方案的桌次与人员在本地总览中编排座位（需本地后端已启动）。
              </p>
              {plans.length > 0 ? (
                <label className="mt-4 block text-sm text-slate-600">
                  <span className="mb-1 block text-xs font-medium text-slate-500">选择方案</span>
                  <select
                    className="h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-sm text-slate-800 shadow-sm"
                    value={roundManagePlanId}
                    onChange={(e) => setRoundManagePlanId(e.target.value)}
                    aria-label="选择方案"
                  >
                    {plans.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="mt-3 text-sm text-slate-500">暂无方案，请先新建方案。</p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200/80 px-6 py-4">
              <button type="button" className={pageBtnBase} onClick={closeRoundManageModal}>
                取消
              </button>
              <button
                type="button"
                className={pageBtnPrimary}
                onClick={confirmRoundManageNavigate}
                disabled={plans.length === 0 || !roundManagePlanId}
              >
                进入管理
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {feedbackMessage ? (
        <div
          className="pointer-events-none fixed bottom-8 left-1/2 z-[70] -translate-x-1/2 rounded-xl border border-slate-200/90 bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
          role="status"
        >
          {feedbackMessage}
        </div>
      ) : null}
    </div>
  );
}
