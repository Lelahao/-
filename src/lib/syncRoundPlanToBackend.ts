import { putPeople } from "@/api/people";
import { roundPlanToLayout } from "@/lib/layoutBridge";
import { saveSeats, saveTables } from "@/lib/dbApi";
import type { RoundPlanSnapshot } from "@/lib/roundSeatEngine";

/** 将当前圆桌总览快照写入指定后端方案（桌次、人员、座位），供创建版本前与 DB 对齐。 */
export async function pushRoundPlanToBackend(planId: string, plan: RoundPlanSnapshot): Promise<void> {
  await saveTables({
    planId,
    tables: plan.tables.map((t) => ({
      id: t.id,
      tableNo: t.no,
      hallName: t.hallName ?? "",
      capacity: t.capacity,
      kind: "round",
    })),
  });

  const layout = roundPlanToLayout(plan);
  await putPeople(
    planId,
    layout.people.map((p) => ({
      id: p.id,
      displayName: p.name,
      assignedTableId: p.assignedTableId,
      assignedSeatNo: p.assignedSeatNo,
      metaJson: null,
    })),
    { replace: true },
  );

  await saveSeats({
    planId,
    seats: plan.seats.map((s) => ({
      tableId: s.tableId,
      seatNo: s.seatNo,
      personId: s.personId ?? null,
      locked: s.locked,
    })),
  });
}
