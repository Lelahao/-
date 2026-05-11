import type { LayoutSnapshot } from "@/fullscreen/types";

/** 与 Excel 表头等价的占位名：不应占座、不应作为未安排 chip 展示 */
const PLACEHOLDER_PERSON_NAMES = new Set(["姓名"]);

export function isReservedPlaceholderPersonName(name: string): boolean {
  return PLACEHOLDER_PERSON_NAMES.has(name.trim());
}

/**
 * 将占位姓名视为未入座（保留人员记录，避免无通知删 id）。
 */
export function normalizeLayoutSnapshot(snapshot: LayoutSnapshot): LayoutSnapshot {
  return {
    ...snapshot,
    people: snapshot.people.map((p) =>
      isReservedPlaceholderPersonName(p.name)
        ? { ...p, assignedTableId: null, assignedSeatNo: null }
        : p,
    ),
  };
}
