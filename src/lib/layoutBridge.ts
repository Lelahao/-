import { loadLayoutSnapshot } from "@/fullscreen/roundStorage";
import type { LayoutSnapshot, PersonRecord, TableDefinition } from "@/fullscreen/types";
import type { PlanDetail } from "@/lib/dbTypes";
import type { RoundPlanSnapshot } from "@/lib/roundSeatEngine";

/** 将方案详情（后端 `GET /api/plans/{id}`）转为圆桌总览用的布局快照。 */
export function planDetailToLayoutSnapshot(detail: PlanDetail): LayoutSnapshot {
  const tables: TableDefinition[] = [...detail.tables]
    .sort((a, b) => a.tableNo - b.tableNo)
    .map((t) => ({
      id: t.id,
      no: t.tableNo,
      hallName: t.hallName ?? "",
      capacity: t.capacity,
      isMainTable: false,
    }));

  const seatAssignmentByPerson = new Map<string, { tableId: string; seatNo: number }>();
  for (const s of detail.seats) {
    if (s.personId) {
      seatAssignmentByPerson.set(s.personId, { tableId: s.tableId, seatNo: s.seatNo });
    }
  }

  const people: PersonRecord[] = detail.people.map((p) => {
    let assignedTableId = p.assignedTableId;
    let assignedSeatNo = p.assignedSeatNo;
    if ((assignedTableId == null || assignedSeatNo == null) && seatAssignmentByPerson.has(p.id)) {
      const x = seatAssignmentByPerson.get(p.id)!;
      assignedTableId = x.tableId;
      assignedSeatNo = x.seatNo;
    }
    return {
      id: p.id,
      name: p.displayName,
      assignedTableId,
      assignedSeatNo,
    };
  });

  return { people, tables };
}

export async function resolveLayoutForExport(getPlan: () => RoundPlanSnapshot): Promise<LayoutSnapshot> {
  const saved = await loadLayoutSnapshot();
  const plan = getPlan();
  if (plan.planId === "demo-overview" && saved?.people?.length) return saved;
  return roundPlanToLayout(plan);
}

export function layoutToRoundPlan(layout: LayoutSnapshot, planId = "from-layout"): RoundPlanSnapshot {
  const tables = layout.tables.map((t) => ({
    id: t.id,
    no: t.no,
    hallName: t.hallName,
    capacity: t.capacity,
    isMainTable: t.isMainTable ?? t.no === 4,
    entrance: "北侧" as const,
  }));

  const seats = [];
  for (const t of layout.tables) {
    for (let sn = 1; sn <= t.capacity; sn++) {
      const p = layout.people.find((x) => x.assignedTableId === t.id && x.assignedSeatNo === sn);
      seats.push({
        tableId: t.id,
        seatNo: sn,
        personId: p?.id ?? null,
        locked: false,
        fixed: false,
      });
    }
  }

  const people = layout.people.map((p) => ({
    id: p.id,
    name: p.name,
    fixedTableId: null as string | null,
    fixedSeatNo: null as number | null,
  }));

  return { planId, tables, seats, people };
}

export function roundPlanToLayout(plan: RoundPlanSnapshot): LayoutSnapshot {
  const tables: TableDefinition[] = plan.tables.map((t) => ({
    id: t.id,
    no: t.no,
    hallName: t.hallName ?? "",
    capacity: t.capacity,
    isMainTable: t.isMainTable,
  }));

  const people: PersonRecord[] = plan.people.map((p) => {
    const seat = plan.seats.find((s) => s.personId === p.id);
    return {
      id: p.id,
      name: p.name,
      assignedTableId: seat?.tableId ?? null,
      assignedSeatNo: seat?.seatNo ?? null,
    };
  });

  return { people, tables };
}
