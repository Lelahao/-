import type { LayoutSnapshot } from "@/fullscreen/types";

function pick<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

type ApiPerson = {
  id: string;
  displayName?: string;
  display_name?: string;
  assignedTableId?: string | null;
  assigned_table_id?: string | null;
  assignedSeatNo?: number | null;
  assigned_seat_no?: number | null;
};

type ApiTable = {
  id: string;
  tableNo?: number;
  table_no?: number;
  hallName?: string | null;
  hall_name?: string | null;
  capacity: number;
};

/** 将阶段 12.1 写入的 snapshot_json 解析为总览/导出用 LayoutSnapshot。 */
export function snapshotToLayoutSnapshot(snapshot: unknown): LayoutSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    return { people: [], tables: [] };
  }
  const s = snapshot as {
    layout?: LayoutSnapshot;
    people?: ApiPerson[];
    tables?: ApiTable[];
  };

  if (s.layout?.tables?.length) {
    return {
      people: s.layout.people ?? [],
      tables: s.layout.tables,
    };
  }

  const tables = (s.tables ?? [])
    .map((t) => ({
      id: t.id,
      no: pick(t.tableNo, t.table_no) ?? 0,
      hallName: pick(t.hallName, t.hall_name) ?? "",
      capacity: t.capacity,
      isMainTable: false as boolean | undefined,
    }))
    .sort((a, b) => a.no - b.no);

  const people = (s.people ?? []).map((p) => ({
    id: p.id,
    name: pick(p.displayName, p.display_name) ?? "",
    assignedTableId: pick(p.assignedTableId, p.assigned_table_id) ?? null,
    assignedSeatNo: pick(p.assignedSeatNo, p.assigned_seat_no) ?? null,
  }));

  return { people, tables };
}
