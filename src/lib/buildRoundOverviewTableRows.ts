import type { RoundPlanSnapshot } from "@/lib/roundSeatEngine";

export function buildRoundOverviewTableRows(plan: RoundPlanSnapshot) {
  return plan.tables.map((t) => {
    const occ = plan.seats.filter((s) => s.tableId === t.id && s.personId && s.seatNo <= t.capacity).length;
    const seatOccupied = Array.from({ length: t.capacity }, (_, i) => {
      const sn = i + 1;
      return Boolean(plan.seats.find((s) => s.tableId === t.id && s.seatNo === sn && s.personId));
    });
    const seatNames = Array.from({ length: t.capacity }, (_, i) => {
      const sn = i + 1;
      const seat = plan.seats.find((s) => s.tableId === t.id && s.seatNo === sn && s.personId);
      if (!seat?.personId) return null;
      return plan.people.find((p) => p.id === seat.personId)?.name ?? null;
    });
    return {
      id: t.id,
      no: t.no,
      hallName: t.hallName ?? "",
      capacity: t.capacity,
      current: occ,
      isMainTable: t.isMainTable,
      seatOccupied,
      seatNames,
    };
  });
}
