import { loadLayoutSnapshot } from "@/fullscreen/roundStorage";
import type { LayoutSnapshot, PersonRecord, TableDefinition } from "@/fullscreen/types";
import type { RoundPlanSnapshot } from "@/lib/roundSeatEngine";

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
    isMainTable: t.no === 4,
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
