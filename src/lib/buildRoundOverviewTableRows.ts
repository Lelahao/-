import type { RoundPlanSnapshot } from "@/lib/roundSeatEngine";
import { isReservedPlaceholderPersonName } from "@/fullscreen/normalizeLayoutSnapshot";

export function buildRoundOverviewTableRows(plan: RoundPlanSnapshot) {
  return plan.tables.map((t) => {
    const seatNames = Array.from({ length: t.capacity }, (_, i) => {
      const sn = i + 1;
      const seat = plan.seats.find((s) => s.tableId === t.id && s.seatNo === sn && s.personId);
      if (!seat?.personId) return null;
      const nm = plan.people.find((p) => p.id === seat.personId)?.name ?? null;
      if (nm != null && isReservedPlaceholderPersonName(nm)) return null;
      return nm;
    });
    const seatOccupied = Array.from({ length: t.capacity }, (_, i) => Boolean(seatNames[i]));
    const occ = seatOccupied.filter(Boolean).length;
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
